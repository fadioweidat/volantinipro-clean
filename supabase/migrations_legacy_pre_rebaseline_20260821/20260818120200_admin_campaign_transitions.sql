begin;

-- P1 ADMIN CONTROL + ROLLBACK — RPC atomiche stato+audit.
--
-- Ogni funzione qui sotto fa, nella STESSA transazione implicita della
-- chiamata RPC (nessun BEGIN/COMMIT esplicito necessario — una funzione
-- plpgsql invocata come singola RPC Supabase e' gia' un'unica transazione):
--   1. verifica Admin (gps_is_admin())
--   2. verifica reason non vuoto
--   3. lock advisory per-riga (evita race tra due azioni Admin concorrenti
--      sulla stessa campagna/assegnazione — stesso pattern gia' in uso in
--      admin_set_zone_manual_progress,
--      20260724101527_campaign_zone_progress_predeploy_fixes.sql)
--   4. verifica stato corrente (precondizione specifica dell'azione)
--   5. applica la modifica di stato
--   6. `perform public.admin_log_campaign_action(...)` — scrive l'audit
--      come ULTIMO passo della stessa funzione
--
-- Se un qualunque passo solleva un'eccezione (RAISE EXCEPTION), Postgres
-- annulla automaticamente TUTTO cio' che questa funzione ha gia' fatto in
-- questa transazione, incluso un eventuale UPDATE su campaigns gia'
-- eseguito prima dell'insert di audit.
--
-- Richiede 20260818120150_campaign_status_archived.sql gia' applicata
-- ('archived' ammesso in campaigns.status).

create or replace function public.admin_cancel_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns public.campaigns
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.status = 'cancelled' then
    raise exception 'CAMPAGNA_GIA_ANNULLATA' using errcode = '22023';
  end if;
  -- 'archived' e' uno stato amministrativo chiuso con un solo percorso di
  -- uscita esplicito e tracciato (reopen -> stato operativo ricostruito
  -- dall'audit, vedi admin_reopen_campaign). Annullare direttamente una
  -- campagna archiviata bypasserebbe quella ricostruzione: va prima
  -- riaperta.
  if v_old.status = 'archived' then
    raise exception 'CAMPAGNA_ARCHIVIATA_RIAPRIRE_PRIMA' using errcode = '22023';
  end if;

  update public.campaigns
    set status = 'cancelled', updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_cancelled', v_old.status, 'cancelled', p_reason
  );

  return v_new;
end;
$$;

-- Riapre una campagna 'completed'/'cancelled'/'archived'.
--
-- Per 'completed'/'cancelled' non esiste (e non serve inventare) uno stato
-- "reopened" distinto: si riusa 'in_progress', lo stato operativo
-- esistente piu' vicino semanticamente.
--
-- Per 'archived' lo stato precedente NON viene indovinato: si rilegge
-- l'ultima riga campaign_admin_action_log con action='campaign_archived'
-- per questa campagna e si usa il suo previous_state, che
-- admin_archive_campaign ha gia' registrato in modo affidabile al momento
-- dell'archiviazione. Se per qualunque motivo quella riga non esiste
-- (stato inconsistente, non dovrebbe mai accadere dato che 'archived' e'
-- raggiungibile solo tramite admin_archive_campaign), la funzione si
-- FERMA con un errore esplicito invece di indovinare un valore di default:
-- regola esplicita e sicura, come richiesto, non una ricostruzione
-- implicita.
create or replace function public.admin_reopen_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns public.campaigns
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
  v_target_status text;
  v_last_archive_previous text;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  if v_old.status in ('completed', 'cancelled') then
    v_target_status := 'in_progress';
  elsif v_old.status = 'archived' then
    select previous_state into v_last_archive_previous
    from public.campaign_admin_action_log
    where campaign_id = p_campaign_id
      and action = 'campaign_archived'
    order by created_at desc
    limit 1;

    if v_last_archive_previous is null or nullif(btrim(v_last_archive_previous), '') is null then
      raise exception 'STATO_PRECEDENTE_NON_RICOSTRUIBILE' using errcode = '22023';
    end if;
    v_target_status := v_last_archive_previous;
  else
    raise exception 'STATO_NON_RIAPRIBILE' using errcode = '22023';
  end if;

  update public.campaigns
    set status = v_target_status, updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_reopened', v_old.status, v_target_status, p_reason
  );

  return v_new;
end;
$$;

-- 'archived' e' ora uno stato realmente distinto (vedi
-- 20260818120150_campaign_status_archived.sql), non piu' un riuso di
-- 'cancelled'. Archiviabili SOLO da 'completed' o 'cancelled' — cioe' solo
-- campagne gia' concluse in un modo o nell'altro. Archiviare direttamente
-- da uno stato ancora operativo (draft/pending_review/approved/scheduled/
-- in_progress/problem) nasconderebbe amministrativamente qualcosa che
-- richiede ancora attenzione operativa, contro la definizione stessa di
-- "archived" data ("chiusa amministrativamente, storico intatto").
-- QUESTA E' UNA REGOLA PROPOSTA: se vuoi ammettere l'archiviazione anche da
-- altri stati, va confermato esplicitamente prima di applicare.
create or replace function public.admin_archive_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns public.campaigns
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.status not in ('completed', 'cancelled') then
    raise exception 'STATO_NON_ARCHIVIABILE' using errcode = '22023';
  end if;

  update public.campaigns
    set status = 'archived', updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_archived', v_old.status, 'archived', p_reason
  );

  return v_new;
