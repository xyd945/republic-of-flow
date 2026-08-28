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
 * It runs against a real Postgres, because that is the only place the policies
 * and grants actually exist; a mocked client would test nothing. It creates
 * throwaway members and rows, probes as them, and deletes everything afterwards
 * — which is why it refuses to run anywhere but a local database. Start one
 * with `npx supabase start` and point .env.development.local at it.
 *
 * TWO RULES THIS FILE HOLDS ITSELF TO, both learned the hard way:
 *
 *  1. A negative test must fail for the RIGHT reason. Probing with a nonexistent
 *     uuid proves nothing — the function rejects it at the "no such row" check
 *     before ever reaching the ownership check you meant to test, so deleting
 *     that check outright would leave the test green. Every negative probe here
 *     runs against a REAL row that really exists.
 *
 *  2. Read the row back. An HTTP status is not proof: PostgREST answers 204 for
 *     a PATCH that matched zero rows exactly as it does for one that changed
 *     something, and it can answer 200 with `[]` for a refusal. Assert on the
 *     data, or on an explicit error status, never on a bare 2xx/4xx.
 *
 * Cleanup is by explicit id — a cleanup written as a filter is what once
 * deleted six real rows here — and everything created is registered the moment
 * it exists, so a failure part-way through still cleans up after itself.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadLocalSupabaseEnv } from '../scripts/local-env.ts';

/* This suite creates auth users and deletes them again, so it runs against a
   local database or not at all. It used to be run with
   `--env-file=.env.local`, which is the hosted project — the suite was
   creating and deleting real accounts alongside real members. */
const env = loadLocalSupabaseEnv();
const URL_ = env.url;
const SECRET = env.secretKey;
const PUB = env.publishableKey;

const ADMIN = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' };
const ANON = { apikey: PUB, 'Content-Type': 'application/json' };
type H = Record<string, string>;

const rest = (path: string, init: RequestInit & { headers: H }) =>
  fetch(`${URL_}/rest/v1/${path}`, init);

const read = async <T = Record<string, unknown>>(path: string, headers: H = ADMIN): Promise<T[]> => {
  const body = await (await rest(path, { headers })).json();
  return Array.isArray(body) ? body as T[] : [];
};
const one = async <T = Record<string, unknown>>(path: string, headers: H = ADMIN): Promise<T> => {
  const rows = await read<T>(path, headers);
  assert.ok(rows.length === 1, `expected exactly one row from ${path}, got ${rows.length}`);
  return rows[0];
};

const rpc = async (headers: H, fn: string, body: unknown) => {
  const r = await rest(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.text() };
};

/** Everything this run created, so cleanup works even if a test throws. */
const created = { users: [] as string[], listings: [] as string[], matches: [] as string[] };

async function makeMember(tag: string) {
  const email = `zz-authz-${tag}-${Date.now()}${Math.floor(Math.random() * 999)}@example.invalid`;
  const user = await (await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: ADMIN,
    body: JSON.stringify({ email, password: `Probe!${Date.now()}`, email_confirm: true }),
  })).json() as { id: string };
  // Registered immediately: if the trigger wait below times out, the auth user
  // still gets deleted rather than stranded.
  created.users.push(user.id);

  let profile: { id: string } | undefined;
  for (let i = 0; i < 25 && !profile; i++) {
    await new Promise((r) => setTimeout(r, 150));
    profile = (await read<{ id: string }>(`profiles?select=id&user_id=eq.${user.id}`))[0];
  }
  assert.ok(profile, `handle_new_user() never created a profile for ${email}`);

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
    headers: { apikey: PUB, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } as H,
  };
}
type Member = Awaited<ReturnType<typeof makeMember>>;

async function makeListing(owner: string, title: string) {
  const row = (await (await rest('market_listings', {
    method: 'POST', headers: { ...ADMIN, Prefer: 'return=representation' },
    body: JSON.stringify({ creator_profile_id: owner, type: 'wanted', title: { en: title }, description: { en: 't' }, status: 'open' }),
  })).json())[0] as { id: string };
  created.listings.push(row.id);
  return row.id;
}

