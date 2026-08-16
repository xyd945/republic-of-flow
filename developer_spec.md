# Republic of FLOW — Developer Specification

**Document status:** v0.1 — MVP architecture and staged delivery plan  
**Product type:** Mobile-first private MBA community / IRL social game  
**Initial audience:** ~100 MBA students across two classes (~58 students per class)  
**Primary objective:** Increase meaningful real-world connections between classmates by helping people discover each other's hidden interests, experiences, skills, requests, and offers.

---

## 1. Product Summary

Republic of FLOW is not intended to be a conventional social network, messaging platform, or online game. It is a lightweight digital layer that helps classmates discover each other and creates reasons for real-world interactions to happen.

The product philosophy is:

- **Reality First** — if the real-world interaction is easier outside the system, the system gets out of the way.
- **Gamify discovery, not relationships** — game mechanics should help users discover people, experiences, and contribution opportunities, but should not turn friendship into a score.
- **Match, then disappear** — the system should facilitate the connection, then encourage users to move the interaction to real life.
- **Hidden World > Resume** — the product should reveal dimensions of classmates that are not visible through LinkedIn, class introductions, job titles, or CVs.

The long-term product loop is:

```text
Discover people
    ↓
Wanted / Offer
    ↓
Match
    ↓
Real-world interaction
    ↓
Story / Chronicle
    ↓
More discovery
```

A later game layer adds:

```text
Public contribution
    ↓
Quest completion
    ↓
Earn FLOW
    ↓
Use FLOW for scarce community experiences
    ↓
Auction / special access
```

However, this second loop must **not** be part of the first MVP.

---

# 2. Product Principles

These principles should be treated as product constraints rather than optional design preferences.

## 2.1 Do not build a generic social network

Avoid building:

- social feed optimized for endless browsing;
- likes as the main interaction;
- follower/following systems;
- public popularity scores;
- engagement streaks;
- chat as a core product;
- reputation leaderboards.

The product succeeds when it causes real-world interactions, not when users spend more time inside the app.

## 2.2 Do not over-gamify classmates

FLOW, Quests, Guilds, and Auctions are mechanisms for community participation and discovery. They should not become mechanisms for ranking classmates.

Do not expose:

- richest FLOW holders;
- top-ranked classmates;
- XP levels;
- global reputation points;
- "best" or "most valuable" founders.

## 2.3 Small community is an advantage

The initial user base is only about 100 people.

Therefore:

- manual curation is acceptable;
- manual matchmaking is acceptable;
- admin intervention is acceptable;
- no recommendation algorithm is required initially;
- scalability should not drive MVP complexity.

The architecture should remain technically sound, but the product should optimize for learning rather than hypothetical scale.

---

# 3. Target Users and Roles

## 3.1 Founder / Member

The default user.

Can eventually:

- create and edit a profile;
- add Hidden Worlds;
- browse classmates;
- publish Wanted requests;
- publish Offers;
- express interest;
- accept matches;
- participate in Quests;
- earn FLOW;
- participate in Auctions;
- contribute stories.

## 3.2 Curator / Admin

Small trusted operating team.

Responsibilities may include:

- invite users;
- curate profiles;
- moderate listings;
- manually suggest matches;
- create Quests;
- approve Quest completion;
- issue FLOW;
- create auction lots;
- settle Auctions;
- feature Chronicle stories;
- manage system configuration.

## 3.3 Guild Steward — Later Stage

Optional role introduced only when Guild functionality is activated.

Responsibilities:

- manage a contribution area;
- propose Quests;
- coordinate members;
- curate activities.

Do not build this role before Guilds are actually needed.

---

# 4. Recommended Technical Architecture

## 4.1 Architectural Philosophy

Use a **heavy database / light API** architecture.

```text
Mobile Browser / PWA
        │
        ▼
Next.js Application
        │
        ├── direct authenticated reads → Supabase
        │
        └── commands → Cloudflare Worker / server routes
                              │
                              ▼
                       Supabase Postgres
                              │
                   ┌──────────┼──────────┐
                   │          │          │
                 Tables      RLS     DB Functions
                                           │
                                     Transactions
```

