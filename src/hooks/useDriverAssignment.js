import { useCallback, useEffect, useMemo, useState } from 'react';

// Segreto per-assignment (operator_assignments.access_token) incorporato dal
// link WhatsApp come ?access=... (vedi generateDriverAssignmentLink in
// admin-api.js e la migrazione 20260816160000_driver_gps_access_token.sql).
// Letto una sola volta qui cosi' sia questo hook (conferma/evento apertura)
// sia useGpsTracking (Start/GPS, ricevuto dai chiamanti come prop separata)
// usano lo stesso valore senza duplicare il parsing dell'URL.
function readAccessTokenFromLocation() {
  try {
    return new URLSearchParams(window.location.search).get('access') || null;
  } catch {
    return null;
  }
}

// Timing diagnostico SOLO DEV (audit "Driver page ancora lenta").
// SECURITY_READY = quando la Fase 1 (blocking: RPC pubblica get_public_
// driver_assignment) e' pronta e la pagina puo' gia' renderizzare la shell.
// FULL_PROGRAM_READY = quando anche la Fase 2 (background: conferma) e'
// arrivata. Nessuna fase e' rallentata da questa funzione: legge solo
// timestamp gia' presi durante il caricamento reale.
function logDriverLoadTiming(t, err = null) {
  const end = performance.now();
  const ms = (from, to) => (from != null && to != null ? Math.round(to - from) : null);
  const assignment = ms(t.start, t.assignment);
  const securityReady = ms(t.start, t.securityReady);
  const fullProgramReady = ms(t.start, t.fullProgramReady);
  const total = ms(t.start, end);
  console.info('[DRIVER LOAD]', {
    assignment: `${assignment ?? '—'}ms`,
    SECURITY_READY: `${securityReady ?? '—'}ms`,
    FULL_PROGRAM_READY: `${fullProgramReady ?? '—'}ms`,
    total: `${total ?? '—'}ms`,
    ...(err ? { failedAt: err?.message || String(err) } : {}),
  });
}

