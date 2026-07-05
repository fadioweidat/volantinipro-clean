import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AIConsultantService } from "../../lib/aiProvider.js";
import KpiTooltip, { KPI_DICTIONARY } from "../ui/KpiTooltip.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { navy: "#0B1020", navyCard: "#122036", navyActive: "#18263D", white: "#F8FAFC", muted: "#94A3B8", orange: "#E8571A", border: "rgba(255, 255, 255, 0.08)" };

export default function VolantiniProAIHub({ onConfigure }) {
  const [mainMode, setMainMode] = useState("dashboard"); // "dashboard" | "journey" | "timeline"
  const [activeTab, setActiveTab] = useState("pianifica"); // "pianifica" | "configura" | "monitora" | "analizza" | "impara"
  
  // Stati per chiamate e risultati AI
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [activeActionId, setActiveActionId] = useState(null);
  
  // Form stesura rapida
  const [zoneInput, setZoneInput] = useState({ comune: "Milano", quartiere: "Duomo / Navigli", cap: "20123" });
  const [budgetInput, setBudgetInput] = useState({ value: "650" });
  const [estimateInput, setEstimateInput] = useState({ qty: "10.000", service: "Door to Door" });
  
  // Modale "Perché questo consiglio?"
  const [whyModal, setWhyModal] = useState(null);
  const [loadingWhy, setLoadingWhy] = useState(false);

  // AI Guided Journey state
  const [journeyStep, setJourneyStep] = useState(1);
  const [journeyData, setJourneyData] = useState({ activity: "Ristorante / Pizzeria", location: "Milano Nord", qty: "10.000" });

  const handleRunAction = async (actionId) => {
    setActiveActionId(actionId);
    setLoading(true);
    setResultData(null);
    try {
      if (actionId === "analizza_zona") {
        const res = await AIConsultantService.analyzeZone(zoneInput);
        setResultData(res);
      } else if (actionId === "ottimizza_budget") {
        const res = await AIConsultantService.optimizeBudget({ inputType: "budget", value: Number(budgetInput.value) || 500 });
        setResultData(res);
      } else if (actionId === "zone_consigliate") {
        const res = await AIConsultantService.suggestBestZones();
        setResultData(res);
      } else if (actionId === "quando_distribuire") {
        const res = await AIConsultantService.suggestSchedule();
        setResultData(res);
      } else if (actionId === "spiega_preventivo") {
        const res = await AIConsultantService.explainEstimate(estimateInput);
        setResultData(res);
      } else if (actionId === "confronta_scenari") {
        const res = await AIConsultantService.compareScenarios();
        setResultData(res);
      } else if (actionId === "stato_campagna") {
        const res = await AIConsultantService.analyzePreCampaign();
        setResultData(res);
      } else if (actionId === "tracking_live") {
        const res = await AIConsultantService.analyzeDuringCampaign({ completedZones: 4, totalZones: 6, remainingFlyers: 3500 });
        setResultData(res);
      } else if (actionId === "report_ai") {
        const res = await AIConsultantService.analyzeReport();
        setResultData(res);
      } else if (actionId === "cosa_migliorare") {
        const res = await AIConsultantService.getImprovementSuggestions();
        setResultData(res);
      }
    } catch (e) {
      console.error("Errore esecuzione azione AI:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenWhy = async (whyId, title) => {
    setLoadingWhy(true);
    setWhyModal({ title: title || "Analisi del consiglio", text: "Elaborazione spiegazione..." });
    try {
      const res = await AIConsultantService.explainReasoning(whyId || "pre_increment");
      setWhyModal({ title: res.title || title || "Spiegazione Consiglio", text: res.reasoning || res.text || "Consiglio elaborato per massimizzare il ritorno di investimento." });
    } catch (e) {
      setWhyModal({ title: "Perché ti consigliamo questa scelta?", text: "Suggerimento automatico da regole interne, pensato per aiutarti a evitare dispersioni di budget nella scelta di zona e quantità." });
    } finally {
      setLoadingWhy(false);
    }
  };

  return (
    <section id="volantinipro-ai-hub" style={{ background: C.navy, padding: "80px 28px", borderTop: `1px solid ${C.border}`, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        {/* ── HEADER PRINCIPALE DELL'ECOSISTEMA AI ── */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(232, 87, 26, 0.12)", border: `1px solid ${C.orange}44`, marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>🤖</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".12em" }}>
              Ecosistema Integrato
            </span>
          </div>
          
          <h2 style={{ fontFamily: F.serif, fontSize: 46, color: C.white, letterSpacing: "-1.5px", marginBottom: 14, lineHeight: 1.1 }}>
            VolantiniPro AI
          </h2>
          
          <p style={{ fontFamily: F.sans, fontSize: 18, color: C.muted, maxWidth: 680, margin: "0 auto 24px", lineHeight: 1.6 }}>
            Un unico assistente intelligente che ti accompagna prima, durante e dopo ogni campagna. Il tuo consulente dalla pianificazione al report finale.
          </p>

          <div style={{ display: "inline-block", padding: "8px 16px", background: "rgba(255, 255, 255, 0.04)", borderRadius: 8, border: "1px dashed rgba(255, 255, 255, 0.15)", maxWidth: 720 }}>
            <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255, 255, 255, 0.6)", margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: C.orange }}>Nota trasparenza:</strong> Suggerimenti automatici generati da regole interne su testi predefiniti, non da un modello di intelligenza artificiale generativa. Indicazione orientativa basata sulle informazioni inserite; il preventivo definitivo viene calcolato nel configuratore.
            </p>
          </div>
        </div>

        {/* ── TOP NAV SELEZIONE MODALITÀ ── */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 40, flexWrap: "wrap" }}>
          {[
            { id: "dashboard", label: "📊 Dashboard AI", desc: "Esplora le 5 aree decisionali" },
            { id: "journey", label: "🧭 AI Guided Journey", desc: "Guidato passo dopo passo" },
            { id: "timeline", label: "🔄 Timeline Campagna", desc: "Il ciclo di vita completo" }
          ].map(mode => {
            const active = mainMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => { setMainMode(mode.id); setResultData(null); }}
                style={{
                  padding: "14px 24px",
                  borderRadius: 12,
                  background: active ? "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)" : C.navyCard,
                  border: active ? "1px solid #E8571A" : `1px solid ${C.border}`,
                  color: C.white,
                  fontFamily: F.sans,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                  boxShadow: active ? "0 8px 24px rgba(232, 87, 26, 0.35)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800 }}>{mode.label}</span>
                <span style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.9)" : C.muted }}>{mode.desc}</span>
              </button>
            );
          })}
        </div>

        {/* ── MODALITÀ 1: DASHBOARD AI (5 CATEGORIE) ── */}
        {mainMode === "dashboard" && (
          <div>
            {/* Tab Categorie */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 36, overflowX: "auto", paddingBottom: 8 }}>
              {[
                { id: "pianifica", label: "Pianifica", icon: "📍" },
                { id: "configura", label: "Configura", icon: "⚙️" },
                { id: "monitora", label: "Monitora", icon: "📡" },
                { id: "analizza", label: "Analizza", icon: "📊" },
                { id: "impara", label: "Impara", icon: "📚" }
              ].map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setResultData(null); }}
                    style={{
                      padding: "12px 22px",
                      borderRadius: 30,
                      background: active ? "rgba(232, 87, 26, 0.18)" : "rgba(255, 255, 255, 0.04)",
                      border: active ? `1px solid ${C.orange}` : "1px solid rgba(255, 255, 255, 0.08)",
                      color: active ? C.orange : C.white,
                      fontFamily: F.sans,
                      fontSize: 14,
                      fontWeight: active ? 800 : 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      whiteSpace: "nowrap",
                      transition: "all 0.2s"
                    }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Contenuto Tab */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
              >
                {/* ── TAB PIANIFICA ── */}
                {activeTab === "pianifica" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 20 }}>
                    
                    {/* Card 1: Analizza zona */}
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>📍</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Analizza la mia zona</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Verifica copertura stimata e famiglie raggiungibili nel tuo comune o quartiere.</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        <input
                          type="text"
                          value={zoneInput.comune}
                          onChange={e => setZoneInput({...zoneInput, comune: e.target.value})}
                          placeholder="Comune (es. Milano)"
                          style={{ padding: "10px 12px", borderRadius: 8, background: "#0B1020", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontSize: 13 }}
                        />
                        <input
                          type="text"
                          value={zoneInput.quartiere}
                          onChange={e => setZoneInput({...zoneInput, quartiere: e.target.value})}
                          placeholder="Quartiere / Zona"
                          style={{ padding: "10px 12px", borderRadius: 8, background: "#0B1020", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontSize: 13 }}
                        />
                      </div>
                      <button
                        onClick={() => handleRunAction("analizza_zona")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Avvia Analisi Zona
                      </button>
                    </div>

                    {/* Card 2: Ottimizza budget */}
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>💰</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Ottimizza il budget</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Scopri quante famiglie puoi coprire con il tuo budget di investimento stimato.</p>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 6 }}>Budget stimato (€)</label>
                        <input
                          type="number"
                          value={budgetInput.value}
                          onChange={e => setBudgetInput({ value: e.target.value })}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0B1020", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontSize: 14, fontWeight: 700 }}
                        />
                      </div>
                      <button
                        onClick={() => handleRunAction("ottimizza_budget")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(232, 87, 26, 0.15)", border: `1px solid ${C.orange}`, color: C.orange, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Calcola Copertura Ottimale
                      </button>
                    </div>

                    {/* Card 3: Zone consigliate */}
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 28, marginBottom: 12 }}>🗺️</div>
                        <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Zone consigliate</h3>
                        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>L'AI individua le aree ad alta densità abitativa e commerciale più adatte per generare contatti immediati.</p>
                      </div>
                      <button
                        onClick={() => handleRunAction("zone_consigliate")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Scopri le Aree Prioritarie
                      </button>
                    </div>

                    {/* Card 4: Quando distribuire */}
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 28, marginBottom: 12 }}>📅</div>
                        <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Quando distribuire</h3>
                        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Suggerimenti sui giorni ideali della settimana e opportunità di abbinamento Smart Pairing.</p>
                      </div>
                      <button
                        onClick={() => handleRunAction("quando_distribuire")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Visualizza Calendario Consigliato
                      </button>
                    </div>

                  </div>
                )}

                {/* ── TAB CONFIGURA (CON AI SCORE IN EVIDENZA) ── */}
                {activeTab === "configura" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    
                    {/* HIGHLIGHT BOX: AI SCORE */}
                    <div style={{ background: "linear-gradient(135deg, #122036 0%, #18263D 100%)", padding: 28, borderRadius: 20, border: `2px solid ${C.orange}`, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
                        <div style={{ flex: "1 1 320px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <span style={{ fontSize: 20 }}>📈</span>
                            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".1em" }}>Valutazione Campagna</span>
                          </div>
                          <h3 style={{ fontFamily: F.serif, fontSize: 32, color: C.white, marginBottom: 8 }}>AI Score di Configurazione</h3>
                          <p style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 8 }}>
                            Il punteggio valuta l'equilibrio tra budget, quantità selezionata e densità territoriale per evitare dispersioni.
                          </p>
                          <p style={{ fontFamily: F.sans, fontSize: 11, color: "#F59E0B", lineHeight: 1.5, marginBottom: 16, fontStyle: "italic" }}>
                            Valore dimostrativo a scopo illustrativo: non è calcolato sui dati che inserisci in questa pagina.
                          </p>
                          <button
                            onClick={() => handleOpenWhy("score_reasoning", "Analisi AI Score 92/100 (esempio)")}
                            style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(232, 87, 26, 0.2)", border: `1px solid ${C.orange}`, color: C.orange, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                          >
                            Perché questo punteggio? ⓘ
                          </button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0B1020", padding: "20px 32px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div style={{ fontFamily: F.serif, fontSize: 52, color: C.orange, lineHeight: 1 }}>92</div>
                          <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: C.white }}>su 100 (esempio)</div>
                          <div style={{ fontSize: 11, color: "#10B981", marginTop: 6, fontWeight: 700 }}>● Campagna Ottimizzata</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,.4)", fontStyle: "italic" }}>
                        I punti seguenti sono un esempio dimostrativo del formato di analisi, non un risultato calcolato sui tuoi dati:
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#D1D5DB" }}>
                          <span style={{ color: "#10B981", fontWeight: 900, fontSize: 16 }}>✓</span>
                          <span><strong>Budget coerente:</strong> In linea con la densità abitativa ISTAT del territorio scelto.</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#D1D5DB" }}>
                          <span style={{ color: "#10B981", fontWeight: 900, fontSize: 16 }}>✓</span>
                          <span><strong>Copertura buona:</strong> Raggiungi oltre l'80% delle cassette postali residenziali.</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#D1D5DB" }}>
                          <span style={{ color: "#10B981", fontWeight: 900, fontSize: 16 }}>✓</span>
                          <span><strong>Periodo consigliato:</strong> Nessuna sovrapposizione stagionale critica nella zona.</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#FBBF24" }}>
                          <span style={{ fontWeight: 900, fontSize: 16 }}>⚠</span>
                          <span><strong>Suggerimento automatico:</strong> Mancano circa 2.000 volantini per saturare le vie commerciali adiacenti.</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                      {/* Spiega preventivo */}
                      <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
                        <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Spiega il preventivo</h3>
                        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Inserisci quantità e servizio: l'AI ti spiega esattamente che ritorno di visibilità attenderti.</p>
                        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                          <input
                            type="text"
                            value={estimateInput.qty}
                            onChange={e => setEstimateInput({...estimateInput, qty: e.target.value})}
                            placeholder="Quantità"
                            style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#0B1020", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontSize: 13 }}
                          />
                          <select
                            value={estimateInput.service}
                            onChange={e => setEstimateInput({...estimateInput, service: e.target.value})}
                            style={{ flex: 1, padding: "10px", borderRadius: 8, background: "#0B1020", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontSize: 13 }}
                          >
                            <option value="Door to Door">Door to Door</option>
                            <option value="Hand to Hand">Hand to Hand</option>
                            <option value="Business">Business B2B</option>
                          </select>
                        </div>
                        <button
                          onClick={() => handleRunAction("spiega_preventivo")}
                          style={{ width: "100%", padding: "12px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                        >
                          Genera Spiegazione Preventivo
                        </button>
                      </div>

                      {/* Confronta scenari */}
                      <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 28, marginBottom: 12 }}>⚖️</div>
                          <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Confronta scenari A / B / C</h3>
                          <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Metti a confronto l'approccio Economico (Mirato), Consigliato (Equilibrato) e Capillare (Saturazione).</p>
                        </div>
                        <button
                          onClick={() => handleRunAction("confronta_scenari")}
                          style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                        >
                          Tabella Comparativa Scenari
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {/* ── TAB MONITORA ── */}
                {activeTab === "monitora" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>📡</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Stato campagna</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Controlla la verifica di pre-volo, lo stato del materiale stampato e l'assegnazione squadre.</p>
                      <button
                        onClick={() => handleRunAction("stato_campagna")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Simula Analisi Stato Pre-Volo
                      </button>
                    </div>

                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>🚚</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Tracking GPS</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Monitoraggio in tempo reale degli operatori con tracce certificate e controllo velocità di percorrenza.</p>
                      <button
                        onClick={() => handleRunAction("tracking_live")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Analizza Avanzamento GPS Live
                      </button>
                    </div>

                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Avanzamento Operativo</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Sintesi rapida sulle zone completate e avviso istantaneo su eventuali ostacoli stradali riscontrati.</p>
                      <button
                        onClick={() => handleOpenWhy("tracking_live", "Spiegazione Avanzamento Operativo")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(232, 87, 26, 0.15)", border: `1px solid ${C.orange}`, color: C.orange, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Perché questo consiglio? ⓘ
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB ANALIZZA ── */}
                {activeTab === "analizza" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Report AI di Campagna</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Sintesi finale con tasso di completamento, foto di verifica e analisi di copertura territoriale.</p>
                      <button
                        onClick={() => handleRunAction("report_ai")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Genera Sintesi Report PDF
                      </button>
                    </div>

                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>📈</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Cosa migliorare</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>Raccomandazioni motivante su frequenza, formato cartaceo e giorni ottimali per il prossimo ciclo.</p>
                      <button
                        onClick={() => handleRunAction("cosa_migliorare")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Visualizza Consigli di Miglioramento
                      </button>
                    </div>

                    <div style={{ background: C.navyCard, padding: 24, borderRadius: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>🔄</div>
                      <h3 style={{ fontFamily: F.serif, fontSize: 20, marginBottom: 8 }}>Campagna successiva</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 16 }}>L'AI calcola la finestra temporale ideale per il richiamo pubblicitario prima che il ricordo decada.</p>
                      <button
                        onClick={() => handleOpenWhy("post_improvement", "Motivazione Campagna Successiva")}
                        style={{ width: "100%", padding: "12px", borderRadius: 8, background: "rgba(232, 87, 26, 0.15)", border: `1px solid ${C.orange}`, color: C.orange, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                      >
                        Perché ripianificare? ⓘ
                      </button>
                    </div>
                  </div>
                )}

                {/* ── TAB IMPARA (CUSTOMER EDUCATION INTEGRATA) ── */}
                {activeTab === "impara" && (
                  <div>
                    <div style={{ textAlign: "center", marginBottom: 24 }}>
                      <h3 style={{ fontFamily: F.serif, fontSize: 26, marginBottom: 6 }}>Centro di Formazione e Trasparenza</h3>
                      <p style={{ fontFamily: F.sans, fontSize: 14, color: C.muted }}>Ogni numero deve rispondere alle 3 domande fondamentali: Che cos'è? Perché è importante? Come mi aiuta?</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                      {[
                        { t: "Copertura", d: KPI_DICTIONARY["Copertura"], ben: "Eviti di stampare volantini in eccesso o in difetto per la tua zona." },
                        { t: "Famiglie", d: KPI_DICTIONARY["Famiglie"], ben: "Traduce i chilometri quadrati in reali potenziali clienti che leggeranno l'offerta." },
                        { t: "Zone", d: KPI_DICTIONARY["Zone"], ben: "Organizzazione ordinata delle vie per evitare accavallamenti tra distributori." },
                        { t: "GPS", d: KPI_DICTIONARY["GPS"], ben: "Garanzia di trasparenza totale: puoi verificare esattamente dove sono passati." },
                        { t: "Report PDF", d: KPI_DICTIONARY["Report PDF"], ben: "Documento ufficiale di fine lavoro per misurare il ritorno pubblicitario." },
                        { t: "Smart Pairing", d: KPI_DICTIONARY["Smart Pairing"], ben: "Accorpi la tua uscita con altre campagne non concorrenti risparmiando fino al 40%." }
                      ].map(k => (
                        <div key={k.t} style={{ background: C.navyCard, padding: 20, borderRadius: 14, border: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontFamily: F.serif, fontSize: 18, color: C.white, fontWeight: 700 }}>{k.t}</span>
                            <KpiTooltip term={k.t} />
                          </div>
                          <p style={{ fontFamily: F.sans, fontSize: 13, color: "#CBD5E1", marginBottom: 10, lineHeight: 1.5 }}>{k.d}</p>
                          <div style={{ padding: "8px 12px", background: "rgba(232, 87, 26, 0.1)", borderRadius: 8, borderLeft: `3px solid ${C.orange}` }}>
                            <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>👉 Il tuo vantaggio: </span>
                            <span style={{ fontSize: 11, color: C.white }}>{k.ben}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* BOX RISULTATI AZIONI AI */}
            {loading && (
              <div style={{ marginTop: 28, padding: 32, background: C.navyCard, borderRadius: 16, border: `1px solid ${C.orange}`, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖💭</div>
                <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: C.white }}>Generazione suggerimento automatico...</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Testo predefinito da regole interne, non un'elaborazione di dati ISTAT in tempo reale.</div>
              </div>
            )}

            {resultData && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 28, padding: 28, background: "#111827", borderRadius: 16, border: `1px solid ${C.orange}`, boxShadow: "0 12px 30px rgba(0,0,0,0.6)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: C.orange, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em" }}>Esito Analisi AI</span>
                    <h4 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, marginTop: 4 }}>{resultData.title || "Sintesi Consulenza"}</h4>
                  </div>
                  <button
                    onClick={() => setResultData(null)}
                    style={{ background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}
                  >✕</button>
                </div>

                {resultData.text && <p style={{ fontSize: 14, color: "#E2E8F0", lineHeight: 1.6, marginBottom: 16 }}>{resultData.text}</p>}
                {resultData.summary && <p style={{ fontSize: 14, color: "#E2E8F0", lineHeight: 1.6, marginBottom: 16 }}>{resultData.summary}</p>}

                {resultData.metrics && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
                    {Object.entries(resultData.metrics).map(([key, val]) => (
                      <div key={key} style={{ padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase" }}>{key}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.orange, marginTop: 4 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleOpenWhy(activeActionId, resultData.title)}
                    style={{ padding: "10px 18px", borderRadius: 8, background: "rgba(232, 87, 26, 0.15)", border: `1px solid ${C.orange}`, color: C.orange, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                  >
                    Perché mi consigli questa scelta? ⓘ
                  </button>
                  {onConfigure && (
                    <button
                      onClick={() => onConfigure()}
                      style={{ padding: "10px 22px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                    >
                      Applica al Configuratore e Calcola Preventivo →
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ── MODALITÀ 2: AI GUIDED JOURNEY ── */}
        {mainMode === "journey" && (
          <div style={{ maxWidth: 760, margin: "0 auto", background: C.navyCard, padding: 36, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🧭</span>
                <div>
                  <h3 style={{ fontFamily: F.serif, fontSize: 22, margin: 0 }}>Percorso Guidato Intelligente</h3>
                  <span style={{ fontSize: 12, color: C.muted }}>Passo {journeyStep} di 4</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4].map(s => (
                  <div key={s} style={{ width: 32, height: 6, borderRadius: 3, background: s <= journeyStep ? C.orange : "rgba(255,255,255,0.1)" }} />
                ))}
              </div>
            </div>

            {journeyStep === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h4 style={{ fontSize: 18, marginBottom: 16 }}>Che tipo di attività desideri promuovere?</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
                  {["Ristorante / Pizzeria", "Negozio al dettaglio", "Agenzia Immobiliare", "Studio Professionale", "Azienda / Servizi", "Altro / Evento"].map(act => (
                    <button
                      key={act}
                      onClick={() => setJourneyData({...journeyData, activity: act})}
                      style={{
                        padding: "16px",
                        borderRadius: 12,
                        background: journeyData.activity === act ? "rgba(232, 87, 26, 0.2)" : "rgba(255,255,255,0.04)",
                        border: journeyData.activity === act ? `2px solid ${C.orange}` : "1px solid rgba(255,255,255,0.1)",
                        color: C.white,
                        fontWeight: journeyData.activity === act ? 800 : 500,
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                    >
                      {act}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setJourneyStep(2)}
                  style={{ width: "100%", padding: "14px", borderRadius: 10, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 15 }}
                >
                  Continua →
                </button>
              </motion.div>
            )}

            {journeyStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h4 style={{ fontSize: 18, marginBottom: 16 }}>Dove vuoi distribuire i tuoi volantini?</h4>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Inserisci il comune, il CAP o il quartiere target: la densità reale di abitazioni verrà verificata nel configuratore, con i dati ISTAT effettivi della zona.</p>
                <input
                  type="text"
                  value={journeyData.location}
                  onChange={e => setJourneyData({...journeyData, location: e.target.value})}
                  placeholder="Es. Cormano, Milano Sud, 20124..."
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 10, background: "#0B1020", border: "1px solid rgba(255,255,255,0.2)", color: C.white, fontSize: 15, marginBottom: 20 }}
                />
                <div style={{ marginBottom: 28 }}>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 8 }}>Quantità orientativa di copie</label>
                  <select
                    value={journeyData.qty}
                    onChange={e => setJourneyData({...journeyData, qty: e.target.value})}
                    style={{ width: "100%", padding: "12px", borderRadius: 10, background: "#0B1020", border: "1px solid rgba(255,255,255,0.2)", color: C.white, fontSize: 14 }}
                  >
                    <option value="5.000">5.000 volantini (Test di zona)</option>
                    <option value="10.000">10.000 volantini (Consigliato per attività locali)</option>
                    <option value="25.000">25.000 volantini (Grande copertura)</option>
                    <option value="50.000">50.000 volantini (Saturazione intero comune)</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setJourneyStep(1)} style={{ padding: "14px 20px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: C.white, cursor: "pointer" }}>← Indietro</button>
                  <button onClick={() => setJourneyStep(3)} style={{ flex: 1, padding: "14px", borderRadius: 10, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Genera Sintesi AI →</button>
                </div>
              </motion.div>
            )}

            {journeyStep === 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div style={{ padding: 24, background: "#0B1020", borderRadius: 16, border: `1px solid ${C.orange}`, marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: C.orange, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>💡 Suggerimento automatico (modello di testo)</div>
                  <h4 style={{ fontFamily: F.serif, fontSize: 22, color: C.white, marginBottom: 12 }}>
                    Strategia per {journeyData.activity} a {journeyData.location}
                  </h4>
                  <p style={{ fontSize: 15, color: "#E2E8F0", lineHeight: 1.6, marginBottom: 8 }}>
                    "Per un'attività di tipo <strong>{journeyData.activity}</strong> nell'area di <strong>{journeyData.location}</strong> consigliamo una distribuzione <strong>Door to Door</strong> in cassette postali residenziali. Con <strong>{journeyData.qty} volantini</strong> raggiungerai una buona copertura iniziale del bacino di utenza principale."
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontStyle: "italic", marginBottom: 16 }}>
                    Testo generato da un modello a regole con i valori che hai scelto: la copertura reale va verificata nel configuratore con i dati ISTAT della zona.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ padding: "4px 10px", background: "rgba(16, 185, 129, 0.15)", color: "#10B981", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>✓ Target Ottimale</span>
                    <span style={{ padding: "4px 10px", background: "rgba(232, 87, 26, 0.15)", color: C.orange, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>⚡ Smart Pairing Disponibile</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setJourneyStep(2)} style={{ padding: "14px 20px", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: C.white, cursor: "pointer" }}>← Modifica</button>
                  <button onClick={() => setJourneyStep(4)} style={{ flex: 1, padding: "14px", borderRadius: 10, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 15 }}>Vedi Riepilogo Finale →</button>
                </div>
              </motion.div>
            )}

            {journeyStep === 4 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <h4 style={{ fontFamily: F.serif, fontSize: 26, marginBottom: 12 }}>Tutto pronto per iniziare!</h4>
                <p style={{ fontSize: 15, color: C.muted, maxWidth: 500, margin: "0 auto 28px", lineHeight: 1.6 }}>
                  Abbiamo pre-impostato i parametri ottimali. Entra ora nel configuratore ufficiale di VolantiniPro per verificare la mappa ISTAT e calcolare il prezzo finale bloccato.
                </p>
                <button
                  onClick={() => onConfigure && onConfigure()}
                  style={{ padding: "16px 36px", borderRadius: 12, background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)", border: "none", color: C.white, fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(232, 87, 26, 0.4)" }}
                >
                  Apri il Configuratore con i dati AI →
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* ── MODALITÀ 3: TIMELINE DEL CICLO DI VITA COMPLETO ── */}
        {mainMode === "timeline" && (
          <div style={{ background: C.navyCard, padding: 36, borderRadius: 20, border: `1px solid ${C.border}` }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h3 style={{ fontFamily: F.serif, fontSize: 28, marginBottom: 8 }}>Il Ciclo di Vita della tua Campagna</h3>
              <p style={{ fontFamily: F.sans, fontSize: 15, color: C.muted }}>Scopri come VolantiniPro e l'AI ti affiancano in ciascuna delle 9 fasi operative.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {[
                { s: "01", t: "Idea", d: "Definisci il tuo obiettivo di promozione locale." },
                { s: "02", t: "Analisi AI", d: "Il consulente suggerisce zone, quantità e budget." },
                { s: "03", t: "Configurazione", d: "Scelta guidata di formato, carta e date." },
                { s: "04", t: "Preventivo", d: "Prezzo chiaro trasparente e senza sorprese." },
                { s: "05", t: "Distribuzione", d: "Le squadre operative scendono sul campo." },
                { s: "06", t: "Tracking GPS", d: "Tracciamento satellitare di ogni singola via." },
                { s: "07", t: "Report PDF", d: "Documento certificato con foto e mappe." },
                { s: "08", t: "Suggerimenti AI", d: "Analisi post-volo su cosa ha funzionato meglio." },
                { s: "09", t: "Nuova Campagna", d: "Pianificazione del richiamo al momento perfetto." }
              ].map((step, idx) => (
                <div key={step.s} style={{ position: "relative", padding: 20, background: "#0B1020", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: C.orange }}>{step.s}</span>
                    {idx < 8 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>↓</span>}
                  </div>
                  <h4 style={{ fontFamily: F.serif, fontSize: 18, color: C.white, marginBottom: 6 }}>{step.t}</h4>
                  <p style={{ fontFamily: F.sans, fontSize: 12, color: C.muted, lineHeight: 1.5, margin: 0 }}>{step.d}</p>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 36 }}>
              <button
                onClick={() => onConfigure && onConfigure()}
                style={{ padding: "14px 32px", borderRadius: 10, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 15 }}
              >
                Inizia ora dalla Fase 01 →
              </button>
            </div>
          </div>
        )}

        {/* ── MODALE "PERCHÉ QUESTO CONSIGLIO?" ── */}
        <AnimatePresence>
          {whyModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWhyModal(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                onClick={e => e.stopPropagation()}
                style={{ background: "#0F172A", border: `2px solid ${C.orange}`, borderRadius: 20, padding: 32, maxWidth: 540, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.8)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>💡</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".1em" }}>Trasparenza Decisionale</span>
                </div>
                <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, marginBottom: 16 }}>{whyModal.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 15, color: "#CBD5E1", lineHeight: 1.6, marginBottom: 24 }}>
                  {whyModal.text}
                </p>
                <div style={{ padding: 14, background: "rgba(255,255,255,0.04)", borderRadius: 10, borderLeft: `3px solid ${C.orange}`, marginBottom: 24 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    <strong>Come funziona:</strong> questo assistente non sostituisce mai la tua decisione. I testi che vedi sono suggerimenti automatici da regole interne su testi predefiniti, non un'analisi generativa né una certificazione sui dati ISTAT: servono solo ad aiutarti a scegliere con consapevolezza.
                  </span>
                </div>
                <button
                  onClick={() => setWhyModal(null)}
                  style={{ width: "100%", padding: "14px", borderRadius: 10, background: C.orange, border: "none", color: C.white, fontWeight: 700, cursor: "pointer", fontSize: 15 }}
                >
                  Ho capito, grazie
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