The important rule is:

> Business truth lives in Postgres. The Worker orchestrates commands but should not become the source of truth.

Examples of database-owned business rules:

- a Quest cannot exceed its claim capacity;
- a user cannot claim the same Quest twice;
- FLOW cannot be spent twice;
- a bid cannot be lower than the current valid bid;
- an auction cannot accept bids after closing;
- only an authorized admin can approve Quest rewards.

## 4.2 Frontend

Recommended stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Mobile-first responsive design
- PWA support later in Stage 2 or Stage 3

The visual design should preserve the wireframe's distinctive aesthetic:

- paper / archive feel;
- serif typography;
- bronze / ink palette;
- dossier / republic / catalogue language;
- minimal modern SaaS styling.

Do not replace the visual identity with a generic dashboard component library.

## 4.3 Application / Mini Backend

Recommended:

- Cloudflare Workers runtime;
- Next.js route handlers or a small dedicated Worker API;
- thin command endpoints;
- Supabase client for authenticated DB access;
- server-side access for privileged commands.

Initial recommendation: **one Next.js repository deployed to Cloudflare Workers** rather than separate frontend and backend repositories.

## 4.4 Database

Use Supabase PostgreSQL as the main system of record.

Responsibilities:

- relational data;
- RLS permissions;
- domain constraints;
- transactional business logic;
- FLOW ledger;
- auction bidding rules;
- state transitions.

## 4.5 Authentication

Use Supabase Auth.

MVP preferred options:

1. email magic link;
2. Google login;
3. optional restriction to approved / invited email addresses.

Do not build custom authentication.

## 4.6 Storage

Use Supabase Storage for:

- profile photos;
- Chronicle photos;
- optional event / experience media.

Large video workflows are out of scope for the first stages.

## 4.7 Realtime

Do not use realtime unless a feature needs it.

Likely first meaningful use:

- live Auction bidding.

Most other features should use conventional request/response flows.

---

# 5. Repository Structure

Recommended monorepo structure:

```text
republic-of-flow/
│
├── app/
│   ├── (auth)/
│   ├── home/
│   ├── people/
│   ├── market/
│   ├── quests/
│   ├── auction/
│   ├── guilds/
│   ├── profile/
│   ├── admin/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── profile/
│   ├── market/
│   ├── quest/
│   └── auction/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── permissions/
│   ├── i18n/
│   └── validation/
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
│
├── public/
│
├── types/
│
└── docs/
    └── developer_spec.md
```

If a separate Worker is added later:

```text
apps/
  web/
  api/
```

Do not split services until there is a real operational reason.

---

# 6. Staged Delivery Strategy

The project must be implemented in milestones. Each milestone should produce a usable product and validate a product assumption before the next layer is built.

The recommended stages are:

```text
Stage 0 — Foundation
Stage 1 — People Discovery MVP
Stage 2 — Wanted / Offer + Match
Stage 3 — Chronicle + Real-world Loop
Stage 4 — Quest + FLOW Ledger
Stage 5 — Auction
Stage 6 — Guilds + Advanced Curation
Stage 7 — AI / Semantic Matching (optional)
```

Stages 4–7 should not begin until users actively use Stages 1–3.

---

# 7. Stage 0 — Foundation

## Goal

Create the smallest reliable technical foundation without building product complexity.

## Deliverables

### Authentication

- Supabase Auth configured;
- login page;
- logout;
- invite-only access;
- authenticated session handling.

### Core user record

Create:

```text
profiles
```

Minimum fields:

