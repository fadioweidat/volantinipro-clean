import React, { useEffect, useMemo, useState } from 'react';
import { FeasibilityBusinessStep1, FeasibilityBusinessStep2 } from './FeasibilityBusinessInputs.jsx';
import FeasibilityBusinessSmartPairing from './FeasibilityBusinessSmartPairing.jsx';
import FeasibilityBusinessReport from './FeasibilityBusinessReport.jsx';
import { resolveBusinessLocation, activityToPoiTargets, isBusinessInputsComplete } from './feasibilityBusinessSchemas.js';
import { fetchBusinessTerritorialData } from './feasibilityBusinessTerritory.js';
import { buildBusinessAnalysis } from './feasibilityBusinessEngine.js';
import { buildBusinessNarrative } from './feasibilityBusinessNarrative.js';
import { buildBusinessRecommendations } from './feasibilityBusinessRecommendations.js';
import { usePoi } from '../../../../hooks/usePoi.js';

// Orchestratore Business Mode (§14): Step1 attività/località/stato -> Step2
// pubblico/obiettivo -> Step3 Smart Pairing opzionale -> Step4 report.
// Stato locale, isolato dalla Campaign Mode: nessuna interferenza con
// feasibilitySchemas.js / feasibilityEngine.js esistenti.
export default function FeasibilityBusinessFlow({ inputs, onChange, onBackToChoice, onNav }) {
  const [phase, setPhase] = useState(0);
  const change = patch => onChange({ ...inputs, ...patch });

  const location = useMemo(() => resolveBusinessLocation(inputs.location), [inputs.location]);
  const radiusKm = Number(inputs.radiusKm) > 0 ? Number(inputs.radiusKm) : 3;
  const { targets, serviceType } = useMemo(() => activityToPoiTargets(inputs.businessType), [inputs.businessType]);

  // Il motore POI reale esistente (usePoi -> fetchPois -> proxy poi-search)
  // viene interrogato SOLO quando siamo sul passo Report e la località è
  // risolta: nessuna chiamata prima che serva davvero.
  const poiActive = phase === 3 && location;
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
    if (phase !== 3 || !location) return;
    let cancelled = false;
    setTerritorialLoading(true);
    fetchBusinessTerritorialData({ lat: location.lat, lng: location.lng, municipalityName: location.name, radiusKm })
      .then(data => { if (!cancelled) setTerritorial(data); })
      .finally(() => { if (!cancelled) setTerritorialLoading(false); });
    return () => { cancelled = true; };
  }, [phase, location, radiusKm]);

  const analysis = useMemo(() => {
    if (phase !== 3) return null;
    return buildBusinessAnalysis({
      center: location ? { lat: location.lat, lng: location.lng } : null,
      radiusKm,
      pois,
      poisAvailable: !poiError,
      targets,
      territorial,
      inputsComplete: isBusinessInputsComplete(inputs),
    });
  }, [phase, location, radiusKm, pois, poiError, targets, territorial, inputs]);

  const narrative = useMemo(() => (analysis ? buildBusinessNarrative({ inputs, analysis }) : null), [analysis, inputs]);
  const recommendations = useMemo(() => (analysis ? buildBusinessRecommendations({ analysis }) : []), [analysis]);

  const reportLoading = phase === 3 && (poiLoading || territorialLoading || !analysis);

  return (
    <div>
      <nav className="vf-progress" aria-label="Fasi analisi attività">
        <ol>
          {['Attività e località', 'Pubblico e obiettivo', 'Smart Pairing (facoltativo)', 'Report'].map((label, index) => (
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
        <FeasibilityBusinessSmartPairing
          inputs={inputs}
          onNext={() => setPhase(3)}
          onBack={() => setPhase(1)}
        />
      )}
      {phase === 3 && analysis && narrative && (
        <FeasibilityBusinessReport
          inputs={inputs}
          analysis={analysis}
          narrative={narrative}
          recommendations={recommendations}
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
