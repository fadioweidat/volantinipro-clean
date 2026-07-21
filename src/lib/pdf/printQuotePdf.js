function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const AREA_MODE_LABELS = {
  full_municipality: "Comune completo",
  comune: "Comune completo",
  radius: "Raggio da centro",
  cap: "Ricerca per CAP",
};

function areaModeLabel(mode) {
  if (!mode) return null;
  if (AREA_MODE_LABELS[mode]) return AREA_MODE_LABELS[mode];
  // Valore interno non ancora mappato: mostralo in forma leggibile invece
  // del token tecnico grezzo, senza inventare un'etichetta specifica.
  return escapeHtml(String(mode).replace(/_/g, " ")).replace(/^\w/, (c) => c.toUpperCase());
}

// Dati aziendali per il footer: solo valori reali gia usati altrove nel
// prodotto (VITE_INTESTATARIO e' la stessa variabile usata per il
// bonifico bancario; email/sito sono il dominio gia in uso in altri punti
// dell'app, es. "info@volantinipro.it"). Nessun dato inventato: dove non
// esiste una fonte reale, placeholder marcato esplicitamente da compilare.
const COMPANY = {
  name: (typeof import.meta !== "undefined" && import.meta.env?.VITE_INTESTATARIO) || "VolantiniPro Srl",
  vat: "[DA COMPILARE: P.IVA]",
  address: "[DA COMPILARE: Indirizzo sede legale]",
  phone: "[DA COMPILARE: Telefono]",
  email: "info@volantinipro.it",
  website: "www.volantinipro.it",
};

