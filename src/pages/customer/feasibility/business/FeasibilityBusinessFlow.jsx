import React, { useEffect, useMemo, useState } from 'react';
import { FeasibilityBusinessStep1, FeasibilityBusinessStep2 } from './FeasibilityBusinessInputs.jsx';
import { FeasibilityBusinessFinancialInputs } from './FeasibilityBusinessFinancialInputs.jsx';
import FeasibilityBusinessSmartPairing from './FeasibilityBusinessSmartPairing.jsx';
import FeasibilityBusinessReport from './FeasibilityBusinessReport.jsx';
import { resolveBusinessLocationAsync, activityToPoiTargets, isBusinessInputsComplete } from './feasibilityBusinessSchemas.js';
import { fetchBusinessTerritorialData } from './feasibilityBusinessTerritory.js';
import { buildBusinessAnalysis } from './feasibilityBusinessEngine.js';
import { buildBusinessFinancialAnalysis } from './feasibilityBusinessFinancialEngine.js';
import { buildBusinessSynthesis } from './feasibilityBusinessSynthesis.js';
import { buildBusinessNarrative } from './feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from './feasibilityBusinessRecommendations.js';
import { usePoi } from '../../../../hooks/usePoi.js';

// Orchestratore Business Mode (§14, esteso dal ticket "UPGRADE FATTIBILITÀ
// DELLA MIA ATTIVITÀ"): Step1 attività/località/stato -> Step2 pubblico/
// obiettivo -> Step3 dati economici (NUOVO) -> Step4 Smart Pairing
// opzionale -> Step5 report. Stato locale, isolato dalla Campaign Mode:
// nessuna interferenza con feasibilitySchemas.js / feasibilityEngine.js
// esistenti. Il motore territoriale (buildBusinessAnalysis) resta invariato:
// il nuovo motore economico (buildBusinessFinancialAnalysis) e la sintesi
// (buildBusinessSynthesis) sono puramente additivi.
export default function FeasibilityBusinessFlow({ inputs, onChange, onBackToChoice, onNav }) {
  const [phase, setPhase] = useState(0);
  const change = patch => onChange({ ...inputs, ...patch });
  const REPORT_PHASE = 4;

  // Risoluzione geografica REALE (ticket "GEOCODING + ISTAT + POI
  // CONSISTENCY"): asincrona perché puo' richiedere un geocoder di rete
  // (resolveBusinessLocationAsync), non piu' un semplice lookup sincrono su
  // GEO_DATA. `locationAttempted` distingue "non ancora tentato"/"in corso"
  // da "tentato e fallito", cosi' un fallimento reale del geocoder non viene
  // mai scambiato per un successo con zero risultati (§6).
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  useEffect(() => {
    if (phase !== REPORT_PHASE) return;
    let cancelled = false;
    setLocationLoading(true);
    resolveBusinessLocationAsync(inputs.location)
      .then(result => { if (!cancelled) setLocation(result); })
      .catch(() => { if (!cancelled) setLocation(null); })
      .finally(() => { if (!cancelled) setLocationLoading(false); });
    return () => { cancelled = true; };
  }, [phase, inputs.location]);

  const radiusKm = Number(inputs.radiusKm) > 0 ? Number(inputs.radiusKm) : 3;
  const { targets, serviceType } = useMemo(() => activityToPoiTargets(inputs.businessType), [inputs.businessType]);

  // Il motore POI reale esistente (usePoi -> fetchPois -> proxy poi-search)
  // viene interrogato SOLO quando siamo sul passo Report e la località è
  // GIA' stata risolta con successo: nessuna chiamata prima che serva
  // davvero, e mai un fallback su un centro Milano generico quando la
  // località non è (ancora) risolta (§5 — "non usare il fallback centrale
  // Milano quando esiste una coordinata di indirizzo": qui semplicemente non
  // si interroga affatto finché non c'è una coordinata reale).
  const poiActive = phase === REPORT_PHASE && Boolean(location);
  const { pois, loading: poiLoading, error: poiError } = usePoi(
    poiActive ? location.lat : null,
    poiActive ? location.lng : null,
    radiusKm,
    serviceType,
    targets,
  );

  const [territorial, setTerritorial] = useState({ population: null, households: null, available: false });
  const [territorialLoading, setTerritorialLoading] = useState(false);

  useEffect(() => {
    if (phase !== REPORT_PHASE || !location) return;
    let cancelled = false;
    setTerritorialLoading(true);
    fetchBusinessTerritorialData({ lat: location.lat, lng: location.lng, municipalityName: location.city, radiusKm })
      .then(data => { if (!cancelled) setTerritorial(data); })
      .finally(() => { if (!cancelled) setTerritorialLoading(false); });
    return () => { cancelled = true; };
  }, [phase, location, radiusKm]);

  // §6 del ticket: un fallimento tecnico del POI (o una località che non è
  // MAI stata risolta) non deve mai essere letto come "zero concorrenti
  // reali". `poisAvailable` è true SOLO quando la località è risolta E il
  // provider POI non ha segnalato un errore — prima della correzione qui
  // sotto, `poiError` restava `null` anche quando `usePoi` non era mai stato
  // interrogato per mancanza di coordinate, facendo apparire "Concorrenza:
  // BASSA / 0 attività rilevanti" per una richiesta mai partita.
  const poisAvailable = Boolean(location) && !poiError;

  const analysis = useMemo(() => {
    if (phase !== REPORT_PHASE || locationLoading) return null;
    return buildBusinessAnalysis({
      center: location ? { lat: location.lat, lng: location.lng } : null,
      location,
      radiusKm,
      pois,
      poisAvailable,
      targets,
      territorial,
      inputsComplete: isBusinessInputsComplete(inputs),
    });
  }, [phase, locationLoading, location, radiusKm, pois, poisAvailable, targets, territorial, inputs]);

  const narrative = useMemo(() => (analysis ? buildBusinessNarrative({ inputs, analysis }) : null), [analysis, inputs]);
  const recommendations = useMemo(() => (analysis ? buildBusinessRecommendations({ analysis }) : []), [analysis]);

  // Motore economico (ticket "UPGRADE FATTIBILITÀ DELLA MIA ATTIVITÀ"): nessuna
  // chiamata di rete, calcola solo dai dati economici già in `inputs` — puro,
  // sincrono, sempre disponibile appena si arriva al Report (non dipende da
  // geocoding/ISTAT/POI). La sintesi combina questo risultato con `analysis`
  // (motore territoriale, invariato) SENZA modificarne i campi.
  const financialAnalysis = useMemo(() => (phase === REPORT_PHASE ? buildBusinessFinancialAnalysis(inputs) : null), [phase, inputs]);
  const synthesis = useMemo(
    () => (analysis && financialAnalysis ? buildBusinessSynthesis({ territorialAnalysis: analysis, financialAnalysis }) : null),
    [analysis, financialAnalysis],
  );

  const reportLoading = phase === REPORT_PHASE && (locationLoading || (Boolean(location) && (poiLoading || territorialLoading)) || !analysis);

  return (
    <div>
      <nav className="vf-progress" aria-label="Fasi analisi attività">
        <ol>
          {['Attività e località', 'Pubblico e obiettivo', 'Dati economici', 'Smart Pairing (facoltativo)', 'Report'].map((label, index) => (
            <li key={label} aria-current={phase === index ? 'step' : undefined}><span>{index + 1}</span>{label}</li>
          ))}
        </ol>
      </nav>
      {phase === 0 && (
        <FeasibilityBusinessStep1
          inputs={inputs}
          onChange={change}
          onNext={() => setPhase(1)}
        />
      )}
      {phase === 1 && (
        <FeasibilityBusinessStep2
          inputs={inputs}
          onChange={change}
          onNext={() => setPhase(2)}
          onBack={() => setPhase(0)}
        />
      )}
      {phase === 2 && (
        <FeasibilityBusinessFinancialInputs
          inputs={inputs}
          businessType={inputs.businessType}
          onChange={change}
          onNext={() => setPhase(3)}
          onBack={() => setPhase(1)}
        />
      )}
      {phase === 3 && (
        <FeasibilityBusinessSmartPairing
          inputs={inputs}
          onNext={() => setPhase(REPORT_PHASE)}
          onBack={() => setPhase(2)}
        />
      )}
      {phase === REPORT_PHASE && analysis && narrative && financialAnalysis && synthesis && (
        <FeasibilityBusinessReport
          inputs={inputs}
          analysis={analysis}
          narrative={narrative}
          recommendations={recommendations}
          financial={financialAnalysis}
          synthesis={synthesis}
          loading={reportLoading}
          onEdit={() => setPhase(0)}
          onCta={target => {
            // §17: la campagna reale resta un invito, mai un passo obbligato.
            if (target === 'another_zone') { setPhase(0); return; }
            if (target === 'campaign' || target === 'quote') onNav?.('step1');
            else if (target === 'coverage') onNav?.('step1');
            else onNav?.('consultant');
          }}
        />
      )}
      <footer className="vf-footer vf-no-print">
        <button type="button" onClick={onBackToChoice}>Cambia tipo di analisi</button>
        <button type="button" onClick={() => onNav?.('dashboard')}>Dashboard</button>
        <p>Analisi gratuita basata su dati territoriali e punti di interesse reali. Non garantisce risultati commerciali.</p>
      </footer>
    </div>
  );
}