```text
id UUID PK
user_id UUID UNIQUE
full_name TEXT
class_name TEXT
headline TEXT NULL
bio TEXT NULL
avatar_url TEXT NULL
preferred_language TEXT
role TEXT DEFAULT 'member'
is_active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### App shell

- responsive 430px-style mobile layout;
- desktop centered mobile experience initially acceptable;
- bottom navigation shell;
- shared typography and design tokens;
- basic language selector infrastructure.

### Admin bootstrap

Provide at least one admin account.

### Security

RLS enabled on all user-facing tables.

## Explicit Non-Goals

Do not build:

- Market;
- FLOW;
- Quests;
- Auction;
- Guilds;
- AI;
- notifications;
- messaging;
- Chronicle.

## Exit Criteria

Stage 0 is complete when:

- invited users can log in;
- a user profile exists;
- authenticated routes are protected;
- the app can be deployed to production;
- database migrations can reproduce the environment.

---

# 8. Stage 1 — People Discovery MVP

## Product Hypothesis

If classmates can discover interesting dimensions of each other beyond professional identity, they will find new reasons to talk in real life.

This stage is the most important initial product experiment.

## Main Features

### 8.1 Founder Directory

Create `/people`.

Display all active members.

Each card should emphasize:

- name;
- photo;
- short headline;
- 2–4 Hidden World items;
- optional tags.

Do not emphasize employer/title as the primary visual element.

### 8.2 Founder Dossier

Create `/people/[id]`.

Sections:

- name + photo;
- short introduction;
- professional context;
- Hidden Worlds;
- "Ask me about" topics;
- "I would love to discover" topics;
- optional languages;
- optional social/contact preference.

### 8.3 Hidden Worlds

Create:

```text
profile_hidden_worlds
```

Fields:

```text
id UUID PK
profile_id UUID FK
name TEXT
description TEXT NULL
category TEXT NULL
sort_order INTEGER
visibility TEXT DEFAULT 'members'
created_at TIMESTAMPTZ
```

Examples:

- bird watching;
- secret ciabatta recipe;
- missile manufacturing;
- rare book collecting;
- urban exploration;
- amateur psychology;
- wine tasting;
- startup failure lessons.

### 8.4 Profile Editing

Users can edit their own profile.

Admin can edit or curate profiles where needed.

### 8.5 Search and Filters

Keep simple.

MVP:

- text search by name;
- text search over Hidden World names;
- optional category filters.

Do not add vector search yet.

## Suggested Home Screen

Stage 1 home can contain:

```text
Discover someone new
Hidden World of the Day
3 classmates you may not know well
Recently updated profiles
```

These can initially be manually curated.

## Admin Features

Admin can:

- invite user;
- activate/deactivate profile;
- edit profile;
- add/edit Hidden Worlds;
- feature selected members.

## Exit Criteria

Before Stage 2 begins, verify:

- most users have completed profiles;
- users browse profiles voluntarily;
- users report learning surprising things about classmates;
- at least some conversations occur because of information discovered in the app.

If users do not use the profile discovery layer, do not add economic/game mechanics yet.

---

# 9. Stage 2 — Wanted / Offer + Match

## Product Hypothesis

People are more likely to connect when the platform provides a specific reason to interact.

## Core Concepts

### Wanted

A member wants something but does not know exactly who to ask.

Examples:

- understand how M&A really works;
- learn basic wine tasting;
- find someone who has raised venture capital;
- learn how to photograph city architecture;
- find a running partner.

### Offer

A member opens part of their world to classmates.

Examples:

- urban bird-watching walk;
- cooking workshop;
- startup pitch review;
- robot lab visit;
- introduction to an industry.

## Data Model

```text
market_listings
```

Fields:

```text
id UUID PK
creator_profile_id UUID FK
type ENUM('wanted', 'offer')
title TEXT
description TEXT
capacity INTEGER NULL
status ENUM('draft', 'open', 'matched', 'closed', 'cancelled')
visibility TEXT DEFAULT 'class'
expires_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

```text
market_interests
```

```text
id UUID PK
listing_id UUID FK
profile_id UUID FK
message TEXT NULL
status ENUM('pending', 'accepted', 'declined', 'withdrawn')
created_at TIMESTAMPTZ
```

```text
matches
```

