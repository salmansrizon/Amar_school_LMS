-- 0169_invoice_number_counters_are_auditable.sql
-- Map #524 / ticket #547, correcting 0168.
--
-- 0168 enabled RLS on invoice_number_counters and wrote no policies, so nothing
-- outside a SECURITY DEFINER function could see it. That is wrong for this table
-- specifically: ADR 0012's reason for gapless numbering is that "an external audit
-- firm can trace every transaction from a printed register back to its source
-- document", and a numbering state no auditor can inspect works against exactly
-- that. The Super Admin already reads every other financial table.
--
-- Writes stay with the Super Admin rather than with nobody: correcting a counter
-- after a restore or a migration is a real operation, and the alternative is doing
-- it as the database owner with no audit trail at all.
create policy "super admin reads invoice counters" on public.invoice_number_counters
  for select using (public.app_current_role() = 'super_admin');

create policy "super admin manages invoice counters" on public.invoice_number_counters
  for all using (public.app_current_role() = 'super_admin')
  with check (public.app_current_role() = 'super_admin');
