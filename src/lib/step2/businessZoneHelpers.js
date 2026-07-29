import { C } from "../constants.js";

export const BUSINESS_CATEGORIES = {
  retail: {
    label: "Retail / Negozio",
    color: C.orange,
    aliases: ["negozio", "retail", "abbigliamento"]
  },
  food: {
    label: "Ristorazione / Food",
    color: C.blue,
    aliases: ["food", "ristorante", "bar", "pizzeria"]
  },
  servizi: {
    label: "Servizi alla persona",
    color: C.purple,
    aliases: ["servizi", "estetica", "parrucchiere"]
  },
  salute: {
    label: "Salute / Benessere",
    color: C.green,
    aliases: ["salute", "farmacia", "clinica"]
  },
  immobiliare: {
    label: "Immobiliare",
    color: C.teal,
    aliases: ["immobiliare", "agenzia"]
  },
  gdo: {
    label: "GDO / Supermercati",
    color: C.yellow,
    aliases: ["gdo", "supermercato"]
  },
  altro: {
    label: "Altro",
    color: C.white,
    aliases: []
  }
};

export function getTargetBizMeta(n) {
  const i = n.businessCategory || n.targetBusinessType || n.businessSector || "altro";
  return BUSINESS_CATEGORIES[i] || BUSINESS_CATEGORIES.altro;
}

export function bizCategoryChart(n, i) {
  const r = {};
  n.forEach(u => (u.topCats || "").split("  ").filter(Boolean).forEach((h, f) => {
    r[h] = (r[h] || 0) + Math.max(1, Math.round((u.bizTotal || 0) * (f === 0 ? .34 : f === 1 ? .24 : .16)));
  }));
  const l = Object.entries(r).map(([u, h]) => ({
    label: u,
    count: h,
    target: i.aliases.some(f => u.toLowerCase().includes(f.toLowerCase())) || u.toLowerCase().includes(i.label.toLowerCase().split(" ")[0])
  })).sort((u, h) => h.count - u.count);
  return l.length ? l : [{
    label: i.label,
    count: n.reduce((u, h) => u + (h.targetBiz || 0), 0),
    target: !0
  }];
}

export function businessZoneScore(n) {
  return Math.round(Math.min(100, (n.commDensB2B || 0) * .34 + (n.reachB2B || 0) * .22 + (n.roiB2B || 0) * .18 + (n.targetBiz || 0) / Math.max(1, n.bizTotal || 1) * 100 * .16 + Math.min(10, (n.clusters || 0) * 1.2)));
}

export function businessRows(n, i) {
  return [...n].sort((r, l) => businessZoneScore(l) - businessZoneScore(r)).map(r => ({
    id: r.id,
    name: r.strongZone || r.name,
    zoneName: r.name,
    score: businessZoneScore(r),
    activities: r.bizTotal || 0,
    target: r.targetBiz || 0,
    competitors: r.competitors || 0,
    density: r.commDensB2B || 0,
    clusters: r.clusters || 0,
    dominant: (r.topCats || i.label).split("  ")[0]
  }));
}

export function h2hHotspotStrength(n) {
  return Math.round(Math.min(100, (n.flowScore || 0) * .42 + (n.commDens || 0) * .2 + Math.min(22, (n.transitStops || 0) * .9) + Math.min(12, (n.strongPts || 0) * 1.2) + Math.min(8, (n.poi || 0) / 38)));
}

export function h2hHotspotRows(n) {
  return [...n].sort((i, r) => h2hHotspotStrength(r) - h2hHotspotStrength(i)).map(i => ({
    id: i.id,
    name: (i.hotspots || i.name).split("  ")[0],
    zoneName: i.name,
    strength: h2hHotspotStrength(i),
    poi: i.poi || 0,
    transit: (i.transitStops || 0) + (i.trainStations || 0),
    anchors: i.strongPts || 0,
    flow: i.flowScore || 0,
    density: i.commDens || 0,
    time: i.timeSlots || "Da validare",
    reason: i.flowScore >= 82 ? "Alta concentrazione di passaggio vicino ad anchor urbani." : i.transitStops >= 14 ? "Buona opportunita per flussi scuola-lavoro e trasporto." : "Zona utile per distribuzione manuale breve e mirata."
  }));
}