```text
id UUID PK
listing_id UUID FK
initiator_profile_id UUID FK
matched_profile_id UUID FK
status ENUM('proposed', 'accepted', 'connected', 'completed', 'closed')
source ENUM('self', 'curator', 'system')
created_at TIMESTAMPTZ
completed_at TIMESTAMPTZ NULL
```

## Matching Flow

```text
User publishes Wanted
        ↓
Other member clicks "I can help"
        ↓
Creator receives response
        ↓
Accept
        ↓
Match created
        ↓
Contact / suggested next step revealed
        ↓
Move conversation outside the app
```

For Offers:

```text
User publishes Offer
       ↓
Members click "I'm interested"
       ↓
Host accepts participant(s)
       ↓
Connection happens offline
```

## Manual Curation

Admin should be able to create a suggested match.

Example:

```text
Wanted: "I want to understand M&A"
Suggested match: Pajaree
```

The user receives:

```text
Potential match
Pajaree
Reason: M&A / IPO / valuation experience
```

No algorithm required.

## No Internal Chat

Do not build a full messaging system.

Once a match is accepted, expose a preferred contact method or a lightweight intro.

Possible options:

- WhatsApp;
- WeChat;
- email;
- phone;
- "find me in class".

The platform's role ends after making the introduction.

## Mini Backend Commands

Likely server commands:

```text
POST /api/market
POST /api/market/:id/interest
POST /api/interest/:id/accept
POST /api/match/:id/complete
POST /api/admin/match/suggest
```

Simple reads can go directly through Supabase under RLS.

## Exit Criteria

Do not move to Stage 3 until real matches happen.

Target early signals:

- at least 20–30% of users publish or respond to a Wanted/Offer;
- multiple accepted matches;
- users report actual offline conversations caused by the product;
- users understand Wanted vs Offer without lengthy explanation.

---

# 10. Stage 3 — Chronicle + Closing the Real-World Loop

## Product Hypothesis

Stories of real connections create culture, social proof, and further discovery.

The Chronicle should document what happened outside the app.

## Core Feature

After a match or experience, the app can ask:

```text
Did this happen?

[ Yes ] [ Not yet ]
```

If yes:

```text
Would you like to leave a short story?
```

## Chronicle Data Model

```text
chronicles
```

Fields:

```text
id UUID PK
author_profile_id UUID FK
title TEXT
body TEXT
status ENUM('draft', 'published', 'featured', 'archived')
source_type ENUM('match', 'offer', 'quest', 'auction', 'manual')
source_id UUID NULL
occurred_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ
```

```text
chronicle_participants
```

```text
chronicle_id UUID FK
profile_id UUID FK
```

Optional:

```text
chronicle_media
```

## Product Presentation

Chronicle is not a generic feed.

It should feel like an archive of the Republic:

- "Republic Story #014";
- people involved;
- what unexpectedly happened;
- optional photo;
- short narrative.

## Privacy

Participants should be able to approve or remove themselves from a story where appropriate.

## Home Evolution

At Stage 3, Home can become:

```text
What is happening in the Republic?

Recent Story
Open Wanted
Featured Offer
Someone's Hidden World
```

## Exit Criteria

The core non-economic loop is validated when:

```text
Profile discovery
→ Wanted / Offer
→ Match
→ Real interaction
→ Chronicle
→ New discovery
```

If this loop works, the product is already useful.

Only then should FLOW and Quests be introduced.

---

# 11. Stage 4 — Quest + FLOW Ledger

## Why This Is Delayed

FLOW introduces artificial economic incentives into a social community. It should only be added once genuine interactions already happen naturally.

FLOW should reward **contribution to the community**, not price ordinary friendship or advice.

Bad model:

```text
"I gave you M&A advice, pay me 10 FLOW."
```

Preferred model:

```text
"I organized a useful activity for the class, the Republic rewards me 5 FLOW."
```

## Quest Purpose

Quests represent public/community contributions.

Examples:

