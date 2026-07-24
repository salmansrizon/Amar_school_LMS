-- Multi-tenant T1 (issue #108, map #104): per-school subdomain + owner-claim codes.
-- Admin-only provisioning model (#107): super-admin pre-creates a school and mints
-- a claim code; a signed-up owner redeems it, picking their subdomain atomically.
-- No auth users are created server-side (no service-role key).

-- Slug rules mirrored from web/lib/subdomain.ts (single source of truth for the UI).
-- lowercase a-z0-9-, length 3-63, no leading/trailing/double hyphen, reserved-word
-- rejection covering infra hosts + every top-level app route segment.
create function public.is_valid_subdomain(slug text) returns boolean
language sql immutable set search_path = public as $$
  select slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     and slug !~ '--'
     and char_length(slug) between 3 and 63
     and slug <> all (array[
       'admin','api','app','assets','auth','blog','cdn','dealer','dev','docs',
       'gov','help','login','mail','preview','reset-password','school','signup',
       'staging','static','status','super-admin','support','vercel','www'
     ])
$$;

alter table public.schools
  add column subdomain text unique
  constraint schools_subdomain_valid
    check (subdomain is null or public.is_valid_subdomain(subdomain));

-- Owner-claim codes, modeled on subscription_codes (0008): a used code is never
-- deleted; redemption binds the redeemer and stamps the time atomically.
create table public.school_claim_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  school_id uuid not null references public.schools (id) on delete cascade,
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users (id),
  redeemed_at timestamptz,
  constraint redeemed_pair check ((redeemed_by is null) = (redeemed_at is null))
);

create index school_claim_codes_school_idx on public.school_claim_codes (school_id);

alter table public.school_claim_codes enable row level security;

-- Super-admin manages codes; redemption runs through the security-definer RPC
-- below, so ordinary owners need no direct table grant.
create policy "super admin reads claim codes" on public.school_claim_codes
  for select using (public.app_current_role() = 'super_admin');
create policy "super admin inserts claim codes" on public.school_claim_codes
  for insert with check (public.app_current_role() = 'super_admin');
create policy "super admin deletes unused claim codes" on public.school_claim_codes
  for delete using (public.app_current_role() = 'super_admin' and redeemed_at is null);

-- Super-admin mints a claim code for a pre-created school.
create function public.generate_school_claim_code(sid uuid) returns public.school_claim_codes
language plpgsql security definer set search_path = public, extensions as $$
declare
  row school_claim_codes%rowtype;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can generate claim codes';
  end if;
  if not exists (select 1 from schools where id = sid) then
    raise exception 'unknown school';
  end if;
  insert into school_claim_codes (code, school_id)
  values (upper(encode(extensions.gen_random_bytes(6), 'hex')), sid)
  returning * into row;
  return row;
end $$;

revoke execute on function public.generate_school_claim_code(uuid) from anon, public;
grant execute on function public.generate_school_claim_code(uuid) to authenticated;

-- A signed-up owner redeems a code: binds auth.uid() as school_owner of the
-- pre-created school AND sets the chosen subdomain (validated, unique) atomically.
-- Reuses register_school's guard: one profile per user.
create function public.redeem_school_claim_code(code_text text, desired_subdomain text)
  returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c school_claim_codes%rowtype;
  slug text := lower(trim(desired_subdomain));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile already exists';
  end if;
  if not public.is_valid_subdomain(slug) then
    raise exception 'invalid subdomain';
  end if;

  select * into c from school_claim_codes where code = upper(code_text) for update;
  if not found then
    raise exception 'invalid code';
  end if;
  if c.redeemed_at is not null then
    raise exception 'code already used';
  end if;

  if exists (select 1 from schools where subdomain = slug) then
    raise exception 'subdomain already taken';
  end if;

  update schools set subdomain = slug where id = c.school_id;
  insert into profiles (id, role, school_id) values (auth.uid(), 'school_owner', c.school_id);
  update school_claim_codes set redeemed_by = auth.uid(), redeemed_at = now() where id = c.id;
  return c.school_id;
end $$;

revoke execute on function public.redeem_school_claim_code(text, text) from anon, public;
grant execute on function public.redeem_school_claim_code(text, text) to authenticated;

-- Anon-safe subdomain → school resolution (issues #109/#110). `schools` RLS
-- blocks anon SELECT, so both proxy.ts routing and the branded login need a
-- security-definer lookup that exposes only the public branding fields.
create function public.school_by_subdomain(slug text)
  returns table (id uuid, name text, logo_path text)
language sql stable security definer set search_path = public as $$
  select id, name, logo_path from schools where subdomain = lower(slug)
$$;

grant execute on function public.school_by_subdomain(text) to anon, authenticated;

-- A school's logo appears on its public, pre-auth branded login, so it is not
-- secret — allow anyone to read objects in the school-logos bucket (0056).
create policy "anyone reads school logos" on storage.objects
  for select using (bucket_id = 'school-logos');
