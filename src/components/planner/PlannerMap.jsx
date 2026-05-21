import { Circle, CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";

const centerFallback = [45.4642, 9.19];

export function PlannerMap({
  area,
  sectors,
  selectedSectors,
  onToggleSector,
  pois,
  analysis,
  omi,
  layers,
}) {
  const center = [area.lat ?? centerFallback[0], area.lng ?? centerFallback[1]];
  const comuniFeatures = useMemo(() => makeComuniFeatures(analysis), [analysis]);
  const omiFeatures = useMemo(() => makeOmiFeatures(omi), [omi]);
  const densityScale = useMemo(() => makeDensityScale(comuniFeatures), [comuniFeatures]);

  return (
    <MapContainer center={center} zoom={12} minZoom={8} scrollWheelZoom className="planner-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewport center={center} radiusKm={area.radiusKm} />

      {layers.radius && (
        <Circle
          center={center}
          radius={area.radiusKm * 1000}
          pathOptions={{ color: "#134e4a", weight: 2, fillColor: "#14b8a6", fillOpacity: 0.08 }}
        />
      )}

      {layers.comuni && comuniFeatures.map((feature) => (
        <GeoJSON
          key={`comune-${feature.properties.key}`}
          data={feature}
          style={{ color: "#4b5563", weight: 1.4, fillOpacity: 0.04, fillColor: "#ffffff" }}
        >
          <Popup>
            <strong>{feature.properties.name}</strong>
            <br />
            Famiglie: {formatNumber(feature.properties.households)}
            <br />
            Copertura: {feature.properties.coverage}%
          </Popup>
        </GeoJSON>
      ))}

      {layers.density && comuniFeatures.map((feature) => (
        <GeoJSON
          key={`density-${feature.properties.key}`}
          data={feature}
          style={{
            color: "#14532d",
            weight: 1,
            fillColor: densityScale(feature.properties.density),
            fillOpacity: 0.38,
          }}
        />
      ))}

      {layers.omi && omiFeatures.map((feature) => (
        <GeoJSON
          key={`omi-${feature.properties.key}`}
          data={feature}
          style={{ color: "#7c2d12", weight: 1.2, dashArray: "4 4", fillColor: "#f97316", fillOpacity: 0.09 }}
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
            color: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? "#0f766e" : "#2563eb",
            weight: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? 3 : 1.5,
            fillColor: "#60a5fa",
            fillOpacity: selectedSectors.includes(sector.id ?? `${sector.municipalityCode}-${sector.numero}`) ? 0.28 : 0.13,
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
          radius={Math.max(4, Math.min(9, poi.priority))}
          pathOptions={{ color: poi.color || "#0f766e", weight: 2, fillColor: poi.color || "#0f766e", fillOpacity: 0.72 }}
        >
          <Popup>
            <strong>{poi.name}</strong>
            <br />
            {poi.category}
            {poi.address ? <><br />{poi.address}</> : null}
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
      const geometry = parseGeoJson(row.geometry_geojson);
      if (!geometry) return null;
      const area = Number(row.area_km2 || 0);
      const households = Number(row.households_total || row.famiglie_stimate || 0);
      return {
        type: "Feature",
        geometry,
        properties: {
          key: row.municipality_code || row.comune_name || index,
          name: row.comune_name || "Comune",
          households,
          coverage: Math.round(Number(row.pct_copertura || 0)),
          density: area > 0 ? Math.round(households / area) : 0,
        },
      };
    })
    .filter(Boolean);
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
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function makeDensityScale(features) {
  const values = features.map((f) => f.properties.density).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const colors = ["#d9f99d", "#bef264", "#86efac", "#22c55e", "#15803d"];
  return (value) => {
    if (!values.length || !value) return "#e5e7eb";
    const rank = values.findIndex((n) => value <= n);
    const ratio = rank < 0 ? 1 : rank / Math.max(values.length - 1, 1);
    return colors[Math.min(colors.length - 1, Math.floor(ratio * colors.length))];
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("it-IT");
}