- document three stories this month;
- organize a hiking activity;
- help welcome international classmates;
- invite an external speaker;
- record a class event;
- produce a class photo;
- help organize a special experience.

## Quest State Machine

```text
DRAFT
  ↓
OPEN
  ↓
CLAIMED
  ↓
IN_PROGRESS
  ↓
SUBMITTED
  ↓
APPROVED
  ↓
COMPLETED
```

Alternate paths:

```text
CLAIMED → ABANDONED
OPEN → CANCELLED
SUBMITTED → CHANGES_REQUESTED
```

## Quest Tables

```text
quests
quest_claims
quest_submissions
```

### quests

```text
id UUID PK
title TEXT
description TEXT
reward_flow NUMERIC
capacity INTEGER
status TEXT
deadline TIMESTAMPTZ NULL
created_by UUID
approved_by UUID NULL
created_at TIMESTAMPTZ
```

### quest_claims

```text
id UUID PK
quest_id UUID FK
profile_id UUID FK
status TEXT
claimed_at TIMESTAMPTZ
```

### quest_submissions

```text
id UUID PK
claim_id UUID FK
notes TEXT
status TEXT
submitted_at TIMESTAMPTZ
reviewed_at TIMESTAMPTZ NULL
reviewed_by UUID NULL
```

---

## FLOW Design

FLOW must use a ledger model.

Do **not** store a mutable balance as the only financial truth.

### Accounts

```text
flow_accounts
```

```text
id UUID PK
owner_type ENUM('profile', 'treasury', 'system')
owner_id UUID NULL
created_at TIMESTAMPTZ
```

### Ledger

```text
flow_transactions
```

```text
id UUID PK
debit_account_id UUID FK
credit_account_id UUID FK
amount NUMERIC CHECK(amount > 0)
type TEXT
reference_type TEXT
reference_id UUID NULL
created_by UUID NULL
created_at TIMESTAMPTZ
```

Example Quest reward:

```text
Treasury   -5 FLOW
Alice      +5 FLOW
```

Balance is derived from ledger transactions or maintained through a safe materialized/summary mechanism.

### Important Principle

User browsers must never be allowed to directly mutate FLOW balances.

## Database Functions

Create transactional DB functions such as:

```text
claim_quest(...)
submit_quest(...)
approve_quest(...)
issue_quest_reward(...)
transfer_flow(...)
```

These should enforce business rules inside PostgreSQL transactions.

## Admin

Admin needs:

- create/edit Quest;
- review submission;
- approve/reject;
- issue FLOW;
- view transaction ledger;
- perform controlled correction transactions.

Never allow direct manual edits to balances.

## Exit Criteria

FLOW should not proceed to Auction until:

- users understand how FLOW is earned;
- Quest completion actually occurs;
- FLOW issuance remains rare and meaningful;
- the community does not interpret FLOW as a friendship price or social ranking.

---

# 12. Stage 5 — Auction

## Product Purpose

Auction gives FLOW a desirable use case without turning ordinary relationships into commerce.

Auction should focus on scarce experiences.

Examples:

- small-group robotics lab visit;
- professor dinner;
- wine tasting hosted by a classmate;
- founder roundtable;
- private workshop;
- unusual career experience conversation.

## Auction Concepts

```text
auctions
auction_lots
auction_bids
flow_holds
```

## Auction Lot Fields

```text
id UUID PK
auction_id UUID FK
title TEXT
description TEXT
host_profile_id UUID NULL
opening_bid NUMERIC
minimum_increment NUMERIC
starts_at TIMESTAMPTZ
ends_at TIMESTAMPTZ
status ENUM('draft', 'scheduled', 'live', 'ended', 'settled', 'cancelled')
winner_profile_id UUID NULL
winning_bid NUMERIC NULL
```

## Bidding Rule

A bid must be atomic.

The Worker should call:

```text
place_auction_bid(user, lot, amount)
```

The database transaction must:

