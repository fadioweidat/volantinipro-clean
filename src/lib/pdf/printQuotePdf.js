/* ─────────────────────────────────────────────────────────────────────────────
   VolantiniPro — Preventivo Premium Enterprise (rewrite)
   Stessa firma pubblica: printQuotePdf(rawData)
   NON modifica business logic / GIS / Supabase / calcoli / routing.
───────────────────────────────────────────────────────────────────────────── */

/* ── Formatters ── */
function fmtN(n, dec = 0) {
  if (n == null || n === "") return null;
  const num = Number(n);
  return isFinite(num) ? num.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : String(n);
}
function fmtC(n) {
  return `€&nbsp;${Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n) { return n != null ? `${fmtN(n)}%` : null; }
function slug(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* ── SVG Charts ── */

function donutSVG({ value, max = 100, color = "#E8571A", size = 88, label, sublabel }) {
  const r = 34, cx = 44, cy = 44;
  const circ = 2 * Math.PI * r;
  const pv = Math.min(100, Math.round((value / (max || 1)) * 100));
  const dash = (pv / 100) * circ;
  return `<svg width="${size}" height="${size}" viewBox="0 0 88 88" style="display:block">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E8E0D8" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ / 4}" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 3}" text-anchor="middle" dominant-baseline="middle"
      style="font-family:'DM Sans',sans-serif;font-size:15px;font-weight:800;fill:${color}">${pv}%</text>
    ${sublabel ? `<text x="${cx}" y="${cy + 13}" text-anchor="middle" style="font-family:'DM Sans',sans-serif;font-size:8px;fill:#9ca3af">${sublabel}</text>` : ""}
  </svg>${label ? `<div style="font-size:9px;color:#9ca3af;text-align:center;margin-top:5px;font-family:'DM Sans',sans-serif">${label}</div>` : ""}`;
}

function scoreSVG({ value, color = "#6366F1", size = 60, label }) {
  const r = 24, cx = 30, cy = 30;
  const circ = 2 * Math.PI * r;
  const pv = Math.min(value || 0, 100);
  const dash = (pv / 100) * circ;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
    <svg width="${size}" height="${size}" viewBox="0 0 60 60" style="display:block">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E8E0D8" stroke-width="7"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="7"
        stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${circ / 4}" stroke-linecap="round"/>
      <text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle"
        style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:800;fill:${color}">${pv}</text>
    </svg>
    ${label ? `<div style="font-size:8px;color:#9ca3af;text-align:center;max-width:60px;line-height:1.3;font-family:'DM Sans',sans-serif">${label}</div>` : ""}
  </div>`;
}

