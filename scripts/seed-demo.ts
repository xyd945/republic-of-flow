/**
 * Seeds the demo cohort into Supabase so the app has something to render.
 *
 *   npx tsx scripts/seed-demo.ts          # insert demo cohort
 *   npx tsx scripts/seed-demo.ts --clean  # remove it again
 *
 * Every demo member is a real auth user (profiles.user_id is NOT NULL), so
 * removal goes through auth.users and cascades to profiles.
 */
import { readFileSync } from 'node:fs';
import { SEED_PROFILES, SEED_LISTINGS, SEED_INTERESTS, SEED_MATCHES } from '../src/lib/seed';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const DEMO_DOMAIN = 'republic-demo.invalid';
const emailFor = (seedId: string) => `demo.${seedId}@${DEMO_DOMAIN}`;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(URL_ + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function listDemoUsers() {
  const out: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const d = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!d.users?.length) break;
    out.push(...d.users.filter((u: { email?: string }) => u.email?.endsWith(`@${DEMO_DOMAIN}`)));
    if (d.users.length < 200) break;
  }
  return out;
}

async function clean() {
  const users = await listDemoUsers();
  for (const u of users) {
    await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
  console.log(`removed ${users.length} demo users (profiles cascaded)`);
}

async function seed() {
  const existing = await listDemoUsers();
  if (existing.length) {
    console.log(`found ${existing.length} existing demo users — cleaning first`);
    await clean();
  }

  // seed profile id ("p1") -> real profiles.id (uuid)
  const idMap = new Map<string, string>();

  for (const p of SEED_PROFILES) {
    const user = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: emailFor(p.id),
        email_confirm: true,
        user_metadata: { full_name: p.full_name },
      }),
    });

    // handle_new_user() already created the row; fill in the rest.
    const rows = await api(`/rest/v1/profiles?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        full_name: p.full_name,
        native_name: p.native_name,
        initials: p.initials,
        class_name: p.class_name,
        headline: p.headline,
        role: p.role,
        intro: p.intro,
        professional: p.professional,
        preferred_language: p.preferred_language,
        contact_kind: p.contact_kind,
        contact_value: p.contact_value,
        ask_topics: p.ask_topics,
        want_topics: p.want_topics,
        languages: p.languages,
        is_active: p.is_active,
        is_featured: p.is_featured,
        is_curator: p.is_curator,
      }),
    });

    const realId = rows[0].id;
    idMap.set(p.id, realId);

    if (p.hidden_worlds.length) {
      await api('/rest/v1/profile_hidden_worlds', {
        method: 'POST',
        body: JSON.stringify(
          p.hidden_worlds.map((w) => ({
            profile_id: realId,
            name: w.name,
            category: w.category,
            visibility: w.visibility,
            sort_order: w.sort_order,
          }))
        ),
      });
    }
  }
  console.log(`seeded ${idMap.size} profiles`);

  const listingMap = new Map<string, string>();
  for (const l of SEED_LISTINGS) {
    const rows = await api('/rest/v1/market_listings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        creator_profile_id: idMap.get(l.creator_profile_id),
        type: l.type,
        title: l.title,
        description: l.description,
        tags: l.tags,
        chips: l.chips,
        capacity: l.capacity,
        status: l.status,
        suggested_profile_id: l.suggested_profile ? idMap.get(l.suggested_profile.id) : null,
        suggested_reason: l.suggested_reason ? { en: l.suggested_reason } : null,
      }),
    });
    listingMap.set(l.id, rows[0].id);
  }
  console.log(`seeded ${listingMap.size} listings`);

  await api('/rest/v1/market_interests', {
    method: 'POST',
    body: JSON.stringify(
      SEED_INTERESTS.map((i) => ({
        listing_id: listingMap.get(i.listing_id),
        profile_id: idMap.get(i.profile_id),
        message: i.message,
        status: i.status,
      }))
    ),
  });
  console.log(`seeded ${SEED_INTERESTS.length} interests`);

  await api('/rest/v1/matches', {
    method: 'POST',
    body: JSON.stringify(
      SEED_MATCHES.map((m) => ({
        listing_id: listingMap.get(m.listing_id),
        initiator_profile_id: idMap.get(m.initiator_profile_id),
        matched_profile_id: idMap.get(m.matched_profile_id),
        status: m.status,
        source: m.source,
        next_step: m.next_step,
      }))
    ),
  });
  console.log(`seeded ${SEED_MATCHES.length} matches`);
}

(process.argv.includes('--clean') ? clean() : seed()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