```text
1. lock the lot;
2. confirm lot is live;
3. confirm deadline has not passed;
4. confirm bid meets minimum increment;
5. confirm bidder has sufficient available FLOW;
6. release previous winning hold;
7. reserve current bidder FLOW;
8. write bid;
9. update current winning state;
10. commit.
```

## FLOW Holds

```text
flow_holds
```

Fields:

```text
id UUID PK
account_id UUID FK
amount NUMERIC
reference_type TEXT
reference_id UUID
status ENUM('active', 'released', 'captured')
created_at TIMESTAMPTZ
```

A hold prevents users from bidding the same FLOW in multiple simultaneous auctions.

## Realtime

This is the first feature where Supabase Realtime is recommended.

Flow:

```text
Browser
  ↓ bid
Worker
  ↓
Postgres transaction
  ↓
Realtime update
  ↓
All connected auction clients
```

## Settlement

At auction close:

```text
winning hold → captured
winner account → debited
Treasury/host → credited according to rule
losing holds → released
lot → settled
```

Settlement must be idempotent.

## Exit Criteria

Auction is successful if it creates memorable community experiences and gives FLOW meaning.

Do not judge Auction primarily by trading volume.

---

# 13. Stage 6 — Guilds + Advanced Curation

## Why Guilds Are Late

With only 58 people per class, formal Guild membership may initially be over-designed.

In early stages, Chronicle / Experience / Connection / Knowledge should behave more like contribution categories.

Only activate full Guild functionality when repeated activity naturally forms around these areas.

## Potential Guilds

- Chronicle
- Experience
- Connection
- Knowledge

## Guild Features

Possible later functionality:

- Guild page;
- Guild steward;
- member list;
- Guild-specific Quests;
- contribution history;
- recurring events;
- cross-cohort participation.

Guilds become more valuable when multiple MBA cohorts join the system.

Example:

```text
2026 cohort
2027 cohort
2028 cohort
2029 cohort
        ↓
Cross-cohort Guilds
```

## Exit Criteria

Only keep Guilds if they improve sustained community activity. Remove or simplify them if they become decorative taxonomy.

---

# 14. Stage 7 — AI and Semantic Matching — Optional

AI is explicitly not part of MVP.

The first matching engine is the community itself plus curator judgment.

AI becomes useful once there are enough:

- profiles;
- Hidden Worlds;
- Wanted posts;
- Offers;
- Chronicle stories;
- past successful matches.

## Potential AI Features

### Semantic match suggestions

Example:

```text
Wanted:
"I want to understand how M&A really happens inside a company."
```

Possible candidates:

```text
Pajaree — M&A / IPO / valuation
James — private equity
Claire — startup acquisition experience
```

### Hidden World extraction

During onboarding, a conversational prompt can help users turn free-form answers into structured Hidden Worlds.

### Translation

User-generated content can be translated into the supported UI languages.

### Chronicle assistance

The app can turn rough notes into a short Chronicle draft.

## Technical Route

If semantic matching is needed:

- use PostgreSQL vector support;
- generate embeddings from profile/market content;
- retrieve candidate users;
- optionally use an LLM to rerank/explain.

Do not allow an LLM to directly perform authorization, FLOW transfers, Auction settlement, or other transactional decisions.

---

# 15. Internationalization

The prototype contains:

- Chinese;
- English;
- Thai;
- Spanish;
- Korean.

Production should not store every translation directly as duplicated markup.

Use locale files for interface copy:

```text
/locales
  en.json
  zh.json
  th.json
  es.json
  ko.json
```

Example:

```json
{
  "market.wanted": "Wanted",
  "market.offer": "Offer",
  "market.iCanHelp": "I can help"
}
```

For user-generated content:

```text
original content
original_language
translations table — optional later
```

Translation of UGC should not be an MVP blocker.

---

# 16. Permissions and RLS

Security must be designed from Stage 0.

## Profiles

Members:

- can read active class profiles;
- can update only their own profile.

Admins:

- can update all profiles.

## Hidden Worlds

Members:

- can create/update/delete only their own items;
- can read visible items from eligible classmates.

## Market

Members:

- can create own listings;
- can update/cancel own listings;
- cannot edit another member's listing;
- can create interest records for themselves.

## Matches

Only participants and admins can read private match/contact information.

## FLOW

Users:

- can read their own account/transactions;
- cannot directly create privileged ledger entries;
- cannot directly modify balances.

## Auction

Users can submit bids only through controlled server/database functions.

## Admin Role

Use explicit authorization claims or a server-controlled role table.

Do not rely only on hiding admin UI components.

---

# 17. API Philosophy

Avoid creating REST CRUD endpoints for every table.

Use direct Supabase reads where RLS makes them safe.

Use Worker/server commands for meaningful state changes.

Recommended style:

```text
READ MODEL
Browser → Supabase → RLS
```

```text
COMMAND MODEL
Browser → Worker → DB Function → Transaction
```

Examples of commands:

```text
claimQuest()
respondToListing()
acceptMatch()
completeMatch()
approveQuest()
issueFlow()
placeBid()
settleAuction()
```

This creates a lightweight CQRS-like separation without introducing a CQRS framework.

---

# 18. Error Handling

All domain commands should return structured errors.

Example:

```json
{
  "ok": false,
  "error": {
    "code": "QUEST_FULL",
    "message": "This Quest has already reached capacity."
  }
}
```

Recommended domain error codes:

```text
UNAUTHENTICATED
UNAUTHORIZED
NOT_FOUND
INVALID_STATE
QUEST_FULL
ALREADY_CLAIMED
LISTING_CLOSED
INSUFFICIENT_FLOW
AUCTION_NOT_LIVE
BID_TOO_LOW
AUCTION_ALREADY_SETTLED
```

Do not expose raw Postgres errors to the browser.

---

# 19. Auditability

Add an audit log before introducing FLOW.

```text
audit_logs
```

```text
id UUID PK
actor_user_id UUID NULL
action TEXT
entity_type TEXT
entity_id UUID NULL
metadata JSONB
created_at TIMESTAMPTZ
```

Important actions to audit:

- admin role change;
- Quest approval;
- FLOW issuance;
- FLOW correction;
- Auction settlement;
- moderation actions.

---

# 20. Notifications

Do not build a complex notification system early.

Stage 1:

- none required.

Stage 2:

Potential notifications:

- someone responded to your Wanted;
- someone is interested in your Offer;
- a curator suggested a match.

Stage 4:

- Quest approved;
- FLOW received.

Stage 5:

- outbid;
- auction won;
- auction closed.

Preferred initial channel:

- in-app notification inbox;
- optional email.

Push notifications can wait.

---

# 21. Analytics

Do not optimize for conventional engagement metrics alone.

Important product metrics:

## Discovery

- percentage of profiles completed;
- profiles viewed per active user;
- Hidden Worlds viewed;
- search usage.

## Connection

- Wanted created;
- Offers created;
- interests submitted;
- matches accepted;
- matches confirmed as having happened.

## Real-world success

Primary metrics:

- real-world connections reported;
- unique pairs of classmates connected;
- number of users meeting someone they had rarely interacted with before;
- Chronicle stories generated from interactions.

## Community breadth

Useful metric:

```text
Unique connection graph density
```

The goal is not to maximize total interactions, but to broaden the network beyond existing friend groups.

## Game Layer

Later metrics:

- Quests completed;
- FLOW issued;
- FLOW spent;
- percentage of FLOW circulating;
- Auction participation;
- experiences completed.

Do not create public leaderboards from these metrics.

---

# 22. Testing Strategy

## Unit Tests

Focus on pure validation and UI utility logic.

## Database Tests

Most important.

Test:

- RLS policies;
- Quest state transitions;
- duplicate claim prevention;
- FLOW accounting invariants;
- insufficient FLOW;
- concurrent bids;
- auction settlement idempotency.

## Integration Tests

Key flows:

```text
signup → profile → Hidden World
```