function timelineHSVG(steps) {
  const W = 580, H = 80, dotR = 10, lineY = 32, n = steps.length;
  const step = (W - 60) / (n - 1);
  const items = steps.map((s, i) => {
    const x = 30 + i * step;
    const active = s.active;
    const done = s.done;
    const fill = done ? "#22C55E" : active ? "#E8571A" : "#E8E0D8";
    const stroke = done ? "#16a34a" : active ? "#D0450B" : "#d1ccc6";
    const textFill = done || active ? "#fff" : "#9ca3af";
    const labelFill = active ? "#E8571A" : done ? "#16a34a" : "#6b7280";
    return `
      ${i < n - 1 ? `<line x1="${x + dotR}" y1="${lineY}" x2="${x + step - dotR}" y2="${lineY}" stroke="${done ? "#22C55E" : "#E8E0D8"}" stroke-width="2"/>` : ""}
      <circle cx="${x}" cy="${lineY}" r="${dotR}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${x}" y="${lineY + 1}" text-anchor="middle" dominant-baseline="middle"
        style="font-family:'DM Sans',sans-serif;font-size:8px;font-weight:800;fill:${textFill}">${done ? "✓" : i + 1}</text>
      <text x="${x}" y="${lineY + 20}" text-anchor="middle"
        style="font-family:'DM Sans',sans-serif;font-size:9px;font-weight:700;fill:${labelFill}">${s.label}</text>
      ${s.time ? `<text x="${x}" y="${lineY - 17}" text-anchor="middle"
        style="font-family:'DM Sans',sans-serif;font-size:8px;font-weight:700;fill:${active ? "#E8571A" : "#9ca3af"}">${s.time}</text>` : ""}`;
  }).join("");
  return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">${items}</svg>`;
}

function miniMapSVG(area) {
  const comuni = Math.max(1, area?.selectedMunicipalities?.length || 3);
  const dots = [];
  for (let i = 0; i < Math.min(comuni + 4, 14); i++) {
    const angle = (i / (comuni + 4)) * 2 * Math.PI;
    const radius = 18 + (i % 3) * 9;
    dots.push({ x: 80 + Math.cos(angle) * radius, y: 60 + Math.sin(angle) * radius });
  }
  return `<svg width="160" height="120" viewBox="0 0 160 120" style="display:block;border-radius:12px;overflow:hidden">
    <rect width="160" height="120" fill="#091424"/>
    <circle cx="80" cy="60" r="48" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
    <circle cx="80" cy="60" r="32" fill="rgba(232,87,26,.06)" stroke="rgba(232,87,26,.2)" stroke-width="1"/>
    <circle cx="80" cy="60" r="16" fill="rgba(232,87,26,.12)" stroke="rgba(232,87,26,.35)" stroke-width="1"/>
    ${dots.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="rgba(255,255,255,.25)"/>`).join("")}
    <circle cx="80" cy="60" r="5" fill="#E8571A"/>
    <line x1="80" y1="45" x2="80" y2="55" stroke="#E8571A" stroke-width="1.5"/>
    <line x1="80" y1="65" x2="80" y2="75" stroke="#E8571A" stroke-width="1.5"/>
    <line x1="65" y1="60" x2="75" y2="60" stroke="#E8571A" stroke-width="1.5"/>
    <line x1="85" y1="60" x2="95" y2="60" stroke="#E8571A" stroke-width="1.5"/>
    ${area?.mainArea ? `<text x="80" y="108" text-anchor="middle" style="font-family:'DM Sans',sans-serif;font-size:8px;fill:rgba(255,255,255,.45);font-weight:600">${(area.mainArea || "").slice(0,18)}</text>` : ""}
  </svg>`;
}

/* ── Service descriptors ── */
const SVC_INFO = {
  d2d: {
    icon: "📬", color: "#E8571A",
    title: "Door to Door",
    subtitle: "Distribuzione residenziale porta a porta",
    tagline: "Raggiungi ogni famiglia direttamente nella propria abitazione",
    objective: "Raggiungere direttamente le famiglie nell'area selezionata tramite distribuzione nelle cassette postali di condomini, ville e abitazioni private.",
    method: "Gli operatori seguono percorsi GIS ottimizzati, copertura casa per casa, con possibilità di GPS tracking e documentazione fotografica.",
    benefits: ["Alta penetrazione residenziale", "Misurabile con dati ISTAT", "Percorso GIS ottimizzato", "Documentabile con foto e GPS"],
    included: [
      { icon: "🗺️", label: "Pianificazione zona", desc: "Analisi GIS dell'area e ottimizzazione del percorso operativo." },
      { icon: "📊", label: "Dashboard campagna", desc: "Monitoraggio in tempo reale dello stato della distribuzione." },
      { icon: "📄", label: "Report PDF base", desc: "Documento riepilogativo con dati di copertura e statistiche." },
      { icon: "🤝", label: "Assistenza operativa", desc: "Supporto pre e post campagna da parte del team VolantiniPro." },
      { icon: "✅", label: "Controllo esecuzione", desc: "Verifica della corretta copertura dell'area selezionata." },
      { icon: "📡", label: "Stato in tempo reale", desc: "Aggiornamenti sullo stato della distribuzione durante le operazioni." },
    ],
  },
  h2h: {
    icon: "🤝", color: "#3B82F6",
    title: "Hand to Hand",
    subtitle: "Distribuzione a mano in punti ad alto passaggio",
    tagline: "Intercetta il pubblico nei momenti e nei luoghi di massima frequentazione",
    objective: "Raggiungere un pubblico ampio in zone ad alta frequentazione: centri commerciali, fermate, mercati, piazze e punti di aggregazione urbana.",
    method: "Distribuzione diretta a mano negli hotspot pedonali identificati dall'analisi AI, nelle fasce orarie di massimo afflusso.",
    benefits: ["Alta visibilità diretta", "Contatto umano con il cliente", "Hotspot identificati da AI", "Massima concentrazione nei picchi"],
    included: [
      { icon: "📍", label: "Pianificazione punti", desc: "Selezione e ottimizzazione degli hotspot ad alto passaggio." },
      { icon: "⏰", label: "Fasce orarie ottimali", desc: "Distribuzione nelle ore di massimo afflusso dell'area." },
      { icon: "📊", label: "Dashboard campagna", desc: "Monitoraggio presenze e copertura per hotspot." },
      { icon: "📄", label: "Report PDF base", desc: "Documento con statistiche di distribuzione per punto." },
      { icon: "🤝", label: "Assistenza operativa", desc: "Supporto pre e post campagna da parte del team." },
      { icon: "✅", label: "Controllo operatori", desc: "Verifica presenza e copertura nelle fasce orarie." },
    ],
  },
  b2b: {
    icon: "🏢", color: "#8B5CF6",
    title: "Business Distribution",
    subtitle: "Distribuzione B2B ad attività commerciali",
    tagline: "Parla direttamente con le attività commerciali dell'area",
    objective: "Raggiungere le attività commerciali e professionali nell'area selezionata: negozi, uffici, showroom, ristoranti e strutture ricettive.",
    method: "Consegna diretta a ogni attività target, catalogata per categoria merceologica, con verifica GPS di ogni punto visitato.",
    benefits: ["Targeting commerciale preciso", "Database attività certificato", "Verifica GPS per ogni punto", "Report per categoria"],
    included: [
      { icon: "🏪", label: "Targeting commerciale", desc: "Selezione attività per categoria, zona e profilo commerciale." },
      { icon: "📍", label: "Mapping attività", desc: "Database aggiornato delle attività nel raggio selezionato." },
      { icon: "📊", label: "Dashboard B2B", desc: "Monitoraggio consegne per attività e categoria." },
      { icon: "📄", label: "Report PDF base", desc: "Documento con elenco attività raggiunte e statistiche." },
      { icon: "🤝", label: "Assistenza operativa", desc: "Supporto pre e post campagna da parte del team." },
      { icon: "✅", label: "Verifica consegne", desc: "Conferma ricezione e copertura per zona commerciale." },
    ],
  },
};

/* ── Recommended extras ── */
const EXTRAS_CATALOG = [
  { id: "tracking_gps",    icon: "📍", label: "Tracking GPS",          price: 25, col: "#3B82F6", benefit: "Percorso operatori certificato in tempo reale", reason: "Certifica il percorso reale con waypoint GPS — documentazione operativa completa." },
  { id: "photo_proof",     icon: "📸", label: "Foto geolocalizzate",    price: 35, col: "#8B5CF6", benefit: "Prove fotografiche con GPS e timestamp", reason: "30+ fotografie con GPS e timestamp: prove documentali concrete per ogni punto." },
  { id: "advanced_report", icon: "📊", label: "Report Avanzato",        price: 19, col: "#6366F1", benefit: "22+ KPI con mappa e riepilogo per zona", reason: "Statistiche complete, mappa distribuzione e riepilogo zona per zona." },
  { id: "ai_analysis",     icon: "🤖", label: "AI Optimizer",           price: 49, col: "#14B8A6", benefit: "Analisi AI e Report Premium personalizzato", reason: "Ottimizzazione AI con raccomandazioni operative e Report AI Premium." },
  { id: "quality_control", icon: "🔍", label: "Supervisione qualità",   price: 25, col: "#F59E0B", benefit: "Verifica indipendente dell'esecuzione", reason: "Controllo aggiuntivo sulla corretta copertura — consigliato per campagne premium." },
];

/* ── AI narrative helpers ── */
function buildAiNarrative(d) {
  const out = d.outputs || {};
  const scores = d.scores || [];
  const fi = scores.find(s => String(s.label).toLowerCase().includes("family"))?.value;
  const roi = scores.find(s => String(s.label).toLowerCase().includes("roi") || String(s.label).toLowerCase().includes("efficienza"))?.value;
  const conf = scores.find(s => String(s.label).toLowerCase().includes("confidence") || String(s.label).toLowerCase().includes("affidab"))?.value;
  const area = (d.area || {}).mainArea || "l'area selezionata";
  const ins = Number(out.insertedFlyers || 0);
  const rec = Number(out.recommendedFlyers || 0);
  const sufficient = rec > 0 && ins >= rec;
  const lines = [];
  if (fi != null) {
    const q = fi >= 80 ? "eccellente" : fi >= 65 ? "buona" : "sufficiente";
    lines.push(`L'area di <strong>${area}</strong> presenta una qualità residenziale <strong>${q}</strong> (Family Index: ${fi}/100).`);
  } else {
    lines.push(`La campagna è configurata per l'area di <strong>${area}</strong>.`);
  }
  if (sufficient) {
    lines.push(`La quantità di ${fmtN(ins)} volantini è <strong>sufficiente</strong> per coprire l'area selezionata.`);
  } else if (rec > 0) {
    lines.push(`Per una copertura ottimale si consiglia di portare la quantità a <strong>${fmtN(rec)}</strong> volantini (+${fmtN(rec - ins)}).`);
  }
  if (d.planning?.smartPairingApplied) {
    lines.push(`<strong>Smart Pairing attivo</strong>: risparmio del ${d.planning.smartPairingDiscountPct}% grazie alla condivisione con una campagna compatibile.`);
  }
  if (roi != null && roi >= 75) lines.push(`Efficienza campagna <strong>alta</strong> (ROI Score: ${roi}/100) — ottimo rapporto qualità/investimento.`);
  if (conf != null) lines.push(`Affidabilità stima: ${conf}/100 — dati verificati da fonti ISTAT e GIS.`);
  return lines.slice(0, 4).join(" ");
}

