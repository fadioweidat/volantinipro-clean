import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT, formatPercentIT } from "../../../../lib/utils/format.js";

import { Step1Icon } from "../../../../components/Step1Icon.jsx";

export function Step2ComunePanel({ activeCampaignZone, activeComuneZeroData, addressPreviewNilZones, addressSearchError, allocationMode, analysisError, analysisLoading, areaMode, availableFlyers, businessMetrics, city, col, comuniPriorityOrder, containingNil, coverageDecision, coverageStrategy, debugStep2Log, flyerQuantityFromStep1, getComuneColor, getCoverageStatus, handleNext, hasAtLeastOne, hasSearchPoint, hasSurplus, hasUnconfirmedAddressPoint, isBusinessStep2, isComuneMode, isCoverageDecisionValid, isInvalid, isMilanoComuneCollapsible, isMobile, isMovementStep2, isNilAnalysis, isPartial, isRadiusMode, isResidentialStep2, manualAssignments, manualFlyers, marginalResidentialZones, marginalZoneCoverage, marginalZoneFamilies, milanoComuneNilInsufficient, missingFlyers, movePriorityZone, municipalityTotalFamilies, municipalityTotalFamiliesLabel, municipalityTotalFamiliesRowLabel, nilManualMode, nilUnavailable, primaryCoveredZones, radius, radiusKm, remainingFlyers, requiredFlyers, resolveMilanoCity, searchMode, selected, selZones, selectCoverageQuantityDecision, selectedAreaFamiliesLabel, selectedCaps, selectedNils, selectedSearchPoint, serviceKpis, setAddressFullCoverageConfirmed, setAddressSearchError, setAllocationMode, setCity, setCoverageDecision, setCoverageStrategy, setData, setDropOpen, setNilManualMode, setPartialCoverageConfirmed, setRequestedAnalysisLevel, setSearch, setSelected, setSelectedComuni, setSelectedSearchPoint, setShowMarginalZones, setShowMilanoNilList, setZoneListSort, sharedCoveragePctText, shouldGroupMarginalZones, showMarginalZones, showMilanoNilList, showTerritoryData, startManualPinSelection, step2CoverageFullLabel, step2RequirementContextLabel, step2TruthModel, step2ViewModel, summaryComuniStats, surplusFlyers, switchToComuneMode, switchToRadiusMode, territorialDataUnavailable, territorySingularLabel, toggleZone, totalAssigned, updateActiveRadius, updateManual, updateManualFlyersQuantity, zCap, zoneCoveragePctForBox, zoneListSort, zoneListSourceCount, zoneRowsForList, zonesAllocation, zonesInRadius }) {
  return (
    <>
      {/* COMUNE MODE: Zone di distribuzione */}
                {showTerritoryData && searchMode !== "cap" && city && <div style={{
                  background: "rgba(255,255,255,.04)",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.07)",
                  overflow: "hidden"
                }}>
                    {/* Header */}
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
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.white,
                        marginBottom: 2
                      }}>{isNilAnalysis ? isComuneMode ? nilManualMode ? `NIL selezionate: ${selZones.length} di ${zonesInRadius.length}` : `NIL disponibili ${city?.label || city?.name || ""}: ${zoneListSourceCount}` : `NIL intersecate dal raggio: ${summaryComuniStats.total}` : isMovementStep2 ? `Cluster operativi rilevati: ${zoneListSourceCount}` : isBusinessStep2 ? `Cluster commerciali rilevati: ${zoneListSourceCount}` : `Zone di distribuzione: ${zoneListSourceCount}`}</div>
                        <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.35)"
                      }}>
                          Quantità inserita: <b style={{
                          color: col
                        }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                            useGrouping: true
                          })}</b> volantini
                        </div>
                      </div>
                      {isComuneMode && isNilAnalysis && <button onClick={() => {
                      setNilManualMode(v => {
                        const next = !v;
                        // Uscendo dalla modalità manuale si torna al comune completo:
                        // tutte le NIL rientrano nell'aggregato.
                        if (!next) setSelected(zonesInRadius.map(z => z.id));
                        return next;
                      });
                    }} title={nilManualMode ? "Torna al comune completo (tutte le NIL)" : "Seleziona manualmente una o più NIL / quartieri"} style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: `1px solid ${nilManualMode ? `${col}66` : "rgba(255,255,255,.12)"}`,
                      background: nilManualMode ? `${col}1e` : "rgba(255,255,255,.04)",
                      color: nilManualMode ? col : "rgba(255,255,255,.55)",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}>
          {hasUnconfirmedAddressPoint ? `NIL selezionati: ${selectedNils.length} · Anteprima: ${containingNil?.name || addressPreviewNilZones?.main?.name || "zona vicina"}` : `NIL / Quartieri: ${nilManualMode ? "selezione manuale" : "comune completo"}`}
                        </button>}
                      <div style={{
                      display: "flex",
                      background: "rgba(0,0,0,.2)",
                      padding: 3,
                      borderRadius: 9,
                      border: "1px solid rgba(255,255,255,.05)"
                    }}>
                        {[{
                        id: "auto",
                        l: "Auto",
                        icon: ""
                      }, ...(searchMode === "municipality" ? [{
                        id: "priority",
                        l: "Priorità",
                        icon: ""
                      }] : []), {
                        id: "manual",
                        l: "Manuale",
                        icon: ""
                      }].map(m => <button key={m.id} onClick={() => setAllocationMode(m.id)} style={{
                        padding: "6px 12px",
                        borderRadius: 7,
                        border: "none",
                        background: allocationMode === m.id ? col : "transparent",
                        color: allocationMode === m.id ? C.white : "rgba(255,255,255,.4)",
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: allocationMode === m.id ? 700 : 400,
                        cursor: "pointer",
                        transition: "all.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 5
                      }}>
                            <span>{m.icon}</span> {m.l}
                          </button>)}
                      </div>
                    </div>

                    {/* Microcopy & Manual Summary */}
                    <div style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,.02)",
                    borderBottom: "1px solid rgba(255,255,255,.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap"
                  }}>
                      <div style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: "rgba(255,255,255,.45)",
                      lineHeight: 1.4,
                      maxWidth: 400
                    }}>
                        {allocationMode === "auto" ? `Con ${formatIntegerIT(flyerQuantityFromStep1)} volantini il sistema copre prima le zone con priorità più alta. Le zone non coperte verranno incluse aumentando la quantità o modificando la distribuzione manuale.` : allocationMode === "priority" ? "Scegli l'ordine dei comuni con le frecce: il sistema distribuisce i volantini seguendo quell'ordine." : `Modalità manuale: scegli tu quanti volantini assegnare a ogni ${territorySingularLabel.toLowerCase()}.`}
                      </div>
                      {showTerritoryData && <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                      marginLeft: "auto"
                    }}>
                          <span style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.38)"
                      }}>Ordina per:</span>
                          {[{
                        id: "relevance",
                        l: "Rilevanza"
                      }, {
                        id: "families",
                        l: "Famiglie"
                      }, {
                        id: "coverage",
                        l: "Copertura"
                      }].map(opt => <button key={opt.id} onClick={() => setZoneListSort(opt.id)} style={{
                        padding: "5px 8px",
                        borderRadius: 7,
                        border: `1px solid ${zoneListSort === opt.id ? `${col}55` : "rgba(255,255,255,.08)"}`,
                        background: zoneListSort === opt.id ? `${col}18` : "rgba(255,255,255,.035)",
                        color: zoneListSort === opt.id ? col : "rgba(255,255,255,.45)",
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                              {opt.l}
                            </button>)}
                        </div>}
                      {(allocationMode === "manual" || allocationMode === "priority") && <div style={{
                      textAlign: "right"
                    }}>
                          <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.35)",
                        marginBottom: 2
                      }}>Riepilogo assegnazione</div>
                          <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: isInvalid ? C.red : C.green
                      }}>
                            {totalAssigned.toLocaleString("it-IT", {
                          useGrouping: true
                        })} / {flyerQuantityFromStep1.toLocaleString("it-IT", {
                          useGrouping: true
                        })}
                          </div>
                        </div>}
                    </div>

                    {/* Lista zone */}
                    <div style={{
                    padding: "14px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10
                  }}>
                      {analysisLoading && <div style={{
                      padding: 20,
                      textAlign: "center",
                      color: "rgba(255,255,255,.4)",
                      fontFamily: F.sans,
                      fontSize: 12
                    }}>Caricamento analisi territoriale...</div>}
                      {analysisError === "TERRITORIAL_DATA_NOT_AVAILABLE" && <div style={{
                      padding: 24,
                      textAlign: "center",
                      color: C.red,
                      background: "rgba(34, 197, 94,.08)",
                      border: `1px solid ${C.red}33`,
                      borderRadius: 12,
                      fontFamily: F.sans,
                      fontSize: 13
                    }}>
                          <div style={{
                        fontWeight: 700,
                        marginBottom: 6
                      }}>Dati territoriali non disponibili per questo comune.</div>
                          <div style={{
                        opacity: 0.8,
                        fontSize: 12
                      }}>La copertura dati reale e attualmente attiva per la Lombardia.</div>
                        </div>}
                      {(addressSearchError || isRadiusMode && !hasSearchPoint && (!city || !Number.isFinite(Number(city?.lat)) || !Number.isFinite(Number(city?.lng)))) && <div style={{
                      padding: 16,
                      borderRadius: 10,
                      background: "rgba(251,191,36,.08)",
                      border: "1px solid rgba(251,191,36,.3)"
                    }}>
                          <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: F.sans,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#FBBF24",
                        marginBottom: 6
                      }}>
                            <Step1Icon name="pin" size={14} /> {addressSearchError ? "Indirizzo non trovato a Milano" : "Coordinate necessarie per il raggio"}
                          </div>
                          <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: "rgba(255,255,255,.65)",
                        lineHeight: 1.45,
                        marginBottom: 12
                      }}>
                            {addressSearchError || "Seleziona prima un indirizzo valido o un punto sulla mappa per calcolare il raggio di copertura."}
                          </div>
                          <div style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap"
                      }}>
                            <button onClick={() => {
                          resolveMilanoCity().then(milano => {
                            if (milano) {
                              setCity(milano);
                              setSelectedComuni([milano]);
                              setSearch("Milano");
                              setDropOpen(false);
                              setSelected([]);
                              setCoverageDecision(null);
                              setCoverageStrategy(null);
                              setPartialCoverageConfirmed(false);
                              setAddressFullCoverageConfirmed(true);
                              setAddressSearchError("");
                              setSelectedSearchPoint(null);
                              switchToComuneMode();
                            }
                          });
                        }} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,.2)",
                          background: "rgba(255,255,255,.1)",
                          color: C.white,
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer"
                        }}>
                              Usa Milano comune completo
                            </button>
                            <button onClick={() => {
                          setAddressSearchError("");
                          setDropOpen(true);
                        }} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "rgba(255,255,255,.05)",
                          color: "rgba(255,255,255,.8)",
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer"
                        }}>
                              Cerca di nuovo
                            </button>
                            <button onClick={() => {
                          startManualPinSelection();
                        }} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(59,130,246,.4)",
                          background: "rgba(59,130,246,.14)",
                          color: "#60A5FA",
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer"
                        }}>
                              Scegli punto sulla mappa
                            </button>
                          </div>
                        </div>}
                      {hasUnconfirmedAddressPoint && <div style={{
                      padding: 16,
                      borderRadius: 10,
                      background: "rgba(59,130,246,.08)",
                      border: "1px solid rgba(59,130,246,.3)"
                    }}>
                          <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: F.sans,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#60A5FA",
                        marginBottom: 6
                      }}><Step1Icon name="pin" size={14} /> Hai selezionato un indirizzo dentro Milano</div>
                          <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: "rgba(255,255,255,.65)",
                        lineHeight: 1.45,
                        marginBottom: 10
                      }}>
                            <b style={{
                          color: C.white
                        }}>{selectedSearchPoint?.label}</b>. Per calcolare la copertura puoi usare un raggio dal punto oppure selezionare Milano comune completo.
                          </div>
                          {addressPreviewNilZones?.requiresExplicitNilChoice ? <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#FBBF24",
                        marginBottom: 12,
                        padding: "8px 10px",
                        background: "rgba(251,191,36,.08)",
                        borderRadius: 8
                      }}>
                              <div style={{
                          marginBottom: 6
                        }}>Punto sul confine di piu NIL: scegli esplicitamente il quartiere.</div>
                              <div style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap"
                        }}>
                                {(addressPreviewNilZones.containingCandidates || []).map(candidate => <button key={candidate.id || candidate.nilCode || candidate.nil_code || candidate.name} onClick={() => {
                            setNilManualMode(true);
                            setRequestedAnalysisLevel("nil");
                            setAddressFullCoverageConfirmed(true);
                            if (candidate.id) setSelected([candidate.id]);
                          }} style={{
                            padding: "5px 9px",
                            borderRadius: 7,
                            border: "1px solid rgba(251,191,36,.35)",
                            background: "rgba(251,191,36,.12)",
                            color: "#FBBF24",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "pointer"
                          }}>
                                    {candidate.name}
                                  </button>)}
                              </div>
                            </div> : addressPreviewNilZones?.main?.name ? <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#93C5FD",
                        marginBottom: 12,
                        padding: "8px 10px",
                        background: "rgba(59,130,246,.12)",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}>
                              <Step1Icon name="compass" size={14} />
                              <span>Quartiere/NIL più vicino: <b style={{
                            color: C.white
                          }}>{addressPreviewNilZones.main.name}</b></span>
                            </div> : <div style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(251,191,36,.85)",
                        marginBottom: 12,
                        padding: "8px 10px",
                        background: "rgba(251,191,36,.08)",
                        borderRadius: 8
                      }}>
                              Quartiere/NIL più vicino: dato non disponibile
                            </div>}
                          <div style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap"
                      }}>
                            <button onClick={switchToRadiusMode} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(34,197,94,.4)",
                          background: "rgba(34,197,94,.14)",
                          color: "#22C55E",
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer"
                        }}>
                              Usa raggio da {(selectedSearchPoint?.label || "").split(",")[0]}
                            </button>
                            <button onClick={() => setAddressFullCoverageConfirmed(true)} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "rgba(255,255,255,.05)",
                          color: "rgba(255,255,255,.8)",
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer"
                        }}>
                              Usa Milano comune completo
                            </button>
                            <button onClick={() => {
                          if (addressPreviewNilZones?.requiresExplicitNilChoice) return;
                          setNilManualMode(true);
                          setRequestedAnalysisLevel("nil");
                          setAddressFullCoverageConfirmed(true);
                          if (addressPreviewNilZones?.main?.id) {
                            setSelected([addressPreviewNilZones.main.id]);
                          }
                        }} disabled={Boolean(addressPreviewNilZones?.requiresExplicitNilChoice)} style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "rgba(255,255,255,.05)",
                          color: "rgba(255,255,255,.8)",
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: addressPreviewNilZones?.requiresExplicitNilChoice ? "not-allowed" : "pointer",
                          opacity: addressPreviewNilZones?.requiresExplicitNilChoice ? 0.55 : 1
                        }}>
                              Seleziona NIL/quartiere vicino
                            </button>
                          </div>
                        </div>}
                      {milanoComuneNilInsufficient && !nilUnavailable && <div style={{
                      padding: 14,
                      textAlign: "center",
                      color: C.yellow,
                      background: "rgba(251,191,36,.08)",
                      border: `1px solid ${C.yellow}33`,
                      borderRadius: 10,
                      fontFamily: F.sans,
                      fontSize: 12
                    }}>
                          <div style={{
                        fontWeight: 800,
                        marginBottom: 4
                      }}>Dati comune completo non disponibili</div>
                          <div style={{
                        opacity: 0.82
                      }}>Seleziona raggio o NIL specifica.</div>
                        </div>}
                      {activeComuneZeroData && <div style={{
                      padding: 14,
                      textAlign: "center",
                      color: C.yellow,
                      background: "rgba(251,191,36,.08)",
                      border: `1px solid ${C.yellow}33`,
                      borderRadius: 10,
                      fontFamily: F.sans,
                      fontSize: 12
                    }}>
                          <div style={{
                        fontWeight: 800,
                        marginBottom: 4
                      }}>Dati non disponibili o area non valida per la modalità Comune</div>
                          <div style={{
                        opacity: 0.82
                      }}>Prova un altro comune, oppure usa Raggio o NIL/Quartieri se disponibile.</div>
                        </div>}
                      {nilUnavailable && <div style={{
                      padding: 14,
                      textAlign: "center",
                      color: C.yellow,
                      background: "rgba(251,191,36,.08)",
                      border: `1px solid ${C.yellow}33`,
                      borderRadius: 10,
                      fontFamily: F.sans,
                      fontSize: 12
                    }}>
                          <div style={{
                        fontWeight: 800,
                        marginBottom: 4
                      }}>Dati NIL non disponibili</div>
                          <div style={{
                        opacity: 0.82
                      }}>
                            {isComuneMode ? "Dati comune completo non disponibili. Seleziona raggio o NIL specifica." : `Milano viene usata come centro di riferimento. L'analisi è calcolata sul raggio selezionato di ${radiusKm}km.`}
                          </div>
                        </div>}
                      {territorialDataUnavailable && analysisError !== "TERRITORIAL_DATA_NOT_AVAILABLE" && <div style={{
                      padding: 24,
                      textAlign: "center",
                      color: C.red,
                      background: "rgba(34, 197, 94,.08)",
                      border: `1px solid ${C.red}33`,
                      borderRadius: 12,
                      fontFamily: F.sans,
                      fontSize: 13
                    }}>
                          <div style={{
                        fontWeight: 700,
                        marginBottom: 6
                      }}>Dati territoriali non disponibili per questa zona.</div>
                          <div style={{
                        opacity: 0.8,
                        fontSize: 12
                      }}>I POI reali restano visibili dove disponibili, ma non vengono creati comuni o zone territoriali da dati locali.</div>
                        </div>}
                      {analysisError === "POI_DATA_NOT_AVAILABLE" && <div style={{
                      padding: 20,
                      textAlign: "center",
                      color: "#22C55E",
                      background: "rgba(34, 197, 94,.08)",
                      borderRadius: 8,
                      fontFamily: F.sans,
                      fontSize: 12
                    }}>Dati POI non disponibili per questa zona.</div>}
                      {shouldGroupMarginalZones && <div style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(34, 197, 94,.08)",
                      border: "1px solid rgba(34, 197, 94,.22)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap"
                    }}>
                          <div style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(255,255,255,.62)",
                        lineHeight: 1.45
                      }}>
                            {isComuneMode ? <>
                                <b style={{
                            color: C.white
                          }}>{city.label || city.name || "Il comune selezionato"}:</b> con {formatIntegerIT(flyerQuantityFromStep1)} volantini coprirai principalmente {primaryCoveredZones.length > 0 ? <b style={{
                            color: col
                          }}>{primaryCoveredZones.join(", ")}</b> : "alcune zone del comune"}. Per copertura completa del comune servono circa {formatIntegerIT(requiredFlyers)} volantini.
                              </> : <>
                                <><b style={{
                              color: C.white
                            }}>Con un raggio di {radiusKm || radius} km la campagna copre circa il {sharedCoveragePctText} dell’area selezionata.</b> Per una campagna più mirata puoi ridurre il raggio.</>
                                {primaryCoveredZones.length > 0 && <> Con {formatIntegerIT(flyerQuantityFromStep1)} volantini coprirai principalmente: <b style={{
                              color: col
                            }}>{primaryCoveredZones.join(", ")}</b>.</>}
                              </>}
                          </div>
                          {searchMode !== "municipality" && <button onClick={() => updateActiveRadius(Math.max(1, Math.round((radiusKm || radius) > 3 ? 3 : 1)))} style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${col}55`,
                        background: `${col}16`,
                        color: col,
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 900,
                        cursor: "pointer"
                      }}>
                              Riduci raggio
                            </button>}
                        </div>}

                      {allocationMode !== "auto" && (isMilanoComuneCollapsible && !showMilanoNilList ? <button onClick={() => setShowMilanoNilList(true)} style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px dashed rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.025)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      cursor: "pointer",
                      textAlign: "left"
                    }}>
                          <span style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 900,
                        color: "rgba(255,255,255,.72)"
                      }}>
                            + Mostra dettagli NIL / quartieri <span style={{
                          color: "rgba(255,255,255,.38)",
                          fontWeight: 700
                        }}>({zoneListSourceCount} zone)</span>
                          </span>
                          <span style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.42)"
                      }}>espandi</span>
                        </button> : <div style={{
                      maxHeight: "560px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      paddingRight: 4
                    }}>
                      {isMilanoComuneCollapsible && <button onClick={() => setShowMilanoNilList(false)} style={{
                        alignSelf: "flex-start",
                        padding: "5px 10px",
                        borderRadius: 7,
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(255,255,255,.04)",
                        color: "rgba(255,255,255,.55)",
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                          − Nascondi dettagli NIL / quartieri
                        </button>}
                      {zoneRowsForList.map(row => {
                        if (row.type === "marginal-summary") {
                          return <div key="marginal-summary" style={{
                            borderRadius: 10,
                            border: "1px dashed rgba(255,255,255,.13)",
                            background: "rgba(255,255,255,.025)",
                            padding: "9px 10px"
                          }}>
                              <button onClick={() => setShowMarginalZones(v => !v)} style={{
                              width: "100%",
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              cursor: "pointer",
                              textAlign: "left"
                            }}>
                                <span style={{
                                fontFamily: F.sans,
                                fontSize: 11,
                                fontWeight: 900,
                                color: "rgba(255,255,255,.72)"
                              }}>
                                  {showMarginalZones ? "-" : "+"} Altre {marginalResidentialZones.length} zone marginali <span style={{
                                  color: "rgba(255,255,255,.38)",
                                  fontWeight: 700
                                }}>(basso impatto)</span>
                                </span>
                                <span style={{
                                fontFamily: F.sans,
                                fontSize: 10,
                                color: "rgba(255,255,255,.42)"
                              }}>{showMarginalZones ? "nascondi" : "espandi"}</span>
                              </button>
                              <div style={{
                              marginTop: 5,
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.42)"
                            }}>
                                totale aggregato: <b style={{
                                color: C.white
                              }}>{Number(marginalZoneFamilies || 0).toLocaleString("it-IT", {
                                  useGrouping: true
                                })}</b> famiglie · <b style={{
                                color: C.white
                              }}>{marginalZoneCoverage}%</b> del raggio
                              </div>
                            </div>;
                        }
                        const z = row.zone;
                        const sel = isMovementStep2 || isBusinessStep2 && businessMetrics.clusterRows.length ? true : z.isCap ? selectedCaps.includes(z.postalCode) : selected.includes(z.id);
                        const alloc = zonesAllocation.find(a => a.id === z.id) || {
                          requiredFlyers: zCap(z),
                          assignedFlyers: 0,
                          coveragePercent: 0,
                          allocationStatus: "none"
                        };
                        const isManual = allocationMode === "manual";
                        const assignedFlyers = Math.max(0, Math.round(Number(alloc.assignedFlyers || alloc.assigned || alloc.allocated || alloc.volantini_assegnati || 0)));
                        const requiredFlyers = Math.max(0, Math.round(Number(alloc.requiredFlyers || alloc.needed || alloc.volantini_necessari || zCap(z) || 0)));
                        const coveragePercent = assignedFlyers <= 0 ? 0 : assignedFlyers >= requiredFlyers ? 100 : Math.max(1, Math.min(99, Math.round(assignedFlyers / Math.max(1, requiredFlyers) * 100)));
                        const statusCalc = getCoverageStatus(coveragePercent);
                        const coverageState = assignedFlyers <= 0 ? "none" : statusCalc === "coperto" ? "full" : "partial";
                        const coverageLabel = coverageState === "none" ? "Copertura 0% - fuori budget attuale" : z.isNil ? "Copertura fabbisogno zona" : isRadiusMode ? "Copertura del fabbisogno della zona" : coverageState === "full" ? "Copertura totale" : "Copertura selettiva";
                        const zoneTotalFamilies = Number(z.householdsTotal || z.households_total || z.totalFamilies || 0);
                        const zoneAreaFamilies = Number(z.families || z.famiglie || z.householdsInRadius || z.households_in_radius || 0);
                        const zoneCoveragePct = Number.isFinite(Number(z.coverage ?? z.pct ?? z.percent_nel_raggio)) ? Math.round(Number(z.coverage ?? z.pct ?? z.percent_nel_raggio)) : null;
                        const rowMetric = (label, value, tone = "neutral") => <div key={label} style={{
                          minWidth: 118,
                          padding: "7px 8px",
                          borderRadius: 8,
                          background: tone === "accent" ? `${col}12` : "rgba(255,255,255,.032)",
                          border: `1px solid ${tone === "accent" ? `${col}28` : "rgba(255,255,255,.055)"}`
                        }}>
                            <div style={{
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "rgba(255,255,255,.34)",
                            textTransform: "uppercase",
                            letterSpacing: ".04em",
                            marginBottom: 3
                          }}>{label}</div>
                            <div style={{
                            fontFamily: F.sans,
                            fontSize: 10,
                            color: tone === "accent" ? col : "rgba(255,255,255,.74)",
                            fontWeight: 800,
                            lineHeight: 1.15
                          }}>{value}</div>
                          </div>;
                        return <div key={z.id} className="town-list-item" style={{
                          borderRadius: 12,
                          border: `1px solid ${sel ? `${col}45` : "rgba(255,255,255,.035)"}`,
                          background: sel ? `${col}0a` : "rgba(255,255,255,.012)",
                          padding: "12px 14px",
                          transition: "all .2s ease"
                        }}>
                            <div style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "24px minmax(160px,1fr)" : "24px 1fr 180px 120px",
                            gap: 12,
                            alignItems: "center"
                          }}>
                              {/* Checkbox */}
                              <div onClick={() => {
                              if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id);
                            }} style={{
                              width: 18,
                              height: 18,
                              borderRadius: 5,
                              cursor: "pointer",
                              border: `2px solid ${coverageState !== "none" ? col : "rgba(255,255,255,.2)"}`,
                              background: coverageState === "full" ? col : coverageState === "partial" ? `${col}33` : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}>
                                {coverageState === "full" && <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>}
                                {coverageState === "partial" && <div style={{
                                width: 6,
                                height: 2,
                                background: col,
                                borderRadius: 1
                              }} />}
                              </div>

                              {/* Nome & Info */}
                              <div onClick={() => {
                              if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id);
                            }} style={{
                              cursor: isMovementStep2 || isBusinessStep2 && businessMetrics.clusterRows.length ? "default" : "pointer",
                              flex: 1
                            }}>
                                <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6
                              }}>
                                  {allocationMode === "priority" && searchMode === "municipality" && (() => {
                                  const order = comuniPriorityOrder.length ? comuniPriorityOrder : selZones.map(zz => zz.id);
                                  const pos = order.indexOf(z.id);
                                  return <div onClick={e => e.stopPropagation()} style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                    marginRight: 2
                                  }}>
                                        <button onClick={() => movePriorityZone(z.id, -1)} disabled={pos <= 0} style={{
                                      padding: 0,
                                      width: 16,
                                      height: 12,
                                      lineHeight: "10px",
                                      fontSize: 9,
                                      border: "1px solid rgba(255,255,255,.15)",
                                      borderRadius: 3,
                                      background: "rgba(255,255,255,.05)",
                                      color: pos <= 0 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
                                      cursor: pos <= 0 ? "default" : "pointer"
                                    }} title="Sposta su">▲</button>
                                        <button onClick={() => movePriorityZone(z.id, 1)} disabled={pos < 0 || pos >= order.length - 1} style={{
                                      padding: 0,
                                      width: 16,
                                      height: 12,
                                      lineHeight: "10px",
                                      fontSize: 9,
                                      border: "1px solid rgba(255,255,255,.15)",
                                      borderRadius: 3,
                                      background: "rgba(255,255,255,.05)",
                                      color: pos < 0 || pos >= order.length - 1 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
                                      cursor: pos < 0 || pos >= order.length - 1 ? "default" : "pointer"
                                    }} title="Sposta giù">▼</button>
                                      </div>;
                                })()}
                                  {allocationMode === "priority" && searchMode === "municipality" && <span style={{
                                  fontFamily: F.sans,
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: col,
                                  minWidth: 14
                                }}>
                                      {(comuniPriorityOrder.length ? comuniPriorityOrder : selZones.map(zz => zz.id)).indexOf(z.id) + 1}
                                    </span>}
                                  <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 13,
                                  fontWeight: coverageState !== "none" ? 700 : 400,
                                  color: coverageState !== "none" ? C.white : "rgba(255,255,255,.45)"
                                }}>{z.name}</div>
                                  {coverageState === "full" && <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(34,197,94,.15)",
                                  border: "1px solid rgba(34,197,94,.35)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "#22C55E",
                                  fontWeight: 800
                                }}><span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#22C55E",
                                    flexShrink: 0
                                  }} /> COPERTO</span>}
                                  {coverageState === "partial" && <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(250,204,21,.15)",
                                  border: "1px solid rgba(250,204,21,.35)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "#FACC15",
                                  fontWeight: 800
                                }}><span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#FACC15",
                                    flexShrink: 0
                                  }} /> PARZIALE</span>}
                                  {coverageState === "none" && <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(248,113,113,.15)",
                                  border: "1px solid rgba(248,113,113,.35)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "#F87171",
                                  fontWeight: 800
                                }}><span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#F87171",
                                    flexShrink: 0
                                  }} /> NON COPERTO</span>}
                                  {z.isNil && <span style={{
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: `${getComuneColor(z.id)}22`,
                                  border: `1px solid ${getComuneColor(z.id)}55`,
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: getComuneColor(z.id),
                                  fontWeight: 800
                                }}>NIL</span>}
                                  {z.isCap && <span style={{
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: "rgba(255,255,255,.1)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "rgba(255,255,255,.4)",
                                  fontWeight: 700
                                }}>CAP</span>}
                                  {z.source_flags?.includes('Stima territoriale') && <span style={{
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  background: "rgba(251,191,36,.15)",
                                  border: "1px solid rgba(251,191,36,.3)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: C.yellow,
                                  fontWeight: 700
                                }}>Stima territoriale</span>}
                                  {z.isFallback && <span style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(251,191,36,.18)",
                                  border: "1px solid rgba(251,191,36,.4)",
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "#FACC15",
                                  fontWeight: 800
                                }}>⏳ Dati parziali</span>}
                                </div>
                                <div style={{
                                fontFamily: F.sans,
                                fontSize: 9,
                                color: "rgba(255,255,255,.25)",
                                marginTop: 2
                              }}>
                                  {z.isFallback ? "Dati non disponibili — comune selezionato, in attesa dei dati API" : isResidentialStep2 ? `${Number(z.families ?? z.households ?? 0).toLocaleString("it-IT", {
                                  useGrouping: true
                                })} famiglie – ${Number(z.pop ?? z.population ?? 0).toLocaleString("it-IT", {
                                  useGrouping: true
                                })} ab. – ${Number(z.area ?? z.area_km2 ?? 0)} km² – ${Number(z.coverage ?? z.pct_copertura ?? 0)}% ${searchMode === "municipality" ? "di copertura" : "nel raggio"}` : isBusinessStep2 ? `${Number(z.targetBiz ?? 0)} target – ${Number(z.competitors ?? 0)} competitor – ${Number(z.clusters ?? 0)} cluster – ${z.topCats ?? ""}` : isMovementStep2 ? `${Number(z.poi ?? 0)} POI reali - ${Number(z.transit || 0)} nodi TPL/metro - score ${Number(z.strength ?? 0)}/100` : z.dist ? `${Number(z.dist).toFixed(1)} km dal centro` : "Zona nel raggio"}
                                </div>
                                {showTerritoryData && <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))",
                                gap: 6,
                                marginTop: 8
                              }}>
                                    {rowMetric(z.isNil ? `Famiglie comune ${city?.label || city?.name || ""} (contesto)` : isRadiusMode ? `Famiglie comune ${z.name} (contesto)` : isComuneMode ? "Totale stimato Comune" : `Dati comune ${city?.label || city?.name || ""} (contesto)`, zoneTotalFamilies > 0 ? formatIntegerIT(zoneTotalFamilies) : "N.D.")}
                                    {rowMetric(z.isNil ? "Famiglie coperte" : isRadiusMode ? "Famiglie nel raggio" : "Copertura stimata area selezionata", zoneAreaFamilies > 0 ? formatIntegerIT(z.isNil && assignedFlyers > 0 ? Math.min(zoneAreaFamilies, Math.round(zoneAreaFamilies * (coveragePercent / 100))) : zoneAreaFamilies) : "N.D.")}
                                    {rowMetric(z.isNil ? "Copertura fabbisogno zona" : isRadiusMode ? "Copertura del fabbisogno della zona" : "Copertura comune", `${coveragePercent}%`)}
                                    {rowMetric(z.isNil ? "Peso sull'area" : isRadiusMode ? "Peso sul raggio" : "Peso sul comune", zoneCoveragePct != null ? `${zoneCoveragePct}%` : "N.D.")}
                                    {rowMetric("Volantini assegnati", formatIntegerIT(assignedFlyers))}
                                    {rowMetric(z.isNil ? "Quantità consigliata zona" : "Quantità consigliata", requiredFlyers > 0 ? formatIntegerIT(requiredFlyers) : "N.D.", "accent")}
                                  </div>}
                              </div>

                              {/* Barra e Copertura */}
                              {sel ? <div>
                                  <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 4
                              }}>
                                    <span style={{
                                  fontFamily: F.sans,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: coverageState === "full" ? C.green : coverageState === "partial" ? "#22C55E" : "rgba(255,255,255,.38)",
                                  textTransform: "uppercase",
                                  letterSpacing: ".04em"
                                }}>
                                      {coverageLabel}
                                    </span>
                                    <span style={{
                                  fontFamily: F.sans,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: coverageState === "none" ? "rgba(255,255,255,.42)" : C.white
                                }}>{coveragePercent}%</span>
                                  </div>
                                  <div style={{
                                height: 5,
                                borderRadius: 3,
                                background: "rgba(255,255,255,.08)",
                                overflow: "hidden"
                              }}>
                                    <div style={{
                                  width: `${coveragePercent}%`,
                                  height: "100%",
                                  background: coverageState === "full" ? C.green : coverageState === "partial" ? "#22C55E" : "rgba(248,113,113,.35)",
                                  borderRadius: 3
                                }} />
                                  </div>
                                </div> : <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.2)",
                              fontStyle: "italic"
                            }}>Non selezionata</div>}

                              {/* Input/Valore Volantini */}
                              <div style={{
                              textAlign: "right"
                            }}>
                                {sel ? isManual ? <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-end"
                              }}>
                                      <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4
                                }}>
                                        <input type="number" value={manualAssignments[z.id] || 0} onChange={e => updateManual(z.id, e.target.value)} style={{
                                    width: 70,
                                    background: "rgba(0,0,0,.3)",
                                    border: `1px solid ${col}40`,
                                    borderRadius: 5,
                                    color: C.white,
                                    fontFamily: F.sans,
                                    fontSize: 12,
                                    padding: "4px 6px",
                                    textAlign: "right"
                                  }} />
                                        <span style={{
                                    fontFamily: F.sans,
                                    fontSize: 9,
                                    color: "rgba(255,255,255,.3)"
                                  }}>pz</span>
                                      </div>
                                      <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 8,
                                  color: "rgba(255,255,255,.3)",
                                  marginTop: 2
                                }}>di {alloc.requiredFlyers.toLocaleString("it-IT", {
                                    useGrouping: true
                                  })}</div>
                                    </div> : <div>
                                      {assignedFlyers === 0 ? <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 9,
                                  color: "rgba(255,255,255,.32)",
                                  fontStyle: "italic",
                                  lineHeight: 1.4,
                                  textAlign: "right"
                                }}>
                                          Non coperto dal budget attuale
                                        </div> : <>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>
                                            {assignedFlyers.toLocaleString("it-IT", {
                                      useGrouping: true
                                    })}
                                          </div>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 8,
                                    color: "rgba(255,255,255,.3)"
                                  }}>di {requiredFlyers.toLocaleString("it-IT", {
                                      useGrouping: true
                                    })} necessari</div>
                                        </>}
                                    </div> : <div style={{
                                fontFamily: F.sans,
                                fontSize: 11,
                                color: "rgba(255,255,255,.15)"
                              }}>{alloc.requiredFlyers.toLocaleString("it-IT", {
                                  useGrouping: true
                                })} pz</div>}
                              </div>
                            </div>
                          </div>;
                      })}
                      </div>)}
                    </div>

                    {/* Footer Avvisi */}
                    {selZones.length > 0 && (() => {
                    const formulaFamilies = Math.max(0, Math.round(Number(step2ViewModel.primaryFamiliesValue || 0)));
                    const formulaRecommended = Math.max(0, Math.round(Number(step2ViewModel.recommendedFlyersValue || 0)));
                    const formulaMarginFlyers = Math.max(0, formulaRecommended - formulaFamilies);
                    const formulaMarginPct = formulaFamilies > 0 ? formulaMarginFlyers / formulaFamilies * 100 : null;
                    const DASHBOARD_PREVIEW_CARDS = [{
                      icon: "pin",
                      title: "Monitoraggio live",
                      color: "#38BDF8"
                    }, {
                      icon: "chart",
                      title: "KPI e copertura",
                      color: "#4ADE80"
                    }, {
                      icon: "camera",
                      title: "Foto e report",
                      color: "#F87171"
                    }, {
                      icon: "map",
                      title: "Analisi territoriale",
                      color: "#FBBF24"
                    }];
                    const dashboardPreviewBox = <div style={{
                      background: "linear-gradient(180deg, rgba(56,189,248,.07) 0%, rgba(255,255,255,.02) 100%)",
                      borderRadius: 14,
                      padding: isMobile ? "14px" : "16px 18px",
                      border: "1px solid rgba(56,189,248,.35)",
                      boxShadow: "0 10px 30px rgba(0,0,0,.3)"
                    }}>
                          <div style={{
                        marginBottom: 16
                      }}>
                            <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 8
                        }}>
                              <div style={{
                            fontFamily: F.sans,
                            fontSize: 15,
                            fontWeight: 900,
                            color: C.white,
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                          }}>
                                <Step1Icon name="chart" size={18} />
                                <span>Dashboard Campagna inclusa dopo la conferma</span>
                              </div>
                              <span style={{
                            padding: "3px 10px",
                            borderRadius: 100,
                            background: "rgba(56, 189, 248, .18)",
                            color: "#38BDF8",
                            border: "1px solid rgba(56, 189, 248, .35)",
                            fontFamily: F.sans,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: ".06em",
                            textTransform: "uppercase"
                          }}>
                                Preview
                              </span>
                            </div>
                            <div style={{
                          fontFamily: F.sans,
                          fontSize: 12,
                          color: "rgba(255,255,255,.68)",
                          lineHeight: 1.5
                        }}>
                              Monitora avanzamento, GPS, foto, KPI e report della distribuzione.
                            </div>
                          </div>

                          <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                        gap: 8
                      }}>
                            {DASHBOARD_PREVIEW_CARDS.map(card => <div key={card.title} style={{
                          background: "rgba(255,255,255,.03)",
                          borderRadius: 10,
                          padding: "12px 14px",
                          border: "1px solid rgba(255,255,255,.07)",
                          display: "flex",
                          gap: 7,
                          alignItems: "center"
                        }}>
                                <Step1Icon name={card.icon} size={15} color={card.color} />
                                <span style={{
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 800,
                            color: card.color
                          }}>{card.title}</span>
                              </div>)}
                          </div>
                        </div>;
                    return <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      padding: "12px",
                      background: "rgba(0,0,0,.15)",
                      borderTop: "1px solid rgba(255,255,255,.05)"
                    }}>
                          {allocationMode === "auto" ? <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10
                      }}>
                              <div style={{
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: 800,
                          color: C.white,
                          letterSpacing: ".05em",
                          textTransform: "uppercase"
                        }}>Copertura e scelta quantità</div>
                              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 10 }}>
                                <article style={{ padding: 14, border: "1px solid rgba(255,255,255,.09)", borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                                  <span style={{ display: "block", marginBottom: 5, color: "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Scenario attuale</span>
                                  <strong className="vp-data-number" style={{ display: "block", color: C.white, fontFamily: F.sans, fontSize: 19, fontWeight: 900 }}>{formatIntegerIT(step2TruthModel.quantity.current)} volantini</strong>
                                  <dl style={{ display: "grid", gap: 7, margin: "13px 0 0", padding: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Copertura scenario corrente</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2CoverageFullLabel || "Dato non disponibile"}</dd></div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Zone coinvolte / disponibili</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.zones.involved} / {step2TruthModel.zones.available}</dd></div>
                                  </dl>
                                </article>
                                <article style={{ padding: 14, border: "1px solid rgba(34,197,94,.25)", borderRadius: 12, background: "rgba(34,197,94,.055)" }}>
                                  <span style={{ display: "block", marginBottom: 5, color: "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Scenario consigliato</span>
                                  <strong className="vp-data-number" style={{ display: "block", color: "#4ADE80", fontFamily: F.sans, fontSize: 19, fontWeight: 900 }}>{formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} volantini</strong>
                                  <dl style={{ display: "grid", gap: 7, margin: "13px 0 0", padding: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Margine operativo</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.quantity.operationalMargin > 0 ? `+${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.` : "Nessun margine aggiuntivo"}</dd></div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Copertura prevista</dt><dd style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.quantity.recommendedRequirement > 0 ? "100% del fabbisogno operativo" : "Dato non disponibile"}</dd></div>
                                  </dl>
                                </article>
                              </div>
                              <div hidden>
                              <div style={{
                            background: "rgba(255,255,255,.03)",
                            border: "1px solid rgba(255,255,255,.08)",
                            borderRadius: 12,
                            padding: 14
                          }}>
                                {showTerritoryData && formulaFamilies > 0 && formulaRecommended > 0 && <div style={{
                              padding: "12px 14px",
                              borderRadius: 10,
                              background: `${col}10`,
                              border: `1px solid ${col}2f`,
                              marginBottom: 14
                            }}>
                                    <div style={{
                                fontFamily: F.sans,
                                fontSize: 12,
                                color: "rgba(255,255,255,.88)",
                                lineHeight: 1.55
                              }}>
                                      <strong className="vp-data-number">{formatIntegerIT(formulaFamilies)}</strong> famiglie
                                      {formulaMarginPct != null && formulaMarginFlyers > 0 && <> + <strong>{formatPercentIT(formulaMarginPct, Math.abs(formulaMarginPct - Math.round(formulaMarginPct)) < 0.05 ? 0 : 1)}</strong> margine operativo (<strong className="vp-data-number">+{formatIntegerIT(formulaMarginFlyers)}</strong>)</>}
                                      {formulaMarginFlyers === 0 && <> + nessun margine aggiuntivo</>}
                                      {' = '}<strong className="vp-data-number" style={{
                                  color: col
                                }}>{formatIntegerIT(formulaRecommended)} volantini consigliati</strong>
                                    </div>
                                    <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                gap: 8,
                                marginTop: 10
                              }}>
                                      {[["Famiglie stimate", formatIntegerIT(formulaFamilies)], ["Margine operativo", `+${formatIntegerIT(formulaMarginFlyers)}`], ["Quantità consigliata", formatIntegerIT(formulaRecommended)]].map(([label, value]) => <div key={label} style={{
                                  padding: "8px 9px",
                                  borderRadius: 8,
                                  background: "rgba(255,255,255,.04)"
                                }}>
                                          <div style={{
                                    fontSize: 9,
                                    color: "rgba(255,255,255,.45)",
                                    marginBottom: 3
                                  }}>{label}</div>
                                          <div className="vp-data-number" style={{
                                    fontSize: 13,
                                    fontWeight: 800,
                                    color: C.white
                                  }}>{value}</div>
                                        </div>)}
                                    </div>
                                  </div>}
                                <div style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                              marginBottom: 14
                            }}>
                                  {isRadiusMode ? <>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Area selezionata</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{city ? city.name : activeCampaignZone?.cityName || "Area"} · raggio {radiusKm || radius} km</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>{isNilAnalysis ? `Famiglie nell'area ${radiusKm || radius} km` : `Famiglie totali area ${radiusKm || radius} km`}</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{formatIntegerIT(serviceKpis?.families || 0)}</div>
                                      </div>
                                      {isNilAnalysis && <div>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>NIL intersecate</div>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{summaryComuniStats.total}</div>
                                        </div>}
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Quantità inserita</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{formatIntegerIT(flyerQuantityFromStep1)}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Quantità consigliata area {radiusKm || radius} km</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{formatIntegerIT(requiredFlyers > 0 ? requiredFlyers : serviceKpis?.recommendedFlyers || 0)}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Copertura complessiva del raggio</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: isPartial ? "#22C55E" : C.green
                                  }}>{sharedCoveragePctText}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Quantità mancante</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "#22C55E"
                                  }}>{formatIntegerIT(missingFlyers > 0 ? missingFlyers : Math.max(0, (requiredFlyers || serviceKpis?.recommendedFlyers || 0) - flyerQuantityFromStep1))}</div>
                                      </div>
                                    </> : <>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>{municipalityTotalFamiliesRowLabel}</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: municipalityTotalFamilies != null ? C.white : "rgba(255,255,255,.55)"
                                  }}>{municipalityTotalFamiliesLabel}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Copertura stimata area selezionata</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{selectedAreaFamiliesLabel}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Zona</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{step2ViewModel.primaryAreaLabel || (city ? city.name : activeCampaignZone?.cityName || "Area")}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>{isNilAnalysis ? "Zone NIL coinvolte" : "Comuni coinvolti"}</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{selZones.length || zonesInRadius.length}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Quantità inserita</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: C.white
                                  }}>{formatIntegerIT(flyerQuantityFromStep1)}</div>
                                      </div>
                                      <div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>{step2ViewModel.primaryCoverageLabel || (areaMode === "full_municipality" ? "Copertura comune" : "Copertura area selezionata")}</div>
                                        <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: isPartial ? "#22C55E" : C.green
                                  }}>{sharedCoveragePctText}</div>
                                      </div>
                                      {areaMode === "custom_zone" && zoneCoveragePctForBox != null && <div>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 10,
                                    color: "rgba(255,255,255,.45)"
                                  }}>Incidenza sul comune</div>
                                          <div style={{
                                    fontFamily: F.sans,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "rgba(255,255,255,.6)"
                                  }}>{zoneCoveragePctForBox}%</div>
                                        </div>}
                                      {isPartial && <>
                                          <div>
                                            <div style={{
                                      fontFamily: F.sans,
                                      fontSize: 10,
                                      color: "rgba(255,255,255,.45)"
                                    }}>Quantità consigliata</div>
                                            <div style={{
                                      fontFamily: F.sans,
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: C.white
                                    }}>{formatIntegerIT(requiredFlyers)}</div>
                                          </div>
                                          <div>
                                            <div style={{
                                      fontFamily: F.sans,
                                      fontSize: 10,
                                      color: "rgba(255,255,255,.45)"
                                    }}>Quantità mancante</div>
                                            <div style={{
                                      fontFamily: F.sans,
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: "#22C55E"
                                    }}>{formatIntegerIT(missingFlyers)}</div>
                                          </div>
                                        </>}
                                    </>}
                                </div>
                              </div>
                              </div>

                                {isPartial ? <div style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12
                        }}>
                                    <div style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            background: "rgba(34, 197, 94,.08)",
                            border: "1px solid rgba(34, 197, 94,.28)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10
                          }}>
                                      <span style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: `${"#22C55E"}22`,
                              color: "#22C55E",
                              fontFamily: F.sans,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase"
                            }}>Copertura parziale</span>
                                      <div style={{
                              fontFamily: F.sans,
                              fontSize: 12,
                              color: "rgba(255,255,255,.8)",
                              lineHeight: 1.4
                            }}>
                                        Con {Number(availableFlyers || 0).toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini puoi coprire {step2CoverageFullLabel || "una quota non calcolabile del fabbisogno operativo"}. Denominatore: {step2RequirementContextLabel}. Per copertura completa stimiamo {requiredFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini. Scegli la quantita finale da portare al preventivo.
                                      </div>
                                    </div>

                                    {coverageDecision === "keepCurrent" && <div style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            background: "rgba(46,204,138,.08)",
                            border: "1px solid rgba(46,204,138,.28)",
                            fontFamily: F.sans,
                            fontSize: 12,
                            color: C.green,
                            fontWeight: 700,
                            textAlign: "center"
                          }}>
                                        Quantita disponibile confermata. Puoi modificare la scelta qui sotto.
                                      </div>}
                                    <div style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            gap: 8
                          }}>
                                      <button onClick={() => selectCoverageQuantityDecision("keepCurrent")} aria-pressed={coverageDecision === "keepCurrent"} data-selected={coverageDecision === "keepCurrent" ? "true" : "false"} aria-label={`Mantieni ${Number(availableFlyers || 0).toLocaleString("it-IT", {
                              useGrouping: true
                            })} volantini`} style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageDecision === "keepCurrent" ? "rgba(46,204,138,.16)" : "transparent",
                              color: C.white,
                              border: `1px solid ${coverageDecision === "keepCurrent" ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.3)"}`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        {coverageDecision === "keepCurrent" ? "[x] " : ""}Mantieni {Number(availableFlyers || 0).toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini
                                      </button>
                                      <button onClick={() => selectCoverageQuantityDecision("useRecommended")} aria-pressed={coverageDecision === "useRecommended"} data-selected={coverageDecision === "useRecommended" ? "true" : "false"} aria-label={`Aumenta a ${requiredFlyers.toLocaleString("it-IT", {
                              useGrouping: true
                            })} volantini`} style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageDecision === "useRecommended" ? col : `${col}22`,
                              color: C.white,
                              border: `1px solid ${coverageDecision === "useRecommended" ? col : `${col}66`}`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        {coverageDecision === "useRecommended" ? "[x] " : ""}Aumenta a {requiredFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini
                                      </button>
                                      <button onClick={() => selectCoverageQuantityDecision("manual")} aria-pressed={coverageDecision === "manual"} data-selected={coverageDecision === "manual" ? "true" : "false"} aria-label="Modifica manualmente la quantita" style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageDecision === "manual" ? `${col}22` : "transparent",
                              color: col,
                              border: `1px solid ${coverageDecision === "manual" ? col : `${col}45`}`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        {coverageDecision === "manual" ? "[x] " : ""}Modifica manualmente
                                      </button>
                                    </div>
                                    {coverageDecision === "manual" && <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6
                          }}>
                                        <input type="number" min="1" value={manualFlyers} onChange={e => updateManualFlyersQuantity(e.target.value)} placeholder="Quantita manuale" aria-label="Quantita manuale volantini" style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1px solid ${isCoverageDecisionValid ? "rgba(46,204,138,.45)" : "rgba(248,113,113,.45)"}`,
                              background: "rgba(255,255,255,.05)",
                              color: C.white,
                              fontFamily: F.sans,
                              fontSize: 12,
                              fontWeight: 700
                            }} />
                                        {!isCoverageDecisionValid && <div style={{
                              fontFamily: F.sans,
                              fontSize: 11,
                              color: "rgba(248,113,113,.92)"
                            }}>
                                            Inserisci una quantita maggiore di 0 e attendi la ripartizione coerente.
                                          </div>}
                                      </div>}
                                  </div> : hasSurplus ? <div style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12
                        }}>
                                    <div style={{
                            padding: "10px 14px",
                            background: "rgba(46,204,138,.08)",
                            border: "1px solid rgba(46,204,138,.2)",
                            borderRadius: 10,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10
                          }}>
                                      <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10
                            }}>
                                        <span style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: `${C.green}22`,
                                color: C.green,
                                fontFamily: F.sans,
                                fontSize: 10,
                                fontWeight: 800,
                                textTransform: "uppercase"
                              }}>Copertura completa raggiunta</span>
                                      </div>
                                      <div style={{
                              fontFamily: F.sans,
                              fontSize: 12,
                              fontWeight: 500,
                              color: "rgba(255,255,255,.8)",
                              lineHeight: 1.5
                            }}>
                                        Hai inserito {flyerQuantityFromStep1.toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini. Per coprire {city?.name || "l'area selezionata"} la quantità consigliata è circa {requiredFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })}. I volantini residui sono {surplusFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })}.
                                      </div>
                                      <div style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3,1fr)",
                              gap: 8
                            }}>
                                        <div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 10,
                                  color: "rgba(255,255,255,.45)"
                                }}>Quantità inserita</div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: C.white
                                }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                                    useGrouping: true
                                  })}</div>
                                        </div>
                                        <div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 10,
                                  color: "rgba(255,255,255,.45)"
                                }}>Quantità consigliata</div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: C.white
                                }}>{requiredFlyers.toLocaleString("it-IT", {
                                    useGrouping: true
                                  })}</div>
                                        </div>
                                        <div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 10,
                                  color: "rgba(255,255,255,.45)"
                                }}>Volantini residui</div>
                                          <div style={{
                                  fontFamily: F.sans,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: C.orange
                                }}>{surplusFlyers.toLocaleString("it-IT", {
                                    useGrouping: true
                                  })}</div>
                                        </div>
                                      </div>
                                    </div>

                                    {coverageStrategy && <div style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            background: "rgba(46,204,138,.08)",
                            border: "1px solid rgba(46,204,138,.28)",
                            fontFamily: F.sans,
                            fontSize: 12,
                            color: C.green,
                            fontWeight: 700
                          }}>
                                        {coverageStrategy === "reduce_to_recommended" && `Quantità ridotta a ${requiredFlyers.toLocaleString("it-IT", {
                              useGrouping: true
                            })} volantini.`}
                                        {coverageStrategy === "extra_frequency" && "Useremo i volantini extra per rinforzare le zone migliori / secondo passaggio dove utile."}
                                        {coverageStrategy === "expand_area" && "Espansione area richiesta — passa a modalità Raggio o aggiungi comuni vicini per usare tutti i volantini."}
                                      </div>}

                                    <div style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            gap: 8
                          }}>
                                        <button onClick={() => {
                              selectCoverageQuantityDecision("useRecommended");
                              setCoverageStrategy("reduce_to_recommended");
                              debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "reduce_to_recommended");
                            }} aria-pressed={coverageStrategy === "reduce_to_recommended"} data-selected={coverageStrategy === "reduce_to_recommended" ? "true" : "false"} style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageStrategy === "reduce_to_recommended" ? col : `${col}22`,
                              color: C.white,
                              border: `1px solid ${col}66`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        Adatta a {requiredFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })} volantini
                                      </button>
                                        <button onClick={() => {
                              setCoverageStrategy("extra_frequency");
                              selectCoverageQuantityDecision("keepCurrent");
                              debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "extra_frequency");
                            }} aria-pressed={coverageStrategy === "extra_frequency"} data-selected={coverageStrategy === "extra_frequency" ? "true" : "false"} style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageStrategy === "extra_frequency" ? "rgba(46,204,138,.16)" : "transparent",
                              color: C.white,
                              border: `1px solid ${coverageStrategy === "extra_frequency" ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.3)"}`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        Mantieni {flyerQuantityFromStep1.toLocaleString("it-IT", {
                                useGrouping: true
                              })}
                                      </button>
                                        <button onClick={() => {
                              setCoverageStrategy("expand_area");
                              selectCoverageQuantityDecision("keepCurrent");
                              debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "expand_area");
                            }} aria-pressed={coverageStrategy === "expand_area"} data-selected={coverageStrategy === "expand_area" ? "true" : "false"} style={{
                              flex: 1,
                              padding: "9px 12px",
                              borderRadius: 8,
                              background: coverageStrategy === "expand_area" ? `${col}22` : "transparent",
                              color: col,
                              border: `1px solid ${col}45`,
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer"
                            }}>
                                        Espandi area
                                      </button>
                                    </div>

                                    {coverageStrategy === "expand_area" && <div style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            gap: 8,
                            alignItems: isMobile ? "stretch" : "center",
                            padding: "10px 14px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,.03)",
                            border: "1px solid rgba(255,255,255,.08)"
                          }}>
                                        <div style={{
                              flex: 1,
                              fontFamily: F.sans,
                              fontSize: 11,
                              color: "rgba(255,255,255,.6)"
                            }}>
                                          Passa a modalità Raggio per includere i comuni vicini, oppure resta su Comune.
                                        </div>
                                        <button onClick={switchToRadiusMode} style={{
                              padding: "8px 14px",
                              borderRadius: 8,
                              background: col,
                              color: C.white,
                              border: "none",
                              fontFamily: F.sans,
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: "pointer",
                              whiteSpace: "nowrap"
                            }}>
                                          Passa a modalità Raggio
                                        </button>
                                      </div>}
                                  </div> : <div style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12
                        }}>
                                    <div style={{
                            padding: "10px 14px",
                            background: "rgba(46,204,138,.08)",
                            border: "1px solid rgba(46,204,138,.2)",
                            borderRadius: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 10
                          }}>
                                      <span style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: `${C.green}22`,
                              color: C.green,
                              fontFamily: F.sans,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: "uppercase"
                            }}>Copertura completa</span>
                                      <div style={{
                              fontFamily: F.sans,
                              fontSize: 12,
                              fontWeight: 500,
                              color: "rgba(255,255,255,.8)"
                            }}>La quantità inserita è sufficiente per coprire l’area selezionata.</div>
                                    </div>
                                  </div>}
                              </div> : (/* Manual Mode Footer */
                      <div style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10
                      }}>
                              {isInvalid ? <div style={{
                          background: "rgba(248,113,113,.1)",
                          border: "1px solid rgba(248,113,113,.3)",
                          borderRadius: 10,
                          padding: "10px 14px"
                        }}>
                                  <div style={{
                            fontFamily: F.sans,
                            fontSize: 12,
                            fontWeight: 700,
                            color: C.red,
                            marginBottom: 4
                          }}>Errore assegnazione</div>
                                  <div style={{
                            fontFamily: F.sans,
                            fontSize: 11,
                            color: "rgba(255,255,255,.7)"
                          }}>
                                    Hai assegnato <b style={{
                              color: C.white
                            }}>{totalAssigned.toLocaleString("it-IT", {
                                useGrouping: true
                              })}</b> volantini, ma ne hai disponibili solo <b style={{
                              color: C.white
                            }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                                useGrouping: true
                              })}</b>.
                                    Riduci una zona o aumenta la quantità.
                                  </div>
                                </div> : <div style={{
                          background: "rgba(46,204,138,.08)",
                          border: "1px solid rgba(46,204,138,.2)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                                  <div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 12,
                              fontWeight: 700,
                              color: C.green
                            }}>Assegnazione manuale valida.</div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.4)",
                              marginTop: 2
                            }}>
                                      {remainingFlyers > 0 ? `Volantini residui: ${remainingFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })}` : "Tutti i volantini sono stati assegnati."}
                                    </div>
                                  </div>
                                </div>}
                              <div style={{
                          display: "flex",
                          gap: 8
                        }}>
                                {isInvalid && <button onClick={() => setData(d => ({
                            ...d,
                            qty: totalAssigned,
                            flyerQuantity: totalAssigned
                          }))} style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            background: col,
                            color: C.white,
                            border: "none",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer"
                          }}>
                                    Aumenta quantità a {totalAssigned.toLocaleString("it-IT", {
                              useGrouping: true
                            })}
                                  </button>}
                                <button onClick={() => setAllocationMode("auto")} style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,.08)",
                            color: "rgba(255,255,255,.6)",
                            border: "1px solid rgba(255,255,255,.1)",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer"
                          }}>
                                  Ripristina automatico
                                </button>
                                {!isInvalid && hasAtLeastOne && <button onClick={handleNext} style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            background: col,
                            color: C.white,
                            border: "none",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            marginLeft: "auto"
                          }}>
                                    Continua con distribuzione manuale
                                  </button>}
                              </div>
                            </div>)}

                        </div>;
                  })()}
                  </div>}
    </>
  );
}
