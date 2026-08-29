# Changelog

## v0.1.0 — 2026-08-29

First release. The Republic is open to its members — deliberately numbered
0.x, because sign-up is still open and the shape of the thing will move as the
cohort uses it.

A private, invitation-shaped directory for an MBA cohort, built around one
idea: **match, then disappear.** Once two classmates have a reason to talk, the
app hands them to WhatsApp or WeChat and gets out of the way. There is no feed,
no likes, and no reason to linger.

### Members

**Hidden Worlds.** The point of the whole thing. Each member lists the
interests that never reach a résumé, filed under six categories — Craft &
Making, Nature & Outdoors, Mind & People, Building & Tech, Deals & Money, Art &
Culture. Each world can be shown to the cohort or kept private.

**A dossier per member.** Headline, role, personal intro, professional
background, languages, what they can open a door to, and what they want to
discover. Written in whichever language the member prefers and shown to
everyone — a Chinese bio reads the same to an English reader, because these are
one person's words rather than a pair of translations.

**A founder number, earned by arriving.** Assigned on first sign-in, not when
an invitation is sent, so the roster reflects who actually turned up.

**The directory.** Search across names, headlines, intros, hidden worlds and
topics. Filter by cohort — Class 26, Class 27, or Alumni for the years before
them — and by hidden-world category.

**The Flow Market.** Post something you *want* or something you *offer*.
Classmates raise a hand; the owner accepts or declines; an accepted request
becomes a match, and the match carries a next step. A curator can suggest a
particular classmate for a listing, and both sides are told.

**Connect, then leave.** A dossier hands off to WhatsApp, WeChat, email, or
simply "find me in class" — whichever that member chose. The app does not carry
the conversation.

**Notifications** for a raised hand, an acceptance, a decline, and a curator's
suggestion.

**Bilingual throughout**, English and Chinese, switchable anywhere and
remembered.

### Curators

A Curator Desk, reachable only by curators and enforced in the database rather
than the interface: feature a member, deactivate one, assign a cohort, suggest
a classmate for a listing, undo a match, and send invitations.

Curator status itself is deliberately unreachable through the API. Promoting
someone is a deliberate act in SQL.

### Sign-in

Email and a six-digit code. No passwords to lose, and nothing to remember.

### Underneath

Next.js 15 and React 19 on Cloudflare Workers via OpenNext; Supabase Postgres
with row-level security; a pixel-art design system rendered in a phone frame on
desktop and full-bleed on a phone.

**Every read and write is authorised in Postgres, not in the client.** Twelve
migrations, six of which exist only to close authorization holes found by
probing the live database. Sixty-one regression tests keep them closed, each
one a hole that was genuinely open at some point.

Members write their own rows through a single transactional function; a curator
moderates standing through another; and neither can reach what the other owns.

### Known limits

- **Sign-up is open.** The login screen says invitation only, but any email can
  still request a code. Closing it is [#2](https://github.com/xyd945/republic-of-flow/issues/2).
- `is_active` governs directory visibility, not API access — a deactivated
  member can still reach the API directly.
- Deleting an account cascades and destroys that member's founder number.
- Invitation email delivery relies on Supabase's built-in service, which is
  rate-limited; a cohort-sized send needs custom SMTP.
