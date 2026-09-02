function fmt(n, dec = 0) {
  if (n == null || n === "") return null;
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  return num.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function cur(n, dec = 2) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

function pct(n) {
  if (n == null || n === "") return null;
  return `${fmt(n)}%`;
}

function kv(label, value) {
  if (value == null || value === "" || value === false) return "";
  return `<div class="kv-item"><div class="kv-label">${label}</div><div class="kv-value">${value}</div></div>`;
}

function secHeader(num, title, subtitle) {
  return `
    <div class="sec-header">
      <div class="sec-title"><span class="sec-num">${num}</span>${title}</div>
      ${subtitle ? `<div class="sec-sub">${subtitle}</div>` : ""}
    </div>`;
}

function aiBlocks(d) {
  const out = d.outputs || {};
  const area = d.area || {};
  const mainArea = area.mainArea || "l'area selezionata";
  const sel = (d.municipalities || [])
    .filter(m => !String(m.status || "").toLowerCase().includes("non selezionato"))
    .map(m => m.name);
  const avail = (d.municipalities || [])
    .filter(m => String(m.status || "").toLowerCase().includes("non selezionato"))
    .map(m => m.name);
  const ins = Number(out.insertedFlyers || 0);
  const rec = Number(out.recommendedFlyers || 0);
  const sufficient = rec > 0 && ins >= rec;
  const scores = d.scores || [];
  const family = scores.find(s => String(s.label || "").toLowerCase().includes("family"))?.value;
  const confidence = scores.find(s => String(s.label || "").toLowerCase().includes("confidence"))?.value;

  const blocks = [];

  if (out.estimatedFamilies || out.estimatedPopulation) {
    const strength = family == null ? "valutabile" : family >= 75 ? "forte" : family >= 58 ? "buono" : "da ottimizzare";
    blocks.push({
      title: "Valutazione generale",
      text: `${mainArea} presenta un potenziale residenziale <strong>${strength}</strong>${out.estimatedFamilies ? `, con <strong>${Number(out.estimatedFamilies).toLocaleString("it-IT")}</strong> famiglie stimate` : ""}${out.estimatedPopulation ? ` e <strong>${Number(out.estimatedPopulation).toLocaleString("it-IT")}</strong> persone stimate` : ""}.${family != null ? ` Family Index: <strong>${family}/100</strong>.` : ""}`,
    });
  }

  if (ins && rec) {
    blocks.push({
      title: "Copertura e quantità",
      text: sufficient
        ? `La quantità inserita di <strong>${ins.toLocaleString("it-IT")}</strong> volantini è sufficiente rispetto ai <strong>${rec.toLocaleString("it-IT")}</strong> consigliati. Restano <strong>${(ins - rec).toLocaleString("it-IT")}</strong> volantini disponibili.`
        : `Per raggiungere la copertura stimata servono <strong>${rec.toLocaleString("it-IT")}</strong> volantini. La quantità inserita di <strong>${ins.toLocaleString("it-IT")}</strong> copre solo parte dell'area: mancano <strong>${(rec - ins).toLocaleString("it-IT")}</strong> volantini.`,
    });
  }

  if (sel.length || avail.length) {
    blocks.push({
      title: "Lettura territoriale",
      text: `Zona principale: <strong>${mainArea}</strong>${sel.length ? `; comuni selezionati: ${sel.join(", ")}` : ""}${avail.length ? `; nel raggio non selezionati: ${avail.slice(0, 4).join(", ")}` : ""}.`,
    });
  }

  const actions = sufficient
    ? [
        "Confermare la copertura dell'area selezionata.",
        ...(avail.length ? [`Valutare estensione verso ${avail[0]}.`] : []),
        "Mantenere una scorta operativa per recuperi o zone ad alta densità.",
      ]
    : [
        `Aumentare la quantità di ${(rec - ins).toLocaleString("it-IT")} volantini per copertura stimata.`,
        "Ridurre il raggio o limitare la selezione ai comuni prioritari.",
        "Confermare copertura parziale se l'obiettivo è una distribuzione più mirata.",
      ];
  if (d.planning?.smartPairingApplied) actions.push("Usare lo Smart Pairing disponibile per ridurre il costo della distribuzione.");
  blocks.push({ title: "Azioni consigliate", bullets: actions });

  if (confidence != null) {
    blocks.push({
      title: "Livello di affidabilità",
      text: `Confidence Score: <strong>${confidence}/100</strong>. Indica quanto la stima è supportata dai dati territoriali disponibili e dalla coerenza della selezione area/quantità.`,
    });
  }

  return blocks
    .map(
      b => `
    <div class="ai-block">
      <div class="ai-block-title">${b.title}</div>
      ${b.text ? `<div class="callout">${b.text}</div>` : ""}
      ${b.bullets ? `<ul class="ai-list">${b.bullets.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
    </div>`
    )
    .join("");
}

function slug(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function printQuotePdf(rawData) {
  const d = rawData || {};
  const genDate = new Date(d.generatedAt || Date.now()).toLocaleDateString("it-IT");
  const quoteId = d.quoteId || `VP-${genDate.replace(/\D/g, "")}`;
  const isoDate = new Date(d.generatedAt || Date.now()).toISOString().slice(0, 10);
  const filename = `VolantiniPro-Preventivo-${slug(d.service)}-${slug((d.area || {}).mainArea)}-${isoDate}`;
  const campaign = d.campaign || {};
  const area = d.area || {};
  const outputs = d.outputs || {};
  const planning = d.planning || {};
  const pricing = d.pricing || {};
  const contact = d.contact || {};
  const client = d.client || {};
  const ins = Number(outputs.insertedFlyers || 0);
  const rec = Number(outputs.recommendedFlyers || 0);
  const covPct = rec && ins ? Math.min(100, Math.round((ins / rec) * 100)) : null;
  const secAI = d.aiAnalysis?.enabled;
  let secIdx = 0;
  const nextSec = () => ++secIdx;

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${filename}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11px; color: #1a1a1a; background: #fff; line-height: 1.5;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 15mm 14mm 18mm 14mm; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; break-before: page; }
  }
  .page { max-width: 740px; margin: 0 auto; padding: 32px 0 40px; }

  /* Header */
  .doc-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 18px; border-bottom: 2.5px solid #E8571A; margin-bottom: 22px;
  }
  .brand { font-size: 24px; font-weight: 900; color: #E8571A; letter-spacing: -0.5px; }
  .brand-sub { font-size: 10.5px; color: #6b7280; margin-top: 2px; }
  .brand-contact { margin-top: 6px; font-size: 9px; color: #9ca3af; line-height: 1.5; }
  .brand-contact span { display: block; }
  .doc-meta { text-align: right; }
  .status-badge {
    display: inline-block; background: #FFF3ED; color: #E8571A;
    font-size: 9.5px; font-weight: 700; padding: 3px 10px;
    border-radius: 20px; border: 1px solid rgba(232,87,26,0.25); margin-bottom: 7px;
  }
  .meta-table { font-size: 10px; color: #6b7280; border-collapse: collapse; }
  .meta-table td { padding: 1px 0 1px 14px; }
  .meta-table td:first-child { color: #9ca3af; }

  /* Title */
  .doc-title { margin-bottom: 22px; }
  .doc-title h1 { font-size: 19px; font-weight: 800; color: #111827; }
  .doc-title p { font-size: 10.5px; color: #6b7280; margin-top: 4px; }

  /* Sections */
  .section { margin-bottom: 22px; }
  .sec-header { margin-bottom: 10px; padding-bottom: 7px; border-bottom: 1.5px solid #e5e7eb; }
  .sec-title {
    font-size: 13px; font-weight: 700; color: #111827;
    display: flex; align-items: center; gap: 8px;
  }
  .sec-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 21px; height: 21px; background: #E8571A; color: #fff;
    font-size: 10px; font-weight: 800; border-radius: 50%; flex-shrink: 0;
  }
  .sec-sub { font-size: 9.5px; color: #9ca3af; margin-top: 4px; padding-left: 29px; }

  /* KV grid */
  .kv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
  .kv-grid-2 { grid-template-columns: repeat(2, 1fr); }
  .kv-grid-4 { grid-template-columns: repeat(4, 1fr); }
  .kv-item {
    background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;
    overflow: hidden;
  }
  .kv-label { font-size: 8.5px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .kv-value { font-size: 11.5px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Callout */
  .callout {
    background: #FFF8F5; border: 1px solid #FFDCC8; border-left: 3px solid #E8571A;
    border-radius: 6px; padding: 9px 13px; font-size: 10.5px; color: #374151; margin: 8px 0 4px;
  }

  /* Table */
  .data-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .data-table thead tr { background: #f3f4f6; }
  .data-table thead th {
    padding: 7px 9px; text-align: left; font-weight: 700; color: #374151;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .data-table tbody tr { border-bottom: 1px solid #f3f4f6; }
  .data-table tbody tr:last-child { border-bottom: none; }
  .data-table tbody td { padding: 7px 9px; color: #374151; }
  .data-table tbody tr:nth-child(even) { background: #fafafa; }
  .badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 7px; border-radius: 10px; }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-orange { background: #FFF3ED; color: #E8571A; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }

  /* AI */
  .ai-block { margin-bottom: 14px; }
  .ai-block-title {
    font-size: 11px; font-weight: 700; color: #111827;
    padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; margin-bottom: 7px;
  }
  .ai-list { padding-left: 18px; margin-top: 6px; }
  .ai-list li { font-size: 10.5px; color: #374151; margin-bottom: 4px; }

  /* Pricing */
  .price-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .price-table thead tr { background: #f3f4f6; }
  .price-table thead th { padding: 8px 12px; text-align: left; font-weight: 700; color: #374151; font-size: 10px; }
  .price-table thead th:last-child, .price-table tbody td:last-child { text-align: right; }
  .price-table tbody td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
  .price-table tbody td:last-child { font-weight: 600; }
  .price-table .row-discount td { color: #16a34a; }
  .price-table .row-extra td { color: #6b7280; font-style: italic; }
  .total-box {
    background: #FFF8F5; border: 1.5px solid #FFDCC8; border-radius: 8px;
    padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-top: 12px;
  }
  .total-label { font-size: 13px; font-weight: 700; color: #374151; }
  .total-note { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .total-amount { font-size: 28px; font-weight: 900; color: #E8571A; }

  /* Sources */
  .sources-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .sources-list span { background: #f3f4f6; border-radius: 4px; padding: 3px 9px; font-size: 10px; color: #6b7280; }

  /* Footer */
  .doc-footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; line-height: 1.6; }

  /* Print bar */
  .print-bar {
    position: fixed; bottom: 24px; right: 24px; display: flex; gap: 10px; z-index: 100;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
  }
  .btn-print {
    background: #E8571A; color: #fff; border: none; border-radius: 8px;
    padding: 12px 22px; font-size: 13px; font-weight: 700; cursor: pointer;
  }
  .btn-close {
    background: #fff; color: #374151; border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 12px 22px; font-size: 13px; font-weight: 700; cursor: pointer;
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="doc-header">
    <div>
      <div class="brand">VolantiniPro</div>
      <div class="brand-sub">Preventivo campagna di distribuzione</div>
      <div class="brand-contact">
        ${contact.site ? `<span>${contact.site}</span>` : ""}
        ${contact.email ? `<span>${contact.email}</span>` : ""}
        ${contact.phone ? `<span>Tel. ${contact.phone}</span>` : ""}
        ${contact.vat ? `<span>P.IVA ${contact.vat}</span>` : ""}
        ${contact.legalName ? `<span>${contact.legalName}</span>` : ""}
        ${contact.address ? `<span>${contact.address}</span>` : ""}
      </div>
    </div>
    <div class="doc-meta">
      <div class="status-badge">${d.status || "Preventivo stimato"}</div>
      <table class="meta-table">
        <tr><td>Riferimento</td><td><strong>${quoteId}</strong></td></tr>
        <tr><td>Data</td><td>${genDate}</td></tr>
        <tr><td>Servizio</td><td>${d.service || "—"}</td></tr>
        ${d.validUntil ? `<tr><td>Validità</td><td>${new Date(d.validUntil).toLocaleDateString("it-IT")}</td></tr>` : ""}
      </table>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">
    <h1>Preventivo campagna ${d.service || ""}</h1>
    <p>Riepilogo operativo generato da VolantiniPro · ${area.mainArea || ""}</p>
  </div>

  <!-- Dati cliente -->
  ${(client.name || client.company || client.email || client.phone) ? `
  <div class="section">
    ${secHeader(nextSec(), "Dati cliente", "Intestatario del preventivo")}
    <div class="kv-grid">
      ${kv("Nome", client.name)}
      ${kv("Azienda", client.company)}
      ${kv("Email", client.email)}
      ${kv("Telefono", client.phone)}
    </div>
  </div>` : ""}

  <!-- 1. Configurazione campagna -->
  <div class="section">
    ${secHeader(nextSec(), "Configurazione campagna", "Dati selezionati nella configurazione")}
    <div class="kv-grid">
      ${kv("Servizio", d.service)}
      ${kv("Variante", campaign.variant)}
      ${kv("Zona principale", area.mainArea)}
      ${kv("Modalità area", area.areaMode)}
      ${kv("Raggio", campaign.radiusKm ? `${fmt(campaign.radiusKm, 1)} km` : (area.radiusKm ? `${fmt(area.radiusKm, 1)} km` : null))}
      ${kv("Quantità volantini", fmt(campaign.quantity))}
      ${kv("Formato", campaign.format)}
      ${kv("Grammatura", campaign.grammage)}
      ${kv("Carta", campaign.paperType)}
      ${kv("Orientamento", campaign.orientation)}
      ${kv("Lati", campaign.sides)}
      ${kv("Colore", campaign.color)}
      ${kv("Materiale", campaign.materialStatus)}
      ${kv("Grafica", campaign.graphicStatus)}
      ${kv("Piano", campaign.plan)}
      ${campaign.campaignsPerMonth ? kv("Campagne/mese", fmt(campaign.campaignsPerMonth)) : ""}
      ${campaign.duration ? kv("Durata", campaign.duration) : ""}
    </div>
  </div>

  <!-- 2. Analisi zona -->
  <div class="section">
    ${secHeader(nextSec(), "Analisi zona e output servizio", "Dati territoriali e operativi")}
    <div class="kv-grid">
      ${kv("Comune / zona", area.mainArea)}
      ${kv("CAP selezionati", (area.selectedCaps || []).join(", ") || null)}
      ${kv("Raggio analisi", area.radiusKm ? `${fmt(area.radiusKm, 1)} km` : null)}
      ${kv("Superficie coperta", area.coveredAreaKm2 ? `${fmt(area.coveredAreaKm2, 1)} km²` : null)}
      ${kv("Comuni selezionati", (area.selectedMunicipalities || []).join(", ") || null)}
      ${kv("Modalità selezione", area.selectionMode)}
      ${kv("Famiglie stimate", fmt(outputs.estimatedFamilies))}
      ${kv("Popolazione stimata", fmt(outputs.estimatedPopulation))}
      ${kv("Copertura potenziale", pct(outputs.estimatedCoverage))}
      ${kv("Copertura con quantità", pct(covPct))}
      ${kv("Volantini consigliati", fmt(outputs.recommendedFlyers))}
      ${kv("Stato copertura", outputs.coverageStatus === "sufficient" ? "Sufficiente" : "Parziale")}
    </div>
    ${ins && rec ? `<div class="callout" style="margin-top:10px">${
      ins >= rec
        ? `La quantità inserita di <strong>${fmt(ins)}</strong> volantini è sufficiente rispetto ai <strong>${fmt(rec)}</strong> consigliati. Restano <strong>${fmt(ins - rec)}</strong> volantini disponibili.`
        : `La quantità inserita di <strong>${fmt(ins)}</strong> copre solo parte dell'area. Mancano <strong>${fmt(rec - ins)}</strong> volantini per la copertura stimata.`
    }</div>` : ""}
  </div>

  <!-- 3. Sintesi zone (solo selezionate; il dettaglio completo resta nel Report Territoriale) -->
  ${(() => {
    const selM = (d.municipalities || []).filter(m => !String(m.status || "").toLowerCase().includes("non selezionato"));
    if (!selM.length) return "";
    const shown = selM.slice(0, 8);
    const more = selM.length - shown.length;
    return `
  <div class="section">
    ${secHeader(nextSec(), "Sintesi zone", "Zone incluse nel preventivo")}
    <div class="callout" style="margin:0 0 8px">${selM.length} ${selM.length === 1 ? "zona selezionata" : "zone selezionate"}${outputs.estimatedFamilies ? ` · ${fmt(outputs.estimatedFamilies)} famiglie stimate` : ""}${covPct != null ? ` · copertura ${pct(covPct)}` : ""}. Il dettaglio territoriale completo (NIL/quartieri, KPI e fonti) è disponibile nel Report Territoriale.</div>
    <table class="data-table">
      <thead><tr><th>Zona</th><th>Stato</th><th>Volantini allocati</th><th>Copertura</th></tr></thead>
      <tbody>
        ${shown.map(m => {
          const badgeCls = String(m.status || "").includes("completa") ? "badge-green" : "badge-orange";
          return `<tr>
            <td><strong>${m.name}</strong></td>
            <td><span class="badge ${badgeCls}">${m.status}</span></td>
            <td>${m.estimatedFlyers != null ? fmt(m.estimatedFlyers) : "—"}</td>
            <td>${m.coveragePct != null ? pct(m.coveragePct) : "—"}</td>
          </tr>`;
        }).join("")}
        ${more > 0 ? `<tr><td colspan="4" style="color:#9ca3af">+ ${more} altre zone — vedi Report Territoriale</td></tr>` : ""}
      </tbody>
    </table>
  </div>`;
  })()}

  <!-- Servizi inclusi nel preventivo (solo quelli realmente acquistati) -->
  ${(pricing.services || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Servizi inclusi nel preventivo", "Voci realmente selezionate")}
    <table class="data-table">
      <tbody>
        ${(pricing.services || []).map(s => `<tr>
          <td><strong>${s.label}</strong></td>
          <td style="text-align:right">${s.amount == null ? "—" : (s.indicative ? "~" : "") + cur(s.amount)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  <!-- Admin info -->
  ${(d.adminInfo || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Sintesi demografica ed economica", "Dati ISTAT e territoriali")}
    <div class="kv-grid">
      ${(d.adminInfo || []).map(i => kv(i.label, i.value)).join("")}
    </div>
  </div>` : ""}

  <!-- AI Analysis -->
  ${secAI ? `
  <div class="section page-break">
    ${secHeader(nextSec(), "Analisi AI della campagna", "Sintesi automatica basata su configurazione, zona e KPI")}
    ${aiBlocks(d)}
  </div>` : ""}

  <!-- Pianificazione -->
  <div class="section">
    ${secHeader(nextSec(), "Pianificazione campagna", "Date e vantaggi disponibili")}
    <div class="kv-grid kv-grid-2">
      ${kv("Date selezionate", (planning.selectedDates || []).join(", ") || null)}
      ${kv("Smart Pairing", planning.smartPairingApplied ? `Sconto −${pct(planning.smartPairingDiscountPct)}` : "Non disponibile")}
      ${kv("Zona compatibile", planning.compatibleZone)}
      ${kv("Disponibilità", planning.availabilityLabel)}
    </div>
    ${!planning.smartPairingApplied ? `<div class="callout" style="margin-top:10px">Smart Pairing non disponibile per questa configurazione.</div>` : ""}
  </div>

  <!-- Preventivo -->
  <div class="section">
    ${secHeader(nextSec(), "Preventivo e costo", "Calcolo economico stimato")}
    <table class="price-table">
      <thead><tr><th>Voce</th><th>Quantità</th><th>Prezzo unitario</th><th>Totale</th></tr></thead>
      <tbody>
        ${(pricing.lines || []).map(l => `<tr>
          <td>${l.label}</td>
          <td>${l.quantity ? fmt(l.quantity) + " volantini" : "—"}</td>
          <td>${l.unitPrice ? cur(l.unitPrice, 4) : "—"}</td>
          <td>${cur(l.total)}</td>
        </tr>`).join("")}
        ${(pricing.extras || []).map(e => `<tr class="row-extra">
          <td>${e.label}</td><td>1 servizio</td><td>${cur(e.amount)}</td><td>${cur(e.amount)}</td>
        </tr>`).join("")}
        ${(pricing.discounts || []).map(disc => `<tr class="row-discount">
          <td>${disc.label}</td><td>—</td><td>—</td><td>−${cur(disc.amount)}</td>
        </tr>`).join("")}
        ${pricing.printingLine ? `<tr class="row-extra">
          <td>${pricing.printingLine.label}${pricing.printingLine.note ? ` — ${pricing.printingLine.note}` : ""}</td><td>—</td><td>—</td><td>~${cur(pricing.printingLine.amount)}</td>
        </tr>` : ""}
        ${pricing.graphicLine ? `<tr class="row-extra">
          <td>${pricing.graphicLine.label}${pricing.graphicLine.note ? ` — ${pricing.graphicLine.note}` : ""}</td><td>—</td><td>—</td><td>${pricing.graphicLine.amount == null ? "—" : cur(pricing.graphicLine.amount)}</td>
        </tr>` : ""}
      </tbody>
    </table>
    ${pricing.printingLine ? `<div class="callout" style="margin-top:8px">Stampa indicativa ~${cur(pricing.printingLine.amount)} — da confermare con la tipografia. È inclusa nel totale complessivo qui sotto.</div>` : ""}
    <div class="total-box">
      <div>
        <div class="total-label">Totale complessivo</div>
        <div class="total-note">IVA esclusa · soggetto a conferma finale · nessun pagamento anticipato${pricing.printingLine ? " · stampa indicativa da confermare con la tipografia" : ""}</div>
      </div>
      <div class="total-amount">${cur(pricing.grandTotal != null ? pricing.grandTotal : pricing.total)}</div>
    </div>
  </div>

  <!-- Fonti -->
  ${(d.sources || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Fonti dati", "Origine dei dati utilizzati")}
    <div class="sources-list">${(d.sources || []).map(s => `<span>${s}</span>`).join("")}</div>
  </div>` : ""}

  <!-- Footer -->
  <div class="doc-footer">
    Il presente documento è una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili.
    Il preventivo può essere soggetto a conferma operativa. · ${[contact.site, contact.email || "info@volantinipro.it", contact.phone ? `Tel. ${contact.phone}` : null].filter(Boolean).join(" · ")} · ${quoteId}
  </div>

</div>

<div class="print-bar no-print">
  <button class="btn-close" onclick="window.close()">Chiudi</button>
  <button class="btn-print" onclick="window.print()">⬇ Salva come PDF</button>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=920,height=780,menubar=no,toolbar=no");
  if (!win) { alert("Abilita i popup per scaricare il PDF."); return; }
  win.document.write(html);
  win.document.close();
}