let alice: Member;    // an ordinary member
let bob: Member;      // another ordinary member — owns the listing, is the victim
let curator: Member;
let aliceListing: string;
let bobListing: string;
/** A real, live match between alice and bob — several probes need one. */
let matchId: string;
let matchedInterest: string;
let matchedListing: string;

before(async () => {
  alice = await makeMember('alice');
  bob = await makeMember('bob');
  curator = await makeMember('curator');

  // There is deliberately no API path to is_curator — 00005 removed it — so
  // this grants it the way a human would, with the service key.
  await rest(`profiles?id=eq.${curator.id}`, {
    method: 'PATCH', headers: ADMIN, body: JSON.stringify({ is_curator: true }),
  });

  aliceListing = await makeListing(alice.id, 'ZZZ authz alice');
  bobListing = await makeListing(bob.id, 'ZZZ authz bob');

  // A genuine match, built through the real functions, so that every "you may
  // not touch this" probe below runs against a row that actually exists.
  matchedListing = await makeListing(bob.id, 'ZZZ authz matched');
  const raised = await rpc(alice.headers, 'raise_interest', { p_listing_id: matchedListing, p_message: { en: 'yes' } });
  assert.ok(raised.status < 300, `fixture: raise_interest failed ${raised.status} ${raised.body}`);
  matchedInterest = (await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${matchedListing}`)).id;
  const accepted = await rpc(bob.headers, 'accept_interest', { p_interest_id: matchedInterest });
  assert.ok(accepted.status < 300, `fixture: accept_interest failed ${accepted.status} ${accepted.body}`);
  matchId = (await one<{ id: string }>(`matches?select=id&listing_id=eq.${matchedListing}`)).id;
  created.matches.push(matchId);
});

after(async () => {
  // Explicit ids only, and forged rows too — a probe that SUCCEEDS when it
  // should not leaves a row behind, and that is exactly when cleanup matters.
  for (const m of await read<{ id: string }>(`matches?select=id&initiator_profile_id=eq.${alice?.id ?? '00000000-0000-0000-0000-000000000000'}`)) {
    created.matches.push(m.id);
  }
  for (const id of new Set(created.matches)) {
    await rest(`matches?id=eq.${id}`, { method: 'DELETE', headers: ADMIN });
  }
  for (const listing of created.listings) {
    for (const table of ['matches', 'market_interests']) {
      for (const row of await read<{ id: string }>(`${table}?select=id&listing_id=eq.${listing}`)) {
        await rest(`${table}?id=eq.${row.id}`, { method: 'DELETE', headers: ADMIN });
      }
    }
    await rest(`market_listings?id=eq.${listing}`, { method: 'DELETE', headers: ADMIN });
  }
  for (const userId of created.users) {
    await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: ADMIN });
  }
});

// ---------------------------------------------------------------------------

describe('anonymous access (00005)', () => {
  const TABLES = ['profiles', 'profile_hidden_worlds', 'market_listings', 'market_interests', 'matches', 'notifications'];

  for (const table of TABLES) {
    it(`${table} is refused outright, not merely empty`, async () => {
      const r = await rest(`${table}?select=id`, { headers: ANON });
      // Asserting on the STATUS, not on an empty array. 00005 revoked the grant
      // as well as tightening the policy; if only the grant came back, RLS would
      // still filter every row and PostgREST would answer 200 [] — which an
      // emptiness check would happily accept while the revoke layer was gone.
      assert.ok(r.status >= 400, `${table} answered ${r.status}; the anon grant appears to be back`);
      const body = await r.json() as { code?: string };
      assert.equal(body.code, '42501', `${table} refused for the wrong reason: ${JSON.stringify(body).slice(0, 90)}`);
    });
  }

  for (const fn of ['accept_interest', 'decline_interest', 'dismatch', 'mark_match_met',
                    'curator_suggest', 'curator_update_member', 'save_profile',
                    'raise_interest', 'mark_notifications_read', 'add_notification']) {
    it(`${fn}() is not callable anonymously`, async () => {
      const r = await rpc(ANON, fn, {});
      assert.ok(r.status >= 400, `${fn} answered ${r.status} to an anonymous caller`);
    });
  }
});

describe('a member cannot change their own standing (00005)', () => {
  // Every column 00005 deliberately withheld, not just the famous one.
  for (const [column, value] of [
    ['is_curator', true], ['is_featured', true], ['is_active', false], ['founder_no', 9999],
  ] as const) {
    it(`cannot write ${column}`, async () => {
      const before_ = await one<Record<string, unknown>>(`profiles?select=${column}&id=eq.${alice.id}`);
      await rest(`profiles?id=eq.${alice.id}`, {
        method: 'PATCH', headers: alice.headers, body: JSON.stringify({ [column]: value }),
      });
      const after_ = await one<Record<string, unknown>>(`profiles?select=${column}&id=eq.${alice.id}`);
      assert.deepEqual(after_[column], before_[column], `a member wrote ${column} on their own row`);
    });
  }

  it('cannot reassign user_id to hijack another account', async () => {
    const before_ = await one<{ user_id: string }>(`profiles?select=user_id&id=eq.${alice.id}`);
    await rest(`profiles?id=eq.${alice.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ user_id: bob.userId }),
    });
    const after_ = await one<{ user_id: string }>(`profiles?select=user_id&id=eq.${alice.id}`);
    assert.equal(after_.user_id, before_.user_id);
  });

  it("cannot write another member's profile", async () => {
    const before_ = await one<{ full_name: string }>(`profiles?select=full_name&id=eq.${bob.id}`);
    await rest(`profiles?id=eq.${bob.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ full_name: 'REWRITTEN' }),
    });
    const after_ = await one<{ full_name: string }>(`profiles?select=full_name&id=eq.${bob.id}`);
    assert.equal(after_.full_name, before_.full_name);
  });
});

describe('a curator moderates standing, not self-description (00007)', () => {
  it("cannot rewrite another member's headline", async () => {
    const before_ = await one<{ headline: unknown }>(`profiles?select=headline&id=eq.${bob.id}`);
    await rest(`profiles?id=eq.${bob.id}`, {
      method: 'PATCH', headers: curator.headers, body: JSON.stringify({ headline: { en: 'PUT WORDS IN THEIR MOUTH' } }),
    });
    const after_ = await one<{ headline: unknown }>(`profiles?select=headline&id=eq.${bob.id}`);
    assert.deepEqual(after_.headline, before_.headline, "a curator rewrote a member's headline");
  });

  it('CAN change standing, through the function', async () => {
    const r = await rpc(curator.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: true, p_is_active: null, p_class_name: null,
    });
    assert.ok(r.status < 300, `curator_update_member failed: ${r.status} ${r.body}`);
    assert.equal((await one<{ is_featured: boolean }>(`profiles?select=is_featured&id=eq.${bob.id}`)).is_featured, true);
    await rpc(curator.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: false, p_is_active: null, p_class_name: null,
    });
  });

  it('a plain member cannot use the curator function', async () => {
    const r = await rpc(alice.headers, 'curator_update_member', {
      p_profile_id: bob.id, p_is_featured: true, p_is_active: null, p_class_name: null,
    });
    assert.equal(r.status, 403);
    assert.equal((await one<{ is_featured: boolean }>(`profiles?select=is_featured&id=eq.${bob.id}`)).is_featured, false);
  });
});

describe('hidden worlds are written only by save_profile (00007)', () => {
  let bobWorld: string;

  before(async () => {
    const r = await rpc(bob.headers, 'save_profile', {
      p_full_name: 'Bob', p_native_name: null, p_class_name: 'Class 26', p_initials: 'BO',
      p_headline: {}, p_role: {}, p_intro: {}, p_professional: {},
      p_contact_kind: 'email', p_contact_value: 'b@example.invalid',
      p_ask_topics: [], p_want_topics: [],
      p_hidden_worlds: [{ id: null, name: { en: 'ZZZ bob world' }, category: 'craft', visibility: 'members', sort_order: 0 }],
      p_known_world_ids: [], p_expected_updated_at: null,
    });
    assert.ok(r.status < 300, `fixture: save_profile failed ${r.status} ${r.body}`);
    bobWorld = (await one<{ id: string }>(`profile_hidden_worlds?select=id&profile_id=eq.${bob.id}`)).id;
  });

  it('a member cannot insert one directly', async () => {
    const r = await rest('profile_hidden_worlds', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ profile_id: alice.id, name: { en: 'direct' }, category: 'craft', visibility: 'members' }),
    });
    assert.ok(r.status >= 400, `direct insert allowed: ${r.status}`);
  });

  it("a member cannot rewrite another member's world", async () => {
    await rest(`profile_hidden_worlds?id=eq.${bobWorld}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ name: { en: 'HIJACKED' } }),
    });
    const row = await one<{ name: { en?: string } }>(`profile_hidden_worlds?select=name&id=eq.${bobWorld}`);
    assert.equal(row.name.en, 'ZZZ bob world');
  });

  it("a CURATOR cannot rewrite another member's world either", async () => {
    await rest(`profile_hidden_worlds?id=eq.${bobWorld}`, {
      method: 'PATCH', headers: curator.headers, body: JSON.stringify({ name: { en: 'HIJACKED BY CURATOR' } }),
    });
    const row = await one<{ name: { en?: string } }>(`profile_hidden_worlds?select=name&id=eq.${bobWorld}`);
    assert.equal(row.name.en, 'ZZZ bob world', 'hw_update still carries an is_curator escape hatch');
  });

  it('nobody can delete one directly', async () => {
    await rest(`profile_hidden_worlds?id=eq.${bobWorld}`, { method: 'DELETE', headers: curator.headers });
    assert.equal((await read(`profile_hidden_worlds?select=id&id=eq.${bobWorld}`)).length, 1);
  });

  it("save_profile refuses a world id that is not yours", async () => {
    const r = await rpc(alice.headers, 'save_profile', {
      p_full_name: 'Alice', p_native_name: null, p_class_name: 'Class 26', p_initials: 'AL',
      p_headline: {}, p_role: {}, p_intro: {}, p_professional: {},
      p_contact_kind: 'email', p_contact_value: 'a@example.invalid',
      p_ask_topics: [], p_want_topics: [],
      p_hidden_worlds: [{ id: bobWorld, name: { en: 'STEAL' }, category: 'craft', visibility: 'members', sort_order: 0 }],
      p_known_world_ids: [], p_expected_updated_at: null,
    });
    assert.equal(r.status, 403, `save_profile accepted a foreign world id: ${r.status} ${r.body}`);
    const row = await one<{ name: { en?: string } }>(`profile_hidden_worlds?select=name&id=eq.${bobWorld}`);
    assert.equal(row.name.en, 'ZZZ bob world');
  });

  it('save_profile leaves standing alone even when asked nicely', async () => {
    // The function has no parameter for is_curator, so PostgREST rejects the
    // call outright rather than ignoring the extra field — which is itself the
    // guarantee worth asserting: there is no argument to smuggle it through.
    const r = await rpc(alice.headers, 'save_profile', {
      p_full_name: 'Alice', p_native_name: null, p_class_name: 'Class 26', p_initials: 'AL',
      p_headline: {}, p_role: {}, p_intro: {}, p_professional: {},
      p_contact_kind: 'email', p_contact_value: 'a@example.invalid',
      p_ask_topics: [], p_want_topics: [], p_hidden_worlds: [],
      p_known_world_ids: [], p_expected_updated_at: null,
      p_is_curator: true,
    });
    assert.ok(r.status >= 400, 'save_profile accepted an is_curator argument');
    assert.equal((await one<{ is_curator: boolean }>(`profiles?select=is_curator&id=eq.${alice.id}`)).is_curator, false);
  });
});