```text
Wanted → interest → accepted match
```

```text
Quest → submission → approval → FLOW
```

```text
Auction → competing bids → settlement
```

## E2E Tests

Use Playwright for critical browser flows.

Do not attempt 100% UI test coverage.

---

# 23. Deployment

## Environments

At minimum:

```text
local
staging
production
```

Separate Supabase environments/projects are preferred for staging and production once real users are involved.

## Secrets

Store privileged server credentials only in Cloudflare secrets/environment bindings.

Never expose privileged Supabase credentials to the browser.

## Database Migrations

All schema changes must exist as migrations committed to Git.

Do not make undocumented production-only schema changes from the dashboard.

---

# 24. Suggested Build Order Inside Each Stage

For every stage use the same implementation sequence:

```text
1. Confirm product flow
2. Define database schema
3. Write migration
4. Add RLS policies
5. Add DB functions / constraints where required
6. Build server command layer
7. Build UI
8. Add admin controls
9. Add analytics events
10. Test with real users
11. Decide whether next milestone is justified
```

Do not start the next stage only because the previous stage is technically finished.

Start the next stage only when the previous product hypothesis is supported by real usage.

---

# 25. Recommended MVP Scope

The recommended first real launch is **Stages 0–2 only**.

That means the first version contains:

```text
✓ Login
✓ Founder profiles
✓ Hidden Worlds
✓ People discovery
✓ Search
✓ Wanted
✓ Offer
✓ Interest
✓ Match
✓ Manual curator suggestions
✓ Basic admin panel

✗ FLOW
✗ Quest economy
✗ Auction
✗ Guild system
✗ AI matching
✗ Internal messaging
✗ Public leaderboard
```

This is deliberately much smaller than the current full wireframe concept.

It is enough to test the key question:

> Can this product create meaningful real-world interactions between classmates who would otherwise not connect?

If the answer is yes, continue to Stage 3.

If the answer is no, adding FLOW, Auctions, or Guilds will not fix the underlying product.

---

# 26. Milestone Summary

| Milestone | Core Question | Main Deliverable | Complexity |
|---|---|---|---|
| Stage 0 | Can users securely enter the Republic? | Auth + profile foundation | Low |
| Stage 1 | Will people discover surprising things about classmates? | Founder Dossiers + Hidden Worlds | Low |
| Stage 2 | Can discovery turn into actual connections? | Wanted + Offer + Match | Medium |
| Stage 3 | Can real interactions create community culture? | Chronicle | Medium |
| Stage 4 | Can community contribution support a meaningful economy? | Quest + FLOW Ledger | High |
| Stage 5 | Can FLOW unlock scarce experiences? | Auction | High |
| Stage 6 | Do persistent contribution communities emerge? | Guilds | Medium |
| Stage 7 | Is there enough data to automate discovery? | AI matching | High / optional |

---

# 27. Product Kill / Simplification Rules

The project should actively remove features that do not create real connections.

Examples:

- If Guilds are not used, reduce them to tags/categories.
- If users prefer WhatsApp after matching, do not build chat.
- If FLOW feels artificial, keep Quest recognition but postpone the currency.
- If Auctions feel forced, use curated lotteries or invitations instead.
- If AI suggestions are worse than curator suggestions, keep manual curation.
- If users do not write Chronicles, let admins interview participants and create them manually.

The product should adapt to the community rather than force the community to adapt to the game system.

---

# 28. Definition of Success

The strongest success signal is not DAU.

A successful first semester would look like:

- classmates discover unexpected dimensions of one another;
- members meet people outside their normal friend groups;
- Wanted and Offer create real conversations;
- participants can point to interactions that would probably not have happened otherwise;
- the product develops a shared class culture without becoming mandatory homework.

The long-term vision can remain a "Republic without borders," but the first engineering objective is much simpler:

> **Make it easier for 58 interesting people in one MBA class to genuinely discover and connect with one another.**

That goal should remain the primary decision filter for every feature and every milestone.
