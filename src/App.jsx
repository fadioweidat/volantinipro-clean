import { useEffect, useMemo, useState } from "react";
import { usePoi } from "./hooks/usePoi.js";
import { useSectors } from "./hooks/useSectors.js";
import { useAddressPoints } from "./hooks/useAddressPoints.js";
import { useTransportStops } from "./hooks/useTransportStops.js";
import { useServiceAnalysis } from "./hooks/useServiceAnalysis.js";
import { useOmiZonesAnalysis } from "./hooks/useOmiZonesAnalysis.js";
import { defaultLayersForService, getServiceLayers } from "./lib/services/service-config.js";
import { PlannerMap } from "./components/planner/PlannerMap.jsx";
import { ServiceStep } from "./components/planner/ServiceStep.jsx";
import { AreaStep } from "./components/planner/AreaStep.jsx";
import { CalendarStep } from "./components/planner/CalendarStep.jsx";
import { QuoteStep } from "./components/planner/QuoteStep.jsx";

const initialArea = {
  label: "Milano, Lombardia",
  lat: 45.4642,
  lng: 9.19,
  radiusKm: 4,
};

const steps = [
  { id: 1, label: "Servizio" },
  { id: 2, label: "Zona & GIS" },
  { id: 3, label: "Calendario" },
  { id: 4, label: "Preventivo" },
];

const initialService = {
  serviceType: "d2d",
  quantity: 10000,
  format: "A5",
  campaignType: "standard",
  flyerSupply: "ready",
};

const initialQuoteOptions = {
  design: false,
  advancedPhotoReport: false,
  analyticsReport: false,
  photoCertification: false,
  supervision: false,
};

