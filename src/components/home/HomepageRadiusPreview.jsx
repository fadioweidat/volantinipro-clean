import React, { useMemo } from 'react';
import L from 'leaflet';
import { HERO_SCENARIO } from './homepageHeroData.js';

// A perspective view of the same returned boundaries. No tile requests, terrain
// model, additional analysis or substitute geometry is introduced here.
export default function HomepageRadiusPreview({ groups, selected, loading }) {
  const view = useMemo(() => {
    const center = L.CRS.EPSG3857.project(L.latLng(HERO_SCENARIO.lat, HERO_SCENARIO.lng));
    const bounds = L.latLng(HERO_SCENARIO.lat, HERO_SCENARIO.lng).toBounds(HERO_SCENARIO.radiusKm * 2000);
    const north = L.CRS.EPSG3857.project(bounds.getNorthEast());
    const radius = Math.abs(north.y - center.y);
    const scale = 105 / radius;
    const project = coordinate => {
      const p = L.CRS.EPSG3857.project(L.latLng(coordinate[1], coordinate[0]));
      return [240 + (p.x - center.x) * scale, 170 - (p.y - center.y) * scale];
    };
    const paths = groups.flatMap(group => group.features.map((feature, index) => {
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      const d = polygons.map(polygon => polygon.map(ring => ring.map((coordinate, i) => {
        const [x, y] = project(coordinate);
        return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ') + 'Z').join(' ')).join(' ');
      return { id: `${group.id}-${index}`, group: group.id, color: group.color, d };
    }));
    return { paths };
  }, [groups]);

  return <figure className="vph-radius-preview">
    <div className="vph-radius-perspective">
      <svg viewBox="0 0 480 340" role="img" aria-label={`Anteprima prospettica dei confini disponibili e del raggio di ${HERO_SCENARIO.radiusKm} km attorno a ${HERO_SCENARIO.name}`}>
        <g className="vph-preview-ground">
          {view.paths.map(path => <path key={path.id} d={path.d} fill={path.color} fillOpacity={selected && selected !== path.group ? .08 : .2} stroke={path.color} strokeWidth="1.4" fillRule="evenodd"/>)}
          <circle cx="240" cy="170" r="105" fill="#ff7520" fillOpacity=".09" stroke="#ff833c" strokeWidth="2" strokeDasharray="5 4"/>
          <circle cx="240" cy="170" r="5" fill="#fff" stroke="#ff7520" strokeWidth="4"/>
        </g>
      </svg>
      <span className="vph-preview-center">{HERO_SCENARIO.name} · {HERO_SCENARIO.radiusKm} km</span>
    </div>
    <figcaption><strong>Vista 3D del raggio di analisi</strong><span>{loading ? 'Caricamento dei confini…' : view.paths.length ? 'Anteprima prospettica · stessi confini e raggio' : 'Raggio dello scenario · confini non disponibili'}</span></figcaption>
  </figure>;
}
