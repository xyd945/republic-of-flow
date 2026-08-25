-- Republic of FLOW — close the last member-facing direct writes
--
-- RUN THIS ONLY AFTER THE 00008 CLIENT IS DEPLOYED TO PRODUCTION.
--
-- 00008 was deliberately additive so it could be applied at any time. This one
-- takes capabilities away, and production code that still expects them breaks
-- the moment it runs. That has now happened twice — 00006 broke the We-met
-- button, 00007 broke adding a Hidden World, both silently — so the order is:
--
--   1. apply 00008           (additive, safe whenever)
--   2. merge and deploy the client that calls raise_interest()
--   3. apply this file
--
-- market_interests joins two members, so by the rule the rest of this schema
-- settled on, it should never be written directly. accept_interest() and
-- decline_interest() already own the verdict; raise_interest() in 00008
-- replaced the insert; dismatch() hands a request back to pending. Nothing in
-- the app writes this table directly any more.

-- ============================================
-- Privileges
--
-- Two statements where one should do. Per the PostgreSQL documentation,
-- "when revoking privileges on a table, the corresponding column privileges
-- (if any) are automatically revoked on each column of the table, as well" --
-- so the table-level revoke should already remove 00002's `grant update
-- (status)`. Naming the column grant explicitly costs nothing and removes any
-- doubt about whether that cascade behaved as documented on this server.
-- ============================================
revoke update (status)             on market_interests from anon, authenticated;
revoke insert, update, delete      on market_interests from anon, authenticated;

-- ============================================
-- Policies
--
-- All three go, for the reason given in 00006: a permissive rule left behind
-- is an invitation for some future grant to quietly reopen what this closes.
--
-- interests_update_owner is the one that matters most, and the one easiest to
-- overlook -- it let the listing owner set ANY status, and carried an
-- `or is_curator()` besides. With the grant gone it is already inert, but
-- inert is not the same as absent.
-- ============================================
drop policy if exists "interests_insert"       on market_interests;
drop policy if exists "interests_update_own"   on market_interests;
drop policy if exists "interests_update_owner" on market_interests;
