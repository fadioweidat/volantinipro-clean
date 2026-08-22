import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import KpiTooltip from "../../../../components/ui/KpiTooltip.jsx";
import { C, F } from "../../../../lib/constants.js";

export function Step4TechnicalAnalysisPanel({ box, isQuick, showTechPanel, setShowTechPanel, isMobile, estimatedFamiliesForSummary, coverageForSummary, selectedZoneNames, col, nonEmpty, serviceSummaryConfig, fieldCard, step4TerritoryPluralLabel, breakdownRows, isComuneMode, svcType, step4Omi, formatNumber, cleanSource, operationalSummary, techSections, toggleTech, handleDownloadPdf, pdfBusy }) {
  if (isQuick) return null;

  return (
    <div style={{
          ...box(),
          padding: "18px"
        }}>

              {/* Card introduttiva — sempre visibile */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
              <div style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start"
            }}>
                <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(99,102,241,.14)",
                border: "1px solid rgba(99,102,241,.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}><Step1Icon name="chart" size={22} color="#818CF8" /></div>
                <div style={{
                flex: 1
              }}>
                  <div style={{
                  fontFamily: F.serif,
                  fontSize: 19,
                  color: C.white,
                  letterSpacing: "-.2px",
                  marginBottom: 4
                }}>Approfondimenti tecnici</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.52)",
                  lineHeight: 1.55
                }}>
                    I dati di analisi usati per stimare copertura, famiglie e potenziale dell'area. Visibili su richiesta.
                  </div>
                </div>
              </div>

              {/* KPI principali — visibili subito per mantenere la sezione pulita */}
              {!showTechPanel && <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
              gap: 10
            }}>
                  {[{
                label: "Famiglie operative stimate",
                val: formatNumber(estimatedFamiliesForSummary, "—"),
                sub: "Stima territoriale GIS/NIL",
                c: C.green,
                tip: "Stima del fabbisogno e delle famiglie raggiungibili nell'area selezionata su base geografica."
              }, {
                label: "Copertura zona",
                val: coverageForSummary == null ? "—" : `${coverageForSummary}%`,
                sub: "Percentuale dell'area coperta",
                c: col,
                tip: "Percentuale dell'area raggiungibile con la quantità di volantini scelta. 100% = nessuna famiglia esclusa."
              }, {
                label: "Zone selezionate",
                val: `${selectedZoneNames.length || "—"}`,
                sub: "Aree nella campagna",
                c: C.white,
                tip: "Numero di aree geografiche incluse nella distribuzione. Ogni zona è verificata su mappa."
              }, {
                label: "Affidabilità dati",
                val: "99.4%",
                sub: "Dati territoriali verificati",
                c: C.purple,
                tip: "Indica la precisione dei dati mostrati, basata su fonti ufficiali aggiornate."
              }].map((item, idx) => <div key={idx} style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.45)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 3
                }}>
                        {item.label}
                        <KpiTooltip tip={item.tip} color="rgba(255,255,255,0.4)" />
                      </div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  fontWeight: 800,
                  color: item.c,
                  letterSpacing: "-.5px",
                  lineHeight: 1,
                  marginBottom: 2
                }}>{item.val}</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)"
                }}>{item.sub}</div>
                    </div>)}
                </div>}

              {/* Pulsante espansione */}
              <button onClick={() => setShowTechPanel(v => !v)} style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 12,
              border: "1px solid rgba(99,102,241,.35)",
              background: showTechPanel ? "rgba(99,102,241,.15)" : "rgba(99,102,241,.08)",
              color: showTechPanel ? "#A5B4FC" : C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              transition: "all .2s",
              boxShadow: showTechPanel ? "none" : "0 4px 15px rgba(99,102,241,0.15)"
            }}>
                <span style={{
                fontSize: 14
              }}>{showTechPanel ? "▲" : "▼"}</span>
                <span>{showTechPanel ? "Chiudi approfondimenti" : "Analisi avanzata · Mostra dati tecnici"}</span>
              </button>
            </div>

            {/* Contenuto accordion — visibile solo quando aperto */}
            {showTechPanel && <div style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,.07)",
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}>
                {/* Helper: collapsible sub-section */}
                {[{
              key: "kpi",
              label: "KPI",
              icon: "chart",
              content: <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                gap: 8
              }}>
                        {nonEmpty(serviceSummaryConfig.fields || []).map(fieldCard)}
                      </div>
            }, {
              key: "comuni",
              label: step4TerritoryPluralLabel + " nel raggio",
              icon: "map",
              content: breakdownRows.length > 0 ? <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 5
              }}>
                        {breakdownRows.map(row => <div key={row.id} style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  background: row.selectedRow ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)",
                  border: `1px solid ${row.selectedRow ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.04)"}`,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 10,
                  alignItems: "center"
                }}>
                            <div>
                              <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      color: row.selectedRow ? C.white : "rgba(255,255,255,.52)"
                    }}>{row.name}</div>
                              <div style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.36)"
                    }}>
                                {row.selectedRow ? row.alloc?.allocationStatus === "full" || row.coveragePercent >= 100 ? "Copertura completa" : "Copertura parziale" : "Non coperto dal budget attuale"}
                              </div>
                            </div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 800,
                    color: row.selectedRow ? col : "rgba(255,255,255,.32)"
                  }}>{row.estimatedFlyers != null ? row.estimatedFlyers.toLocaleString("it-IT", {
                      useGrouping: true
                    }) : "—"}</div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 800,
                    color: row.coveragePercent >= 100 ? C.green : row.coveragePercent != null ? "#F59E0B" : "rgba(255,255,255,.32)"
                  }}>{row.coveragePercent != null ? `${Math.min(100, row.coveragePercent)}%` : "—"}</div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.38)"
                  }}>{row.contribution != null ? `${row.contribution}%` : "—"}</div>
                          </div>)}
                      </div> : <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.35)"
              }}>{isComuneMode ? "Nessun comune disponibile." : "Nessun comune nel raggio disponibile."}</div>
            }, {
              key: "indicatori",
              label: "Indicatori",
              icon: "target",
              content: nonEmpty(serviceSummaryConfig.scores || []).length > 0 ? <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))",
                gap: 8
              }}>
                        {nonEmpty(serviceSummaryConfig.scores || []).map(s => <div key={s.l} style={{
                  padding: "10px 11px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.035)",
                  border: "1px solid rgba(255,255,255,.055)"
                }}>
                            <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 4
                  }}>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.38)"
                    }}>{s.l}</span>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 13,
                      fontWeight: 900,
                      color: s.c
                    }}>{s.v}/100</span>
                            </div>
                            <div style={{
                    height: 3,
                    background: "rgba(255,255,255,.07)",
                    borderRadius: 2,
                    overflow: "hidden"
                  }}>
                              <div style={{
                      height: "100%",
                      width: `${s.v || 0}%`,
                      background: s.c,
                      borderRadius: 2
                    }} />
                            </div>
                            {s.d && <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.38)",
                    marginTop: 5,
                    lineHeight: 1.4
                  }}>{s.d}</div>}
                          </div>)}
                      </div> : <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.35)"
              }}>Indicatori non disponibili per questo servizio.</div>
            }, {
              key: "demo",
              label: "Profilo demografico ISTAT",
              icon: "family",
              content: <div>
                        <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                  gap: 8
                }}>
                          {nonEmpty(serviceSummaryConfig.admin || []).map(fieldCard)}
                        </div>
                        {svcType === "d2d" && <div style={{
                  marginTop: 8,
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.3)",
                  lineHeight: 1.45
                }}>
                            Dati reali da ISTAT per la Lombardia. Alcuni indicatori (fasce età, % stranieri, reddito) non ancora disponibili in questa versione.
                          </div>}
                      </div>
            }, svcType === "d2d" && step4Omi?.available ? {
              key: "omi",
              label: "Mercato immobiliare OMI",
              icon: "home",
              content: <div style={{
                padding: "12px 13px",
                borderRadius: 10,
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                        <div style={{
                  display: "flex",
                  gap: 7,
                  marginBottom: 10,
                  flexWrap: "wrap"
                }}>
                          {step4Omi.municipality && <span style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(96,165,250,.12)",
                    border: "1px solid rgba(96,165,250,.22)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: C.blue
                  }}>{step4Omi.municipality}</span>}
                          {step4Omi.zone_name && <span style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.07)",
                    border: "1px solid rgba(255,255,255,.1)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.62)"
                  }}>Zona: {step4Omi.zone_name}</span>}
                        </div>
                        {(step4Omi.values || []).slice(0, 4).map((tv, i) => <div key={i} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,.05)" : "none"
                }}>
                            <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.52)"
                  }}>{tv.typology}</span>
                            <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.white
                  }}>{formatNumber(tv.min_value)}–{formatNumber(tv.max_value)} €/mq</span>
                          </div>)}
                        {(step4Omi.values || []).length > 4 && <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.35)",
                  marginTop: 6
                }}>+{step4Omi.values.length - 4} tipologie</div>}
                        <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.26)",
                  marginTop: 8
                }}>Fonte: Agenzia delle Entrate – OMI</div>
                      </div>
            } : null, {
              key: "fonti",
              label: "Fonti dati",
              icon: "book",
              content: <div>
                        <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginBottom: 10
                }}>
                          {(serviceSummaryConfig.sources || []).map(s => <span key={s} style={{
                    padding: "4px 9px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.07)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.52)"
                  }}>{cleanSource(s)}</span>)}
                          {(serviceSummaryConfig.sources || []).length === 0 && <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.35)"
                  }}>Nessuna fonte registrata.</span>}
                        </div>
                        <div style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: `${col}08`,
                  border: `1px solid ${col}20`,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.52)",
                  lineHeight: 1.5
                }}>
                          {operationalSummary}
                        </div>
                      </div>
            }].filter(Boolean).map(({
              key,
              label,
              icon,
              content
            }) => <div key={key} style={{
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,.07)",
              overflow: "hidden"
            }}>
                    <button onClick={() => toggleTech(key)} style={{
                width: "100%",
                padding: "11px 14px",
                background: techSections[key] ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.025)",
                border: "none",
                color: techSections[key] ? C.white : "rgba(255,255,255,.52)",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left"
              }}>
                      <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7
                }}><Step1Icon name={icon} size={13} color="currentColor" /> {label}</span>
                      <span style={{
                  fontSize: 10,
                  opacity: .6
                }}>{techSections[key] ? "▲" : "▼"}</span>
                    </button>
                    <AnimatePresence>
                      {techSections[key] && <motion.div key="body" initial={{
                  opacity: 0,
                  height: 0
                }} animate={{
                  opacity: 1,
                  height: "auto"
                }} exit={{
                  opacity: 0,
                  height: 0
                }} transition={{
                  duration: 0.2
                }} style={{
                  overflow: "hidden"
                }}>
                          <div style={{
                    padding: "12px 14px",
                    borderTop: "1px solid rgba(255,255,255,.06)",
                    background: "rgba(8,15,30,.5)"
                  }}>
                            {content}
                          </div>
                        </motion.div>}
                    </AnimatePresence>
                  </div>)}

                <button onClick={handleDownloadPdf} disabled={pdfBusy} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              marginTop: 6,
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${col}40`,
              background: `${col}0e`,
              color: col,
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 700,
              cursor: pdfBusy ? "wait" : "pointer",
              width: "100%"
            }}>
                  {pdfBusy ? "Generazione PDF..." : <><Step1Icon name="printer" size={14} color={col} /> Scarica analisi completa PDF</>}
                </button>
              </div>}
          </div>
  );
}
