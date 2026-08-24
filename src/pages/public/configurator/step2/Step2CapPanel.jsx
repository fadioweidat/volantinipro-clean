import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT, formatPercentIT } from "../../../../lib/utils/format.js";

export function Step2CapPanel({ businessMetrics, capDataMap, col, flyerQuantityFromStep1, h2hMetrics, isBusinessStep2, isMobile, isMovementStep2, isNilAnalysis, isResidentialStep2, searchMode, selZones, selectedCaps, setCapDataMap, setSelectedCaps, setShowClientZoneDetails, setZoneListSort, showClientZoneDetails, showTerritoryData, sortedResidentialZones, territoryPluralLabel, zCap, zoneAllocationById, zoneListSort, zoneListSourceCount, zonesInRadius }) {
  return (
    <>
      {/* CAP MODE: CAP selezionati */}
          {searchMode === "cap" && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            border: `1px solid ${col}28`,
            overflow: "hidden"
          }}>
              <div style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12
            }}>
                <div>
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}>
                    <span style={{
                    fontSize: 14
                  }}></span>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.white
                  }}>CAP selezionati</div>
                    <span style={{
                    padding: "2px 7px",
                    borderRadius: 100,
                    background: `${col}18`,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: col
                  }}>Modalità CAP</span>
                  </div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)",
                  marginTop: 3
                }}>
                    Solo i CAP selezionati - nessun comune aggiunto automaticamente
                  </div>
                </div>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.35)"
              }}>
                  Budget: <b style={{
                  color: col
                }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                    useGrouping: true
                  })}</b> vol.
                </div>
              </div>
              {selectedCaps.length === 0 ? <div style={{
              padding: "28px",
              textAlign: "center"
            }}>
                  <div style={{
                fontSize: 28,
                marginBottom: 10
              }}></div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 13,
                color: "rgba(255,255,255,.45)",
                marginBottom: 6
              }}>Nessun CAP selezionato</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.28)"
              }}>Digita un codice postale nella barra di ricerca qui sopra</div>
                </div> : <div style={{
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}>
                  {selectedCaps.map(cap => {
                const zone = capDataMap[cap];
                const required = zone ? zCap(zone) : 0;
                const assigned = Math.min(required, flyerQuantityFromStep1);
                return <div key={cap} style={{
                  borderRadius: 10,
                  border: `1px solid ${col}35`,
                  background: `${col}08`,
                  padding: "10px 12px"
                }}>
                        <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                          <div>
                            <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4
                      }}>
                              <span style={{
                          fontSize: 16
                        }}></span>
                              <span style={{
                          fontFamily: F.sans,
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.white
                        }}>CAP {cap}</span>
                              <span style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(251,191,36,.12)",
                          border: "1px solid rgba(251,191,36,.25)",
                          fontFamily: F.sans,
                          fontSize: 9,
                          fontWeight: 700,
                          color: C.yellow
                        }}>Stima</span>
                            </div>
                            {zone && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)",
                        paddingLeft: 24
                      }}>
                                {zone.municipalityName} – ~{zone.families?.toLocaleString("it-IT", {
                          useGrouping: true
                        })} famiglie – {zone.area} km²
                              </div>}
                          </div>
                          <div style={{
                      textAlign: "right"
                    }}>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.white
                      }}>{assigned.toLocaleString("it-IT", {
                          useGrouping: true
                        })} pz.</div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 9,
                        color: "rgba(255,255,255,.3)"
                      }}>consigliati {required.toLocaleString("it-IT", {
                          useGrouping: true
                        })}</div>
                          </div>
                        </div>
                        <div style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    paddingLeft: 24
                  }}>
                          <span style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.35)"
                    }}>Modalit : Solo CAP – Nessun comune aggiunto</span>
                        </div>
                        <div style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "flex-end"
                  }}>
                          <button onClick={() => {
                      setSelectedCaps(prev => prev.filter(c => c !== cap));
                      setCapDataMap(prev => {
                        const n = {
                          ...prev
                        };
                        delete n[cap];
                        return n;
                      });
                    }} style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid rgba(248,113,113,.3)",
                      background: "rgba(34, 197, 94,.08)",
                      color: C.red,
                      fontFamily: F.sans,
                      fontSize: 10,
                      cursor: "pointer"
                    }}>
                            Rimuovi CAP
                          </button>
                        </div>
                      </div>;
              })}
                </div>}
              {selectedCaps.length > 0 && <div style={{
              padding: "12px 14px",
              borderTop: "1px solid rgba(255,255,255,.05)",
              background: "rgba(46,204,138,.04)"
            }}>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: C.green,
                fontWeight: 700,
                marginBottom: 4
              }}> Campagna limitata ai CAP selezionati</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.4)"
              }}>I dati mostrati sono stime. Per aggiungere aree vicine usa i pulsanti qui sotto.</div>
                  <div style={{
                display: "flex",
                gap: 8,
                marginTop: 8
              }}>
                    <button disabled style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.3)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  cursor: "not-allowed"
                }}>+ Aggiungi CAP vicino</button>
                    <button disabled style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.3)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  cursor: "not-allowed"
                }}>+ Aggiungi comune vicino</button>
                  </div>
                </div>}
            </div>}

          {showTerritoryData && (selZones.length > 0 || zonesInRadius.length > 0) && <section className="vp-step2-zone-details" aria-labelledby="vp-step2-zone-details-title">
              <button type="button" className="vp-step2-zone-details__trigger" onClick={() => setShowClientZoneDetails(value => !value)} aria-expanded={showClientZoneDetails} aria-controls="vp-step2-zone-details-panel">
                <span>
                  <strong id="vp-step2-zone-details-title">{showClientZoneDetails ? "Nascondi dettagli zone" : "Mostra dettagli zone"}</strong>
                  <small>{zoneListSourceCount} {isNilAnalysis ? "NIL" : territoryPluralLabel.toLowerCase()} · dati della configurazione corrente</small>
                </span>
                <span aria-hidden="true">{showClientZoneDetails ? "−" : "+"}</span>
              </button>
              {showClientZoneDetails && (() => {
              const detailZones = isMovementStep2 ? h2hMetrics.clusters : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows : sortedResidentialZones;

              let sumTarget = 0;
              let sumAssigned = 0;
              let countComplete = 0;
              let countPartial = 0;
              let countExcluded = 0;

              const tableRows = detailZones.map((zone, index) => {
                const allocation = zoneAllocationById?.[zone.id] || null;
                const assigned = Math.max(0, Number(allocation?.assignedFlyers || 0));
                const target = isResidentialStep2 ? Number(zone.families || zone.famiglie || zone.households || 0) : isMovementStep2 ? Number(zone.poi || zone.points || zone.transitStops || 0) : Number(zone.targetBiz || zone.businesses || zone.value || 0);
                const coverage = target > 0 ? Math.min(100, (assigned / target) * 100) : 0;
                const missing = Math.max(0, target - assigned);
                const status = assigned <= 0 ? "Escluso" : assigned >= target ? "Completo" : "Parziale";

                sumTarget += target;
                sumAssigned += assigned;
                if (status === "Completo") countComplete++;
                else if (status === "Parziale") countPartial++;
                else countExcluded++;

                return { zone, index, assigned, target, coverage, missing, status, allocation };
              });

                     return <div id="vp-step2-zone-details-panel" className="vp-step2-zone-details__panel" style={{ marginTop: 16 }}>
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24, padding: "16px 20px",
                      background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.1)"
                    }}>
                      <div style={{flex: "1 1 100%"}}>
                        <div style={{fontSize: 18, fontWeight: 700, color: C.white, marginBottom: 8}}>
                          {isNilAnalysis ? "NIL / Quartieri selezionati" : "Comuni nel raggio"}: {detailZones.length}
                        </div>
                        <div style={{display: "flex", gap: 16, fontSize: 14}}>
                          <span style={{color: "#86EFAC", fontWeight: 600}}>{countComplete} complet{isNilAnalysis ? "i" : "o"}</span>
                          <span style={{color: "#FCD34D", fontWeight: 600}}>{countPartial} parzial{isNilAnalysis ? "i" : "e"}</span>
                          <span style={{color: "#FCA5A5", fontWeight: 600}}>{countExcluded} esclus{isNilAnalysis ? "i" : "o"}</span>
                        </div>
                      </div>
                    </div>

                    {showTerritoryData && <div className="vp-step2-zone-details__sort" aria-label="Ordina dettaglio zone" style={{ marginBottom: 16 }}>
                        <span style={{ color: "rgba(255,255,255,.5)" }}>Ordina per</span>
                        {[["relevance", "Priorità"], ["families", "Target"], ["coverage", "Copertura"], ["assigned", "Quantità assegnata"]].map(([id, label]) => <button type="button" key={id} aria-pressed={zoneListSort === id} onClick={() => setZoneListSort(id)} style={{ padding: "4px 10px", borderRadius: 16, border: zoneListSort === id ? `1px solid ${col}` : "1px solid rgba(255,255,255,.2)", background: zoneListSort === id ? `${col}22` : "transparent", color: zoneListSort === id ? C.white : "rgba(255,255,255,.7)", fontSize: 12, cursor: "pointer", marginLeft: 8 }}>{label}</button>)}
                      </div>}

                    {!isMobile ? (
                      <div style={{ overflowX: "auto" }}>
                        <table className="vp-step2-zone-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                          <thead>
                            <tr>
                              <th style={{ whiteSpace: "nowrap", textAlign: "left", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>{isNilAnalysis ? "NIL" : "Comune"}</th>
                              <th style={{ textAlign: "right", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>{isResidentialStep2 ? "Famiglie" : isMovementStep2 ? "Pubblico" : "Attività"}</th>
                              <th style={{ textAlign: "right", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>Assegnati</th>
                              <th style={{ textAlign: "right", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>Mancanti</th>
                              <th style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>Copertura</th>
                              <th style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>Stato</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableRows.map((row) => {
                              const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                              const rowKey = zone.id || zone.name || index;
                              const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;

                              let statusColor = "#FCA5A5";
                              let statusBg = "rgba(248,113,113,.15)";
                              if (status === "Completo") {
                                statusColor = "#86EFAC";
                                statusBg = "rgba(34,197,94,.15)";
                              } else if (status === "Parziale") {
                                statusColor = "#FCD34D";
                                statusBg = "rgba(250,204,21,.15)";
                              }

                              return <tr key={rowKey} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                                  <td style={{ padding: "16px", textAlign: "left" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{ display: "inline-block", background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 700 }}>#{priorityLabel}</span>
                                      <strong style={{ fontSize: 16, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }} title={zone.name || zone.label || `Zona ${index + 1}`}>
                                        {zone.name || zone.label || `Zona ${index + 1}`}
                                      </strong>
                                    </div>
                                  </td>
                                  <td className="vp-data-number" style={{ textAlign: "right", padding: "16px", fontSize: 15, color: "rgba(255,255,255,.8)" }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</td>
                                  <td className="vp-data-number" style={{ textAlign: "right", padding: "16px", fontSize: 15, color: C.white, fontWeight: 600 }}>{formatIntegerIT(assigned)}</td>
                                  <td className="vp-data-number" style={{ textAlign: "right", padding: "16px", fontSize: 15, color: missing > 0 ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.2)" }}>{formatIntegerIT(missing)}</td>
                                  <td style={{ padding: "16px", minWidth: 160 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                      <span className="vp-data-number" style={{ fontSize: 15, fontWeight: 700, color: statusColor, minWidth: 45 }}>{formatPercentIT(coverage, 1)}</span>
                                      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,.1)", borderRadius: 4, overflow: "hidden" }}>
                                        <div style={{ width: `${coverage}%`, height: "100%", background: statusColor, borderRadius: 4 }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ textAlign: "center", padding: "16px" }}>
                                    <span style={{
                                      display: "inline-block", padding: "6px 12px", borderRadius: 16,
                                      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px",
                                      color: statusColor, background: statusBg, border: `1px solid ${statusColor}40`
                                    }}>
                                      {status}
                                    </span>
                                  </td>
                                </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {tableRows.map((row) => {
                          const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                          const rowKey = zone.id || zone.name || index;
                          const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;

                          let statusColor = "#FCA5A5";
                          let statusBg = "rgba(248,113,113,.15)";
                          if (status === "Completo") {
                            statusColor = "#86EFAC";
                            statusBg = "rgba(34,197,94,.15)";
                          } else if (status === "Parziale") {
                            statusColor = "#FCD34D";
                            statusBg = "rgba(250,204,21,.15)";
                          }

                          return <div key={rowKey} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ display: "inline-block", background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 700 }}>#{priorityLabel}</span>
                                <strong style={{ fontSize: 18, color: C.white, lineHeight: 1.2 }}>{zone.name || zone.label || `Zona ${index + 1}`}</strong>
                              </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: 16 }}>
                              <div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 4 }}>{isResidentialStep2 ? "Famiglie" : "Target"}</div>
                                <div className="vp-data-number" style={{ fontSize: 16, color: "rgba(255,255,255,.9)" }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 4 }}>Assegnati</div>
                                <div className="vp-data-number" style={{ fontSize: 16, color: C.white, fontWeight: 700 }}>{formatIntegerIT(assigned)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 4 }}>Mancanti</div>
                                <div className="vp-data-number" style={{ fontSize: 16, color: missing > 0 ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.2)" }}>{formatIntegerIT(missing)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 4 }}>Stato</div>
                                <span style={{
                                  display: "inline-block", padding: "4px 10px", borderRadius: 12,
                                  fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px",
                                  color: statusColor, background: statusBg, border: `1px solid ${statusColor}40`
                                }}>
                                  {status}
                                </span>
                              </div>
                            </div>

                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", textTransform: "uppercase" }}>Copertura</span>
                                <span className="vp-data-number" style={{ fontSize: 15, fontWeight: 700, color: statusColor }}>{formatPercentIT(coverage, 1)}</span>
                              </div>
                              <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,.1)", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${coverage}%`, height: "100%", background: statusColor, borderRadius: 4 }} />
                              </div>
                            </div>
                          </div>;
                        })}
                      </div>
                    )}

                    {showTerritoryData && <div style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.07)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.5
                }}>
                        L'allocazione automatica parte dalle zone a maggiore densità di target. Puoi coprire il tuo comune aumentando la quantità o passando alla modalità Manuale.
                      </div>}
                  </div>;
            })()}
            </section>}


    </>
  );
}
