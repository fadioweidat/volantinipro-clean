// Raccomandazioni pratiche (§11) — derivate dall'analisi, MAI una spinta
// automatica all'acquisto di volantini. Il CTA verso una campagna reale è
// una voce tra le possibili, mostrata solo dopo il report (§17).
import { NOT_AVAILABLE } from './feasibilityBusinessSchemas.js';

export function buildBusinessRecommendations({ analysis }) {
  const recs = [];
  if (analysis.competitionLevel === 'ALTA') {
    recs.push('Valuta di restringere il raggio di analisi su una micro-zona con meno concorrenti diretti.');
    recs.push('Differenziati dai concorrenti vicini su servizio, orari o posizionamento di prezzo.');
  }
  if (analysis.competitionLevel === 'BASSA') {
    recs.push('Valuta di ampliare leggermente il raggio: potresti trovare più pubblico senza molta più concorrenza.');
  }
  if (!analysis.targetPotential.available || analysis.score === NOT_AVAILABLE) {
    recs.push('Prova con una località più precisa (comune specifico) per ottenere dati demografici reali.');
  }
  if (analysis.score === 'BASSA') {
    recs.push('Considera un comune limitrofo con caratteristiche simili prima di procedere.');
  }
  recs.push('Testa la domanda reale con un’iniziativa locale misurabile prima di investire in comunicazione su larga scala.');
  recs.push('Se decidi di procedere, una landing page o un QR misurabile ti permette di verificare i risultati nel tempo.');
  // dedup mantenendo l'ordine
  return [...new Set(recs)];
}