// ROLLBACK DRIVER AUTH (2026-08-16): il Driver non fa piu' login. Il link
// WhatsApp (/driver/assignment/{assignmentId}) e' un access link pubblico —
// l'UUID dell'assignment e' l'unico segreto. Fase 1 legge il programma
// tramite get_public_driver_assignment (RPC SECURITY DEFINER, concessa ad
// anon — vedi supabase/migrations/20260816120000_public_driver_assignment_link.sql),
// che valida internamente esistenza/stato/finestra date senza richiedere
// auth.uid(). Nessuna sessione, nessun bridge, nessun fallback admin: quella
// logica serviva solo a determinare "sei loggato?", domanda che qui non si
// pone piu'.
//
// FASE 1 (blocking, "security"): fetch pubblico + validazione stato
// (revocata/completata) + finestra starts_at/ends_at — stessa politica di
// prima, solo senza il controllo di ownership via auth (la RPC stessa non
// espone nulla oltre ai campi operativi consentiti). Appena questa fase e'
// valida, loadingAssignment passa a false.
//
// FASE 2 (non-blocking, "dettagli"): log evento apertura (fire-and-forget,
// via log_assignment_event — resta authenticated-only: per un link anonimo
// fallisce silenziosamente con UNAUTHORIZED, gia' gestito senza crash) e
// stato conferma presa in carico (best-effort, RLS-scoped: per un link
// anonimo puo' restare vuoto, trattato come "non ancora confermato").
export function useDriverAssignment(assignmentId) {
  const accessToken = useMemo(() => readAccessTokenFromLocation(), []);
  const [assignmentData, setAssignmentData] = useState(null);
  const [assignmentZones, setAssignmentZones] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [assignmentErrorType, setAssignmentErrorType] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  // Risultato gia' recuperato di gps_get_operator_campaign (vedi Promise.all
  // sotto): esposto cosi' com'e' cosi' che i chiamanti (DriverWorkMapPage,
  // DriverAssignmentPage) possano passarlo a useGpsTracking come
  // assignmentContext ed evitare che quell'hook richiami la STESSA RPC una
  // seconda volta per lo stesso mount pagina (root cause di duplicazione
  // confermata nell'audit "Driver page ancora lenta").
  const [campaignRecord, setCampaignRecord] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  // Fase 2: true finche' conferma/RPC campagna/zone non hanno finito di
  // risolversi (successo o fallimento). Non blocca il render della shell.
  const [loadingProgramDetails, setLoadingProgramDetails] = useState(true);
  // Errore NON bloccante: una query secondaria e' fallita ma l'accesso base
  // resta valido — il chiamante mostra un avviso locale, non la schermata
  // globale di blocco (quella resta riservata ad assignmentError).
  const [programDetailsError, setProgramDetailsError] = useState(null);
  const [confirmedAt, setConfirmedAt] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Timing DEV-only (import.meta.env.DEV): performance.now() per fase,
    // stampato in una riga sola a fine caricamento. Nessun impatto in
    // produzione (il blocco if e' escluso dal bundle prod da Vite tree-shake
    // su import.meta.env.PROD, ma qui lo guardiamo esplicitamente per
    // chiarezza). Nessuna logica esistente toccata, solo marker di tempo.
    const DEBUG_TIMING = Boolean(import.meta.env.DEV);
    const t = DEBUG_TIMING ? { start: performance.now() } : null;

    async function load() {
      if (!assignmentId) {
        setAssignmentError('ID assegnazione mancante.');
        setLoadingAssignment(false);
        setLoadingProgramDetails(false);
        return;
      }

      // ─── FASE 1 — BLOCKING: fetch pubblico + validazione ───────────────
      let supabase;
      let data;
      let zones;
      try {
        const bridge = await import('../supabaseClient.js');
        supabase = bridge.supabase;
        if (!supabase) throw new Error('Supabase non configurato.');

        const { data: rpcResult, error } = await supabase.rpc('get_public_driver_assignment', {
          p_assignment_id: assignmentId,
        });
        if (DEBUG_TIMING) t.assignment = performance.now();

        if (error) throw error;
        if (!rpcResult || rpcResult.error === 'not_found') {
          throw new Error('Assegnazione non trovata. Verifica il link ricevuto o contatta il tuo amministratore.');
        }
        data = rpcResult;
        zones = Array.isArray(rpcResult.zones) ? rpcResult.zones : [];

        if (data.status === 'revoked') {
          const { data: liveSession } = await supabase
            .from('delivery_sessions')
            .select('id')
            .eq('assignment_id', assignmentId)
            .in('status', ['started', 'paused'])
            .maybeSingle();
          if (!liveSession) {
            throw new Error('Questa assegnazione è stata revocata. Contatta il tuo amministratore.');
          }
        }
        if (data.status === 'completed') {
          throw new Error('Questa assegnazione è già stata completata.');
        }
        const now = Date.now();
        if (data.ends_at && Date.parse(data.ends_at) <= now) {
          throw new Error(`Questa assegnazione è scaduta il ${new Date(data.ends_at).toLocaleString('it-IT')}. Contatta il tuo amministratore.`);
        }
        if (data.starts_at && Date.parse(data.starts_at) > now) {
          throw new Error(`Il lavoro inizia il ${new Date(data.starts_at).toLocaleString('it-IT')}. Torna più tardi.`);
        }
        if (DEBUG_TIMING) { t.validation = performance.now(); t.securityReady = performance.now(); }
      } catch (err) {
        if (!cancelled) {
          if (DEBUG_TIMING) logDriverLoadTiming(t, err);
          setAssignmentError(err?.message || 'Errore caricamento assegnazione.');
          setAssignmentErrorType(null);
          setLoadingAssignment(false);
          setLoadingProgramDetails(false);
        }
        return;
      }

      if (cancelled) return;
      setAssignmentErrorType(null);

      // Fase 1 valida: sblocca subito la pagina. Programma, zone e quantita'
      // arrivano gia' tutti nella stessa risposta RPC — nessuna seconda
      // chiamata necessaria per mostrarli (a differenza del vecchio flusso
      // autenticato, che doveva ancora attendere gps_get_operator_campaign/
      // operator_assignment_zones separatamente).
      setAssignmentData(data);
      setCampaignId(data.campaign_id);
      const structuredZones = zones.map(z => ({
        id: z.id || null,
        zone_name: z.zone_name,
        priority: z.priority ?? 999,
        quantity: z.quantity ?? null,
        status: z.status || 'Da iniziare',
        notes: z.notes || null,
        centerLat: Number.isFinite(Number(z.center_lat)) ? Number(z.center_lat) : null,
        centerLng: Number.isFinite(Number(z.center_lng)) ? Number(z.center_lng) : null,
        radiusM: Number.isFinite(Number(z.radius_m)) ? Number(z.radius_m) : null,
        isLegacy: false,
      })).sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return String(a.zone_name).localeCompare(String(b.zone_name));
      });
      setAssignmentZones(structuredZones);
      // confirmed_at arriva gia' nella stessa risposta RPC di Fase 1 (vedi
      // migrazione 20260816190000_driver_gps_resume_and_confirm_status.sql):
      // per un link pubblico e' l'UNICA fonte disponibile subito, perche' la
      // select RLS-scoped di Fase 2 sotto non trova nulla per un chiamante
      // anonimo. Impostato qui cosi' "✓ Programma confermato" resta visibile
      // anche dopo un reload, invece di sparire per poi (forse) ricomparire.
      setConfirmedAt(data.confirmed_at || null);
      setLoadingAssignment(false);

      // ─── FASE 2 — NON-BLOCKING: evento apertura, fire-and-forget ───────
      // log_assignment_event(p_assignment_id, p_action, p_access_token):
      // il terzo parametro (migrazione 20260816160000_driver_gps_access_token.sql)
      // autorizza un link pubblico senza auth.uid(), risolvendo internamente
      // l'operatore reale dal token — se il link non porta ?access= (vecchi
      // link gia' condivisi prima di questa migrazione), la RPC nega con
      // UNAUTHORIZED esattamente come prima, gestito qui senza crashare.
      //
      // PERF (audit "Driver cold load ancora lento"): questa fase faceva
      // ANCHE una seconda select awaited su assignment_event_log per
      // rileggere lo stato di conferma — ma questo hook e' usato SOLO in
      // modalita' token (nessun chiamante autenticato rimasto: TrackingPage.jsx
      // ha il proprio flusso separato), quindi quella select, RLS-scoped,
      // non puo' MAI trovare righe per un chiamante anonimo — restituiva
      // sempre vuoto, pagando comunque un round-trip di rete intero per
      // nulla. confirmed_at arriva gia' nella risposta di get_public_driver_
      // assignment (Fase 1, SECURITY DEFINER, non soggetta a RLS) e resta
      // l'unica fonte necessaria — vedi setConfirmedAt(data.confirmed_at)
      // sopra.
      supabase.rpc('log_assignment_event', {
        p_assignment_id: assignmentId,
        p_action: 'assignment_program_opened',
        p_access_token: accessToken,
      }).then(({ error: openedEventError }) => {
        if (openedEventError && DEBUG_TIMING) console.info("[DRIVER LOAD] evento apertura non registrato:", openedEventError.message);
      });
      if (DEBUG_TIMING) { t.fullProgramReady = performance.now(); logDriverLoadTiming(t); }
      if (!cancelled) setLoadingProgramDetails(false);
    }
    load();
    return () => { cancelled = true; };
  }, [assignmentId]);

  // Presa in carico autorizzata dal token del link (vedi log_assignment_event
  // sopra) quando presente; senza ?access= nell'URL fallisce con un
  // messaggio esplicito, come per qualunque altra azione non autorizzata.
  const confirmAssignment = useCallback(async () => {
    if (confirmedAt || confirming) return;
    setConfirming(true);
    setConfirmationError(null);
    try {
      const { supabase } = await import('../supabaseClient.js');
      const { error } = await supabase.rpc('log_assignment_event', {
        p_assignment_id: assignmentId,
        p_action: 'assignment_program_confirmed',
        p_access_token: accessToken,
      });
      if (error) throw error;
      const { data } = await supabase
        .from('assignment_event_log')
        .select('created_at')
        .eq('assignment_id', assignmentId)
        .eq('event_type', 'assignment_program_confirmed')
        .order('created_at', { ascending: true })
        .limit(1);
      setConfirmedAt(data?.[0]?.created_at || new Date().toISOString());
    } catch (error) {
      setConfirmationError(error?.message || 'Impossibile confermare il programma.');
    } finally {
      setConfirming(false);
    }
  }, [assignmentId, accessToken, confirmedAt, confirming]);

  return {
    assignmentData,
    assignmentZones,
    assignmentError,
    assignmentErrorType,
    campaignId,
    campaignRecord,
    loadingAssignment,
    loadingProgramDetails,
    programDetailsError,
    confirmedAt,
    confirming,
    confirmationError,
    confirmAssignment,
    accessToken,
  };
}
