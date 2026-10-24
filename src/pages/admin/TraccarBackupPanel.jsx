import React, { useMemo, useRef, useState } from 'react';
import { traccarAdminControl } from '../../lib/services/traccar-api.js';
import { buildTraccarServerUrl, createTraccarCredentials } from '../../lib/traccar/backupUrl.js';
import './traccar-backup.css';

const formatTime = value => value ? new Date(value).toLocaleString('it-IT') : 'Non disponibile';
const statusLabel = { started: 'Avviata', paused: 'In pausa', completed: 'Chiusa', cancelled: 'Annullata' };

export default function TraccarBackupPanel({ control = traccarAdminControl, credentials = createTraccarCredentials }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [hours, setHours] = useState(2);
  const [bypass, setBypass] = useState('');
  const [connection, setConnection] = useState(null);
  const [showUrl, setShowUrl] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null);
  // Retain credentials on an uncertain network result: retrying start with the
  // same hash recovers the same session, rather than creating another one.
  const startAttempt = useRef(null);
  const inFlight = useRef(false);
  const campaigns = useMemo(() => Array.from(new Map((data?.assignments || []).map(a => [a.campaign_id, a.campaign_title])).entries()), [data]);
  const assignments = (data?.assignments || []).filter(a => a.campaign_id === campaignId);
  const preview = typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app');
  let serverUrl = '';
  let urlError = '';
  if (connection && typeof window !== 'undefined') {
    try { serverUrl = buildTraccarServerUrl(`${window.location.origin}/api/gps/traccar`, connection.key, preview ? bypass : ''); }
    catch (e) { urlError = e.message; }
  }

  async function load() {
    setLoading(true); setError('');
    try {
      const result = await control('list');
      if (!Array.isArray(result.assignments) || !Array.isArray(result.sessions)) throw new Error('Risposta Piano B non valida');
      setData(result);
    } catch (e) { setError(e.message || 'Caricamento Piano B non riuscito'); }
    finally { setLoading(false); }
  }
  async function act(run) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await run(); await load(); }
    catch (e) { setError(e.message || 'Operazione Piano B non riuscita'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function start(event) {
    event.preventDefault();
    return act(async () => {
      const fingerprint = JSON.stringify([campaignId,assignmentId,deviceId,Number(hours)]);
      if (startAttempt.current?.fingerprint !== fingerprint) {
        startAttempt.current = { fingerprint, ...(await credentials()) };
      }
      const attempt = startAttempt.current;
      const result = await control('start', { p_campaign_id: campaignId, p_assignment_id: assignmentId,
        p_device_id: deviceId, p_token_hash: attempt.tokenHash, p_hours: Number(hours) });
      setConnection({ key: attempt.key, deviceId, sessionId: result.session_id });
      setShowUrl(false);
      setNotice(`Piano B avviato senza app Driver. Autorizzato fino a ${formatTime(result.enabled_until)}.`);
    });
  }
  function close(row) {
    return act(async () => {
      await control('close', { p_session_id: row.id });
      if (connection?.sessionId === row.id) setConnection(null);
      startAttempt.current = null; setConfirmClose(null);
      setNotice('Sessione Piano B chiusa. Nuovi punti non saranno accettati.');
    });
  }
  function rotate(row) {
    return act(async () => {
      const next = await credentials();
      await control('rotate_key', { p_session_id: row.id, p_token_hash: next.tokenHash });
      setConnection({ key: next.key, deviceId: row.device_id, sessionId: row.id });
      setShowUrl(false); startAttempt.current = null;
      setNotice('Nuovo URL generato: sostituisci quello precedente in Traccar. La scadenza del turno non cambia.');
    });
  }
  async function copyUrl() {
    try { await navigator.clipboard.writeText(serverUrl); setNotice('URL privato copiato. Incollalo nel campo Server di Traccar Client.'); }
    catch { setShowUrl(true); setNotice('Copia automatica non disponibile: seleziona e copia l’URL mostrato.'); }
  }

  return (
    <details className="traccar-backup" onToggle={e => { if (e.currentTarget.open && data === null && !loading) load(); }}>
      <summary>Piano B GPS · Traccar</summary>
      <div className="traccar-backup__body">
        <p>Avvia e chiudi il GPS dal pannello Admin anche se l’app Driver non funziona. Occorrono un operatore già assegnato e una campagna in corso.</p>
        <button type="button" onClick={load} disabled={loading || busy}>Aggiorna Piano B</button>
        {loading && <p role="status">Caricamento Piano B…</p>}
        {error && <p role="alert">{error} {data && 'Sono mostrati gli ultimi dati caricati.'}</p>}
        {notice && <p role="status">{notice}</p>}
        {!loading && !error && data && data.assignments.length === 0 && <p>Nessuna assegnazione attiva disponibile. Prepara prima il lavoro nel normale flusso Admin.</p>}
        {data && (
          <>
            <form onSubmit={start} className="traccar-backup__form">
              <label>Campagna<select required value={campaignId} disabled={busy || loading} onChange={e => { setCampaignId(e.target.value); setAssignmentId(''); }}>
                <option value="">Scegli campagna</option>
                {campaigns.map(([id,title]) => <option key={id} value={id}>{title}</option>)}
              </select></label>
              <label>Operatore assegnato<select required value={assignmentId} disabled={busy || loading || !campaignId} onChange={e => setAssignmentId(e.target.value)}>
                <option value="">Scegli operatore</option>
                {assignments.map(a => <option key={a.id} value={a.id}>{a.operator_label}</option>)}
              </select></label>
              <label>Device ID Traccar<input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} value={deviceId} disabled={busy} onChange={e => setDeviceId(e.target.value)} placeholder="RAGAZZO01" autoComplete="off" /></label>
              <label>Durata massima (ore)<input required type="number" min="1" max="24" step="1" value={hours} disabled={busy} onChange={e => setHours(e.target.value)} /></label>
              <button type="submit" disabled={busy || loading || !assignmentId || !deviceId}>Avvia Piano B GPS</button>
            </form>
            <p>La sessione termina di ricevere punti alla scadenza o quando la chiudi. Il limite dell’assegnazione può abbreviare la durata scelta.</p>
            {preview && <label className="traccar-backup__secret">Bypass Vercel per il tuo collaudo
              <input type="password" value={bypass} onChange={e => setBypass(e.target.value)} autoComplete="off" spellCheck={false} />
              <span>Incolla qui il segreto di Protection Bypass for Automation. Non viene salvato. Consente accesso ai deployment del progetto: non distribuirlo agli operatori.</span>
            </label>}
            {connection && <div className="traccar-backup__connection">
              <p>Device ID: <strong>{connection.deviceId}</strong>. Copia l’URL completo nel campo Server di Traccar Client.</p>
              {preview && !bypass && <p role="alert">Preview protetta: aggiungi il bypass Vercel prima di copiare l’URL per il telefono.</p>}
              {urlError && <p role="alert">{urlError}</p>}
              <label>URL Server privato<input type={showUrl ? 'text' : 'password'} readOnly value={serverUrl} autoComplete="off" /></label>
              <button type="button" disabled={!serverUrl || (preview && !bypass)} onClick={copyUrl}>Copia URL Server</button>
              <button type="button" onClick={() => setShowUrl(v => !v)}>{showUrl ? 'Nascondi URL' : 'Mostra URL'}</button>
              <p>La chiave non è recuperabile dopo un ricaricamento. Usa “Rigenera URL” per sostituirla.</p>
            </div>}
            {data.sessions.length === 0 ? <p>Nessuna sessione Piano B registrata.</p> : (
              <ul className="traccar-backup__sessions">{data.sessions.map(row => <li key={row.id}>
                <strong>{row.operator_label} · {row.campaign_title}</strong>
                <p>{row.device_id} · {statusLabel[row.status] || row.status} · Scadenza: {formatTime(row.enabled_until)}</p>
                <p>Ultimo punto Traccar: {row.last_point_at ? formatTime(row.last_point_at) : 'Nessun punto ricevuto'}</p>
                {['started','paused'].includes(row.status) && <div>
                  <button type="button" disabled={busy} onClick={() => setConfirmClose(row.id)}>Chiudi sessione GPS</button>
                  <button type="button" disabled={busy || row.status !== 'started' || !row.enabled || new Date(row.enabled_until).getTime() <= Date.now()} onClick={() => rotate(row)}>Rigenera URL</button>
                  {confirmClose === row.id && <div role="group" aria-label={`Conferma chiusura ${row.device_id}`}>
                    <p>Chiudere questa sessione Piano B? Traccar non potrà più salvare punti per questo lavoro.</p>
                    <button type="button" disabled={busy} onClick={() => close(row)}>Conferma chiusura</button>
                    <button type="button" disabled={busy} onClick={() => setConfirmClose(null)}>Annulla</button>
                  </div>}
                </div>}
              </li>)}</ul>
            )}
          </>
        )}
      </div>
    </details>
  );
}
