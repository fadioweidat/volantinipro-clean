import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatRadiusLabel } from "../../../../lib/utils/format.js";
import { businessOptionLabel, BUSINESS_DELIVERY_METHODS, BUSINESS_RECIPIENTS } from "../../../../lib/business/business-config.js";

export function Step2PoiAssignmentPanel({ businessMaterialPlan, businessOperationalPlan, city, clearPoiAssignments, isBusinessStep2, isMobile, isMovementStep2, operatorCountForPoiAssignment, operatorSchedules, poiAssignments, pois, selectedOperationalPois, togglePoiAssignment }) {
  return (
    <>
      {(isMovementStep2 || isBusinessStep2) && city && <div style={{
            marginTop: 12,
            background: "rgba(255,255,255,.035)",
            border: `1px solid ${isBusinessStep2 ? "rgba(167,139,250,.24)" : "rgba(56,189,248,.24)"}`,
            borderRadius: 12,
            overflow: "hidden"
          }}>
              <div style={{
              padding: "12px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                <div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 850,
                  color: C.white
                }}>{isBusinessStep2 ? "Attività e aziende da visitare" : "POI da presidiare"}</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.45)",
                  marginTop: 3
                }}>
                    Target: {distributionTargetSelection.map(target => isBusinessStep2 ? businessCategoryLabel(target) : ACTIVITY_TARGET_LABELS[target] || target).join(", ") || "Tutte le categorie compatibili"}. Clicca un pin oppure usa la selezione automatica.
                  </div>
                </div>
                <div style={{
                display: "flex",
                gap: 8
              }}>
                  <span style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.05)",
                  color: "rgba(255,255,255,.62)",
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 750
                }}>{pois.length} trovati</span>
                  <span style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  background: isBusinessStep2 ? "rgba(167,139,250,.12)" : "rgba(56,189,248,.12)",
                  color: isBusinessStep2 ? "#C4B5FD" : "#7DD3FC",
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800
                }}>{selectedOperationalPois.length} selezionati</span>
                </div>
              </div>
              <div style={{
              padding: "10px 14px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              borderBottom: "1px solid rgba(255,255,255,.07)",
              background: "rgba(5,12,24,.25)"
            }}>
                {!isBusinessStep2 && <label style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.55)"
              }}>
                  Promoter
                  <select value={operatorCountForPoiAssignment} onChange={event => changeOperatorCountInStep2(event.target.value)} style={{
                  padding: "7px 9px",
                  borderRadius: 8,
                  background: "#0B1526",
                  border: "1px solid rgba(255,255,255,.14)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 9
                }}>
                    {PROMOTER_COUNT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
                  </select>
                </label>}
                <button type="button" onClick={selectAndBalanceAllPois} disabled={pois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(34,197,94,.28)",
                background: "rgba(34,197,94,.10)",
                color: "#86EFAC",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                cursor: pois.length ? "pointer" : "not-allowed",
                opacity: pois.length ? 1 : .45
              }}>{isBusinessStep2 ? "Seleziona automaticamente" : "Seleziona tutti e assegna"}</button>
                {!isBusinessStep2 && <button type="button" onClick={rebalanceSelectedPois} disabled={selectedOperationalPois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(96,165,250,.25)",
                background: "rgba(96,165,250,.08)",
                color: "#93C5FD",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 750,
                cursor: selectedOperationalPois.length ? "pointer" : "not-allowed",
                opacity: selectedOperationalPois.length ? 1 : .45
              }}>Bilancia tra operatori</button>}
                <button type="button" onClick={clearPoiAssignments} disabled={selectedOperationalPois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(248,113,113,.20)",
                background: "rgba(248,113,113,.07)",
                color: "#FCA5A5",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 750,
                cursor: selectedOperationalPois.length ? "pointer" : "not-allowed",
                opacity: selectedOperationalPois.length ? 1 : .45
              }}>Rimuovi tutti</button>
              </div>
              {!isBusinessStep2 && <div style={{
              padding: "10px 14px",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(210px,1fr))",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                {operatorSchedules.slice(0, operatorCountForPoiAssignment).map((schedule, index) => <div key={schedule.id || index} style={{
                padding: 9,
                borderRadius: 9,
                background: "rgba(255,255,255,.025)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800,
                  color: C.white,
                  marginBottom: 7
                }}>{isBusinessStep2 ? "Addetto" : "Promoter"} {index + 1}</div>
                    <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 82px",
                  gap: 6
                }}>
                      <select value={schedule.timeSlot || ""} onChange={event => updateOperatorScheduleInStep2(index, {
                    timeSlot: event.target.value
                  })} style={{
                    minWidth: 0,
                    padding: "7px 6px",
                    borderRadius: 7,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.10)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 8
                  }}>
                        {PROMOTER_TIME_SLOT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select value={schedule.serviceDurationHours || 4} onChange={event => updateOperatorScheduleInStep2(index, {
                    serviceDurationHours: Number(event.target.value)
                  })} style={{
                    padding: "7px 6px",
                    borderRadius: 7,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.10)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 8
                  }}>
                        {PROMOTER_SHIFT_DURATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value} ore</option>)}
                      </select>
                    </div>
                  </div>)}
              </div>}
              <div style={{
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                <div style={{
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap"
              }}>
                  <div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 850,
                    color: C.white
                  }}>{isBusinessStep2 ? "Attività trovate nell'area" : "Luoghi trovati dentro il raggio"}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 8,
                    color: "rgba(255,255,255,.42)",
                    marginTop: 2
                  }}>{isBusinessStep2 ? "Seleziona le attività da includere. Gli addetti saranno stimati nel piano operativo." : "Scegli il promoter direttamente accanto al nome del luogo."}</div>
                  </div>
                  <input aria-label={isBusinessStep2 ? "Cerca attività, indirizzo o categoria" : "Cerca nome, via o categoria"} value={poiListSearch} onChange={event => setPoiListSearch(event.target.value)} placeholder={isBusinessStep2 ? "Cerca attività, indirizzo o categoria" : "Cerca nome, via o categoria"} style={{
                  width: isMobile ? "100%" : 240,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#0B1526",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 9
                }} />
                </div>
                {isBusinessStep2 && <div role="group" aria-label="Filtri attività Business" style={{
                padding: "0 14px 10px",
                display: "flex",
                gap: 6,
                flexWrap: "wrap"
              }}>
                    {[["all", "Tutte", pois.length], ["selected", "Selezionate", selectedOperationalPois.length], ["priority", "Prioritarie", pois.filter(p => Number(p.priority || 0) >= 8).length], ["shops", "Negozi", businessPoiCategoryCounts.shops || 0], ["food", "Ristorazione", businessPoiCategoryCounts.food || 0], ["offices", "Uffici", businessPoiCategoryCounts.offices || 0], ["health", "Sanitario", businessPoiCategoryCounts.health || 0], ["automotive", "Automotive", businessPoiCategoryCounts.automotive || 0], ["industry", "Industria", businessPoiCategoryCounts.industry || 0], ["other", "Altro", businessPoiCategoryCounts.other || 0]].filter(([value,, count]) => value === "all" || value === "selected" || value === "priority" || count > 0).map(([value, label, count]) => {
                  const active = businessPoiFilter === value;
                  return <button key={value} type="button" aria-pressed={active} onClick={() => setBusinessPoiFilter(value)} style={{
                    padding: "6px 9px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "rgba(167,139,250,.58)" : "rgba(255,255,255,.10)"}`,
                    background: active ? "rgba(167,139,250,.14)" : "rgba(255,255,255,.025)",
                    color: active ? "#DDD6FE" : "#94A3B8",
                    fontFamily: F.sans,
                    fontSize: 8.5,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>{label}{value !== "all" && value !== "selected" && value !== "priority" ? ` (${count})` : ""}</button>;
                })}
                  </div>}
                {isMovementStep2 && <div role="group" aria-label="Filtri categoria POI" style={{
                padding: "0 14px 10px",
                display: "flex",
                gap: 6,
                flexWrap: "wrap"
              }}>
                    {[["all", "Tutti", pois.length], ["scuole", "Scuole", h2hPoiCategoryCounts.scuole || 0], ["universita", "Università", h2hPoiCategoryCounts.universita || 0], ["palestre", "Palestre e sport", h2hPoiCategoryCounts.palestre || 0], ["stazioni", "Stazioni e fermate", h2hPoiCategoryCounts.stazioni || 0], ["commerciale", "Commerciale", h2hPoiCategoryCounts.commerciale || 0], ["altro", "Altro", h2hPoiCategoryCounts.altro || 0]].filter(([value,, count]) => value === "all" || count > 0).map(([value, label, count]) => {
                  const active = h2hPoiFilter === value;
                  return <button key={value} type="button" aria-pressed={active} onClick={() => setH2hPoiFilter(value)} style={{
                    padding: "6px 9px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "rgba(56,189,248,.58)" : "rgba(255,255,255,.10)"}`,
                    background: active ? "rgba(56,189,248,.14)" : "rgba(255,255,255,.025)",
                    color: active ? "#BAE6FD" : "#94A3B8",
                    fontFamily: F.sans,
                    fontSize: 8.5,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>{label}{value !== "all" ? ` (${count})` : ""}</button>;
                })}
                  </div>}
                {visiblePoisForAssignment.length === 0 ? <div role="status" style={{
                padding: "12px 14px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "#FCD34D",
                background: "rgba(245,158,11,.05)"
              }}>{isBusinessStep2 ? "Nessuna attività compatibile trovata nel raggio selezionato. Riduci i filtri o amplia l'area." : "Nessun luogo compatibile trovato. Controlla il target scelto oppure aumenta il raggio."}</div> : <div style={{
                maxHeight: 320,
                overflowY: "auto"
              }}>
                    {visiblePoisForAssignment.map((poi, index) => {
                  const assignment = poiAssignments[poi.id] || null;
                  const comuneLabel = poiComuneResolver(poi);
                  const isFocused = focusedPoiId === poi.id;
                  return <div key={poi.id} role="button" tabIndex={0} aria-pressed={isFocused} onClick={() => focusPoiRow(poi.id)} onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusPoiRow(poi.id);
                    }
                  }} style={{
                    padding: "9px 14px",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 155px",
                    gap: 10,
                    alignItems: "center",
                    borderTop: index ? "1px solid rgba(255,255,255,.05)" : "none",
                    background: assignment ? "rgba(34,197,94,.045)" : "transparent",
                    outline: isFocused ? "1px solid rgba(125,211,252,.55)" : "none",
                    cursor: "pointer"
                  }}>
                          <div style={{
                      minWidth: 0
                    }}>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 780,
                        color: C.white
                      }}>{poi.name || "Luogo senza nome"}</div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 8,
                        color: "rgba(255,255,255,.43)",
                        marginTop: 3
                      }}>{poi.category || "Categoria non indicata"}{poi.address ? ` · ${poi.address}` : " · indirizzo non disponibile"} · {comuneLabel || "Comune non determinato"}</div>
                            {isBusinessStep2 && <div style={{
                        fontFamily: F.sans,
                        fontSize: 7.5,
                        color: "rgba(167,139,250,.72)",
                        marginTop: 3
                      }}>Fonte: {poi.source || "Fonte territoriale collegata"}{poi.openingHours ? ` · Orari: ${poi.openingHours}` : ""}</div>}
                          </div>
                          {isBusinessStep2 ? <button type="button" onClick={event => {
                      event.stopPropagation();
                      togglePoiAssignment(poi);
                    }} aria-pressed={Boolean(assignment)} style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: 8,
                      background: assignment ? "rgba(34,197,94,.10)" : "#0B1526",
                      border: `1px solid ${assignment ? "rgba(34,197,94,.30)" : "rgba(255,255,255,.12)"}`,
                      color: assignment ? "#86EFAC" : C.white,
                      fontFamily: F.sans,
                      fontSize: 9,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}>{assignment ? "✓ Selezionata" : "Seleziona attività"}</button> : <select value={assignment?.operatorNumber || ""} onClick={event => event.stopPropagation()} onChange={event => event.target.value ? assignPoiToOperator(poi.id, event.target.value) : togglePoiAssignment(poi)} style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: 8,
                      background: assignment ? "rgba(34,197,94,.10)" : "#0B1526",
                      border: `1px solid ${assignment ? "rgba(34,197,94,.30)" : "rgba(255,255,255,.12)"}`,
                      color: assignment ? "#86EFAC" : C.white,
                      fontFamily: F.sans,
                      fontSize: 9
                    }}>
                              <option value="">{assignment ? "Rimuovi assegnazione" : "Assegna a..."}</option>
                              {Array.from({
                        length: operatorCountForPoiAssignment
                      }, (_, operatorIndex) => <option key={operatorIndex + 1} value={operatorIndex + 1}>Promoter {operatorIndex + 1}</option>)}
                            </select>}
                        </div>;
                })}
                  </div>}
              </div>
              {isBusinessStep2 && (selectedOperationalPois.length === 0 ? <div style={{
              padding: "14px",
              fontFamily: F.sans,
              fontSize: 10,
              color: "rgba(255,255,255,.48)"
            }}>
                  Nessuna attività selezionata. Seleziona i marker sulla mappa oppure usa “Seleziona automaticamente”.
                </div> : <div style={{
              maxHeight: 230,
              overflowY: "auto"
            }}>
                  {selectedOperationalPois.map((poi, index) => <div key={poi.id} style={{
                padding: "10px 14px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 110px 74px",
                gap: 10,
                alignItems: "center",
                borderTop: index ? "1px solid rgba(255,255,255,.055)" : "none"
              }}>
                      <div style={{
                  minWidth: 0
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 750,
                    color: C.white,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>{poi.name}</div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 8,
                    color: "rgba(255,255,255,.42)",
                    marginTop: 2
                  }}>{poi.category}{poi.address ? ` · ${poi.address}` : ""}</div>
                      </div>
                      <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: "rgba(255,255,255,.45)",
                  fontFamily: F.sans,
                  fontSize: 8
                }}>
                          Copie
                          <input type="number" min="1" value={poi.copies ?? ""} placeholder="Da definire" onChange={event => updatePoiCopies(poi.id, event.target.value)} style={{
                    width: 58,
                    padding: "7px 5px",
                    borderRadius: 8,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.12)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 9
                  }} />
                      </label>
                      <button type="button" onClick={() => togglePoiAssignment(poi)} style={{
                  padding: "7px 8px",
                  borderRadius: 8,
                  background: "rgba(248,113,113,.08)",
                  border: "1px solid rgba(248,113,113,.2)",
                  color: "#FCA5A5",
                  fontFamily: F.sans,
                  fontSize: 8,
                  fontWeight: 750,
                  cursor: "pointer"
                }}>Rimuovi</button>
                    </div>)}
                </div>)}
              {isBusinessStep2 && selectedOperationalPois.length > 0 && <div style={{
              padding: 14,
              borderTop: "1px solid rgba(167,139,250,.18)",
              background: "rgba(76,29,149,.08)"
            }}>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 900,
                color: "#DDD6FE",
                marginBottom: 10
              }}>Riepilogo materiali e piano operativo</div>
                  <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
                gap: 8
              }}>
                    {[["Attività selezionate", businessMaterialPlan?.selectedActivities ?? 0], ["Materiali necessari", businessMaterialPlan?.materialsRequired == null ? "Da definire" : `${businessMaterialPlan.materialsRequired.toLocaleString("it-IT")} pz.`], ["Materiali residui", businessMaterialPlan?.materialsRemaining == null ? "Da definire" : `${businessMaterialPlan.materialsRemaining.toLocaleString("it-IT")} pz.`], ["Materiali mancanti", businessMaterialPlan?.materialsMissing == null ? "Da definire" : `${businessMaterialPlan.materialsMissing.toLocaleString("it-IT")} pz.`]].map(([label, value]) => <div key={label} style={{
                  padding: 10,
                  borderRadius: 9,
                  background: "rgba(5,12,24,.45)",
                  border: "1px solid rgba(255,255,255,.07)"
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 7.5,
                    color: "rgba(255,255,255,.42)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em"
                  }}>{label}</div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 900,
                    color: label === "Materiali mancanti" && Number(businessMaterialPlan?.materialsMissing) > 0 ? "#FCA5A5" : "#F8FAFC",
                    marginTop: 4
                  }}>{value}</div>
                      </div>)}
                  </div>
                  <div style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 9,
                background: "rgba(5,12,24,.38)",
                color: "#CBD5E1",
                fontFamily: F.sans,
                fontSize: 9,
                lineHeight: 1.55
              }}>
                    {businessOperationalPlan?.calculable ? <>Stima: <b>{businessOperationalPlan.minutesPerVisit} min/visita</b>, <b>{businessOperationalPlan.visitsPerOperatorDay} visite per addetto/giorno</b>, <b>{businessOperationalPlan.operatorDays} giornate-addetto</b>{businessOperationalPlan.recommendedOperators ? ` e ${businessOperationalPlan.recommendedOperators} addetti consigliati nel periodo indicato` : ". Indica un periodo completo per stimare gli addetti."}</> : "Il piano operativo sarà calcolato appena la modalità di consegna e le attività selezionate consentono una stima attendibile."}
                  </div>
                </div>}
            </div>}


    </>
  );
}
