/**
 * Authorization regression suite.
 *
 * Every case here is a hole that was ONCE OPEN against the live database and
 * was closed by a migration. They were all found by hand-probing — nine
 * migrations of authorization work with nothing stopping the next refactor from
 * quietly reopening one. That is what this file is for.
 *
 *   npm run test:authz
 *
 * It runs against the real project, because that is the only place the policies
 * and grants actually exist; a mocked client would test nothing. It creates
 * throwaway members, probes as them, and deletes them afterwards. It never
 * touches an existing row except to read it, and every cleanup is by explicit
 * id — a cleanup written as a filter is what once deleted six real rows.
 *
 * A failure here means someone can do something to another member that they
 * should not be able to do. Treat it as such.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!URL_ || !SECRET || !PUB) {
  throw new Error('Missing Supabase env. Run via `npm run test:authz`, which loads .env.local.');
}

const ADMIN = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };
type Headers_ = Record<string, string>;

const rest = (path: string, init: RequestInit & { headers: Headers_ }) =>
  fetch(`${URL_}/rest/v1/${path}`, init);

const read = async <T = unknown>(path: string, headers: Headers_ = ADMIN): Promise<T[]> =>
  (await (await rest(path, { headers })).json()) as T[];

const rpc = async (headers: Headers_, fn: string, body: unknown) => {
  const r = await rest(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.text() };
};

/** A brand new member with a real session. Deleted in `after`. */
async function makeMember(tag: string) {
  const email = `zz-authz-${tag}-${Date.now()}${Math.floor(Math.random() * 999)}@example.invalid`;
  const user = await (await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: ADMIN,
    body: JSON.stringify({ email, password: `Probe!${Date.now()}`, email_confirm: true }),
  })).json() as { id: string };

  // handle_new_user() creates the profile from a trigger, so wait for it.
  let profile: { id: string } | undefined;
  for (let i = 0; i < 20 && !profile; i++) {
    await new Promise((r) => setTimeout(r, 150));
    profile = (await read<{ id: string }>(`profiles?select=id&user_id=eq.${user.id}`))[0];
  }
  assert.ok(profile, `profile was never created for ${email}`);

  const link = await (await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: ADMIN, body: JSON.stringify({ type: 'magiclink', email }),
  })).json() as { email_otp: string };
  const session = await (await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token: link.email_otp, type: 'email' }),
  })).json() as { access_token: string };

  return {
    userId: user.id,
    id: profile.id,
    headers: { apikey: PUB, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } as Headers_,
  };
}

type Member = Awaited<ReturnType<typeof makeMember>>;

let alice: Member;      // an ordinary member
let bob: Member;        // another ordinary member, the victim
let curator: Member;    // promoted in SQL, the only way curator can be granted
let aliceListing: string;
let bobListing: string;

const cleanupListings: string[] = [];

before(async () => {
  alice = await makeMember('alice');
  bob = await makeMember('bob');
  curator = await makeMember('curator');

  // There is deliberately no API path to is_curator — 00005 removed it — so the
  // suite grants it the same way a human would, with the service key.
  await rest(`profiles?id=eq.${curator.id}`, {
    method: 'PATCH', headers: ADMIN, body: JSON.stringify({ is_curator: true }),
  });

  const mk = async (owner: string, title: string) => {
    const row = (await (await rest('market_listings', {
      method: 'POST', headers: { ...ADMIN, Prefer: 'return=representation' },
      body: JSON.stringify({ creator_profile_id: owner, type: 'wanted', title: { en: title }, description: { en: 't' }, status: 'open' }),
    })).json())[0] as { id: string };
    cleanupListings.push(row.id);
    return row.id;
  };
  aliceListing = await mk(alice.id, 'ZZZ authz alice');
  bobListing = await mk(bob.id, 'ZZZ authz bob');
});

after(async () => {
  // Explicit ids only. A cleanup written as a filter once matched every row in
  // the table because a malformed PostgREST predicate was silently ignored.
  for (const listing of cleanupListings) {
    for (const table of ['matches', 'market_interests']) {
      for (const row of await read<{ id: string }>(`${table}?select=id&listing_id=eq.${listing}`)) {
        await rest(`${table}?id=eq.${row.id}`, { method: 'DELETE', headers: ADMIN });
      }
    }
    await rest(`market_listings?id=eq.${listing}`, { method: 'DELETE', headers: ADMIN });
  }
  for (const m of [alice, bob, curator]) {
    if (m?.userId) await fetch(`${URL_}/auth/v1/admin/users/${m.userId}`, { method: 'DELETE', headers: ADMIN });
  }
});

// ---------------------------------------------------------------------------

