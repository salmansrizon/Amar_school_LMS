-- 0101_distributor_agreements.sql
-- Distributor legal agreement versioning + acceptance metadata (master_prd.md
-- doc 002: "Every agreement version must be stored ... along with acceptance
-- timestamp, IP address, user identity, and device information"). #271 follow-up.

create table public.agreement_versions (
  version integer primary key,
  body text not null,
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.distributor_agreement_acceptances (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  agreement_version integer not null references public.agreement_versions (version),
  accepted_at timestamptz not null default now(),
  ip text,
  device text,
  unique (distributor_id, agreement_version)
);

alter table public.agreement_versions enable row level security;
alter table public.distributor_agreement_acceptances enable row level security;

create policy "authenticated reads agreement_versions" on public.agreement_versions
  for select using (auth.uid() is not null);
create policy "super admin manages agreement_versions" on public.agreement_versions
  for all using (public.app_current_role() = 'super_admin');

create policy "super admin reads acceptances" on public.distributor_agreement_acceptances
  for select using (public.app_current_role() = 'super_admin');
create policy "distributor reads own acceptances" on public.distributor_agreement_acceptances
  for select using (distributor_id = auth.uid());

insert into public.agreement_versions (version, body) values
  (1, 'Amar School distributor agreement v1 — commission, territory, confidentiality, renewal, termination.')
  on conflict (version) do nothing;

-- The distributor (or system on their behalf) accepts a version; records the
-- legal metadata + flips the profile's agreement status. Audited.
create or replace function public.accept_agreement(
  p_version integer, p_ip text default null, p_device text default null, p_distributor uuid default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare who uuid; a_id uuid;
begin
  who := coalesce(p_distributor, auth.uid());
  -- Only the distributor themselves, or a super/system caller acting for them.
  if not (who = auth.uid() or public.is_super_or_system(job_secret)) then
    raise exception 'not authorized to accept on behalf of another distributor';
  end if;
  if not exists (select 1 from public.agreement_versions where version = p_version) then
    raise exception 'unknown agreement version %', p_version;
  end if;

  insert into public.distributor_agreement_acceptances (distributor_id, agreement_version, ip, device)
  values (who, p_version, p_ip, p_device)
  on conflict (distributor_id, agreement_version) do nothing
  returning id into a_id;

  update public.distributor_profiles
    set agreement_status = 'accepted', agreement_signed_at = now()
    where profile_id = who;

  perform public.record_audit('distributor_agreement', who::text || ':v' || p_version, 'approve',
    null, who, null, jsonb_build_object('version', p_version, 'ip', p_ip, 'device', p_device),
    p_ip, null, null, job_secret);
  return a_id;
end;
$$;
