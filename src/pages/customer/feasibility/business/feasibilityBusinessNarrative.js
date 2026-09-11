// Livello di "spiegazione AI" per il Business Mode (§10 del ticket).
// Implementazione DETERMINISTICA: compone frasi a partire ESCLUSIVAMENTE dai
// fatti numerici già calcolati da feasibilityBusinessEngine.js. Nessuna
// chiamata di rete, nessuna nuova Edge Function, nessuna possibilità di
// inventare popolazione/concorrenti/risultati economici: l'interfaccia è
// pensata per poter essere sostituita in futuro da una vera generazione AI
// (stessa firma, stesso contratto dati in ingresso) senza cambiare il resto
// del flusso Business Mode.
import { NOT_AVAILABLE } from './feasibilityBusinessSchemas.js';

export function buildBusinessNarrative({ inputs, analysis }) {
  const { competitionLevel, competitorCount, nearestCompetitorKm, targetPotential, score, complementaryPois } = analysis;
  const activity = inputs.businessType || 'la tua attività';
  const status = inputs.businessStatus === 'existing' ? 'già attiva' : 'in fase di apertura';

  const whyPromising = targetPotential.available
    ? `Nell'area indicata risultano circa ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie e ${Math.round(targetPotential.population || 0).toLocaleString('it-IT')} residenti (dato ISTAT): questo è il bacino territoriale di riferimento per ${activity}, non una previsione di clienti.`
    : `Per questa zona non abbiamo un dato ISTAT di popolazione/famiglie disponibile: il bacino potenziale è "${NOT_AVAILABLE}".`;

  const whyCompetitionHigh = competitionLevel === NOT_AVAILABLE
    ? `Non ci sono dati sufficienti sui punti di interesse per classificare la concorrenza per questo tipo di attività.`
    : competitionLevel === 'ALTA'
      ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato (la più vicina a ${nearestCompetitorKm ?? '—'} km): la concorrenza diretta è alta.`
      : competitionLevel === 'MEDIA'
        ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato: la concorrenza è nella media.`
        : `Sono state rilevate ${competitorCount ?? 0} attività dello stesso tipo nel raggio analizzato: la concorrenza diretta è bassa.`;

  const riskFactors = [];
  if (competitionLevel === 'ALTA') riskFactors.push('Alta densità di concorrenti diretti nello stesso raggio.');
  if (!targetPotential.available) riskFactors.push('Bacino demografico non verificabile con i dati disponibili.');
  if (complementaryPois.length === 0) riskFactors.push('Pochi punti di interesse complementari rilevati: zona con basso passaggio potenziale.');
  if (riskFactors.length === 0) riskFactors.push('Nessun fattore di rischio rilevante emerso dai dati disponibili.');

  const positioning = competitionLevel === 'ALTA'
    ? 'Con più concorrenti diretti nella zona, differenziarsi su servizio, orari o prezzo è la leva più realistica prima di investire in comunicazione.'
    : competitionLevel === 'BASSA'
      ? 'Con pochi concorrenti diretti nella zona, la priorità è farsi conoscere: la comunicazione locale ha più probabilità di impatto.'
      : 'Con una concorrenza nella media, una proposta chiara e visibile localmente resta la leva principale.';

  const recommendedAction = score === 'ALTA'
    ? 'I dati disponibili indicano una zona interessante: il passo successivo naturale è verificare la domanda con un test locale misurabile.'
    : score === 'BASSA'
      ? 'I dati disponibili non sono incoraggianti per questa zona: valuta un raggio più ampio o un comune limitrofo prima di investire.'
      : score === NOT_AVAILABLE
        ? 'Con i dati oggi disponibili non è possibile dare un giudizio complessivo: amplia il raggio di analisi o indica meglio la località.'
        : 'I dati disponibili sono nella media: una verifica sul campo con un investimento contenuto è il passo più prudente.';

  return {
    executiveSummary: `${activity[0]?.toUpperCase()}${activity.slice(1)} (${status}): ${whyPromising} ${whyCompetitionHigh}`.trim(),
    whyPromising,
    whyCompetitionHigh,
    riskFactors,
    positioning,
    recommendedAction,
  };
}
