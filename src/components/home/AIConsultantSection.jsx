import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AIConsultantService } from "../../lib/aiProvider.js";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const CARDS_CONFIG = [
  { id: "zone", icon: "📍", title: "Analizza la mia zona", desc: "Verifica copertura stimata, famiglie raggiungibili, opportunità e criticità del tuo comune o quartiere." },
  { id: "budget", icon: "💰", title: "Ottimizza il mio budget", desc: "Ricevi consigli sulle quantità di volantini ideali e scopri possibili risparmi logistici." },
  { id: "best_zones", icon: "🗺️", title: "Suggerisci le zone migliori", desc: "Scopri le aree prioritarie ad alta concentrazione di famiglie compatibili con il tuo obiettivo." },
  { id: "schedule", icon: "📅", title: "Quando distribuire", desc: "Trova i giorni della settimana più efficaci e le opportunità di abbinamento Smart Pairing." },
  { id: "estimate", icon: "📄", title: "Spiega il preventivo", desc: "Traduci i numeri del preventivatore in consigli pratici e indicazioni chiare di copertura." },
  { id: "report", icon: "📊", title: "Analizza il report finale", desc: "Ottieni una sintesi operativa di fine campagna con suggerimenti per i successivi passaggi." },
  { id: "kpi", icon: "❓", title: "Spiegami i dati", desc: "Chiedi all'AI il significato di Copertura, Famiglie ISTAT, GPS, Report e Smart Pairing." },
];