function fmt(n, dec = 0) {
  if (n == null || n === "") return null;
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  return num.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function cur(n, dec = 2) {
  return `€ ${Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
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
  const business = d.business || null;
  const isBusiness = Boolean(business);
  const ins = Number(outputs.insertedFlyers || 0);
  const rec = Number(outputs.recommendedFlyers || 0);
  const covPct = rec && ins ? Math.min(100, Math.round((ins / rec) * 100)) : null;
  // Stessa aliquota/formula gia usata nel box "Il tuo investimento" dello
  // Step 4 (total * 0.22): pricing.total e il medesimo valore "total" che
  // alimenta quel box, nessuna formula duplicata o ricalcolata qui.
  const ivaAmount = Number(pricing.total || 0) * 0.22;
  const totalWithIva = Number(pricing.total || 0) + ivaAmount;
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
  .page { max-width: 700px; margin: 0 auto; padding: 22px 0 28px; }

  /* Header */
  .doc-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 12px; border-bottom: 2.5px solid #E8571A; margin-bottom: 14px;
  }
  .brand { font-size: 22px; font-weight: 900; color: #E8571A; letter-spacing: -0.5px; }
  .brand-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-meta { text-align: right; }
  .status-badge {
    display: inline-block; background: #FFF3ED; color: #E8571A;
    font-size: 9.5px; font-weight: 700; padding: 3px 10px;
    border-radius: 20px; border: 1px solid rgba(232,87,26,0.25); margin-bottom: 6px;
  }
  .meta-table { font-size: 10px; color: #6b7280; border-collapse: collapse; }
  .meta-table td { padding: 1px 0 1px 14px; }
  .meta-table td:first-child { color: #9ca3af; }
  .validity-note { font-size: 9px; color: #9ca3af; margin-top: 4px; }

  /* Come procedere */
  .steps-box {
    background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 14px 16px; margin: 14px 0;
  }
  .steps-title { font-size: 11px; font-weight: 700; color: #111827; margin-bottom: 8px; }
  .steps-list { display: flex; flex-direction: column; gap: 6px; }
  .step-item { display: flex; gap: 8px; align-items: flex-start; font-size: 10.5px; color: #374151; line-height: 1.4; }
  .step-num {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 17px; height: 17px; background: #E8571A; color: #fff;
    font-size: 9px; font-weight: 800; border-radius: 50%;
  }

  /* Title */
  .doc-title { margin-bottom: 14px; }
  .doc-title h1 { font-size: 17px; font-weight: 800; color: #111827; }
  .doc-title p { font-size: 10px; color: #6b7280; margin-top: 3px; }

  /* Sections */
  .section { margin-bottom: 14px; }
  .sec-header { margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1.5px solid #e5e7eb; }
  .sec-title {
    font-size: 12px; font-weight: 700; color: #111827;
    display: flex; align-items: center; gap: 7px;
  }
  .sec-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 19px; height: 19px; background: #E8571A; color: #fff;
    font-size: 9.5px; font-weight: 800; border-radius: 50%; flex-shrink: 0;
  }
  .sec-sub { font-size: 9px; color: #9ca3af; margin-top: 3px; padding-left: 26px; }

  /* Stat strip (highlighted headline numbers) */
  .stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 8px; }
  .stat-item {
    background: #FFF8F5; border: 1px solid #FFDCC8; border-radius: 7px; padding: 9px 12px;
  }
  .stat-label { font-size: 8.5px; font-weight: 600; color: #b45309; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .stat-value { font-size: 19px; font-weight: 900; color: #E8571A; line-height: 1.15; }

  /* KV grid */
  .kv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .kv-grid-2 { grid-template-columns: repeat(2, 1fr); }
  .kv-grid-4 { grid-template-columns: repeat(4, 1fr); }
  .kv-item {
    background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 7px 9px;
    overflow: hidden;
  }
  .kv-label { font-size: 8.5px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .kv-value { font-size: 11px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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

  /* Pricing */
  .price-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .price-table thead tr { background: #f3f4f6; }
  .price-table thead th { padding: 7px 12px; text-align: left; font-weight: 700; color: #374151; font-size: 10px; }
  .price-table thead th:last-child, .price-table tbody td:last-child { text-align: right; }
  .price-table tbody td { padding: 7px 12px; border-bottom: 1px solid #f3f4f6; }
  .price-table tbody td:last-child { font-weight: 600; }
  .price-table .row-discount td { color: #16a34a; }
  .price-table .row-extra td { color: #6b7280; font-style: italic; }
  .total-box {
    background: #FFF8F5; border: 1.5px solid #FFDCC8; border-radius: 8px;
    padding: 14px 18px; margin-top: 10px;
  }
  .total-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: #6b7280; padding: 3px 0; }
  .total-row-final {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 8px; padding-top: 10px; border-top: 1px solid #FFDCC8;
  }
  .total-label { font-size: 13px; font-weight: 700; color: #374151; }
  .total-note { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .total-amount { font-size: 32px; font-weight: 900; color: #E8571A; }
  .differentiator-row {
    display: flex; align-items: center; gap: 6px; margin-top: 8px;
    font-size: 9.5px; color: #6b7280; font-style: italic;
  }

  /* Sources */
  .sources-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .sources-list span { background: #f3f4f6; border-radius: 4px; padding: 3px 9px; font-size: 10px; color: #6b7280; }

  /* Footer */
  .doc-footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; line-height: 1.6; }
  .company-footer { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; font-size: 9px; color: #9ca3af; line-height: 1.6; }
  .company-footer strong { color: #6b7280; }

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
    </div>
    <div class="doc-meta">
      <div class="status-badge">${d.status || "Preventivo stimato"}</div>
      <table class="meta-table">
        <tr><td>Riferimento</td><td><strong>${quoteId}</strong></td></tr>
        <tr><td>Data</td><td>${genDate}</td></tr>
        <tr><td>Servizio</td><td>${d.service || "—"}</td></tr>
      </table>
      <div class="validity-note">Preventivo valido 30 giorni dalla data di emissione</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">
    <h1>Preventivo campagna ${d.service || ""}</h1>
    <p>Riepilogo operativo generato da VolantiniPro · ${area.mainArea || ""}</p>
  </div>

  <!-- 1. Configurazione campagna -->
  <div class="section">
    ${secHeader(nextSec(), "Configurazione campagna", "Dati selezionati nella configurazione")}
    <div class="kv-grid">
      ${kv("Servizio", d.service)}
      ${kv("Variante", campaign.variant)}
      ${kv("Zona principale", area.mainArea)}
      ${kv(isBusiness ? "Materiali disponibili" : "Quantità volantini", fmt(campaign.quantity))}
      ${kv("Formato", campaign.format)}
      ${kv("Grammatura", campaign.grammage)}
      ${kv("Materiale", campaign.materialStatus)}
      ${kv("Grafica", campaign.graphicStatus === "Non specificato" ? "Materiale fornito dal cliente" : campaign.graphicStatus)}
      ${kv("Piano", campaign.plan)}
      ${campaign.campaignsPerMonth ? kv("Campagne/mese", fmt(campaign.campaignsPerMonth)) : ""}
      ${campaign.duration ? kv("Durata", campaign.duration) : ""}
      ${kv("Modalità area", areaModeLabel(area.areaMode))}
      ${isBusiness ? kv("Target Business", (business.targets || []).join(", ")) : ""}
      ${isBusiness ? kv("Obiettivo", business.objective) : ""}
      ${isBusiness ? kv("Consegna", business.deliveryMethod) : ""}
      ${isBusiness ? kv("Referente preferito", business.preferredRecipient) : ""}
    </div>
  </div>

  <!-- 2. Analisi zona -->
  <div class="section">
    ${secHeader(nextSec(), isBusiness ? "Piano attività e materiali" : "Analisi zona e output servizio", isBusiness ? "Selezione reale e calcolo operativo" : "Dati territoriali e operativi")}
    <div class="stat-strip">
      ${isBusiness ? `<div class="stat-item"><div class="stat-label">Attività selezionate</div><div class="stat-value">${fmt(outputs.selectedActivities)}</div></div>` : ""}
      ${isBusiness && outputs.materialsRequired != null ? `<div class="stat-item"><div class="stat-label">Materiali necessari</div><div class="stat-value">${fmt(outputs.materialsRequired)}</div></div>` : ""}
      ${isBusiness && business.operationalPlan?.operatorDays != null ? `<div class="stat-item"><div class="stat-label">Giornate-addetto</div><div class="stat-value">${fmt(business.operationalPlan.operatorDays)}</div></div>` : ""}
      ${outputs.estimatedFamilies ? `<div class="stat-item"><div class="stat-label">Famiglie stimate</div><div class="stat-value">${fmt(outputs.estimatedFamilies)}</div></div>` : ""}
      ${outputs.estimatedPopulation ? `<div class="stat-item"><div class="stat-label">Popolazione stimata</div><div class="stat-value">${fmt(outputs.estimatedPopulation)}</div></div>` : ""}
      ${covPct != null ? `<div class="stat-item"><div class="stat-label">Copertura con quantità</div><div class="stat-value">${pct(covPct)}</div></div>` : ""}
      ${campaign.quantity && !isBusiness ? `<div class="stat-item"><div class="stat-label">Quantità volantini</div><div class="stat-value">${fmt(campaign.quantity)}</div></div>` : ""}
    </div>
    <div class="kv-grid">
      ${kv("Comune / zona", area.mainArea)}
      ${kv("CAP selezionati", (area.selectedCaps || []).join(", ") || null)}
      ${kv("Raggio analisi", area.radiusKm ? `${fmt(area.radiusKm, 1)} km` : null)}
      ${kv("Superficie coperta", area.coveredAreaKm2 ? `${fmt(area.coveredAreaKm2, 1)} km²` : null)}
      ${kv("Comuni selezionati", (area.selectedMunicipalities || []).join(", ") || null)}
      ${kv("Modalità selezione", area.selectionMode)}
      ${isBusiness ? kv("Materiali residui", outputs.materialsRemaining != null ? fmt(outputs.materialsRemaining) : "Da definire") : kv("Copertura potenziale", pct(outputs.estimatedCoverage))}
      ${isBusiness ? kv("Materiali mancanti", outputs.materialsMissing != null ? fmt(outputs.materialsMissing) : "Da definire") : kv("Volantini consigliati", fmt(outputs.recommendedFlyers))}
      ${isBusiness ? kv("Addetti consigliati", business.operationalPlan?.recommendedOperators != null ? fmt(business.operationalPlan.recommendedOperators) : "Da definire") : kv("Stato copertura", outputs.coverageStatus === "sufficient" ? "Sufficiente" : "Parziale")}
    </div>
    ${!isBusiness && ins && rec ? `<div class="callout" style="margin-top:10px">${
      ins >= rec
        ? `La quantità inserita di <strong>${fmt(ins)}</strong> volantini è sufficiente rispetto ai <strong>${fmt(rec)}</strong> consigliati. Restano <strong>${fmt(ins - rec)}</strong> volantini disponibili.`
        : `La quantità inserita di <strong>${fmt(ins)}</strong> copre solo parte dell'area. Mancano <strong>${fmt(rec - ins)}</strong> volantini per la copertura stimata.`
    }</div>` : ""}
  </div>

  ${isBusiness && (business.selectedActivities || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Attività selezionate", "Copie previste e fonte del dato")}
    <table class="data-table">
      <thead><tr><th>Attività</th><th>Categoria</th><th>Indirizzo</th><th>Copie</th><th>Fonte</th></tr></thead>
      <tbody>${business.selectedActivities.map(item => `<tr><td><strong>${item.name || "Nome non disponibile"}</strong></td><td>${item.category || "—"}</td><td>${item.address || "Non disponibile"}</td><td>${item.copies != null ? fmt(item.copies) : "Da definire"}</td><td>${item.source || "Fonte collegata"}</td></tr>`).join("")}</tbody>
    </table>
    <div class="kv-grid" style="margin-top:8px">
      ${kv("Prove richieste", (business.proofs || []).join(", ") || "Nessuna prova aggiuntiva")}
      ${kv("Posizione materiale", business.materialLocation)}
      ${kv("Periodo preferito", business.preferredPeriod || "Da concordare")}
    </div>
  </div>` : ""}

  <!-- 3. Comuni -->
  ${!isBusiness && (d.municipalities || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Comuni nel raggio", "Selezione e copertura territoriale")}
    <table class="data-table">
      <thead><tr>
        <th>Comune</th><th>Stato</th><th>Volantini allocati</th><th>Copertura</th><th>Contributo</th>
      </tr></thead>
      <tbody>
        ${(d.municipalities || []).map(m => {
          const notSel = String(m.status || "").toLowerCase().includes("non selezionato");
          const badgeCls = notSel ? "badge-gray" : String(m.status || "").includes("completa") ? "badge-green" : "badge-orange";
          return `<tr>
            <td><strong>${m.name}</strong></td>
            <td><span class="badge ${badgeCls}">${m.status}</span></td>
            <td>${!notSel && m.estimatedFlyers != null ? fmt(m.estimatedFlyers) : "—"}</td>
            <td>${!notSel && m.coveragePct != null ? pct(m.coveragePct) : "—"}</td>
            <td>${!notSel && m.contributionPct != null ? pct(m.contributionPct) : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>` : ""}

  <!-- Indicatori interni /100 (Qualita area, Potenziale copertura,
       Efficienza campagna, Affidabilita stima) rimossi dal PDF: sono
       metriche senza contesto in un documento di vendita, restano
       disponibili nel Report Territoriale Avanzato online. -->

  <!-- 4. Admin info: solo i dati NON gia mostrati nella sezione 2
       (Analisi zona / Piano attivita e materiali), per evitare la
       duplicazione di famiglie/popolazione/superficie tra le due sezioni. -->
  ${(() => {
    const shownInSection2 = new Set(
      [area.mainArea, (area.selectedCaps || []).join(", "), area.radiusKm ? `${fmt(area.radiusKm, 1)} km` : null,
        area.coveredAreaKm2 ? `${fmt(area.coveredAreaKm2, 1)} km²` : null, (area.selectedMunicipalities || []).join(", "),
        area.selectionMode, outputs.estimatedFamilies ? fmt(outputs.estimatedFamilies) : null,
        outputs.estimatedPopulation ? fmt(outputs.estimatedPopulation) : null]
        .filter(Boolean)
    );
    const adminRows = (d.adminInfo || []).filter(i => i?.value != null && !shownInSection2.has(String(i.value)));
    return adminRows.length ? `
  <div class="section">
    ${secHeader(nextSec(), isBusiness ? "Dettagli operativi Business" : "Sintesi demografica ed economica")}
    <div class="kv-grid kv-grid-4">
      ${adminRows.slice(0, 8).map(i => kv(i.label, i.value)).join("")}
    </div>
  </div>` : "";
  })()}

  <!-- Pianificazione: sezione omessa del tutto quando non c'è nulla di
       disponibile da mostrare (mai la frase negativa "Smart Pairing non
       disponibile"), mostrata normalmente quando c'è contenuto reale. -->
  ${((planning.selectedDates || []).length || planning.smartPairingApplied) ? `
  <div class="section">
    ${secHeader(nextSec(), "Pianificazione campagna", planning.smartPairingApplied ? "Date e vantaggi disponibili" : "Date selezionate")}
    <div class="kv-grid kv-grid-2">
      ${kv("Date selezionate", (planning.selectedDates || []).join(", ") || null)}
      ${planning.smartPairingApplied ? kv("Smart Pairing", `Sconto −${pct(planning.smartPairingDiscountPct)}`) : ""}
      ${planning.smartPairingApplied ? kv("Zona compatibile", planning.compatibleZone) : ""}
    </div>
  </div>` : ""}

  <!-- Preventivo -->
  <div class="section">
    ${secHeader(nextSec(), "Preventivo e costo", "Calcolo economico stimato")}
    <table class="price-table">
      <thead><tr><th>Voce</th><th>Quantità</th><th>Prezzo unitario</th><th>Totale</th></tr></thead>
      <tbody>
        ${(pricing.lines || []).map(l => `<tr>
          <td>${l.label}</td>
          <td>${l.quantity ? fmt(l.quantity) + (isBusiness ? " materiali" : " volantini") : "—"}</td>
          <td>${l.unitPrice ? cur(l.unitPrice, 4) : "—"}</td>
          <td>${cur(l.total)}</td>
        </tr>`).join("")}
        ${(pricing.extras || []).map(e => `<tr class="row-extra">
          <td>${e.label}</td><td>1 servizio</td><td>${cur(e.amount)}</td><td>${cur(e.amount)}</td>
        </tr>`).join("")}
        ${(pricing.discounts || []).map(disc => `<tr class="row-discount">
          <td>${disc.label}</td><td>—</td><td>—</td><td>−${cur(disc.amount)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <div class="total-box">
      <div class="total-row"><span>Imponibile</span><span>${cur(pricing.total)}</span></div>
      <div class="total-row"><span>IVA 22%</span><span>${cur(ivaAmount)}</span></div>
      <div class="total-row-final">
        <div>
          <div class="total-label">Totale (IVA inclusa)</div>
          <div class="total-note">soggetto a conferma finale · nessun pagamento anticipato</div>
        </div>
        <div class="total-amount">${cur(totalWithIva)}</div>
      </div>
    </div>
    <div class="differentiator-row">Ogni distribuzione è tracciata GPS e documentata nel report finale.</div>
  </div>

  <!-- Fonti -->
  ${(d.sources || []).length ? `
  <div class="section">
    ${secHeader(nextSec(), "Fonti dati", "Origine dei dati utilizzati")}
    <div class="sources-list">${(d.sources || []).map(s => `<span>${s}</span>`).join("")}</div>
  </div>` : ""}

  <!-- Come procedere -->
  <div class="steps-box">
    <div class="steps-title">Come procedere</div>
    <div class="steps-list">
      <div class="step-item"><span class="step-num">1</span><span>Conferma il preventivo via email o dal portale</span></div>
      <div class="step-item"><span class="step-num">2</span><span>Concordiamo insieme le date operative entro 24 ore</span></div>
      <div class="step-item"><span class="step-num">3</span><span>A fine campagna ricevi il report con tracciamento GPS${
        (d.extras || []).some(e => e.id === "photo_proof") ? " e prove fotografiche" : ""
      }</span></div>
    </div>
  </div>

  <!-- Footer -->
  <div class="doc-footer">
    Il presente documento è una stima operativa generata da VolantiniPro sulla base dei dati inseriti e delle analisi territoriali disponibili.
    Il preventivo può essere soggetto a conferma operativa. · ${quoteId}
    <div class="company-footer">
      <strong>${escapeHtml(COMPANY.name)}</strong> · P.IVA ${escapeHtml(COMPANY.vat)} · ${escapeHtml(COMPANY.address)}<br>
      Tel. ${escapeHtml(COMPANY.phone)} · ${escapeHtml(COMPANY.email)} · ${escapeHtml(COMPANY.website)}
    </div>
  </div>

</div>

<div class="print-bar no-print">
  <button class="btn-close" onclick="window.close()">Chiudi</button>
  <button class="btn-print" onclick="window.print()">⬇ Scarica preventivo PDF</button>
</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=920,height=780,menubar=no,toolbar=no");
  if (!win) { alert("Abilita i popup per scaricare il PDF."); return; }
  win.document.write(html);
  win.document.close();
}
