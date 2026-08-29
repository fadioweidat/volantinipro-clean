import { useEffect, useMemo, useRef, useState } from 'react';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { useDriverAssignment } from '../../hooks/useDriverAssignment.js';
import { PodCapture } from '../../components/driver/PodCapture.jsx';
import { resolveMunicipalityBoundary } from '../../lib/geo/resolveMunicipalityBoundary.js';
import { geoJsonContainsPoint } from '../../lib/geo/pointInPolygon.js';
import { estimateDistanceToZoneBoundaryMeters } from '../../lib/geofence/geofenceEngine.js';
import { navigateDriver, driverPathWithQuery } from './driverNav.js';

// ─── DriverAssignmentPage ─────────────────────────────────────────────────────
// Pagina driver accessibile tramite /driver/assignment/{assignmentId}, link
// pubblico condiviso via WhatsApp dall'admin — nessun login richiesto.
// L'assignmentId (UUID non indovinabile) e' l'unico segreto necessario per
// leggere il programma: useDriverAssignment risolve i dati tramite una RPC
// pubblica dedicata, non tramite una sessione utente.

function formatDistanceLabel(meters) {
  if (!Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function DriverAssignmentPage({ assignmentId }) {
  // Timing diagnostico SOLO DEV (audit "Driver main page still loads too
  // slow"): PAGE_MOUNT = primo render di questo componente (la shell
  // "Caricamento assegnazione..." e' gia' in DOM a questo punto, prima di
  // qualunque fetch). Nessuna fase rallentata da questo marker.
  const pageMountRef = useRef(Boolean(import.meta.env.DEV) ? performance.now() : null);
  if (pageMountRef.current != null && !pageMountRef.logged) {
    pageMountRef.logged = true;
    console.info(`[DRIVER LOAD] PAGE_MOUNT=0ms (t0)`);
  }
  const {
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
  } = useDriverAssignment(assignmentId);

  if (loadingAssignment) {
    return (
      <main style={shellStyle}>
        <LoadingScreen />
      </main>
    );
  }

  if (assignmentError || !campaignId) {
    return (
      <main style={shellStyle}>
        <BlockedScreen error={assignmentError || 'Assegnazione non disponibile.'} />
      </main>
    );
  }

  return (
    <DriverTracker
      campaignId={campaignId}
      assignmentId={assignmentId}
      assignmentData={assignmentData}
      campaignRecord={campaignRecord}
      assignmentZones={assignmentZones}
      loadingProgramDetails={loadingProgramDetails}
      programDetailsError={programDetailsError}
      confirmedAt={confirmedAt}
      confirming={confirming}
      confirmationError={confirmationError}
      onConfirm={confirmAssignment}
      accessToken={accessToken}
    />
  );
}

// ─── DriverTracker ────────────────────────────────────────────────────────────
// Il componente reale del tracker. Separato per permettere il mount
// solo dopo che campaignId è risolto (evita chiamate con undefined).

function DriverTracker({ campaignId, assignmentId, assignmentData, campaignRecord, assignmentZones, loadingProgramDetails, programDetailsError, confirmedAt, confirming, confirmationError, onConfirm, accessToken }) {
  // Stesso riuso di DriverWorkMapPage.jsx: assignment/campaign gia'
  // validati da useDriverAssignment, passati a useGpsTracking per evitare
  // di rifare da zero gps_get_operator_campaign/getValidOperatorAssignments.
  const assignmentContext = useMemo(
    () => (assignmentData && campaignRecord ? { assignment: assignmentData, campaign: campaignRecord } : null),
    [assignmentData, campaignRecord],
  );
  const tracking = useGpsTracking(campaignId, { assignmentContext, accessToken, assignmentId });
  // FIRST_CONTENT_RENDER SOLO DEV: questo componente monta solo dopo che
  // loadingAssignment e' passato a false (Fase 1 conclusa) — il suo primo
  // effect e' quindi un buon segnale di "contenuto reale visibile",
  // indipendente da mappa/boundary/zone dettagliate.
  useEffect(() => {
    if (import.meta.env.DEV) console.info('[DRIVER LOAD] FIRST_CONTENT_RENDER (shell reale montata)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [section, setSection] = useState('home');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [battery, setBattery] = useState({ supported: false, level: null, charging: null });
  const [sosState, setSosState] = useState(null);
  const [boundary, setBoundary] = useState(null);

  // Parse metadata from assignment
  const meta = useMemo(() => safeJson(assignmentData?.metadata), [assignmentData]);
  const comuni = useMemo(() => meta.comuni || [], [meta]);
  const zoneLabels = useMemo(() => meta.zone_labels || [], [meta]);
  // Source of truth reale: somma delle quantita' per zona di QUESTA
  // assegnazione (operator_assignment_zones.quantity), mai il totale
  // campagna — un'assegnazione copre solo le sue zone. meta.qty resta
  // fallback solo se le zone strutturate non sono disponibili.
  const assignmentZonesQtySum = (assignmentZones || []).reduce((sum, z) => sum + (Number(z.quantity) || 0), 0);
  const qty = assignmentZonesQtySum > 0 ? assignmentZonesQtySum : (meta.qty || null);
  const assignmentNotes = meta.notes || null;
  const campaignTitle = meta.campaign_title || `Campagna ${String(campaignId).slice(0, 8)}`;
  const startsAt = assignmentData?.starts_at;
  const endsAt = assignmentData?.ends_at;
  const primaryComune = comuni[0] || null;

  const operatorName = tracking.session?.driver_name
    || tracking.session?.driverName
    || meta.operator_display_name
    || `Operatore ${String(tracking.session?.driver_id || assignmentData?.operator_id || 'assegnato').slice(0, 6)}`;

  // Zona attiva (source of truth reale per il centro mappa): campaign_zone_id
  // della sessione -> operator_assignment_zones/campaign_zones. zone_name qui
  // e' gia' operator_assignment_zones.municipality_name, cioe' il Comune gia'
  // risolto (mai una sotto-zona tipo "Saronno Centro" — vedi
  // useDriverAssignment.js), quindi ha priorita' sul confine: usarlo evita
  // che una campagna con piu' zone/comuni resti agganciata al comune
  // "principale" (campaign.city) anche quando la zona/sessione realmente
  // attiva e' un altro comune della stessa campagna.
  const activeAssignmentZoneId = tracking.session?.campaign_zone_id;
  const primaryAssignmentZone = (assignmentZones || []).find(z => z.id === activeAssignmentZoneId) || (assignmentZones || [])[0] || null;
  const zoneCenter = primaryAssignmentZone && primaryAssignmentZone.centerLat != null && primaryAssignmentZone.centerLng != null
    && !(primaryAssignmentZone.centerLat === 0 && primaryAssignmentZone.centerLng === 0)
    ? { lat: primaryAssignmentZone.centerLat, lng: primaryAssignmentZone.centerLng }
    : null;
  const realComuneName = primaryAssignmentZone?.zone_name || tracking.assignmentState.campaign?.city || primaryComune || null;

  // Confine reale del Comune (stessa fonte/algoritmo di Step2: Nominatim
  // validato sul centroide + fallback analysis-istat), MAI un cerchio
  // inventato. boundaryLoading distingue "in corso" da "non disponibile".
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  useEffect(() => {
    if (!realComuneName) { setBoundary(null); return; }
    let cancelled = false;
    setBoundaryLoading(true);
    resolveMunicipalityBoundary(realComuneName, { lat: zoneCenter?.lat, lng: zoneCenter?.lng })
      .then(geom => { if (!cancelled) setBoundary(geom); })
      .finally(() => { if (!cancelled) setBoundaryLoading(false); });
    return () => { cancelled = true; };
  }, [realComuneName, zoneCenter?.lat, zoneCenter?.lng]);

  // Prefetch del chunk della pagina Mappa (Leaflet + react-leaflet inclusi,
  // vedi import statici in cima a DriverWorkMapPage.jsx) DOPO che il
  // contenuto critico di questa pagina e' gia' visibile, a tempo perso
  // (requestIdleCallback, con setTimeout come fallback su browser/WebView
  // che non lo supportano). Nessun rendering, nessuno stato: e' lo stesso
  // import() dinamico gia' usato da main.jsx per questa route, chiamato qui
  // in anticipo solo per scaldare la cache del browser. Se l'utente non apre
  // mai la Mappa, l'unico costo e' un download in background a bassa
  // priorita' — mai prima del first render del Driver.
  useEffect(() => {
    const prefetch = () => { import('./DriverWorkMapPage.jsx').catch(() => {}); };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prefetch, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 1500);
    return () => clearTimeout(id);
  }, []);

  // Battery status
  useEffect(() => {
    if (!navigator.getBattery) return;
    let mgr = null;
    const update = () => {
      if (!mgr) return;
      setBattery({ supported: true, level: Math.round(mgr.level * 100), charging: mgr.charging });
    };
    navigator.getBattery().then(m => {
      mgr = m;
      update();
      m.addEventListener('levelchange', update);
      m.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      if (!mgr) return;
      mgr.removeEventListener('levelchange', update);
      mgr.removeEventListener('chargingchange', update);
    };
  }, []);

  const currentPos = tracking.lastPosition;

  // "Fuori area" e distanza si basano SOLO sul confine reale del Comune
  // (point-in-polygon + distanza dal bordo, entrambe utility gia' condivise
  // e testate). Senza un confine risolto non si puo' determinare dentro/fuori:
  // nessun avviso inventato, nessun cerchio di fallback (ticket esplicito).
  const outOfZone = Boolean(currentPos && boundary && tracking.isActive && !geoJsonContainsPoint(boundary, currentPos.lat, currentPos.lng));
  const zoneDistanceM = outOfZone && currentPos && boundary
    ? estimateDistanceToZoneBoundaryMeters([{ kind: 'polygon', geometry: boundary }], currentPos.lat, currentPos.lng)
    : null;
  // Audit "zona completata ma KPI 0%": Completamento veniva calcolato SOLO
  // dalla distanza GPS live della sessione GPS corrente (estimateCompletion),
  // mai dallo stato zone persistito — un lavoro completato tramite una
  // sessione GPS PASSATA (nessuna sessione attiva in QUESTO page load, quindi
  // tracking.distanceKm riparte da 0) mostrava sempre 0%, anche a zone
  // realmente completate. Solo le zone STRUTTURATE (assignmentZones, mai le
  // fallbackZones sintetizzate da comuni piu' sotto quando mancano zone
  // reali) hanno uno status persistito da poter contare — source of truth
  // ora e' completedZones/totalZones, non piu' la distanza.
  const totalZonesCount = (assignmentZones || []).length;
  const completedZonesCount = (assignmentZones || []).filter(z => z.status === 'Completata').length;
  const allZonesCompleted = totalZonesCount > 0 && completedZonesCount === totalZonesCount;
  const completion = totalZonesCount > 0 ? Math.round((completedZonesCount / totalZonesCount) * 100) : 0;

  // Assegnazione revocata con sessione già in corso: Start/Pausa/Riprendi
  // restano bloccati lato UI (il backend li rifiuta comunque — è la
  // source of truth), solo Termina/Annulla restano permessi.
  const isRevoked = assignmentData?.status === 'revoked';
  const assignmentBlocksStart = isRevoked
    || (!tracking.isActive && !tracking.isPaused && tracking.assignmentStatus !== 'ready');

  // Riconciliazione: esiste gia' una sessione attiva per questo incarico che
  // questo device NON puo' riagganciare (avviata da un altro dispositivo/
  // browser, oppure classificata abbandonata da recuperare). Il server
  // rifiutera' comunque un nuovo Start con ACTIVE_SESSION_EXISTS: non
  // proporre "Inizia"/"Riprendi zona" — mostrare lo stato e rimandare
  // all'Admin. NON tocca il controllo anti-doppio-dispositivo lato server:
  // e' solo la UI che smette di offrire un'azione che non puo' riuscire.
  const activeSessionElsewhere = tracking.resumeNotice?.level === 'blocked';
  const primaryAction = actionLoading
    ? `${actionLoading}...`
    : tracking.isActive ? 'Pausa'
    : tracking.isPaused ? 'Riprendi'
    : tracking.assignmentStatus === 'loading' ? 'Verifica...'
    : 'Inizia tracciamento';

  const fallbackZones = comuni.length > 0 ? comuni.map(c => ({
    id: null,
    zone_name: c,
    priority: 999,
    quantity: null,
    status: 'Da iniziare',
    notes: null,
    isLegacy: true
  })) : [];
  const zonesToDisplay = assignmentZones?.length > 0 ? assignmentZones : fallbackZones;

  // Etichette azione: ogni pulsante e' disabilitato SOLO mentre gira la
  // PROPRIA azione, non per un qualunque actionLoading. Cosi' un'azione lenta
  // o appesa (es. una pausa su rete ballerina) non puo' piu' intrappolare
  // "Termina lavoro" — che per una sessione attiva deve restare sempre la
  // via d'uscita. (Il tetto di timeout su pause/resume in useGpsTracking
  // sblocca comunque actionLoading; questo e' il presidio a livello UI.)
  const ACTION_START = 'Avvio zona...';
  const ACTION_REOPEN = 'Riapro zona...';
  const ACTION_PAUSE = 'Pausa...';
  const ACTION_RESUME = 'Riprendo...';
  const ACTION_END = 'Termino sessione...';

  async function runAction(label, fn) {
    setActionError(null);
    setActionLoading(label);
    try { await fn(); }
    catch (err) { setActionError(err?.message || 'Operazione non riuscita.'); }
    finally { setActionLoading(null); }
  }

  function sendSos() {
    const event = {
      type: 'sos', assignmentId, campaignId, operatorName,
      lat: currentPos?.lat ?? null, lng: currentPos?.lng ?? null,
      recordedAt: new Date().toISOString(),
    };
    try {
      const key = 'volantinipro:operator-events';
      const prev = JSON.parse(window.localStorage.getItem(key) || '[]');
      window.localStorage.setItem(key, JSON.stringify([...prev, event].slice(-100)));
    } catch { /* ignore */ }
    setSosState('SOS registrato localmente con ultima posizione disponibile.');
  }

  function openGoogleMaps() {
    if (currentPos) {
      window.open(`https://www.google.com/maps?q=${currentPos.lat},${currentPos.lng}`, '_blank', 'noopener,noreferrer');
    } else if (primaryComune) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(primaryComune + ', Italy')}`, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <main style={shellStyle}>
      {outOfZone && (
        <div style={alertBannerStyle}>
          ⚠️ Operatore fuori area assegnata{formatDistanceLabel(zoneDistanceM) ? ` — a ${formatDistanceLabel(zoneDistanceM)} dalla zona` : ''}. Rientra nell'area di lavoro.
        </div>
      )}

      <header style={topBarStyle}>
        <div style={avatarStyle}>{operatorName.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <p style={eyebrowStyle}>App operatore</p>
          <h1 style={titleStyle}>{operatorName}</h1>
          <p style={mutedStyle}>{campaignTitle}</p>
        </div>
        <StatusBadge status={tracking.status} network={tracking.networkStatus} allZonesCompleted={allZonesCompleted} />
      </header>

      {/* Errors */}
      {tracking.assignmentError && <Notice id="op-assign-error" danger text={tracking.assignmentError} />}
      {tracking.error && <Notice danger text={tracking.error} />}
      {actionError && <Notice danger text={actionError} />}
      {tracking.resumeNotice?.level === 'blocked' && <Notice id="gps-resume-blocked" danger text={tracking.resumeNotice.message} />}
      {tracking.resumeNotice?.level === 'error' && <Notice id="gps-resume-error" danger text={tracking.resumeNotice.message} />}
      {tracking.resumeNotice?.level === 'warning' && <Notice id="gps-resume-warning" text={tracking.resumeNotice.message} />}
      {tracking.isPaused && <Notice id="gps-paused" text="Lavoro in pausa — il GPS non registra nuovi punti finche' non riprendi." />}
      {sosState && <Notice text={sosState} />}
      {/* Fallimento di una query secondaria (conferma/campagna/zone): un
          avviso locale, mai la schermata globale "Accesso non disponibile"
          — l'autorizzazione di base (Fase 1) e' gia' stata validata. */}
      {programDetailsError && <Notice danger text={programDetailsError} />}

      {/* Assignment info card */}
      <section style={heroCardStyle}>
        <p style={eyebrowStyle}>Lavoro assegnato</p>
        <h2 style={campaignTitleStyle}>{campaignTitle}</h2>
        <div style={summaryGridStyle}>
          <Metric label="Quantità totale" value={qty ? `${Number(qty).toLocaleString('it-IT')} volantini` : 'Non specificata'} />
          <Metric label="Data" value={startsAt ? new Date(startsAt).toLocaleDateString('it-IT') : 'Da definire'} />
          {endsAt && <Metric label="Scadenza" value={new Date(endsAt).toLocaleDateString('it-IT')} />}
          {assignmentNotes && <Metric label="Note admin" value={assignmentNotes} />}
        </div>
        <div style={telemetryGridStyle}>
          <Telemetry label="Precisione GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'In attesa'} tone={tracking.accuracy != null && tracking.accuracy <= 50 ? 'good' : 'warn'} />
          <Telemetry label="Batteria" value={battery.supported ? `${battery.level}%${battery.charging ? ' · ⚡' : ''}` : 'n/d'} tone={battery.supported && battery.level < 20 ? 'bad' : 'good'} />
          <Telemetry label="Rete" value={tracking.networkStatus === 'online' ? 'Online' : 'Offline'} tone={tracking.networkStatus === 'online' ? 'good' : 'warn'} />
          <Telemetry label="Assegnazione" value={assignmentLabel(tracking.assignmentStatus)} tone={tracking.assignmentStatus === 'ready' ? 'good' : tracking.assignmentStatus === 'loading' ? 'warn' : 'bad'} />
          {tracking.queueSize > 0 && <Telemetry label="Coda offline" value={tracking.queueSize} tone="warn" />}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Presa in carico</p>
        {confirmedAt ? (
          <div role="status" style={{ color: '#86EFAC', fontWeight: 900, marginTop: 8 }}>
            ✓ Programma confermato
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.58)' }}>
              Confermato alle {new Date(confirmedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ) : loadingProgramDetails ? (
          // Stato conferma non ancora noto (Fase 2 in corso): placeholder
          // neutro, mai il pulsante prima di sapere se e' gia' confermato.
          <p style={{ ...mutedStyle, marginTop: 8 }}>Verifica stato conferma...</p>
        ) : (
          <>
            <button type="button" style={{ ...primaryButtonStyle, width: '100%', marginTop: 10 }} disabled={confirming} onClick={onConfirm}>
              {confirming ? 'Conferma in corso...' : 'Confermo e prendo in carico'}
            </button>
            <p style={{ ...mutedStyle, marginTop: 8 }}>Conferma di aver ricevuto e verificato il programma di lavoro.</p>
            {confirmationError && <p role="alert" style={{ color: '#FCA5A5', margin: '8px 0 0', fontSize: 12 }}>{confirmationError}</p>}
          </>
        )}
      </section>

      {/* Programma Operativo (Structured Zones) */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Programma Operativo</p>
        {assignmentZones === null ? (
          // Fase 2 ancora in corso (operator_assignment_zones non arrivata):
          // messaggio locale SOLO in questa sezione, mai un blocco dell'intera
          // pagina — l'accesso base e' gia' autorizzato.
          <p style={{ ...mutedStyle, marginTop: 8 }}>Caricamento programma...</p>
        ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {zonesToDisplay.map((z, idx) => {
            const isCurrentZone = tracking.session?.campaign_zone_id === z.id && z.id != null;
            
            let statusPill = z.status;
            let statusColor = '#94a3b8'; // Da iniziare
            if (z.status === 'In corso') statusColor = '#3b82f6';
            if (z.status === 'Completata') statusColor = '#22c55e';
            if (z.isLegacy) {
              statusPill = 'Legacy (Sola lettura)';
              statusColor = '#f59e0b';
            }

            return (
              <div key={z.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: isCurrentZone ? '#f0fdf4' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                      <span style={{ color: '#64748b', marginRight: 6 }}>{idx + 1}.</span>
                      {z.zone_name}
                    </h3>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {z.quantity != null && <span style={{ fontSize: 13, color: '#475569' }}>Qtà: {Number(z.quantity).toLocaleString('it-IT')}</span>}
                      <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, background: statusColor, color: '#fff' }}>
                        {statusPill}
                      </span>
                    </div>
                  </div>
                </div>
                {z.notes && <p style={{ margin: '8px 0', fontSize: 13, color: '#64748b' }}>Note: {z.notes}</p>}
                
                {!z.isLegacy && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    {/* Avvio zona: disponibile anche quando la zona risulta
                        "Completata" ma nessuna sessione e' attiva — con 11.701
                        volantini una zona non e' mai "finita" dopo una sola
                        sessione breve, e senza questo pulsante il Driver che
                        riapre il link non ha alcun modo di ripartire (root
                        cause "Admin resta offline"). gps_start_session rimette
                        gia' la zona a "In corso" lato server. */}
                    {!isCurrentZone && !tracking.isActive && !tracking.isPaused && !activeSessionElsewhere && (
                      <button
                        type="button"
                        style={{ ...primaryButtonStyle, padding: '8px 12px', fontSize: 14, flex: 1 }}
                        disabled={Boolean(actionLoading) || assignmentBlocksStart}
                        onClick={() => runAction(z.status === 'Completata' ? ACTION_REOPEN : ACTION_START, () => tracking.start(z.id))}
                      >
                        {z.status === 'Completata' ? 'Riprendi zona' : 'Inizia'}
                      </button>
                    )}
                    {!isCurrentZone && !tracking.isActive && !tracking.isPaused && activeSessionElsewhere && (
                      <span style={{ fontSize: 13, color: '#b91c1c', flex: 1 }}>
                        Sessione gia&#39; attiva per questo incarico. Non puoi avviarne un&#39;altra da qui — contatta l&#39;Admin.
                      </span>
                    )}
                    {isCurrentZone && tracking.isActive && (
                      <button
                        type="button"
                        style={{ ...secondaryButtonStyle, padding: '8px 12px', fontSize: 14, flex: 1 }}
                        disabled={actionLoading === ACTION_PAUSE}
                        onClick={() => runAction(ACTION_PAUSE, tracking.pause)}
                      >
                        Metti in pausa
                      </button>
                    )}
                    {isCurrentZone && tracking.isPaused && (
                      <button
                        type="button"
                        style={{ ...primaryButtonStyle, padding: '8px 12px', fontSize: 14, flex: 1 }}
                        disabled={actionLoading === ACTION_RESUME}
                        onClick={() => runAction(ACTION_RESUME, tracking.resume)}
                      >
                        Riprendi lavoro
                      </button>
                    )}
                    {isCurrentZone && (tracking.isActive || tracking.isPaused) && (
                      <button
                        type="button"
                        style={{ ...dangerButtonStyle, padding: '8px 12px', fontSize: 14, flex: 1 }}
                        disabled={actionLoading === ACTION_END}
                        onClick={() => {
                          // Conferma esplicita. "Termina lavoro" chiude SOLO la
                          // delivery_session di questo operatore (status =
                          // completed, nessun nuovo GPS dopo). NON marca la
                          // campaign_zone come "Completata" e NON completa la
                          // campagna: la zona resta "In corso" per gli altri
                          // operatori del gruppo finche' Admin/criterio finale
                          // non la chiude. Prima chiamava anche completeZone(),
                          // che tramite gps_transition_zone('complete') metteva
                          // la zona a "Completata" per tutti — root cause del
                          // blocco "il Driver riapre e non riparte".
                          if (!window.confirm('Confermi di aver terminato il lavoro assegnato? La tua sessione GPS verra\' chiusa. La zona resta comunque aperta per gli altri operatori.')) return;
                          runAction(ACTION_END, async () => {
                            await tracking.end();
                            // A small timeout to let the UI refresh (or let the polling catch up)
                            window.setTimeout(() => window.location.reload(), 1000);
                          });
                        }}
                      >
                        Termina lavoro
                      </button>
                    )}
                    {z.status === 'Completata' && (tracking.isActive || tracking.isPaused || isCurrentZone) && (
                      <span style={{ color: '#22c55e', fontSize: 14, fontWeight: 'bold' }}>✓ Completata</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </section>

      {/* Controls */}
      <section style={controlsCardStyle}>
        <button type="button" style={secondaryButtonStyle} onClick={() => navigateDriver(driverPathWithQuery(`/driver/assignment/${assignmentId}/map`))}>Mappa</button>
        <button type="button" style={secondaryButtonStyle} onClick={openGoogleMaps}>Google Maps</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => { setSection('photo'); window.setTimeout(() => fileInputRef.current?.click(), 120); }}>Foto</button>
        <button type="button" style={secondaryButtonStyle} onClick={() => setSection('report')}>Report</button>
        <button type="button" style={sosButtonStyle} onClick={sendSos}>SOS</button>
      </section>

      {/* Home section */}
      {section === 'home' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Stato lavoro</p>
          <div style={summaryGridStyle}>
            <Metric label="Distanza GPS totale" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Completamento" value={`${completion}%`} />
            <Metric label="Velocità" value={tracking.speed != null ? `${Math.round(tracking.speed * 3.6)} km/h` : 'n/d'} />
            <Metric label="Direzione" value={tracking.heading != null ? `${Math.round(tracking.heading)}°` : 'n/d'} />
            <Metric label="Ultimo invio" value={tracking.lastSentAt ? formatTime(tracking.lastSentAt) : 'In attesa'} />
            <Metric label="Sessione" value={formatDuration(sessionMs(tracking.session))} />
          </div>
        </section>
      )}

      {/* Photo section — riusa il componente PodCapture gia' usato da TrackingPage.jsx
          (validazione, compressione, watermark: src/lib/pod/podPhotoProcessing.js),
          invece del modulo photo-proof.js che non esiste in questo worktree. */}
      {section === 'photo' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Foto prova</p>
          <h2 style={{ margin: '4px 0 14px', color: '#fff', fontSize: 18 }}>Scatto geolocalizzato</h2>
          <PodCapture
            campaignId={campaignId}
            sessionId={tracking.session?.id || null}
            lastPosition={currentPos}
            driverName={operatorName}
            onUploaded={() => {}}
          />
        </section>
      )}

      {/* Report section */}
      {section === 'report' && (
        <section style={cardStyle}>
          <p style={eyebrowStyle}>Report operatore</p>
          <div style={summaryGridStyle}>
            <Metric label="Tempo" value={formatDuration(sessionMs(tracking.session))} />
            <Metric label="Km" value={`${tracking.distanceKm.toFixed(2)} km`} />
            <Metric label="Completamento" value={`${completion}%`} />
            <Metric label="Precisione GPS" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'n/d'} />
            <Metric label="Comuni assegnati" value={comuni.join(', ') || 'Tutti'} />
            {qty && <Metric label="Quantità assegnata" value={`${Number(qty).toLocaleString('it-IT')} volantini`} />}
          </div>
        </section>
      )}

      {/* Prima era un testo statico ("Coda GPS offline...") mostrato SEMPRE,
          anche a rete online e coda vuota — leggibile come "il GPS e' offline
          adesso" mentre non lo era affatto (audit: nessuna vera coda foto/SOS
          esiste, solo tracking.queueSize e' un dato reale). Ora riflette lo
          stato vero: rassicurante quando non c'e' nulla in coda, informativo
          sul conteggio reale quando c'e' davvero qualcosa da inviare. */}
      <p style={disclaimerStyle}>
        {tracking.queueSize > 0
          ? `${tracking.queueSize} ${tracking.queueSize === 1 ? 'punto GPS' : 'punti GPS'} in coda locale: verranno inviati appena la rete torna disponibile.`
          : 'Protezione offline attiva: se perdi la rete, i punti GPS restano salvati sul dispositivo e vengono inviati appena torni online.'}
      </p>
    </main>
  );
}


// ─── Sub-components ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(232,87,26,.3)', borderTop: '3px solid #e8571a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}>Caricamento assegnazione...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BlockedScreen({ error }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <h2 style={{ color: '#fff', textAlign: 'center', fontSize: 20, margin: 0 }}>Accesso non disponibile</h2>
      <p style={{ color: '#fca5a5', textAlign: 'center', maxWidth: 400, lineHeight: 1.6, fontSize: 14 }}>{error}</p>
      <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, textAlign: 'center' }}>
        Assicurati di essere loggato con l'account corretto e che l'assegnazione sia attiva.
      </p>
    </div>
  );
}

function StatusBadge({ status, network, allZonesCompleted }) {
  const isActive = status === 'active';
  // Verde anche per "Lavoro completato" (stesso significato pratico di
  // "andato a buon fine" di Online/Terminato), non il grigio neutro di
  // "non ancora avviato" — solo quando lo stato live non e' gia'
  // attivo/paused (quei due restano invariati, priorita' allo stato live).
  const isDoneLike = status === 'completed' || (allZonesCompleted && status !== 'active' && status !== 'paused' && status !== 'permission_error');
  const color = isActive ? '#2ECC8A' : status === 'paused' ? '#FBBF24' : isDoneLike ? '#2ECC8A' : '#94A3B8';
  return (
    <div style={{ ...statusBadgeStyle, borderColor: `${color}55`, color }}>
      <strong>{statusLabel(status, { allZonesCompleted })}</strong>
      <span>{network}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <strong style={{ color: '#fff', fontSize: 14, lineHeight: 1.3 }}>{value}</strong>
    </div>
  );
}

function Telemetry({ label, value, tone }) {
  const color = tone === 'bad' ? '#F87171' : tone === 'warn' ? '#FBBF24' : '#2ECC8A';
  return (
    <div style={{ ...telemetryStyle, borderColor: `${color}33` }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger = false, id }) {
  return (
    <div id={id} role={danger ? 'alert' : 'status'} style={{
      maxWidth: 760,
      margin: '0 auto 10px',
      padding: 12,
      borderRadius: 14,
      background: 'rgba(255,255,255,.05)',
      border: `1px solid ${danger ? 'rgba(248,113,113,.35)' : 'rgba(46,204,138,.32)'}`,
      color: danger ? '#FCA5A5' : '#86EFAC',
      fontSize: 13,
      fontWeight: 750,
    }}>
      {text}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function assignmentLabel(status) {
  if (status === 'ready')   return 'Valida';
  if (status === 'loading') return 'Verifica';
  if (status === 'blocked') return 'Bloccata';
  return 'In attesa';
}

// Audit "GPS risulta offline": questa era 'Offline' per QUALUNQUE stato non
// esplicitamente elencato — inclusi 'idle' (stato iniziale, prima di
// premere Start/senza sessione attiva) e 'completed'. 'Offline' legge come
// "il GPS e' rotto/disconnesso", ma 'idle' significa solo "non ancora
// avviato" — una condizione normale, non un errore. tracking.networkStatus
// (mostrato separatamente come "Rete") resta l'UNICA fonte reale per la
// connettivita'; questa label riguarda solo lo stato della sessione GPS.
//
// Audit "zona completata ma stato ambiguo": 'idle' copriva DUE casi molto
// diversi — "non ancora iniziato" E "lavoro gia' completato (magari in una
// sessione GPS passata), nessuna sessione live in questo page load" —
// entrambi mostravano "GPS non avviato", leggibile come "devi ancora
// iniziare" anche a lavoro finito. allZonesCompleted (derivato dallo stato
// zone persistito, vedi DriverTracker) distingue i due casi SOLO quando lo
// stato live non e' gia' esplicito (active/paused/permission_error restano
// sempre prioritari e invariati — vedi test D/E).
function statusLabel(status, { allZonesCompleted = false } = {}) {
  if (status === 'active')           return 'Online';
  if (status === 'paused')           return 'Pausa';
  if (status === 'permission_error') return 'GPS bloccato';
  if (status === 'completed')        return 'Terminato';
  if (allZonesCompleted)             return 'Lavoro completato';
  return 'GPS non avviato';
}

function sessionMs(session) {
  if (!session?.started_at) return 0;
  const start = new Date(session.started_at).getTime();
  const end   = new Date(session.ended_at || session.paused_at || Date.now()).getTime();
  return Math.max(0, end - start);
}

function formatDuration(ms) {
  const total   = Math.floor(ms / 1000);
  const hours   = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTime(v) {
  return new Date(v).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shellStyle = {
  minHeight: '100dvh',
  padding: '14px 12px 40px',
  background: '#071426',
  color: 'rgba(255,255,255,.9)',
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
};
const topBarStyle = {
  display: 'grid',
  gridTemplateColumns: '52px minmax(0,1fr) auto',
  gap: 12,
  alignItems: 'center',
  margin: '0 auto 14px',
  maxWidth: 760,
};
const avatarStyle = {
  width: 52,
  height: 52,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg,#203752,#0f2238)',
  border: '1px solid rgba(255,255,255,.12)',
  color: '#fff',
  fontWeight: 900,
  fontSize: 22,
};
const eyebrowStyle = {
  margin: 0,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.12em',
  color: 'rgba(255,255,255,.48)',
  fontWeight: 900,
};
const titleStyle = { margin: 0, color: '#fff', fontSize: 18, lineHeight: 1.1 };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 12, lineHeight: 1.45 };
const statusBadgeStyle = {
  minWidth: 86,
  border: '1px solid',
  borderRadius: 14,
  padding: '8px 10px',
  display: 'grid',
  gap: 2,
  justifyItems: 'end',
  background: 'rgba(255,255,255,.04)',
  fontSize: 11,
};
const heroCardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  padding: 16,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.1)',
  background: 'linear-gradient(180deg,rgba(18,32,54,.96),rgba(12,25,44,.96))',
  boxShadow: '0 20px 50px rgba(0,0,0,.25)',
};
const cardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  padding: 16,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,.09)',
  background: 'rgba(18,32,54,.86)',
  boxShadow: '0 14px 34px rgba(0,0,0,.2)',
};
const campaignTitleStyle = {
  margin: '5px 0 14px',
  color: '#fff',
  fontSize: 22,
  lineHeight: 1.05,
  letterSpacing: '-.02em',
};
const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
};
const telemetryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
  marginTop: 12,
};
const controlsCardStyle = {
  maxWidth: 760,
  margin: '0 auto 12px',
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
  gap: 10,
};
const primaryButtonStyle = {
  minHeight: 58,
  border: 'none',
  borderRadius: 16,
  padding: '0 18px',
  background: '#2ECC8A',
  color: '#071426',
  fontWeight: 950,
  fontSize: 17,
  cursor: 'pointer',
  boxShadow: '0 14px 28px rgba(46,204,138,.24)',
};
const secondaryButtonStyle = {
  minHeight: 54,
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 16,
  padding: '0 14px',
  background: 'rgba(255,255,255,.06)',
  color: '#fff',
  fontWeight: 850,
  fontSize: 15,
  cursor: 'pointer',
};
const dangerButtonStyle = {
  ...secondaryButtonStyle,
  background: 'rgba(248,113,113,.15)',
  border: '1px solid rgba(248,113,113,.32)',
  color: '#FCA5A5',
};
const sosButtonStyle = {
  ...secondaryButtonStyle,
  background: 'rgba(248,113,113,.22)',
  border: '1px solid rgba(248,113,113,.45)',
};
const metricStyle = {
  minHeight: 70,
  padding: 11,
  borderRadius: 14,
  background: 'rgba(255,255,255,.055)',
  border: '1px solid rgba(255,255,255,.08)',
  display: 'grid',
  alignContent: 'space-between',
};
const telemetryStyle = {
  padding: 11,
  borderRadius: 14,
  background: 'rgba(255,255,255,.045)',
  border: '1px solid rgba(255,255,255,.08)',
  display: 'grid',
  gap: 5,
};
const alertBannerStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  maxWidth: 760,
  margin: '0 auto 10px',
  borderRadius: 14,
  padding: 12,
  background: '#EF4444',
  color: '#fff',
  fontWeight: 950,
  textAlign: 'center',
};
const fileInputStyle = {
  minHeight: 54,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.8)',
  padding: 13,
};
const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 90,
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.05)',
  color: '#fff',
  padding: 13,
  font: 'inherit',
  resize: 'vertical',
};
const disclaimerStyle = {
  maxWidth: 760,
  margin: '0 auto',
  color: 'rgba(255,255,255,.4)',
  fontSize: 11,
  lineHeight: 1.5,
  padding: '0 4px',
};