function buildZoneInsights(d) {
  const scores = d.scores || [];
  const out = d.outputs || {};
  const area = (d.area || {}).mainArea || "l'area";
  const fi = scores.find(s => String(s.label).toLowerCase().includes("family"))?.value;
  const roi = scores.find(s => String(s.label).toLowerCase().includes("roi"))?.value;
  const reach = scores.find(s => String(s.label).toLowerCase().includes("reach"))?.value;
  const conf = scores.find(s => String(s.label).toLowerCase().includes("confidence"))?.value;
  const ins = Number(out.insertedFlyers || 0);
  const rec = Number(out.recommendedFlyers || 0);
  const strengths = [];
  const limitations = [];
  if (fi != null && fi >= 70) strengths.push(`Alta qualità residenziale (Family Index ${fi}/100): zona ad alta densità abitativa, ideale per distribuzione porta a porta.`);
  else if (fi != null && fi >= 55) strengths.push(`Qualità residenziale nella media (Family Index ${fi}/100) con buona penetrazione potenziale.`);
  if (reach != null && reach >= 70) strengths.push(`Potenziale di raggiungimento elevato (Reach Score ${reach}/100): l'area consente alta copertura efficace delle famiglie.`);
  if (roi != null && roi >= 70) strengths.push(`Ottimo rapporto investimento/risultato (ROI Score ${roi}/100): questa configurazione è tra le più efficienti per l'area.`);
  if (conf != null && conf >= 75) strengths.push(`Alta affidabilità dei dati (${conf}/100): stime basate su fonti ISTAT, GIS e analisi territoriale certificata.`);
  if (strengths.length === 0) strengths.push(`Zona configurata correttamente per la distribuzione prevista nell'area di ${area}.`);
  if (ins > 0 && rec > 0 && ins < rec) {
    limitations.push(`La quantità attuale (${fmtN(ins)}) è inferiore al consigliato (${fmtN(rec)}): si suggerisce di aumentare per ottimizzare la copertura.`);
  }
  if (fi != null && fi < 55) {
    limitations.push(`L'area presenta un Family Index inferiore alla media: valutare l'estensione a zone limitrofe per migliori risultati.`);
  }
  const suggestion = d.planning?.smartPairingApplied
    ? `Smart Pairing attivo: distribuire in date compatibili con la campagna ${d.planning.compatibleZone || "adiacente"} per massimizzare lo sconto (${d.planning.smartPairingDiscountPct}%).`
    : `Seleziona date specifiche nel configuratore per verificare la disponibilità di Smart Pairing e risparmiare fino al 25% sul costo base.`;
  return { strengths: strengths.slice(0, 3), limitations: limitations.slice(0, 2), suggestion };
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
export function printQuotePdf(rawData) {
  const d = rawData || {};
  const genDate = new Date(d.generatedAt || Date.now()).toLocaleDateString("it-IT");
  const quoteId = d.quoteId || `VP-${new Date(d.generatedAt || Date.now()).toISOString().slice(0, 10).replace(/-/g, "")}`;
  const isoDate = new Date(d.generatedAt || Date.now()).toISOString().slice(0, 10);
  const filename = `VolantiniPro-Preventivo-${slug(d.service)}-${slug((d.area || {}).mainArea)}-${isoDate}`;

  const campaign = d.campaign || {};
  const area = d.area || {};
  const out = d.outputs || {};
  const planning = d.planning || {};
  const pricing = d.pricing || {};
  const scores = d.scores || [];
  const extras = d.extras || [];
  const municipalities = d.municipalities || [];

  const ins = Number(out.insertedFlyers || 0);
  const rec = Number(out.recommendedFlyers || 0);
  const sufficient = rec > 0 && ins >= rec;
  const covPct = out.estimatedCoverage ?? (rec && ins ? Math.min(100, Math.round((ins / rec) * 100)) : null);

  const svcKey = (d.aiAnalysis?.serviceType || "d2d").replace("business-distribution", "b2b");
  const svc = SVC_INFO[svcKey] || SVC_INFO.d2d;

  const fi = scores.find(s => String(s.label).toLowerCase().includes("family"))?.value;
  const reach = scores.find(s => String(s.label).toLowerCase().includes("reach") || String(s.label).toLowerCase().includes("copertura"))?.value;
  const roi = scores.find(s => String(s.label).toLowerCase().includes("roi") || String(s.label).toLowerCase().includes("efficienza"))?.value;
  const conf = scores.find(s => String(s.label).toLowerCase().includes("confidence") || String(s.label).toLowerCase().includes("affidab"))?.value;

  const aiNarrative = buildAiNarrative(d);
  const zoneInsights = buildZoneInsights(d);

  const selectedIds = new Set(extras.map(e => e.id));
  const selectedExtras = extras.filter(e => e.status === "Selezionato" || e.status === "Incluso");
  const recommendedExtras = EXTRAS_CATALOG.filter(e => !selectedIds.has(e.id)).slice(0, 3);

  const SECTIONS = [
    { id: "s1", icon: "★", label: "Executive Summary" },
    { id: "s2", icon: "📍", label: "Analisi della zona" },
    { id: "s3", icon: "📬", label: "Servizio selezionato" },
    { id: "s4", icon: "✓", label: "Servizi inclusi" },
    { id: "s5", icon: "+", label: "Servizi aggiuntivi" },
    { id: "s6", icon: "▶", label: "Piano operativo" },
    { id: "s7", icon: "€", label: "Riepilogo economico" },
    { id: "s8", icon: "✉", label: "Contatti" },
  ];

  const timelineSteps = [
    { label: "Preparazione", time: "D-2", active: true,  done: false },
    { label: "Distribuzione", time: "D day", active: true,  done: false },
    { label: "Qualità", time: "D+0", active: false, done: false },
    { label: "Report", time: "D+1", active: false, done: false },
    { label: "Consegna", time: "D+2", active: false, done: false },
  ];

  const comuniCount = (area.selectedMunicipalities || []).length ||
    municipalities.filter(m => !String(m.status || "").toLowerCase().includes("non selezionato")).length || null;

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${filename}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;font-size:11.5px}
body{font-family:'DM Sans',Inter,system-ui,sans-serif;color:#1a1a1a;background:#F8F4EE;line-height:1.55}
a{color:inherit;text-decoration:none}

/* ── Print ── */
@media print{
  body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4 portrait;margin:8mm 10mm 12mm 10mm}
  .no-print{display:none!important}
  .print-break{page-break-before:always;break-before:page}
  .sidebar,.print-bar{display:none!important}
  .layout{display:block!important}
  .content{margin:0!important;max-width:100%!important;padding:0!important}
  .card{box-shadow:none!important;border:1px solid #e5e7eb!important;margin-bottom:12px!important}
  .cover{box-shadow:none!important}
  .page-content{padding:0!important;gap:14px!important}
  .kpi-grid{background:#eee!important}
}

/* ── Layout ── */
.layout{display:flex;min-height:100vh}
.sidebar{
  position:fixed;left:0;top:0;bottom:0;width:220px;
  background:#0B1020;border-right:1px solid rgba(255,255,255,.05);
  padding:28px 0;display:flex;flex-direction:column;z-index:200;overflow-y:auto
}
.sidebar-logo{padding:0 22px 22px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:18px}
.sidebar-brand{font-family:'DM Serif Display',Georgia,serif;font-size:19px;color:#F8FAFC;letter-spacing:-.3px}
.sidebar-quote{font-size:9px;color:rgba(255,255,255,.28);margin-top:4px;font-family:'DM Sans',sans-serif;letter-spacing:.04em}
.sidebar-nav a{
  display:flex;align-items:center;gap:10px;padding:9px 22px;
  font-size:10.5px;font-weight:500;color:rgba(255,255,255,.38);
  transition:all .15s;border-left:2.5px solid transparent;letter-spacing:.01em
}
.sidebar-nav a:hover,.sidebar-nav a.active{color:#F8FAFC;border-left-color:#E8571A;background:rgba(232,87,26,.07)}
.sidebar-icon{font-size:11px;width:16px;text-align:center;flex-shrink:0}
.content{margin-left:220px;flex:1;padding:32px 32px 100px}
.page-content{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:22px}

/* ── Cards ── */
.cover{background:#0B1020;border-radius:22px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.22)}
.card{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 2px 18px rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.04)}
.card-header{
  padding:18px 26px 16px;border-bottom:1px solid #F3EDE5;
  display:flex;align-items:center;gap:14px
}
.card-num{
  width:28px;height:28px;border-radius:50%;background:#0B1020;color:#fff;
  font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0
}
.card-title{font-family:'DM Serif Display',Georgia,serif;font-size:17px;color:#111827;letter-spacing:-.2px}
.card-sub{font-size:10px;color:#b5a898;margin-top:2px;font-family:'DM Sans',sans-serif}
.card-body{padding:24px 26px}

/* ── Cover ── */
.cover-top{
  background:linear-gradient(135deg,#0E1C34 0%,#0B1020 55%,#091424 100%);
  padding:28px 32px 22px;display:flex;justify-content:space-between;align-items:flex-start
}
.cover-brand{
  font-family:'DM Serif Display',Georgia,serif;font-size:24px;color:#F8FAFC;letter-spacing:-.4px
}
.cover-brand span{color:#E8571A}
.cover-badge{
  display:inline-flex;align-items:center;padding:5px 13px;
  background:rgba(232,87,26,.14);border:1px solid rgba(232,87,26,.3);border-radius:20px;
  font-size:9.5px;font-weight:700;color:#E8571A;letter-spacing:.04em;font-family:'DM Sans',sans-serif
}
.cover-meta{margin-top:8px;font-size:9.5px;color:rgba(255,255,255,.3);line-height:1.7;font-family:'DM Sans',sans-serif;text-align:right}
.cover-meta strong{color:rgba(255,255,255,.6)}

.cover-hero{
  padding:28px 32px 0;
  background:linear-gradient(180deg,#0E1C34 0%,#091424 100%);
  display:grid;grid-template-columns:1fr auto;gap:28px;align-items:start
}
.cover-svc-label{
  font-size:10px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;
  letter-spacing:.12em;margin-bottom:8px;font-family:'DM Sans',sans-serif
}
.cover-svc-name{
  font-family:'DM Serif Display',Georgia,serif;font-size:30px;color:#F8FAFC;
  letter-spacing:-.5px;line-height:1.1;display:flex;align-items:center;gap:12px
}
.cover-svc-sub{font-size:11px;color:rgba(255,255,255,.38);margin-top:6px;font-family:'DM Sans',sans-serif}
.cover-price-label{
  margin-top:24px;font-size:9.5px;font-weight:700;color:rgba(255,255,255,.3);
  text-transform:uppercase;letter-spacing:.12em;font-family:'DM Sans',sans-serif
}
.cover-price{
  font-family:'DM Serif Display',Georgia,serif;
  font-size:clamp(44px,5.5vw,68px);color:#E8571A;
  letter-spacing:-2.5px;line-height:1;margin:4px 0 6px
}
.cover-price-note{font-size:9.5px;color:rgba(255,255,255,.22);font-family:'DM Sans',sans-serif}

.cover-map-block{display:flex;flex-direction:column;align-items:flex-end;gap:8px;padding-bottom:28px}
.cover-map-label{font-size:9px;color:rgba(255,255,255,.3);text-align:right;font-family:'DM Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase}

/* ── KPI bar ── */
.kpi-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,.06);margin-top:0}
.kpi-cell{background:#0D1829;padding:18px 14px;text-align:center}
.kpi-val{font-family:'DM Sans',sans-serif;font-size:22px;font-weight:800;color:#F8FAFC;letter-spacing:-.5px;line-height:1.1}
.kpi-val.g{color:#22C55E}
.kpi-val.b{color:#60A5FA}
.kpi-val.o{color:#E8571A}
.kpi-lab{font-size:8.5px;color:rgba(255,255,255,.32);text-transform:uppercase;letter-spacing:.07em;margin-top:4px;font-family:'DM Sans',sans-serif}
.kpi-icon{font-size:13px;margin-bottom:4px}

/* ── AI banner ── */
.ai-banner{
  background:linear-gradient(135deg,rgba(232,87,26,.06) 0%,rgba(99,102,241,.04) 100%);
  border-top:1px solid rgba(255,255,255,.05);padding:20px 32px
}
.ai-tag{font-size:9px;font-weight:800;color:#E8571A;text-transform:uppercase;letter-spacing:.1em;
  display:flex;align-items:center;gap:7px;margin-bottom:8px;font-family:'DM Sans',sans-serif}
.ai-text{font-size:11.5px;color:rgba(255,255,255,.55);line-height:1.75;max-width:640px;font-family:'DM Sans',sans-serif}

/* ── KV grid ── */
.kv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.kv-2{grid-template-columns:repeat(2,1fr)}
.kv-4{grid-template-columns:repeat(4,1fr)}
.kv{background:#FAF7F3;border:1px solid #EDE5D8;border-radius:9px;padding:10px 13px}
.kv-l{font-size:8px;font-weight:700;color:#b5a898;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}
.kv-v{font-size:12px;font-weight:700;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kv-v.a{color:#E8571A}
.kv-v.g{color:#15803d}
.kv-v.b{color:#1d4ed8}

/* ── Section tag ── */
.stag{font-size:8.5px;font-weight:800;color:#b5a898;text-transform:uppercase;letter-spacing:.1em;
  margin-bottom:14px;display:flex;align-items:center;gap:10px;font-family:'DM Sans',sans-serif}
.stag::after{content:"";flex:1;height:1px;background:#EDE5D8}

/* ── Charts row ── */
.chart-row{display:flex;gap:24px;align-items:center;flex-wrap:wrap;
  padding:18px 20px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:13px}
.chart-col{display:flex;flex-direction:column;align-items:center;gap:4px}

/* ── Callouts ── */
.callout{background:#FFF8F3;border:1px solid #FFDCC8;border-left:3px solid #E8571A;
  border-radius:9px;padding:12px 16px;font-size:11px;color:#374151;line-height:1.65}
.callout.g{background:#f0fdf4;border-color:#bbf7d0;border-left-color:#22C55E}
.callout.b{background:#eff6ff;border-color:#bfdbfe;border-left-color:#3B82F6}
.callout.i{background:#f5f3ff;border-color:#ddd6fe;border-left-color:#8B5CF6}

/* ── Zone insights ── */
.insights-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}
.insight-card{padding:14px 15px;border-radius:11px;border:1px solid #EDE5D8}
.insight-card.str{background:#f0fdf4;border-color:#bbf7d0}
.insight-card.lim{background:#fff8f3;border-color:#ffdcc8}
.insight-card.sug{background:#f0f9ff;border-color:#bae6fd}
.insight-title{font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.insight-title.str{color:#15803d}
.insight-title.lim{color:#c2410c}
.insight-title.sug{color:#0369a1}
.insight-point{display:flex;gap:7px;margin-bottom:6px;align-items:flex-start;font-size:10.5px;color:#374151;line-height:1.5}

/* ── Data table ── */
.dt{width:100%;border-collapse:collapse;font-size:10.5px}
.dt thead th{padding:8px 12px;background:#FAF7F3;text-align:left;font-size:8.5px;
  font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;border-bottom:1.5px solid #EDE5D8}
.dt tbody td{padding:8px 12px;border-bottom:1px solid #FAF7F3;color:#374151}
.dt tbody tr:last-child td{border-bottom:none}
.dt tbody tr:hover td{background:#FAF7F3}
.badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:10px;
  font-size:8.5px;font-weight:700;letter-spacing:.02em;font-family:'DM Sans',sans-serif}
.bg{background:#dcfce7;color:#15803d}
.bo{background:#FFF3ED;color:#c2410c}
.bb{background:#eff6ff;color:#1d4ed8}
.bk{background:#f3f4f6;color:#6b7280}
.bp{background:#f5f3ff;color:#7c3aed}

/* ── OMI ── */
.omi-grid{display:flex;flex-wrap:wrap;gap:9px;margin-top:10px}
.omi-card{padding:9px 13px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px}
.omi-type{font-size:8px;font-weight:700;color:#0d9488;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.omi-val{font-size:12px;font-weight:800;color:#0f766e}

/* ── Service ── */
.svc-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.svc-icon{width:58px;height:58px;border-radius:16px;display:flex;align-items:center;justify-content:center;
  font-size:28px;background:linear-gradient(135deg,#FFF3ED 0%,#FFF8F5 100%);border:1px solid #FFDCC8;margin-bottom:14px}
.svc-obj{font-size:11.5px;color:#374151;line-height:1.72;margin-bottom:12px}
.svc-meth{font-size:10.5px;color:#6b7280;line-height:1.65;padding-top:12px;border-top:1px solid #EDE5D8}
.svc-tag{display:inline-block;padding:2px 10px;border-radius:10px;font-size:9px;font-weight:700;
  background:#FAF7F3;color:#9ca3af;border:1px solid #EDE5D8;margin-bottom:8px}
.benefit-strip{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #EDE5D8}
.benefit{display:flex;align-items:center;gap:7px;font-size:10.5px;color:#374151}
.benefit::before{content:"✓";font-weight:800;color:#22C55E;flex-shrink:0}

/* ── Included ── */
.inc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.inc{display:flex;gap:12px;padding:13px 15px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:10px;align-items:flex-start}
.inc-icon{font-size:20px;flex-shrink:0;line-height:1.2}
.inc-label{font-size:12px;font-weight:700;color:#111827;margin-bottom:2px;display:flex;align-items:center;gap:6px}
.inc-label::before{content:"✓";color:#22C55E;font-size:11px}
.inc-desc{font-size:9.5px;color:#6b7280;line-height:1.5}

/* ── Extras ── */
.extra-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.extra{padding:15px 17px;border-radius:13px;border:1px solid #EDE5D8;display:flex;flex-direction:column;gap:9px;background:#fff}
.extra.bought{border-color:#bbf7d0;background:#f0fdf4}
.extra.rec{border-color:#bfdbfe;background:#f0f9ff}
.extra-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.extra-name{font-size:12px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}
.extra-benefit{font-size:10px;color:#6b7280;line-height:1.5}
.extra-foot{display:flex;justify-content:space-between;align-items:center}
.extra-price{font-size:11px;font-weight:800;color:#374151}
.estat{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:8px;font-size:8.5px;font-weight:700}
.estat.bought{background:#dcfce7;color:#15803d}
.estat.rec{background:#dbeafe;color:#1d4ed8}

/* ── Timeline ── */
.tl-wrap{padding:16px 8px 8px;overflow-x:auto}
.tl-desc{margin-top:18px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.tl-step{display:flex;flex-direction:column;gap:4px;padding:10px 11px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:9px;align-items:center;text-align:center}
.tl-step.active{background:#FFF3ED;border-color:#FFDCC8}
.tl-step-name{font-size:9.5px;font-weight:700;color:#374151}
.tl-step.active .tl-step-name{color:#E8571A}
.tl-step-desc{font-size:8.5px;color:#9ca3af;line-height:1.4}

/* ── Pricing ── */
.pt{width:100%;border-collapse:collapse;font-size:11px}
.pt thead th{padding:10px 14px;background:#0B1020;color:#F8FAFC;font-size:9px;
  font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left}
.pt thead th:last-child{text-align:right}
.pt tbody td{padding:10px 14px;border-bottom:1px solid #FAF7F3;color:#374151}
.pt tbody td:last-child{font-weight:700;text-align:right}
.pt .disc td{color:#15803d}
.pt .xtra td{color:#6b7280}
.pt tbody tr:last-child td{border-bottom:none}
.total-block{
  display:flex;justify-content:space-between;align-items:center;
  background:linear-gradient(135deg,#0E1C34 0%,#0B1020 100%);
  border-radius:16px;padding:26px 30px;margin-top:18px
}
.total-l-lab{font-size:10px;font-weight:800;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
.total-l-note{font-size:9px;color:rgba(255,255,255,.2);margin-top:6px;line-height:1.5}
.total-amount{font-family:'DM Serif Display',Georgia,serif;font-size:clamp(40px,5.5vw,60px);color:#E8571A;letter-spacing:-2px;line-height:1}
.validity{padding:13px 16px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:10px;
  margin-top:15px;font-size:10.5px;color:#6b7280;line-height:1.65}
.validity strong{color:#1a1a1a}

/* ── Contacts ── */
.contacts-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.contact-l{font-size:8.5px;font-weight:700;color:#b5a898;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
.contact-v{font-size:13px;font-weight:700;color:#1a1a1a}
.qr-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  padding:22px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:14px;text-align:center}
.qr-ph{width:80px;height:80px;background:#E8E0D8;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px}
.qr-note{font-size:9.5px;color:#9ca3af;line-height:1.5;max-width:180px}
.accept-btn{
  width:100%;padding:15px;border-radius:12px;border:none;
  background:linear-gradient(135deg,#E8571A 0%,#C94413 100%);
  color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:800;
  cursor:pointer;margin-top:15px;letter-spacing:.01em;
  box-shadow:0 6px 20px rgba(232,87,26,.28)
}
.footer-note{font-size:9px;color:#b5a898;line-height:1.65;margin-top:18px;padding-top:15px;border-top:1px solid #EDE5D8}

/* ── Print bar ── */
.print-bar{
  position:fixed;bottom:0;left:220px;right:0;
  background:rgba(255,251,247,.96);backdrop-filter:blur(10px);
  border-top:1px solid #EDE5D8;padding:12px 30px;
  display:flex;justify-content:flex-end;gap:10px;z-index:100
}
.btn{padding:10px 22px;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;border:none;transition:all .15s}
.btn-p{background:linear-gradient(135deg,#E8571A 0%,#C94413 100%);color:#fff;box-shadow:0 4px 14px rgba(232,87,26,.25)}
.btn-s{background:#FAF7F3;color:#374151;border:1px solid #EDE5D8}
.btn-s:hover{background:#EDE5D8}
</style>
</head>
<body>
<div class="layout">

<!-- ═══ SIDEBAR ═══ -->
<div class="sidebar no-print">
  <div class="sidebar-logo">
    <div class="sidebar-brand">Volantini<span style="color:#E8571A">Pro</span></div>
    <div class="sidebar-quote">Preventivo ${quoteId}</div>
  </div>
  <nav class="sidebar-nav">
    ${SECTIONS.map(s => `<a href="#${s.id}" onclick="setActive(this)">
      <span class="sidebar-icon">${s.icon}</span>${s.label}
    </a>`).join("")}
  </nav>
  <div style="padding:22px;margin-top:auto;border-top:1px solid rgba(255,255,255,.06)">
    <div style="font-size:9px;color:rgba(255,255,255,.22);line-height:1.7;font-family:'DM Sans',sans-serif">
      Generato: ${genDate}<br>
      Validità: 30 giorni<br>
      Rif. ${quoteId}
    </div>
  </div>
</div>

<!-- ═══ CONTENT ═══ -->
<div class="content">
<div class="page-content">

<!-- ══════════════ S1 — EXECUTIVE SUMMARY ══════════════ -->
<div id="s1" class="cover">

  <!-- Header -->
  <div class="cover-top">
    <div>
      <div class="cover-brand">Volantini<span>Pro</span></div>
      <div style="font-size:9.5px;color:rgba(255,255,255,.25);margin-top:3px;font-family:'DM Sans',sans-serif;letter-spacing:.04em;text-transform:uppercase">Proposta commerciale premium</div>
    </div>
    <div style="text-align:right">
      <div class="cover-badge">✦ ${d.status || "Preventivo stimato"}</div>
      <div class="cover-meta" style="margin-top:9px">
        N° <strong>${quoteId}</strong><br>
        Emesso il <strong>${genDate}</strong><br>
        Valido 30 giorni
      </div>
    </div>
  </div>

  <!-- Hero: price + map -->
  <div class="cover-hero">
    <div style="padding-bottom:28px">
      <div class="cover-svc-label">${svc.icon} Servizio selezionato</div>
      <div class="cover-svc-name">${d.service || svc.title}</div>
      <div class="cover-svc-sub">${svc.subtitle} · ${svc.tagline}</div>
      <div class="cover-price-label">Totale stimato</div>
      <div class="cover-price">${fmtC(pricing.total || 0)}</div>
      <div class="cover-price-note">IVA esclusa · nessun pagamento anticipato · soggetto a conferma</div>
    </div>
    <div class="cover-map-block">
      <div class="cover-map-label">Area selezionata</div>
      ${miniMapSVG(area)}
      ${area.radiusKm ? `<div style="font-size:8.5px;color:rgba(255,255,255,.28);font-family:'DM Sans',sans-serif;margin-top:2px">Raggio: ${fmtN(area.radiusKm, 1)} km</div>` : ""}
    </div>
  </div>

  <!-- KPI bar -->
  <div class="kpi-bar">
    <div class="kpi-cell">
      <div class="kpi-icon">🏠</div>
      <div class="kpi-val g">${fmtN(out.estimatedFamilies) || "—"}</div>
      <div class="kpi-lab">Famiglie raggiungibili</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-icon">📊</div>
      <div class="kpi-val b">${fmtPct(covPct) || "—"}</div>
      <div class="kpi-lab">Copertura stimata</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-icon">📬</div>
      <div class="kpi-val o">${fmtN(out.recommendedFlyers) || fmtN(out.insertedFlyers) || "—"}</div>
      <div class="kpi-lab">Volantini consigliati</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-icon">📍</div>
      <div class="kpi-val">${comuniCount || "—"}</div>
      <div class="kpi-lab">Comuni coinvolti</div>
    </div>
  </div>

  <!-- AI summary -->
  ${aiNarrative ? `
  <div class="ai-banner">
    <div class="ai-tag"><span>🤖</span> Analisi AI · Riepilogo campagna</div>
    <div class="ai-text">${aiNarrative}</div>
  </div>` : ""}

</div>

<!-- ══════════════ S2 — ANALISI DELLA ZONA ══════════════ -->
<div id="s2" class="card print-break">
  <div class="card-header">
    <div class="card-num">2</div>
    <div>
      <div class="card-title">Analisi della zona</div>
      <div class="card-sub">Dati territoriali, demografici e di copertura</div>
    </div>
  </div>
  <div class="card-body">

    <!-- Zone KV grid -->
    <div class="kv-grid kv-4" style="margin-bottom:16px">
      ${area.mainArea ? `<div class="kv"><div class="kv-l">Zona principale</div><div class="kv-v">${area.mainArea}</div></div>` : ""}
      ${area.radiusKm ? `<div class="kv"><div class="kv-l">Raggio analisi</div><div class="kv-v">${fmtN(area.radiusKm, 1)} km</div></div>` : ""}
      ${area.coveredAreaKm2 ? `<div class="kv"><div class="kv-l">Superficie coperta</div><div class="kv-v">${fmtN(area.coveredAreaKm2, 1)} km²</div></div>` : ""}
      ${area.selectionMode ? `<div class="kv"><div class="kv-l">Modalità selezione</div><div class="kv-v">${area.selectionMode}</div></div>` : ""}
      ${out.estimatedFamilies ? `<div class="kv"><div class="kv-l">Famiglie stimate</div><div class="kv-v g">${fmtN(out.estimatedFamilies)}</div></div>` : ""}
      ${out.estimatedPopulation ? `<div class="kv"><div class="kv-l">Popolazione stimata</div><div class="kv-v">${fmtN(out.estimatedPopulation)}</div></div>` : ""}
      ${covPct != null ? `<div class="kv"><div class="kv-l">Copertura potenziale</div><div class="kv-v b">${fmtPct(covPct)}</div></div>` : ""}
      ${out.recommendedFlyers ? `<div class="kv"><div class="kv-l">Volantini consigliati</div><div class="kv-v a">${fmtN(out.recommendedFlyers)}</div></div>` : ""}
    </div>

    <!-- Charts -->
    ${(covPct != null || scores.length > 0) ? `
    <div class="chart-row" style="margin-bottom:18px">
      ${covPct != null ? `
      <div class="chart-col">
        ${donutSVG({ value: covPct, max: 100, color: covPct >= 70 ? "#22C55E" : covPct >= 50 ? "#F59E0B" : "#EF4444", size: 88, sublabel: "copertura" })}
      </div>` : ""}
      ${fi != null ? scoreSVG({ value: fi, color: fi >= 75 ? "#22C55E" : fi >= 55 ? "#F59E0B" : "#EF4444", size: 60, label: "Family Index" }) : ""}
      ${reach != null ? scoreSVG({ value: reach, color: "#3B82F6", size: 60, label: "Reach Score" }) : ""}
      ${roi != null ? scoreSVG({ value: roi, color: "#22C55E", size: 60, label: "ROI Score" }) : ""}
      ${conf != null ? scoreSVG({ value: conf, color: "#8B5CF6", size: 60, label: "Confidence" }) : ""}
    </div>` : ""}

    <!-- Quantity callout -->
    ${ins && rec ? `
    <div class="callout ${sufficient ? "g" : ""}" style="margin-bottom:18px">
      ${sufficient
        ? `✓ La quantità di <strong>${fmtN(ins)}</strong> volantini è <strong>sufficiente</strong> per coprire l'area (consigliati: ${fmtN(rec)}). Scorta operativa disponibile: <strong>${fmtN(ins - rec)}</strong>.`
        : `⚠ Mancano <strong>${fmtN(rec - ins)}</strong> volantini per la copertura stimata. Attuale: ${fmtN(ins)} — consigliata: <strong>${fmtN(rec)}</strong>.`}
    </div>` : ""}

    <!-- Zone AI insights -->
    <div class="stag">Perché questa zona — Analisi AI</div>
    <div class="insights-grid">
      <div class="insight-card str">
        <div class="insight-title str">✅ Punti di forza</div>
        ${zoneInsights.strengths.map(s => `<div class="insight-point"><span style="color:#15803d;flex-shrink:0">+</span><span>${s}</span></div>`).join("")}
      </div>
      <div class="insight-card lim">
        <div class="insight-title lim">${zoneInsights.limitations.length > 0 ? "⚠ Limitazioni" : "✓ Nessuna criticità"}</div>
        ${zoneInsights.limitations.length > 0
          ? zoneInsights.limitations.map(s => `<div class="insight-point"><span style="color:#c2410c;flex-shrink:0">!</span><span>${s}</span></div>`).join("")
          : `<div class="insight-point"><span style="color:#15803d;flex-shrink:0">✓</span><span>La configurazione attuale non presenta limitazioni rilevanti per l'area selezionata.</span></div>`}
      </div>
      <div class="insight-card sug">
        <div class="insight-title sug">💡 Suggerimento operativo</div>
        <div class="insight-point"><span style="color:#0369a1;flex-shrink:0">→</span><span>${zoneInsights.suggestion}</span></div>
      </div>
    </div>

    <!-- OMI -->
    ${d.omi?.values?.length ? `
    <div style="margin-top:18px">
      <div class="stag">Valori di mercato OMI · ${d.omi.source || "Agenzia delle Entrate"}</div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:4px">
        ${d.omi.municipality ? `<div class="kv" style="flex:0 0 auto"><div class="kv-l">Comune</div><div class="kv-v">${d.omi.municipality}</div></div>` : ""}
        ${d.omi.zone_name ? `<div class="kv" style="flex:0 0 auto"><div class="kv-l">Zona OMI</div><div class="kv-v" style="color:#0d9488">${d.omi.zone_name}</div></div>` : ""}
      </div>
      <div class="omi-grid">
        ${d.omi.values.slice(0, 4).map(v => `
        <div class="omi-card">
          <div class="omi-type">${v.type || "Valore"}</div>
          <div class="omi-val">${v.min && v.max ? `€${v.min}–${v.max}/mq` : v.value ? `€${v.value}/mq` : "—"}</div>
        </div>`).join("")}
      </div>
    </div>` : ""}

    <!-- Municipalities table -->
    ${municipalities.length ? `
    <div style="margin-top:20px">
      <div class="stag">Comuni nel raggio</div>
      <table class="dt">
        <thead><tr><th>Comune</th><th>Stato</th><th>Volantini</th><th>Copertura</th><th>Contributo</th></tr></thead>
        <tbody>
          ${municipalities.map(m => {
            const ns = String(m.status || "").toLowerCase().includes("non selezionato");
            const full = String(m.status || "").toLowerCase().includes("completa");
            const cls = ns ? "bk" : full ? "bg" : "bo";
            return `<tr>
              <td><strong>${m.name}</strong></td>
              <td><span class="badge ${cls}">${m.status}</span></td>
              <td>${!ns && m.estimatedFlyers != null ? fmtN(m.estimatedFlyers) : "—"}</td>
              <td>${!ns && m.coveragePct != null ? fmtPct(m.coveragePct) : "—"}</td>
              <td>${!ns && m.contributionPct != null ? fmtPct(m.contributionPct) : "—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>` : ""}

    <!-- Admin info -->
    ${(d.adminInfo || []).length ? `
    <div style="margin-top:18px">
      <div class="stag">Dati demografici ed economici</div>
      <div class="kv-grid">
        ${d.adminInfo.map(i => `<div class="kv"><div class="kv-l">${i.label}</div><div class="kv-v">${i.value}</div></div>`).join("")}
      </div>
    </div>` : ""}

  </div>
</div>

<!-- ══════════════ S3 — SERVIZIO SELEZIONATO ══════════════ -->
<div id="s3" class="card print-break">
  <div class="card-header">
    <div class="card-num">3</div>
    <div>
      <div class="card-title">Servizio selezionato</div>
      <div class="card-sub">${svc.tagline}</div>
    </div>
  </div>
  <div class="card-body">
    <div class="svc-grid">
      <div>
        <div class="svc-icon">${svc.icon}</div>
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:21px;color:#111827;letter-spacing:-.2px;margin-bottom:6px">${d.service || svc.title}</div>
        <span class="svc-tag">${campaign.variant || svc.subtitle}</span>
        <div class="svc-obj" style="margin-top:10px">${svc.objective}</div>
        <div class="svc-meth"><strong style="color:#1a1a1a">Metodo operativo:</strong><br>${svc.method}</div>
        <div class="benefit-strip">
          ${svc.benefits.map(b => `<div class="benefit">${b}</div>`).join("")}
        </div>
      </div>
      <div>
        <div class="stag">Dettagli configurazione</div>
        <div class="kv-grid kv-2" style="margin-bottom:14px">
          ${campaign.quantity ? `<div class="kv"><div class="kv-l">Quantità</div><div class="kv-v a">${fmtN(campaign.quantity)}</div></div>` : ""}
          ${campaign.format ? `<div class="kv"><div class="kv-l">Formato</div><div class="kv-v">${campaign.format}</div></div>` : ""}
          ${campaign.grammage ? `<div class="kv"><div class="kv-l">Grammatura</div><div class="kv-v">${campaign.grammage}</div></div>` : ""}
          ${campaign.materialStatus ? `<div class="kv"><div class="kv-l">Materiale</div><div class="kv-v">${campaign.materialStatus}</div></div>` : ""}
          ${campaign.graphicStatus ? `<div class="kv"><div class="kv-l">Grafica</div><div class="kv-v">${campaign.graphicStatus}</div></div>` : ""}
          ${campaign.plan ? `<div class="kv"><div class="kv-l">Piano</div><div class="kv-v">${campaign.plan}</div></div>` : ""}
          ${area.selectionMode ? `<div class="kv"><div class="kv-l">Modalità area</div><div class="kv-v">${area.selectionMode}</div></div>` : ""}
          ${area.radiusKm ? `<div class="kv"><div class="kv-l">Raggio</div><div class="kv-v">${fmtN(area.radiusKm, 1)} km</div></div>` : ""}
        </div>
        ${d.quantityExplanation ? `<div class="callout" style="margin-top:0">${d.quantityExplanation}</div>` : ""}
        ${d.aiAnalysis?.enabled ? `
        <div class="callout b" style="margin-top:14px">
          🤖 <strong>AI Optimizer attivo</strong> — Campagna con analisi AI avanzata e Report Premium personalizzato incluso.
        </div>` : ""}
      </div>
    </div>
  </div>
</div>

<!-- ══════════════ S4 — SERVIZI INCLUSI ══════════════ -->
<div id="s4" class="card">
  <div class="card-header">
    <div class="card-num">4</div>
    <div>
      <div class="card-title">Servizi inclusi</div>
      <div class="card-sub">Tutto ciò che è compreso in questa campagna — senza costi aggiuntivi</div>
    </div>
    <div style="margin-left:auto;padding:4px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;font-size:9px;font-weight:700;color:#15803d;white-space:nowrap">
      ${svc.included.length} servizi inclusi
    </div>
  </div>
  <div class="card-body">
    <div class="inc-grid">
      ${svc.included.map(item => `
      <div class="inc">
        <span class="inc-icon">${item.icon}</span>
        <div>
          <div class="inc-label">${item.label}</div>
          <div class="inc-desc">${item.desc}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</div>

<!-- ══════════════ S5 — SERVIZI AGGIUNTIVI ══════════════ -->
<div id="s5" class="card">
  <div class="card-header">
    <div class="card-num">5</div>
    <div>
      <div class="card-title">Servizi aggiuntivi</div>
      <div class="card-sub">${selectedExtras.length > 0 ? `${selectedExtras.length} acquistato/i` : ""}${selectedExtras.length > 0 && recommendedExtras.length > 0 ? " · " : ""}${recommendedExtras.length > 0 ? `${recommendedExtras.length} consigliato/i` : ""}</div>
    </div>
  </div>
  <div class="card-body">
    <div class="extra-grid">
      ${selectedExtras.map(e => {
        const cat = EXTRAS_CATALOG.find(ec => ec.id === e.id) || {};
        return `
      <div class="extra bought">
        <div class="extra-head">
          <span class="extra-name">${cat.icon || "✓"} ${e.label}</span>
          <span class="estat bought">✓ ${e.status}</span>
        </div>
        <div class="extra-benefit">${cat.benefit || e.description || ""}</div>
        <div class="extra-foot">
          <span class="extra-price">${e.price > 0 ? fmtC(e.price) : '<span style="color:#15803d">Incluso</span>'}</span>
        </div>
      </div>`;
      }).join("")}
      ${recommendedExtras.map(e => `
      <div class="extra rec">
        <div class="extra-head">
          <span class="extra-name">${e.icon} ${e.label}</span>
          <span class="estat rec">💡 Consigliato</span>
        </div>
        <div class="extra-benefit">${e.benefit}</div>
        <div class="extra-foot">
          <span class="extra-price">+ ${fmtC(e.price)}</span>
          <span style="font-size:9px;color:#9ca3af">Aggiungibile dal configuratore</span>
        </div>
      </div>`).join("")}
    </div>
    ${selectedExtras.length === 0 && recommendedExtras.length === 0 ? `
    <div style="padding:22px;text-align:center;color:#b5a898;font-size:12px">
      Nessun servizio aggiuntivo selezionato. Aggiungi opzioni dal configuratore per arricchire la campagna.
    </div>` : ""}
  </div>
</div>

<!-- ══════════════ S6 — PIANO OPERATIVO ══════════════ -->
<div id="s6" class="card print-break">
  <div class="card-header">
    <div class="card-num">6</div>
    <div>
      <div class="card-title">Piano operativo</div>
      <div class="card-sub">Dalla preparazione alla consegna del report finale</div>
    </div>
  </div>
  <div class="card-body">
    <div class="tl-wrap">
      ${timelineHSVG(timelineSteps)}
    </div>
    <div class="tl-desc">
      ${[
        { name: "Preparazione", desc: "Analisi zona, ottimizzazione percorso GIS, assegnazione operatori." },
        { name: "Distribuzione", desc: "Operazioni con tracciamento in tempo reale e documentazione." },
        { name: "Qualità", desc: "Verifica copertura e conformità all'area pianificata." },
        { name: "Report", desc: "Elaborazione dati, GPS, fotografie e statistiche finali." },
        { name: "Consegna", desc: "Report PDF, dashboard e prove di distribuzione." },
      ].map((s, i) => `
      <div class="tl-step ${i < 2 ? "active" : ""}">
        <div class="tl-step-name">${s.name}</div>
        <div class="tl-step-desc">${s.desc}</div>
      </div>`).join("")}
    </div>
    ${planning.selectedDates?.length ? `
    <div style="margin-top:18px">
      <div class="stag">Date selezionate</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${planning.selectedDates.map(d2 => `<span class="badge bb">${d2}</span>`).join("")}
      </div>
    </div>` : ""}
    ${planning.smartPairingApplied ? `
    <div class="callout g" style="margin-top:16px">
      🔗 <strong>Smart Pairing confermato</strong> — Sconto del ${planning.smartPairingDiscountPct}% applicato grazie alla condivisione con una campagna compatibile.
      ${planning.compatibleZone ? `<br><span style="color:#6b7280">Zona compatibile: ${planning.compatibleZone}</span>` : ""}
    </div>` : `
    <div class="callout" style="margin-top:16px;font-size:10.5px;color:#6b7280">
      💡 <strong>Smart Pairing disponibile.</strong> Seleziona date specifiche nel configuratore per verificare la disponibilità di campagne compatibili e risparmiare fino al 25% sul costo base.
    </div>`}
  </div>
</div>

<!-- ══════════════ S7 — RIEPILOGO ECONOMICO ══════════════ -->
<div id="s7" class="card print-break">
  <div class="card-header">
    <div class="card-num">7</div>
    <div>
      <div class="card-title">Riepilogo economico</div>
      <div class="card-sub">Dettaglio costi, sconti applicati e totale finale</div>
    </div>
  </div>
  <div class="card-body">
    <table class="pt">
      <thead>
        <tr><th>Voce</th><th>Dettaglio</th><th>Importo</th></tr>
      </thead>
      <tbody>
        ${(pricing.lines || []).map(l => `
        <tr>
          <td><strong>${l.label}</strong></td>
          <td style="color:#6b7280">${l.quantity ? `${fmtN(l.quantity)} volantini` : "—"}</td>
          <td>${fmtC(l.total)}</td>
        </tr>`).join("")}
        ${(pricing.extras || []).filter(e => e.amount > 0).map(e => `
        <tr class="xtra">
          <td>${e.label}</td>
          <td style="color:#9ca3af">${e.status || "Servizio aggiuntivo"}</td>
          <td>${fmtC(e.amount)}</td>
        </tr>`).join("")}
        ${(pricing.discounts || []).map(disc => `
        <tr class="disc">
          <td>↓ ${disc.label}</td>
          <td style="color:#9ca3af">Sconto applicato</td>
          <td>−${fmtC(disc.amount)}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <div class="total-block">
      <div>
        <div class="total-l-lab">Totale stimato</div>
        <div class="total-amount">${fmtC(pricing.total || 0)}</div>
        <div class="total-l-note">IVA esclusa · nessun pagamento anticipato · soggetto a conferma operativa</div>
      </div>
      ${(pricing.discounts || []).length > 0 ? `
      <div style="text-align:right">
        ${(pricing.discounts || []).map(disc => `
        <div style="font-size:10px;color:rgba(255,255,255,.38);margin-bottom:5px">
          ↓ ${disc.label}<br><span style="color:#22C55E;font-weight:800;font-size:13px">−${fmtC(disc.amount)}</span>
        </div>`).join("")}
      </div>` : ""}
    </div>

    <div class="validity">
      <strong>Validità preventivo:</strong> 30 giorni dalla data di emissione (${genDate}). Il preventivo è indicativo e viene confermato al momento dell'attivazione della campagna. Nessun pagamento anticipato richiesto.
    </div>
  </div>
</div>

<!-- ══════════════ S8 — CONTATTI ══════════════ -->
<div id="s8" class="card print-break">
  <div class="card-header">
    <div class="card-num">8</div>
    <div>
      <div class="card-title">Contatti e prossimi passi</div>
      <div class="card-sub">Come procedere con l'attivazione della campagna</div>
    </div>
  </div>
  <div class="card-body">
    <div class="contacts-grid">
      <div>
        <div class="stag">Informazioni di contatto</div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div><div class="contact-l">Azienda</div><div class="contact-v">VolantiniPro</div></div>
          <div><div class="contact-l">Email</div><div class="contact-v">info@volantinipro.it</div></div>
          <div><div class="contact-l">Sito web</div><div class="contact-v">volantinipro.it</div></div>
          <div><div class="contact-l">Riferimento preventivo</div><div class="contact-v" style="color:#E8571A">${quoteId}</div></div>
        </div>
        <button class="accept-btn no-print" onclick="window.close()">
          ✓ Accetta preventivo e avvia la campagna →
        </button>
      </div>
      <div>
        <div class="stag">Link al preventivo online</div>
        <div class="qr-box">
          <div class="qr-ph">📋</div>
          <div class="qr-note">
            Scansiona o visita il link per accedere al preventivo online, modificarlo o confermarlo direttamente dalla piattaforma.
          </div>
          <div style="font-size:10px;color:#E8571A;font-weight:800">volantinipro.it/preventivo/${quoteId}</div>
        </div>
        <div style="margin-top:12px;padding:12px 14px;background:#FAF7F3;border:1px solid #EDE5D8;border-radius:9px">
          <div style="font-size:9px;font-weight:700;color:#b5a898;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Prossimi passi</div>
          ${["Rivedi il preventivo e verifica la configurazione", "Accetta e avvia la campagna dal configuratore", "Il team ti contatterà entro 24h per la conferma"].map((step, i) => `
          <div style="display:flex;gap:9px;margin-bottom:6px;font-size:10.5px;color:#374151">
            <span style="color:#E8571A;font-weight:800;flex-shrink:0">${i + 1}.</span><span>${step}</span>
          </div>`).join("")}
        </div>
      </div>
    </div>
    <div class="footer-note">
      Questo documento è una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili (fonti: ISTAT, GIS, Google Places, Agenzia delle Entrate – OMI). Il preventivo può essere soggetto a conferma operativa. La distribuzione viene avviata solo dopo la conferma esplicita del cliente. Nessun importo viene addebitato senza autorizzazione. · Rif. ${quoteId} · ${genDate}
    </div>
  </div>
</div>

</div><!-- /page-content -->
</div><!-- /content -->

<!-- ═══ PRINT BAR ═══ -->
<div class="print-bar no-print">
  <button class="btn btn-s" onclick="window.close()">✕ Chiudi</button>
  <button class="btn btn-s" onclick="copyLink()">🔗 Copia link</button>
  <button class="btn btn-p" onclick="window.print()">⬇ Salva come PDF</button>
</div>

</div><!-- /layout -->

<script>
function setActive(el){
  document.querySelectorAll('.sidebar-nav a').forEach(a=>a.classList.remove('active'));
  el.classList.add('active');
}
function copyLink(){
  try{navigator.clipboard.writeText(window.location.href);alert('Link copiato negli appunti.');}catch(e){}
}
const secs=document.querySelectorAll('[id^="s"]');
const links=document.querySelectorAll('.sidebar-nav a');
window.addEventListener('scroll',()=>{
  let cur='';
  secs.forEach(s=>{if(window.scrollY>=s.offsetTop-90)cur=s.id});
  links.forEach(l=>{l.classList.toggle('active',l.getAttribute('href')==='#'+cur)});
},{passive:true});
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1080,height=840,menubar=no,toolbar=no,scrollbars=yes,resizable=yes");
  if (!win) { alert("Abilita i popup per aprire il preventivo."); return; }
  win.document.write(html);
  win.document.close();
  win.document.title = filename;
}
