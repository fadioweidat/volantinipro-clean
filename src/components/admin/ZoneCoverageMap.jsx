import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { CircleMarker, Marker, MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import { useEffect, useMemo, useState } from 'react';
import { filterValidGpsPoints } from '../../lib/gps/pointQuality.js';
import { geoJsonPolygonToLeafletPositions } from '../../lib/geo/geoJsonToLeaflet.js';
import { geoJsonContainsPoint } from '../../lib/geo/pointInPolygon.js';
import { resolveRoadNetwork } from '../../lib/geo/resolveRoadNetwork.js';
import { getMunicipalityCenterPoint, selectRoadsFromOrigin } from '../../lib/geo/originRadialSelection.js';
import { geocodeAddress } from '../../lib/geo/geocodeAddress.js';
import { splitWaysByOperator, MAX_ADMIN_OPERATORS } from '../../lib/geo/operatorSplit.js';
import { FitToZoneBounds } from '../map/FitToZoneBounds.jsx';

const ADMIN_AREA_COLOR = '#0f766e'; // teal — MAI lo stesso blu della traccia GPS reale
const ORIGIN_COLOR = '#111827';
// Palette fissa per AUTO-01..AUTO-04 (verde/viola/fucsia/azzurro, ticket
// "Legenda Automatico"), distinta da blu GPS (#2563eb) e arancione confine
// (#f97316) — "#0891b2" (azzurro/ciano) scelto invece di un blu puro
// proprio per non essere confuso con il GPS reale.
const OPERATOR_COLORS = ['#16a34a', '#7c3aed', '#db2777', '#0891b2'];

// Mappa read-only per AUTOMATICO ADMIN: mostra il confine reale della zona
// selezionata + la traccia GPS reale se esiste (MAI inventata: se `points` e'
// vuoto, semplicemente non si disegna nulla) + un riempimento proporzionale
// del confine come indicatore visivo della percentuale Admin + una traccia
// "Admin automatica" generata deterministicamente sulle VIE REALI del comune
// (OSM/Overpass, resolveRoadNetwork.js) a partire da un punto di origine
// (centro comune / indirizzo / click mappa) con espansione radiale
// progressiva (originRadialSelection.js) — MAI un percorso inventato.
// Nessun input di disegno: quello resta esclusivo di MANUALE ADMIN/
// CoverageAdjustmentPanel. L'origine selezionata qui NON viene persistita
// (V1, stato locale al componente — si azzera correttamente al cambio zona
// perche' il chiamante gia' rimonta questo componente con key={selectedZoneId}).
export function ZoneCoverageMap({
  boundaryGeometry,
  municipalityName = null,
  points = [],
  automaticPercent = null,
  effectivePercent = null,
  gpsOperatorCount = 0,
}) {
  const validPoints = useMemo(() => filterValidGpsPoints(points).valid, [points]);
  const path = useMemo(
    () => validPoints.map((p) => [Number(p.lat), Number(p.lng)]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
    [validPoints],
  );
  const boundaryPositions = boundaryGeometry ? geoJsonPolygonToLeafletPositions(boundaryGeometry) : [];

  const percent = Number.isFinite(Number(automaticPercent)) ? Math.min(100, Math.max(0, Number(automaticPercent))) : null;
  // Riempimento proporzionale: solo un indicatore visivo dell'ordine di
  // grandezza della percentuale Admin, mai un valore geometrico calcolato —
  // la percentuale reale resta quella numerica (mostrata sopra dal
  // chiamante/ZoneProgressPanel), qui e' solo resa leggibile sulla mappa.
  // P1 (UI refine): opacita' massima abbassata drasticamente (era fino a
  // .40, "schiacciava" la cartografia e le sotto-zone operatore sotto
  // un'unica massa teal) — resta un indicatore leggero di ordine di
  // grandezza, mai un riempimento dominante.
  const fillOpacity = percent != null ? 0.03 + (percent / 100) * 0.09 : 0;
  // P1: mostrare punto-per-punto la traccia GPS reale intasa la mappa con
  // decine/centinaia di pallini sovrapposti alla linea gia' presente (che da
  // sola comunica gia' il percorso). Nascosti di default, dietro un toggle
  // esplicito — stesso pattern gia' validato in CoverageAdjustmentPanel.jsx
  // ("Mostra ogni punto GPS dettagliato").
  const [showGpsPoints, setShowGpsPoints] = useState(false);

  // Fase 1: punto di partenza. Default "Centro comune".
  const [originMode, setOriginMode] = useState('center');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressState, setAddressState] = useState({ loading: false, point: null, error: null });
  const [mapPoint, setMapPoint] = useState(null);

  const centerPoint = useMemo(
    () => (boundaryGeometry ? getMunicipalityCenterPoint(boundaryGeometry) : null),
    [boundaryGeometry],
  );

  const originPoint = originMode === 'center' ? centerPoint
    : originMode === 'address' ? addressState.point
    : originMode === 'map' ? mapPoint
    : null;

  const mapViewCenter = centerPoint ? [centerPoint.lat, centerPoint.lng] : (path[path.length - 1] || [45.4642, 9.19]);

  async function handleGeocodeAddress() {
    const query = addressQuery.trim();
    if (!query) return;
    setAddressState({ loading: true, point: null, error: null });
    try {
      const result = await geocodeAddress(query);
      if (!result) {
        setAddressState({ loading: false, point: null, error: `Indirizzo non trovato: "${query}".` });
        return;
      }
      // Fase 3: il punto deve cadere dentro la ZONA selezionata (non solo
      // "dentro il comune per nome") — validazione contro il boundary reale.
      if (boundaryGeometry && !geoJsonContainsPoint(boundaryGeometry, result.lat, result.lng)) {
        setAddressState({ loading: false, point: null, error: 'Punto di partenza fuori dalla zona selezionata' });
        return;
      }
      setAddressState({ loading: false, point: result, error: null });
    } catch {
      setAddressState({ loading: false, point: null, error: 'Geocodifica non disponibile, riprova.' });
    }
  }

  const [mapClickError, setMapClickError] = useState(null);
  function handleMapClick(lat, lng) {
    if (boundaryGeometry && !geoJsonContainsPoint(boundaryGeometry, lat, lng)) {
      setMapPoint(null);
      setMapClickError('Punto di partenza fuori dalla zona selezionata');
      return;
    }
    setMapClickError(null);
    setMapPoint({ lat, lng });
  }

  // Fase 10: cache gia' dentro resolveRoadNetwork (in-memory + sessionStorage,
  // chiave = nome comune) — qui solo lo stato di caricamento/errore per
  // questo componente, non bloccante per il resto della pagina Admin. Questo
  // effect dipende SOLO da comune/boundary: cambiare percentuale o origine
  // NON rifa' la richiesta Overpass (Fase 12).
  const [roadState, setRoadState] = useState({ loading: false, network: null, error: null });
  useEffect(() => {
    if (!municipalityName || !boundaryGeometry) {
      setRoadState({ loading: false, network: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setRoadState({ loading: true, network: null, error: null });
    resolveRoadNetwork(municipalityName, boundaryGeometry).then((network) => {
      if (cancelled) return;
      setRoadState({ loading: false, network, error: network ? null : 'unavailable' });
    });
    return () => { cancelled = true; };
  }, [municipalityName, boundaryGeometry]);

  // Selezione radiale dall'origine: pura funzione locale sui `ways` gia'
  // cacheati — cambiare percent/originPoint ricalcola solo qui, nessuna
  // nuova rete (Fase 12: "quasi immediato").
  const roadSelection = useMemo(() => {
    if (!roadState.network || percent == null || !originPoint) return null;
    return selectRoadsFromOrigin(roadState.network, originPoint, percent, path);
  }, [roadState.network, percent, originPoint, path]);

  // P1: numero di operatori Admin simulati (AUTO-01..AUTO-04) tra cui
  // dividere le vie selezionate. Nessuna persistenza (Fase 10): parametro
  // derivabile, rigenerato deterministicamente ad ogni render dallo stesso
  // input (stessa zona + stessa percentuale + stesso numero operatori =>
  // stessa divisione, mai Math.random).
  const [operatorCount, setOperatorCount] = useState(1);
  const operatorBuckets = useMemo(() => {
    if (!roadSelection?.selectedWays.length) return [];
    return splitWaysByOperator(roadSelection.selectedWays, operatorCount, 'AUTO', originPoint);
  }, [roadSelection, operatorCount, originPoint]);

  const originError = originMode === 'address' ? addressState.error : originMode === 'map' ? mapClickError : null;

  if (!boundaryGeometry && path.length === 0) {
    return (
      <div style={emptyStyle}>Confine comune non ancora risolto per questa zona — mappa non disponibile.</div>
    );
  }

  return (
    <div>
      {/* P1 (UI refine): controlli origine + numero operatori compattati in
          un'unica riga (prima due blocchi impilati a piena larghezza, con
          etichette maiuscole ingombranti) — meno altezza sopra la mappa,
          piu' spazio reale per la mappa stessa (priorita' #1 del ticket). */}
      <div style={compactControlsRowStyle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={controlLabelStyle}>Partenza</span>
          <button type="button" onClick={() => setOriginMode('center')} style={originModeButtonStyle(originMode === 'center')}>Centro comune</button>
          <button type="button" onClick={() => setOriginMode('address')} style={originModeButtonStyle(originMode === 'address')}>Indirizzo</button>
          <button type="button" onClick={() => setOriginMode('map')} style={originModeButtonStyle(originMode === 'map')}>Click mappa</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={controlLabelStyle}>Operatori</span>
          {Array.from({ length: MAX_ADMIN_OPERATORS }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => setOperatorCount(n)} style={originModeButtonStyle(operatorCount === n)}>{n}</button>
          ))}
        </div>
      </div>
      {originMode === 'address' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeAddress(); }}
            placeholder="Es. Via Roma, Varese"
            style={addressInputStyle}
          />
          <button type="button" onClick={handleGeocodeAddress} disabled={addressState.loading || !addressQuery.trim()} style={originModeButtonStyle(false)}>
            {addressState.loading ? 'Ricerca...' : 'Trova'}
          </button>
        </div>
      )}
      {originMode === 'map' && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Clicca sulla mappa per impostare il punto di partenza.</p>
      )}
      {originError && <p style={{ margin: '0 0 8px', fontSize: 12, color: '#fca5a5' }}>{originError}</p>}

      {/* Mappa principale — priorita' #1 del ticket: min 520px, qui 580px, il
          vero focus visivo della sezione, non un riquadro secondario. */}
      <div style={{ height: 580, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)' }}>
        <MapContainer center={mapViewCenter} zoom={14} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {/* P0: il confine reale arriva async (resolveMunicipalityBoundary),
              piu' lento del caricamento dei punti GPS. Senza fitBounds
              esplicito che si ri-applica ad ogni cambio di boundaryGeometry,
              la mappa restava agganciata al fallback GPS del mount iniziale
              (Driver a 2800km) anche dopo che il confine era gia' arrivato —
              stesso fix gia' verificato per la mappa GPS REALE, riusato qui. */}
          {boundaryGeometry && <FitToZoneBounds geometry={boundaryGeometry} />}
          {originMode === 'map' && <OriginClickCapture onClick={handleMapClick} />}

          {boundaryPositions.length > 0 && (
            <Polygon
              positions={boundaryPositions}
              pathOptions={{
                color: '#f97316',
                weight: 2,
                dashArray: '6 4',
                fill: percent != null,
                fillColor: ADMIN_AREA_COLOR,
                fillOpacity,
              }}
              interactive={false}
            />
          )}

          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />
          )}
          {/* P1: punti GPS reali nascosti di default (rumore visivo, la linea
              sopra comunica gia' il percorso) — mostrati solo su richiesta. */}
          {showGpsPoints && path.map((p, i) => (
            <CircleMarker key={i} center={p} radius={2} pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.6 }} />
          ))}

          {/* P1: ogni operatore Admin automatico in un colore distinto
              (stile tratteggiato per TUTTI — "AUTOMATICO ADMIN: linea
              tratteggiata", solo il colore cambia per operatore). Nessun
              marker per ogni via (Fase 6: no migliaia di marker) — un solo
              marker START per operatore, campionato sulla prima via del
              bucket. */}
          {operatorBuckets.flatMap((bucket, bi) => bucket.ways.map((way) => (
            <Polyline
              key={`${bucket.operatorKey}-${way.id}`}
              positions={way.geometry}
              pathOptions={{ color: OPERATOR_COLORS[bi % OPERATOR_COLORS.length], weight: 3, opacity: 0.9, dashArray: '2 6' }}
              interactive={false}
            />
          )))}
          {operatorBuckets.map((bucket, bi) => (
            bucket.ways[0]?.geometry?.[0] && (
              <Marker
                key={`start-${bucket.operatorKey}`}
                position={bucket.ways[0].geometry[0]}
                icon={operatorDivIcon(bi + 1, OPERATOR_COLORS[bi % OPERATOR_COLORS.length])}
              />
            )
          ))}

          {originPoint && (
            <CircleMarker
              center={[originPoint.lat, originPoint.lng]}
              radius={7}
              pathOptions={{ color: ORIGIN_COLOR, fillColor: '#fbbf24', fillOpacity: 1, weight: 2 }}
            />
          )}
        </MapContainer>
      </div>
      {/* P1: legenda snellita — prima ripeteva "AUTO-0N — Admin automatico —
          NON GPS" per ogni operatore (fino a 4 righe identiche tranne il
          numero); ora un'unica dicitura NON-GPS condivisa, gli operatori
          restano solo "Operatore N" con lo swatch colore. */}
      <div style={legendStyle}>
        <span style={legendItemStyle}><i style={{ ...dotStyle, background: '#fbbf24', borderColor: ORIGIN_COLOR }} />Punto di partenza</span>
        <span style={legendItemStyle}><i style={{ ...swatchStyle, background: '#2563eb', borderColor: '#2563eb' }} />GPS reale{path.length === 0 ? ' (nessuna traccia)' : ''}</span>
        <span style={legendItemStyle}><i style={{ ...swatchStyle, borderColor: '#f97316', background: 'transparent' }} />Confine comune</span>
        {operatorBuckets.map((bucket, bi) => (
          <span key={bucket.operatorKey} style={legendItemStyle}>
            <i style={{ ...swatchStyle, background: 'transparent', borderColor: OPERATOR_COLORS[bi % OPERATOR_COLORS.length], borderStyle: 'dashed' }} />
            Operatore {bi + 1}
          </span>
        ))}
      </div>
      {operatorBuckets.length > 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,.45)', fontStyle: 'italic' }}>
          Copertura/tracce Admin automatiche — simulazione su vie reali, NON GPS.
        </p>
      )}
      {path.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
          <input type="checkbox" checked={showGpsPoints} onChange={(e) => setShowGpsPoints(e.target.checked)} />
          Mostra ogni punto GPS reale (dettaglio)
        </label>
      )}
      {roadState.loading && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Caricamento vie...</p>
      )}
      {!roadState.loading && roadState.error && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#fca5a5' }}>
          Traccia automatica non disponibile per questa zona — usa MANUALE ADMIN per disegnare direttamente le aree.
        </p>
      )}
      {!roadState.loading && roadState.network && roadSelection && percent != null && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
          Copertura stradale Admin: {roadSelection.coverageMetricPercent.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% della lunghezza vie idonee ({(roadSelection.selectedLengthM / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} km).
        </p>
      )}
      {operatorBuckets.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            Operatori GPS reali: {gpsOperatorCount} · Operatori Admin automatici: {operatorBuckets.length}
          </p>
          <div style={{ display: 'grid', gap: 4 }}>
            {operatorBuckets.map((bucket, bi) => {
              const pctOfSelected = roadSelection?.selectedLengthM ? (bucket.lengthM / roadSelection.selectedLengthM) * 100 : 0;
              return (
                <div key={bucket.operatorKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
                  <i style={{ width: 10, height: 10, borderRadius: 999, background: OPERATOR_COLORS[bi % OPERATOR_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                  <span>Operatore {bi + 1} ({bucket.operatorKey}): {(bucket.lengthM / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} km / {pctOfSelected.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% assegnato</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {effectivePercent != null && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
          Finale: {Number(effectivePercent).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%
        </p>
      )}
    </div>
  );
}

// Marker operatore: pin con sagoma "worker" + badge numerico, sostituisce il
// vecchio cerchio con solo testo "A1/A2/A3/A4" (ticket: "UI debole e poco
// professionale"). SVG inline (nessuna icona immagine esterna da gestire —
// stessa scelta gia' fatta per il vecchio marker, solo il disegno cambia),
// forma a goccia standard da mappa cosi' si distingue immediatamente dal
// pallino pieno del GPS reale (CircleMarker) e dal pallino origine.
function operatorDivIcon(number, color) {
  // P1 (UI refine): drop-shadow + bordo bianco piu' spesso per leggibilita'
  // a zoom medio su sfondo cartografico variabile (mai solo colore pieno su
  // sfondo chiaro/scuro imprevedibile) — stessa forma a goccia (mai
  // confondibile con l'origine, un cerchio pieno, o il GPS reale, una
  // linea/pallino blu), solo rifinita.
  const svg = `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow-${number}" x="-40%" y="-20%" width="180%" height="150%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#000" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g filter="url(#shadow-${number})">
        <path d="M16 1C7.716 1 1 7.716 1 16c0 10.5 15 22 15 22s15-11.5 15-22C31 7.716 24.284 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="16" cy="14.5" r="9.5" fill="#fff"/>
        <circle cx="16" cy="11.2" r="3" fill="${color}"/>
        <path d="M9.6 19.6c0-3.6 2.8-6 6.4-6s6.4 2.4 6.4 6" fill="${color}"/>
        <circle cx="24" cy="8" r="7.5" fill="${color}" stroke="#fff" stroke-width="2"/>
        <text x="24" y="11" font-size="10" font-weight="900" fill="#fff" text-anchor="middle" font-family="'DM Sans', Arial, sans-serif">${number}</text>
      </g>
    </svg>`;
  return L.divIcon({
    className: 'admin-operator-marker',
    html: svg,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });
}

function OriginClickCapture({ onClick }) {
  useMapEvents({
    click(event) {
      onClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function originModeButtonStyle(active) {
  return {
    border: active ? 'none' : '1px solid rgba(255,255,255,.14)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    background: active ? ADMIN_AREA_COLOR : 'rgba(255,255,255,.05)',
    color: '#fff',
  };
}

const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.16)', borderRadius: 10, color: 'rgba(255,255,255,.5)', fontSize: 13 };
// P1: riga unica compatta per "Partenza"/"Operatori" (prima due blocchi
// impilati a piena larghezza con etichette maiuscole ingombranti) — meno
// altezza sottratta alla mappa, che resta il focus visivo principale.
const compactControlsRowStyle = { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.07)' };
const controlLabelStyle = { fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,.42)', textTransform: 'uppercase', letterSpacing: '.06em' };
const addressInputStyle = { flex: '1 1 220px', minWidth: 180, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.04)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 13 };
const legendStyle = { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.6)' };
const legendItemStyle = { display: 'flex', alignItems: 'center', gap: 6 };
const swatchStyle = { width: 14, height: 10, border: '1px solid', borderRadius: 2, display: 'inline-block' };
const dotStyle = { width: 10, height: 10, border: '2px solid', borderRadius: 999, display: 'inline-block' };
