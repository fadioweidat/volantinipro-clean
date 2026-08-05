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
    service: data.service || "Servizio",
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

function kvGrid(w, items, columns = 2) {
  const clean = items.filter(i => safe(i?.value));
  if (!clean.length) return;
  const colW = (PAGE.w - PAGE.margin * 2 - 12 * (columns - 1)) / columns;
  const maxValChars = Math.max(8, Math.floor((colW - 20) / 6.1));
  const maxLblChars = Math.max(8, Math.floor((colW - 20) / 5.2));
  const rowH = 42;
  clean.forEach((item, idx) => {
    if (idx % columns === 0) w.ensure(rowH + 8);
    const col = idx % columns;
    const rowY = w.y - rowH;
    const x = PAGE.margin + col * (colW + 12);
    w.rect(x, rowY, colW, rowH, COLORS.soft, COLORS.line);
    w.textAt(truncate(item.label, maxLblChars), x + 9, rowY + 25, 7.5, COLORS.muted);
    w.textAt(truncate(displayValue(item.value), maxValChars), x + 9, rowY + 11, 10.5, item.color || COLORS.ink, "F2");
    if (col === columns - 1 || idx === clean.length - 1) w.y = rowY - 8;
  });
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

function table(w, headers, rows, widths = [150, 150, 90, 65, 55]) {
  if (!rows.length) return;
  const x0 = PAGE.margin;
  const headerH = 22;
  w.ensure(headerH + 24);
  w.rect(x0, w.y - headerH, PAGE.w - PAGE.margin * 2, headerH, "0.94 0.96 1", COLORS.line);
  let x = x0 + 8;
  headers.forEach((h, i) => {
    w.textAt(h, x, w.y - 14, 8, COLORS.ink, "F2");
    x += widths[i] || 80;
  });
  w.move(headerH);
  rows.forEach(row => {
    const h = 28;
    w.ensure(h + 8);
    w.rect(x0, w.y - h, PAGE.w - PAGE.margin * 2, h, null, COLORS.line);
    x = x0 + 8;
    row.forEach((cell, i) => {
      w.textAt(safe(cell) || "-", x, w.y - 17, 8.5, COLORS.ink);
      x += widths[i] || 80;
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
  w.textAt(model.status, PAGE.w - PAGE.margin - 120, w.y + 2, 9, COLORS.muted);
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

  section(w, "1. Configurazione campagna", "Dati selezionati nello Step 1");
  kvGrid(w, [
    { label: "Servizio", value: model.service },
    { label: "Variante", value: model.campaign.variant },
    { label: "Zona / comune", value: model.area.mainArea },
    { label: "Quantit\u00e0 volantini", value: formatNumberIT(model.campaign.quantity) },
    { label: "Formato", value: model.campaign.format },
    { label: "Grammatura", value: formatGrammage(model.campaign.grammage) },
    { label: "Materiale", value: model.campaign.materialStatus },
    { label: "Grafica", value: model.campaign.graphicStatus },
    { label: "Piano", value: model.campaign.plan },
    { label: "Campagne/mese", value: formatNumberIT(model.campaign.campaignsPerMonth) },
    { label: "Durata", value: model.campaign.duration },
    { label: "Modalita area", value: model.area.areaMode || model.campaign.areaMode },
  ]);

  section(w, "2. Analisi zona e output servizio", "Dati territoriali e operativi generati in Step 2");
  kvGrid(w, [
    { label: "Comune / zona principale", value: model.area.mainArea },
    { label: "CAP selezionati", value: (model.area.selectedCaps || []).join(" - ") },
    { label: "Raggio analisi", value: model.area.radiusKm ? `${formatNumberIT(model.area.radiusKm, 1)} km` : null },
    { label: "Superficie coperta", value: formatAreaKm2(model.area.coveredAreaKm2) },
    { label: "Comuni selezionati", value: (model.area.selectedMunicipalities || []).join(" - ") },
    { label: "Modalit\u00e0 selezione", value: model.area.selectionMode },
    { label: "Famiglie stimate", value: formatNumberIT(model.outputs.estimatedFamilies) },
    { label: "Popolazione stimata", value: formatNumberIT(model.outputs.estimatedPopulation) },
    { label: "Copertura potenziale area", value: formatPercentIT(model.outputs.estimatedCoverage) },
    { label: "Copertura con quantit\u00e0 inserita", value: formatPercentIT(coverageInserted) },
    { label: "Volantini consigliati per copertura stimata", value: formatNumberIT(model.outputs.recommendedFlyers) },
    { label: "Stato copertura", value: coverageStatusLabel(model.outputs) },
    { label: "Volantini inseriti", value: formatNumberIT(model.outputs.insertedFlyers) },
    { label: "Quantit\u00e0 residua", value: model.outputs.remainingFlyers > 0 ? formatNumberIT(model.outputs.remainingFlyers) : null },
    { label: "Quantit\u00e0 mancante", value: model.outputs.missingFlyers > 0 ? formatNumberIT(model.outputs.missingFlyers) : null },
  ]);
  const qExplanation = quantityExplanation(model);
  if (qExplanation) paragraph(w, qExplanation);
  if (model.outputs.coverageStatus === "partial") paragraph(w, "Hai scelto di continuare con copertura parziale.");

  w.ensure(190);
  section(w, "3. Comuni nel raggio / distribuzione", "Selezione e copertura territoriale");
  if (model.municipalities.length) {
    table(w, ["Comune", "Stato", "Volantini allocati", "Copertura con quantit\u00e0 inserita", "Contributo selezione"], model.municipalities.map(m => {
      const notSelected = String(m.status || "").toLowerCase().includes("non selezionato");
      return [
        m.name,
        m.status,
        !notSelected && m.estimatedFlyers != null ? formatNumberIT(m.estimatedFlyers) : "-",
        !notSelected && m.coveragePct != null ? formatPercentIT(m.coveragePct) : "-",
        !notSelected && m.contributionPct != null ? formatPercentIT(m.contributionPct) : "-",
      ];
    }), [108, 132, 84, 106, 81]);
  } else {
    paragraph(w, "Dettaglio comuni non disponibile.");
  }

  section(w, "4. Indicatori servizio", "KPI operativi della stima");
  kvGrid(w, model.scores.map(s => ({ label: s.label, value: `${s.value}/100 - ${s.description || ""}` })));

  section(w, "5. AdminInfo / ISTAT summary", "Sintesi demografica ed economica");
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

  section(w, "7. Preventivo e costo", "Calcolo economico stimato");
  table(w, ["Voce", "Quantit\u00e0", "Prezzo unitario", "Totale"], [...model.pricing.lines.map(l => [
      l.label,
      l.quantity ? `${formatNumberIT(l.quantity)} volantini` : "-",
      l.unitPrice ? formatCurrencyIT(l.unitPrice, 4) : "-",
      formatCurrencyIT(l.total),
    ]),...(model.pricing.extras || []).map(e => [
      e.label,
      String(e.label || "").toLowerCase().includes("ai") ? "1 report" : "1 servizio",
      formatCurrencyIT(e.amount),
      formatCurrencyIT(e.amount),
    ]),...(model.pricing.discounts || []).map(d => [d.label, "-", "-", `-${formatCurrencyIT(d.amount)}`]),
  ], [210, 115, 105, 80]);
  w.ensure(54);
  w.rect(PAGE.margin, w.y - 40, PAGE.w - PAGE.margin * 2, 40, "1 0.97 0.93", "0.99 0.73 0.45");
  w.textAt("Totale stimato", PAGE.margin + 12, w.y - 25, 12, COLORS.ink, "F2");
  w.textAt(formatCurrencyIT(model.pricing.total), PAGE.w - PAGE.margin - 120, w.y - 25, 16, COLORS.orange, "F2");
  w.move(54);

  section(w, "8. Fonti dati", "Origine dei dati utilizzati");
  paragraph(w, model.sources.join(" - ") || "Fonti non disponibili");

  const disclaimer = "Il presente documento \u00e8 una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili. Il preventivo pu\u00f2 essere soggetto a conferma operativa.";
  w.pages.forEach((commands, idx) => {
    const pageLabel = `VolantiniPro \u00b7 Preventivo stimato \u00b7 Pagina ${idx + 1}/${w.pages.length}`;
    if (idx === w.pages.length - 1) {
      wrap(disclaimer, 112).forEach((line, lineIdx) => {
        commands.push(`BT /F1 7 Tf ${COLORS.muted} rg ${PAGE.margin} ${28 - lineIdx * 9} Td ${pdfText(line)} Tj ET`);
      });
      commands.push(`BT /F1 7 Tf ${COLORS.muted} rg ${PAGE.w - PAGE.margin - 72} 18 Td ${pdfText(`${idx + 1}/${w.pages.length}`)} Tj ET`);
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
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "volantinipro-preventivo.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return blob;
}
