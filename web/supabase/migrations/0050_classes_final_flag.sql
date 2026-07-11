-- Exams III (issue #32) follow-up, per Spec review: the Promotion & Roll
-- Transfer screen's "Make Old" / graduating-batch action (promotion-transfer.html)
-- was ungated — any exam's passed students could be archived, not just a
-- genuine graduating/terminal class's. classes (issue #26, migration
-- 0022_class_curriculum.sql) has no such marker at all; this adds the
-- smallest one. Additive only.
alter table public.classes add column is_final_class boolean not null default false;
