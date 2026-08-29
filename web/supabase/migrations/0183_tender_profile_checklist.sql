-- Create a blocked tender profile with the complete evidence checklist. The
-- profile cannot imply approval until a buyer document is supplied.

create or replace function public.government_tender_profile_create(
  p_procuring_entity text,
  p_tender_reference text,
  p_document_version text default null,
  p_document_date date default null,
  p_submission_deadline timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare profile_id uuid; area text;
begin
  if public.app_current_role() <> 'super_admin' then raise exception 'not authorized'; end if;
  if coalesce(length(trim(p_procuring_entity)), 0) = 0
     or coalesce(length(trim(p_tender_reference)), 0) = 0 then
    raise exception 'procuring entity and tender reference are required';
  end if;

  insert into public.government_tender_profiles
    (procuring_entity, tender_reference, document_version, document_date, submission_deadline)
  values (trim(p_procuring_entity), trim(p_tender_reference), p_document_version,
    p_document_date, p_submission_deadline)
  returning id into profile_id;

  foreach area in array array[
    'supplier eligibility', 'scope and acceptance', 'language and accessibility',
    'hosting and data handling', 'security and privacy', 'availability and DR',
    'SLA and support', 'implementation and training', 'warranty and acceptance',
    'pricing and payment', 'data export and exit', 'submission administration'
  ] loop
    insert into public.government_tender_evidence (profile_id, evidence_area)
    values (profile_id, area);
  end loop;
  return profile_id;
end;
$$;

grant execute on function public.government_tender_profile_create(text, text, text, date, timestamptz)
  to authenticated, service_role;
