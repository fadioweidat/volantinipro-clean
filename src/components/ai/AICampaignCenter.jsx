import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AIConsultantService } from "../../lib/aiProvider.js";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { navy: "#0B1020", navyCard: "#122036", navyActive: "#18263D", white: "#F8FAFC", muted: "#94A3B8", orange: "#E8571A", border: "rgba(255, 255, 255, 0.08)" };

export default function AICampaignCenter({ context = "home" }) {
  const [activeTab, setActiveTab] = useState("pre");
  const [loading, setLoading] = useState(false);
  const [preData, setPreData] = useState(null);
  const [duringData, setDuringData] = useState(null);
  const [postData, setPostData] = useState(null);
  const [improveData, setImproveData] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  // Modale "Perché questo consiglio?" (Blocco 2)
  const [whyReasoning, setWhyReasoning] = useState(null);
  const [loadingWhy, setLoadingWhy] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [pre, during, post, imp, cmp] = await Promise.all([
        AIConsultantService.analyzePreCampaign(),
        AIConsultantService.analyzeDuringCampaign(),
        AIConsultantService.analyzePostCampaign(),
        AIConsultantService.getImprovementSuggestions(),
        AIConsultantService.compareScenarios()
      ]);
      setPreData(pre);
      setDuringData(during);
      setPostData(post);
      setImproveData(imp);
      setCompareData(cmp);
    } catch (e) {
      console.error("Errore caricamento AI Campaign Center:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWhy = async (whyId) => {
    setLoadingWhy(true);
    try {
      const res = await AIConsultantService.explainReasoning(whyId);
      setWhyReasoning(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWhy(false);
    }
  };

  const handleLoadHistory = async () => {
    setActiveTab("history");
    setLoading(true);
    const h = await AIConsultantService.getAIHistory();
    setHistoryData(h);
    setLoading(false);
  };

  return (
    <section className="section" style={{ background: C.navy, padding: "80px 28px", borderTop: `1px solid ${C.border}`, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Intestazione */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.3)", color: C.orange, fontFamily: F.sans, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 16 }}>
            <span>📊</span> AI CAMPAIGN CENTER · CENTRO DECISIONALE
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: 44, color: C.white, letterSpacing: "-1.2px", marginBottom: 14 }}>
            Il tuo consulente operativo lungo tutto il ciclo di vita
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: C.muted, maxWidth: 680, margin: "0 auto 10px", lineHeight: 1.6 }}>
            L'assistente non prende decisioni al posto tuo: ti spiega i dati, ti suggerisce le opzioni migliori e risponde sempre alla domanda <strong style={{ color: C.white }}>"Perché mi consigli questa scelta?"</strong>.
          </p>
          <p style={{ fontFamily: F.sans, fontSize: 12, color: "#64748B", maxWidth: 560, margin: "0 auto", lineHeight: 1.6, fontStyle: "italic" }}>
            Suggerimenti automatici da regole interne su testi predefiniti, non un modello di intelligenza artificiale generativa.
          </p>
        </div>

        {/* Tab di Navigazione Lifecycle */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginBottom: 40 }}>
          {[
            { id: "pre", label: "🚀 Prima della Campagna", desc: "Sintesi & Scenari" },
            { id: "during", label: "📡 Durante la Campagna", desc: "Live Tracking Semplice" },
            { id: "post", label: "🏆 Dopo la Campagna", desc: "Bilancio & Raccomandazioni" },
            { id: "history", label: "📜 Cronologia Consigli", desc: "Storico decisionale" }
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => tab.id === "history" ? handleLoadHistory() : setActiveTab(tab.id)}
                style={{
                  padding: "14px 24px",
                  borderRadius: 14,
                  border: active ? `2px solid ${C.orange}` : `1px solid ${C.border}`,
                  background: active ? C.navyActive : C.navyCard,
                  color: active ? C.white : C.muted,
                  fontFamily: F.sans,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  transition: "all 0.2s ease"
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: active ? C.white : "#CBD5E1" }}>{tab.label}</span>
                <span style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{tab.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Contenuto Principale Dashboard */}
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: C.muted, fontFamily: F.sans, fontSize: 16 }}>
            ⚡ Elaborazione consulenziale in corso...
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* TAB 1: PRIMA DELLA CAMPAGNA (Blocchi 1, 5, 6) */}
            {activeTab === "pre" && preData && compareData && improveData && (
              <motion.div
                key="pre"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}
              >
                {/* Blocco 1: Sintesi Decisionale */}
                <div style={cardStyle}>
                  <div style={badgeStyle}>BLOCCO 1 · ANALISI PRELIMINARE</div>
                  <h3 style={titleStyle}>{preData.title}</h3>
                  <p style={descStyle}>{preData.summary}</p>
                  <div style={{ background: "rgba(232, 87, 26, 0.08)", borderLeft: `4px solid ${C.orange}`, padding: "16px", borderRadius: 8, marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>💡 Consiglio del consulente:</div>
                    <div style={{ fontSize: 14, color: "#E2E8F0", lineHeight: 1.5 }}>{preData.advice}</div>
                  </div>
                  <button onClick={() => handleOpenWhy(preData.whyId)} style={whyBtnStyle}>
                    ❓ Perché questo consiglio? Scopri il ragionamento →
                  </button>
                  <div style={noteStyle}>ℹ️ {preData.note}</div>
                </div>

                {/* Blocco 6: Confronto Scenari */}
                <div style={cardStyle}>
                  <div style={badgeStyle}>BLOCCO 6 · CONFRONTO SCENARI</div>
                  <h3 style={titleStyle}>{compareData.title}</h3>
                  <p style={descStyle}>{compareData.summary}</p>
                  <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
                    {compareData.scenarios.map((sc) => (
                      <div key={sc.id} style={{ padding: 14, borderRadius: 12, background: sc.recommended ? "rgba(232, 87, 26, 0.15)" : "rgba(255,255,255,0.03)", border: sc.recommended ? `1px solid ${C.orange}` : "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <strong style={{ color: C.white, fontSize: 15 }}>{sc.name}</strong>
                          <span style={{ color: C.orange, fontWeight: 800, fontSize: 16 }}>{sc.cost}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#CBD5E1", marginBottom: 6 }}>
                          <span>📦 <strong>{sc.qty}</strong></span>
                          <span>🎯 <strong>{sc.cov}</strong></span>
                        </div>
                        <div style={{ fontSize: 13, color: C.muted }}>{sc.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 14, fontStyle: "italic", color: "#E2E8F0", marginBottom: 16 }}>
                    🎯 {compareData.aiRecommendation}
                  </div>
                  <button onClick={() => handleOpenWhy("pre_increment")} style={whyBtnStyle}>
                    ❓ Perché consigliamo lo Scenario B?
                  </button>
                  <div style={noteStyle}>ℹ️ {compareData.note}</div>
                </div>

                {/* Blocco 5: Cosa Migliorare */}
                <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                  <div style={badgeStyle}>BLOCCO 5 · COSA MIGLIORARE (SENZA UPSELLING NON MOTIVATO)</div>
                  <h3 style={titleStyle}>{improveData.title}</h3>
                  <p style={descStyle}>{improveData.summary}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
                    {improveData.suggestions.map((sug, i) => (
                      <div key={i} style={{ padding: 18, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 8 }}>⚡ {sug.action}</div>
                          <div style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 16 }}><strong>Beneficio: </strong>{sug.benefit}</div>
                        </div>
                        <button onClick={() => handleOpenWhy(sug.whyId)} style={{ ...whyBtnStyle, width: "100%", textAlign: "center", margin: 0 }}>
                          ❓ Perché questo suggerimento?
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={noteStyle}>ℹ️ {improveData.note}</div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: DURANTE LA CAMPAGNA (Blocco 3) */}
            {activeTab === "during" && duringData && (
              <motion.div
                key="during"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                style={{ maxWidth: 800, margin: "0 auto" }}
              >
                <div style={cardStyle}>
                  <div style={badgeStyle}>BLOCCO 3 · TRACKING IN CORSO TRADOTTO IN LINGUAGGIO SEMPLICE</div>
                  <h3 style={titleStyle}>{duringData.title}</h3>
                  <p style={descStyle}>{duringData.summary}</p>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                    {duringData.metrics.map((m, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.04)", padding: "16px", borderRadius: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: C.orange }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "rgba(134, 239, 172, 0.08)", borderLeft: "4px solid #86EFAC", padding: "18px", borderRadius: 10, marginBottom: 24, fontSize: 15, color: "#F8FAFC", lineHeight: 1.6 }}>
                    💬 <strong>Spiegazione automatica: </strong> {duringData.discursive}
                  </div>

                  <button onClick={() => handleOpenWhy(duringData.whyId)} style={whyBtnStyle}>
                    ❓ Perché è importante monitorare queste tempistiche? →
                  </button>
                  <div style={noteStyle}>ℹ️ {duringData.note}</div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: DOPO LA CAMPAGNA (Blocco 4) */}
            {activeTab === "post" && postData && (
              <motion.div
                key="post"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                style={{ maxWidth: 800, margin: "0 auto" }}
              >
                <div style={cardStyle}>
                  <div style={badgeStyle}>BLOCCO 4 · BILANCIO & CONSIGLI PER IL FUTURO</div>
                  <h3 style={titleStyle}>{postData.title}</h3>
                  <p style={descStyle}>{postData.summary}</p>

                  <ul style={{ paddingLeft: 20, color: "#CBD5E1", marginBottom: 24, lineHeight: 1.7, fontSize: 15 }}>
                    {postData.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>

                  <div style={{ background: "rgba(232, 87, 26, 0.1)", border: `1px solid ${C.orange}`, padding: "20px", borderRadius: 12, marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, marginBottom: 6 }}>🎯 Raccomandazione operativa per la prossima campagna:</div>
                    <div style={{ fontSize: 15, color: C.white, lineHeight: 1.5 }}>{postData.futureAdvice}</div>
                  </div>

                  <button onClick={() => handleOpenWhy(postData.whyId)} style={whyBtnStyle}>
                    ❓ Perché ti suggeriamo di anticipare la prossima uscita? →
                  </button>
                  <div style={noteStyle}>ℹ️ {postData.note}</div>
                </div>
              </motion.div>
            )}

            {/* TAB 4: CRONOLOGIA (Blocco 7) */}
            {activeTab === "history" && historyData && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                style={{ maxWidth: 800, margin: "0 auto" }}
              >
                <div style={cardStyle}>
                  <div style={badgeStyle}>BLOCCO 7 · CRONOLOGIA DECISIONALE PERSISTENTE</div>
                  <h3 style={titleStyle}>{historyData.title}</h3>
                  <p style={descStyle}>{historyData.summary}</p>

                  {historyData.items && historyData.items.length > 0 ? (
                    <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
                      {historyData.items.map((it) => (
                        <div key={it.id} style={{ padding: "16px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: C.orange, textTransform: "uppercase" }}>{it.type}</span>
                            <span style={{ fontSize: 12, color: C.muted }}>{it.timestamp}</span>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.white, marginBottom: 4 }}>{it.title}</div>
                          <div style={{ fontSize: 14, color: "#CBD5E1" }}>{it.summary}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Nessun consiglio salvato in questa sessione.</div>
                  )}

                  <div style={noteStyle}>🔒 {historyData.note}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* MODALE / DRAWER "PERCHÉ QUESTO CONSIGLIO?" (Blocco 2) */}
        <AnimatePresence>
          {whyReasoning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", zIndex: 9999, display: "grid", placeItems: "center", padding: 20 }}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                style={{ background: "#18263D", border: `2px solid ${C.orange}`, borderRadius: 24, padding: "36px", maxWidth: 600, width: "100%", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
              >
                <button
                  onClick={() => setWhyReasoning(null)}
                  style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.white, width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}
                >
                  ✕
                </button>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                  🧠 BLOCCO 2 · TRASPARENZA & MOTIVAZIONE
                </div>
                <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, marginBottom: 16 }}>{whyReasoning.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 15, color: "#CBD5E1", marginBottom: 20 }}>
                  Ecco la checklist del ragionamento consulenziale che ha portato a questo suggerimento operativo:
                </p>
                
                <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
                  {whyReasoning.checklist && whyReasoning.checklist.map((reason, idx) => (
                    <div key={idx} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.05)", color: "#F8FAFC", fontSize: 15, fontWeight: 700 }}>
                      {reason}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                  ℹ️ {whyReasoning.note}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

const cardStyle = {
  background: "#122036",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 20,
  padding: "32px",
  display: "flex",
  flexDirection: "column"
};

const badgeStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#E8571A",
  letterSpacing: ".12em",
  textTransform: "uppercase",
  marginBottom: 10
};

const titleStyle = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: 26,
  color: "#F8FAFC",
  marginBottom: 12
};

const descStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 15,
  color: "#94A3B8",
  lineHeight: 1.6,
  marginBottom: 20
};

const whyBtnStyle = {
  padding: "12px 18px",
  borderRadius: 10,
  background: "rgba(232, 87, 26, 0.15)",
  border: "1px solid #E8571A",
  color: "#E8571A",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.2s ease",
  alignSelf: "flex-start",
  marginBottom: 16
};

const noteStyle = {
  marginTop: "auto",
  paddingTop: 16,
  borderTop: "1px solid rgba(255, 255, 255, 0.06)",
  fontSize: 12,
  color: "#94A3B8",
  fontStyle: "italic"
};