describe('anonymous access (00005)', () => {
  const anon = { apikey: PUB, 'Content-Type': 'application/json' } as Headers_;

  for (const table of ['profiles', 'profile_hidden_worlds', 'market_listings', 'market_interests', 'matches', 'notifications']) {
    it(`cannot read ${table} without signing in`, async () => {
      const rows = await read(`${table}?select=id`, anon);
      // PostgREST answers either an error object or an empty array; neither may
      // contain data. Before 00005 this returned 26 profiles and 35 hidden worlds.
      assert.ok(!Array.isArray(rows) || rows.length === 0, `${table} leaked ${JSON.stringify(rows).slice(0, 80)}`);
    });
  }
});

describe('a member cannot change their own standing (00005)', () => {
  it('cannot promote themselves to curator', async () => {
    await rest(`profiles?id=eq.${alice.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ is_curator: true }),
    });
    const [row] = await read<{ is_curator: boolean }>(`profiles?select=is_curator&id=eq.${alice.id}`);
    assert.equal(row.is_curator, false, 'a member promoted themselves to curator');
  });

  it('cannot feature or deactivate themselves', async () => {
    await rest(`profiles?id=eq.${alice.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ is_featured: true, is_active: false }),
    });
    const [row] = await read<{ is_featured: boolean; is_active: boolean }>(`profiles?select=is_featured,is_active&id=eq.${alice.id}`);
    assert.equal(row.is_featured, false);
    assert.equal(row.is_active, true);
  });

  it('cannot write another member\'s profile', async () => {
    const [before_] = await read<{ full_name: string }>(`profiles?select=full_name&id=eq.${bob.id}`);
    await rest(`profiles?id=eq.${bob.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ full_name: 'REWRITTEN' }),
    });
    const [after_] = await read<{ full_name: string }>(`profiles?select=full_name&id=eq.${bob.id}`);
    assert.equal(after_.full_name, before_.full_name);
  });
});

describe('a curator moderates standing, not self-description (00007)', () => {
  it('cannot rewrite another member\'s headline', async () => {
    const [before_] = await read<{ headline: unknown }>(`profiles?select=headline&id=eq.${bob.id}`);
    await rest(`profiles?id=eq.${bob.id}`, {
      method: 'PATCH', headers: curator.headers, body: JSON.stringify({ headline: { en: 'PUT WORDS IN THEIR MOUTH' } }),
    });
    const [after_] = await read<{ headline: unknown }>(`profiles?select=headline&id=eq.${bob.id}`);
    assert.deepEqual(after_.headline, before_.headline, 'a curator rewrote a member\'s headline');
  });

  it('CAN change standing, through the function', async () => {
    const r = await rpc(curator.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: true, p_is_active: null, p_class_name: null,
    });
    assert.ok(r.status < 300, `curator_update_member failed: ${r.status} ${r.body}`);
    const [row] = await read<{ is_featured: boolean }>(`profiles?select=is_featured&id=eq.${bob.id}`);
    assert.equal(row.is_featured, true);
    await rpc(curator.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: false, p_is_active: null, p_class_name: null,
    });
  });

  it('a plain member cannot use the curator function', async () => {
    const r = await rpc(alice.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: true, p_is_active: null, p_class_name: null,
    });
    assert.equal(r.status, 403);
  });
});

describe('hidden worlds are written only by save_profile (00007)', () => {
  it('a member cannot insert one directly', async () => {
    const r = await rest('profile_hidden_worlds', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ profile_id: alice.id, name: { en: 'direct' }, category: 'craft', visibility: 'members' }),
    });
    assert.ok(r.status >= 400, `direct insert allowed: ${r.status}`);
  });

  it('save_profile cannot be used to write protected columns', async () => {
    const [before_] = await read<{ is_curator: boolean }>(`profiles?select=is_curator&id=eq.${alice.id}`);
    // The function takes no is_curator parameter at all; passing one is ignored
    // by PostgREST rather than applied. Assert the row is untouched regardless.
    await rpc(alice.headers, 'save_profile', {
      p_full_name: 'Alice', p_native_name: null, p_class_name: 'Class 26', p_initials: 'AL',
      p_headline: {}, p_role: {}, p_intro: {}, p_professional: {},
      p_contact_kind: 'email', p_contact_value: 'a@example.invalid',
      p_ask_topics: [], p_want_topics: [], p_hidden_worlds: [],
      p_known_world_ids: [], p_expected_updated_at: null,
    });
    const [after_] = await read<{ is_curator: boolean }>(`profiles?select=is_curator&id=eq.${alice.id}`);
    assert.equal(after_.is_curator, before_.is_curator);
  });
});

describe('market rows are written only by their functions (00006, 00009)', () => {
  it('a member cannot insert an interest directly', async () => {
    const r = await rest('market_interests', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ listing_id: bobListing, profile_id: alice.id, status: 'pending', message: { en: 'direct' } }),
    });
    assert.ok(r.status >= 400, `direct insert allowed: ${r.status}`);
  });

  it('raise_interest IS the way in', async () => {
    const r = await rpc(alice.headers, 'raise_interest', { p_listing_id: bobListing, p_message: { en: 'proper' } });
    assert.ok(r.status < 300, `raise_interest failed: ${r.status} ${r.body}`);
  });

  it('the listing owner cannot set a status directly, bypassing accept_interest', async () => {
    const [interest] = await read<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    await rest(`market_interests?id=eq.${interest.id}`, {
      method: 'PATCH', headers: bob.headers, body: JSON.stringify({ status: 'accepted' }),
    });
    const [row] = await read<{ status: string }>(`market_interests?select=status&id=eq.${interest.id}`);
    assert.equal(row.status, 'pending', 'an interest was accepted without creating a match');
  });

  it('a member cannot set their own listing to matched', async () => {
    await rest(`market_listings?id=eq.${aliceListing}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ status: 'matched' }),
    });
    const [row] = await read<{ status: string }>(`market_listings?select=status&id=eq.${aliceListing}`);
    assert.equal(row.status, 'open');
  });

  it('a member cannot forge a curator suggestion on their own listing', async () => {
    await rest(`market_listings?id=eq.${aliceListing}`, {
      method: 'PATCH', headers: alice.headers,
      body: JSON.stringify({ suggested_profile_id: bob.id, suggested_reason: { en: 'forged' } }),
    });
    const [row] = await read<{ suggested_profile_id: string | null }>(`market_listings?select=suggested_profile_id&id=eq.${aliceListing}`);
    assert.equal(row.suggested_profile_id, null, 'a member forged a curator endorsement');
  });

  it('a member cannot fabricate a match with anyone', async () => {
    const r = await rest('matches', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ listing_id: null, initiator_profile_id: alice.id, matched_profile_id: bob.id, status: 'connected', source: 'self' }),
    });
    assert.ok(r.status >= 400, `a match was fabricated: ${r.status}`);
    const rows = await read(`matches?select=id&matched_profile_id=eq.${bob.id}`);
    assert.equal(rows.length, 0);
  });

  it('a non-curator cannot dismatch', async () => {
    const r = await rpc(alice.headers, 'dismatch', { p_match_id: '00000000-0000-0000-0000-000000000000' });
    assert.equal(r.status, 403);
  });

  it('a non-curator cannot suggest', async () => {
    const r = await rpc(alice.headers, 'curator_suggest', { p_listing_id: aliceListing, p_profile_id: bob.id, p_reason: null });
    assert.equal(r.status, 403);
  });
});

