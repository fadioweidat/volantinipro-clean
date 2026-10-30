import React from "react";
import { BUSINESS_CONFIRMATION, BUSINESS_MACRO_TARGETS, ON_PROJECT_LABEL } from "../../../../lib/business/businessOnProject.js";

const formatDateDisplay = iso => String(iso).split("-").reverse().join("/");
const FONT = "'DM Sans', Inter, system-ui, sans-serif";
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "#fff", fontFamily: FONT, fontSize: 14 };
const panelStyle = { padding: 20, borderRadius: 16, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)" };

function targetsLabel(targets = []) {
  const labels = BUSINESS_MACRO_TARGETS.filter(macro => macro.values.some(value => targets.includes(value))).map(macro => macro.label);
  return labels.join(", ") || "Da definire";
}

function amountLabel(data) {
  if (data.businessDefinitionMode === "activities") return `${Number(data.businessTargetCount || 0).toLocaleString("it-IT", { useGrouping: "always" })} attività`;
  return `${Number(data.businessMaterialQuantity || 0).toLocaleString("it-IT", { useGrouping: "always" })} volantini`;
}

/** Fine del percorso Business: riepilogo delle risposte e invio, senza prezzo. */
export function Step4BusinessRequest({ data, clientForm, setClientForm, canConfirm, confirmProblem, savingCampaign, saveError, saveNotice, sent, onConfirm, onBack, onViewMap, onHome }) {
  const rows = [
    ["Comune o zona", data.businessZone || data.cityName || "Da definire"],
    ["Attività da raggiungere", targetsLabel(data.distributionTargets)],
    ["Quantità", amountLabel(data)],
    ["Quando", data.startDate ? `Dal ${formatDateDisplay(data.startDate)}` : "Prima possibile"],
    ["Stampa", data.hasFlyers === "no" ? "Sì" : "No, volantini già pronti"],
    ["Importo", ON_PROJECT_LABEL],
  ];
  if (data.selectedOperationalPois?.length) rows.splice(2, 0, ["Attività scelte sulla mappa", String(data.selectedOperationalPois.length)]);

  if (sent) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "56px 20px 120px", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Richiesta inviata</h1>
        <p role="status" style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,.78)", margin: "0 0 26px" }}>{BUSINESS_CONFIRMATION}.</p>
        <button type="button" onClick={onHome} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "#E8571A", color: "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Torna alla home</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 120px", fontFamily: FONT, color: "#fff" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Riepilogo richiesta</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,.65)", margin: "0 0 20px" }}>Controlla le risposte e inviaci la richiesta: prepariamo noi la proposta.</p>

      <div style={{ ...panelStyle, marginBottom: 14 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 14 }}>
            <span style={{ color: "rgba(255,255,255,.58)" }}>{label}</span>
            <strong style={{ textAlign: "right" }}>{value}</strong>
          </div>
        ))}
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.72)" }}>{BUSINESS_CONFIRMATION}.</p>
      </div>

      <button type="button" onClick={onViewMap} style={{ width: "100%", padding: 12, marginBottom: 14, borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "#fff", fontFamily: FONT, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
        Vedi le attività sulla mappa (facoltativo)
      </button>

      <div style={{ ...panelStyle, display: "grid", gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>I tuoi dati</h2>
        <input type="text" aria-label="Nome" autoComplete="name" placeholder="Nome *" value={clientForm.nome} onChange={event => setClientForm({ ...clientForm, nome: event.target.value })} style={inputStyle} />
        <input type="email" aria-label="Email" autoComplete="email" placeholder="Email *" value={clientForm.email} onChange={event => setClientForm({ ...clientForm, email: event.target.value })} style={inputStyle} />
        <input type="tel" aria-label="Telefono" autoComplete="tel" placeholder="Telefono" value={clientForm.telefono} onChange={event => setClientForm({ ...clientForm, telefono: event.target.value })} style={inputStyle} />
        <input type="text" aria-label="Azienda" autoComplete="organization" placeholder="Azienda (opzionale)" value={clientForm.azienda} onChange={event => setClientForm({ ...clientForm, azienda: event.target.value })} style={inputStyle} />
        {saveError && <div role="alert" style={{ color: "#FCA5A5", fontSize: 13 }}>{saveError}</div>}
        {saveNotice && <div role="status" style={{ color: "rgba(255,255,255,.65)", fontSize: 13 }}>{saveNotice}</div>}
        {!canConfirm && confirmProblem && <div role="alert" style={{ color: "#FCA5A5", fontSize: 13 }}>{confirmProblem}</div>}
        <button type="button" onClick={onConfirm} disabled={!canConfirm || savingCampaign} style={{ padding: 14, borderRadius: 10, border: "none", background: "#E8571A", color: "#fff", fontFamily: FONT, fontSize: 15, fontWeight: 800, cursor: !canConfirm || savingCampaign ? "not-allowed" : "pointer", opacity: !canConfirm || savingCampaign ? 0.6 : 1 }}>
          {savingCampaign ? "Invio in corso…" : "Invia la richiesta"}
        </button>
      </div>

      <button type="button" onClick={onBack} style={{ marginTop: 14, padding: 10, border: "none", background: "transparent", color: "rgba(255,255,255,.65)", fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>← Torna allo Step 1</button>
    </div>
  );
}