export default function App() {
  const [mode, setMode] = useState("home");
  const [currentStep, setCurrentStep] = useState(1);
  const [service, setService] = useState(initialService);
  const [quoteOptions, setQuoteOptions] = useState(initialQuoteOptions);
  const [area, setArea] = useState(initialArea);
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [zones, setZones] = useState([]);
  const [mapDataMode, setMapDataMode] = useState("famiglie");
  const [mapOpacityLevel, setMapOpacityLevel] = useState("medium");
  const [allocationMode, setAllocationMode] = useState("auto");
  const [manualComuneFlyers, setManualComuneFlyers] = useState({});
  const [schedule, setSchedule] = useState({
    startDate: "",
    endDate: "",
    smartPairing: false,
    flexibilityDays: 3,
    notes: "",
  });
  const [layers, setLayers] = useState({ ...defaultLayersForService("d2d"), omi: true });

  const analysis = useServiceAnalysis(area.lat, area.lng, area.radiusKm, service.serviceType);
  const sectors = useSectors(area.lat, area.lng, area.radiusKm, service.serviceType);
  const poi = usePoi(area.lat, area.lng, area.radiusKm, service.serviceType);
  const addressPoints = useAddressPoints(area.lat, area.lng, area.radiusKm);
  const transport = useTransportStops(area.lat, area.lng, area.radiusKm, service.serviceType);
  const omi = useOmiZonesAnalysis({
    lat: area.lat,
    lng: area.lng,
    radiusKm: area.radiusKm,
    includeGeometry: true,
  });

  const availableLayers = useMemo(
    () => getServiceLayers(service.serviceType).filter((layer) => layer.available),
    [service.serviceType],
  );
  const civiciCount =
    Number(addressPoints.civiciState?.count || 0) ||
    Number(addressPoints.civiciState?.bboxCount || 0);
  const civiciAvailable =
    Boolean(addressPoints.civiciState?.available) || civiciCount > 0;

  useEffect(() => {
    if (!addressPoints.loading && !civiciAvailable) {
      setLayers((prev) => prev?.civici ? { ...prev, civici: false } : prev);
    }
  }, [addressPoints.loading, civiciAvailable]);

  const currentZone = useMemo(
    () => makeZoneSnapshot({ area, service, selectedSectors, analysis: analysis.data, sectors: sectors.sectors, poi: poi.pois, omi: omi.data }),
    [area, service, selectedSectors, analysis.data, sectors.sectors, poi.pois, omi.data],
  );

  const quoteZones = zones.length ? zones : [currentZone];
  const quote = useMemo(
    () => buildQuote({ service, schedule, zones: quoteZones, quoteOptions }),
    [service, schedule, quoteZones, quoteOptions],
  );

  function startPlanner(step = 1) {
    setMode("planner");
    setCurrentStep(step);
  }

  function updateService(patch) {
    const next = { ...service, ...patch };
    setService(next);
    if (patch.serviceType) {
      setLayers({ ...defaultLayersForService(patch.serviceType), omi: patch.serviceType !== "h2h" });
      setSelectedSectors([]);
    }
  }

  function toggleLayer(layerId) {
    if (layerId === "civici" && !civiciAvailable) return;
    setLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }

  function resetLayers() {
    setLayers({ ...defaultLayersForService(service.serviceType), omi: service.serviceType !== "h2h" });
  }

  function toggleSector(sectorId) {
    setSelectedSectors((prev) =>
      prev.includes(sectorId) ? prev.filter((id) => id !== sectorId) : [...prev, sectorId],
    );
  }

  function saveCurrentZone() {
    setZones((prev) => {
      const withoutSameArea = prev.filter((zone) => zone.id !== currentZone.id);
      return [...withoutSameArea, currentZone];
    });
  }

  function removeZone(zoneId) {
    setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
  }

  const sharedMap = (
    <PlannerMap
      area={area}
      serviceType={service.serviceType}
      sectors={sectors.sectors}
      selectedSectors={selectedSectors}
      onToggleSector={toggleSector}
      pois={poi.pois}
      civiciState={addressPoints.civiciState}
      transportState={transport.transportState}
      analysis={analysis.data}
      omi={omi.data}
      layers={layers}
      dataMode={mapDataMode}
      opacityLevel={mapOpacityLevel}
    />
  );

  if (mode === "home") {
    return (
      <HomePage
        map={sharedMap}
        analysis={analysis}
        sectors={sectors}
        poi={poi}
        omi={omi}
        onStart={(target) => {
          if (target === "quick" || target === "consultant") {
            startPlanner(4);
            return;
          }
          startPlanner(1);
        }}
        onOpenMap={() => startPlanner(2)}
      />
    );
  }

  return (
    <main className="app-shell product-shell">
      <section className="map-stage" aria-label="Mappa operativa VolantiniPro">
        {sharedMap}
        {currentStep === 2 && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 520,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              maxWidth: "calc(100% - 32px)",
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(248,250,248,.92)",
              border: "1px solid rgba(15,118,110,.16)",
              boxShadow: "0 10px 22px rgba(2,6,23,.10)",
              backdropFilter: "blur(10px)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 850, color: "#0f766e" }}>Visualizza per:</span>
            {[
              { id: "famiglie", label: "Famiglie" },
              { id: "popolazione", label: "Popolazione" },
              { id: "densita", label: "Densità" },
              { id: "peso", label: "Peso %" },
              { id: "volantini", label: "Volantini" },
              { id: "rilevanza", label: "Rilevanza" },
              { id: "eta65", label: "Età 65+" },
            ].map((tab) => {
              const active = mapDataMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMapDataMode(tab.id)}
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "#0f766e" : "rgba(15,118,110,.18)"}`,
                    background: active ? "rgba(15,118,110,.12)" : "rgba(255,255,255,.7)",
                    color: active ? "#0f766e" : "rgba(15,118,110,.78)",
                    fontSize: 12,
                    fontWeight: active ? 900 : 750,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="planner-panel" aria-label="Configuratore campagna">
        <header className="brand-header">
          <button className="brand-mark" type="button" onClick={() => setMode("home")}>VolantiniPro</button>
          <span className="status-pill">{analysis.loading || sectors.loading ? "Aggiorno dati" : "Backend live"}</span>
        </header>

        <div className="planner-title">
          <p className="eyebrow">Configuratore operativo</p>
          <h1>Campagna con GIS, calendario e preventivo</h1>
        </div>

        <nav className="step-tabs" aria-label="Step configurazione">
          {steps.map((step) => (
            <button
              key={step.id}
              className={step.id === currentStep ? "active" : ""}
              type="button"
              onClick={() => setCurrentStep(step.id)}
            >
              <span>{step.id}</span>
              {step.label}
            </button>
          ))}
        </nav>

        {currentStep === 1 && (
          <ServiceStep
            service={service}
            quote={quote}
            onServiceChange={updateService}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <AreaStep
            area={area}
            onAreaChange={setArea}
            layers={layers}
            availableLayers={availableLayers}
            onToggleLayer={toggleLayer}
            onResetLayers={resetLayers}
            opacityLevel={mapOpacityLevel}
            onOpacityChange={setMapOpacityLevel}
            sectorsState={sectors}
            poiState={poi}
            civiciState={addressPoints.civiciState}
            transportState={transport.transportState}
            serviceType={service.serviceType}
            analysisState={analysis}
            omiState={omi}
            selectedSectors={selectedSectors}
            totalFlyers={service.quantity}
            allocationMode={allocationMode}
            onAllocationModeChange={setAllocationMode}
            manualComuneFlyers={manualComuneFlyers}
            onManualComuneFlyersChange={setManualComuneFlyers}
            zones={zones}
            onSaveZone={saveCurrentZone}
            onRemoveZone={removeZone}
            onNext={() => {
              saveCurrentZone();
              setCurrentStep(3);
            }}
          />
        )}

        {currentStep === 3 && (
          <CalendarStep
            schedule={schedule}
            onScheduleChange={setSchedule}
            zones={quoteZones}
            onNext={() => setCurrentStep(4)}
          />
        )}

        {currentStep === 4 && (
          <QuoteStep
            quote={quote}
            service={service}
            schedule={schedule}
            zones={quoteZones}
            quoteOptions={quoteOptions}
            onQuoteOptionsChange={setQuoteOptions}
            analysis={analysis.data}
            omi={omi.data}
            onBackToMap={() => setCurrentStep(2)}
          />
        )}
      </aside>
    </main>
  );
}

function HomePage({ map, analysis, sectors, poi, omi, onStart, onOpenMap }) {
  const values = analysis.data?.values || {};
  return (
    <main className="site-shell">
      <header className="site-nav">
        <button className="brand-mark" type="button" style={{color: 'var(--primary)', fontSize: '1.2rem'}}>Volantini<span style={{color: 'var(--accent)'}}>Pro</span></button>
        <nav>
          <button type="button" onClick={onOpenMap} style={{background: 'transparent', border: 'none', color: 'var(--text-muted)', fontWeight: 600}}>Mappa GIS</button>
          <button type="button" onClick={onStart} style={{background: 'var(--primary)', color: 'white', border: 'none'}}>Configura campagna</button>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-copy">
          <p className="eyebrow" style={{color: 'var(--text-muted)'}}>Piattaforma SaaS di Pianificazione Territoriale</p>
          <h1>Distribuzione intelligente basata su dati reali.</h1>
          <p>
            VolantiniPro integra analisi geografiche, dati ISTAT, GIS e OMI in un flusso unico. 
            Progetta la tua campagna Door-to-Door o Hand-to-Hand con precisione matematica e ottieni un preventivo immediato.
          </p>
          <div className="hero-actions" style={{marginTop: '12px'}}>
            <button className="primary-action" type="button" onClick={onStart} style={{padding: '16px 24px', fontSize: '1.05rem'}}>Avvia configuratore</button>
            <button className="secondary-action" type="button" onClick={onOpenMap} style={{padding: '16px 24px', fontSize: '1.05rem', background: 'transparent', border: '1px solid var(--border-light)'}}>Esplora Mappa GIS</button>
          </div>
          
          <div style={{marginTop: '32px', display: 'flex', gap: '24px', alignItems: 'center'}}>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)'}}>{loadingValue(analysis.loading, values.comuni_coinvolti)}</span>
              <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase'}}>Comuni Analizzati</span>
            </div>
            <div style={{width: '1px', height: '40px', background: 'var(--border-light)'}}></div>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)'}}>{loadingValue(analysis.loading, values.famiglie_stimate)}</span>
              <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase'}}>Famiglie ISTAT</span>
            </div>
            <div style={{width: '1px', height: '40px', background: 'var(--border-light)'}}></div>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <span style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)'}}>{loadingValue(poi.loading, poi.pois?.length)}</span>
              <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase'}}>POI Reali Map</span>
            </div>
          </div>
        </div>
        <div className="home-map" aria-label="Anteprima GIS Lombardia">
          {map}
        </div>
      </section>

      <section className="workflow-band">
        <div style={{gridColumn: '1 / -1', textAlign: 'center', marginBottom: '32px'}}>
          <h2 style={{fontSize: '2.2rem', fontWeight: 800, color: 'var(--primary)'}}>Come funziona</h2>
          <p style={{color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '12px'}}>Un flusso guidato per progettare la tua campagna in 4 step.</p>
        </div>
        {steps.map((step) => (
          <article key={step.id}>
            <span style={{background: 'var(--primary)', boxShadow: 'var(--shadow-md)'}}>{step.id}</span>
            <h2 style={{color: 'var(--primary)'}}>{step.label}</h2>
            <p>{workflowText(step.id)}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function loadingValue(loading, value) {
  if (loading) return "...";
  if (value == null) return "n/d";
  return Number(value).toLocaleString("it-IT");
}

function workflowText(stepId) {
  if (stepId === 1) return "Servizio, quantità, formato e tipo campagna.";
  if (stepId === 2) return "Mappa GIS reale con comuni, settori, density, POI e OMI.";
  if (stepId === 3) return "Date operative e Smart Pairing senza tracking GPS.";
  return "Riepilogo zone, KPI territoriali e preventivo.";
}

function makeZoneSnapshot({ area, service, selectedSectors, analysis, sectors, poi, omi }) {
  const values = analysis?.values || {};
  const id = `${area.label}-${area.lat}-${area.lng}-${area.radiusKm}`.toLowerCase();
  return {
    id,
    label: area.label,
    lat: area.lat,
    lng: area.lng,
    radiusKm: area.radiusKm,
    serviceType: service.serviceType,
    quantity: service.quantity,
    format: service.format,
    campaignType: service.campaignType,
    selectedSectors: selectedSectors.length,
    sectorCount: sectors?.length ?? null,
    poiCount: poi?.length ?? null,
    omiZoneCount: omi?.values?.omi_zone_count ?? null,
    families: values.famiglie_stimate ?? null,
    population: values.popolazione_stimata ?? null,
    coverage: values.copertura_stimata ?? null,
    recommendedFlyers: values.volantini_consigliati ?? null,
    density: values.densita_media ?? null,
    comuni: analysis?.comuni_breakdown || [],
  };
}

function buildQuote({ service, schedule, zones, quoteOptions }) {
  const unitPrices = { d2d: 0.085, h2h: 0.12, b2b: 0.16 };
  const setup = { d2d: 90, h2h: 140, b2b: 180 };
  const formatMultiplier = { A6: 0.92, A5: 1, A4: 1.18, DL: 1.05 };
  const campaignMultiplier = { standard: 1, urgent: 1.18, multi_area: 1.08 };
  const addOnPrices = {
    design: 49,
    advancedPhotoReport: 39,
    analyticsReport: 59,
    photoCertification: 29,
    supervision: 89,
  };
  const unit = unitPrices[service.serviceType] ?? unitPrices.d2d;
  const totalQuantity = zones.reduce((sum, zone) => sum + Number(zone.quantity || service.quantity || 0), 0);
  const logistics = zones.reduce((sum, zone) => sum + setup[service.serviceType] + Number(zone.radiusKm || 0) * 18, 0);
  const smartPairingDiscount = schedule.smartPairing ? 0.08 : 0;
  const distributionBase = (totalQuantity * unit * (formatMultiplier[service.format] || 1) * (campaignMultiplier[service.campaignType] || 1)) + logistics;
  const printCost = service.flyerSupply === "print" ? Math.round((totalQuantity / 1000) * 29 * 100) / 100 : 0;
  const addOns = Object.entries(addOnPrices).reduce((sum, [key, price]) => sum + (quoteOptions?.[key] ? price : 0), 0);
  const discount = Math.round(distributionBase * smartPairingDiscount * 100) / 100;
  const subtotal = Math.round((distributionBase - discount + printCost + addOns) * 100) / 100;
  const vat = Math.round(subtotal * 0.22 * 100) / 100;

  return {
    unit,
    totalQuantity,
    distributionBase: Math.round(distributionBase * 100) / 100,
    printCost,
    addOns,
    discount,
    subtotal,
    vat,
    total: Math.round((subtotal + vat) * 100) / 100,
    recommended: zones.reduce((sum, zone) => sum + Number(zone.recommendedFlyers || 0), 0) || null,
  };
}
