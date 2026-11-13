import { textWidth, wrapToWidth } from "./pdfTextMetrics.js";
import { ISTAT_REFERENCE_DATE, PDF_HOUSEHOLDS_SOURCE_NOTE } from "../istatCitation.js";

const PAGE = { w: 595.28, h: 841.89, margin: 42 };
const COLORS = {
  ink: "0.11 0.15 0.27",
  muted: "0.36 0.40 0.49",
  line: "0.89 0.90 0.93",
  orange: "0.91 0.34 0.10",
  soft: "0.97 0.98 0.99",
  green: "0.18 0.80 0.54",
};
const PDF_DECODER = new TextDecoder("ascii");
const WIN_ANSI = {
  "\u20ac": 0x80, "\u201a": 0x82, "\u0192": 0x83, "\u201e": 0x84, "\u2026": 0x85, "\u2020": 0x86, "\u2021": 0x87,
  "\u02c6": 0x88, "\u2030": 0x89, "\u0160": 0x8a, "\u2039": 0x8b, "\u0152": 0x8c, "\u017d": 0x8e,
  "\u2018": 0x91, "\u2019": 0x92, "\u201c": 0x93, "\u201d": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "\u02dc": 0x98, "\u2122": 0x99, "\u0161": 0x9a, "\u203a": 0x9b, "\u0153": 0x9c, "\u017e": 0x9e, "\u0178": 0x9f,
};

function encodePdf(value) {
  const bytes = [];
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (WIN_ANSI[ch]) bytes.push(WIN_ANSI[ch]);
    else bytes.push(0x20);
  }
  return Uint8Array.from(bytes);
}

function safe(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).normalize("NFC").replace(/[\u2013\u2014]/g, "-").replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u20AC\u2018-\u201D\u2022]/g, "");
}

