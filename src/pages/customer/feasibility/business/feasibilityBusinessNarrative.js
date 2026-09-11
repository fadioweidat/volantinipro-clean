// Livello di "spiegazione AI" per il Business Mode (§10 del ticket originale;
// §7 "PREMIUM FEASIBILITY REPORTS" per la sintesi esecutiva estesa).
// Implementazione DETERMINISTICA: compone frasi a partire ESCLUSIVAMENTE dai
// fatti numerici già calcolati da feasibilityBusinessEngine.js. Nessuna
// chiamata di rete, nessuna nuova Edge Function, nessuna possibilità di
// inventare popolazione/concorrenti/risultati economici: l'interfaccia è
// pensata per poter essere sostituita in futuro da una vera generazione AI
// (stessa firma, stesso contratto dati in ingresso) senza cambiare il resto
// del flusso Business Mode.
import { NOT_AVAILABLE, PRELIMINARY } from './feasibilityBusinessSchemas.js';

export function buildBusinessNarrative({ inputs, analysis }) {
  const { competitionLevel, competitorCount, nearestCompetitorKm, targetPotential, score, complementaryPois, poisAvailable, dataReliability } = analysis;
  const activity = inputs.businessType || 'la tua attività';
  const status = inputs.businessStatus === 'existing' ? 'già attiva' : 'in fase di apertura';

  const whyPromising = targetPotential.available
    ? `Nell'area indicata risultano circa ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie e ${Math.round(targetPotential.population || 0).toLocaleString('it-IT')} residenti (dato ISTAT): questo è il bacino territoriale di riferimento per ${activity}, non una previsione di clienti.`
    : `Per questa zona non abbiamo un dato ISTAT di popolazione/famiglie disponibile: il bacino potenziale è "${NOT_AVAILABLE}".`;

  // §9: la spiegazione deve distinguere "provider POI tecnicamente non
  // disponibile" da "nessuna categoria di concorrenza nota per l'attività" —
  // un guasto tecnico non deve mai leggersi come "zero concorrenti".
  const whyCompetitionHigh = !poisAvailable
    ? `Il provider di punti di interesse non era disponibile durante l'analisi: la concorrenza è "${NOT_AVAILABLE}", non zero.`
    : competitionLevel === NOT_AVAILABLE
      ? `Non ci sono categorie di concorrenza note per questo tipo di attività: la concorrenza resta "${NOT_AVAILABLE}".`
      : competitionLevel === 'ALTA'
        ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato (la più vicina a ${nearestCompetitorKm ?? '—'} km): la concorrenza diretta è alta.`
        : competitionLevel === 'MEDIA'
          ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato: la concorrenza è nella media.`
          : `Sono state rilevate ${competitorCount ?? 0} attività dello stesso tipo nel raggio analizzato: la concorrenza diretta è bassa.`;

  const riskFactors = [];
  if (competitionLevel === 'ALTA') riskFactors.push('Alta densità di concorrenti diretti nello stesso raggio.');
  if (!poisAvailable) riskFactors.push('Il provider di punti di interesse non era disponibile: concorrenza e contesto commerciale non sono verificabili in questa analisi.');
  if (!targetPotential.available) riskFactors.push('Bacino demografico non verificabile con i dati disponibili.');
  if (poisAvailable && complementaryPois.length === 0) riskFactors.push('Pochi punti di interesse complementari rilevati: zona con basso passaggio potenziale.');
  if (riskFactors.length === 0) riskFactors.push('Nessun fattore di rischio rilevante emerso dai dati disponibili.');

  const positioning = competitionLevel === 'ALTA'
    ? 'Con più concorrenti diretti nella zona, differenziarsi su servizio, orari o prezzo è la leva più realistica prima di investire in comunicazione.'
    : competitionLevel === 'BASSA'
      ? 'Con pochi concorrenti diretti nella zona, la priorità è farsi conoscere: la comunicazione locale ha più probabilità di impatto.'
      : competitionLevel === NOT_AVAILABLE
        ? 'Senza un dato di concorrenza verificato, la priorità è raccogliere informazioni sul campo prima di investire in comunicazione.'
        : 'Con una concorrenza nella media, una proposta chiara e visibile localmente resta la leva principale.';

  const recommendedAction = score === 'ALTA'
    ? 'I dati disponibili indicano una zona interessante: il passo successivo naturale è verificare la domanda con un test locale misurabile.'
    : score === 'BASSA'
      ? 'I dati disponibili non sono incoraggianti per questa zona: valuta un raggio più ampio o un comune limitrofo prima di investire.'
      : score === PRELIMINARY
        ? 'Con i dati oggi disponibili non è possibile dare un giudizio complessivo: amplia il raggio di analisi, indica meglio la località o riprova più tardi se un provider dati era temporaneamente non disponibile.'
        : 'I dati disponibili sono nella media: una verifica sul campo con un investimento contenuto è il passo più prudente.';

  // §7 — la sintesi esecutiva deve rispondere a: cosa è stato analizzato,
  // qual è la conclusione, qual è il fattore positivo più forte, qual è il
  // rischio principale, quanto è affidabile il risultato, cosa fare dopo.
  const strongestPositive = targetPotential.available && (targetPotential.population || 0) >= 5000
    ? `un bacino territoriale di ${Math.round(targetPotential.population).toLocaleString('it-IT')} residenti`
    : competitionLevel === 'BASSA'
      ? 'una concorrenza diretta bassa nella zona'
      : complementaryPois.length >= 3
        ? `${complementaryPois.length} punti di interesse complementari che portano passaggio nella zona`
        : 'nessun fattore particolarmente favorevole tra quelli disponibili';
  const biggestRisk = riskFactors[0];
  const reliabilityLabel = dataReliability?.level || NOT_AVAILABLE;

  const executiveSummary = [
    `Analisi per ${activity} (${status}) a ${inputs.location || 'zona indicata'}, raggio ${analysis.radiusKm} km.`,
    score === PRELIMINARY
      ? 'Conclusione: valutazione preliminare, i dati disponibili non bastano per un giudizio complessivo.'
      : `Conclusione: fattibilità ${score}.`,
    `Fattore positivo principale: ${strongestPositive}.`,
    `Rischio principale: ${biggestRisk}`,
    `Affidabilità dei dati: ${reliabilityLabel} (${dataReliability?.factorsAvailable ?? 0}/${dataReliability?.factorsPossible ?? 4} fonti disponibili).`,
    `Prossimo passo: ${recommendedAction}`,
  ].join(' ');

  return {
    executiveSummary,
    whyPromising, whyCompetitionHigh, riskFactors, positioning, recommendedAction,
    strongestPositive, biggestRisk,
  };
}
