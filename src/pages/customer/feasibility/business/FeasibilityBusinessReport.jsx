import React from 'react';
import { NOT_AVAILABLE, PRELIMINARY, businessGoalLabel } from './feasibilityBusinessSchemas.js';
import { FINANCIAL_DISCLAIMER } from './feasibilityBusinessFinancialSchemas.js';

const fmt = value => (value == null ? NOT_AVAILABLE : new Intl.NumberFormat('it-IT').format(Math.round(value)));
const eur = value => (value == null ? NOT_AVAILABLE : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value));
const pct = value => (value == null ? NOT_AVAILABLE : `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)}%`);
const months = value => (value == null ? NOT_AVAILABLE : `${value} mes${value === 1 ? 'e' : 'i'}`);

const SOURCE_LABEL = { real: 'Dato reale', user: 'Dato fornito da te', rule: 'Regola deterministica', estimate: 'Stima del modello', unavailable: 'Non disponibile' };
function Source({ tag }) {
  return <small className="vf-source-tag">{SOURCE_LABEL[tag] || SOURCE_LABEL.unavailable}</small>;
}

// STEP 4 — Report finale Business Mode (ticket "PREMIUM FEASIBILITY REPORTS"
// §6): 14 sezioni + pagina "above the fold" + affidabilità dei dati + fonti,
// pensato per sembrare uno studio di mini-consulenza, non una calcolatrice.
export default function FeasibilityBusinessReport({ inputs, analysis, narrative, recommendations, financial, synthesis, loading, onEdit, onCta }) {
  if (loading) {
    return (
      <section className="vf-panel" role="status">
        <span className="vf-eyebrow">Passo 5 di 5</span>
        <h2>Stiamo analizzando la zona…</h2>
        <p>Recupero dati territoriali reali e punti di interesse nella zona indicata.</p>
      </section>
    );
  }

  const { competitionLevel, competitorCount, competitors, complementaryPois, targetPotential, score, nearestCompetitorKm, poisAvailable, dataReliability, location } = analysis;
  const isPreliminary = score === PRELIMINARY;
  // Ticket "GEOCODING + ISTAT + POI CONSISTENCY" §8: quando la località è
  // stata risolta davvero, mostra l'indirizzo/comune/NIL REALI restituiti
  // dal geocoder — mai il testo grezzo digitato dall'utente quando esiste un
  // dato migliore. Nessuna modifica al layout esistente, solo ai valori.
  const resolvedAddress = location?.displayAddress || null;
  const resolvedCity = location?.city || null;
  const resolvedNil = location?.nilName || null;
  // §9-C/§9-D (QA "TWO FEASIBILITY STUDIES"): data dell'analisi e identità
  // per report/PDF — additivo, non cambia la numerazione delle sezioni.
  const analysisDate = new Date().toLocaleDateString('it-IT');
  const businessName = inputs.businessName?.trim() || null;
  const referenceName = inputs.referenceName?.trim() || null;
  const goalLabel = businessGoalLabel(inputs.businessGoal);

  return (
    <article className="vf-report vf-business-report" aria-labelledby="vfb-report-title">
      <header className="vf-report-heading">
        <span className="vf-eyebrow">VolantiniPro · Studio di Fattibilità AI</span>
        <h1 id="vfb-report-title">Studio di Fattibilità AI — Attività e Territorio</h1>
        <p className="vf-report-subtitle">Analisi del potenziale territoriale, concorrenza e opportunità — {businessName || inputs.businessType || 'attività'} a {inputs.location || 'zona indicata'}</p>
        <p className="vf-small">Data analisi: {analysisDate}{businessName && <> · Attività: <strong>{businessName}</strong></>}{referenceName && <> · Referente: {referenceName}</>}</p>
        <p>Analisi basata su dati territoriali reali (ISTAT) e punti di interesse reali (OpenStreetMap). Nessun dato è stato inventato: dove manca una fonte, il report indica "{NOT_AVAILABLE}".</p>
        {financial && <p className="vf-small">{FINANCIAL_DISCLAIMER}</p>}
        <div className="vf-actions vf-no-print">
          {onEdit && <button type="button" onClick={onEdit}>Modifica dati</button>}
          <button type="button" onClick={() => window.print()}>Stampa / Salva PDF</button>
        </div>
      </header>

      {/* Prima pagina / above the fold (§3): tutto ciò che serve a colpo d'occhio */}
      <section className="vf-panel vf-above-fold" aria-label="Sintesi in evidenza">
        <dl className="vf-metrics vf-above-fold-grid">
          <div><dt>Tipo di attività</dt><dd>{inputs.businessType || NOT_AVAILABLE}</dd></div>
          <div><dt>Località analizzata</dt><dd>{resolvedAddress || inputs.location || NOT_AVAILABLE}</dd></div>
          <div><dt>Raggio di analisi</dt><dd>{analysis.radiusKm} km</dd></div>
          <div><dt>Potenzialità finale</dt><dd data-testid="vfb-score"><strong>{score}</strong>{isPreliminary && <small className="vf-small"> — analisi incompleta</small>}</dd></div>
          <div><dt>Affidabilità dei dati</dt><dd data-testid="vfb-reliability"><strong>{dataReliability.level}</strong> <small className="vf-small">({dataReliability.factorsAvailable}/{dataReliability.factorsPossible} fonti)</small></dd></div>
          <div><dt>Bacino potenziale</dt><dd data-testid="vfb-households">{fmt(targetPotential.households)} famiglie</dd></div>
          <div><dt>Concorrenza</dt><dd data-testid="vfb-competition">{competitionLevel}</dd></div>
          <div><dt>POI rilevanti</dt><dd>{poisAvailable ? fmt((competitorCount || 0) + complementaryPois.length) : NOT_AVAILABLE}</dd></div>
          <div><dt>Opportunità principale</dt><dd>{narrative.strongestPositive}</dd></div>
          <div><dt>Rischio principale</dt><dd>{narrative.biggestRisk}</dd></div>
          {financial && <div><dt>Pareggio economico</dt><dd data-testid="vfb-breakeven">{financial.breakEven.reachable ? `${fmt(financial.breakEven.customers)} clienti` : NOT_AVAILABLE}</dd></div>}
          {synthesis && <div><dt>Verdetto finale</dt><dd data-testid="vfb-verdict"><strong>{synthesis.finalVerdict}</strong></dd></div>}
        </dl>
      </section>

      <div className="vf-kpis">
        <section className="vf-kpi"><h3>Potenzialità finale</h3><strong>{score}</strong></section>
        <section className="vf-kpi"><h3>Affidabilità dei dati</h3><strong data-testid="vfb-reliability-kpi">{dataReliability.level}</strong></section>
        <section className="vf-kpi"><h3>Concorrenza</h3><strong>{competitionLevel}</strong></section>
      </div>

      <section className="vf-panel"><h3>1. Sintesi esecutiva</h3><p>{narrative.executiveSummary}</p></section>

      <section className="vf-panel">
        <h3>2. Attività e obiettivo</h3>
        <p>Attività: <strong>{inputs.businessType || NOT_AVAILABLE}</strong> ({inputs.businessStatus === 'existing' ? 'già esistente' : 'nuova apertura'}). <Source tag="user" /></p>
        <p>Cliente target dichiarato: {inputs.targetCustomer || NOT_AVAILABLE}. Prezzo medio: {inputs.averagePrice ? `${inputs.averagePrice} €` : NOT_AVAILABLE}. <Source tag="user" /></p>
        <p>Obiettivo principale: {goalLabel || NOT_AVAILABLE}. <Source tag="user" /></p>
      </section>

      <section className="vf-panel">
        <h3>3. Area analizzata</h3>
        <p>{inputs.location || NOT_AVAILABLE} · raggio {analysis.radiusKm} km. <Source tag="user" /></p>
        {analysis.locationResolved ? (
          <dl className="vf-metrics">
            <div><dt>Indirizzo geocodificato</dt><dd>{resolvedAddress || NOT_AVAILABLE} <Source tag="real" /></dd></div>
            <div><dt>Comune</dt><dd>{resolvedCity || NOT_AVAILABLE} <Source tag="real" /></dd></div>
            <div><dt>NIL</dt><dd>{resolvedNil || NOT_AVAILABLE} <Source tag={resolvedNil ? 'real' : 'unavailable'} /></dd></div>
          </dl>
        ) : null}
        <p className="vf-small">{narrative.territoryInterpretation || (analysis.locationResolved ? 'Località geocodificata correttamente.' : 'Località non geocodificata: i dati territoriali potrebbero non essere disponibili.')}</p>
      </section>

      <section className="vf-panel">
        <h3>4. Dati territoriali</h3>
        {targetPotential.available ? (
          <dl className="vf-metrics">
            <div><dt>Famiglie nell'area</dt><dd>{fmt(targetPotential.households)} <Source tag="real" /></dd></div>
            <div><dt>Popolazione nell'area</dt><dd>{fmt(targetPotential.population)} <Source tag="real" /></dd></div>
          </dl>
        ) : (
          <p><strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /></p>
        )}
        <p className="vf-small">Fonte: ISTAT. {!targetPotential.available && 'Il dato non era disponibile per questa località al momento dell\'analisi.'}</p>
      </section>

      <section className="vf-panel">
        <h3>5. Bacino di clientela potenziale</h3>
        <p>Bacino potenziale stimato (dato territoriale, non domanda garantita):</p>
        <dl className="vf-metrics">
          <div><dt>Famiglie nell'area</dt><dd data-testid="vfb-hh">{fmt(targetPotential.households)}</dd></div>
          <div><dt>Popolazione nell'area</dt><dd data-testid="vfb-pop">{fmt(targetPotential.population)}</dd></div>
        </dl>
        <p>{narrative.potentialCustomerInterpretation || narrative.whyPromising}</p>
        <p className="vf-small">Il bacino potenziale rappresenta il contesto territoriale, non una previsione garantita di clienti.</p>
      </section>

      <section className="vf-panel">
        <h3>6. Concorrenza</h3>
        {!poisAvailable ? (
          <>
            <p>Concorrenza: <strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /></p>
            <p className="vf-small">Il provider di punti di interesse non era disponibile durante l'analisi.</p>
          </>
        ) : (
          <>
            <p>Livello di concorrenza: <strong>{competitionLevel}</strong>{competitorCount != null && ` · ${competitorCount} attività rilevanti nel raggio`}{nearestCompetitorKm != null && ` · la più vicina a ${nearestCompetitorKm} km`}. <Source tag="real" /></p>
            {competitors.length > 0 ? (
              <ul>{competitors.slice(0, 6).map(c => <li key={c.id}>{c.name} — {c.category} ({c.distanceKm} km)</li>)}</ul>
            ) : <p className="vf-small">{competitorCount === null ? `${NOT_AVAILABLE} (attività non mappata su categorie di concorrenza note).` : 'Nessun concorrente diretto rilevato nel raggio analizzato.'}</p>}
          </>
        )}
        <p>{narrative.competitionInterpretation || narrative.whyCompetitionHigh}</p>
      </section>

      <section className="vf-panel">
        <h3>7. Punti di interesse rilevanti</h3>
        {!poisAvailable ? (
          <p><strong>{NOT_AVAILABLE}</strong> <Source tag="unavailable" /> <span className="vf-small">Il provider di punti di interesse non era disponibile durante l'analisi.</span></p>
        ) : complementaryPois.length > 0 ? (
          <ul>{complementaryPois.slice(0, 8).map(p => <li key={p.id}>{p.name} — {p.category} ({p.distanceKm} km)</li>)}</ul>
        ) : <p className="vf-small">Nessun punto di interesse complementare rilevato nel raggio analizzato.</p>}
      </section>

      <section className="vf-panel">
        <h3>8. Punti di forza</h3>
        {Array.isArray(narrative.strengths) && narrative.strengths.length > 0 ? (
          <ul>{narrative.strengths.map((str, i) => <li key={i}>{str}</li>)}</ul>
        ) : (
          <p>{narrative.positioning}</p>
        )}
      </section>

      <section className="vf-panel">
        <h3>9. Rischi</h3>
        <ul>{(narrative.risks || narrative.riskFactors || []).map((risk, i) => <li key={i}>{risk}</li>)}</ul>
      </section>

      <section className="vf-panel">
        <h3>10. Opportunità</h3>
        {Array.isArray(narrative.opportunities) && narrative.opportunities.length > 0 ? (
          <ul>{narrative.opportunities.map((opp, i) => <li key={i}>{opp}</li>)}</ul>
        ) : (
          <p>{narrative.whyPromising}</p>
        )}
      </section>

      <section className="vf-panel">
        <h3>11. Valutazione finale di fattibilità</h3>
        <strong data-testid="vfb-final-score">{score}</strong>
        {isPreliminary && <p className="vf-small">Analisi incompleta: le fonti maggiori (ISTAT e/o punti di interesse) non erano disponibili. Questa non è una valutazione ALTA/MEDIA/BASSA normale.</p>}
        <p className="vf-small">Il punteggio combina bacino demografico, livello di concorrenza e contesto di punti di interesse — solo sui fattori realmente disponibili ({analysis.factorsUsed}/{analysis.factorsPossible}). Nessun voto è stato inventato. <Source tag="rule" /></p>
        <p className="vf-small">Affidabilità dei dati: <strong>{dataReliability.level}</strong>, basata su {dataReliability.factorsAvailable} fonti disponibili su {dataReliability.factorsPossible} ({dataReliability.factors.filter(f => f.available).map(f => f.name).join(', ') || 'nessuna'}). <Source tag="rule" /></p>
      </section>

      <section className="vf-panel">
        <h3>12. Raccomandazioni pratiche</h3>
        <ul>{(recommendations || narrative.recommendations || []).map((rec, i) => <li key={i}>{rec}</li>)}</ul>
      </section>

      <section className="vf-panel">
        <h3>13. Prossima azione consigliata</h3>
        <p>{narrative.nextAction || narrative.recommendedAction}</p>
        <p className="vf-small">L'acquisto di una campagna di distribuzione non è obbligatorio: questa è un'analisi indipendente.</p>
        {onCta && (
          <div className="vf-actions vf-no-print">
            <button type="button" onClick={() => onCta('another_zone')}>Analizza un'altra zona</button>
            <button type="button" onClick={() => onCta('quote')}>Calcola un preventivo</button>
            <button type="button" onClick={() => onCta('coverage')}>Analizza copertura</button>
            <button type="button" className="vf-primary" onClick={() => onCta('campaign')}>Avvia campagna</button>
            <button type="button" onClick={() => onCta('consultant')}>Parla con un consulente</button>
          </div>
        )}
      </section>

      <section className="vf-panel">
        <h3>14. Fonti dei dati e ipotesi</h3>
        <dl className="vf-sources">
          <div><dt>Tipo di attività, località, stato, cliente target, prezzo, obiettivo</dt><dd>Dati inseriti dal cliente<Source tag="user" /></dd></div>
          <div><dt>Popolazione / famiglie</dt><dd>{targetPotential.available ? 'ISTAT' : NOT_AVAILABLE}<Source tag={targetPotential.available ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Punti di interesse e concorrenza</dt><dd>{poisAvailable ? 'OpenStreetMap / provider POI' : NOT_AVAILABLE}<Source tag={poisAvailable ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Coordinate della località</dt><dd>{analysis.locationResolved ? 'Geocoding interno' : NOT_AVAILABLE}<Source tag={analysis.locationResolved ? 'real' : 'unavailable'} /></dd></div>
          <div><dt>Potenzialità finale e affidabilità dei dati</dt><dd>Regola deterministica basata sui fattori disponibili<Source tag="rule" /></dd></div>
        </dl>
        {narrative.dataReliabilityComment && <p className="vf-small">{narrative.dataReliabilityComment}</p>}
        <p className="vf-small">Nessuna stima statistica di domanda è stata generata: dove manca una fonte reale, il report lo indica esplicitamente invece di stimare un valore.</p>
      </section>

      {/* ── Sezioni economiche (ticket "UPGRADE FATTIBILITÀ DELLA MIA ATTIVITÀ",
          §8) — additive: renderizzate SOLO quando il chiamante passa
          `financial`/`synthesis` (FeasibilityBusinessFlow reale li passa
          sempre; i vecchi test/chiamate che passano solo il motore
          territoriale continuano a vedere esattamente le 14 sezioni di
          prima, invariate). */}
      {financial && synthesis && (() => {
        const fi = financial.inputs;
        const profileWeaknesses = [];
        if (fi.estimatedFields.grossMarginPct.estimated) {
          profileWeaknesses.push(`Il margine lordo usato nei calcoli (${pct(fi.grossMarginPct)}) è una stima prudente del modello, non un dato fornito da te: verificalo con i costi reali prima di decidere.`);
        }
        if (fi.estimatedFields.monthlyStaffCost.estimated && fi.staffCount > 0) {
          profileWeaknesses.push(`Il costo mensile del personale (${eur(fi.monthlyStaffCost)}) è stimato dal modello (€1.800/mese per addetto): il costo reale può differire sensibilmente.`);
        }
        if (!financial.payback.reached) {
          profileWeaknesses.push(`L'investimento iniziale di ${eur(fi.initialInvestment)} non risulta recuperato entro 36 mesi nello scenario indicato: la struttura di costi fissi assorbe gran parte del margine generato.`);
        }
        if (financial.capitalAdequate === false) {
          profileWeaknesses.push(`Il capitale disponibile dichiarato (${eur(fi.availableCapital)}) è inferiore all'investimento iniziale richiesto (${eur(fi.initialInvestment)}).`);
        }
        if (profileWeaknesses.length === 0) profileWeaknesses.push('Nessuna debolezza economica rilevante emersa dai dati forniti, oltre alla normale incertezza di ogni proiezione.');

        const threats = [];
        if (analysis.competitionLevel === 'ALTA') threats.push('Ingresso di nuovi concorrenti diretti in un\'area già densamente presidiata, con possibile pressione sui prezzi.');
        if (!analysis.poisAvailable) threats.push('Impossibilità di monitorare in tempo reale nuovi ingressi competitivi nella zona (provider dati temporaneamente non disponibile).');
        threats.push('Variazioni normative, fiscali o del costo del lavoro che potrebbero alterare la struttura dei costi fissi stimata in questo report.');
        if (fi.monthlyGrowthPct != null) threats.push(`La crescita mensile ipotizzata (${pct(fi.monthlyGrowthPct)}) potrebbe non realizzarsi come previsto in caso di stagionalità o rallentamento della domanda locale.`);

        const scenarioRows = [
          ['Prudente', financial.scenarios.prudente],
          ['Realistico', financial.scenarios.realistico],
          ['Crescita', financial.scenarios.crescita],
        ];

        return (
          <>
            <section className="vf-panel">
              <h3>15. Modello di business</h3>
              <p>Attività: <strong>{inputs.businessType || NOT_AVAILABLE}</strong>, ricavo generato principalmente per cliente/mese a un prezzo medio di {eur(fi.averagePrice)}. <Source tag="user" /></p>
              <p>Ricavo medio mensile per cliente usato nei calcoli: <strong>{eur(fi.averageCustomerRevenue)}</strong> <Source tag={fi.estimatedFields.averageCustomerRevenue.estimated ? 'estimate' : 'user'} />. Margine lordo medio: <strong>{pct(fi.grossMarginPct)}</strong> <Source tag={fi.estimatedFields.grossMarginPct.estimated ? 'estimate' : 'user'} />.</p>
              {fi.otherMonthlyRevenue > 0 && <p>Altri ricavi mensili dichiarati (es. servizi accessori): {eur(fi.otherMonthlyRevenue)}. <Source tag="user" /></p>}
            </section>

            <section className="vf-panel">
              <h3>16. Investimento iniziale</h3>
              <dl className="vf-metrics">
                <div><dt>Investimento iniziale</dt><dd data-testid="vfb-fin-investment">{eur(fi.initialInvestment)}</dd></div>
                <div><dt>Capitale disponibile</dt><dd>{fi.availableCapital == null ? NOT_AVAILABLE : eur(fi.availableCapital)}</dd></div>
              </dl>
              <p className="vf-small">
                {financial.capitalAdequate == null
                  ? 'Capitale disponibile non indicato: non è possibile verificare la copertura dell\'investimento iniziale.'
                  : financial.capitalAdequate
                    ? 'Il capitale disponibile dichiarato copre l\'investimento iniziale indicato.'
                    : 'Il capitale disponibile dichiarato NON copre l\'investimento iniziale indicato: valuta un finanziamento o una riduzione dell\'investimento di partenza.'}
              </p>
            </section>

            <section className="vf-panel">
              <h3>17. Costi fissi mensili</h3>
              <dl className="vf-metrics">
                <div><dt>Affitto mensile</dt><dd>{eur(fi.monthlyRent)}</dd></div>
                <div><dt>Costo personale ({fmt(fi.staffCount)} addetti)</dt><dd>{eur(fi.monthlyStaffCost)} <Source tag={fi.estimatedFields.monthlyStaffCost.estimated ? 'estimate' : 'user'} /></dd></div>
                <div><dt>Altri costi fissi</dt><dd>{eur(fi.otherFixedCostsMonthly)}</dd></div>
                <div><dt>Totale costi fissi mensili</dt><dd data-testid="vfb-fixed-costs"><strong>{eur(financial.breakEven.fixedCosts)}</strong></dd></div>
              </dl>
            </section>

            <section className="vf-panel">
              <h3>18. Costi variabili</h3>
              <p>Costi variabili stimati come quota del ricavo, in base al margine lordo medio per cliente: <strong>{pct(100 - fi.grossMarginPct)}</strong> del ricavo. <Source tag="rule" /></p>
              <p className="vf-small">Costi variabili al mese 1 (con {fmt(fi.launchCustomers)} clienti): {eur(financial.month1.variableCosts)}. Al mese 12 (con {fmt(fi.targetCustomers12mo)} clienti): {eur(financial.month12.variableCosts)}.</p>
            </section>

            <section className="vf-panel">
              <h3>19. Modello di ricavo</h3>
              <dl className="vf-metrics">
                <div><dt>Ricavo mensile al lancio ({fmt(fi.launchCustomers)} clienti)</dt><dd data-testid="vfb-revenue-launch">{eur(financial.month1.revenue)}</dd></div>
                <div><dt>Ricavo mensile a 12 mesi ({fmt(fi.targetCustomers12mo)} clienti)</dt><dd data-testid="vfb-revenue-12mo">{eur(financial.month12.revenue)}</dd></div>
              </dl>
              <p className="vf-small">Ricavo mensile = clienti × ricavo medio per cliente + altri ricavi mensili. <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>20. Analisi del pareggio</h3>
              {financial.breakEven.reachable ? (
                <>
                  <dl className="vf-metrics">
                    <div><dt>Clienti per il pareggio</dt><dd data-testid="vfb-breakeven-customers"><strong>{fmt(financial.breakEven.customers)}</strong></dd></div>
                    <div><dt>Ricavo mensile di pareggio</dt><dd>{eur(financial.breakEven.revenue)}</dd></div>
                  </dl>
                  <p className="vf-small">Clienti per pareggio = costi fissi mensili ({eur(financial.breakEven.fixedCosts)}) ÷ margine di contribuzione per cliente ({eur(financial.breakEven.contributionMarginPerCustomer)}), arrotondato per eccesso. <Source tag="rule" /></p>
                </>
              ) : (
                <p><strong>{NOT_AVAILABLE}</strong> — il margine di contribuzione per cliente è nullo o negativo con i dati indicati: il pareggio non è raggiungibile finché prezzo/margine o costi non cambiano. <Source tag="rule" /></p>
              )}
            </section>

            <section className="vf-panel">
              <h3>21. Analisi degli scenari</h3>
              <p className="vf-small">Prudente = 70% della traiettoria clienti indicata. Realistico = traiettoria indicata senza correzioni. Crescita = 130% della traiettoria indicata. Ipotesi di scenario, non previsioni garantite. <Source tag="rule" /></p>
              <div className="vf-table-wrap" tabIndex={0} role="region" aria-label="Tabella scenari scorrevole">
                <table>
                  <caption>3 scenari deterministici</caption>
                  <thead><tr>{['Scenario', 'Clienti/mese (1° anno)', 'Ricavo mensile (mese 12)', 'Risultato operativo (mese 12)', 'Risultato 12 mesi', 'Pareggio raggiunto', 'ROI 12 mesi', 'Payback'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {scenarioRows.map(([label, s]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{fmt(s.avgCustomersYear1)}</td>
                        <td>{eur(s.monthlyRevenueMonth12)}</td>
                        <td>{eur(s.operatingProfitMonth12)}</td>
                        <td>{eur(s.annualResult12mo)}</td>
                        <td>{s.breakEvenReachedWithinYear1 ? 'SÌ' : 'NO'}</td>
                        <td>{s.roi12mo == null ? NOT_AVAILABLE : pct(s.roi12mo)}</td>
                        <td>{s.payback.reached ? months(s.payback.months) : `${NOT_AVAILABLE} (>36 mesi)`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="vf-panel">
              <h3>22. Proiezioni finanziarie 12/24/36 mesi</h3>
              <div className="vf-table-wrap" tabIndex={0} role="region" aria-label="Tabella proiezioni scorrevole">
                <table>
                  <caption>Scenario realistico — risultato operativo cumulato</caption>
                  <thead><tr><th scope="col">Orizzonte</th><th scope="col">Ricavo cumulato</th><th scope="col">Risultato operativo cumulato</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">12 mesi</th><td>{eur(financial.projections.months12.revenue)}</td><td data-testid="vfb-profit-12mo">{eur(financial.projections.months12.profit)}</td></tr>
                    <tr><th scope="row">24 mesi</th><td>{eur(financial.projections.months24.revenue)}</td><td>{eur(financial.projections.months24.profit)}</td></tr>
                    <tr><th scope="row">36 mesi</th><td>{eur(financial.projections.months36.revenue)}</td><td>{eur(financial.projections.months36.profit)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="vf-small">Dal mese 13 la traiettoria clienti resta pari all'obiettivo a 12 mesi indicato, salvo una crescita mensile esplicita. <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>23. ROI</h3>
              <p>ROI a 12 mesi sull'investimento iniziale: <strong data-testid="vfb-roi">{financial.roi12mo == null ? 'Non definito (nessun investimento iniziale indicato)' : pct(financial.roi12mo)}</strong>. <Source tag="rule" /></p>
              <p className="vf-small">ROI 12 mesi = (risultato operativo cumulato a 12 mesi − investimento iniziale) ÷ investimento iniziale × 100.</p>
            </section>

            <section className="vf-panel">
              <h3>24. Periodo di recupero (payback)</h3>
              <p>Tempo stimato per recuperare l'investimento iniziale: <strong data-testid="vfb-payback">{financial.payback.reached ? months(financial.payback.months) : `oltre 36 mesi (${NOT_AVAILABLE} nell'orizzonte analizzato)`}</strong>. <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>25. Riepilogo cash-flow</h3>
              <dl className="vf-metrics">
                <div><dt>Risultato operativo mese 1</dt><dd>{eur(financial.month1.operatingProfit)}</dd></div>
                <div><dt>Risultato operativo mese 12</dt><dd>{eur(financial.month12.operatingProfit)}</dd></div>
              </dl>
              <p className="vf-small">Risultato operativo mensile = contribuzione (clienti × margine per cliente + altri ricavi) − costi fissi mensili. Non include imposte, finanziamenti o ammortamenti. <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>26. SWOT — matrice a 4 quadranti</h3>
              <dl className="vf-swot">
                <div><dt>Punti di forza</dt><dd><ul>{(narrative.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul></dd></div>
                <div><dt>Debolezze</dt><dd><ul>{profileWeaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul></dd></div>
                <div><dt>Opportunità</dt><dd><ul>{(narrative.opportunities || []).map((o, i) => <li key={i}>{o}</li>)}</ul></dd></div>
                <div><dt>Minacce</dt><dd><ul>{threats.map((t, i) => <li key={i}>{t}</li>)}</ul></dd></div>
              </dl>
            </section>

            <section className="vf-panel">
              <h3>27. Analisi di sensitività</h3>
              <div className="vf-table-wrap" tabIndex={0} role="region" aria-label="Tabella sensitività scorrevole">
                <table>
                  <caption>Effetto di margine e costi fissi sui clienti necessari al pareggio</caption>
                  <thead><tr><th scope="col">Variazione</th><th scope="col">Clienti per pareggio</th></tr></thead>
                  <tbody>
                    {financial.sensitivity.rows.map(row => (
                      <tr key={row.label}><th scope="row">{row.label}</th><td>{row.breakEven.reachable ? fmt(row.breakEven.customers) : NOT_AVAILABLE}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="vf-small">Variazioni deterministiche (±10 punti percentuali di margine, ±10% di costi fissi) rispetto ai dati indicati — non una simulazione statistica. <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>28. Sintesi territorio + economia e verdetto finale</h3>
              <dl className="vf-metrics">
                <div><dt>Punteggio territoriale</dt><dd>{synthesis.territorialScore}</dd></div>
                <div><dt>Punteggio economico</dt><dd data-testid="vfb-economic-score">{synthesis.economicScore}</dd></div>
                <div><dt>Punteggio di rischio</dt><dd>{synthesis.riskScore}</dd></div>
              </dl>
              <p className="vf-small">{synthesis.economicScoreReason}</p>
              {synthesis.riskScoreReason && <p className="vf-small">{synthesis.riskScoreReason}</p>}
              <p><strong data-testid="vfb-final-verdict" style={{ fontSize: '1.3em' }}>{synthesis.finalVerdict}</strong>: {synthesis.finalVerdictWhy}</p>
              <p className="vf-small">Regola di classificazione: {synthesis.finalVerdictRules} <Source tag="rule" /></p>
            </section>

            <section className="vf-panel">
              <h3>29. Ipotesi economiche e metodologia</h3>
              <dl className="vf-sources">
                <div><dt>Investimento, affitto, personale, prezzo medio, clienti attesi</dt><dd>Dati inseriti dal cliente<Source tag="user" /></dd></div>
                <div><dt>Costo personale mensile</dt><dd>{fi.estimatedFields.monthlyStaffCost.estimated ? 'Stima del modello (€1.800/mese per addetto)' : 'Dato fornito dal cliente'}<Source tag={fi.estimatedFields.monthlyStaffCost.estimated ? 'estimate' : 'user'} /></dd></div>
                <div><dt>Margine lordo medio</dt><dd>{fi.estimatedFields.grossMarginPct.estimated ? 'Stima del modello (60%)' : 'Dato fornito dal cliente'}<Source tag={fi.estimatedFields.grossMarginPct.estimated ? 'estimate' : 'user'} /></dd></div>
                <div><dt>Ricavo medio per cliente</dt><dd>{fi.estimatedFields.averageCustomerRevenue.estimated ? 'Stima del modello (= prezzo medio)' : 'Dato fornito dal cliente'}<Source tag={fi.estimatedFields.averageCustomerRevenue.estimated ? 'estimate' : 'user'} /></dd></div>
                <div><dt>Break-even, ROI, payback, scenari, sensitività, verdetto finale</dt><dd>Regola deterministica basata sui dati sopra<Source tag="rule" /></dd></div>
              </dl>
              <p className="vf-small">{FINANCIAL_DISCLAIMER}</p>
            </section>
          </>
        );
      })()}

      <div className="vf-print-footer"><span>VolantiniPro · Studio di Fattibilità AI — Attività e Territorio</span><span>{businessName || inputs.businessType || 'Attività'} · {inputs.location || 'Zona'} · {analysisDate}</span></div>
    </article>
  );
}
