# Republic of FLOW

A mobile-first private community app for an MBA cohort of ~100 students across
two classes. It helps classmates discover each other's *hidden worlds* — the
interests that don't appear on a résumé — and creates reasons to meet in person.

It is deliberately not a social feed. The guiding principle is **match, then
disappear**: once two people have a reason to talk, the app gets out of the way.

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, paper-and-ink design tokens in `src/app/globals.css` |
| Data & auth | Supabase — Postgres with RLS, email OTP sign-in |
| Hosting | Cloudflare Workers via OpenNext |
| Languages | English (default) and Chinese |

## Getting started

```bash
npm install
```

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The two `NEXT_PUBLIC_*` values are compiled into the browser bundle. The secret
key bypasses RLS entirely — keep it server-side, never expose it to the client,
and never add it as a build variable.

```bash
npm run dev
```

### Running against a local database

`.env.local` points at the hosted project, so `npm run dev` talks to whatever
is configured there — which for this repo has been production. Testing anything
that writes needs a database of your own:

```bash
npx supabase start
```

That boots Postgres, Auth and PostgREST in Docker and applies every migration in
`supabase/migrations` in order, so it doubles as a rehearsal for a migration
before it is run for real. Put the printed URL and keys in
`.env.development.local`, which `next dev` reads *ahead of* `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from supabase start>
SUPABASE_SECRET_KEY=<SECRET_KEY from supabase start>
```

Sign-in codes are not emailed anywhere — they land in the local mailbox at
<http://127.0.0.1:55324>. `supabase/templates/magic_link.html` is what puts the
six digits in that message; without it the stock template sends a link, and the
login screen has nowhere to get a code from.

The ports in `supabase/config.toml` are shifted a thousand off the defaults
because the usual `5432x` block collides with any other local Supabase project
on the same machine. `npx supabase stop --no-backup` throws the database away.

Every command that writes — the demo seeder and the authorization suite — reads
**only** `.env.development.local`, and only if its URL is `localhost`,
`127.0.0.1` or `::1`. There is no fall back to `.env.local` and no way to
override it: those tools are local-only, full stop. Without that, following the
paragraph above and then running one of them would have created and deleted
rows in the hosted project, alongside real members.

### Database

Run `supabase/migrations/00001_foundation.sql` in the Supabase SQL editor. It
creates the tables, RLS policies, and a trigger on `auth.users` that builds a
profile row automatically on first sign-in.

`supabase/fix.sql` is a one-shot repair for an existing database that predates
the grants and `search_path` fixes. Safe to re-run; skip it on a fresh project.

### Demo data

To populate the app with a fictional cohort while developing:

```bash
npx tsx scripts/seed-demo.ts          # insert 13 demo members + listings
npx tsx scripts/seed-demo.ts --clean  # remove them again
```

Each demo member is a real auth user (`profiles.user_id` is `NOT NULL`), so
removal goes through `auth.users` and cascades. Both forms need a local
database — see above — and the seeder additionally refuses a database that
already holds profiles, so it cannot bury a real cohort under thirteen
invented ones.

### Authorization tests

```bash
npm run test:authz
```

Sixty-one probes, each one a hole that was once genuinely open and was closed
by a migration. It runs against a real Postgres because policies and grants
exist nowhere else, and it creates and deletes accounts to do so — hence local
only. The three suites that need no database at all (`test:settling`,
`test:initials`, and `verify-assets`) run anywhere.

## Curators

Curators get the Curator Desk: feature members, deactivate accounts, assign
classes, suggest people for listings, and send invitations. The flag also drives
the `is_curator()` helper behind the RLS policies, so it grants real
database-level access rather than just UI.

```sql
update profiles
set is_curator = true
where user_id = (select id from auth.users where email = 'someone@school.edu');
```

The person must have signed in at least once, or there is no `auth.users` row to
match and the update affects zero rows.

## Branches

| Branch | Purpose |
|---|---|
| `development` | Day-to-day work and local testing. Branch from here. |
| `staging` | Pre-production verification. |
| `main` | **Production.** Every push deploys to Cloudflare automatically. |

Work on a branch off `development`, open a PR into it, then promote
`development` → `staging` → `main`. Nothing lands on `main` directly: a merge
there is a deploy to real members, with no gap in between.

Cloudflare also builds non-production branches, so `staging` and `development`
get preview deployments. Those need the same `NEXT_PUBLIC_*` build variables as
production, or the preview serves the fail-closed 503.

> **These branches share one Supabase project.** A preview deployment reads and
> writes the same live data as production unless you point it at a separate
> Supabase project via its own build variables. Until then, treat "testing on
> staging" as testing against real member records.

## Deploying

Pushes to `main` build and deploy automatically through Cloudflare Workers
Builds. To deploy by hand:

```bash
npx wrangler login
npm run deploy
```

Cloudflare needs these configured, and the distinction matters:

- **Build variables** — `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Next.js inlines these during
  `next build`, so they must exist when the build runs. Setting them only as
  runtime variables leaves `undefined` compiled into the bundle.
- **Secret** — `SUPABASE_SECRET_KEY`, encrypted, runtime only. Never a build
  variable: those end up in JavaScript every visitor downloads.

The build command must be `npx @opennextjs/cloudflare build`, not the default
`npm run build` — `wrangler.jsonc` points at `.open-next/worker.js`, which only
the OpenNext step produces.

If a deployment serves a plain-text *"Server is not configured"* 503, the build
ran without the `NEXT_PUBLIC_*` variables. The middleware fails closed on
purpose: without them it cannot verify sessions, and serving the app wide open
would be worse than serving an error.

After the first deploy, add the Worker's URL to Supabase under
**Authentication → URL Configuration**. OTP sign-in works without it (the code
is typed, not clicked), but invitation emails link to the wrong host until it is
set.

## Layout

```
src/
  app/
    (app)/      home, people, dossier, market, profile, admin
    (auth)/     login
    api/        admin/invite — server-side, re-checks curator status
  components/ui/
  lib/
    i18n/       translations and language context
    supabase/   browser + server clients, middleware, directory context
supabase/       migrations and the one-shot repair script
scripts/        demo data seeding
```

The whole directory loads once into a React context (`lib/supabase/directory`)
and is shared across screens, so moving between tabs refetches nothing.
