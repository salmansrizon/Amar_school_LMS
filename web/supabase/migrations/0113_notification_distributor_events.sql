-- 0113_notification_distributor_events.sql
-- #306: templates + channel map for the CommissionCalculated / SettlementCompleted
-- → distributor in-app notifications. Additive + idempotent.

insert into public.notification_templates (key, title, body) values
  ('commission_accrued',
   '{"bn":"নতুন কমিশন","en":"Commission accrued"}',
   '{"bn":"আপনার অ্যাকাউন্টে {{amount}} কমিশন যোগ হয়েছে।","en":"{{amount}} commission has been accrued to your account."}'),
  ('settlement_paid',
   '{"bn":"সেটেলমেন্ট পরিশোধিত","en":"Settlement paid"}',
   '{"bn":"আপনার {{amount}} সেটেলমেন্ট অনুমোদিত ও পরিশোধিত হয়েছে।","en":"Your settlement of {{amount}} has been approved and paid."}')
on conflict (key) do nothing;

insert into public.notification_channel_map (event_type, channel, template_key) values
  ('CommissionCalculated', 'in_app', 'commission_accrued'),
  ('SettlementCompleted', 'in_app', 'settlement_paid')
on conflict (event_type, channel) do nothing;
