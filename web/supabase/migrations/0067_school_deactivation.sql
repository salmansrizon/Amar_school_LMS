-- 0067_school_deactivation.sql
-- School lifecycle block flag (issue #161, map #158). `deactivated_at` is an
-- explicit hard-block switch, separate from subscription expiry: an expired
-- school still logs in but is gated read-time (#169), whereas a deactivated
-- school is denied login entirely. Manual admin switch only — the expiry cron
-- (#163) never writes it.
--
-- Delete is already covered by the existing "super admin manages schools"
-- FOR ALL policy (0001); no separate delete policy is needed. Child tables
-- reference schools with ON DELETE CASCADE, so a super-admin delete cascades.

alter table public.schools
  add column deactivated_at timestamptz;

-- Owner/staff can read their own school (0001 "members read own school"), so
-- the login gate can see this flag without a security-definer helper.