export const H2H_HOTSPOT_META = {
  transit: {
    label: "Transit / Stazioni",
    color: C.purple,
    icon: ""
  },
  school: {
    label: "Scuole / Eventi",
    color: C.orange,
    icon: ""
  },
  retail: {
    label: "Retail / Piazze",
    color: C.blue,
    icon: ""
  },
  flow: {
    label: "Flusso / Passaggio",
    color: C.teal,
    icon: ""
  }
};

// Strips combining diacritical marks (U+0300-U+036F) left behind by
// String.normalize("NFD"), e.g. turning "e" + combining-acute into "e".
const COMBINING_DIACRITICS_RE = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);

function normalizeH2HCategory(n) {
  return String(n || "").toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS_RE, "");
}

function countPoisByCategory(n, i) {
  return n.filter(r => i.some(l => normalizeH2HCategory(r.category).includes(l))).length;
}

function countTransportByType(n, i) {
  return (n?.stops || []).filter(r => {
    const l = [r.stopType, ...(r.routes || []).map(u => u.routeTypeLabel)].map(normalizeH2HCategory);
    return l.some(u => i.includes(u));
  }).length;
}

function categoryMatchesBusiness(n, i) {
  const r = normalizeH2HCategory(`${n?.category || ""} ${n?.name || ""}`),
    l = Array.isArray(i?.aliases) ? i.aliases.map(normalizeH2HCategory) : [];
  return l.length ? l.some(u => r.includes(u)) : true;
}

function buildH2HOperationalClusters(n, i, r) {
  const l = Array.isArray(n) ? n.filter(u => Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lng))) : [];
  if (!l.length) return [];
  const u = r <= 2 ? .0015 : r <= 5 ? .003 : .005,
    h = new Map();
  l.forEach(f => {
    const m = `${Math.round(Number(f.lat) / u)}_${Math.round(Number(f.lng) / u)}`;
    if (!h.has(m)) h.set(m, []);
    h.get(m).push(f);
  });
  const T = Array.from(h.values()).map((f, m) => {
    const y = f.reduce((A, B) => A + Number(B.lat), 0) / f.length,
      x = f.reduce((A, B) => A + Number(B.lng), 0) / f.length,
      w = f.reduce((A, B) => A + (Number(B.priority) || 0), 0),
      j = f.filter(A => (Number(A.priority) || 0) >= 8).length,
      z = countPoisByCategory(f, ["stazione", "metro"]),
      R = countPoisByCategory(f, ["universit", "scuola"]),
      D = countPoisByCategory(f, ["centro comm", "teatro", "cinema", "attrazione", "mercato", "biblioteca", "bar", "caffe", "caff", "ristorante"]),
      W = Math.round(Math.min(100, w * 3 + j * 10 + z * 8 + R * 6 + Math.min(18, D * 2))),
      A = [...f].sort((B, P) => (Number(P.priority) || 0) - (Number(B.priority) || 0))[0];
    return {
      id: `h2h_cluster_${m}`,
      name: A?.name || `Zona operativa ${m + 1}`,
      zoneName: A?.category || "Cluster POI",
      lat: y,
      lng: x,
      poi: f.length,
      transit: z,
      anchors: R,
      attractions: D,
      strength: W,
      flow: W,
      density: Math.min(100, Math.round(f.length * 8)),
      time: "Da validare",
      reason: `${f.length.toLocaleString("it-IT")} POI reali nel cluster`,
      items: f
    };
  }).sort((f, m) => m.strength - f.strength);
  return T.map((f, m) => ({
    ...f,
    rank: m + 1,
    name: `Zona ${m + 1}  ${f.name}`
  }));
}

export function getH2HMetrics(n, i, r) {
  const l = Array.isArray(n) ? n : [],
    u = Array.isArray(i?.stops) ? i.stops : [],
    h = buildH2HOperationalClusters(l, i, r),
    f = countPoisByCategory(l, ["stazione"]),
    m = countPoisByCategory(l, ["metro"]) + countTransportByType(i, ["metro"]),
    y = countTransportByType(i, ["train"]) + f,
    x = countPoisByCategory(l, ["universit"]),
    w = countPoisByCategory(l, ["centro comm", "teatro", "cinema", "attrazione", "mercato", "biblioteca", "bar", "caffe", "caff", "ristorante"]);
  return {
    poi: l.length,
    zones: h.length,
    hotspots: h.length,
    clusters: h,
    tplStops: u.length,
    stations: y,
    metro: m,
    universities: x,
    localAttractors: w,
    transitTotal: u.length + f + m,
    flowScore: h.length ? Math.round(h.reduce((z, R) => z + R.strength, 0) / h.length) : 0
  };
}

