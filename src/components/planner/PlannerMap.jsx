import { Circle, CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";

const centerFallback = [45.4642, 9.19];

export function PlannerMap({
  area,
  serviceType,
  sectors,
  selectedSectors,
  onToggleSector,
  pois,
  civiciState,
  transportState,
  analysis,
  omi,
  layers,
  dataMode,
  opacityLevel,
}) {
  const center = [area.lat ?? centerFallback[0], area.lng ?? centerFallback[1]];
  const comuniFeatures = useMemo(() => makeComuniFeatures(analysis), [analysis]);
  const omiFeatures = useMemo(() => makeOmiFeatures(omi), [omi]);
  const opacityScale = opacityLevel === "low" ? 0.65 : opacityLevel === "high" ? 1.25 : 1;
  const accent = serviceType === "h2h" ? "#2563eb" : serviceType === "b2b" ? "#7c3aed" : "#e8571a";
  const civiciCount =
    Number(civiciState?.count || 0) ||
    Number(civiciState?.bboxCount || 0);
  const civiciAvailable =
    Boolean(civiciState?.available) || civiciCount > 0;
  const transportAvailable = Boolean(
    transportState?.available ||
    Number(transportState?.count || 0) > 0 ||
    (transportState?.stops || []).length > 0
  );
  const transportMapLabel = getTransportLayerLabel(transportState, transportAvailable);

  const metricScale = useMemo(() => makeMetricScale(comuniFeatures, dataMode), [comuniFeatures, dataMode]);
  const densityScale = useMemo(() => makeDensityScale(comuniFeatures), [comuniFeatures]);

  return (
    <MapContainer center={center} zoom={12} minZoom={8} scrollWheelZoom className="planner-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewport center={center} radiusKm={area.radiusKm} />

      {layers.radius && (
        <>
          <Circle
            center={center}
            radius={area.radiusKm * 1000}
            pathOptions={{
              color: "transparent",
              weight: 0,
              fillColor: "transparent",
              fillOpacity: 0,
            }}
          />
          <Circle
            center={center}
            radius={area.radiusKm * 1000}
            pathOptions={{
              color: accent,
              weight: 2,
              dashArray: "6 7",
              fillOpacity: 0,
              opacity: Math.min(0.9, 0.72 * opacityScale),
            }}
          />
        </>
      )}

      {layers.comuni && comuniFeatures.map((feature) => (
        <GeoJSON
          key={`comune-${feature.properties.key}`}
          data={feature}
          style={{
            color: "rgba(15,23,42,.38)",
            weight: 0.9,
            fillOpacity: Math.min(0.22, 0.12 * opacityScale),
            fillColor: metricScale(feature.properties.metricValue),
            opacity: Math.min(0.7, 0.55 * opacityScale),
          }}
        >
          <Popup>
            <strong>{feature.properties.name}</strong>
            <br />
            Famiglie: {formatNumber(feature.properties.households)}
            <br />
            Popolazione: {formatNumber(feature.properties.population)}
            <br />
            Volantini: {formatNumber(feature.properties.flyers)}
            <br />
            Copertura: {feature.properties.coverage}%
            <br />
            {feature.properties.metricAvailable ? null : <span>dato non disponibile</span>}
          </Popup>
        </GeoJSON>
      ))}

      {layers.density && comuniFeatures.map((feature) => (
        <GeoJSON
          key={`density-${feature.properties.key}`}
          data={feature}
          style={{
            color: "rgba(15,23,42,.28)",
            weight: 0.7,
            fillColor: densityScale(feature.properties.density),
            fillOpacity: Math.min(0.34, 0.22 * opacityScale),
          }}
        />
      ))}

      {layers.omi && omiFeatures.map((feature) => (
        <GeoJSON
          key={`omi-${feature.properties.key}`}
          data={feature}
          style={{
            color: "rgba(124,45,18,.42)",
            weight: 0.9,
            dashArray: "4 6",
            fillColor: "#f59e0b",
            fillOpacity: Math.min(0.1, 0.05 * opacityScale),
            opacity: Math.min(0.7, 0.45 * opacityScale),
          }}
        >
          <Popup>
            <strong>Zona OMI {feature.properties.zoneCode || ""}</strong>
            <br />
            {feature.properties.name || "Zona immobiliare"}
          </Popup>
        </GeoJSON>
      ))}

      {layers.settori && sectors?.map((sector) => (
        <GeoJSON
          key={sector.id ?? `${sector.municipalityCode}-${sector.numero}`}
          data={{ type: "Feature", geometry: sector.geometry, properties: sector }}
          eventHandlers={{ click: () => onToggleSector(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) }}
          style={{
            color: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? accent : "rgba(37,99,235,.55)",
            weight: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? 2 : 1,
            fillColor: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? accent : "#93c5fd",
            fillOpacity: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? Math.min(0.22, 0.14 * opacityScale) : Math.min(0.14, 0.08 * opacityScale),
            opacity: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? Math.min(0.9, 0.72 * opacityScale) : Math.min(0.6, 0.38 * opacityScale),
          }}
        >
          <Popup>
            <strong>{sector.name || `Settore ${sector.numero}`}</strong>
            <br />
            Comune ISTAT: {sector.municipalityCode || "n/d"}
          </Popup>
        </GeoJSON>
      ))}

      {layers.poi && pois.map((poi) => (
        <CircleMarker
          key={poi.id}
          center={[poi.lat, poi.lng]}
          radius={Math.max(3, Math.min(6, Math.round((poi.priority || 4) * 0.65)))}
          pathOptions={{
            color: poi.color || "rgba(15,23,42,.45)",
            weight: 1,
            fillColor: poi.color || accent,
            fillOpacity: Math.min(0.65, 0.48 * opacityScale),
            opacity: Math.min(0.75, 0.55 * opacityScale),
          }}
        >
          <Popup>
            <strong>{poi.name}</strong>
            <br />
            {poi.category}
            {poi.address ? <><br />{poi.address}</> : null}
          </Popup>
        </CircleMarker>
      ))}

      {serviceType === "h2h" && layers.transport && transportAvailable && (transportState.stops || []).map((stop) => {
        const style = transportStyle(stop.stopType);
        return (
          <CircleMarker
            key={stop.id}
            center={[stop.lat, stop.lng]}
            radius={style.radius}
            pathOptions={{
              color: style.stroke,
              weight: 1.4,
              fillColor: style.fill,
              fillOpacity: Math.min(0.82, 0.65 * opacityScale),
              opacity: Math.min(0.9, 0.72 * opacityScale),
            }}
          >
            <Popup>
              <strong>{stop.stopName}</strong>
              <br />
              {transportLabel(stop.stopType)}
              {stop.routes?.length ? <><br />Linee: {stop.routes.map((route) => route.shortName || route.longName || route.routeId).filter(Boolean).slice(0, 8).join(", ")}</> : null}
              <br />
              {transportMapLabel}
            </Popup>
          </CircleMarker>
        );
      })}

      {layers.civici && civiciAvailable && (civiciState.points || []).map((point) => (
        <CircleMarker
          key={point.id}
          center={[point.lat, point.lng]}
          radius={2.6}
          pathOptions={{
            color: "rgba(15,23,42,.55)",
            weight: 0.6,
            fillColor: "#4B5568",
            fillOpacity: Math.min(0.72, 0.56 * opacityScale),
            opacity: Math.min(0.8, 0.65 * opacityScale),
          }}
        >
          <Popup>
            <strong>{[point.via, point.numeroCivico].filter(Boolean).join(" ") || "Civico"}</strong>
            {point.comune ? <><br />{point.comune}</> : null}
            <br />
            OSM · copertura parziale
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function MapViewport({ center, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    const radiusDegrees = Math.max(0.025, radiusKm / 90);
    map.fitBounds(
      [
        [center[0] - radiusDegrees, center[1] - radiusDegrees],
        [center[0] + radiusDegrees, center[1] + radiusDegrees],
      ],
      { padding: [30, 30] },
    );
  }, [center[0], center[1], radiusKm, map]);
  return null;
}

function makeComuniFeatures(analysis) {
  return (analysis?.comuni_breakdown || [])
    .map((row, index) => {
      const geometry = parseGeoJson(row.geometry_geojson || row.geometry || row.geojson || row.geom);
      if (!geometry) return null;
      const area = Number(row.area_km2 || 0);
      const households = Number(row.households_total || row.famiglie_stimate || 0);
      const population = Number(row.population_total || row.popolazione_stimata || 0);
      const flyers = Number(row.volantini_nel_raggio || row.volantiniNelRaggio || 0);
      const coverage = Math.round(Number(row.pct_copertura || 0));
      const eta65 = firstFiniteNumber(
        row.age_65_plus_pct,
        row.eta65,
        row.eta_65_plus_pct,
        row.share_age_65_plus,
      );
      return {
        type: "Feature",
        geometry,
        properties: {
          key: row.municipality_code || row.comune_name || index,
          name: row.comune_name || "Comune",
          households,
          population,
          flyers,
          coverage,
          density: area > 0 ? Math.round(households / area) : 0,
          relevance: Math.round(households * (coverage / 100)),
          eta65,
          metricValue: null,
          metricAvailable: false,
        },
      };
    })
    .filter(Boolean);
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function makeOmiFeatures(omi) {
  return (omi?.zones || [])
    .map((zone, index) => {
      const geometry = parseGeoJson(zone.geometry_geojson || zone.geometry);
      if (!geometry) return null;
      return {
        type: "Feature",
        geometry,
        properties: {
          key: `${zone.municipality_code || ""}-${zone.zone_code || ""}-${index}`,
          name: zone.zone_name || zone.description,
          zoneCode: zone.zone_code || zone.codice_zona,
        },
      };
    })
    .filter(Boolean);
}

function parseGeoJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const first = JSON.parse(value);
    if (typeof first === "string") {
      const s = first.trim();
      if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}

function makeDensityScale(features) {
  const values = features.map((f) => f.properties.density).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const colors = ["#e7f8ed", "#b7e8c5", "#86d7a0", "#4fb87a", "#2a7a54"];
  return (value) => {
    if (!values.length || !value) return "#e5e7eb";
    const rank = values.findIndex((n) => value <= n);
    const ratio = rank < 0 ? 1 : rank / Math.max(values.length - 1, 1);
    return colors[Math.min(colors.length - 1, Math.floor(ratio * colors.length))];
  };
}

function makeMetricScale(features, dataMode) {
  const mode = dataMode || "famiglie";
  const palette = mode === "volantini"
    ? ["#eef2ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#4f46e5"]
    : mode === "popolazione"
      ? ["#f0fdf4", "#bbf7d0", "#86efac", "#4ade80", "#16a34a"]
      : mode === "densita"
        ? ["#ecfeff", "#a5f3fc", "#67e8f9", "#22d3ee", "#0891b2"]
        : mode === "peso" || mode === "rilevanza"
          ? ["#fff7ed", "#fed7aa", "#fdba74", "#fb923c", "#ea580c"]
          : ["#eff6ff", "#bfdbfe", "#93c5fd", "#60a5fa", "#2563eb"];

  const extract = (p) => {
    if (mode === "famiglie") return p.households;
    if (mode === "popolazione") return p.population;
    if (mode === "densita") return p.density;
    if (mode === "peso") return p.coverage;
    if (mode === "volantini") return p.flyers;
    if (mode === "rilevanza") return p.relevance;
    if (mode === "eta65") return p.eta65;
    return null;
  };

  const values = features
    .map((f) => extract(f.properties))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  for (const feature of features) {
    const value = extract(feature.properties);
    feature.properties.metricValue = Number.isFinite(value) ? value : null;
    feature.properties.metricAvailable = value != null && Number.isFinite(value);
  }

  return (value) => {
    if (!values.length || value == null || !Number.isFinite(value) || value <= 0) return "#f8fafc";
    const rank = values.findIndex((n) => value <= n);
    const ratio = rank < 0 ? 1 : rank / Math.max(values.length - 1, 1);
    return palette[Math.min(palette.length - 1, Math.floor(ratio * palette.length))];
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("it-IT");
}

function transportStyle(type) {
  if (type === "metro") return { fill: "#dc2626", stroke: "#7f1d1d", radius: 6.2 };
  if (type === "tram") return { fill: "#16a34a", stroke: "#14532d", radius: 5.2 };
  if (type === "bus") return { fill: "#2563eb", stroke: "#1e3a8a", radius: 4.4 };
  if (type === "train") return { fill: "#7c3aed", stroke: "#4c1d95", radius: 5.8 };
  return { fill: "#64748b", stroke: "#334155", radius: 4 };
}

function transportLabel(type) {
  if (type === "metro") return "Metro";
  if (type === "tram") return "Tram";
  if (type === "bus") return "Bus";
  if (type === "train") return "Treno";
  return "Fermata TPL";
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
