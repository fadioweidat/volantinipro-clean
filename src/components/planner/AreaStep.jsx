import { useState } from "react";

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
  sectorsState,
  poiState,
  analysisState,
  omiState,
  selectedSectors,
  zones,
  onSaveZone,
  onRemoveZone,
  onNext,
}) {
  const [query, setQuery] = useState(area.label);
  const [geocodeState, setGeocodeState] = useState({ loading: false, error: null });
  const values = analysisState.data?.values || {};

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

      <div className="layer-grid">
        {availableLayers.map((layer) => (
          <label key={layer.id} className="check-row">
            <input type="checkbox" checked={Boolean(layers[layer.id])} onChange={() => onToggleLayer(layer.id)} />
            <span>{layer.label}</span>
          </label>
        ))}
        <label className="check-row">
          <input type="checkbox" checked={Boolean(layers.omi)} onChange={() => onToggleLayer("omi")} />
          <span>OMI/AdminInfo</span>
        </label>
      </div>

      <div className="metrics-grid">
        <Metric label="Comuni" value={values.comuni_coinvolti} loading={analysisState.loading} />
        <Metric label="Famiglie" value={values.famiglie_stimate} loading={analysisState.loading} />
        <Metric label="Settori" value={sectorsState.sectors?.length} loading={sectorsState.loading} />
        <Metric label="POI" value={poiState.pois?.length} loading={poiState.loading} />
        <Metric label="Zone OMI" value={omiState.data?.values?.omi_zone_count} loading={omiState.loading} />
        <Metric label="Selezionati" value={selectedSectors.length} />
      </div>

      <Breakdown rows={analysisState.data?.comuni_breakdown || []} />

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