export function residentialStrength(n) {
  return Math.round(Math.min(100, (n.familyIdx || 0) * .34 + (n.reachD2D || 0) * .22 + (n.coverage || 0) * .2 + Math.min(16, (n.families || 0) / 1850) + Math.min(8, (n.mailboxes || 0) / 2400)));
}

export function residentialRows(n) {
  return [...n].sort((i, r) => residentialStrength(r) - residentialStrength(i)).map((i, r) => ({
    id: i.id,
    rank: r + 1,
    name: i.name,
    strength: residentialStrength(i),
    families: i.families || 0,
    population: i.pop || 0,
    coverage: i.coverage || 0,
    required: i.families || 0,
    recommended: `${(i.flyersMin || 0).toLocaleString("it-IT")}-${(i.flyersMax || 0).toLocaleString("it-IT")}`,
    contribution: n.reduce((l, u) => l + (u.families || 0), 0) > 0 ? Math.round((i.families || 0) / n.reduce((l, u) => l + (u.families || 0), 0) * 100) : 0,
    areaType: i.areaType
  }));
}

export function getComuneColor(n = "") {
  const p = ["#14b8a6", "#3b82f6", "#8b5cf6", "#06b6d4", "#22c55e", "#6366f1"],
    i = [...n].reduce((r, l) => r + l.charCodeAt(0), 0);
  return p[i % p.length];
}

// Kept for parity with the source scope (used by buildBusinessOperationalClusters,
// a dependency of getBusinessMetrics in addressIntent.js).
export function buildBusinessOperationalClusters(n, i, r) {
  const l = Array.isArray(n) ? n.filter(u => Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lng))) : [];
  if (!l.length) return [];
  const u = r <= 2 ? .0015 : r <= 5 ? .003 : .005,
    h = new Map();
  l.forEach(f => {
    const m = `${Math.round(Number(f.lat) / u)}_${Math.round(Number(f.lng) / u)}`;
    if (!h.has(m)) h.set(m, []);
    h.get(m).push(f);
  });
  return Array.from(h.values()).map((f, m) => {
    const y = f.reduce((A, B) => A + Number(B.lat), 0) / f.length,
      x = f.reduce((A, B) => A + Number(B.lng), 0) / f.length,
      w = f.reduce((A, B) => A + (Number(B.priority) || 0), 0),
      j = f.filter(A => categoryMatchesBusiness(A, i)).length,
      z = f.reduce((A, B) => {
        const P = B.category || "Altro";
        A[P] = (A[P] || 0) + 1;
        return A;
      }, {}),
      R = Object.entries(z).sort((A, B) => B[1] - A[1])[0]?.[0] || i?.label || "Business",
      D = Math.round(Math.min(100, w * 3 + j * 8 + f.length * 4)),
      W = [...f].sort((A, B) => (Number(B.priority) || 0) - (Number(A.priority) || 0))[0];
    return {
      id: `b2b_cluster_${m}`,
      name: `Zona ${m + 1}  ${W?.name || R}`,
      zoneName: R,
      lat: y,
      lng: x,
      activities: f.length,
      target: j,
      competitors: Math.max(0, f.length - j),
      density: Math.min(100, Math.round(f.length * 8)),
      clusters: 1,
      dominant: R,
      score: D,
      items: f
    };
  }).sort((f, m) => m.score - f.score);
}

export function getBusinessMetrics(n, i, r) {
  const l = Array.isArray(n) ? n : [],
    h = buildBusinessOperationalClusters(l, i, r),
    f = l.filter(m => categoryMatchesBusiness(m, i)).length,
    u = l.reduce((m, y) => {
      const x = y.category || "Altro";
      m[x] = (m[x] || 0) + 1;
      return m;
    }, {}),
    T = Object.entries(u).map(([m, y]) => ({
      label: m,
      count: y,
      target: categoryMatchesBusiness({
        category: m
      }, i)
    })).sort((m, y) => y.count - m.count);
  return {
    businesses: l.length,
    competitors: Math.max(0, l.length - f),
    commercialDensity: h.length ? Math.round(h.reduce((m, y) => m + y.density, 0) / h.length) : 0,
    clusters: h.length,
    targetBusinesses: f,
    categories: T,
    clusterRows: h,
    cdIdx: h.length ? Math.round(h.reduce((m, y) => m + y.score, 0) / h.length) : 0
  };
}
