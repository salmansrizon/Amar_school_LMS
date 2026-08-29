-- 0110_demo_partner_data.sql
-- #271: seed demo data so the new surfaces render populated on staging — the
-- distributor + agent apps and the super-admin partner/financial/workflow pages.
-- Idempotent (fixed UUIDs + ON CONFLICT), additive only (shared staging+main DB).
--   Distributor login: demo.distributor@amarschool.test / DemoDist#2026
--   Agent login:       demo.agent@amarschool.test       / DemoAgent#2026
-- Fixed identifiers reuse the 0054/0066 demo school + super-admin.
--   school   dab00000-0000-4000-a000-000000000001
--   super    dab00000-0000-4000-a000-000000000050
--   distrib  dab00000-0000-4000-a000-000000000060
--   agent    dab00000-0000-4000-a000-000000000061

-- 1. Auth users (distributor + agent)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'dab00000-0000-4000-a000-000000000060',
   'authenticated', 'authenticated', 'demo.distributor@amarschool.test',
   crypt('DemoDist#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Dhaka North Distributor"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dab00000-0000-4000-a000-000000000061',
   'authenticated', 'authenticated', 'demo.agent@amarschool.test',
   crypt('DemoAgent#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Field Agent Nabil"}',
   now(), now(), '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('dab00000-0000-4000-a000-0000000000c0', 'dab00000-0000-4000-a000-000000000060',
   'dab00000-0000-4000-a000-000000000060',
   jsonb_build_object('sub','dab00000-0000-4000-a000-000000000060','email','demo.distributor@amarschool.test'),
   'email', now(), now(), now()),
  ('dab00000-0000-4000-a000-0000000000c1', 'dab00000-0000-4000-a000-000000000061',
   'dab00000-0000-4000-a000-000000000061',
   jsonb_build_object('sub','dab00000-0000-4000-a000-000000000061','email','demo.agent@amarschool.test'),
   'email', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, role, school_id, full_name) values
  ('dab00000-0000-4000-a000-000000000060', 'distributor', null, 'Dhaka North Distributor'),
  ('dab00000-0000-4000-a000-000000000061', 'agent',       null, 'Field Agent Nabil')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

-- 2. Distributor profile + agent assignment
insert into public.distributor_profiles (profile_id, trade_license, nid, agreement_status, agreement_signed_at, status)
values ('dab00000-0000-4000-a000-000000000060', 'TL-DHK-2291', '1990123456789', 'accepted', now() - interval '40 days', 'approved')
on conflict (profile_id) do update set status = excluded.status, agreement_status = excluded.agreement_status;

insert into public.agent_assignments (agent_id, distributor_id)
values ('dab00000-0000-4000-a000-000000000061', 'dab00000-0000-4000-a000-000000000060')
on conflict (agent_id) do nothing;

-- 3. CRM leads across the pipeline
insert into public.leads (id, distributor_id, school_name, contact_name, contact_phone, stage, notes) values
  ('dab00000-0000-4000-a000-000000000070', 'dab00000-0000-4000-a000-000000000060', 'Green Valley School',   'Mr. Hasan',  '01710000001', 'new',         'Inbound from fair.'),
  ('dab00000-0000-4000-a000-000000000071', 'dab00000-0000-4000-a000-000000000060', 'Riverside Academy',     'Ms. Farah',  '01710000002', 'contacted',   'Called, wants a demo next week.'),
  ('dab00000-0000-4000-a000-000000000072', 'dab00000-0000-4000-a000-000000000060', 'Hilltop Model School',  'Mr. Karim',  '01710000003', 'demo',        'Demo scheduled.'),
  ('dab00000-0000-4000-a000-000000000073', 'dab00000-0000-4000-a000-000000000060', 'Sunflower Kindergarten','Ms. Nadia',  '01710000004', 'negotiation', 'Discussing the Standard plan price.'),
  ('dab00000-0000-4000-a000-000000000074', 'dab00000-0000-4000-a000-000000000060', 'Adarsha Model School',  'Mr. Rahim',  '01710000005', 'won',         'Signed. Onboarding.'),
  ('dab00000-0000-4000-a000-000000000075', 'dab00000-0000-4000-a000-000000000060', 'Old Town School',       'Mr. Jamil',  '01710000006', 'lost',        'Chose a competitor.')
on conflict (id) do nothing;

-- 4. Partner tasks (assigned to the agent)
insert into public.partner_tasks (id, distributor_id, assignee_id, title, status, due_at) values
  ('dab00000-0000-4000-a000-000000000080', 'dab00000-0000-4000-a000-000000000060', 'dab00000-0000-4000-a000-000000000061', 'Visit Green Valley School',        'open', now() + interval '2 days'),
  ('dab00000-0000-4000-a000-000000000081', 'dab00000-0000-4000-a000-000000000060', 'dab00000-0000-4000-a000-000000000061', 'Collect trade license copy',       'open', now() + interval '5 days'),
  ('dab00000-0000-4000-a000-000000000082', 'dab00000-0000-4000-a000-000000000060', 'dab00000-0000-4000-a000-000000000061', 'Deliver device to Riverside',      'open', now() - interval '1 day'),
  ('dab00000-0000-4000-a000-000000000083', 'dab00000-0000-4000-a000-000000000060', 'dab00000-0000-4000-a000-000000000061', 'Onboarding walkthrough — Adarsha', 'done', now() - interval '3 days')
on conflict (id) do nothing;

-- 5. Wallets + ledger (distributor commission balance + a school SMS balance).
-- A school_sms wallet may already exist (unique wallet_type+owner_school_id), so
-- resolve wallets by lookup and target their ledger rather than a fixed id.
insert into public.wallets (id, wallet_type, owner_profile_id)
values ('dab00000-0000-4000-a000-000000000090', 'distributor_commission', 'dab00000-0000-4000-a000-000000000060')
on conflict do nothing;

insert into public.wallet_ledger_entries (wallet_id, amount, ref, reason)
select w.id, v.amount, v.ref, v.reason
from public.wallets w
join (values
  (350000::bigint, 'seed-comm-1', 'Commission accrued — Adarsha subscription'),
  (120000::bigint, 'seed-comm-2', 'Commission accrued — SMS pack sale'),
  (-200000::bigint, 'seed-comm-payout-1', 'Settlement payout')
) as v(amount, ref, reason) on true
where w.wallet_type = 'distributor_commission'
  and w.owner_profile_id = 'dab00000-0000-4000-a000-000000000060'
on conflict (wallet_id, ref) do nothing;

insert into public.wallets (wallet_type, owner_school_id)
values ('school_sms', 'dab00000-0000-4000-a000-000000000001')
on conflict do nothing;

insert into public.wallet_ledger_entries (wallet_id, quantity, ref, reason)
select w.id, v.quantity, v.ref, v.reason
from public.wallets w
join (values
  (5000, 'seed-sms-topup', 'SMS package credited'),
  (-320, 'seed-sms-usage-1', 'Absence SMS sent')
) as v(quantity, ref, reason) on true
where w.wallet_type = 'school_sms'
  and w.owner_school_id = 'dab00000-0000-4000-a000-000000000001'
on conflict (wallet_id, ref) do nothing;

-- 6. Coupons
insert into public.discounts (code, scope, discount_type, value, active, expires_at) values
  ('LAUNCH25',  'subscription', 'percent', 25,     true,  now() + interval '60 days'),
  ('FLAT500',   'subscription', 'flat',    50000,  true,  now() + interval '30 days'),
  ('OLDPROMO',  'subscription', 'percent', 10,     false, now() - interval '10 days')
on conflict (code) do nothing;

-- 7. Commissions + settlement
insert into public.commissions (id, distributor_id, stream, source_type, source_id, base_amount, commission_amount, status) values
  ('dab00000-0000-4000-a000-0000000000a0', 'dab00000-0000-4000-a000-000000000060', 'subscription', 'invoice', 'seed-inv-1', 1000000, 100000, 'accrued'),
  ('dab00000-0000-4000-a000-0000000000a1', 'dab00000-0000-4000-a000-000000000060', 'sms',          'sms_pack', 'seed-pack-1', 500000, 25000,  'accrued'),
  ('dab00000-0000-4000-a000-0000000000a2', 'dab00000-0000-4000-a000-000000000060', 'subscription', 'invoice', 'seed-inv-0', 1000000, 100000, 'settled')
on conflict (source_type, source_id, distributor_id) do nothing;

insert into public.settlements (id, distributor_id, period_start, period_end, total_amount, status) values
  ('dab00000-0000-4000-a000-0000000000b0', 'dab00000-0000-4000-a000-000000000060', date_trunc('month', now() - interval '1 month')::date, (date_trunc('month', now()) - interval '1 day')::date, 100000, 'approved')
on conflict (id) do nothing;

-- 8. Invoices + payment (school-facing billing)
insert into public.invoices (id, number, school_id, status, income_account, subtotal_amount, tax_amount, total_amount, memo, due_at) values
  ('dab00000-0000-4000-a000-0000000000d0', 'INV-DEMO-0001', 'dab00000-0000-4000-a000-000000000001', 'paid',   '4000', 1000000, 0, 1000000, 'Monthly subscription', now() - interval '20 days'),
  ('dab00000-0000-4000-a000-0000000000d1', 'INV-DEMO-0002', 'dab00000-0000-4000-a000-000000000001', 'issued', '4000', 1000000, 0, 1000000, 'Monthly subscription', now() + interval '10 days')
on conflict (id) do nothing;

insert into public.invoice_lines (id, invoice_id, description, quantity, unit_amount, amount) values
  ('dab00000-0000-4000-a000-0000000000d2', 'dab00000-0000-4000-a000-0000000000d0', 'Standard plan — 1 month', 1, 1000000, 1000000),
  ('dab00000-0000-4000-a000-0000000000d3', 'dab00000-0000-4000-a000-0000000000d1', 'Standard plan — 1 month', 1, 1000000, 1000000)
on conflict (id) do nothing;

insert into public.payments (id, invoice_id, amount, method, status, reference) values
  ('dab00000-0000-4000-a000-0000000000d4', 'dab00000-0000-4000-a000-0000000000d0', 1000000, 'bkash', 'confirmed', 'TRX-DEMO-001')
on conflict (id) do nothing;

-- 9. General ledger — one balanced subscription-income entry (trial balance page)
insert into public.gl_entries (id, ref, memo, school_id) values
  ('dab00000-0000-4000-a000-0000000000f0', 'seed-gl-sub-1', 'Subscription income — Adarsha', 'dab00000-0000-4000-a000-000000000001')
on conflict (id) do nothing;
insert into public.gl_lines (id, entry_id, account_code, debit, credit) values
  ('dab00000-0000-4000-a000-0000000000f1', 'dab00000-0000-4000-a000-0000000000f0', '1000', 1000000, 0),
  ('dab00000-0000-4000-a000-0000000000f2', 'dab00000-0000-4000-a000-0000000000f0', '4000', 0, 1000000)
on conflict (id) do nothing;

-- 10. Workflow instance in the approvals inbox
insert into public.workflow_instances (id, definition_key, school_id, initiator_id, entity_type, entity_id, status, current_seq, payload) values
  ('dab00000-0000-4000-a000-0000000000e0', 'distributor_onboarding', null, 'dab00000-0000-4000-a000-000000000050', 'distributor_profile', 'dab00000-0000-4000-a000-000000000060', 'in_progress', 1, '{"note":"Awaiting super-admin approval"}')
on conflict (id) do nothing;

-- 11. Audit log + domain events (audit viewer + job monitor)
insert into public.audit_log (id, actor_id, school_id, entity_type, entity_id, action) values
  ('dab00000-0000-4000-a000-0000000000e1', 'dab00000-0000-4000-a000-000000000050', null, 'distributor_profile', 'dab00000-0000-4000-a000-000000000060', 'approve'),
  ('dab00000-0000-4000-a000-0000000000e2', 'dab00000-0000-4000-a000-000000000050', null, 'discount', 'LAUNCH25', 'create'),
  ('dab00000-0000-4000-a000-0000000000e3', 'dab00000-0000-4000-a000-000000000050', 'dab00000-0000-4000-a000-000000000001', 'invoice', 'INV-DEMO-0001', 'configure')
on conflict (id) do nothing;

insert into public.domain_events (id, type, school_id, payload, dispatched_at, attempts) values
  ('dab00000-0000-4000-a000-0000000000e4', 'SubscriptionActivated', 'dab00000-0000-4000-a000-000000000001', '{}', now() - interval '20 days', 1),
  ('dab00000-0000-4000-a000-0000000000e5', 'InvoicePaid',           'dab00000-0000-4000-a000-000000000001', '{"number":"INV-DEMO-0001"}', now() - interval '20 days', 1),
  ('dab00000-0000-4000-a000-0000000000e6', 'SubscriptionExpiringSoon', 'dab00000-0000-4000-a000-000000000001', '{}', null, 0)
on conflict (id) do nothing;
