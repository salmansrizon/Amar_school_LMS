-- Accounting I follow-up (issue #34, PRD §5.6): the optional note field shown
-- on ui/school-owner/fee-collection.html's collection form ("নোট / Note",
-- ঐচ্ছিক/optional). Additive column only — does not touch the
-- one-record-per-student-per-month invariant (0016) or its edit-in-place
-- semantics.

alter table public.fee_collection_records add column note text;
