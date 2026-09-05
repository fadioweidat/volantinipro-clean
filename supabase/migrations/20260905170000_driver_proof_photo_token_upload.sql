-- TICKET — BUG REALE PHOTO CAPTURE FLOW: la Driver App usa l'access_token
-- dell'assignment (link pubblico), NON Magic Link. Ma uploadProofPhoto
-- passava da client.auth.getUser() + insert diretto su proof_photos +
-- policy storage proof_photos_storage_insert_authorized (tutti scoped a
-- auth.uid()): in modalita' token questo dava sempre "Autenticazione
-- Supabase non disponibile." e nessuna foto prova poteva essere caricata.
--
-- FIX additivo, stesso identico pattern gia' funzionante per le foto di
-- verifica segnalazione (issue_verification_photos):
--   - nuovo prefisso storage campaign/<cid>/assignment/<aid>/photo/ con una
--     policy INSERT per anon+authenticated (l'autorizzazione REALE la fa
--     l'RPC sotto, come per issue_photos_storage_insert);
--   - nuova RPC SECURITY DEFINER driver_register_proof_photo che risolve
--     l'assignment via access_token OPPURE auth.uid(), ricava campaign_id e
--     l'identita' del driver server-side, valida il path, e inserisce in
--     proof_photos. session_id = sessione GPS attiva di quell'assignment se
--     esiste, altrimenti null (la foto prova e' legata a
--     campaign/assignment/driver, non richiede una sessione attiva).
--
-- NON tocca: gps_register_proof_photo esistente (flusso autenticato legacy),
-- proof_photos_storage_insert_authorized, GPS tracking, coverage, messaging,
-- Admin auth, pricing, Payments.

begin;

-- Storage: upload consentito ad anon/authenticated SOLO sul prefisso
-- dedicato assignment; l'autorizzazione reale e' in driver_register_proof_
-- photo, che rifiuta di registrare oggetti non collegati a un assignment
-- valido. Gli oggetti orfani non vengono mai referenziati/serviti.
drop policy if exists proof_photos_assignment_storage_insert on storage.objects;
create policy proof_photos_assignment_storage_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'proof-photos'
    and name like 'campaign/%/assignment/%/photo/%'
    and name not like '%..%'
  );

-- SELECT: la policy proof_photos_storage_select_authorized esistente gia'
-- copre questo prefisso (controlla campaigns.user_id = auth.uid() sul
-- segmento 2 = campaign_id del path, oppure gps_is_admin()) — il Cliente
-- proprietario e l'Admin possono gia' firmare l'URL. Nessuna nuova policy
-- SELECT necessaria.

create or replace function public.driver_register_proof_photo(
  p_assignment_id uuid,
  p_storage_path text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_taken_at timestamptz default now(),
  p_note text default null,
  p_access_token text default null
) returns public.proof_photos
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_driver_id uuid;
  v_session_id uuid;
  v_prefix text;
  v_photo public.proof_photos%rowtype;
begin
  -- Risoluzione assignment: auth.uid() se presente, altrimenti access_token
  -- (stesso pattern di driver_register_issue_photo / hub_resolve_driver_
  -- assignment). Mai Magic Link, mai un login Supabase per il Driver.
  if v_uid is not null then
    select * into v_assignment from public.operator_assignments
    where id = p_assignment_id and operator_id = v_uid;
  else
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select * into v_assignment from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
  end if;
  if not found then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;
  if v_assignment.revoked_at is not null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  v_driver_id := coalesce(v_assignment.operator_id, v_assignment.id);

  v_prefix := 'campaign/' || v_assignment.campaign_id::text
    || '/assignment/' || v_assignment.id::text || '/photo/';
  if p_storage_path not like (v_prefix || '%') or p_storage_path like '%..%' then
    raise exception 'PERCORSO_FOTO_NON_VALIDO' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'proof-photos' and o.name = p_storage_path
  ) then
    raise exception 'OGGETTO_FOTO_NON_TROVATO' using errcode = 'P0002';
  end if;

  -- Aggancio opzionale a una sessione GPS attiva dello stesso assignment
  -- (nice-to-have per la timeline); mai obbligatorio.
  select s.id into v_session_id
  from public.delivery_sessions s
  where s.assignment_id = v_assignment.id
    and s.status in ('started', 'paused')
  order by s.created_at desc
  limit 1;

  insert into public.proof_photos (
    campaign_id, session_id, driver_id, storage_path, lat, lng, note, taken_at
  ) values (
    v_assignment.campaign_id, v_session_id, v_driver_id, p_storage_path,
    p_lat, p_lng, nullif(btrim(p_note), ''), coalesce(p_taken_at, now())
  ) returning * into v_photo;

  return v_photo;
end;
$function$;

revoke all on function public.driver_register_proof_photo(uuid, text, double precision, double precision, timestamptz, text, text) from public;
grant execute on function public.driver_register_proof_photo(uuid, text, double precision, double precision, timestamptz, text, text) to anon, authenticated;

commit;
