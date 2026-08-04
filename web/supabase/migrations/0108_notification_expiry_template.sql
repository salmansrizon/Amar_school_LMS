-- 0108_notification_expiry_template.sql
-- #271 / #267 cutover: the subscription-expiry sweep now publishes a
-- SubscriptionExpiringSoon domain event whose notification consumer delivers the
-- owner an in-app inbox notice. Seed its bn/en template + the event→channel map
-- row. Additive: the existing SMS + activity-feed reminder are untouched, and the
-- absence StudentAbsenceStreak event's SMS channel stays deferred (no template
-- here) because guardians are not app users.

insert into public.notification_templates (key, title, body) values
  ('subscription_expiring',
   '{"bn":"সাবস্ক্রিপশন শীঘ্রই শেষ হচ্ছে","en":"Subscription expiring soon"}',
   '{"bn":"{{school}} এর সাবস্ক্রিপশন {{expiresOn}} তারিখে শেষ হবে। বিঘ্ন এড়াতে নবায়ন করুন।","en":"{{school}}''s subscription expires on {{expiresOn}}. Please renew to avoid interruption."}')
on conflict (key) do nothing;

insert into public.notification_channel_map (event_type, channel, template_key) values
  ('SubscriptionExpiringSoon', 'in_app', 'subscription_expiring')
on conflict (event_type, channel) do nothing;
