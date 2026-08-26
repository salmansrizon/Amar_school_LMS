-- 0147_student_fees.sql
-- Map #434 / ticket #453: what a Student sees about their family's money.
--
-- Bound by ADR 0015. fee_collection_records.adjust_amount is labelled
-- ছাড়/বৃত্তি and carries two different things in one column — a scholarship the
-- child earned, and a hardship waiver the family had to ask for. Nothing
-- distinguishes them, so the portal has to assume the second reading.
--
-- Hence a definer view with the adjustment ABSENT rather than a policy on the
-- table with a careful select list: absent means no future select('*') can put
-- it back.
drop view if exists public.student_fee_record;
create view public.student_fee_record with (security_invoker = off, security_barrier = true) as
  select f.id,
         f.month,
         f.year,
         f.pay_amount,
         f.fine_amount,
         f.due_amount,
         f.payment_method,
         f.updated_at
    from public.fee_collection_records f
    join public.students me
      on me.id = f.student_id
     and me.profile_id = auth.uid()
     and me.archived_at is null;

grant select on public.student_fee_record to authenticated;

-- fee_structures is NOT opened, and that is load-bearing rather than an
-- oversight: a Student who can see "Class 9 monthly fee 3,000" next to their
-- own 1,000 bill has been told about the waiver by subtraction. ADR 0015 names
-- this as the constraint that makes the whole decision hold.
