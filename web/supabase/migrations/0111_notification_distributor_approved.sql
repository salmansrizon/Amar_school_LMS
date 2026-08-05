-- 0111_notification_distributor_approved.sql
-- #287: seed the template + channel map for the DistributorApproved → distributor
-- in-app notification consumer. Additive + idempotent.

insert into public.notification_templates (key, title, body) values
  ('distributor_approved',
   '{"bn":"অ্যাকাউন্ট অনুমোদিত","en":"Account approved"}',
   '{"bn":"আপনার ডিস্ট্রিবিউটর অ্যাকাউন্ট অনুমোদিত হয়েছে। এখন আপনি পোর্টাল ব্যবহার করতে পারবেন।","en":"Your distributor account is approved. You can now use the portal."}')
on conflict (key) do nothing;

insert into public.notification_channel_map (event_type, channel, template_key) values
  ('DistributorApproved', 'in_app', 'distributor_approved')
on conflict (event_type, channel) do nothing;
