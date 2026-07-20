// Single source of truth for per-service GIS layer configuration.
// Import from here — no if(svcType) scattered in components or hooks.

// Accent color per service — governs Step 2 chrome (active service chip,
// radius circle, radius slider, sidebar card kickers, primary CTAs).
// Values are the existing design tokens (brand orange / teal / green);
// confirmation-green stays reserved for validation states only.
export const SERVICE_ACCENTS = {
  d2d: '#E8571A',
  h2h: '#2DD4BF',
  b2b: '#2ECC8A',
};

export function getServiceAccent(svcType) {
  return SERVICE_ACCENTS[svcType] ?? SERVICE_ACCENTS.d2d;
}

export const SERVICE_LAYERS = {
  d2d: {
    label: 'Door to Door',
    layers: [
      { id: 'radius',   label: 'Raggio',          defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'comuni',   label: 'Comuni',           defaultOn: true,  available: true,  future: false, category: 'territory' },
      { id: 'settori',  label: 'Settori censuari', defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'civici',   label: 'Civici',           defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'density',  label: 'Densità fam.',     defaultOn: false, available: true,  future: false, category: 'overlay'   },
      { id: 'poi',      label: 'AttivitÃ  nel raggio', defaultOn: true, available: true, future: false, category: 'points'    },
      { id: 'tracking', label: 'Tracking GPS',     defaultOn: false, available: false, future: true,  category: 'live'      },
    ],
  },
  h2h: {
    label: 'Hand to Hand',
    layers: [
      { id: 'radius',   label: 'Raggio',        defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'comuni',   label: 'Comuni',         defaultOn: true,  available: true,  future: false, category: 'territory' },
      { id: 'poi',      label: 'Punti operativi', defaultOn: true, available: true,  future: false, category: 'points'    },
      { id: 'civici',   label: 'Civici',         defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'hotspot',  label: 'Hotspot H2H',   defaultOn: false, available: false, future: true,  category: 'overlay'   },
      { id: 'settori',  label: 'Settori',        defaultOn: false, available: true,  future: false, category: 'territory' },
      { id: 'tracking', label: 'Tracking GPS',   defaultOn: false, available: false, future: true,  category: 'live'      },
    ],
  },
  b2b: {
    label: 'Business to Business',
    layers: [
      { id: 'radius',   label: 'Raggio',        defaultOn: true,  available: true,  future: false, category: 'base'      },
      { id: 'comuni',   label: 'Comuni',         defaultOn: true,  available: true,  future: false, category: 'territory' },
      { id: 'poi',      label: 'AttivitÃ  target', defaultOn: true, available: true, future: false, category: 'points'    },
      { id: 'civici',   label: 'Civici',         defaultOn: false, available: true,  future: false, category: 'points'    },
      { id: 'cluster',  label: 'Cluster B2B',   defaultOn: false, available: false, future: true,  category: 'overlay'   },
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

export const DELIVERABLE_CATEGORIES = [
  "Distribuzione",
  "AI & Targeting",
  "Mappa & Geomarketing",
  "Tracking & Proof",
  "Report & Dashboard"
];

export const DELIVERABLE_SERVICE_CONFIG = [
  // 1. Distribuzione
  {
    id: "copertura_territoriale",
    title: "Copertura & Quantitativo Territoriale",
    category: "Distribuzione",
    tier: "INCLUSO",
    output: "campagna.quantita e campagna.comuni",
    getOutput: (c) => {
      if (!c?.quantita) return null;
      return {
        value: `${Number(c.quantita).toLocaleString("it-IT")} volantini`,
        sub: `Distribuzione pianificata su ${c.comuni_selezionati?.length || c.comuni?.length || 1} comuni target`
      };
    },
    plot: "kpi",
    fonte: "ISTAT 2024 · PostGIS"
  },
  {
    id: "densita_famiglie",
    title: "Densità Abitativa & Famiglie",
    category: "Distribuzione",
    tier: "INCLUSO",
    output: "campagna.totale_famiglie o stima comunale",
    getOutput: (c) => {
      const fam = c?.totale_famiglie || c?.famiglie;
      if (!fam) return null;
      return {
        value: `${Number(fam).toLocaleString("it-IT")} fam.`,
        sub: `Concentrazione residenziale nell'area di ${c.comune_principale || c.zona || "riferimento"}`
      };
    },
    plot: "kpi",
    fonte: "ISTAT 2024"
  },

  // 2. AI & Targeting
  {
    id: "ai_optimizer",
    title: "AI Optimizer & Score Campagna",
    category: "AI & Targeting",
    tier: "AI",
    output: "campagna.ai_score o servizi_extra.ai_analysis",
    getOutput: (c) => {
      const active = c?.servizi_extra?.includes("ai_analysis") || c?.pricing?.extras?.some(x => x.id === "ai_analysis") || c?.smart_pairing_sconto;
      if (!active && !c?.ai_score) return null;
      if (!c?.ai_score) return null;
      return {
        value: `${c.ai_score}/100`,
        sub: c?.ai_raccomandazione || "Dato AI disponibile per questa campagna."
      };
    },
    plot: "kpi",
    fonte: "Analisi interna AI"
  },
  {
    id: "profilo_demografico",
    title: "Profilo Demografico (Fasce Età)",
    category: "AI & Targeting",
    tier: "PRO",
    output: "campagna.fasce_eta o ripartizione ISTAT",
    getOutput: (c) => {
      if (c?.fasce_eta && Array.isArray(c.fasce_eta)) return c.fasce_eta;
      return null;
    },
    plot: "bar",
    fonte: "ISTAT 2024"
  },
  {
    id: "analisi_omi",
    title: "Valore Immobiliare (Fasce OMI)",
    category: "AI & Targeting",
    tier: "PRO",
    output: "campagna.omi_data o fasce OMI comunali",
    getOutput: (c) => {
      if (c?.omi_data && Array.isArray(c.omi_data)) return c.omi_data;
      return null;
    },
    plot: "bar",
    fonte: "Agenzia Entrate – OMI"
  },

  // 3. Mappa & Geomarketing
  {
    id: "breakdown_comuni",
    title: "Breakdown Comuni & Volantini",
    category: "Mappa & Geomarketing",
    tier: "INCLUSO",
    output: "campagna.comuni_breakdown o comuni_selezionati",
    getOutput: (c) => {
      if (c?.comuni_breakdown && Array.isArray(c.comuni_breakdown) && c.comuni_breakdown.length > 0) return c.comuni_breakdown;
      const list = c?.comuni_selezionati || c?.comuni;
      if (list && Array.isArray(list) && list.length > 0) {
        const quota = c?.quantita ? Math.round(c.quantita / list.length) : null;
        const coverage = Number(c?.copertura_pct);
        return list.map(name => ({
          name,
          coverage: Number.isFinite(coverage) ? `${coverage}%` : "Dato non disponibile",
          flyers: quota
        }));
      }
      return null;
    },
    plot: "lista",
    fonte: "PostGIS · ISTAT"
  },
  {
    id: "composizione_copertura",
    title: "Composizione Copertura Raggiunta",
    category: "Mappa & Geomarketing",
    tier: "PRO",
    output: "campagna.copertura_pct",
    getOutput: (c) => {
      const pct = Number(c?.copertura_pct || c?.copertura_raggiunta_pct);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      return [
        { label: "Coperta", value: pct, color: "#2ecc8a" },
        { label: "Dispersa / Esterna", value: Math.max(0, 100 - pct), color: "rgba(255,255,255,.12)" }
      ];
    },
    plot: "donut",
    fonte: "PostGIS"
  },
  {
    id: "mappa_raggio",
    title: "Mappa Geometria Raggio",
    category: "Mappa & Geomarketing",
    tier: "INCLUSO",
    output: "campagna.lat, lng, radius",
    getOutput: (c) => {
      const lat = Number(c?.lat || c?.centerLat);
      const lng = Number(c?.lng || c?.centerLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const rad = Number(c?.radius || c?.raggio || 3);
      return { lat, lng, radius: rad, label: c?.zona || c?.comune_principale || "Zona operativa" };
    },
    plot: "mappa",
    fonte: "PostGIS · OpenStreetMap"
  },

  // 4. Tracking & Proof
  {
    id: "tracking_gps",
    title: "Tracking GPS Live Consegna",
    category: "Tracking & Proof",
    tier: "PRO",
    output: "campagna.servizi_extra.tracking_gps",
    getOutput: (c) => {
      const active = c?.servizi_extra?.includes("tracking_gps") || c?.pricing?.extras?.some(x => x.id === "tracking_gps");
      if (!active && c?.stato !== "in_distribuzione" && c?.stato !== "completata") return null;
      return {
        text: "Ricevitore satellitare assegnato · Tracciamento percorso real-time su mappa",
        status: "Attivo sul campo"
      };
    },
    plot: "none",
    fonte: "Ricevitore GPS su campo"
  },
  {
    id: "photo_proof",
    title: "Certificazione Foto Proof",
    category: "Tracking & Proof",
    tier: "PRO",
    output: "campagna.servizi_extra.photo_proof",
    getOutput: (c) => {
      const active = c?.servizi_extra?.includes("photo_proof") || c?.pricing?.extras?.some(x => x.id === "photo_proof") || (c?.foto_proof && c.foto_proof.length > 0);
      if (!active) return null;
      return {
        text: "Scatti geolocalizzati con marca temporale e di zona a garanzia di recapito",
        status: c?.foto_proof?.length ? `${c.foto_proof.length} foto approvate` : "Foto proof non ancora disponibili"
      };
    },
    plot: "none",
    fonte: "App operatore sul campo"
  },

  // 5. Report & Dashboard
  {
    id: "advanced_report",
    title: "Report Avanzato Esecutivo",
    category: "Report & Dashboard",
    tier: "PRO",
    output: "campagna.servizi_extra.advanced_report",
    getOutput: (c) => {
      const active = c?.servizi_extra?.includes("advanced_report") || c?.pricing?.extras?.some(x => x.id === "advanced_report");
      if (!active) return null;
      return {
        text: "Documento riepilogativo di fine campagna con metriche di penetrazione e audit",
        status: "Incluso nel piano"
      };
    },
    plot: "none",
    fonte: "Analisi interna"
  },
  {
    id: "dashboard_cliente",
    title: "Accesso Dashboard Dedicata",
    category: "Report & Dashboard",
    tier: "INCLUSO",
    output: "campagna.id per link dedicato",
    getOutput: (c) => {
      if (!c?.id) return null;
      return {
        text: "Portale riservato di monitoraggio costante dell'avanzamento distributivo",
        status: "Accesso sbloccato"
      };
    },
    plot: "none",
    fonte: "Analisi interna"
  }
];
