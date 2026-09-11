import React, { useEffect, useRef, useState } from 'react';
import FeasibilityConversation from './FeasibilityConversation.jsx';
import FeasibilitySummary from './FeasibilitySummary.jsx';
import { money, number } from './FeasibilityReport.jsx';
import { FIELDS, nextMissing, scenariosFromHistory, validationErrors } from './feasibilitySchemas.js';
import { calculateFeasibility } from './feasibilityEngine.js';
import { applyEvidence } from './feasibilityAi.js';
import { readFeasibility, saveFeasibility, STORAGE_KEY } from './feasibilityStorage.js';
import './feasibility.css';
import { commerce, analysisToken, errorText } from './feasibilityCommerce.js';
import { formatServiceLabel } from '../../../lib/feasibility/entryPoint.js';
import FeasibilityPurchase from './FeasibilityPurchase.jsx';
import FeasibilityModeChoice from './business/FeasibilityModeChoice.jsx';
import FeasibilityBusinessFlow from './business/FeasibilityBusinessFlow.jsx';

export default function FeasibilityPage({ onNav }) {
  const [state, setState] = useState(() => readFeasibility(typeof window === 'undefined' ? null : window));
  const { inputs, context, phase, unusualMargin, mode, businessInputs } = state;
  const [messages, setMessages] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [result, setResult] = useState(null), [narrative, setNarrative] = useState(null), [aiState, setAiState] = useState('idle');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const controller = useRef(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { setStorageAvailable(saveFeasibility(window, state)); }, [state]);
  const change = patch => setState(previous => ({ ...previous, ...patch }));
  async function send(message) {
    if (busy) return;
    setBusy(true); setNotice(''); setMessages(previous => [...previous.slice(-19), { role: 'user', text: message }]);
    const currentField = nextMissing(inputs);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    let next = inputs, aiFailed = false;
    try { const reply = await commerce('ai', { analysisToken: analysisToken(), mode: 'collect', message, currentField, inputs }, { signal: abort.signal }); next = applyEvidence(inputs, reply.updates, message); }
    catch { aiFailed = true; if (currentField) next = applyEvidence(inputs, [{ field: currentField, evidence: message }], message); }
    finally { clearTimeout(timeout); }
    if (!active.current) return;
    const changed = Object.keys(FIELDS).filter(key => next[key] !== inputs[key]);
    if (changed.includes('knownConversionRate')) next = scenariosFromHistory(next);
    change({ inputs: next, unusualMargin: false });
    const feedback = changed.length ? `Dati raccolti: ${changed.map(key => FIELDS[key].label).join(', ')}. Verificali nel riepilogo.` : 'Non ho un valore univoco da registrare. Indica il dato richiesto oppure apri il riepilogo per inserirlo direttamente.';
    setMessages(previous => [...previous, { role: 'assistant', text: feedback }]);
    if (aiFailed) setNotice('AI temporaneamente non disponibile: raccolta guidata attiva. I dati potranno essere corretti nel riepilogo.');
    setBusy(false);
  }
  async function interpret() {
    if (busy) return;
    setBusy(true); setAiState('loading'); setNarrative(null);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    try { const text = await commerce('ai', { analysisToken: analysisToken(), mode: 'narrative', inputs, unusualMargin }, { signal: abort.signal }); if (active.current) { setNarrative(text.preview); setAiState('ready'); } }
    catch (error) { if (active.current) { setAiState('failed'); setNotice(errorText(error)); } }
    finally { clearTimeout(timeout); if (active.current) { change({ phase: 3 }); setBusy(false); } }
  }
  function generate() { try { setResult(calculateFeasibility(inputs, { unusualMargin })); setNotice(''); change({ phase: 2 }); interpret(); } catch { setNotice('Controlla i dati: il calcolo non è possibile con questi valori.'); } }
  function edit() { if (busy) return; change({ phase: 1 }); setResult(null); setNarrative(null); setAiState('idle'); }

  // ── Scelta esplicita del modo (§1): nessuna inferenza da campi mancanti.
  // Finché l'utente non sceglie, non viene mostrato né il flusso Campaign
  // (invariato sotto) né quello Business (nuovo, isolato in ./business/).
  if (!mode) {
    return <main className="vf-page"><div className="vf-shell">
      <FeasibilityModeChoice onChoose={chosen => change({ mode: chosen })} />
    </div></main>;
  }
  if (mode === 'business') {
    return <main className="vf-page"><div className="vf-shell">
      <header className="vf-heading"><span className="vf-eyebrow">VolantiniPro · Studio di Fattibilità AI</span><h1>Scopri il potenziale della tua attività</h1><p>Analizziamo territorio, pubblico potenziale, concorrenza e opportunità per aiutarti a capire se una zona è adatta alla tua attività.</p></header>
      <FeasibilityBusinessFlow
        inputs={businessInputs}
        onChange={next => change({ businessInputs: next })}
        onBackToChoice={() => change({ mode: null })}
        onNav={onNav}
      />
    </div></main>;
  }

  // ── Campaign Mode: motore/formule INVARIATI (send/interpret/generate/
  // calculateFeasibility sotto non sono stati toccati da questo ticket).
  // Additivo (ticket "CAMPAIGN FEASIBILITY PREFILL" §2/§3/§5/§11): quando la
  // pagina arriva da un preventivo/campagna esistente (context non nullo),
  // i campi già noti restano in sola lettura (FeasibilitySummary li gestisce
  // già) e il fast-path in feasibilityStorage porta l'utente direttamente al
  // riepilogo (phase 1) invece che alla conversazione a fasi (phase 0).
  const allRequiredKnown = Object.keys(validationErrors(inputs, true)).length === 0;
  return <main className="vf-page"><div className="vf-shell">
    <header className="vf-heading"><span className="vf-eyebrow">VolantiniPro · Analisi campagna</span><h1>La tua campagna, con i numeri in chiaro.</h1><p>Racconta la tua attività. Verifica le ipotesi. Valuta gli scenari.</p><button type="button" className="vf-no-print" onClick={() => change({ mode: null })}>Cerchi invece uno studio di fattibilità per la tua attività (anche senza campagna)?</button></header>
    <nav className="vf-progress" aria-label="Fasi analisi"><ol>{['Raccontaci la tua attività', 'Riepilogo', 'Analisi', 'Report'].map((label, index) => <li key={label} aria-current={phase === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol></nav>
    {context && <aside className="vf-context" aria-label="Dati collegati alla campagna">
      <strong>Dati collegati alla campagna</strong>
      <span>{formatServiceLabel(context.serviceLabel || context.service)} · {context.operationalCity || (context.municipalities.length ? context.municipalities.join(', ') : (context.areas.length ? context.areas.join(', ') : 'Zona non indicata'))}</span>
      <span>{context.quantity != null && `${number(context.quantity)} volantini`}{context.total != null && ` · Costo campagna: ${money(context.total)}`}{context.startDate && ` · Avvio: ${context.startDate}`}{context.referenceId && ` · Rif. ${context.referenceId}`}</span>
      <small>Dato già presente nel preventivo/campagna: sola lettura, non serve inserirlo di nuovo.</small>
      {allRequiredKnown
        ? <p role="status">I dati necessari sono già disponibili. Controlla il riepilogo e genera l’analisi.</p>
        : <p role="status">Abbiamo già recuperato i dati della tua campagna. Completa solo le informazioni economiche mancanti.</p>}
    </aside>}
    {!storageAvailable && <p role="status">Salvataggio della sessione non disponibile: conserva il report prima di chiudere la pagina.</p>}
    {notice && <p className="vf-notice" role="status">{notice}</p>}
    {phase === 0 && <FeasibilityConversation inputs={inputs} messages={messages} busy={busy} onSend={send} onReview={() => change({ phase: 1 })} />}
    {phase === 1 && <FeasibilitySummary inputs={inputs} unusualMargin={unusualMargin} onChange={value => change({ inputs: value })} onUnusualMargin={value => change({ unusualMargin: value })} onGenerate={generate} onBack={() => change({ phase: 0 })} />}
    {phase >= 2 && <>{busy && <p role="status">Preparazione dello studio…</p>}{narrative && <FeasibilityPurchase preview={narrative}/>}<div className="vf-actions"><button disabled={busy} onClick={edit}>Modifica dati e ipotesi</button>{aiState === 'failed' && <button disabled={busy} onClick={interpret}>Riprova salvataggio studio</button>}</div>{!result && !narrative && <p>Apri il riepilogo per riprendere l’analisi. I report acquistati sono in Le mie analisi.</p>}</>}
    <footer className="vf-footer vf-no-print"><button onClick={() => onNav('step4')}>Torna al preventivo</button><a href="/le-mie-analisi">Le mie analisi</a><button onClick={() => onNav('dashboard')}>Dashboard</button><button disabled={busy} onClick={() => { try { window.sessionStorage.removeItem(STORAGE_KEY); analysisToken(true); } catch {} setState(readFeasibility(window)); setMessages([]); setResult(null); setNarrative(null); setAiState('idle'); setNotice('Dati della sola analisi cancellati.'); }}>Cancella dati analisi</button><p>Anteprima gratuita. Report completo acquistabile separatamente. Il preventivo della campagna rimane invariato.</p></footer>
  </div></main>;
}