describe('notifications are private correspondence (00008)', () => {
  let bobNotification: string;

  before(async () => {
    // alice raised a hand on bob's listing in the block above, which notified bob.
    const rows = await read<{ id: string }>(`notifications?select=id&profile_id=eq.${bob.id}`);
    bobNotification = rows[0]?.id;
  });

  it('the recipient can read their own', async () => {
    const rows = await read<{ id: string }>('notifications?select=id', bob.headers);
    assert.ok(rows.length > 0, 'the recipient could not read their own inbox');
  });

  it('another member cannot read them', async () => {
    const rows = await read<{ id: string }>('notifications?select=id', alice.headers);
    assert.ok(!rows.some((n) => n.id === bobNotification), 'a member read another member\'s inbox');
  });

  it('a CURATOR cannot read them either', async () => {
    const rows = await read<{ id: string }>('notifications?select=id', curator.headers);
    assert.ok(!rows.some((n) => n.id === bobNotification),
      'a curator read a member\'s inbox — the select policy has no is_curator escape hatch by design');
  });

  it('nobody can forge one', async () => {
    const r = await rest('notifications', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ profile_id: bob.id, kind: 'match_met', payload: {} }),
    });
    assert.ok(r.status >= 400, `a notification was forged: ${r.status}`);
  });

  it('nobody can delete one to hide it', async () => {
    await rest(`notifications?id=eq.${bobNotification}`, { method: 'DELETE', headers: bob.headers });
    const rows = await read(`notifications?select=id&id=eq.${bobNotification}`);
    assert.equal(rows.length, 1, 'a notification was deleted by its recipient');
  });

  it('marking read touches only your own', async () => {
    await rpc(alice.headers, 'mark_notifications_read', { p_ids: [bobNotification] });
    const [row] = await read<{ read_at: string | null }>(`notifications?select=read_at&id=eq.${bobNotification}`);
    assert.equal(row.read_at, null, 'a member marked another member\'s mail read');
  });

  for (const fn of ['add_notification', 'notification_payload']) {
    it(`${fn} is not callable by a client`, async () => {
      const r = await rpc(alice.headers, fn, fn === 'add_notification'
        ? { p_profile_id: bob.id, p_kind: 'match_met', p_payload: {} }
        : { p_actor_id: bob.id });
      assert.equal(r.status, 403, `${fn} was callable`);
    });
  }
});

describe('match transitions (00006)', () => {
  it('a non-participant cannot mark a match met', async () => {
    const r = await rpc(alice.headers, 'mark_match_met', { p_match_id: '00000000-0000-0000-0000-000000000000' });
    // Either "no such match" or "not yours" — never a success.
    assert.ok(r.status >= 400, `mark_match_met succeeded for a stranger: ${r.status}`);
  });
});
