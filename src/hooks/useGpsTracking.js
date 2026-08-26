import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  endGpsSession,
  getActiveGpsSession,
  getActiveGpsSessionByToken,
  getLastGpsRecordedAt,
  heartbeatGpsSession,
  insertGpsPoint,
  isPermanentGpsWriteError,
  pauseGpsSession,
  resumeGpsSession,
  resolveGpsAssignment,
  sendPagehideHeartbeat,
  startGpsSession,
  transitionZone,
} from '../lib/services/gps-api.js';
import { classifyDeliverySession } from '../lib/monitoring/gpsSessionLifecycle.js';
import { resolveResumePolicy, RESUME_ACTION } from '../lib/monitoring/gpsResumePolicy.js';
import {
  applyStaleness,
  createGeofenceState,
  evaluateGeofencePoint,
  normalizeZonesFromCampaign,
} from '../lib/geofence/geofenceEngine.js';
import { dedupeGpsPointQueue, gpsPointQueueKey } from '../lib/gps/offlineQueue.js';

const SEND_INTERVAL_MS = 15000;
const MIN_DISTANCE_METERS = 8;
const HEARTBEAT_INTERVAL_MS = 20000;
const QUEUE_FLUSH_INTERVAL_MS = 10000;
const HIGH_SPEED_MPS = 2.2;
const GEOFENCE_STALENESS_CHECK_MS = 30000;
// Tetto massimo di attesa per la conferma server dello Stop (Fase B —
// prevenzione zombie): endGpsSession() gia' fa fino a 3 tentativi con
// backoff [800,1800,4000]ms (withRetry in gps-api.js), ma se un singolo
// tentativo resta appeso (rete morta senza mai fallire/timeoutare da sola)
// quella catena potrebbe non terminare mai. Questo e' un limite separato sul
// tempo TOTALE di attesa, non un quarto tentativo: scaduto, l'utente vede
// "chiusura non confermata" invece di restare bloccato a tempo indeterminato
// su un pulsante che gira.
const END_CONFIRM_TIMEOUT_MS = 20000;
const NOT_CONFIRMED_MESSAGE = 'Chiusura non confermata — riprova quando torna la connessione.';

