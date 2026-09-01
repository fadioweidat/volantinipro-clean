-- FASE B — Provisioning Fornitore self-service.
--
-- Gap: dopo 20260830160000 il ruolo 'supplier' e la tabella supplier_profiles
-- esistono, ma NIENTE crea una riga o promuove profiles.role: un'email nuova
-- che apre "Area Fornitore" resta bloccata su "non registrato come fornitore".
--
-- supplier_apply(): l'utente autenticato crea la PROPRIA candidatura fornitore.
--  * auth.uid() obbligatorio
--  * crea supplier_profiles SOLO se non esiste (idempotente: se esiste,
--    aggiorna solo i campi anagrafici, MAI lo status)
--  * status iniziale SEMPRE 'pending' — la funzione non puo' impostare
--    'verified'/'suspended'/'rejected' (quello resta admin_set_supplier_status)
--  * promuove profiles.role da 'client' a 'supplier' (mai tocca 'admin'/'staff')
--  * validazione server-side dei campi
--  * SECURITY DEFINER + search_path bloccato + REVOKE public/anon + GRANT authenticated
--
-- Il trigger protect_profile_authorization_fields (baseline) consente il
-- cambio di profiles.role solo a current_user in (postgres, supabase_admin,
-- service_role): dentro questa funzione SECURITY DEFINER di proprieta' postgres
-- current_user = 'postgres', quindi l'UPDATE del ruolo passa il trigger.

create or replace function public.supplier_apply(
  p_company_name text,
  p_contact_name text default null,
  p_phone text default null,
  p_vat_number text default null,
  p_coverage_areas text[] default null,
  p_services text[] default null
) returns public.supplier_profiles
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_company text := nullif(btrim(p_company_name), '');
  v_row public.supplier_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NON_AUTENTICATO' using errcode = '42501';
  end if;
  if v_company is null or char_length(v_company) < 2 then
    raise exception 'RAGIONE_SOCIALE_OBBLIGATORIA' using errcode = '22023';
  end if;
  if char_length(v_company) > 200 then
    raise exception 'RAGIONE_SOCIALE_TROPPO_LUNGA' using errcode = '22023';
  end if;
  if p_phone is not null and char_length(btrim(p_phone)) > 40 then
    raise exception 'TELEFONO_NON_VALIDO' using errcode = '22023';
  end if;
  if p_vat_number is not null and char_length(btrim(p_vat_number)) > 40 then
    raise exception 'PARTITA_IVA_NON_VALIDA' using errcode = '22023';
  end if;

  -- profiles deve esistere (FK supplier_profiles.id -> profiles.id). Di norma
  -- l'ha gia' creato handle_new_user; difesa in profondita' se mancasse.
  insert into public.profiles (id, role) values (v_uid, 'client')
  on conflict (id) do nothing;

  select email into v_email from auth.users where id = v_uid;

  select * into v_row from public.supplier_profiles where id = v_uid;
  if found then
    -- Idempotente: NON tocca status/verified_*/admin_notes/public_code.
    -- Un fornitore gia' 'verified' che richiama non torna 'pending'.
    update public.supplier_profiles set
      company_name   = coalesce(v_company, company_name),
      contact_name   = coalesce(nullif(btrim(p_contact_name), ''), contact_name),
      phone          = coalesce(nullif(btrim(p_phone), ''), phone),
      vat_number     = coalesce(nullif(btrim(p_vat_number), ''), vat_number),
      email          = coalesce(email, v_email),
      coverage_areas = coalesce(p_coverage_areas, coverage_areas),
      services       = coalesce(p_services, services),
      updated_at     = now()
    where id = v_uid
    returning * into v_row;
  else
    insert into public.supplier_profiles
      (id, company_name, contact_name, phone, vat_number, email, status, coverage_areas, services)
    values
      (v_uid, v_company,
       nullif(btrim(p_contact_name), ''),
       nullif(btrim(p_phone), ''),
       nullif(btrim(p_vat_number), ''),
       v_email,
       'pending',
       coalesce(p_coverage_areas, '{}'::text[]),
       coalesce(p_services, '{}'::text[]))
    returning * into v_row;
  end if;

  -- Promozione ruolo: solo 'client' -> 'supplier'. Mai degradare admin/staff.
  update public.profiles
    set role = 'supplier', updated_at = now()
  where id = v_uid and role = 'client';

  return v_row;
end;
$$;

alter function public.supplier_apply(text, text, text, text, text[], text[]) owner to postgres;
revoke all on function public.supplier_apply(text, text, text, text, text[], text[]) from public, anon;
grant execute on function public.supplier_apply(text, text, text, text, text[], text[]) to authenticated;

comment on function public.supplier_apply(text, text, text, text, text[], text[]) is
  'Candidatura fornitore self-service dell''utente autenticato: crea supplier_profiles (status pending) se assente + promuove profiles.role client->supplier. Idempotente, non puo'' impostare verified.';
