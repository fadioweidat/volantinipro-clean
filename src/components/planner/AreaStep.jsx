import { useMemo, useState } from "react";

const quickAreas = [
  { label: "Milano", lat: 45.4642, lng: 9.19, radiusKm: 4 },
  { label: "Monza", lat: 45.5845, lng: 9.2744, radiusKm: 4 },
  { label: "Bergamo", lat: 45.6983, lng: 9.6773, radiusKm: 4 },
  { label: "Brescia", lat: 45.5416, lng: 10.2118, radiusKm: 4 },
];

export function AreaStep({
  area,
  onAreaChange,
  layers,
  availableLayers,
  onToggleLayer,
  onResetLayers,
  opacityLevel,
  onOpacityChange,
  sectorsState,
  poiState,
  civiciState,
  transportState,
  serviceType,
  analysisState,
  omiState,
  selectedSectors,
  totalFlyers,
  allocationMode,
  onAllocationModeChange,
  manualComuneFlyers,
  onManualComuneFlyersChange,
  zones,
  onSaveZone,
  onRemoveZone,
  onNext,
}) {
  const [query, setQuery] = useState(area.label);
  const [geocodeState, setGeocodeState] = useState({ loading: false, error: null });
  const values = analysisState.data?.values || {};
  const comuniRows = analysisState.data?.comuni_breakdown || [];
  const totalAvailableFlyers = Number(totalFlyers || 0);

  const computed = useMemo(
    () => computeComuneAllocation({ rows: comuniRows, totalAvailableFlyers, center: { lat: area.lat, lng: area.lng } }),
    [comuniRows, totalAvailableFlyers, area.lat, area.lng],
  );

  const assignedFlyersMap = allocationMode === "manual" ? (manualComuneFlyers || {}) : computed.autoAssigned;
  const manualSum = allocationMode === "manual" ? sumValues(assignedFlyersMap) : computed.totalAssigned;
  const manualOver = allocationMode === "manual" ? Math.max(0, manualSum - totalAvailableFlyers) : 0;
  const manualResidual = allocationMode === "manual" ? Math.max(0, totalAvailableFlyers - manualSum) : 0;
  const civiciCount =
    Number(civiciState?.count || 0) ||
    Number(civiciState?.bboxCount || 0);
  const civiciAvailable =
    Boolean(civiciState?.available) || civiciCount > 0;
  const civiciLabel = civiciAvailable ? "OSM · copertura parziale" : "Civici non disponibili";
  const civiciMessage = civiciAvailable
    ? (civiciState?.message || "Civici OSM presenti nel bbox selezionato. Copertura non completa.")
    : (civiciState?.message || "Serve una fonte dati civici/address points completa per questa zona.");
  const hasCiviciLayer = Array.isArray(availableLayers) && availableLayers.some((layer) => layer.id === "civici");
  const showTransport = serviceType === "h2h";
  const transportAvailable = Boolean(
    transportState?.available ||
    Number(transportState?.count || 0) > 0 ||
    (transportState?.stops || []).length > 0
  );
  const transportLabel = getTransportLayerLabel(transportState, transportAvailable);
  const transportRouteTypes = transportState?.routeTypes || [];
  const transportModesLabel = transportRouteTypes.length
    ? transportRouteTypes.filter((type) => type !== "unknown").map(transportModeLabel).join(", ")
    : "n/d";
  const poiCount = poiState.pois?.length ?? 0;
  const commercialPoiCount = countCommercialPois(poiState.pois || []);
  const schoolEventCount = countSchoolEventPois(poiState.pois || []);
  const operationalPointCount = showTransport
    ? poiCount + Number(transportState?.count || 0) + Number(transportState?.hotspotCount || 0)
    : poiCount;
  const inRadiusCount = computed.items.filter((it) => it.inRadius).length;
  const coveredCount = computed.items.filter((it) => it.inRadius && (assignedFlyersMap?.[it.key] || 0) > 0).length;
  const uncoveredInRadius = computed.items.filter((it) => it.inRadius && (assignedFlyersMap?.[it.key] || 0) === 0).length;
  const outOfRadiusCount = computed.items.filter((it) => !it.inRadius).length;

  const kpiRecommended = Number(values.volantini_consigliati || 0);
  const kpiDiff = kpiRecommended > 0 && computed.sumRecommended > 0 ? Math.abs(kpiRecommended - computed.sumRecommended) : 0;
  const residentialScores = {
    familyIndex: Number.isFinite(Number(values.family_index)) ? Math.round(Number(values.family_index)) : null,
    reachScore: Number.isFinite(Number(values.reach_score)) ? Math.round(Number(values.reach_score)) : null,
    roiScore: Number.isFinite(Number(values.roi_score)) ? Math.round(Number(values.roi_score)) : null,
    confidenceScore: Number.isFinite(Number(values.confidence_score)) ? Math.round(Number(values.confidence_score)) : null,
  };
  const operationalConfidence = operationalPointCount >= 20
    ? "alta"
    : operationalPointCount >= 6
      ? "media"
      : operationalPointCount > 0
        ? "bassa"
        : "dato non disponibile";
  const advancedScoresAvailable = false;

  async function geocode() {
    if (!query.trim()) return;
    setGeocodeState({ loading: true, error: null });
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "it");
      url.searchParams.set("q", `${query}, Lombardia, Italia`);
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      const rows = await response.json();
      if (!response.ok || !rows?.[0]) throw new Error("GEOCODE_NOT_FOUND");
      onAreaChange({
        ...area,
        label: rows[0].display_name?.split(",").slice(0, 2).join(", ") || query,
        lat: Number(rows[0].lat),
        lng: Number(rows[0].lon),
      });
      setGeocodeState({ loading: false, error: null });
    } catch (error) {
      setGeocodeState({ loading: false, error: error.message || "GEOCODE_ERROR" });
    }
  }

  return (
    <section className="step-card">
      <div className="section-heading">
        <p className="eyebrow">Step 2</p>
        <h2>Zona e mappa GIS</h2>
      </div>

      <div className="search-row">
        <label className="field grow">
          <span>Comune o indirizzo</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && geocode()} />
        </label>
        <button className="secondary-action" type="button" onClick={geocode} disabled={geocodeState.loading}>
          Cerca
        </button>
      </div>
      {geocodeState.error && <p className="inline-error">{geocodeState.error}</p>}

      <div className="quick-row">
        {quickAreas.map((item) => (
          <button key={item.label} type="button" onClick={() => { setQuery(item.label); onAreaChange(item); }}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="split-fields">
        <label className="field">
          <span>Latitudine</span>
          <input type="number" value={area.lat} step="0.0001" onChange={(event) => onAreaChange({ ...area, lat: Number(event.target.value) })} />
        </label>
        <label className="field">
          <span>Longitudine</span>
          <input type="number" value={area.lng} step="0.0001" onChange={(event) => onAreaChange({ ...area, lng: Number(event.target.value) })} />
        </label>
      </div>

      <label className="field">
        <span>Raggio: {area.radiusKm} km</span>
        <input type="range" min="1" max="12" step="0.5" value={area.radiusKm} onChange={(event) => onAreaChange({ ...area, radiusKm: Number(event.target.value) })} />
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong style={{ color: "#22332e" }}>Layer</strong>
          <button className="secondary-action" type="button" onClick={onResetLayers} disabled={!onResetLayers}>
            Reset layer
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 750, color: "#53645e" }}>Opacità</span>
          {[
            { id: "low", label: "Bassa" },
            { id: "medium", label: "Media" },
            { id: "high", label: "Alta" },
          ].map((opt) => {
            const active = (opacityLevel || "medium") === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onOpacityChange?.(opt.id)}
                className="secondary-action"
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  border: active ? "1.5px solid #0f766e" : undefined,
                  background: active ? "#e8f5f2" : undefined,
                  color: active ? "#0f766e" : undefined,
                  fontWeight: active ? 850 : 750,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="layer-grid">
          {primaryLayers(availableLayers, serviceType).map((layer) => (
            <label
              key={layer.id}
              className="check-row"
              style={{
                justifyContent: "space-between",
                gap: 10,
                minWidth: 180,
                opacity: layer.id === "civici" && !civiciAvailable ? 0.55 : 1,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: layerDot(layer.id), border: "1px solid rgba(15,23,42,.18)" }} />
                <span>{layer.label}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.05 }}>
                  <span style={{ fontSize: 11, fontWeight: 850, color: (layer.id === "civici" && !civiciAvailable) ? "rgba(15,23,42,.45)" : (layers[layer.id] ? "#0f766e" : "rgba(15,23,42,.45)") }}>
                    {(layer.id === "civici" && !civiciAvailable) ? "OFF" : (layers[layer.id] ? "ON" : "OFF")}
                  </span>
                  {layer.id === "civici" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: civiciAvailable ? "rgba(22,101,52,.9)" : "rgba(148,163,184,.9)" }}>
                      {civiciLabel}
                    </span>
                  )}
                  {layer.id === "transport" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: transportAvailable ? "rgba(29,78,216,.9)" : "rgba(148,163,184,.9)" }}>
                      {transportLabel}
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={layer.id === "civici" && !civiciAvailable ? false : Boolean(layers[layer.id])}
                  disabled={layer.id === "civici" && !civiciAvailable}
                  onChange={() => {
                    if (layer.id === "civici" && !civiciAvailable) return;
                    onToggleLayer(layer.id);
                  }}
                />
              </span>
            </label>
          ))}
          {secondaryLayers(availableLayers, serviceType).map((layer) => (
            <label key={layer.id} className="check-row" style={{ justifyContent: "space-between", gap: 10, minWidth: 180, opacity: 0.9 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: layerDot(layer.id), border: "1px solid rgba(15,23,42,.18)" }} />
                <span>{layer.label}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 850, color: layers[layer.id] ? "#0f766e" : "rgba(15,23,42,.45)" }}>
                  {layers[layer.id] ? "ON" : "OFF"}
                </span>
                <input type="checkbox" checked={Boolean(layers[layer.id])} onChange={() => onToggleLayer(layer.id)} />
              </span>
            </label>
          ))}
          {!showTransport && (
            <label className="check-row" style={{ justifyContent: "space-between", gap: 10, minWidth: 180 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: layerDot("omi"), border: "1px solid rgba(15,23,42,.18)" }} />
                <span>OMI/AdminInfo</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 850, color: layers.omi ? "#0f766e" : "rgba(15,23,42,.45)" }}>
                  {layers.omi ? "ON" : "OFF"}
                </span>
                <input type="checkbox" checked={Boolean(layers.omi)} onChange={() => onToggleLayer("omi")} />
              </span>
            </label>
          )}
        </div>
      </div>
      {hasCiviciLayer && (
        <div className="inline-note" style={{ display: "grid", gap: 2 }}>
          <div>{civiciMessage}</div>
          {civiciAvailable && civiciCount > 0 && (
            <div>{civiciCount.toLocaleString("it-IT")} civici OSM nel raggio</div>
          )}
        </div>
      )}

      {showTransport && (
        <div
          style={{
            border: "1px solid rgba(37,99,235,.22)",
            borderRadius: 12,
            background: transportAvailable ? "rgba(239,246,255,.88)" : "rgba(248,250,252,.88)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: transportAvailable ? "#1d4ed8" : "#64748b", letterSpacing: 0 }}>
              {transportLabel}
            </span>
            {transportAvailable && (
              <span style={{ fontSize: 11, fontWeight: 800, color: "#334155" }}>
                {transportModesLabel}
              </span>
            )}
          </div>
          <div className="metrics-grid">
            <Metric label="Fermate / stazioni" value={transportState?.count} />
            <Metric label="Scuole / eventi" value={schoolEventCount} />
            <Metric label="Metro/tram/bus rilevati" value={transportRouteTypes.filter((type) => ["metro", "tram", "bus"].includes(type)).length} />
            <Metric label="Linee presenti" value={transportState?.routeCount} />
            <Metric label="Hotspot operativi" value={transportState?.hotspotCount} />
          </div>
        </div>
      )}

      <div className="metrics-grid">
        {showTransport ? (
          <>
            <Metric label="Punti operativi rilevati" value={operationalPointCount} loading={poiState.loading} />
            <Metric label="POI commerciali" value={commercialPoiCount} loading={poiState.loading} />
            <Metric label="Fermate / stazioni" value={transportState?.count} />
            <Metric label="Scuole / eventi" value={schoolEventCount} loading={poiState.loading} />
            <Metric label="Hotspot operativi" value={transportState?.hotspotCount} />
          </>
        ) : (
          <>
            <Metric label="Comuni" value={values.comuni_coinvolti} loading={analysisState.loading} />
            <Metric label="Famiglie" value={values.famiglie_stimate} loading={analysisState.loading} />
            <Metric label="Settori" value={sectorsState.sectors?.length} loading={sectorsState.loading} />
            <Metric label="POI" value={poiCount} loading={poiState.loading} />
            <Metric label="Zone OMI" value={omiState.data?.values?.omi_zone_count} loading={omiState.loading} />
            <Metric label="Selezionati" value={selectedSectors.length} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <strong style={{ color: "#22332e" }}>Zona attiva</strong>
        <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 8 }}>
          <ZoneField label="Nome zona" value={area.label} />
          <ZoneField label="Comune principale" value={extractComune(area.label)} />
          <ZoneField label="Volantini assegnati" value={totalAvailableFlyers > 0 ? totalAvailableFlyers.toLocaleString("it-IT") : "dato non disponibile"} />
          <ZoneField label="Raggio" value={area.radiusKm ? `${area.radiusKm} km` : "dato non disponibile"} />
          {showTransport ? (
            <>
              <ZoneField label="Punti operativi rilevati" value={operationalPointCount > 0 ? operationalPointCount.toLocaleString("it-IT") : "dato non disponibile"} />
              <ZoneField label="Fermate / stazioni" value={transportState?.count > 0 ? Number(transportState.count).toLocaleString("it-IT") : "dato non disponibile"} />
              <ZoneField label="Fonte TPL" value={transportAvailable ? transportLabel : "dato non disponibile"} />
              <ZoneField label="Linee presenti" value={transportState?.routeCount > 0 ? Number(transportState.routeCount).toLocaleString("it-IT") : "dato non disponibile"} />
            </>
          ) : (
            <>
              <ZoneField label="Famiglie stimate" value={values.famiglie_stimate != null ? Number(values.famiglie_stimate).toLocaleString("it-IT") : "dato non disponibile"} />
              <ZoneField label="Popolazione stimata" value={values.popolazione_stimata != null ? Number(values.popolazione_stimata).toLocaleString("it-IT") : "dato non disponibile"} />
              <ZoneField label="Copertura stimata" value={values.copertura_stimata != null ? `${Math.round(Number(values.copertura_stimata))}%` : "dato non disponibile"} />
              <ZoneField label="Numero comuni nel raggio" value={values.comuni_coinvolti != null ? Number(values.comuni_coinvolti).toLocaleString("it-IT") : "dato non disponibile"} />
            </>
          )}
        </div>
        <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 8 }}>
          <strong style={{ color: "#22332e" }}>Dettagli & telemetria GIS zona attiva</strong>
          <ZoneField label="Fonte dati" value={(analysisState.data?.sources && analysisState.data.sources.length) ? analysisState.data.sources.join(", ") : "dato non disponibile"} />
          <ZoneField label="Stato analisi" value={analysisState.loading ? "Analisi in corso" : analysisState.error ? `Errore: ${analysisState.error}` : analysisState.data ? "Completata" : "dato non disponibile"} />
          <ZoneField label="Ultimo aggiornamento" value={"dato non disponibile"} />
          <ZoneField label="Warning" value={(analysisState.data?.metadata?.warnings && analysisState.data.metadata.warnings.length) ? analysisState.data.metadata.warnings.join(" | ") : "dato non disponibile"} />
        </div>
        {showTransport ? (
          <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 8 }}>
            <strong style={{ color: "#22332e" }}>Score Operativo</strong>
            <ZoneField label="Intensita passaggio" value={operationalPointCount > 0 ? `${operationalPointCount.toLocaleString("it-IT")} punti` : "dato non disponibile"} />
            <ZoneField label="Anchor trasporto" value={transportState?.count > 0 ? `${Number(transportState.count).toLocaleString("it-IT")} fermate / stazioni` : "dato non disponibile"} />
            <ZoneField label="Transit Index" value={transportState?.routeCount > 0 ? `${Number(transportState.routeCount).toLocaleString("it-IT")} linee` : "dato non disponibile"} />
            <ZoneField label="Hotspot Strength" value={transportState?.hotspotCount > 0 ? `${Number(transportState.hotspotCount).toLocaleString("it-IT")} hotspot` : "dato non disponibile"} />
            <ZoneField label="Operational Confidence" value={operationalConfidence} />
          </div>
        ) : (
          <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 8 }}>
            <strong style={{ color: "#22332e" }}>Score Residenziale</strong>
            <ZoneField label="Family Index" value={residentialScores.familyIndex != null ? `${residentialScores.familyIndex}/100` : "dato non disponibile"} />
            <ZoneField label="Reach Score" value={residentialScores.reachScore != null ? `${residentialScores.reachScore}/100` : "dato non disponibile"} />
            <ZoneField label="ROI Score" value={residentialScores.roiScore != null ? `${residentialScores.roiScore}/100` : "dato non disponibile"} />
            <ZoneField label="Confidence Score" value={residentialScores.confidenceScore != null ? `${residentialScores.confidenceScore}/100` : "dato non disponibile"} />
          </div>
        )}
        {advancedScoresAvailable && (
          <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 8 }}>
            <strong style={{ color: "#22332e" }}>Score Avanzati</strong>
            <ZoneField label="Metriche avanzate" value="dato non disponibile" />
          </div>
        )}
        <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", padding: 12, display: "grid", gap: 10 }}>
          <strong style={{ color: "#22332e" }}>Riepilogo area</strong>
          <ZoneField label="Area analizzata totale" value={inRadiusCount > 0 ? `${inRadiusCount} comuni nel raggio` : "dato non disponibile"} />
          <ZoneField label="Comune / zona attiva" value={extractComune(area.label)} />
          <ZoneField label="Budget inserito" value={totalAvailableFlyers > 0 ? totalAvailableFlyers.toLocaleString("it-IT") : "dato non disponibile"} />
          <ZoneField label="Volantini consigliati totali" value={computed.sumRecommended > 0 ? computed.sumRecommended.toLocaleString("it-IT") : "dato non disponibile"} />
          <ZoneField label="Volantini mancanti" value={computed.missingFlyers > 0 ? computed.missingFlyers.toLocaleString("it-IT") : "0"} />
          <ZoneField label="Comuni nel raggio" value={inRadiusCount.toLocaleString("it-IT")} />
          <ZoneField label="Comuni coperti dal budget attuale" value={coveredCount.toLocaleString("it-IT")} />
          <ZoneField label="In raggio, non coperti" value={uncoveredInRadius.toLocaleString("it-IT")} />
          {outOfRadiusCount > 0 && <ZoneField label="Fuori raggio" value={outOfRadiusCount.toLocaleString("it-IT")} />}
          <div style={{ fontSize: 12, color: "#53645e", lineHeight: 1.35 }}>
            Il fabbisogno totale si riferisce a tutti i comuni nel raggio selezionato. Il budget inserito copre solo una parte dell’area.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong style={{ color: "#22332e" }}>Zone di distribuzione</strong>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onAllocationModeChange?.("auto")}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: (allocationMode || "auto") === "auto" ? "1.5px solid #0f766e" : undefined,
                background: (allocationMode || "auto") === "auto" ? "#e8f5f2" : undefined,
                color: (allocationMode || "auto") === "auto" ? "#0f766e" : undefined,
                fontWeight: (allocationMode || "auto") === "auto" ? 850 : 750,
              }}
            >
              Auto
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onAllocationModeChange?.("manual")}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: (allocationMode || "auto") === "manual" ? "1.5px solid #0f766e" : undefined,
                background: (allocationMode || "auto") === "manual" ? "#e8f5f2" : undefined,
                color: (allocationMode || "auto") === "manual" ? "#0f766e" : undefined,
                fontWeight: (allocationMode || "auto") === "manual" ? 850 : 750,
              }}
            >
              Manuale
            </button>
          </div>
        </div>

        {computed.items.length === 0 ? (
          <p className="inline-note">La lista comuni apparirà quando la funzione ISTAT risponde per questa zona.</p>
        ) : (
          <div style={{ border: "1px solid #d7ded9", borderRadius: 12, background: "#ffffff", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr .65fr .65fr .8fr .85fr .85fr .85fr .95fr", gap: 0, padding: "10px 12px", background: "#f1f5f3", borderBottom: "1px solid #d7ded9", fontSize: 12, fontWeight: 850, color: "#22332e" }}>
              <span>Comune</span>
              <span>Distanza</span>
              <span>% nel raggio</span>
              <span>Famiglie</span>
              <span>Popolazione</span>
              <span>Volantini necessari</span>
              <span>Volantini assegn.</span>
              <span>Stato copertura</span>
            </div>
            {computed.items.map((it, idx) => {
              const key = it.key;
              const name = it.name;
              const pct = it.inRadius ? `${Math.round(Number(it.pctInRadius || 0))}%` : "fuori raggio";
              const dist = it.distanceKm != null ? `${it.distanceKm.toFixed(1)} km` : "dato non disponibile";
              const fam = it.families;
              const pop = it.population;
              const needed = it.needed;
              const assignedRaw = assignedFlyersMap?.[key];
              const assigned = Number.isFinite(Number(assignedRaw)) ? Math.max(0, Math.round(Number(assignedRaw))) : 0;
  const statusInfo = getComuneCoverageStatus({ inRadius: it.inRadius, assigned, needed });
  const statusColor = statusInfo.state === "Copertura totale"
                ? "#166534"
    : statusInfo.state === "Copertura parziale"
                  ? "#b45309"
      : statusInfo.state === "In raggio, non coperto"
                    ? "#334155"
        : statusInfo.state === "Fuori raggio"
                      ? "#64748b"
                      : "#64748b";
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "1.2fr .65fr .65fr .8fr .85fr .85fr .85fr .95fr", gap: 0, padding: "10px 12px", borderBottom: idx === computed.items.length - 1 ? "none" : "1px solid rgba(215,222,217,.7)", fontSize: 12, color: "#22332e", alignItems: "center" }}>
                  <span style={{ fontWeight: 800 }}>{name}</span>
                  <span style={{ color: dist === "dato non disponibile" ? "#64748b" : "#53645e" }}>{dist}</span>
                  <span style={{ color: "#53645e" }}>{pct}</span>
                  <span style={{ color: fam == null ? "#64748b" : "#22332e" }}>{fam == null ? "dato non disponibile" : fam.toLocaleString("it-IT")}</span>
                  <span style={{ color: pop == null ? "#64748b" : "#22332e" }}>{pop == null ? "dato non disponibile" : pop.toLocaleString("it-IT")}</span>
                  <span style={{ color: needed == null ? "#64748b" : "#22332e" }}>{needed == null ? "dato non disponibile" : needed.toLocaleString("it-IT")}</span>
                  {allocationMode === "manual" ? (
                    <input
                      type="number"
                      min="0"
                      value={Number.isFinite(Number(assignedRaw)) ? Math.round(Number(assignedRaw)) : ""}
                      onChange={(event) => {
                        const next = { ...(manualComuneFlyers || {}) };
                        const v = event.target.value;
                        if (v === "") delete next[key];
                        else next[key] = Math.max(0, Math.round(Number(v)));
                        onManualComuneFlyersChange?.(next);
                      }}
                      style={{ width: "100%", border: "1px solid #cfd8d3", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}
                    />
                  ) : (
                    <span style={{ color: "#22332e", fontWeight: 800 }}>{assigned.toLocaleString("it-IT")}</span>
                  )}
                  <span style={{ color: statusColor, fontWeight: 850 }}>
                    {statusInfo.pct != null ? `${statusInfo.state} ${statusInfo.pct}%` : statusInfo.state}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {computed.items.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 850, color: "#22332e" }}>
                Volantini consigliati (somma comuni): {computed.sumRecommended.toLocaleString("it-IT")}
              </span>
              {kpiRecommended > 0 && (
                <span style={{ fontSize: 12, color: "#53645e" }}>
                  KPI: {kpiRecommended.toLocaleString("it-IT")}
                </span>
              )}
              {kpiDiff > 10 && (
                <span style={{ fontSize: 12, fontWeight: 850, color: "#b91c1c" }}>
                  Incoerenza dati &gt; 10 (bug)
                </span>
              )}
            </div>

            {computed.missingFlyers > 0 && (
              <div style={{ border: "1px solid rgba(234,179,8,.35)", background: "rgba(234,179,8,.12)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "#7c2d12", fontWeight: 850 }}>
                Copertura parziale: mancano {computed.missingFlyers.toLocaleString("it-IT")} volantini per copertura piena. Suggerito aumento a {computed.sumRecommended.toLocaleString("it-IT")}.
              </div>
            )}
            {computed.missingFlyers > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: "#22332e" }}>
                  Comuni coperti dal budget attuale: {computed.coveredNames.length.toLocaleString("it-IT")}
                </div>
                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.35 }}>
                  {computed.coveredNames.length ? computed.coveredNames.join(", ") : "dato non disponibile"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 850, color: "#22332e" }}>
                  In raggio ma non coperti dal budget attuale: {computed.uncoveredNames.length.toLocaleString("it-IT")}
                </div>
                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.35 }}>
                  {computed.uncoveredNames.length ? computed.uncoveredNames.join(", ") : "dato non disponibile"}
                </div>
              </div>
            )}

            {allocationMode === "manual" && (
              <>
                {manualOver > 0 && (
                  <div style={{ border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.10)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "#991b1b", fontWeight: 850 }}>
                    Errore: superato il totale disponibile di {manualOver.toLocaleString("it-IT")} volantini.
                  </div>
                )}
                {manualOver === 0 && manualResidual > 0 && (
                  <div style={{ border: "1px solid rgba(15,118,110,.25)", background: "rgba(15,118,110,.08)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "#0f766e", fontWeight: 850 }}>
                    Residuo: {manualResidual.toLocaleString("it-IT")} volantini non assegnati.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="zone-stack">
        <div className="zone-stack-head">
          <strong>Zone campagna</strong>
          <button className="secondary-action" type="button" onClick={onSaveZone}>Aggiungi zona</button>
        </div>
        {zones.length === 0 ? (
          <p className="inline-note">Aggiungi la zona corrente per costruire una campagna multi-zona.</p>
        ) : (
          zones.map((zone) => (
            <div key={zone.id} className="zone-row">
              <span>
                <b>{zone.label}</b>
                {zone.families ? `${Number(zone.families).toLocaleString("it-IT")} famiglie` : "dati territoriali n/d"}
              </span>
              <button type="button" onClick={() => onRemoveZone(zone.id)}>Rimuovi</button>
            </div>
          ))
        )}
      </div>

      {(analysisState.error || sectorsState.error || poiState.error || omiState.error) && (
        <p className="inline-note">
          Stato dati: {[analysisState.error, sectorsState.error, poiState.error, omiState.error].filter(Boolean).join(" | ")}
        </p>
      )}

      <button className="primary-action" type="button" onClick={onNext}>Conferma zone e calendario</button>
    </section>
  );
}

function Metric({ label, value, loading }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{loading ? "..." : value == null ? "n/d" : Number(value).toLocaleString("it-IT")}</strong>
    </div>
  );
}

function Breakdown({ rows }) {
  if (!rows.length) return <p className="inline-note">Il breakdown comuni apparirà quando la funzione ISTAT risponde per questa zona.</p>;
  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span>Comune</span>
        <span>Famiglie</span>
        <span>Copertura</span>
      </div>
      {rows.slice(0, 6).map((row) => (
        <div key={row.municipality_code || row.comune_name} className="breakdown-row">
          <span>{row.comune_name || "Comune"}</span>
          <span>{Number(row.households_total || 0).toLocaleString("it-IT")}</span>
          <span>{Math.round(Number(row.pct_copertura || 0))}%</span>
        </div>
      ))}
    </div>
  );
}

function ZoneField({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <span style={{ fontSize: 12, fontWeight: 750, color: "#53645e" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: "#22332e", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function extractComune(label) {
  if (!label) return "dato non disponibile";
  const parts = String(label).split(",").map((s) => s.trim()).filter(Boolean);
  return parts[0] || "dato non disponibile";
}

function comuneKey(row, index) {
  return row.municipality_code || row.comune_name || index;
}

function sumValues(map) {
  if (!map) return 0;
  return Object.values(map).reduce((sum, n) => sum + Math.max(0, Math.round(Number(n || 0))), 0);
}

function computeComuneAllocation({ rows, totalAvailableFlyers, center }) {
  const total = Math.max(0, Math.round(Number(totalAvailableFlyers || 0)));
  const items = [];
  let sumRecommended = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const key = comuneKey(row, i);
    const name = row.comune_name || "Comune";
    const pctInRadiusRaw = row.pct_in_radius ?? row.pctInRadius ?? row.pct_copertura;
    const pctInRadius = pctInRadiusRaw == null ? null : Math.max(0, Math.min(100, Number(pctInRadiusRaw || 0)));
    const inRadius = pctInRadius == null ? true : pctInRadius > 0;
    const families = row.households_total != null ? Number(row.households_total || 0) : null;
    const population = row.population_total != null ? Number(row.population_total || 0) : null;
    const needed = row.volantini_nel_raggio != null ? Math.max(0, Math.round(Number(row.volantini_nel_raggio || 0))) : null;
    const centroid = centroidFromGeometry(parseGeoJson(row.geometry_geojson));
    const distanceKm = centroid && center?.lat != null && center?.lng != null
      ? haversineKm(center.lat, center.lng, centroid.lat, centroid.lng)
      : null;
    const consideredNeeded = inRadius ? (needed || 0) : 0;
    sumRecommended += consideredNeeded;

    items.push({
      key,
      name,
      pctInRadius: pctInRadius == null ? 0 : pctInRadius,
      inRadius,
      families,
      population,
      needed,
      distanceKm,
    });
  }

  if (!items.length) {
    return { items: [], sumRecommended: 0, missingFlyers: 0, autoAssigned: {}, totalAssigned: 0, coveredNames: [], uncoveredNames: [] };
  }

  const inRadiusItems = items.filter((it) => it.inRadius);
  const sorted = [...inRadiusItems].sort((a, b) => {
    const da = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
    const db = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
    if (da !== db) return da - db;
    const pct = (b.pctInRadius || 0) - (a.pctInRadius || 0);
    if (pct !== 0) return pct;
    const fa = a.families == null ? -1 : a.families;
    const fb = b.families == null ? -1 : b.families;
    if (fa !== fb) return fb - fa;
    const na = a.needed == null ? -1 : a.needed;
    const nb = b.needed == null ? -1 : b.needed;
    return nb - na;
  });

  const assigned = Object.fromEntries(items.map((it) => [it.key, 0]));
  let remaining = total;
  for (const it of sorted) {
    if (remaining <= 0) break;
    const need = Math.max(0, Math.round(Number(it.needed || 0)));
    if (!need) continue;
    const give = Math.min(need, remaining);
    assigned[it.key] = give;
    remaining -= give;
  }

  const totalAssigned = total - remaining;
  const missingFlyers = Math.max(0, sumRecommended - total);
  const coveredNames = sorted.filter((it) => (assigned[it.key] || 0) > 0).map((it) => it.name);
  const uncoveredNames = sorted.filter((it) => (assigned[it.key] || 0) === 0).map((it) => it.name);

  return {
    items,
    sumRecommended,
    missingFlyers,
    autoAssigned: assigned,
    totalAssigned,
    coveredNames,
    uncoveredNames,
  };
}

function parseGeoJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function centroidFromGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  const collect = (coords, out) => {
    if (!Array.isArray(coords)) return;
    if (coords.length === 0) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      out.push({ lng: coords[0], lat: coords[1] });
      return;
    }
    for (const c of coords) collect(c, out);
  };
  const pts = [];
  collect(geometry.coordinates, pts);
  if (!pts.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of pts) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / pts.length, lng: lng / pts.length };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getComuneCoverageStatus({ inRadius, assigned, needed }) {
  if (!inRadius) return { state: "Fuori raggio", pct: null };
  const a = Math.max(0, Math.round(Number(assigned || 0)));
  const n = Math.max(0, Math.round(Number(needed || 0)));
  if (a === 0) return { state: "In raggio, non coperto", pct: null };
  if (n > 0 && a >= n) return { state: "Copertura totale", pct: 100 };
  if (n > 0 && a < n) return { state: "Copertura parziale", pct: Math.max(1, Math.min(99, Math.round((a / n) * 100))) };
  return { state: "dato non disponibile", pct: null };
}

function primaryLayers(availableLayers, serviceType) {
  if (serviceType === "h2h") {
    const ids = new Set(["radius", "poi", "transport"]);
    return (availableLayers || []).filter((layer) => ids.has(layer.id));
  }
  const ids = new Set(["radius", "comuni", "settori", "civici", "poi", "transport"]);
  return (availableLayers || []).filter((layer) => ids.has(layer.id));
}

function secondaryLayers(availableLayers, serviceType) {
  if (serviceType === "h2h") return [];
  const ids = new Set(["radius", "comuni", "settori", "civici", "poi", "transport"]);
  return (availableLayers || []).filter((layer) => !ids.has(layer.id));
}

function layerDot(id) {
  if (id === "radius") return "#e8571a";
  if (id === "comuni") return "#0f172a";
  if (id === "settori") return "#2563eb";
  if (id === "civici") return "#4b5568";
  if (id === "poi") return "#0f766e";
  if (id === "transport") return "#2563eb";
  if (id === "density") return "#22c55e";
  if (id === "omi") return "#f59e0b";
  return "#64748b";
}

const TRANSPORT_SOURCE_LABELS = {
  atm_milano: "ATM Milano",
  trenord_lombardia: "Trenord",
};

function getTransportLayerLabel(transportState, transportAvailable) {
  if (!transportAvailable) return "Dati TPL non disponibili";
  const sources = Array.isArray(transportState?.sources)
    ? transportState.sources.filter(Boolean)
    : [];
  const stopSources = Array.isArray(transportState?.stops)
    ? transportState.stops.map((stop) => stop.source).filter(Boolean)
    : [];
  const uniqueSources = Array.from(new Set([...sources, ...stopSources])).sort();
  if (uniqueSources.length > 1) return "TPL · fonti multiple";
  if (uniqueSources.length === 1) return `TPL · ${TRANSPORT_SOURCE_LABELS[uniqueSources[0]] || uniqueSources[0]}`;
  const label = transportState?.label;
  if (label && label !== "Dati TPL non disponibili") return label;
  const routeTypes = Array.isArray(transportState?.routeTypes) ? transportState.routeTypes : [];
  if (routeTypes.length === 1 && routeTypes[0] === "train") return "TPL · Trenord";
  if (routeTypes.some((type) => ["metro", "tram", "bus"].includes(type))) return "TPL · ATM Milano";
  return "TPL";
}

function countSchoolEventPois(pois) {
  const categories = new Set(["Scuola", "Universita", "Università", "Teatro", "Cinema", "Mercato", "Attrazione", "Biblioteca"]);
  return (pois || []).filter((poi) => categories.has(poi.category)).length;
}

function countCommercialPois(pois) {
  const categories = new Set(["Centro comm.", "Bar/Caffè", "Bar/Caffe", "Ristorante", "Mercato"]);
  return (pois || []).filter((poi) => categories.has(poi.category)).length;
}

function transportModeLabel(type) {
  if (type === "metro") return "metro";
  if (type === "tram") return "tram";
  if (type === "bus") return "bus";
  if (type === "train") return "treno";
  return "altro";
}

