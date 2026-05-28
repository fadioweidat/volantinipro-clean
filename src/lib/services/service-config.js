// Single source of truth for per-service GIS layer configuration.
// Import from here — no if(svcType) scattered in components or hooks.

export const SERVICE_LAYERS = {
  d2d: {
    label: 'Door to Door',
    layers: [
      { id: 'radius',   label: 'Raggio',        defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'comuni',   label: 'Comuni',         defaultOn: true,  available: true,  future: false, category: 'territory' },
      { id: 'settori',  label: 'Settori censuari', defaultOn: true,  available: true,  future: false, category: 'territory' },
      { id: 'civici',   label: 'Civici',         defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'density',  label: 'Densità fam.',   defaultOn: false, available: true,  future: false, category: 'overlay'   },
      { id: 'poi',      label: 'POI',            defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'tracking', label: 'Tracking GPS',   defaultOn: false, available: false, future: true,  category: 'live'      },
    ],
  },
  h2h: {
    label: 'Hand to Hand',
    layers: [
      { id: 'radius',   label: 'Raggio',        defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'poi',      label: 'POI',            defaultOn: true,  available: true,  future: false, category: 'points'    },
      { id: 'civici',   label: 'Civici',         defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'hotspot',  label: 'Hotspot H2H',   defaultOn: false, available: false, future: true,  category: 'overlay'   },
      { id: 'comuni',   label: 'Comuni',         defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'settori',  label: 'Settori',        defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'tracking', label: 'Tracking GPS',   defaultOn: false, available: false, future: true,  category: 'live'      },
    ],
  },
  b2b: {
    label: 'Business to Business',
    layers: [
      { id: 'radius',   label: 'Raggio',        defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'poi',      label: 'POI',            defaultOn: true,  available: true,  future: false, category: 'points'    },
      { id: 'civici',   label: 'Civici',         defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'cluster',  label: 'Cluster B2B',   defaultOn: false, available: false, future: true,  category: 'overlay'   },
      { id: 'comuni',   label: 'Comuni',         defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'settori',  label: 'Settori',        defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'tracking', label: 'Tracking GPS',   defaultOn: false, available: false, future: true,  category: 'live'      },
    ],
  },
};

// POI categories emphasized per service type (for icon sizing and prominence on map).
export const SERVICE_POI_FOCUS = {
  d2d: ['school', 'pharmacy', 'supermarket', 'post_office', 'park', 'church'],
  h2h: [
    'school', 'university', 'transit_station', 'subway_station', 'train_station',
    'shopping_mall', 'restaurant', 'bar', 'cafe', 'tourist_attraction',
  ],
  b2b: [
    'pharmacy', 'bar', 'cafe', 'store', 'clothing_store', 'supermarket',
    'hotel', 'office', 'local_government_office',
  ],
};

// Phase 2 overlay type definitions — structure only, no live data yet.
// Color scales follow CartoDB sequential palettes.
export const OVERLAY_TYPES = {
  density: {
    id: 'density',
    label: 'Densità famiglie',
    description: 'Copertura famiglie per km² nel raggio di distribuzione',
    services: ['d2d'],
    colorScale: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
  },
  hotspot: {
    id: 'hotspot',
    label: 'Hotspot H2H',
    description: 'Zone ad alta frequentazione pedonale',
    services: ['h2h'],
    colorScale: ['#f3e8ff', '#c084fc', '#a855f7', '#7c3aed', '#4c1d95'],
  },
  cluster: {
    id: 'cluster',
    label: 'Cluster B2B',
    description: 'Concentrazioni di attività commerciali target',
    services: ['b2b'],
    colorScale: ['#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#92400e'],
  },
  priority: {
    id: 'priority',
    label: 'Aree prioritarie',
    description: 'Zone ad alta intensità di distribuzione suggerite',
    services: ['d2d', 'h2h', 'b2b'],
    colorScale: ['#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'],
  },
};

export function getServiceLayers(svcType) {
  return SERVICE_LAYERS[svcType]?.layers ?? SERVICE_LAYERS.d2d.layers;
}

export function defaultLayersForService(svcType) {
  return Object.fromEntries(getServiceLayers(svcType).map(l => [l.id, l.defaultOn]));
}

export function getPoiFocusForService(svcType) {
  return SERVICE_POI_FOCUS[svcType] ?? SERVICE_POI_FOCUS.d2d;
}

export function getOverlayTypesForService(svcType) {
  return Object.values(OVERLAY_TYPES).filter(o => o.services.includes(svcType));
}

// Re-export POI tag config so service-config remains the single source of truth.
export { POI_TAGS, getPoiTagsForService } from './poi-api.js';