function pdfText(value) {
  const s = safe(value) || "";
  return `(${s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function formatNumberIT(value, decimals = 0) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return safe(value);
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrencyIT(value, decimals = 2) {
  if (value === undefined || value === null || value === "" || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `\u20ac${n.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPercentIT(value) {
  if (value === undefined || value === null || value === "") return null;
  return `${formatNumberIT(value)}%`;
}

function formatAreaKm2(value) {
  if (value === undefined || value === null || value === "") return null;
  return `${formatNumberIT(value, 1)} km\u00b2`;
}

function formatGrammage(value) {
  const raw = safe(value);
  if (!raw) return null;
  const numeric = raw.match(/\d+(?:[,.]\d+)?/)?.[0];
  if (!numeric) return raw.replace(/g\/m2|g\/mq|g\/m\u00b2/gi, "g/m\u00b2");
  return `${numeric.replace(".", ",")} g/m\u00b2`;
}

// Etichette leggibili per opzioni tecniche del servizio stampa.
function printOptionLabel(value, labels) {
  if (value == null || value === "") return null;
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return labels[key] || String(value).replace(/_/g, " ");
}

const PAPER_LABELS = {
  patinata_opaca: "Patinata opaca",
  patinata_lucida: "Patinata lucida",
  uso_mano: "Uso mano",
};
const SIDES_LABELS = {
  fronte_retro: "Fronte e retro",
  fronte: "Solo fronte",
  solo_fronte: "Solo fronte",
};
const COLOR_LABELS = {
  cmyk: "A colori (CMYK)",
  colori: "A colori",
  bianco_nero: "Bianco e nero",
};

function displayValue(value) {
  return typeof value === "number" ? formatNumberIT(value) : safe(value);
}

function wrap(text, maxChars) {
  const words = (safe(text) || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const AREA_MODE_LABELS = { radius: "Raggio", address: "Raggio", comune: "Comune", municipality: "Comune", cap: "CAP", custom_zone: "NIL / quartieri", nil: "NIL / quartieri" };
function areaModeLabel(value) {
  if (value == null || value === "") return null;
  return AREA_MODE_LABELS[String(value).toLowerCase()] || String(value);
}

function truncate(str, maxChars) {
  const s = safe(str) || "";
  return s.length > maxChars ? s.slice(0, maxChars - 3) + "..." : s;
}

function normalizeSource(src) {
  return ({
    Backend: "Analisi interna",
    "Backend scoring": "Analisi interna",
    GIS: "Dati geografici / PostGIS",
    "GIS/PostGIS": "Dati geografici / PostGIS",
    OMI: "Agenzia Entrate - OMI",
    "OMI/dataset": "Agenzia Entrate - OMI",
    "Dati territoriali / OMI": "Agenzia Entrate - OMI",
    GTFS: "GTFS / Trasporto pubblico",
    "Trasporto pubblico / GTFS": "GTFS / Trasporto pubblico",
    Places: "Google Places",
    Google: "Google Places",
    Overpass: "OpenStreetMap / Overpass",
  })[src] || src;
}

export function mapQuoteDataToPdfModel(input) {
  const data = input || {};
  const sources = [...new Set((data.sources || []).map(normalizeSource).filter(Boolean))];
  return {
    quoteId: data.quoteId,
    generatedAt: data.generatedAt || new Date().toISOString(),
    status: data.status || "Preventivo stimato",
    statusKey: data.statusKey || null,
    statusDisclaimer: data.statusDisclaimer || null,
    service: data.service || "Servizio",
    client: data.client || {},
    contact: data.contact || {},
    coverageStrategy: data.coverageStrategy || null,
    quantityExplanation: data.quantityExplanation || null,
    campaign: data.campaign || {},
    area: data.area || {},
    outputs: data.outputs || {},
    municipalities: data.municipalities || [],
    scores: data.scores || [],
    adminInfo: data.adminInfo || [],
    aiAnalysis: data.aiAnalysis || { enabled: false },
    planning: data.planning || {},
    pricing: data.pricing || { lines: [], subtotal: 0, discounts: [], extras: [], total: 0 },
    sources,
  };
}

function coverageWithInserted(outputs) {
  const recommended = Number(outputs.recommendedFlyers || 0);
  const inserted = Number(outputs.insertedFlyers || 0);
  if (!recommended || !inserted) return null;
  return Math.min(100, Math.round((inserted / recommended) * 100));
}

function quantityExplanation(model) {
  const out = model.outputs || {};
  const recommended = Number(out.recommendedFlyers || 0);
  const inserted = Number(out.insertedFlyers || 0);
  if (!recommended || !inserted) return null;
  if (inserted >= recommended) {
    const remaining = Math.max(0, inserted - recommended);
    return `La quantit\u00e0 inserita \u00e8 sufficiente per coprire l'area selezionata. Restano ${formatNumberIT(remaining)} volantini disponibili.`;
  }
  const missing = Math.max(0, recommended - inserted);
  return `La quantit\u00e0 inserita copre solo parte dell'area selezionata. Mancano ${formatNumberIT(missing)} volantini per raggiungere la copertura stimata.`;
}

function coverageStatusLabel(outputs) {
  if (outputs.coverageStatus === "partial" || Number(outputs.missingFlyers || 0) > 0) return "Copertura parziale";
  if (outputs.coverageStatus === "sufficient" || Number(outputs.recommendedFlyers || 0) > 0) return "Copertura sufficiente";
  return null;
}

function scoreValue(model, label) {
  const found = (model.scores || []).find(s => String(s.label || "").toLowerCase().includes(label.toLowerCase()));
  const n = Number(found?.value);
  return Number.isFinite(n) ? n : null;
}

function selectedMunicipalityNames(model) {
  return (model.municipalities || []).filter(m => !String(m.status || "").toLowerCase().includes("non selezionato")).map(m => m.name).filter(Boolean);
}

function nonSelectedMunicipalityNames(model) {
  return (model.municipalities || []).filter(m => String(m.status || "").toLowerCase().includes("non selezionato")).map(m => m.name).filter(Boolean);
}

function residentialStrength(score) {
  if (score == null) return "valutabile";
  if (score >= 75) return "forte";
  if (score >= 58) return "buono";
  return "da ottimizzare";
}

function buildDoorToDoorAiAnalysis(model) {
  const out = model.outputs || {};
  const familyIndex = scoreValue(model, "Family");
  const reachScore = scoreValue(model, "Reach");
  const confidenceScore = scoreValue(model, "Confidence");
  const mainArea = model.area.mainArea || model.aiAnalysis?.mainArea || "l'area selezionata";
  const selected = selectedMunicipalityNames(model);
  const available = nonSelectedMunicipalityNames(model);
  const inserted = Number(out.insertedFlyers || 0);
  const recommended = Number(out.recommendedFlyers || 0);
  const remaining = Math.max(0, inserted - recommended);
  const missing = Math.max(0, recommended - inserted);
  const sufficient = recommended > 0 && inserted >= recommended;

  const blocks = [];
  const actions = [];

  const generalParts = [];
  if (out.estimatedFamilies) generalParts.push(`${formatNumberIT(out.estimatedFamilies)} famiglie stimate`);
  if (out.estimatedPopulation) generalParts.push(`${formatNumberIT(out.estimatedPopulation)} persone stimate`);
  if (out.estimatedCoverage != null) generalParts.push(`copertura potenziale ${formatPercentIT(out.estimatedCoverage)}`);
  const strength = residentialStrength(familyIndex ?? reachScore);
  if (generalParts.length || strength !== "valutabile") {
    blocks.push({
      title: "Valutazione generale",
      text: `${mainArea} presenta un potenziale residenziale ${strength}${generalParts.length ? `, con ${generalParts.join(" e ")}` : ""}.${familyIndex != null ? ` Family Index: ${familyIndex}/100.` : ""}${reachScore != null ? ` Reach Score: ${reachScore}/100.` : ""}`,
    });
  }

  if (inserted && recommended) {
    blocks.push({
      title: "Copertura e quantit\u00e0",
      text: sufficient
        ? `La quantit\u00e0 inserita di ${formatNumberIT(inserted)} volantini \u00e8 sufficiente rispetto ai ${formatNumberIT(recommended)} volantini consigliati. Restano ${formatNumberIT(remaining)} volantini disponibili per estensione zona o scorta operativa.`
        : `Per raggiungere la copertura stimata servono ${formatNumberIT(recommended)} volantini. La quantit\u00e0 inserita di ${formatNumberIT(inserted)} volantini consente una copertura parziale: mancano ${formatNumberIT(missing)} volantini.`,
    });
  }

  const territoryParts = [];
  if (selected.length) territoryParts.push(`comuni selezionati: ${selected.join(", ")}`);
  if (available.length) territoryParts.push(`comuni nel raggio non selezionati: ${available.slice(0, 4).join(", ")}`);
  if (territoryParts.length) {
    blocks.push({
      title: "Lettura territoriale",
      text: `${mainArea} \u00e8 la zona principale dell'analisi; ${territoryParts.join(". ")}.`,
    });
  }

  if (!recommended || !inserted) {
    blocks.push({
      title: "Raccomandazione AI",
      text: "Analisi AI disponibile sulla base dei dati attualmente raccolti. Alcuni indicatori territoriali non sono ancora disponibili.",
    });
  } else if (sufficient && remaining > 0) {
    blocks.push({
      title: "Raccomandazione AI",
      text: "La campagna pu\u00f2 essere confermata con copertura completa dell'area selezionata. I volantini residui possono essere usati per aggiungere comuni vicini o mantenere una scorta operativa.",
    });
    actions.push("Confermare la copertura dell'area selezionata.");
    if (available.length) actions.push(`Valutare estensione verso ${available[0]}.`);
    actions.push("Mantenere una scorta operativa per recuperi o zone ad alta densit\u00e0.");
  } else {
    blocks.push({
      title: "Raccomandazione AI",
      text: "La campagna pu\u00f2 essere confermata come distribuzione parziale oppure ottimizzata aumentando la quantit\u00e0 o riducendo il raggio operativo.",
    });
    actions.push(`Aumentare la quantit\u00e0 di ${formatNumberIT(missing)} volantini per copertura stimata.`);
    actions.push("Ridurre il raggio o limitare la selezione ai comuni prioritari.");
    actions.push("Confermare copertura parziale se l'obiettivo \u00e8 una distribuzione pi\u00f9 mirata.");
  }

  if (model.planning?.smartPairingApplied) actions.push("Usare lo Smart Pairing disponibile per ridurre il costo della distribuzione.");
  if (!actions.length) actions.push("Verificare i dati territoriali e completare la pianificazione operativa.");

  blocks.push({
    title: "Azioni consigliate",
    bullets: actions,
  });

  if (confidenceScore != null) {
    blocks.push({
      title: "Livello di affidabilit\u00e0",
      text: `Confidence Score: ${confidenceScore}/100. Indica quanto la stima \u00e8 supportata dai dati territoriali disponibili e dalla coerenza della selezione area/quantit\u00e0.`,
    });
  }

  return blocks.filter(block => block.text || block.bullets?.length);
}

function renderAiAnalysis(w, model) {
  if (!model.aiAnalysis?.enabled) return;
  section(w, "Analisi AI della campagna", "Extra selezionato \u00b7 Sintesi automatica basata su configurazione, zona, KPI e dati territoriali");
  const isD2D = String(model.service || "").toLowerCase().includes("door") || model.aiAnalysis?.serviceType === "d2d";
  const blocks = isD2D ? buildDoorToDoorAiAnalysis(model) : [{
    title: "Sintesi AI",
    text: "Analisi AI disponibile sulla base dei dati attualmente raccolti. Alcuni indicatori territoriali specifici del servizio non sono ancora disponibili.",
  }];
  blocks.forEach((block, i) => {
    w.ensure(48);
    if (i > 0) w.move(6);
    w.text(block.title, PAGE.margin, 11, COLORS.ink, "F2");
    w.move(4);
    w.line(PAGE.margin, w.y, PAGE.w - PAGE.margin, w.y, COLORS.line);
    w.move(10);
    if (block.text) paragraph(w, block.text);
    if (block.bullets?.length) bulletList(w, block.bullets);
  });
}

function createWriter() {
  const pages = [[]];
  let pageIndex = 0;
  let y = PAGE.h - PAGE.margin;

  const current = () => pages[pageIndex];
  const add = cmd => current().push(cmd);
  const newPage = () => {
    pages.push([]);
    pageIndex += 1;
    y = PAGE.h - PAGE.margin;
  };
  const ensure = height => {
    if (y - height < PAGE.margin + 36) newPage();
  };
  const text = (value, x, size = 10, color = COLORS.ink, font = "F1") => {
    add(`BT /${font} ${size} Tf ${color} rg ${x} ${y} Td ${pdfText(value)} Tj ET`);
  };
  const textAt = (value, x, yy, size = 10, color = COLORS.ink, font = "F1") => {
    add(`BT /${font} ${size} Tf ${color} rg ${x} ${yy} Td ${pdfText(value)} Tj ET`);
  };
  const rect = (x, yy, width, height, fill = null, stroke = COLORS.line) => {
    if (fill) add(`${fill} rg ${x} ${yy} ${width} ${height} re f`);
    if (stroke) add(`${stroke} RG ${x} ${yy} ${width} ${height} re S`);
  };
  const line = (x1, yy1, x2, yy2, color = COLORS.line) => {
    add(`${color} RG ${x1} ${yy1} m ${x2} ${yy2} l S`);
  };
  const move = dy => { y -= dy; };
  return { pages, add, ensure, text, textAt, rect, line, move, get y() { return y; }, set y(v) { y = v; } };
}

// Righe di testo che stanno in `width` punti; oltre maxLines l'ultima riga
// termina con "..." (solo per testi molto lunghi, mai per nomi o importi brevi).
function fitLines(text, width, size, font, maxLines) {
  const lines = wrapToWidth(safe(text) || "", width, size, font);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && textWidth(`${last}...`, size, font) > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}...`;
  return kept;
}

function kvGrid(w, items, columns = 2) {
  const clean = items.filter(i => safe(i?.value));
  if (!clean.length) return;
  const colW = (PAGE.w - PAGE.margin * 2 - 12 * (columns - 1)) / columns;
  const innerW = colW - 18;
  const LBL = 7.5, VAL = 10.5, LBL_H = 9, VAL_H = 12.5, PAD = 9;
  for (let start = 0; start < clean.length; start += columns) {
    const cells = clean.slice(start, start + columns).map(item => ({
      item,
      labels: fitLines(item.label, innerW, LBL, "F1", 2),
      values: fitLines(displayValue(item.value), innerW, VAL, "F2", 4),
    }));
    const rowH = Math.max(42, ...cells.map(c => PAD * 2 + c.labels.length * LBL_H + 3 + c.values.length * VAL_H));
    w.ensure(rowH + 8);
    const top = w.y;
    cells.forEach((c, col) => {
      const x = PAGE.margin + col * (colW + 12);
      w.rect(x, top - rowH, colW, rowH, COLORS.soft, COLORS.line);
      let ty = top - PAD - LBL;
      c.labels.forEach(l => { w.textAt(l, x + 9, ty, LBL, COLORS.muted); ty -= LBL_H; });
      ty -= 3 + (VAL - LBL) + 1;
      c.values.forEach(v => { w.textAt(v, x + 9, ty, VAL, c.item.color || COLORS.ink, "F2"); ty -= VAL_H; });
    });
    w.y = top - rowH - 8;
  }
}

function section(w, title, subtitle) {
  w.ensure(60);
  w.move(8);
  w.text(title, PAGE.margin, 14, COLORS.ink, "F2");
  w.move(18);
  if (subtitle) {
    w.text(subtitle, PAGE.margin, 8.5, COLORS.muted);
    w.move(14);
  }
  w.line(PAGE.margin, w.y, PAGE.w - PAGE.margin, w.y);
  w.move(14);
}

function paragraph(w, content) {
  const lines = wrap(content, 92);
  const lineH = 12;
  const padTop = 9;
  const padBot = 7;
  const totalH = padTop + lines.length * lineH + padBot;
  w.ensure(totalH + 10);
  w.rect(PAGE.margin, w.y - totalH, PAGE.w - PAGE.margin * 2, totalH, "1 0.97 0.93", "0.99 0.73 0.45");
  w.move(padTop);
  lines.forEach(line => {
    w.text(line, PAGE.margin + 10, 9, COLORS.ink);
    w.move(lineH);
  });
  w.move(padBot + 6);
}

function bulletList(w, items) {
  const clean = items.filter(Boolean).map(safe).filter(Boolean).slice(0, 5);
  if (!clean.length) return;
  clean.forEach(item => {
    const lines = wrap(item, 86);
    w.ensure(lines.length * 11 + 4);
    w.text("-", PAGE.margin + 4, 9, COLORS.orange, "F2");
    lines.forEach((line, idx) => {
      w.textAt(line, PAGE.margin + 18, w.y - idx * 11, 9, COLORS.ink);
    });
    w.move(lines.length * 11 + 3);
  });
  w.move(4);
}

// Tabella con colonne a larghezza fissa (somma = larghezza utile): ogni
// cella va a capo dentro la propria colonna, quindi le colonne non si
// sovrappongono mai; l'intestazione si ripete a ogni nuova pagina.
const TABLE_PAD_X = 6;
function tableColumnWidths(count, widths) {
  const total = PAGE.w - PAGE.margin * 2;
  const given = (widths || []).slice(0, count);
  while (given.length < count) given.push(total / count);
  const sum = given.reduce((a, v) => a + v, 0);
  return given.map(v => (v * total) / sum);
}

function table(w, headers, rows, widths) {
  if (!rows.length) return;
  const x0 = PAGE.margin;
  const total = PAGE.w - PAGE.margin * 2;
  const cols = tableColumnWidths(headers.length, widths);
  const HEAD = 8, BODY = 8.5, HEAD_LH = 10, BODY_LH = 11, PAD_Y = 7;
  const headLines = headers.map((h, i) => wrapToWidth(safe(h) || "", cols[i] - TABLE_PAD_X * 2, HEAD, "F2"));
  const headerH = PAD_Y * 2 + Math.max(...headLines.map(l => l.length)) * HEAD_LH;
  const drawHeader = () => {
    w.rect(x0, w.y - headerH, total, headerH, "0.94 0.96 1", COLORS.line);
    let x = x0;
    headLines.forEach((lines, i) => {
      lines.forEach((l, k) => w.textAt(l, x + TABLE_PAD_X, w.y - PAD_Y - HEAD - k * HEAD_LH + 2, HEAD, COLORS.ink, "F2"));
      x += cols[i];
    });
    w.move(headerH);
  };
  const bodyLines = rows.map(row => row.map((cell, i) => wrapToWidth(safe(cell) || "-", cols[i] - TABLE_PAD_X * 2, BODY, "F1")));
  const rowHeight = lines => Math.max(24, PAD_Y * 2 + Math.max(...lines.map(l => l.length)) * BODY_LH);
  w.ensure(headerH + rowHeight(bodyLines[0]) + 8);
  drawHeader();
  bodyLines.forEach(lines => {
    const h = rowHeight(lines);
    if (w.y - h < PAGE.margin + 36) {
      w.ensure(PAGE.h); // nuova pagina
      drawHeader();
    }
    w.rect(x0, w.y - h, total, h, null, COLORS.line);
    let x = x0;
    lines.forEach((cellLines, i) => {
      cellLines.forEach((l, k) => w.textAt(l, x + TABLE_PAD_X, w.y - PAD_Y - BODY - k * BODY_LH + 2, BODY, COLORS.ink));
      x += cols[i];
    });
    w.move(h);
  });
  w.move(10);
}

function renderPdf(model) {
  const w = createWriter();
  const genDate = new Date(model.generatedAt).toLocaleDateString("it-IT");
  const coverageInserted = coverageWithInserted(model.outputs);

  w.text("VolantiniPro", PAGE.margin, 18, COLORS.orange, "F2");
  w.textAt(model.status, PAGE.w - PAGE.margin - textWidth(safe(model.status) || "", 9, "F1"), w.y + 2, 9, COLORS.muted);
  w.move(26);
  w.text(`Preventivo campagna ${model.service}`, PAGE.margin, 22, COLORS.ink, "F2");
  w.move(20);
  w.text("Riepilogo operativo generato da VolantiniPro", PAGE.margin, 10, COLORS.muted);
  w.move(18);
  kvGrid(w, [
    { label: "Data generazione", value: genDate },
    { label: "Riferimento", value: model.quoteId || `VP-${genDate.replace(/\D/g, "")}` },
    { label: "Servizio", value: model.service },
    { label: "Stato", value: model.status },
  ], 4);

  if (Object.values(model.client).some(Boolean)) {
    section(w, "Dati del cliente", "Intestatario del preventivo");
    kvGrid(w, [
      { label: "Nome", value: model.client.name },
      { label: "Azienda", value: model.client.company },
      { label: "Email", value: model.client.email },
      { label: "Telefono", value: model.client.phone },
    ], 2);
  }

  section(w, "1. Configurazione campagna", "Dati selezionati nello Step 1");
  kvGrid(w, [
    { label: "Servizio", value: model.service },
    { label: "Variante", value: model.campaign.variant },
    { label: "Zona / comune", value: model.area.mainArea },
    { label: "Quantit\u00e0 volantini", value: formatNumberIT(model.campaign.quantity) },
    { label: "Formato", value: model.campaign.format },
    // Senza servizio di stampa, non mostrare specifiche tipografiche residuali
    // nel form. Il formato del volantino e lo stato del materiale restano utili.
    ...(model.campaign.printingSelected === false ? [] : [
      { label: "Grammatura", value: formatGrammage(model.campaign.grammage) },
      { label: "Tipo carta", value: printOptionLabel(model.campaign.paperType, PAPER_LABELS) },
      { label: "Orientamento", value: printOptionLabel(model.campaign.orientation, {}) },
      { label: "Lati", value: printOptionLabel(model.campaign.sides, SIDES_LABELS) },
      { label: "Colore", value: printOptionLabel(model.campaign.color, COLOR_LABELS) },
    ]),
    { label: "Materiale", value: model.campaign.materialStatus },
    { label: "Grafica", value: model.campaign.graphicStatus },
    { label: "Piano", value: model.campaign.plan },
    { label: "Campagne/mese", value: formatNumberIT(model.campaign.campaignsPerMonth) },
    { label: "Durata", value: model.campaign.duration },
    { label: "Modalit\u00e0 area", value: areaModeLabel(model.area.areaMode || model.campaign.areaMode) },
  ]);

  section(w, "2. Analisi zona e output servizio", "Dati territoriali e operativi generati in Step 2");
  kvGrid(w, [
    { label: "Comune / zona principale", value: model.area.mainArea },
    { label: "CAP selezionati", value: (model.area.selectedCaps || []).join(" - ") },
    { label: "Raggio analisi", value: model.area.radiusKm ? `${formatNumberIT(model.area.radiusKm, 1)} km` : null },
    { label: "Superficie coperta", value: formatAreaKm2(model.area.coveredAreaKm2) },
    { label: model.area.territoryCounts ? "Comuni coinvolti" : "Comuni selezionati", value: (model.area.selectedMunicipalities || []).join(" - ") },
    { label: "Modalit\u00e0 selezione", value: model.area.selectionMode },
    { label: "Famiglie stimate", value: formatNumberIT(model.outputs.estimatedFamilies) ?? model.outputs.estimatedFamiliesNote ?? null },
    { label: "Popolazione stimata", value: formatNumberIT(model.outputs.estimatedPopulation) },
    { label: "Copertura potenziale area", value: formatPercentIT(model.outputs.estimatedCoverage) },
    { label: "Copertura con quantit\u00e0 inserita", value: formatPercentIT(coverageInserted) },
    { label: "Volantini consigliati per copertura stimata", value: formatNumberIT(model.outputs.recommendedFlyers) },
    { label: "Stato copertura", value: coverageStatusLabel(model.outputs) },
    { label: "Volantini inseriti", value: formatNumberIT(model.outputs.insertedFlyers) },
    { label: "Quantit\u00e0 residua", value: model.outputs.remainingFlyers > 0 ? formatNumberIT(model.outputs.remainingFlyers) : null },
    { label: "Quantit\u00e0 mancante", value: model.outputs.missingFlyers > 0 ? formatNumberIT(model.outputs.missingFlyers) : null },
  ]);
  if (model.outputs.estimatedFamilies != null) paragraph(w, PDF_HOUSEHOLDS_SOURCE_NOTE);
  const qExplanation = model.quantityExplanation || quantityExplanation(model);
  if (qExplanation) paragraph(w, qExplanation);
  if (model.outputs.coverageStatus === "partial") paragraph(w, "Hai scelto di continuare con copertura parziale.");

  w.ensure(190);
  const counts = model.area.territoryCounts;
  const hasTypes = model.municipalities.some(m => m.type);
  section(w, hasTypes ? "3. Territori nel raggio / distribuzione" : "3. Comuni nel raggio / distribuzione",
    counts?.summary
      ? `${counts.summary}${counts.territoryCount ? ` \u00b7 ${counts.territoryCount} territori in tabella (NIL e comuni sono unit\u00e0 distinte)` : ""}`
      : "Selezione e copertura territoriale");
  if (model.municipalities.length) {
    const headers = [hasTypes ? "Territorio" : "Comune", ...(hasTypes ? ["Tipo"] : []), "Stato", "Volantini allocati", "Copertura con quantit\u00e0 inserita", "Contributo selezione"];
    table(w, headers, model.municipalities.map(m => {
      const notSelected = String(m.status || "").toLowerCase().includes("non selezionato");
      return [
        m.name,
        ...(hasTypes ? [m.type || "-"] : []),
        m.status,
        !notSelected && m.estimatedFlyers != null ? formatNumberIT(m.estimatedFlyers) : "-",
        !notSelected && m.coveragePct != null ? formatPercentIT(m.coveragePct) : "-",
        !notSelected && m.contributionPct != null ? formatPercentIT(m.contributionPct) : "-",
      ];
    }), hasTypes ? [138, 54, 132, 58, 66, 63] : [150, 150, 80, 70, 61]);
  } else {
    paragraph(w, "Dettaglio comuni non disponibile.");
  }

  section(w, "4. Indicatori servizio", "KPI operativi della stima");
  kvGrid(w, model.scores.map(s => ({ label: s.label, value: `${s.value}/100 - ${s.description || ""}` })));

  section(w, "5. AdminInfo / ISTAT summary", `Sintesi demografica ed economica · dati ISTAT al ${ISTAT_REFERENCE_DATE}`);
  kvGrid(w, model.adminInfo.map(i => ({ label: i.label, value: i.value })));

  renderAiAnalysis(w, model);

  w.ensure(136);
  section(w, "6. Pianificazione campagna", "Date e vantaggi disponibili");
  kvGrid(w, [
    { label: "Date selezionate", value: (model.planning.selectedDates || []).join(" - ") },
    { label: "Disponibilit\u00e0", value: model.planning.availabilityLabel },
    model.planning.smartPairingApplied ? { label: "Sconto operativo", value: `Smart Pairing -${formatPercentIT(model.planning.smartPairingDiscountPct)}` } : null,
    { label: "Zona compatibile", value: model.planning.compatibleZone },
  ].filter(Boolean));
  if (!model.planning.smartPairingApplied) {
    paragraph(w, "Smart Pairing non disponibile per questa configurazione.");
  }

  section(w, "7. Preventivo e costo", model.statusKey === "submitted" || model.statusKey === "confirmed" ? "Calcolo economico del preventivo confermato" : "Calcolo economico stimato");
  table(w, ["Voce", "Quantit\u00e0", "Prezzo unitario", "Totale"], [...model.pricing.lines.map(l => [
      l.label,
      l.quantityLabel || (l.quantity ? `${formatNumberIT(l.quantity)} volantini` : "-"),
      l.unitPriceLabel || (l.unitPrice ? formatCurrencyIT(l.unitPrice, 4) : "-"),
      formatCurrencyIT(l.total),
    ]),...(model.pricing.extras || []).map(e => [
      e.label,
      String(e.label || "").toLowerCase().includes("ai") ? "1 report" : "1 servizio",
      formatCurrencyIT(e.amount),
      formatCurrencyIT(e.amount),
    ]),...(model.pricing.discounts || []).map(d => [d.label, "-", "-", `-${formatCurrencyIT(d.amount)}`]),
    ...(model.pricing.printingLine?.inTotal && model.pricing.printingLine.amount != null ? [[
      model.pricing.printingLine.label || "Stampa indicativa", "-", "-",
      formatCurrencyIT(model.pricing.printingLine.amount),
    ]] : []),
    ...(model.pricing.graphicLine?.inTotal && model.pricing.graphicLine.amount != null ? [[
      model.pricing.graphicLine.label || "Grafica", "-", "-",
      formatCurrencyIT(model.pricing.graphicLine.amount),
    ]] : []),
  ], [210, 115, 105, 80]);
  w.ensure(54);
  w.rect(PAGE.margin, w.y - 40, PAGE.w - PAGE.margin * 2, 40, "1 0.97 0.93", "0.99 0.73 0.45");
  w.textAt("Totale complessivo", PAGE.margin + 12, w.y - 25, 12, COLORS.ink, "F2");
  w.textAt(formatCurrencyIT(model.pricing.grandTotal ?? model.pricing.total), PAGE.w - PAGE.margin - 120, w.y - 25, 16, COLORS.orange, "F2");
  w.move(54);
  // Note di prezzo (es. Hand to Hand: volantini stimati, spostamento fuori Milano senza importo).
  (model.pricing.notes || []).forEach((note) => paragraph(w, note));
  if (model.pricing.printingLine?.inTotal) {
    paragraph(w, "Stampa indicativa inclusa nel totale: importo da confermare con la tipografia.");
  }
  if (model.pricing.graphicLine && !model.pricing.graphicLine.inTotal) {
    paragraph(w, model.pricing.graphicLine.note ? `Grafica: ${model.pricing.graphicLine.note}.` : "Grafica non inclusa nel totale.");
  }
  paragraph(w, "IVA esclusa. Il preventivo \u00e8 soggetto a conferma operativa; nessun pagamento anticipato.");

  section(w, "8. Fonti dati", "Origine dei dati utilizzati");
  paragraph(w, model.sources.join(" - ") || "Fonti non disponibili");

  const disclaimer = model.statusDisclaimer || "Il presente documento \u00e8 una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili. Il preventivo pu\u00f2 essere soggetto a conferma operativa.";
  w.pages.forEach((commands, idx) => {
    const pageLabel = `VolantiniPro \u00b7 ${model.status} \u00b7 Pagina ${idx + 1}/${w.pages.length}`;
    if (idx === w.pages.length - 1) {
      wrap(disclaimer, 112).forEach((line, lineIdx) => {
        commands.push(`BT /F1 7 Tf ${COLORS.muted} rg ${PAGE.margin} ${28 - lineIdx * 9} Td ${pdfText(line)} Tj ET`);
      });
      const lastLabel = `${model.status} · ${idx + 1}/${w.pages.length}`;
      commands.push(`BT /F1 7 Tf ${COLORS.muted} rg ${PAGE.w - PAGE.margin - textWidth(safe(lastLabel) || "", 7, "F1")} 18 Td ${pdfText(lastLabel)} Tj ET`);
    } else {
      commands.push(`BT /F1 7 Tf ${COLORS.muted} rg ${PAGE.margin} 22 Td ${pdfText(pageLabel)} Tj ET`);
    }
  });

  return w.pages;
}

function buildPdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((commands, i) => {
    const pageObj = 3 + i * 2;
    const streamObj = pageObj + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >> /Contents ${streamObj} 0 R >>`);
    const stream = commands.join("\n");
    objects.push(`<< /Length ${encodePdf(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  const chunks = [];
  let byteOffset = 0;
  const append = value => {
    const bytes = encodePdf(value);
    chunks.push(bytes);
    byteOffset += bytes.length;
  };
  append("%PDF-1.4\n");
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(byteOffset);
    append(`${i + 1} 0 obj\n${obj}\nendobj\n`);
  });
  const xref = byteOffset;
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => { append(`${String(offset).padStart(10, "0")} 00000 n \n`); });
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pdfBytes = new Uint8Array(totalLength);
  let cursor = 0;
  chunks.forEach(chunk => {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.length;
  });
  validatePdfBytes(pdfBytes);
  return pdfBytes;
}

export function validatePdfBytes(pdfBytes) {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
    throw new Error("Generated PDF is empty");
  }
  const header = PDF_DECODER.decode(pdfBytes.slice(0, 4));
  if (header !== "%PDF") {
    throw new Error("Generated file is not a valid PDF");
  }
  return true;
}

export function generateQuotePdfBytes(rawData) {
  const model = mapQuoteDataToPdfModel(rawData);
  return buildPdf(renderPdf(model));
}

export function createQuotePdfBlob(rawData) {
  const pdfBytes = generateQuotePdfBytes(rawData);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  if (blob.size === 0 || blob.type !== "application/pdf") {
    throw new Error("Invalid PDF blob");
  }
  return blob;
}

export function downloadQuotePdf(rawData, filename) {
  const blob = createQuotePdfBlob(rawData);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "volantinipro-preventivo.pdf";
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
  } finally {
    // Do not revoke during the same task as the click: some browsers would
    // cancel the pending PDF download before it starts.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return blob;
}
