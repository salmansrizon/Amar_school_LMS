-- "Send SMS from a behaviour record" (issue #46, PRD §5.1). sms_log (0021) only
-- had a school-member SELECT policy — inserts went through the cron job's
-- job-secret RPC because that job runs unauthenticated (anon key, no session).
-- This send is user-triggered with a real session, so a normal RLS INSERT
-- policy scoped to the caller's School is the right fit (matches every other
-- school-owned table), rather than another secret-gated RPC. Additive only.

create policy "school members insert sms log" on public.sms_log
  for insert with check (school_id = public.app_current_school_id());