// assignmentContext (opzionale, retro-compatibile): { assignment, campaign }
// gia' recuperati e validati da un chiamante che ha gia' fatto il proprio
// giro (es. DriverWorkMapPage/DriverAssignmentPage via useDriverAssignment).
// Se omesso il comportamento e' identico a prima — vedi resolveGpsAssignment
// in gps-api.js per la logica di fallback e il controllo server-side che
// resta sempre obbligatorio in entrambi i casi.
//
// accessToken/assignmentId (opzionali, per il link Driver pubblico senza
// login — vedi migrazione 20260816160000_driver_gps_access_token.sql):
// quando presenti, questo hook NON chiama piu' resolveGpsAssignment (che
// richiede auth.uid() tramite getCurrentOperatorProfile) per determinare se
// l'assegnazione e' "pronta" — l'assignmentId e' gia' noto e gia' validato
// dal caricamento pubblico del programma (useDriverAssignment), e la vera
// autorizzazione per ogni singola scrittura avviene comunque lato server
// dentro le RPC gps_* tramite il token. Nessuna RPC GPS diventa anonima "in
// generale": resta negata senza un token valido esattamente come oggi nega
// un auth.uid() nullo.
export function useGpsTracking(campaignId, { assignmentContext = null, accessToken = null, assignmentId = null } = {}) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [path, setPath] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const distanceMetersRef = useRef(0);
  const lastPathPointRef = useRef(null);
  const [networkStatus, setNetworkStatus] = useState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online');
  const [queueSize, setQueueSize] = useState(0);
  const [wakeLockStatus, setWakeLockStatus] = useState('unsupported');
  const [assignmentState, setAssignmentState] = useState({
    status: 'unknown',
    assignment: null,
    campaign: null,
    error: null,
  });
  const [resumeNotice, setResumeNotice] = useState(null);
  const [geofenceState, setGeofenceState] = useState(createGeofenceState());
  const geofenceStateRef = useRef(geofenceState);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const highAccuracyRef = useRef(true);
  const sessionRef = useRef(null);
  const statusRef = useRef('idle');
  const lastSentRef = useRef({ at: 0, lat: null, lng: null });
  const sendingRef = useRef(false);
  const pendingPointKeyRef = useRef(null);
  const queueKeyRef = useRef('');

  useEffect(() => {
    queueKeyRef.current = `volantinipro:gps-queue:${campaignId || 'unknown'}`;
    setQueueSize(readQueue(queueKeyRef.current).length);
  }, [campaignId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const geofenceZones = useMemo(
    () => normalizeZonesFromCampaign(assignmentState.campaign),
    [assignmentState.campaign],
  );
  const geofenceZonesRef = useRef(geofenceZones);
  useEffect(() => {
    geofenceZonesRef.current = geofenceZones;
  }, [geofenceZones]);

  const evaluateGeofence = useCallback((point) => {
    const next = evaluateGeofencePoint(geofenceStateRef.current, point, geofenceZonesRef.current);
    if (next !== geofenceStateRef.current) {
      geofenceStateRef.current = next;
      setGeofenceState(next);
    }
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // The browser can release wake lock on its own when the page is hidden.
    }
    wakeLockRef.current = null;
    setWakeLockStatus('released');
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      setWakeLockStatus('unsupported');
      return;
    }
    if (document.visibilityState !== 'visible') return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockStatus('active');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockStatus('released');
      });
    } catch (err) {
      setWakeLockStatus('error');
      console.warn('Wake Lock non disponibile', err);
    }
  }, []);

  const enqueuePoint = useCallback((payload) => {
    const key = queueKeyRef.current;
    if (!key) return;
    const queue = readQueue(key);
    const pointKey = gpsPointQueueKey(payload);
    if (queue.some((point) => gpsPointQueueKey(point) === pointKey)) return;
    queue.push({ ...payload, queuedAt: new Date().toISOString() });
    writeQueue(key, queue);
    setQueueSize(queue.length);
  }, []);

  const flushQueue = useCallback(async () => {
    const key = queueKeyRef.current;
    if (!key || sendingRef.current || navigator.onLine === false) return;
    const queue = dedupeGpsPointQueue(readQueue(key));
    if (!queue.length) {
      setQueueSize(0);
      return;
    }

    sendingRef.current = true;
    const remaining = [];
    try {
      for (const queuedPoint of queue) {
        try {
          const { queuedAt, ...payload } = queuedPoint;
          const point = await insertGpsPoint(payload);
          lastSentRef.current = { at: Date.now(), lat: Number(payload.lat), lng: Number(payload.lng) };
          setLastSentAt(new Date().toISOString());
          setLastPosition(point);
          setAccuracy(point.accuracy ?? payload.accuracy ?? null);
        } catch (err) {
          if (!isPermanentGpsWriteError(err)) {
            remaining.push(queuedPoint);
            console.warn('Punto GPS rimasto in coda', err);
          } else {
            setError(err?.message || 'Invio GPS non autorizzato.');
          }
        }
      }
      writeQueue(key, remaining);
      setQueueSize(remaining.length);
      if (!remaining.length) setError(null);
    } finally {
      sendingRef.current = false;
    }
  }, []);

  const sendPosition = useCallback(async (position) => {
    const activeSession = sessionRef.current;
    if (!campaignId || !activeSession?.id || statusRef.current !== 'active') return;
    const coords = position.coords;
    const lat = Number(coords.latitude);
    const lng = Number(coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const now = Date.now();
    const previous = lastSentRef.current;
    const movedMeters = previous.lat != null && previous.lng != null
      ? distanceMeters(previous.lat, previous.lng, lat, lng)
      : Infinity;
    const elapsed = now - (previous.at || 0);
    if (elapsed < SEND_INTERVAL_MS) return;
    if (movedMeters < MIN_DISTANCE_METERS && elapsed < SEND_INTERVAL_MS * 2) return;

    const payload = {
      campaignId,
      sessionId: activeSession.id,
      driverId: activeSession.driver_id,
      lat,
      lng,
      accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
      speed: Number.isFinite(coords.speed) ? coords.speed : null,
      heading: Number.isFinite(coords.heading) ? coords.heading : null,
      recordedAt: new Date(position.timestamp || now).toISOString(),
      accessToken,
    };
    const pointKey = gpsPointQueueKey(payload);
    if (pendingPointKeyRef.current === pointKey) return;

    if (navigator.onLine === false) {
      enqueuePoint(payload);
      setNetworkStatus('offline');
      return;
    }
    if (sendingRef.current) {
      enqueuePoint(payload);
      return;
    }

    sendingRef.current = true;
    pendingPointKeyRef.current = pointKey;
    try {
      const point = await insertGpsPoint(payload);
      lastSentRef.current = { at: now, lat, lng };
      setLastSentAt(new Date().toISOString());
      setLastPosition(point);
      setAccuracy(point.accuracy ?? coords.accuracy ?? null);
      setError(null);
    } catch (err) {
      if (isPermanentGpsWriteError(err)) {
        setError(err?.message || 'Invio GPS non autorizzato.');
        return;
      }
      enqueuePoint(payload);
      setError(`${err?.message || 'Errore invio posizione GPS.'} Punto salvato in coda locale.`);
    } finally {
      sendingRef.current = false;
      if (pendingPointKeyRef.current === pointKey) pendingPointKeyRef.current = null;
    }
  }, [campaignId, enqueuePoint, accessToken]);

  const startWatch = useCallback((forceHighAccuracy = highAccuracyRef.current) => {
    if (!navigator.geolocation) {
      setStatus('permission_error');
      setError('GPS non disponibile su questo dispositivo/browser.');
      return;
    }
    stopWatch();
    highAccuracyRef.current = forceHighAccuracy;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        const speed = Number.isFinite(coords.speed) ? coords.speed : 0;
        const shouldUseHighAccuracy = speed >= HIGH_SPEED_MPS;
        if (shouldUseHighAccuracy !== highAccuracyRef.current && statusRef.current === 'active') {
          window.setTimeout(() => startWatch(shouldUseHighAccuracy), 0);
        }
        setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        setSpeed(Number.isFinite(coords.speed) ? coords.speed : null);
        setHeading(Number.isFinite(coords.heading) ? coords.heading : null);
        setLastPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          recorded_at: new Date(position.timestamp || Date.now()).toISOString(),
        });
        const prevPoint = lastPathPointRef.current;
        if (prevPoint) {
          distanceMetersRef.current += distanceMeters(prevPoint.lat, prevPoint.lng, coords.latitude, coords.longitude);
          setDistanceKm(distanceMetersRef.current / 1000);
        }
        lastPathPointRef.current = { lat: coords.latitude, lng: coords.longitude };
        setPath((prev) => [...prev, { lat: coords.latitude, lng: coords.longitude }]);
        evaluateGeofence({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
        });
        sendPosition(position);
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatus('permission_error');
          setError('Permesso GPS negato. Abilita la posizione per iniziare il tracking.');
          stopWatch();
          return;
        }
        setError(geoError.message || 'Errore lettura posizione GPS.');
      },
      { enableHighAccuracy: forceHighAccuracy, maximumAge: forceHighAccuracy ? 5000 : 15000, timeout: 20000 },
    );
  }, [evaluateGeofence, sendPosition, stopWatch]);

  const start = useCallback(async (zoneId = null) => {
    setError(null);
    setAssignmentState((prev) => ({ ...prev, status: 'checking', error: null }));
    let resolved;
    if (accessToken && assignmentId) {
      // Link Driver pubblico: l'assignment e' gia' noto e gia' validato dal
      // caricamento del programma (useDriverAssignment) — nessuna chiamata
      // resolveGpsAssignment qui (richiederebbe auth.uid()). L'autorizzazione
      // reale resta comunque obbligatoria lato server, dentro
      // gps_start_session, tramite il token passato sotto.
      resolved = { assignment: { id: assignmentId }, campaign: null };
    } else {
      try {
        // Verifica pre-Start: puo' riusare assignmentContext (nulla e' ancora
        // cambiato lato server a questo punto). Il refresh POST-Start qualche
        // riga sotto resta invece sempre una risoluzione fresca — vedi
        // commento li' sotto, invariato.
        resolved = await resolveGpsAssignment(campaignId, assignmentContext);
      } catch (err) {
        const message = err?.message || 'Assegnazione GPS non valida.';
        setAssignmentState({ status: 'invalid', assignment: null, campaign: null, error: message });
        throw err;
      }
    }
    setAssignmentState({
      status: 'valid',
      assignment: resolved.assignment,
      campaign: resolved.campaign,
      error: null,
    });
    const nextSession = await startGpsSession(campaignId, { assignmentId: resolved.assignment.id, zoneId, accessToken });
    sessionRef.current = nextSession;
    statusRef.current = 'active';
    setSession(nextSession);
    setStatus('active');
    lastSentRef.current = { at: 0, lat: null, lng: null };
    geofenceStateRef.current = createGeofenceState();
    setGeofenceState(geofenceStateRef.current);
    distanceMetersRef.current = 0;
    lastPathPointRef.current = null;
    setDistanceKm(0);
    setPath([]);
    await requestWakeLock();
    startWatch();
    flushQueue();
    // startGpsSession() sopra fa passare la zona a "In corso" lato server,
    // ma assignmentState.campaign era stato impostato PRIMA (dalla
    // resolveGpsAssignment() a inizio funzione, eseguita per validare
    // l'assegnazione) e non veniva piu' aggiornato: la lista zone restava
    // "congelata" sullo snapshot pre-Start (root cause del bug in cui, dopo
    // uno Start riuscito, la UI mostrava ancora "Da iniziare" mentre il
    // server aveva gia' una sessione attiva — inducendo un secondo tentativo
    // di Start e il conseguente errore SESSIONE_GIA_ATTIVA). Ri-risolvere
    // l'assegnazione qui aggiorna assignmentState.campaign.campaign_zones
    // con lo stato reale, senza toccare session/status gia' impostati sopra.
    if (!accessToken) {
      try {
        const refreshed = await resolveGpsAssignment(campaignId);
        setAssignmentState({ status: 'valid', assignment: refreshed.assignment, campaign: refreshed.campaign, error: null });
      } catch {
        // Non fatale: la sessione e' comunque partita correttamente: se il
        // refresh fallisce la lista zone restera' solo temporaneamente stale.
      }
    }
    // In modalita' token non c'e' un refresh RPC pubblico equivalente: la
    // lista zone visualizzata resta quella gia' nota da useDriverAssignment
    // (assignmentZones, aggiornata alla prossima apertura del link).
    return nextSession;
  }, [campaignId, assignmentContext, accessToken, assignmentId, flushQueue, requestWakeLock, startWatch]);

  const refreshAssignment = useCallback(async () => {
    if (!campaignId) {
      setAssignmentState({ status: 'missing', assignment: null, campaign: null, error: 'Campagna non disponibile.' });
      return null;
    }
    if (accessToken && assignmentId) {
      // Nessuna chiamata auth-dipendente in modalita' token: l'assignment e'
      // gia' considerato valido (validato dal caricamento pubblico del
      // programma) — Start/GPS restano comunque soggetti alla verifica
      // server-side del token ad ogni scrittura.
      setAssignmentState({ status: 'valid', assignment: { id: assignmentId }, campaign: null, error: null });
      return { assignment: { id: assignmentId }, campaign: null };
    }
    setAssignmentState((prev) => ({ ...prev, status: 'checking', error: null }));
    try {
      const resolved = await resolveGpsAssignment(campaignId, assignmentContext);
      setAssignmentState({
        status: 'valid',
        assignment: resolved.assignment,
        campaign: resolved.campaign,
        error: null,
      });
      return resolved;
    } catch (err) {
      setAssignmentState({
        status: 'invalid',
        assignment: null,
        campaign: null,
        error: err?.message || 'Assegnazione GPS non valida.',
      });
      return null;
    }
  }, [campaignId, assignmentContext, accessToken, assignmentId]);

  const pause = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await pauseGpsSession(sessionRef.current.id, accessToken);
    sessionRef.current = updated;
    statusRef.current = 'paused';
    setSession(updated);
    setStatus('paused');
    stopWatch();
    await releaseWakeLock();
    return updated;
  }, [releaseWakeLock, stopWatch, accessToken]);

  const resume = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await resumeGpsSession(sessionRef.current.id, accessToken);
    sessionRef.current = updated;
    statusRef.current = 'active';
    setSession(updated);
    setStatus('active');
    await requestWakeLock();
    startWatch();
    flushQueue();
    return updated;
  }, [flushQueue, requestWakeLock, startWatch, accessToken]);

  const changeZone = useCallback(async (zoneId) => {
    if (!sessionRef.current?.id || !['active', 'paused'].includes(statusRef.current)) return null;
    const updated = await transitionZone(zoneId, 'start', { accessToken, assignmentId });
    sessionRef.current = updated;
    setSession(updated);
    // Stessa staleness di start() sopra: la zona appena attivata non si
    // rifletteva in assignmentState.campaign.campaign_zones finche' non si
    // ricaricava la pagina. In modalita' token non c'e' refresh RPC
    // pubblico equivalente (vedi start()).
    if (!accessToken) {
      try {
        const refreshed = await resolveGpsAssignment(campaignId);
        setAssignmentState({ status: 'valid', assignment: refreshed.assignment, campaign: refreshed.campaign, error: null });
      } catch {
        // Non fatale: la sessione/zona e' comunque cambiata correttamente lato server.
      }
    }
    return updated;
  }, [campaignId, accessToken, assignmentId]);

  const completeZone = useCallback(async (zoneId) => {
    if (!sessionRef.current?.id || !['active', 'paused'].includes(statusRef.current)) return null;
    const updated = await transitionZone(zoneId, 'complete', { accessToken, assignmentId });
    sessionRef.current = updated;
    setSession(updated);
    return updated;
  }, []);

  const end = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    setError(null);
    // NON fermiamo watch/wakeLock qui: se il server non conferma la
    // chiusura, il tracking deve continuare esattamente come prima — non
    // possiamo far credere al driver che il turno sia finito lato server
    // quando non lo e' (root cause diretta delle sessioni zombie storiche
    // gia' pulite in questa stessa fase: una UI che smetteva di tracciare
    // pur non avendo mai ricevuto conferma di chiusura).
    let updated;
    try {
      updated = await withTimeout(
        endGpsSession(sessionRef.current.id, accessToken),
        END_CONFIRM_TIMEOUT_MS,
        NOT_CONFIRMED_MESSAGE,
      );
    } catch (err) {
      const message = err?.timeout
        ? err.message
        : `${err?.message || 'Chiusura sessione GPS non riuscita.'} ${NOT_CONFIRMED_MESSAGE}`;
      setError(message);
      throw Object.assign(new Error(message), { cause: err, notConfirmed: true });
    }
    // SERVER CONFIRMED da qui in poi: solo ora fermiamo watch/wakeLock e
    // aggiorniamo lo stato locale a 'completed'.
    stopWatch();
    sessionRef.current = updated;
    statusRef.current = 'completed';
    setSession(updated);
    setStatus('completed');
    await releaseWakeLock();
    return updated;
  }, [releaseWakeLock, stopWatch, accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function resumeExistingSession() {
      if (!campaignId) return;
      // Link Driver pubblico: getActiveGpsSession (select diretta su
      // delivery_sessions via client SDK, RLS su driver_id = auth.uid()) non
      // funziona senza sessione Supabase — usa invece la RPC dedicata
      // get_active_driver_session, scoped a QUESTA sola assignment tramite
      // assignment_id+access_token (vedi migrazione
      // 20260816190000_driver_gps_resume_and_confirm_status.sql). Se
      // assignmentId manca (link vecchio senza token) non c'e' nulla da
      // recuperare: Start rifiuta comunque un doppio avvio
      // (SESSIONE_GIA_ATTIVA) invece di crearne uno secondo.
      try {
        const existing = accessToken
          ? (assignmentId ? await getActiveGpsSessionByToken(assignmentId, accessToken) : null)
          : await getActiveGpsSession(campaignId);
        if (cancelled || !existing || (existing.status !== 'started' && existing.status !== 'paused')) return;

        // Classificazione PRIMA di riagganciare (Fase D — prevenzione
        // zombie): mai un resume silenzioso di una sessione ABANDONED. In
        // modalita' token last_gps_recorded_at arriva gia' dentro `existing`
        // (get_active_driver_session esteso — vedi migrazione
        // 20260826130000_get_active_driver_session_last_gps.sql, proposta e
        // non ancora applicata: finche' non e' live il campo e' undefined e
        // viene trattato semplicemente come "nessuna evidenza nota", mai un
        // errore). In modalita' autenticata lo leggiamo qui direttamente
        // (RLS driver_id=auth.uid() lo consente).
        const lastGpsRecordedAt = accessToken
          ? (existing._lastGpsRecordedAt ?? null)
          : await getLastGpsRecordedAt(existing.id);
        if (cancelled) return;

        const classification = classifyDeliverySession(existing, { lastGpsRecordedAt });
        const policy = resolveResumePolicy(classification);

        if (policy.action === RESUME_ACTION.BLOCK) {
          // NON riagganciamo session/status: nessun tracking silenzioso su
          // una sessione abbandonata. NON chiamiamo mai qui la RPC
          // admin-only gps_recover_abandoned_session — il Driver non deve
          // ottenere privilegi admin; puo' solo essere informato.
          setResumeNotice({ level: 'blocked', message: policy.message, classification: classification.state });
          return;
        }

        sessionRef.current = existing;
        const newStatus = existing.status === 'paused' ? 'paused' : 'active';
        statusRef.current = newStatus;
        setSession(existing);
        setStatus(newStatus);
        if (policy.action === RESUME_ACTION.RESUME_WITH_WARNING) {
          setResumeNotice({ level: 'warning', message: policy.message, classification: classification.state });
        }

        if (newStatus === 'active') {
          await requestWakeLock();
          startWatch();
          flushQueue();
        }
      } catch (err) {
        console.warn('Resume session GPS non riuscito', err);
      }
    }
    resumeExistingSession();
    return () => {
      cancelled = true;
    };
  }, [campaignId, accessToken, assignmentId, flushQueue, requestWakeLock, startWatch]);

  useEffect(() => {
    refreshAssignment();
  }, [refreshAssignment]);

  useEffect(() => {
    const onVisibilityChange = () => {
      console.info('GPS visibilitychange', document.visibilityState);
      if (document.visibilityState === 'visible' && statusRef.current === 'active') {
        requestWakeLock();
        startWatch();
        flushQueue();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushQueue, requestWakeLock, startWatch]);

  useEffect(() => {
    // Fase C — pagehide/chiusura app: best-effort, MAI un cancel/complete
    // automatico. Solo un ultimo heartbeat diagnostico se il tracking era
    // davvero attivo in quel momento — non sostituisce il pulsante Stop, non
    // chiude nulla da solo. Vedi sendPagehideHeartbeat in gps-api.js per il
    // perche' di fetch(keepalive) invece di sendBeacon.
    const onPageHide = () => {
      if (statusRef.current === 'active' && sessionRef.current?.id) {
        sendPagehideHeartbeat(sessionRef.current.id, accessToken);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [accessToken]);

  useEffect(() => {
    const onOnline = () => {
      setNetworkStatus('online');
      flushQueue();
    };
    const onOffline = () => setNetworkStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  useEffect(() => {
    const timer = window.setInterval(flushQueue, QUEUE_FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flushQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (statusRef.current !== 'active' || !sessionRef.current?.id) return;
      heartbeatGpsSession(sessionRef.current.id, accessToken).catch((err) => {
        console.warn('Heartbeat GPS non riuscito', err);
      });
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (statusRef.current !== 'active') return;
      const next = applyStaleness(geofenceStateRef.current);
      if (next !== geofenceStateRef.current) {
        geofenceStateRef.current = next;
        setGeofenceState(next);
      }
    }, GEOFENCE_STALENESS_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    stopWatch();
    releaseWakeLock();
  }, [releaseWakeLock, stopWatch]);

  return {
    session,
    status,
    error,
    accuracy,
    lastPosition,
    lastSentAt,
    networkStatus,
    queueSize,
    wakeLockStatus,
    assignmentState,
    assignmentStatus: assignmentState.status === 'valid' ? 'ready'
      : assignmentState.status === 'checking' ? 'loading'
      : assignmentState.status === 'unknown' ? 'loading'
      : 'blocked',
    assignmentError: assignmentState.error,
    resumeNotice,
    geofenceState,
    canStart: assignmentState.status === 'valid',
    isActive: status === 'active',
    isPaused: status === 'paused',
    path,
    distanceKm,
    speed,
    heading,
    start,
    pause,
    resume,
    changeZone,
    completeZone,
    end,
  };
}

// Corsa contro un timer: la promise originale continua a girare in
// background (nessun abort reale sulla richiesta HTTP sottostante, l'SDK
// Supabase usato qui non espone un AbortSignal per rpc()) — solo la UI
// smette di aspettarla oltre `ms`. Se la richiesta reale completa DOPO lo
// scadere del timer, il suo risultato viene semplicemente ignorato: non
// aggiorna mai session/status (vedi end(), che li tocca solo dentro il
// blocco try, mai in un .then() separato).
function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const err = new Error(timeoutMessage);
      err.timeout = true;
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readQueue(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(key, queue) {
  window.localStorage.setItem(key, JSON.stringify(queue.slice(-500)));
}
