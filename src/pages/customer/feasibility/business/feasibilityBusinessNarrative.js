// Livello di "spiegazione AI" per il Business Mode (§10 del ticket originale;
// §7 "PREMIUM FEASIBILITY REPORTS" per la sintesi esecutiva estesa).
// Implementazione DETERMINISTICA e RIGOROSAMENTE GROUNDED: compone frasi a partire
// ESCLUSIVAMENTE dai fatti numerici già calcolati da feasibilityBusinessEngine.js.
// Nessuna invenzione di popolazione, famiglie, concorrenti o esiti economici.
import { NOT_AVAILABLE, PRELIMINARY } from './feasibilityBusinessSchemas.js';

/**
 * Prepara il payload strutturato dei soli fatti verificati per l'interpretazione AI.
 * Firewall della verità: contiene ESCLUSIVAMENTE i dati reali già prodotti dal motore.
 */
export function buildBusinessNarrativeFacts({ inputs, analysis }) {
  const {
    competitionLevel,
    competitorCount,
    competitors = [],
    nearestCompetitorKm,
    targetPotential = {},
    score,
    complementaryPois = [],
    poisAvailable,
    dataReliability = { level: 'BASSA', factorsAvailable: 0, factorsPossible: 4, factors: [] },
    radiusKm = 3,
    locationResolved = true,
  } = analysis || {};

  const unavailableSources = (dataReliability?.factors || [])
    .filter(f => !f.available)
    .map(f => f.name);

  return {
    businessType: inputs?.businessType || NOT_AVAILABLE,
    businessStatus: inputs?.businessStatus === 'existing' ? 'existing' : 'new',
    targetCustomer: inputs?.targetCustomer || NOT_AVAILABLE,
    averagePrice: inputs?.averagePrice || NOT_AVAILABLE,
    goal: inputs?.businessGoal || NOT_AVAILABLE,
    resolvedLocation: inputs?.location || NOT_AVAILABLE,
    locationResolved: Boolean(locationResolved),
    radiusKm,
    households: targetPotential?.available ? targetPotential.households : null,
    population: targetPotential?.available ? targetPotential.population : null,
    demographicsAvailable: Boolean(targetPotential?.available),
    poiCount: poisAvailable ? (competitorCount || 0) + complementaryPois.length : null,
    competitorCount: poisAvailable ? competitorCount : null,
    competitionLevel: poisAvailable ? competitionLevel : NOT_AVAILABLE,
    nearestCompetitorKm: poisAvailable ? nearestCompetitorKm : null,
    poisAvailable: Boolean(poisAvailable),
    complementaryPoiCount: poisAvailable ? complementaryPois.length : 0,
    relevantPoiCategories: [
      ...new Set([
        ...competitors.map(c => c.category),
        ...complementaryPois.map(p => p.category),
      ]),
    ].filter(Boolean),
    reliabilityLevel: dataReliability?.level || (score === PRELIMINARY ? 'BASSA' : 'MEDIA'),
    availableFactorCount: dataReliability?.factorsAvailable ?? 0,
    totalFactorCount: dataReliability?.factorsPossible ?? 4,
    unavailableSources,
    deterministicFinalRating: score || PRELIMINARY,
  };
}

/**
 * Valida la struttura e i vincoli di verità di una risposta narrativa.
 * Ritorna true se valida, false se incompleta, malformata o se tenta di alterare i fatti/voto.
 */
