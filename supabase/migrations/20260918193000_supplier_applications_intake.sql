-- Migration: 20260918193000_supplier_applications_intake.sql
-- Purpose: Supplier applications staging architecture.
-- Provides public intake via submit_public_supplier_application RPC and atomic claim on auth via claim_supplier_application.
-- Preserves supplier_profiles as canonical authenticated-only registry.

begin;

-- 1. Intake table for public applications
create table if not exists public.supplier_applications (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text not null,
  phone text,
  vat_number text,
  coverage_areas text[] not null default '{}'::text[],
  services text[] not null default '{}'::text[],
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'archived')),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_supplier_applications_email
  on public.supplier_applications (lower(btrim(email)));

create index if not exists idx_supplier_applications_status
  on public.supplier_applications (status);

-- 2. RLS & Security
alter table public.supplier_applications enable row level security;
alter table public.supplier_applications force row level security;

-- Revoke direct DML from anon and authenticated
revoke all on public.supplier_applications from anon, authenticated;

-- Admin access policy
drop policy if exists supplier_applications_admin_all on public.supplier_applications;
create policy supplier_applications_admin_all on public.supplier_applications
  for all to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

grant select on public.supplier_applications to authenticated;

-- 3. Public RPC: submit_public_supplier_application
create or replace function public.submit_public_supplier_application(
  p_company_name text,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null,
  p_vat_number text default null,
  p_coverage_areas text[] default null,
  p_services text[] default null,
  p_notes text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_company text := nullif(btrim(p_company_name), '');
  v_contact text := nullif(btrim(p_contact_name), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_vat text := nullif(btrim(p_vat_number), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_existing_app_id uuid;
  v_existing_app_status text;
  v_app_id uuid;
  v_supplier_profile_exists boolean;
begin
  -- Server-side validations
  if v_company is null or char_length(v_company) < 2 then
    raise exception 'RAGIONE_SOCIALE_OBBLIGATORIA' using errcode = '22023';
  end if;
  if char_length(v_company) > 200 then
    raise exception 'RAGIONE_SOCIALE_TROPPO_LUNGA' using errcode = '22023';
  end if;
  if v_email is null or v_email = '' or position('@' in v_email) = 0 or position('.' in v_email) = 0 then
    raise exception 'EMAIL_NON_VALIDA' using errcode = '22023';
  end if;
  if char_length(v_email) > 255 then
    raise exception 'EMAIL_TROPPO_LUNGA' using errcode = '22023';
  end if;
  if v_phone is not null and (char_length(v_phone) < 5 or char_length(v_phone) > 40) then
    raise exception 'TELEFONO_NON_VALIDO' using errcode = '22023';
  end if;
  if v_vat is not null and char_length(v_vat) > 40 then
    raise exception 'PARTITA_IVA_NON_VALIDA' using errcode = '22023';
  end if;

  -- Check if supplier is already registered in supplier_profiles
  select exists (
    select 1 from public.supplier_profiles sp
    left join auth.users u on u.id = sp.id
    where lower(btrim(coalesce(u.email, ''))) = v_email
       or lower(btrim(coalesce(sp.email, ''))) = v_email
  ) into v_supplier_profile_exists;

  if v_supplier_profile_exists then
    return jsonb_build_object(
      'status', 'already_registered',
      'message', 'Fornitore già registrato nel sistema.'
    );
  end if;

  -- Check existing intake application
  select id, status into v_existing_app_id, v_existing_app_status
  from public.supplier_applications
  where lower(btrim(email)) = v_email
  order by created_at desc
  limit 1;

  if v_existing_app_id is not null and v_existing_app_status = 'pending' then
    -- Idempotent update of existing pending application
    update public.supplier_applications
    set company_name = v_company,
        contact_name = coalesce(v_contact, contact_name),
        phone = coalesce(v_phone, phone),
        vat_number = coalesce(v_vat, vat_number),
        coverage_areas = coalesce(p_coverage_areas, coverage_areas),
        services = coalesce(p_services, services),
        notes = coalesce(v_notes, notes),
        updated_at = now()
    where id = v_existing_app_id
    returning id into v_app_id;

    return jsonb_build_object(
      'application_id', v_app_id,
      'status', 'updated',
      'message', 'Candidatura aggiornata con successo.'
    );
  elsif v_existing_app_id is not null and v_existing_app_status = 'claimed' then
    return jsonb_build_object(
      'application_id', v_existing_app_id,
      'status', 'already_claimed',
      'message', 'Candidatura già associata a un account.'
    );
  else
    -- Insert new pending application
    insert into public.supplier_applications (
      company_name, contact_name, email, phone, vat_number,
      coverage_areas, services, notes, status
    ) values (
      v_company, v_contact, v_email, v_phone, v_vat,
      coalesce(p_coverage_areas, '{}'::text[]),
      coalesce(p_services, '{}'::text[]),
      v_notes, 'pending'
    )
    returning id into v_app_id;

    return jsonb_build_object(
      'application_id', v_app_id,
      'status', 'created',
      'message', 'Candidatura registrata in attesa di verifica.'
    );
  end if;
end;
$$;

alter function public.submit_public_supplier_application(text, text, text, text, text, text[], text[], text) owner to postgres;
revoke all on function public.submit_public_supplier_application(text, text, text, text, text, text[], text[], text) from public;
grant execute on function public.submit_public_supplier_application(text, text, text, text, text, text[], text[], text) to anon, authenticated;

-- 4. Authenticated RPC: claim_supplier_application
create or replace function public.claim_supplier_application()
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_app record;
  v_sp public.supplier_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NON_AUTENTICATO' using errcode = '42501';
  end if;

  select lower(btrim(email)) into v_email
  from auth.users
  where id = v_uid;

  if v_email is null or v_email = '' then
    raise exception 'EMAIL_UTENTE_NON_TROVATA' using errcode = '22023';
  end if;

  -- Ensure public.profiles exists
  insert into public.profiles (id, role)
  values (v_uid, 'client')
  on conflict (id) do nothing;

  -- Find pending application for this email
  select * into v_app
  from public.supplier_applications
  where lower(btrim(email)) = v_email
    and status = 'pending'
  order by created_at desc
  limit 1;

  if v_app.id is not null then
    -- Upsert supplier_profile
    insert into public.supplier_profiles (
      id, company_name, contact_name, phone, vat_number, email,
      status, coverage_areas, services
    ) values (
      v_uid,
      v_app.company_name,
      v_app.contact_name,
      v_app.phone,
      v_app.vat_number,
      v_email,
      'pending',
      coalesce(v_app.coverage_areas, '{}'::text[]),
      coalesce(v_app.services, '{}'::text[])
    )
    on conflict (id) do update set
      company_name = coalesce(excluded.company_name, supplier_profiles.company_name),
      contact_name = coalesce(excluded.contact_name, supplier_profiles.contact_name),
      phone = coalesce(excluded.phone, supplier_profiles.phone),
      vat_number = coalesce(excluded.vat_number, supplier_profiles.vat_number),
      email = coalesce(excluded.email, supplier_profiles.email),
      coverage_areas = coalesce(excluded.coverage_areas, supplier_profiles.coverage_areas),
      services = coalesce(excluded.services, supplier_profiles.services),
      updated_at = now()
    returning * into v_sp;

    -- Mark application as claimed
    update public.supplier_applications
    set status = 'claimed',
        claimed_by = v_uid,
        claimed_at = now(),
        updated_at = now()
    where id = v_app.id;

    -- Promote profile role to 'supplier' (if 'client')
    update public.profiles
    set role = 'supplier', updated_at = now()
    where id = v_uid and role = 'client';

    return jsonb_build_object(
      'claimed', true,
      'application_id', v_app.id,
      'supplier_id', v_sp.id,
      'company_name', v_sp.company_name,
      'status', v_sp.status
    );
  else
    -- If no pending application found, check if supplier_profile already exists
    select * into v_sp from public.supplier_profiles where id = v_uid;
    if v_sp.id is not null then
      return jsonb_build_object(
        'claimed', false,
        'already_registered', true,
        'supplier_id', v_sp.id,
        'company_name', v_sp.company_name,
        'status', v_sp.status
      );
    end if;

    return jsonb_build_object(
      'claimed', false,
      'message', 'Nessuna candidatura in attesa trovata per questa email.'
    );
  end if;
end;
$$;

alter function public.claim_supplier_application() owner to postgres;
revoke all on function public.claim_supplier_application() from public, anon;
grant execute on function public.claim_supplier_application() to authenticated;

commit;
