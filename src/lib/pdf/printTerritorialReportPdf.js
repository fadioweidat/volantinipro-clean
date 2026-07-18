// Stesso pattern di ./printQuotePdf.js: nessuna libreria PDF, HTML + window.print().
// Contenuto diverso (report territoriale, non preventivo), stile visivo identico per coerenza.

function fmt(n) {
  if (n == null || n === "") return null;
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  return num.toLocaleString("it-IT");
}

function secHeader(num, title, subtitle) {
  return `
    <div class="sec-header">
      <div class="sec-title"><span class="sec-num">${num}</span>${title}</div>
      ${subtitle ? `<div class="sec-sub">${subtitle}</div>` : ""}
    </div>`;
}

function slug(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function kpiStrip(items) {
  const real = (items || []).filter((k) => k && !k.unavailable);
  if (real.length === 0) return "";
  return `<div class="stat-strip">${real.map((k) => `
    <div class="stat-item">
      <div class="stat-label">${k.label}</div>
      <div class="stat-value">${k.value}${k.unit ? ` ${k.unit}` : ""}</div>
    </div>`).join("")}</div>`;
}

function barRows(rows) {
  if (!rows || rows.length === 0) return "";
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return `<div class="bar-list">${rows.map((r) => `
    <div class="bar-row">
      <span class="bar-label">${r.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.round((Number(r.value) || 0) / max * 100))}%"></div></div>
      <span class="bar-value">${r.valueLabel != null ? r.valueLabel : (fmt(r.value) ?? "—")}</span>
    </div>`).join("")}</div>`;
}

