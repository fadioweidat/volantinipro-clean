import React, { useEffect, useRef, useState } from 'react';
import FeasibilityConversation from './FeasibilityConversation.jsx';
import FeasibilitySummary from './FeasibilitySummary.jsx';
import { money, number } from './FeasibilityReport.jsx';
import { FIELDS, nextMissing, scenariosFromHistory } from './feasibilitySchemas.js';
import { calculateFeasibility } from './feasibilityEngine.js';
import { applyEvidence } from './feasibilityAi.js';
import { readFeasibility, saveFeasibility, STORAGE_KEY } from './feasibilityStorage.js';
import './feasibility.css';
import { commerce, analysisToken, errorText } from './feasibilityCommerce.js';
import FeasibilityPurchase from './FeasibilityPurchase.jsx';

export default function FeasibilityPage({ onNav }) {
  const [state, setState] = useState(() => readFeasibility(typeof window === 'undefined' ? null : window));
  const { inputs, context, phase, unusualMargin } = state;
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
  return <main className="vf-page"><div className="vf-shell">
    <header className="vf-heading"><span className="vf-eyebrow">VolantiniPro · Analisi campagna</span><h1>La tua campagna, con i numeri in chiaro.</h1><p>Racconta la tua attività. Verifica le ipotesi. Valuta gli scenari.</p></header>
    <nav className="vf-progress" aria-label="Fasi analisi"><ol>{['Raccontaci la tua attività', 'Riepilogo', 'Analisi', 'Report'].map((label, index) => <li key={label} aria-current={phase === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol></nav>
    {context && <aside className="vf-context" aria-label="Campagna collegata"><strong>Campagna collegata</strong><span>{context.service === 'd2d' ? 'Door to Door' : context.service || 'Servizio non indicato'} · {context.municipalities.join(', ')}</span><span>{context.quantity != null && `${number(context.quantity)} volantini`}{context.total != null && ` · Costo campagna: ${money(context.total)}`}</span><small>Valori del preventivo in sola lettura</small></aside>}
    {!storageAvailable && <p role="status">Salvataggio della sessione non disponibile: conserva il report prima di chiudere la pagina.</p>}
    {notice && <p className="vf-notice" role="status">{notice}</p>}
    {phase === 0 && <FeasibilityConversation inputs={inputs} messages={messages} busy={busy} onSend={send} onReview={() => change({ phase: 1 })} />}
    {phase === 1 && <FeasibilitySummary inputs={inputs} unusualMargin={unusualMargin} onChange={value => change({ inputs: value })} onUnusualMargin={value => change({ unusualMargin: value })} onGenerate={generate} onBack={() => change({ phase: 0 })} />}
    {phase >= 2 && <>{busy && <p role="status">Preparazione dello studio…</p>}{narrative && <FeasibilityPurchase preview={narrative}/>}<div className="vf-actions"><button disabled={busy} onClick={edit}>Modifica dati e ipotesi</button>{aiState === 'failed' && <button disabled={busy} onClick={interpret}>Riprova salvataggio studio</button>}</div>{!result && !narrative && <p>Apri il riepilogo per riprendere l’analisi. I report acquistati sono in Le mie analisi.</p>}</>}
    <footer className="vf-footer vf-no-print"><button onClick={() => onNav('step4')}>Torna al preventivo</button><a href="/le-mie-analisi">Le mie analisi</a><button onClick={() => onNav('dashboard')}>Dashboard</button><button disabled={busy} onClick={() => { try { window.sessionStorage.removeItem(STORAGE_KEY); analysisToken(true); } catch {} setState(readFeasibility(window)); setMessages([]); setResult(null); setNarrative(null); setAiState('idle'); setNotice('Dati della sola analisi cancellati.'); }}>Cancella dati analisi</button><p>Anteprima gratuita. Report completo acquistabile separatamente. Il preventivo della campagna rimane invariato.</p></footer>
  </div></main>;
}