end;
$$;

create or replace function public.admin_revoke_payment_confirmation(
  p_campaign_id uuid,
  p_reason text
)
returns public.campaigns
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
  v_old_payment_status text;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_old_payment_status := v_old.metadata->>'payment_status';
  if v_old_payment_status is distinct from 'pagato' then
    raise exception 'PAGAMENTO_NON_CONFERMATO' using errcode = '22023';
  end if;

  -- payment_confirmed_at / payment_reference NON vengono toccati: il fatto
  -- storico "confermato il [data]" resta sulla riga anche dopo la revoca
  -- (mai cancellare storico pagamento) — cambia solo payment_status, che
  -- torna operativamente "da pagare".
  update public.campaigns
    set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb), '{payment_status}', '"in_attesa_pagamento"'::jsonb
        ),
        updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'payment_confirmation_revoked', v_old_payment_status, 'in_attesa_pagamento', p_reason
  );

  return v_new;
end;
$$;

create or replace function public.admin_revoke_assignment_program(
  p_assignment_id uuid,
  p_reason text
)
returns public.assignment_event_log
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_previous_event text;
  v_row public.assignment_event_log%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_assignment_id::text, 0)
  );

  select * into v_assignment from public.operator_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'ASSEGNAZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- Ordine cronologico REALE (created_at desc, non "esiste almeno un
  -- sent"): se il programma non e' mai stato inviato non c'e' nulla da
  -- revocare. Questo valore diventa previous_state nell'audit.
  select event_type into v_previous_event
  from public.assignment_event_log
  where assignment_id = p_assignment_id
    and event_type in ('assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed')
  order by created_at desc
  limit 1;

  if v_previous_event is null then
    raise exception 'PROGRAMMA_MAI_INVIATO' using errcode = '22023';
  end if;

  -- Chiamata nested a una funzione SECURITY DEFINER: stessa transazione
  -- della funzione chiamante — se una riga sotto fallisce, anche questo
  -- insert viene annullato insieme al resto.
  perform public.log_assignment_event(p_assignment_id, 'assignment_program_revoked');

  perform public.admin_log_campaign_action(
    v_assignment.campaign_id, 'program_revoked', v_previous_event, 'assignment_program_revoked', p_reason
  );

  select * into v_row
  from public.assignment_event_log
  where assignment_id = p_assignment_id
    and event_type = 'assignment_program_revoked'
  order by created_at desc
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.admin_cancel_campaign(uuid, text) from public, anon;
revoke all on function public.admin_reopen_campaign(uuid, text) from public, anon;
revoke all on function public.admin_archive_campaign(uuid, text) from public, anon;
revoke all on function public.admin_revoke_payment_confirmation(uuid, text) from public, anon;
revoke all on function public.admin_revoke_assignment_program(uuid, text) from public, anon;

grant execute on function public.admin_cancel_campaign(uuid, text) to authenticated, service_role;
grant execute on function public.admin_reopen_campaign(uuid, text) to authenticated, service_role;
grant execute on function public.admin_archive_campaign(uuid, text) to authenticated, service_role;
grant execute on function public.admin_revoke_payment_confirmation(uuid, text) to authenticated, service_role;
grant execute on function public.admin_revoke_assignment_program(uuid, text) to authenticated, service_role;

commit;