function table(columns, rows) {
  if (!rows || rows.length === 0) return "";
  return `<table class="data-table"><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : (r[c.key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function printTerritorialReportPdf(rawData) {
  const d = rawData || {};
  const genDate = new Date(d.generatedAt || Date.now()).toLocaleDateString("it-IT");
  const isoDate = new Date(d.generatedAt || Date.now()).toISOString().slice(0, 10);
  const filename = `VolantiniPro-Report-Territoriale-${slug(d.service)}-${slug(d.territoryLabel)}-${isoDate}`;
  let secIdx = 0;
  const nextSec = () => ++secIdx;

  const sections = [];

  sections.push(`
    <div class="section">
      ${secHeader(nextSec(), "Panoramica", d.territoryLabel)}
      ${kpiStrip(d.overviewKpis)}
    </div>`);

  if (d.quantity) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Copertura e quantità", d.quantity.subtitle)}
        ${barRows(d.quantity.bars)}
      </div>`);
  }

  if (d.topZones && Array.isArray(d.topZones.rows) && d.topZones.rows.length > 0) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Zone prioritarie")}
        ${table(d.topZones.columns, d.topZones.rows)}
      </div>`);
  }

  if (d.demographics) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Demografia e fabbisogno operativo")}
        ${kpiStrip([
          { label: "Popolazione residente", value: fmt(d.demographics.totalPopulation) || "Dato non disponibile" },
          { label: "Famiglie residenti — livello Comune", value: fmt(d.demographics.totalHouseholds) || "Dato non disponibile" },
          { label: "Densità abitativa", value: d.demographics.profileDens ? `${fmt(d.demographics.profileDens)} ab./km²` : "Dato non disponibile" },
        ])}
        ${d.demographics.operationalRequirementExplanation ? `<div class="note">${d.demographics.operationalRequirementExplanation}</div>` : ""}
      </div>`);
  }

  if (d.economy) {
    const omiRows = Array.isArray(d.economy.omiRows) ? d.economy.omiRows : [];
    const omiMeta = d.economy.omiMeta || {};
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Economia e OMI")}
        <div class="note"><b>OMI:</b> ${omiMeta.zoneCount != null ? `${fmt(omiMeta.zoneCount)} zone rappresentate` : "numero zone non restituito"}${omiMeta.zoneNames ? ` (${omiMeta.zoneNames})` : ""}. ${omiMeta.aggregationLabel || "Metodo di aggregazione non restituito"}. ${omiMeta.period ? `Periodo: ${omiMeta.period}. ` : ""}Limite geografico: zona OMI, non singolo civico.</div>
        ${omiRows.length ? table([
          { label: "Tipologia", key: "typology" },
          { label: "Valore min", key: "min_value", render: (r) => r.min_value != null ? `${fmt(r.min_value)} €/mq` : "Dato non disponibile" },
          { label: "Valore max", key: "max_value", render: (r) => r.max_value != null ? `${fmt(r.max_value)} €/mq` : "Dato non disponibile" },
        ], omiRows) : `<div class="note">Dato OMI non disponibile per questa zona.</div>`}
      </div>`);
  }

  if (d.serviceAnalysis && d.serviceAnalysis.rows && d.serviceAnalysis.rows.length > 0) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), d.serviceAnalysis.title || "Analisi di servizio")}
        ${table(d.serviceAnalysis.columns, d.serviceAnalysis.rows)}
      </div>`);
  }

  if (d.score) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Score operativo", d.score.label)}
        <div class="stat-strip"><div class="stat-item"><div class="stat-label">Score ${d.score.serviceTitle || ""}</div><div class="stat-value">${d.score.pct}/100</div></div></div>
        <div class="note">${d.score.note || ""}</div>
      </div>`);
  }

  if (d.recommendation) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Raccomandazione operativa")}
        <p class="body-text">${d.recommendation.strategy || ""}</p>
        ${d.recommendation.priorityZones ? `<p class="body-text"><b>Zone prioritarie:</b> ${d.recommendation.priorityZones}</p>` : ""}
        ${d.recommendation.criticalities ? `<p class="body-text"><b>Criticità:</b> ${d.recommendation.criticalities}</p>` : ""}
      </div>`);
  }

  if (d.sources && d.sources.length > 0) {
    sections.push(`
      <div class="section">
        ${secHeader(nextSec(), "Fonti e metodologia")}
        ${table([
          { label: "Indicatore", key: "name" }, { label: "Provider/dataset", key: "source" },
          { label: "Livello", key: "level" }, { label: "Periodo", key: "year" },
          { label: "Tipo", key: "kind" }, { label: "Affidabilità", key: "reliability" },
          { label: "Stato", key: "status" },
        ], d.sources)}
        ${d.sources.map((source) => `<div class="note"><b>${source.name} — metodo:</b> ${source.method || "Dato non disponibile"}<br/><b>Limiti:</b> ${source.limitation || "Nessuna limitazione dichiarata"}</div>`).join("")}
      </div>`);
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; line-height: 1.5; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 15mm 14mm 18mm 14mm; }
    .no-print { display: none !important; }
  }
  .page { max-width: 700px; margin: 0 auto; padding: 22px 0 28px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2.5px solid #E8571A; margin-bottom: 14px; }
  .brand { font-size: 22px; font-weight: 900; color: #E8571A; letter-spacing: -0.5px; }
  .brand-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-meta { text-align: right; font-size: 10px; color: #6b7280; }
  .doc-title { margin-bottom: 14px; }
  .doc-title h1 { font-size: 17px; font-weight: 800; color: #111827; }
  .doc-title p { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .section { margin-bottom: 16px; }
  .sec-header { margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1.5px solid #e5e7eb; }
  .sec-title { font-size: 12px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 7px; }
  .sec-num { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; background: #E8571A; color: #fff; font-size: 9.5px; font-weight: 800; border-radius: 50%; flex-shrink: 0; }
  .sec-sub { font-size: 9px; color: #9ca3af; margin-top: 3px; padding-left: 26px; }
  .stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  .stat-item { background: #FFF8F5; border: 1px solid #FFDCC8; border-radius: 7px; padding: 9px 12px; }
  .stat-label { font-size: 8.5px; font-weight: 600; color: #b45309; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .stat-value { font-size: 17px; font-weight: 900; color: #E8571A; line-height: 1.15; }
  .bar-list { display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-label { width: 210px; flex-shrink: 0; font-size: 9.5px; color: #4b5563; line-height: 1.25; }
  .bar-track { flex: 1; height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: #E8571A; border-radius: 4px; }
  .bar-value { width: 80px; flex-shrink: 0; text-align: right; font-size: 10px; font-weight: 700; color: #111827; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  .data-table th { text-align: left; padding: 5px 7px; color: #9ca3af; text-transform: uppercase; font-size: 8px; border-bottom: 1px solid #e5e7eb; overflow-wrap: anywhere; }
  .data-table td { padding: 5px 7px; border-bottom: 1px solid #f3f4f6; color: #1f2937; overflow-wrap: anywhere; vertical-align: top; }
  .body-text { font-size: 10.5px; color: #374151; margin-bottom: 6px; line-height: 1.55; }
  .note { font-size: 9.5px; color: #6b7280; margin-top: 8px; }
  .print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #111827; padding: 12px 20px; display: flex; justify-content: center; gap: 12px; }
  .print-bar button { background: #E8571A; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; }
</style>
</head>
<body>
  <div class="page">
    <div class="doc-header">
      <div><div class="brand">VolantiniPro</div><div class="brand-sub">ANALISI TERRITORIALE AVANZATA</div></div>
      <div class="doc-meta">Generato il ${genDate}<br/>${d.service || ""}</div>
    </div>
    <div class="doc-title"><h1>${d.territoryLabel || "Territorio selezionato"}</h1><p>Report professionale basato sui dati territoriali disponibili, sulle fonti collegate e sui modelli di analisi specifici per il servizio selezionato.${d.modeLabel ? ` ${d.modeLabel}` : ""}</p></div>
    ${sections.join("\n")}
  </div>
  <div class="print-bar no-print"><button onclick="window.print()">Scarica report PDF</button></div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=920,height=780,scrollbars=yes");
  if (!win) {
    alert("Abilita i popup per scaricare il report.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = filename;
  return { ok: true, filename, window: win };
}