export default function AIConsultantSection() {
  const [activeCard, setActiveCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Form states per le interazioni
  const [zoneForm, setZoneForm] = useState({ comune: "Milano", quartiere: "Centro", cap: "20121" });
  const [budgetForm, setBudgetForm] = useState({ type: "budget", val: "500" });
  const [estimateForm, setEstimateForm] = useState({ qty: "10.000", service: "Door to Door" });
  const [kpiSelected, setKpiSelected] = useState("Copertura");

  const handleOpenCard = async (cardId) => {
    setActiveCard(cardId);
    setResult(null);
    setLoading(true);

    try {
      if (cardId === "best_zones") {
        const res = await AIConsultantService.suggestBestZones();
        setResult(res);
      } else if (cardId === "schedule") {
        const res = await AIConsultantService.suggestSchedule();
        setResult(res);
      } else if (cardId === "report") {
        const res = await AIConsultantService.analyzeReport();
        setResult(res);
      } else if (cardId === "kpi") {
        const res = await AIConsultantService.explainKpi("Copertura");
        setResult(res);
      }
    } catch (e) {
      console.error("Errore consulente AI:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitZone = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await AIConsultantService.analyzeZone(zoneForm);
    setResult(res);
    setLoading(false);
  };

  const handleSubmitBudget = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await AIConsultantService.optimizeBudget({ inputType: budgetForm.type, value: budgetForm.val });
    setResult(res);
    setLoading(false);
  };

  const handleSubmitEstimate = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await AIConsultantService.explainEstimate(estimateForm);
    setResult(res);
    setLoading(false);
  };

  const handleSelectKpi = async (kpiName) => {
    setKpiSelected(kpiName);
    setLoading(true);
    const res = await AIConsultantService.explainKpi(kpiName);
    setResult(res);
    setLoading(false);
  };

  return (
    <section className="section" style={{ background: "#0B1020", padding: "80px 28px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", color: "#F8FAFC" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header Sezione */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.3)", color: C_ORANGE, fontFamily: F.sans, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 16 }}
          >
            <span>🤖</span> CONSULENTE VOLANTINIPRO AI
          </motion.div>
          <h2 style={{ fontFamily: F.serif, fontSize: 46, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-1.2px", marginBottom: 14 }}>
            🤖 Consulente VolantiniPro AI
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: "#94A3B8", maxWidth: 640, margin: "0 auto 32px", lineHeight: 1.6 }}>
            Lascia che il nostro assistente analizzi automaticamente la tua campagna e ti suggerisca la soluzione più efficace.
          </p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleOpenCard("zone")}
            style={{ padding: "14px 32px", borderRadius: 12, background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)", color: "#FFFFFF", fontFamily: F.sans, fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(232, 87, 26, 0.35)" }}
          >
            Prova il Consulente AI
          </motion.button>
        </div>

        {/* Bento Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 40 }}>
          {CARDS_CONFIG.map((card, idx) => {
            const isActive = activeCard === card.id;
            return (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.2, delay: idx * 0.04 }}
                onClick={() => handleOpenCard(card.id)}
                whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.5)" }}
                style={{
                  background: isActive ? "#18263D" : "#122036",
                  border: isActive ? `2px solid ${C_ORANGE}` : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "28px 24px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 14 }}>{card.icon}</div>
                <h3 style={{ fontFamily: F.serif, fontSize: 22, color: "#F8FAFC", marginBottom: 10 }}>{card.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 14, color: "#94A3B8", lineHeight: 1.5, margin: 0, flex: 1 }}>{card.desc}</p>
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 6, color: C_ORANGE, fontFamily: F.sans, fontSize: 13, fontWeight: 700 }}>
                  <span>Chiedi al consulente</span>
                  <span>→</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Pannello interattivo di risposta AI */}
        <AnimatePresence>
          {activeCard && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ background: "#18263D", border: "1px solid rgba(232, 87, 26, 0.3)", borderRadius: 24, padding: "36px", position: "relative" }}>
                <button
                  onClick={() => setActiveCard(null)}
                  style={{ position: "absolute", top: 24, right: 24, background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.15)", color: "#CBD5E1", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "grid", placeItems: "center" }}
                >
                  ✕
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <span style={{ fontSize: 28 }}>{CARDS_CONFIG.find((c) => c.id === activeCard)?.icon}</span>
                  <h3 style={{ fontFamily: F.serif, fontSize: 28, color: "#F8FAFC", margin: 0 }}>
                    {CARDS_CONFIG.find((c) => c.id === activeCard)?.title}
                  </h3>
                </div>

                {/* Contenuto specifico per card */}
                {activeCard === "zone" && (
                  <form onSubmit={handleSubmitZone} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                    <input
                      type="text"
                      value={zoneForm.comune}
                      onChange={(e) => setZoneForm({ ...zoneForm, comune: e.target.value })}
                      placeholder="Comune"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={zoneForm.quartiere}
                      onChange={(e) => setZoneForm({ ...zoneForm, quartiere: e.target.value })}
                      placeholder="Quartiere o Zona"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={zoneForm.cap}
                      onChange={(e) => setZoneForm({ ...zoneForm, cap: e.target.value })}
                      placeholder="CAP (opzionale)"
                      style={inputStyle}
                    />
                    <button type="submit" style={btnStyle}>Analizza zona</button>
                  </form>
                )}

                {activeCard === "budget" && (
                  <form onSubmit={handleSubmitBudget} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                    <select
                      value={budgetForm.type}
                      onChange={(e) => setBudgetForm({ ...budgetForm, type: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="budget">Budget (in €)</option>
                      <option value="qty">Numero Volantini</option>
                    </select>
                    <input
                      type="number"
                      value={budgetForm.val}
                      onChange={(e) => setBudgetForm({ ...budgetForm, val: e.target.value })}
                      placeholder="Valore"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="submit" style={btnStyle}>Ottimizza ora</button>
                  </form>
                )}

                {activeCard === "estimate" && (
                  <form onSubmit={handleSubmitEstimate} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                    <select
                      value={estimateForm.service}
                      onChange={(e) => setEstimateForm({ ...estimateForm, service: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="Door to Door">Door to Door</option>
                      <option value="Hand to Hand">Hand to Hand</option>
                      <option value="Business Distribution">Business Distribution</option>
                    </select>
                    <input
                      type="text"
                      value={estimateForm.qty}
                      onChange={(e) => setEstimateForm({ ...estimateForm, qty: e.target.value })}
                      placeholder="Quantità stimata"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="submit" style={btnStyle}>Spiega preventivo</button>
                  </form>
                )}

                {activeCard === "kpi" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                    {["Copertura", "Famiglie", "Zone", "GPS", "ISTAT", "Report", "Smart Pairing"].map((kpi) => (
                      <button
                        key={kpi}
                        type="button"
                        onClick={() => handleSelectKpi(kpi)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 20,
                          border: kpiSelected === kpi ? `1px solid ${C_ORANGE}` : "1px solid rgba(255, 255, 255, 0.15)",
                          background: kpiSelected === kpi ? "rgba(232, 87, 26, 0.15)" : "transparent",
                          color: kpiSelected === kpi ? C_ORANGE : "#CBD5E1",
                          fontFamily: F.sans,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {kpi}
                      </button>
                    ))}
                  </div>
                )}

                {/* Box Risposta */}
                {loading ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontFamily: F.sans }}>
                    ⚡ L'assistente AI sta analizzando i dati...
                  </div>
                ) : result ? (
                  <div style={{ background: "#122036", borderRadius: 16, padding: "24px", borderLeft: `4px solid ${C_ORANGE}` }}>
                    <h4 style={{ fontFamily: F.serif, fontSize: 22, color: "#F8FAFC", marginTop: 0, marginBottom: 12 }}>{result.title}</h4>
                    <p style={{ fontFamily: F.sans, fontSize: 16, color: "#E2E8F0", lineHeight: 1.6, marginBottom: 16 }}>{result.summary}</p>

                    {result.metrics && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                        {result.metrics.map((m, i) => (
                          <div key={i} style={{ background: "rgba(255,255,255,0.04)", padding: "12px 16px", borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: "#94A3B8" }}>{m.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C_ORANGE }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.details && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
                        {result.details.map((d, i) => (
                          <div key={i} style={{ background: "rgba(255,255,255,0.04)", padding: "12px 16px", borderRadius: 10 }}>
                            <div style={{ fontSize: 12, color: "#94A3B8" }}>{d.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#F8FAFC" }}>{d.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.zones && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                        {result.zones.map((z, i) => (
                          <div key={i} style={{ background: "rgba(255,255,255,0.04)", padding: "14px 16px", borderRadius: 10 }}>
                            <div style={{ color: C_ORANGE, fontWeight: 800, fontSize: 13 }}>{z.rank} · {z.name}</div>
                            <div style={{ fontSize: 14, color: "#CBD5E1", marginTop: 4 }}>{z.motivation}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.schedule && (
                      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                        {result.schedule.map((s, i) => (
                          <div key={i} style={{ background: "rgba(255,255,255,0.04)", padding: "12px 16px", borderRadius: 10 }}>
                            <strong style={{ color: C_ORANGE }}>{s.label}: </strong>
                            <span style={{ color: "#CBD5E1" }}>{s.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.findings && (
                      <ul style={{ paddingLeft: 20, color: "#CBD5E1", marginBottom: 16, lineHeight: 1.6 }}>
                        {result.findings.map((f, i) => <li key={i} style={{ marginBottom: 6 }}>{f}</li>)}
                      </ul>
                    )}

                    {result.criticalities && (
                      <div style={{ marginBottom: 12, color: "#FCA5A5", fontSize: 14 }}>
                        <strong>⚠️ Attenzione: </strong> {result.criticalities}
                      </div>
                    )}

                    {result.opportunities && (
                      <div style={{ marginBottom: 12, color: "#86EFAC", fontSize: 14 }}>
                        <strong>💡 Opportunità: </strong> {result.opportunities}
                      </div>
                    )}

                    {result.explanation && (
                      <div style={{ marginBottom: 12, color: "#CBD5E1", fontSize: 14, fontStyle: "italic" }}>
                        💬 {result.explanation}
                      </div>
                    )}

                    {result.advice && (
                      <div style={{ marginBottom: 12, color: "#CBD5E1", fontSize: 14 }}>
                        🎯 <strong>Consiglio: </strong> {result.advice}
                      </div>
                    )}

                    {result.whyItMatters && (
                      <div style={{ marginBottom: 12, color: "#CBD5E1", fontSize: 14 }}>
                        📌 <strong>Perché è importante: </strong> {result.whyItMatters}
                      </div>
                    )}

                    {/* Nota orientativa obbligatoria (Regola 3) */}
                    {result.note && (
                      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                        ℹ️ {result.note}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

const inputStyle = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid rgba(255, 255, 255, 0.15)",
  background: "rgba(0, 0, 0, 0.25)",
  color: "#F8FAFC",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  outline: "none",
};

const btnStyle = {
  padding: "12px 24px",
  borderRadius: 10,
  background: "#E8571A",
  color: "#FFFFFF",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};