export function validateBusinessNarrative(candidate, facts = null) {
  if (!candidate || typeof candidate !== 'object') return false;

  const requiredStringFields = [
    'executiveSummary',
    'territoryInterpretation',
    'competitionInterpretation',
    'potentialCustomerInterpretation',
    'nextAction',
    'dataReliabilityComment',
  ];

  for (const field of requiredStringFields) {
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      return false;
    }
  }

  const requiredArrayFields = ['strengths', 'risks', 'opportunities', 'recommendations'];
  for (const field of requiredArrayFields) {
    if (!Array.isArray(candidate[field]) || candidate[field].length === 0) {
      return false;
    }
    if (!candidate[field].every(item => typeof item === 'string' && item.trim())) {
      return false;
    }
  }

  // Firewall di consistenza con i fatti deterministici
  if (facts) {
    // 1. Il rating deterministico NON può essere contraddetto o sovrascritto
    if (facts.deterministicFinalRating === PRELIMINARY) {
      if (!/preliminare|incompleta/i.test(candidate.executiveSummary)) {
        return false;
      }
    }

    // 2. Se POI non disponibili, non può affermare che la concorrenza è bassa/zero
    if (!facts.poisAvailable) {
      if (/concorrenza diretta è bassa|zero concorrenti/i.test(candidate.competitionInterpretation)) {
        return false;
      }
    }

    // 3. Se dati demografici non disponibili, non deve contenere numeri di popolazione inventati
    if (!facts.demographicsAvailable) {
      if (/\b\d{4,}\b/.test(candidate.potentialCustomerInterpretation)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Generatore deterministico garantito di report di consulenza.
 */
export function buildDeterministicBusinessNarrative({ inputs, analysis }) {
  const {
    competitionLevel,
    competitorCount,
    nearestCompetitorKm,
    targetPotential = {},
    score,
    complementaryPois = [],
    poisAvailable,
    dataReliability = { level: 'BASSA', factorsAvailable: 0, factorsPossible: 4 },
    radiusKm = 3,
    locationResolved = true,
  } = analysis;

  const activity = inputs?.businessType || 'la tua attività';
  const location = inputs?.location || 'zona indicata';
  const status = inputs?.businessStatus === 'existing' ? 'già attiva' : 'in fase di apertura';
  const reliabilityLevel = dataReliability?.level || (score === PRELIMINARY ? 'BASSA' : 'MEDIA');

  // 1. Territory interpretation
  const territoryInterpretation = locationResolved
    ? reliabilityLevel === 'ALTA'
      ? `L'analisi territoriale si concentra su ${location} entro un raggio operativo di ${radiusKm} km, geocodificato con precisione per intercettare il bacino locale.`
      : reliabilityLevel === 'MEDIA'
        ? `L'area presa in esame copre un raggio di ${radiusKm} km attorno a ${location}, che rappresenta la distanza di attrazione stimata per ${activity}.`
        : `La zona impostata comprende ${location} con raggio di ${radiusKm} km: in una valutazione preliminare, l'estensione effettiva del bacino va verificata sul territorio.`
    : `La località "${location}" non è stata geocodificata con precisione: i riferimenti territoriali e le distanze potrebbero risultare approssimati.`;

  // 2. Potential Customer Base interpretation
  const potentialCustomerInterpretation = targetPotential.available
    ? reliabilityLevel === 'ALTA'
      ? `Nell'area indicata risultano circa ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie e ${Math.round(targetPotential.population || 0).toLocaleString('it-IT')} residenti (dato ISTAT): questo bacino territoriale evidenzia una solida base potenziale per ${activity}. Il bacino territoriale rappresenta il pubblico potenzialmente raggiungibile, non una previsione di clienti.`
      : reliabilityLevel === 'MEDIA'
        ? `Nell'area indicata risultano circa ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie e ${Math.round(targetPotential.population || 0).toLocaleString('it-IT')} residenti (dato ISTAT): questo è il bacino territoriale di riferimento per ${activity}, non una previsione di clienti.`
        : `I dati territoriali disponibili indicano circa ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie e ${Math.round(targetPotential.population || 0).toLocaleString('it-IT')} residenti (dato ISTAT): il bacino territoriale rappresenta il contesto di riferimento, non una stima garantita di clienti.`
    : `Per questa zona non abbiamo un dato ISTAT di popolazione/famiglie disponibile: il bacino potenziale è "${NOT_AVAILABLE}". La mancanza del dato demografico riduce la capacità del report di stimare la dimensione del mercato locale.`;

  // 3. Competition interpretation (§9: distinguere provider non disponibile da 0 concorrenti)
  const competitionInterpretation = !poisAvailable
    ? `Il provider di punti di interesse non era disponibile durante l'analisi: la concorrenza è "${NOT_AVAILABLE}", non zero. Il livello di concorrenza non è stato valutato con affidabilità per assenza di dati POI.`
    : competitionLevel === NOT_AVAILABLE
      ? `Non ci sono categorie di concorrenza note per questo tipo di attività: la concorrenza resta "${NOT_AVAILABLE}". È opportuno condurre un riscontro diretto sul campo.`
      : competitionLevel === 'ALTA'
        ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato${nearestCompetitorKm != null ? ` (la più vicina a ${nearestCompetitorKm} km)` : ''}: la concorrenza diretta è alta. La densità di concorrenti suggerisce un mercato presidiato. Prima di investire conviene validare posizionamento, prezzo e proposta.`
        : competitionLevel === 'MEDIA'
          ? `Sono state rilevate ${competitorCount} attività dello stesso tipo nel raggio analizzato${nearestCompetitorKm != null ? ` (la più vicina a ${nearestCompetitorKm} km)` : ''}: la concorrenza è nella media. Il mercato appare già attivo e ricettivo; la differenziazione nel servizio o nell'offerta diventa un fattore importante.`
          : `Sono state rilevate ${competitorCount ?? 0} attività dello stesso tipo nel raggio analizzato: la concorrenza diretta è bassa. Questo può rappresentare un'opportunità di penetrazione, ma un numero basso di concorrenti non dimostra automaticamente una domanda elevata.`;

  // 4. Strengths (2-4 concrete points)
  const strengths = [];
  if (targetPotential.available && (targetPotential.population || 0) >= 5000) {
    strengths.push(`Bacino demografico consistente: circa ${Math.round(targetPotential.population).toLocaleString('it-IT')} residenti e ${Math.round(targetPotential.households || 0).toLocaleString('it-IT')} famiglie nel raggio analizzato.`);
  }
  if (poisAvailable && competitionLevel === 'BASSA') {
    strengths.push(`Bassa pressione competitiva diretta (${competitorCount ?? 0} concorrenti rilevati nel raggio), che favorisce la visibilità e la riconoscibilità iniziale.`);
  }
  if (poisAvailable && complementaryPois.length >= 2) {
    strengths.push(`Presenza di ${complementaryPois.length} punti di interesse complementari nell'area, generatori di passaggio e flussi di pubblico locale.`);
  }
  if (inputs?.businessStatus === 'existing') {
    strengths.push(`Attività già avviata con presenza territoriale che facilita le azioni di fidelizzazione e riattivazione clienti.`);
  }
  if (inputs?.targetCustomer) {
    strengths.push(`Pubblico target dichiarato ben profilato (${inputs.targetCustomer}), ideale per una comunicazione promozionale mirata.`);
  }
  if (strengths.length === 0) {
    strengths.push(`Opportunità di definire un posizionamento distintivo nel contesto di ${location}.`);
    strengths.push(`Flessibilità nell'impostare l'offerta e il raggio di attrazione commerciale.`);
  }

  // 5. Risks (2-4 concrete evidence-based points)
  const risks = [];
  if (competitionLevel === 'ALTA') {
    risks.push(`Alta densità di concorrenti diretti nello stesso raggio (${competitorCount} attività rilevate, la più vicina a ${nearestCompetitorKm ?? '—'} km): rischio di frammentazione del pubblico.`);
  }
  if (!poisAvailable) {
    risks.push(`Il provider di punti di interesse non era disponibile: concorrenza e contesto commerciale non sono verificabili in questa analisi.`);
  }
  if (!targetPotential.available) {
    risks.push(`Bacino demografico ISTAT non disponibile per questa località: dimensione reale del mercato locale non quantificabile.`);
  }
  if (poisAvailable && complementaryPois.length === 0) {
    risks.push(`Pochi punti di interesse complementari rilevati: zona con potenziale basso passaggio spontaneo.`);
  }
  if (score === 'BASSA') {
    risks.push(`Indicatori complessivi sfavorevoli o limitati per il raggio selezionato: rischio di dispersione del budget.`);
  }
  if (risks.length === 0) {
    risks.push(`Nessun fattore di rischio bloccante emerso dai dati disponibili, ma la domanda reale locale va sempre validata.`);
    risks.push(`Rischio di concorrenza indiretta o di futuri ingressi commerciali non ancora censiti nelle mappe.`);
  }

  // 6. Opportunities (2-4 points)
  const opportunities = [];
  if (poisAvailable && competitionLevel === 'BASSA') {
    opportunities.push(`Spazio di mercato per posizionarsi come punto di riferimento di quartiere prima dell'insediamento di nuovi competitor.`);
  }
  if (targetPotential.available && (targetPotential.population || 0) > 0) {
    opportunities.push(`Accesso diretto a un bacino potenziale di circa ${Math.round(targetPotential.population).toLocaleString('it-IT')} persone mediante iniziative di prossimità.`);
  }
  if (poisAvailable && complementaryPois.length > 0) {
    opportunities.push(`Possibilità di intercettare i flussi quotidiani generati dai ${complementaryPois.length} poli d'attrazione limitrofi.`);
  }
  opportunities.push(`Testare la sensibilità all'offerta con coupon o promozioni d'ingresso tracciabili (QR code o landing page).`);

  // 7. Practical consulting recommendations
  const recommendations = [];
  if (competitionLevel === 'ALTA') {
    recommendations.push(`Differenzia la proposta rispetto ai ${competitorCount} concorrenti con un focus specifico su orari, specializzazioni o pacchetti introduttivi.`);
    recommendations.push('Valuta di restringere il raggio di analisi su una micro-zona con meno concorrenti diretti.');
  }
  if (competitionLevel === 'BASSA') {
    recommendations.push('Valuta di ampliare leggermente il raggio: potresti trovare più pubblico senza incontrare molta più concorrenza.');
  }
  if (!poisAvailable) {
    recommendations.push('Riprova più tardi: il provider di punti di interesse non era disponibile durante questa analisi.');
  }
  if (!targetPotential.available || score === NOT_AVAILABLE || score === PRELIMINARY) {
    recommendations.push('Prova con una località più precisa (comune specifico) per ottenere dati demografici reali.');
  }
  if (score === 'BASSA') {
    recommendations.push('Considera un comune limitrofo con caratteristiche simili prima di procedere con investimenti consistenti.');
  }
  recommendations.push('Testa la domanda reale con un’iniziativa locale misurabile prima di investire in comunicazione su larga scala.');
  recommendations.push('Se decidi di procedere, una landing page o un QR misurabile ti permette di verificare i risultati e il ritorno economico nel tempo.');

  // 8. Next Action & Positioning
  const nextAction = score === 'ALTA'
    ? 'I dati disponibili indicano una zona interessante: il passo successivo naturale è verificare la domanda con un test locale misurabile.'
    : score === 'BASSA'
      ? 'I dati disponibili non sono incoraggianti per questa zona: valuta un raggio più ampio o un comune limitrofo prima di investire.'
      : score === PRELIMINARY
        ? 'Con i dati oggi disponibili non è possibile dare un giudizio complessivo: amplia il raggio di analisi, indica meglio la località o riprova più tardi se un provider dati era temporaneamente non disponibile.'
        : 'I dati disponibili sono nella media: una verifica sul campo con un investimento contenuto è il passo più prudente.';

  const positioning = competitionLevel === 'ALTA'
    ? 'Con più concorrenti diretti nella zona, differenziarsi su servizio, orari o prezzo è la leva più realistica prima di investire in comunicazione.'
    : competitionLevel === 'BASSA'
      ? 'Con pochi concorrenti diretti nella zona, la priorità è farsi conoscere: la comunicazione locale ha più probabilità di impatto.'
      : competitionLevel === NOT_AVAILABLE
        ? 'Senza un dato di concorrenza verificato, la priorità è raccogliere informazioni sul campo prima di investire in comunicazione.'
        : 'Con una concorrenza nella media, una proposta chiara e visibile localmente resta la leva principale.';

  // 9. Strongest positive & biggest risk
  const strongestPositive = targetPotential.available && (targetPotential.population || 0) >= 5000
    ? `un bacino territoriale di ${Math.round(targetPotential.population).toLocaleString('it-IT')} residenti`
    : competitionLevel === 'BASSA'
      ? 'una concorrenza diretta bassa nella zona'
      : complementaryPois.length >= 3
        ? `${complementaryPois.length} punti di interesse complementari che portano passaggio nella zona`
        : 'nessun fattore particolarmente favorevole tra quelli disponibili';
  const biggestRisk = risks[0];

  // 10. Data reliability commentary
  const dataReliabilityComment = reliabilityLevel === 'ALTA'
    ? `Dati ad alta affidabilità (${dataReliability?.factorsAvailable ?? 0}/${dataReliability?.factorsPossible ?? 4} fonti verificate: ISTAT, POI e localizzazione). I dati forniscono una base solida ma non garantiscono risultati commerciali indipendenti dalla gestione.`
    : reliabilityLevel === 'MEDIA'
      ? `Dati ad affidabilità media (${dataReliability?.factorsAvailable ?? 0}/${dataReliability?.factorsPossible ?? 4} fonti disponibili). Alcuni indicatori offrono un quadro coerente ma richiedono verifica diretta sul territorio.`
      : `Affidabilità preliminare (${dataReliability?.factorsAvailable ?? 0}/${dataReliability?.factorsPossible ?? 4} fonti disponibili). Mancano alcune fonti primarie: i risultati vanno intesi come stima di massima da approfondire sul campo.`;

  // 11. Executive summary answering all 6 core consulting questions:
  // (1) cosa analizzato, (2) conclusione, (3) fattore positivo, (4) rischio, (5) affidabilità, (6) prossimo passo
  const executiveSummary = [
    `Analisi per ${activity} (${status}) a ${location}, raggio ${radiusKm} km.`,
    score === PRELIMINARY
      ? 'Conclusione: valutazione preliminare, i dati disponibili non bastano per un giudizio complessivo.'
      : `Conclusione: fattibilità ${score}.`,
    `Fattore positivo principale: ${strongestPositive}.`,
    `Rischio principale: ${biggestRisk}`,
    `Affidabilità dei dati: ${reliabilityLevel} (${dataReliability?.factorsAvailable ?? 0}/${dataReliability?.factorsPossible ?? 4} fonti disponibili).`,
    `Prossimo passo: ${nextAction}`,
  ].join(' ');

  return {
    executiveSummary,
    territoryInterpretation,
    potentialCustomerInterpretation,
    competitionInterpretation,
    strengths,
    risks,
    opportunities,
    recommendations: [...new Set(recommendations)],
    nextAction,
    dataReliabilityComment,
    // Backward compatibility aliases:
    whyPromising: potentialCustomerInterpretation,
    whyCompetitionHigh: competitionInterpretation,
    riskFactors: risks,
    positioning,
    recommendedAction: nextAction,
    strongestPositive,
    biggestRisk,
  };
}

/**
 * Punto d'ingresso principale: valida l'eventuale output AI personalizzato
 * e ricorre in modo sicuro al fallback deterministico in caso di invalidità o errore.
 */
export function buildBusinessNarrative({ inputs, analysis, customNarrative = null }) {
  const facts = buildBusinessNarrativeFacts({ inputs, analysis });

  if (customNarrative && validateBusinessNarrative(customNarrative, facts)) {
    return {
      executiveSummary: customNarrative.executiveSummary,
      territoryInterpretation: customNarrative.territoryInterpretation,
      potentialCustomerInterpretation: customNarrative.potentialCustomerInterpretation,
      competitionInterpretation: customNarrative.competitionInterpretation,
      strengths: customNarrative.strengths,
      risks: customNarrative.risks,
      opportunities: customNarrative.opportunities,
      recommendations: customNarrative.recommendations,
      nextAction: customNarrative.nextAction,
      dataReliabilityComment: customNarrative.dataReliabilityComment,
      // Backward compatibility aliases:
      whyPromising: customNarrative.potentialCustomerInterpretation,
      whyCompetitionHigh: customNarrative.competitionInterpretation,
      riskFactors: customNarrative.risks,
      positioning: customNarrative.strengths?.[0] || 'Posizionamento basato sull\'analisi locale.',
      recommendedAction: customNarrative.nextAction,
      strongestPositive: customNarrative.strengths?.[0] || 'Dati territoriali analizzati.',
      biggestRisk: customNarrative.risks?.[0] || 'Verificare la domanda sul campo.',
    };
  }

  return buildDeterministicBusinessNarrative({ inputs, analysis });
}

