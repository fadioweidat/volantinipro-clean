// Sintesi territorio + economia — ticket "UPGRADE FATTIBILITÀ DELLA MIA
// ATTIVITÀ" §6/§7. Combina il punteggio territoriale (motore esistente,
// invariato) con il punteggio economico (nuovo motore finanziario) e un
// punteggio di rischio, per un verdetto finale esplicito e mai un singolo
// numero opaco: territorio, economia e rischio restano sempre visibili
// separatamente nel report, insieme alla regola che li combina.
import { NOT_AVAILABLE, PRELIMINARY } from './feasibilityBusinessSchemas.js';

const TERRITORIAL_SCORE_MAP = { ALTA: 2, MEDIA: 1, BASSA: 0 };

export function territorialScoreLabel(territorialAnalysisScore) {
  if (territorialAnalysisScore === PRELIMINARY || territorialAnalysisScore === NOT_AVAILABLE) return null;
  return territorialAnalysisScore in TERRITORIAL_SCORE_MAP ? territorialAnalysisScore : null;
}

// ── Punteggio economico (§6): break-even raggiungibile rispetto alla
// traiettoria clienti dichiarata dall'utente, non un ROI isolato.
export function computeEconomicScore(financial) {
  if (!financial || !financial.breakEven?.reachable) {
    return { label: 'BASSA', reason: 'Il pareggio non è raggiungibile con margine/costi indicati (margine di contribuzione nullo o negativo).' };
  }
  const { customers: breakEvenCustomers } = financial.breakEven;
  const launch = financial.inputs.launchCustomers;
  const target12 = financial.inputs.targetCustomers12mo;
  if (breakEvenCustomers <= launch) {
    return { label: 'ALTA', reason: `Il pareggio (${breakEvenCustomers} clienti) è già raggiunto dai clienti previsti al lancio (${launch}).` };
  }
  if (breakEvenCustomers <= target12) {
    return { label: 'MEDIA', reason: `Il pareggio (${breakEvenCustomers} clienti) è raggiungibile entro l’orizzonte di 12 mesi indicato (${target12} clienti attesi), ma non subito al lancio.` };
  }
  return { label: 'BASSA', reason: `Il pareggio (${breakEvenCustomers} clienti) supera anche l’obiettivo dichiarato a 12 mesi (${target12} clienti).` };
}

// ── Punteggio di rischio (§6): combina concorrenza territoriale e tempo di
// recupero dell'investimento (payback).
export function computeRiskScore({ competitionLevel, payback, capitalAdequate }) {
  const points = [];
  if (competitionLevel === 'ALTA') points.push(2);
  else if (competitionLevel === 'MEDIA') points.push(1);
  else if (competitionLevel === 'BASSA') points.push(0);

  if (payback && payback.reached === false) points.push(2);
  else if (payback && payback.months != null && payback.months > 24) points.push(2);
  else if (payback && payback.months != null && payback.months > 12) points.push(1);
  else if (payback) points.push(0);

  if (capitalAdequate === false) points.push(2);
  else if (capitalAdequate === true) points.push(0);

  if (points.length === 0) return { label: NOT_AVAILABLE, reason: 'Dati insufficienti per stimare il rischio.' };
  const avg = points.reduce((s, v) => s + v, 0) / points.length;
  const label = avg >= 1.4 ? 'ALTO' : avg >= 0.7 ? 'MEDIO' : 'BASSO';
  return { label, reason: null };
}

// ── Verdetto finale esplicito (§7) — regola documentata, mai un colore a caso.
const VERDICT_RULES = 'GO: territorio ALTA/MEDIA + economia ALTA + rischio BASSO/MEDIO. GO CON CONDIZIONI: economia MEDIA con territorio non sfavorevole, o rischio MEDIO con economia ALTA. ATTENZIONE: economia BASSA con territorio ALTA/MEDIA, o rischio ALTO con economia MEDIA/ALTA. ALTO RISCHIO: rischio ALTO con economia BASSA, o territorio BASSA con economia MEDIA. NO-GO: pareggio non raggiungibile (economia BASSA per margine nullo) insieme a territorio BASSA.';

