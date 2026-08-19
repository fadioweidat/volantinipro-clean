begin;

-- P1 ADMIN CONTROL + ROLLBACK — PROPOSTA REVISIONATA, NON APPLICATA.
--
-- Rispetto alla bozza precedente: quella copriva solo payment/assignment/
-- delivery_sessions/gps_tracking_points. Un audit completo di TUTTE le FK
-- reali che referenziano campaigns(id) sul DB live (information_schema,
-- non dedotto da migration file) ha trovato 10 tabelle aggiuntive con dati
-- potenzialmente reali, mai controllate prima:
--
--   TABELLA                              DELETE RULE FK   DECISIONE
--   quotes                               CASCADE          BLOCCA (importi/fee reali)
--   campaign_assets                      CASCADE          BLOCCA (file caricati da utente reale)
--   ai_reports                           CASCADE          BLOCCA (report AI gia' generato — stesso
--                                                          principio "non distruggere report emessi"
--                                                          del ticket originale; CORREZIONE: un
--                                                          audit precedente in questa sessione aveva
--                                                          concluso "nessuna tabella report persistita
--                                                          esiste" — falso, ai_reports esiste ed e'
--                                                          persistita)
--   campaign_zone_progress_history       SET NULL         BLOCCA (storico override Admin reale — la
--                                                          riga sopravvive comunque via SET NULL +
--                                                          snapshot immutabili gia' esistenti, ma la
--                                                          sua ESISTENZA segnala un intervento Admin
--                                                          reale sulla copertura, stesso principio di
--                                                          operator_assignments/payment)
--   campaign_coverage_adjustments        CASCADE          BLOCCA (aree Manuale Admin disegnate)
--   campaign_coverage_adjustments_log    CASCADE          BLOCCA (storico di quelle aree)
--   assignment_event_log                 CASCADE          BLOCCA (ridondante con operator_assignments
--                                                          count>0, controllato comunque in modo
--                                                          esplicito come richiesto, difesa in
--                                                          profondita')
--   operational_groups                   NO ACTION        BLOCCA (senza questo check, un gruppo senza
--                                                          assegnazioni attive farebbe fallire il
--                                                          DELETE con un errore Postgres grezzo non
--                                                          gestito, invece del messaggio applicativo)
--   campaign_zone_snapshots              CASCADE          BLOCCA (caso limite: contiene reach_score/
--                                                          roi_score/confidence_score, sembra pensato
--                                                          come registrazione puntuale da preservare,
--                                                          non puro cache — trattato in modo
--                                                          conservativo come storico reale; SEGNALARE
--                                                          se si preferisce riclassificarlo come cache
--                                                          sicura da cascata)
--   campaign_events                      CASCADE          BLOCCA (caso limite: from_status/to_status/
--                                                          message somiglia a un log di transizioni
--                                                          reali, non puro cache — stesso trattamento
--                                                          conservativo di campaign_zone_snapshots)
--
-- Considerate invece CACHE/DERIVATO puro, sicuro da lasciar cascata senza
-- controllo esplicito (nessun contenuto autorale utente, nessun significato
-- di audit, interamente ri-derivabile da fonti esterne o dalla
-- configurazione stessa della campagna):
--   campaign_zones            (configurazione della campagna stessa, stesso
--                              ciclo di vita, non dipendenza indipendente)
--   campaign_zone_progress    (percentuale di copertura calcolata — la sua
--                              tabella STORICO, campaign_zone_progress_
--                              history, e' quella bloccata sopra)
--   campaign_analysis         (numeri di analisi territoriale cache)
--   campaign_pois              (risultati POI Overpass in cache)
--
-- proof_photos, delivery_sessions, gps_tracking_points: confermato
-- (di nuovo, esplicitamente) che NON hanno alcuna foreign key verso
-- campaigns — controllate qui solo in lettura, MAI scritte/cancellate da
-- questa funzione, coerente con "non possono essere considerate protette
-- dalle FK" indicato nel ticket.
create or replace function public.admin_hard_delete_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_title text;
  v_status text;
  v_payment_status text;
  v_blocker text;
begin
  -- 1. ADMIN AUTH — auth.uid() implicito dentro gps_is_admin(), stesso
  -- meccanismo gia' usato da tutte le altre RPC di questo ticket.
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  -- 7. REASON obbligatorio, DB-enforced (non solo lato client).
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  -- 2. ADVISORY LOCK per-campagna: serializza richieste concorrenti sulla
  -- STESSA campagna (test case G). Se due admin chiamano questa funzione
  -- nello stesso momento per lo stesso id, la seconda attende che la prima
  -- transazione finisca (commit o rollback) prima di procedere.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select title, status, metadata->>'payment_status'
    into v_title, v_status, v_payment_status
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_title is null then
    -- Se la prima di due chiamate concorrenti ha gia' cancellato la riga,
    -- la seconda arriva qui (non trova piu' nulla da bloccare ne' da
    -- cancellare) invece di un errore di lock/deadlock — comportamento
    -- sicuro e prevedibile per il test case G.
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- 3./4. DEPENDENCY CHECK COMPLETO. Un solo messaggio applicativo
  -- uniforme (CAMPAGNA_NON_ELIMINABILE_DATI_OPERATIVI, come richiesto),
  -- con il dettaglio della dipendenza specifica in DETAIL (utile per
  -- debug/log, non e' il messaggio primario mostrato all'utente).
  if v_payment_status = 'pagato' then
    v_blocker := 'payment_status=pagato';
  elsif exists (select 1 from public.operator_assignments where campaign_id = p_campaign_id) then
    v_blocker := 'operator_assignments';
  elsif exists (select 1 from public.operational_groups where campaign_id = p_campaign_id) then
    v_blocker := 'operational_groups';
  elsif exists (select 1 from public.assignment_event_log where campaign_id = p_campaign_id) then
    v_blocker := 'assignment_event_log';
  elsif exists (select 1 from public.delivery_sessions where campaign_id = p_campaign_id) then
    v_blocker := 'delivery_sessions';
  elsif exists (select 1 from public.gps_tracking_points where campaign_id = p_campaign_id) then
    v_blocker := 'gps_tracking_points';
  elsif exists (select 1 from public.proof_photos where campaign_id = p_campaign_id) then
    v_blocker := 'proof_photos';
  elsif exists (select 1 from public.quotes where campaign_id = p_campaign_id) then
    v_blocker := 'quotes';
  elsif exists (select 1 from public.campaign_assets where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_assets';
  elsif exists (select 1 from public.ai_reports where campaign_id = p_campaign_id) then
    v_blocker := 'ai_reports';
  elsif exists (select 1 from public.campaign_zone_progress_history where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_zone_progress_history';
  elsif exists (select 1 from public.campaign_coverage_adjustments where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_coverage_adjustments';
  elsif exists (select 1 from public.campaign_coverage_adjustments_log where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_coverage_adjustments_log';
  elsif exists (select 1 from public.campaign_zone_snapshots where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_zone_snapshots';
  elsif exists (select 1 from public.campaign_events where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_events';
  else
    v_blocker := null;
  end if;

  if v_blocker is not null then
    raise exception 'CAMPAGNA_NON_ELIMINABILE_DATI_OPERATIVI'
      using errcode = '22023', detail = format('blocked_by: %s', v_blocker);
  end if;

  -- 5./6. AUDIT PRIMA del delete, nella STESSA transazione (atomicita' —
  -- se il DELETE sotto fallisce per qualunque motivo, questo insert viene
  -- annullato insieme, esattamente come le altre RPC di questo ticket).
  -- campaign_admin_action_log.campaign_id ha ON DELETE SET NULL +
  -- campaign_id_snapshot/campaign_title_snapshot immutabili (gia'
  -- applicati in 20260818120000): la riga di audit sopravvive al DELETE
  -- qui sotto, solo campaign_id diventa NULL.
  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_hard_deleted', v_status, null, p_reason
  );

  -- 9. DELETE TARGET: SOLO public.campaigns. Tutte le tabelle bloccanti
  -- sopra sono gia' state verificate ASSENTI a questo punto, quindi il
  -- CASCADE reale su di esse (dove esiste) non cancella nulla perche' non
  -- c'e' nulla da cancellare. Le uniche tabelle che potrebbero ancora
  -- avere righe scollegate da questo controllo esplicito sono quelle senza
  -- alcuna FK verso campaigns (proof_photos/delivery_sessions/
  -- gps_tracking_points) — controllate sopra in lettura, questa funzione
  -- non esegue MAI un DELETE su di esse.
  delete from public.campaigns where id = p_campaign_id;
end;
$$;

revoke all on function public.admin_hard_delete_campaign(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_campaign(uuid, text) to authenticated, service_role;

commit;