describe('interests are written only by their functions (00002, 00003, 00009)', () => {
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
    assert.equal((await read(`market_interests?select=id&listing_id=eq.${bobListing}`)).length, 1);
  });

  it('raise_interest refuses your own listing', async () => {
    const r = await rpc(alice.headers, 'raise_interest', { p_listing_id: aliceListing, p_message: null });
    assert.ok(r.status >= 400, 'a member raised a hand on their own listing');
  });

  it('raise_interest refuses a listing that is no longer open', async () => {
    // matchedListing went to 'matched' when accept_interest ran in `before`.
    const r = await rpc(curator.headers, 'raise_interest', { p_listing_id: matchedListing, p_message: null });
    assert.ok(r.status >= 400, 'a member raised a hand on a closed listing');
  });

  it('the REQUESTER cannot accept their own request — 00002s original exploit', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    await rest(`market_interests?id=eq.${interest.id}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ status: 'accepted' }),
    });
    assert.equal((await one<{ status: string }>(`market_interests?select=status&id=eq.${interest.id}`)).status,
      'pending', 'a member accepted their own request');
  });

  it('the listing owner cannot set a status directly, bypassing accept_interest', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    await rest(`market_interests?id=eq.${interest.id}`, {
      method: 'PATCH', headers: bob.headers, body: JSON.stringify({ status: 'accepted' }),
    });
    assert.equal((await one<{ status: string }>(`market_interests?select=status&id=eq.${interest.id}`)).status,
      'pending', 'an interest was accepted without creating a match');
  });

  it('nobody can rewrite the message or move an interest to another listing', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    await rest(`market_interests?id=eq.${interest.id}`, {
      method: 'PATCH', headers: alice.headers,
      body: JSON.stringify({ message: { en: 'REWRITTEN' }, listing_id: aliceListing }),
    });
    const row = await one<{ message: { en?: string }; listing_id: string }>(`market_interests?select=message,listing_id&id=eq.${interest.id}`);
    assert.equal(row.message.en, 'proper');
    assert.equal(row.listing_id, bobListing);
  });

  it('nobody can delete an interest to erase the record', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    await rest(`market_interests?id=eq.${interest.id}`, { method: 'DELETE', headers: bob.headers });
    assert.equal((await read(`market_interests?select=id&id=eq.${interest.id}`)).length, 1);
  });

  it('accept_interest refuses a NON-OWNER, on a real pending request (00003)', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    const r = await rpc(curator.headers, 'accept_interest', { p_interest_id: interest.id });
    assert.equal(r.status, 403, `a non-owner accepted a request: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`market_interests?select=status&id=eq.${interest.id}`)).status, 'pending');
  });

  it('decline_interest refuses a NON-OWNER, on a real pending request (00003)', async () => {
    const interest = await one<{ id: string }>(`market_interests?select=id&listing_id=eq.${bobListing}`);
    const r = await rpc(curator.headers, 'decline_interest', { p_interest_id: interest.id });
    assert.equal(r.status, 403, `a non-owner declined a request: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`market_interests?select=status&id=eq.${interest.id}`)).status, 'pending');
  });
});

describe('listings and matches (00006)', () => {
  it('a member cannot set their own listing to matched', async () => {
    await rest(`market_listings?id=eq.${aliceListing}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ status: 'matched' }),
    });
    assert.equal((await one<{ status: string }>(`market_listings?select=status&id=eq.${aliceListing}`)).status, 'open');
  });

  it('a member cannot forge a curator suggestion on their own listing', async () => {
    await rest(`market_listings?id=eq.${aliceListing}`, {
      method: 'PATCH', headers: alice.headers,
      body: JSON.stringify({ suggested_profile_id: bob.id, suggested_reason: { en: 'forged' } }),
    });
    assert.equal((await one<{ suggested_profile_id: string | null }>(`market_listings?select=suggested_profile_id&id=eq.${aliceListing}`)).suggested_profile_id,
      null, 'a member forged a curator endorsement');
  });

  it('a PARTICIPANT cannot close their own match directly, on a real live match', async () => {
    await rest(`matches?id=eq.${matchId}`, {
      method: 'PATCH', headers: alice.headers, body: JSON.stringify({ status: 'closed' }),
    });
    assert.equal((await one<{ status: string }>(`matches?select=status&id=eq.${matchId}`)).status,
      'connected', 'a participant closed a match, bypassing dismatch()');
  });

  it('a participant cannot delete the match either', async () => {
    await rest(`matches?id=eq.${matchId}`, { method: 'DELETE', headers: alice.headers });
    assert.equal((await read(`matches?select=id&id=eq.${matchId}`)).length, 1);
  });

  it('a member cannot fabricate a match with anyone', async () => {
    const r = await rest('matches', {
      method: 'POST', headers: alice.headers,
      body: JSON.stringify({ listing_id: null, initiator_profile_id: alice.id, matched_profile_id: bob.id, status: 'connected', source: 'self' }),
    });
    assert.ok(r.status >= 400, `a match was fabricated: ${r.status}`);
    // listing_id is null on a forged row, so it would never be found by a
    // cleanup that searches by listing. Check for it directly.
    const forged = await read<{ id: string }>(`matches?select=id&listing_id=is.null&initiator_profile_id=eq.${alice.id}`);
    forged.forEach((m) => created.matches.push(m.id));
    assert.equal(forged.length, 0, 'a forged match survived');
  });

  it('a NON-PARTICIPANT cannot mark a real match met', async () => {
    const r = await rpc(curator.headers, 'mark_match_met', { p_match_id: matchId });
    assert.equal(r.status, 403, `a stranger marked a match met: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`matches?select=status&id=eq.${matchId}`)).status, 'connected');
  });

  it('a PARTICIPANT can — the control for the test above', async () => {
    const r = await rpc(alice.headers, 'mark_match_met', { p_match_id: matchId });
    assert.ok(r.status < 300, `a participant could not mark their own match met: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`matches?select=status&id=eq.${matchId}`)).status, 'completed');
  });

  it('a NON-CURATOR cannot dismatch a real match', async () => {
    const r = await rpc(alice.headers, 'dismatch', { p_match_id: matchId });
    assert.equal(r.status, 403, `a member dismatched: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`matches?select=status&id=eq.${matchId}`)).status, 'completed');
  });

  it('a NON-CURATOR cannot suggest on a real listing', async () => {
    const r = await rpc(alice.headers, 'curator_suggest', { p_listing_id: bobListing, p_profile_id: bob.id, p_reason: null });
    assert.equal(r.status, 403, `a member suggested: ${r.status} ${r.body}`);
    assert.equal((await one<{ suggested_profile_id: string | null }>(`market_listings?select=suggested_profile_id&id=eq.${bobListing}`)).suggested_profile_id, null);
  });

  it('a curator CAN dismatch — the control', async () => {
    const r = await rpc(curator.headers, 'dismatch', { p_match_id: matchId });
    assert.ok(r.status < 300, `curator could not dismatch: ${r.status} ${r.body}`);
    assert.equal((await one<{ status: string }>(`matches?select=status&id=eq.${matchId}`)).status, 'closed');
    // and the side effects the function exists for
    assert.equal((await one<{ status: string }>(`market_listings?select=status&id=eq.${matchedListing}`)).status, 'open');
    assert.equal((await one<{ status: string }>(`market_interests?select=status&id=eq.${matchedInterest}`)).status, 'pending');
  });
});

describe('notifications are private correspondence (00008)', () => {
  let bobNotification: string;
  let bobNotificationKind: string;

  before(async () => {
    const rows = await read<{ id: string; kind: string }>(`notifications?select=id,kind&profile_id=eq.${bob.id}&order=created_at`);
    assert.ok(rows.length > 0, 'fixture: bob should have been notified by the raise_interest above');
    // Remember the kind rather than hard-coding one. By the time this block
    // runs bob has been notified several times by earlier tests, and the row
    // that comes back first is not guaranteed. The suite caught that too.
    bobNotification = rows[0].id;
    bobNotificationKind = rows[0].kind;
  });

  it('the recipient can read their own', async () => {
    assert.ok((await read('notifications?select=id', bob.headers)).length > 0);
  });

  it('another member cannot read them', async () => {
    const rows = await read<{ id: string }>('notifications?select=id', alice.headers);
    assert.ok(!rows.some((n) => n.id === bobNotification), "a member read another member's inbox");
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

  it('the recipient cannot edit one', async () => {
    await rest(`notifications?id=eq.${bobNotification}`, {
      method: 'PATCH', headers: bob.headers, body: JSON.stringify({ kind: 'match_met', payload: { actor_name: 'REWRITTEN' } }),
    });
    const row = await one<{ kind: string }>(`notifications?select=kind&id=eq.${bobNotification}`);
    assert.equal(row.kind, bobNotificationKind, 'a recipient edited their own notification');
  });

  it('nobody can delete one to hide it', async () => {
    await rest(`notifications?id=eq.${bobNotification}`, { method: 'DELETE', headers: bob.headers });
    assert.equal((await read(`notifications?select=id&id=eq.${bobNotification}`)).length, 1);
  });

  it('marking read touches only your own', async () => {
    const r = await rpc(alice.headers, 'mark_notifications_read', { p_ids: [bobNotification] });
    // The call itself succeeds — it is scoped, not forbidden — so assert BOTH
    // that it worked and that it changed nothing of bob's.
    assert.ok(r.status < 300, `mark_notifications_read failed for a legitimate caller: ${r.status} ${r.body}`);
    assert.equal((await one<{ read_at: string | null }>(`notifications?select=read_at&id=eq.${bobNotification}`)).read_at,
      null, "a member marked another member's mail read");
  });

  it('the recipient CAN mark their own read — the control', async () => {
    const r = await rpc(bob.headers, 'mark_notifications_read', { p_ids: [bobNotification] });
    assert.ok(r.status < 300, `${r.status} ${r.body}`);
    assert.notEqual((await one<{ read_at: string | null }>(`notifications?select=read_at&id=eq.${bobNotification}`)).read_at,
      null, 'the recipient could not mark their own mail read');
  });

  it('add_notification() is internal and writes nothing when a client calls it', async () => {
    // Count first. A flat "bob has no match_met notification" assertion would
    // be wrong, because the participant control earlier in this file marks the
    // match met — which legitimately notifies bob. The suite caught exactly
    // that collision on its first run.
    const before_ = (await read(`notifications?select=id&profile_id=eq.${bob.id}`)).length;
    const r = await rpc(alice.headers, 'add_notification', {
      p_profile_id: bob.id, p_kind: 'match_met', p_payload: {},
    });
    assert.ok(r.status >= 400, `add_notification was callable: ${r.status} ${r.body}`);
    const after_ = (await read(`notifications?select=id&profile_id=eq.${bob.id}`)).length;
    assert.equal(after_, before_, 'add_notification wrote a row for a client caller');
  });

  it('notification_payload() is internal and not callable by a client', async () => {
    const r = await rpc(alice.headers, 'notification_payload', { p_actor_id: bob.id });
    assert.ok(r.status >= 400, `notification_payload was callable: ${r.status}`);
  });
});