export function computeFinalVerdict({ territorialScore, economicScore, riskScore }) {
  const t = territorialScore; // 'ALTA' | 'MEDIA' | 'BASSA' | null
  const e = economicScore?.label; // 'ALTA' | 'MEDIA' | 'BASSA'
  const r = riskScore?.label; // 'ALTO' | 'MEDIO' | 'BASSO' | NOT_AVAILABLE

  let verdict;
  let why;

  if (e === 'BASSA' && (t === 'BASSA' || t == null)) {
    verdict = 'NO-GO';
    why = 'il pareggio economico non è raggiungibile con i dati indicati e il contesto territoriale non compensa il rischio.';
  } else if (r === 'ALTO' && e === 'BASSA') {
    verdict = 'ALTO RISCHIO';
    why = 'il rischio complessivo è alto (concorrenza e/o tempo di recupero) e il pareggio economico non è garantito dalla traiettoria clienti indicata.';
  } else if (t === 'BASSA' && e === 'MEDIA') {
    verdict = 'ALTO RISCHIO';
    why = 'il contesto territoriale è sfavorevole (concorrenza alta o bacino limitato) e il pareggio economico richiede la piena crescita a 12 mesi.';
  } else if (e === 'BASSA') {
    verdict = 'ATTENZIONE';
    why = 'il pareggio economico richiede più clienti di quelli dichiarati anche a 12 mesi: la struttura di costi va rivista prima di procedere.';
  } else if (r === 'ALTO') {
    verdict = 'ATTENZIONE';
    why = 'il rischio complessivo è alto (concorrenza territoriale e/o tempo di recupero dell’investimento) anche con un’economia sostenibile.';
  } else if (e === 'MEDIA') {
    verdict = 'GO CON CONDIZIONI';
    why = 'il pareggio è raggiungibile solo se la crescita clienti a 12 mesi si realizza come previsto: la sensibilità a un ritardo della crescita è alta.';
  } else if (r === 'MEDIO') {
    verdict = 'GO CON CONDIZIONI';
    why = 'l’economia è solida ma resta un rischio medio da monitorare (concorrenza e/o tempo di recupero dell’investimento).';
  } else if (e === 'ALTA' && (t === 'ALTA' || t === 'MEDIA')) {
    verdict = 'GO';
    why = 'il pareggio è raggiungibile già con i clienti attesi al lancio e il contesto territoriale non è sfavorevole.';
  } else {
    verdict = 'GO CON CONDIZIONI';
    why = 'l’economia è sostenibile, ma alcuni dati territoriali o di rischio non erano completamente disponibili per un verdetto pieno.';
  }

  return { verdict, why, rules: VERDICT_RULES };
}

/**
 * @param {object} territorialAnalysis - risultato di buildBusinessAnalysis (motore esistente, invariato)
 * @param {object} financialAnalysis - risultato di buildBusinessFinancialAnalysis (nuovo motore)
 */
export function buildBusinessSynthesis({ territorialAnalysis, financialAnalysis }) {
  const territorial = territorialScoreLabel(territorialAnalysis?.score);
  const economic = computeEconomicScore(financialAnalysis);
  const risk = computeRiskScore({
    competitionLevel: territorialAnalysis?.competitionLevel,
    payback: financialAnalysis?.payback,
    capitalAdequate: financialAnalysis?.capitalAdequate,
  });
  const final = computeFinalVerdict({ territorialScore: territorial, economicScore: economic, riskScore: risk });

  return {
    territorialScore: territorial ?? NOT_AVAILABLE,
    economicScore: economic.label,
    economicScoreReason: economic.reason,
    riskScore: risk.label,
    riskScoreReason: risk.reason,
    finalVerdict: final.verdict,
    finalVerdictWhy: final.why,
    finalVerdictRules: final.rules,
  };
}
