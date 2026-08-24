import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT } from "../../../../lib/utils/format.js";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { Step2BottomActions } from "./Step2BottomActions.jsx";
import { Step2SynthesisMessage } from "./Step2SynthesisMessage.jsx";

export function Step2SummaryPanel({ activeCampaignZone, areaMode, canContinueCalendar, col, continueLabel, coverageDecisionReady, finalFlyersRounded, handleNext, hasUnconfirmedAddressPoint, isBusinessStep2, isMobile, isMovementStep2, isResidentialStep2, operationalSelectionReady, radius, radiusKm, selZones, selectedOperationalPois, setIsAdminView, showTerritoryData, step2CoveragePctLabel, step2RequirementContextLabel, step2TruthModel, step2ViewModel, step2ZonesReady, zonesInRadius }) {
  return (
    <>
      {/* RIGHT COLUMN - ACTIVE ZONE SUMMARY */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          position: isMobile ? "static" : "sticky",
          top: 20,
          alignSelf: "start"
        }}>
          {activeCampaignZone && <div style={{
            background: "rgba(255,255,255,.025)",
            borderRadius: 10,
            padding: "10px 12px",
            border: `1px solid rgba(255,255,255,.06)`
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 900,
                color: col,
                letterSpacing: ".08em",
                textTransform: "uppercase"
              }}>Zona attiva</div>

              </div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 22,
              color: C.white,
              lineHeight: 1,
              marginBottom: 4
            }}>{activeCampaignZone.zone_label || "Zona"}</div>
              <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.46)",
              lineHeight: 1.45
            }}>
                {step2ViewModel.primaryAreaLabel} · {isBusinessStep2 ? `${selectedOperationalPois.length} attività selezionate` : `Quantità assegnata: ${formatIntegerIT(finalFlyersRounded)} volantini`}
              </div>
            </div>}
          {/* GRUPPO A: RISULTATI DELLA CONFIGURAZIONE */}
          {(selZones.length > 0 || zonesInRadius.length > 0 || activeCampaignZone) && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            padding: "18px 20px",
            border: `1px solid ${col}30`
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 14
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                color: col,
                letterSpacing: ".06em",
                textTransform: "uppercase"
              }}>{hasUnconfirmedAddressPoint ? "Anteprima del NIL vicino" : "Risultato della configurazione"}</span>
              </div>
              <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 14
            }}>

                {/* Famiglie / POI / Aziende — da step2ViewModel (fonte unica) */}
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                paddingBottom: 10,
                borderBottom: "1px solid rgba(255,255,255,.05)"
              }}>
                  <div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.5)",
                    marginBottom: 2
                  }}>{step2ViewModel.primaryFamiliesLabel}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: step2ViewModel.hasUsableCoverageData || !isResidentialStep2 ? 28 : 14,
                    fontWeight: 800,
                    color: C.white,
                    lineHeight: 1.2
                  }}>
                      {showTerritoryData && !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : formatIntegerIT(step2ViewModel.primaryFamiliesValue)}
                    </div>
                  </div>
                  <span style={{
                  opacity: .65
                }}><Step1Icon name={isResidentialStep2 ? "family" : isMovementStep2 ? "pin" : "building"} size={24} /></span>
                </div>

                {/* Copertura */}
                {!isBusinessStep2 && step2TruthModel.coverage.operationalPct != null && <div style={{
                paddingBottom: 12,
                borderBottom: "1px solid rgba(255,255,255,.05)"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.5)",
                  marginBottom: 4
                }}>Copertura operativa dello scenario corrente</div>
                    <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8
                }}>
                      <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.green,
                    lineHeight: 1
                  }}>{step2CoveragePctLabel}</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.62)",
                    lineHeight: 1.35
                  }}>del fabbisogno operativo</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.45)",
                    lineHeight: 1.35
                  }}>{formatIntegerIT(step2TruthModel.quantity.current)} ÷ {formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.</div>
                    </div>
                    <div style={{
                  marginTop: 5,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.38)"
                }}>Denominatore: {step2RequirementContextLabel}.</div>
                  </div>}

                {showTerritoryData && <div style={{
                padding: 13,
                borderRadius: 11,
                background: `${col}12`,
                border: `1px solid ${col}30`,
                boxShadow: `0 12px 30px ${col}10`
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: col,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  marginBottom: 5
                }}>{step2ViewModel.recommendedFlyersLabel}</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: step2ViewModel.hasUsableCoverageData ? 27 : 14,
                  fontWeight: 900,
                  color: C.white,
                  lineHeight: 1.2
                }}>{step2ViewModel.hasUsableCoverageData ? formatIntegerIT(step2ViewModel.recommendedFlyersValue) : "Dato non disponibile"}</div>
                    {step2ViewModel.hasUsableCoverageData ? <>
                        <div style={{
                    marginTop: 6,
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.56)",
                    lineHeight: 1.35
                  }}>Per copertura completa {areaMode === "radius" ? `dell'area ${radiusKm || radius} km` : areaMode === "full_municipality" ? "del comune" : "dell'area selezionata"}</div>
                        <div style={{
                    marginTop: 5,
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.42)",
                    lineHeight: 1.35
                  }}>Il fabbisogno consigliato include il margine operativo previsto dai dati territoriali disponibili.</div>
                      </> : <div style={{
                  marginTop: 6,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.5)",
                  lineHeight: 1.35
                }}>Il fabbisogno non può essere calcolato senza dati territoriali validi.</div>}
                  </div>}

                {/* Comuni, volantini, raggio su 3 colonne */}
                <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8
              }}>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? "Attività selezionate" : step2ViewModel.availableNilCount > 0 ? "Zone coinvolte / disponibili" : step2ViewModel.zoneCountLabel}</div>
                    <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: showTerritoryData && !step2ViewModel.hasUsableCoverageData ? 12 : 18,
                    fontWeight: 800,
                    color: C.white
                  }}>{isBusinessStep2 ? selectedOperationalPois.length : showTerritoryData && !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : `${step2TruthModel.zones.involved} / ${step2TruthModel.zones.available}`}</div>
                  </div>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? "Materiali necessari" : "Quantità inserita"}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 15,
                    fontWeight: 800,
                    color: C.blue,
                    lineHeight: 1.1
                  }}>{isBusinessStep2 ? businessMaterialPlan?.materialsRequired == null ? "Da definire" : formatIntegerIT(businessMaterialPlan.materialsRequired) : formatIntegerIT(step2TruthModel.quantity.current)}</div>
                  </div>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? Number(businessMaterialPlan?.materialsMissing) > 0 ? "Materiali mancanti" : "Materiali residui" : !step2ViewModel.hasUsableCoverageData ? "Bilancio quantità" : step2TruthModel.quantity.missing > 0 ? "Quantità mancante" : "Quantità oltre fabbisogno"}</div>
                    <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: 15,
                    fontWeight: 800,
                    color: (isBusinessStep2 ? Number(businessMaterialPlan?.materialsMissing) > 0 : step2ViewModel.hasUsableCoverageData && step2TruthModel.quantity.missing > 0) ? "#FBBF24" : C.green
                  }}>{isBusinessStep2 ? businessMaterialPlan?.materialsRequired == null ? "Da definire" : `${formatIntegerIT(Number(businessMaterialPlan.materialsMissing) > 0 ? businessMaterialPlan.materialsMissing : businessMaterialPlan.materialsRemaining)} pz.` : !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : `${formatIntegerIT(step2TruthModel.quantity.missing > 0 ? step2TruthModel.quantity.missing : step2TruthModel.quantity.surplus)} pz.`}</div>
                  </div>
                </div>

                {/* 7. Messaggio umano di sintesi (Fase 1) */}
                <Step2SynthesisMessage
                  step2TruthModel={step2TruthModel}
                  step2ViewModel={step2ViewModel}
                  formatIntegerIT={formatIntegerIT}
                  isResidentialStep2={isResidentialStep2}
                  missingFlyers={missingFlyers}
                  step2CoverageFullLabel={step2CoverageFullLabel}
                  step2RequirementContextLabel={step2RequirementContextLabel}
                  isMovementStep2={isMovementStep2}
                  pois={pois}
                  transportState={transportState}
                />

              </div>
            </div>}

          {/* GRUPPO B: OUTPUT DEL SERVIZIO SELEZIONATO (SINTETICO MAX 4 KPI) */}
          {(selZones.length > 0 || zonesInRadius.length > 0 || activeCampaignZone) && (() => {
            const activeServiceOutputs = isResidentialStep2 ? residentialMainOutputsNormalized : isMovementStep2 ? h2hMainOutputs : [{
              l: "Attività disponibili",
              v: formatIntegerIT(pois.length),
              u: "att.",
              src: "OpenStreetMap / fonti collegate",
              c: "#A78BFA"
            }, {
              l: "Attività selezionate",
              v: formatIntegerIT(selectedOperationalPois.length),
              u: "att.",
              src: "Selezione cliente",
              c: "#4ADE80"
            }, businessMaterialPlan?.materialsRequired != null ? {
              l: "Materiali necessari",
              v: formatIntegerIT(businessMaterialPlan.materialsRequired),
              u: "pz.",
              src: "Copie per attività",
              c: "#38BDF8"
            } : null, businessOperationalPlan?.calculable ? {
              l: "Giornate-addetto",
              v: businessOperationalPlan.operatorDays,
              u: "",
              src: "Tempo medio per visita",
              c: "#FBBF24"
            } : null].filter(Boolean);
            const activeServiceTitle = isResidentialStep2 ? "Output Door to Door" : isMovementStep2 ? "Output Hand to Hand" : "Output Business Distribution";
            const baseDisplayOutputs = Array.isArray(activeServiceOutputs) ? activeServiceOutputs : [];
            const displayOutputs = [...baseDisplayOutputs.map(item => item.l === "Copertura stimata" ? {
              ...item,
              l: "Copertura operativa",
              v: step2CoverageFullLabel || item.v,
              u: "",
              src: "Fabbisogno operativo"
            } : item), ...(isResidentialStep2 && step2TruthModel.duration.calculable ? [{
              l: "Durata calendario",
              v: step2TruthModel.duration.days,
              u: "giorni",
              src: null
            }] : [])];
            return <div style={{
              background: "rgba(255,255,255,.04)",
              borderRadius: 12,
              padding: "18px 20px",
              border: `1px solid ${col}30`
            }}>
                <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 14
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: col,
                  letterSpacing: ".06em",
                  textTransform: "uppercase"
                }}>Report Territoriale Avanzato</span>
                </div>
                <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 10
              }}>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,.62)",
                  lineHeight: 1.45
                }}>
                    Approfondisci demografia, NIL, mobilità, attività, mercato immobiliare, score e fonti realmente disponibili per la zona selezionata.
                  </div>
                  {displayOutputs.map((item, idx) => <div key={idx} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingBottom: idx < displayOutputs.length - 1 ? 8 : 0,
                  borderBottom: idx < displayOutputs.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none"
                }}>
                      <div>
                        <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(255,255,255,.82)"
                    }}>{item.l}</div>
                        {item.src && <div style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: "rgba(255,255,255,.4)"
                    }}>Fonte: {item.src}</div>}
                      </div>
                      <div style={{
                    textAlign: "right"
                  }}>
                        <div style={{
                      fontFamily: F.sans,
                      fontSize: 14,
                      fontWeight: 800,
                      color: item.c || C.white
                    }}>{item.v != null && item.v !== "" ? `${item.v}${item.u && item.u !== "" && !String(item.v).includes(item.u) ? ` ${item.u}` : ""}` : "—"}</div>
                      </div>
                    </div>)}
                </div>
                <button onClick={() => setIsAdminView(true)} style={{
                marginTop: 14,
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                background: `${col}1F`,
                border: `1px solid ${col}59`,
                color: col,
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all .2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}>
                  <Step1Icon name="chart" size={14} /> Apri Analisi Avanzata
                </button>
              </div>;
          })()}

          {/* Bottom actions container (Sempre visibile in fondo al rail) */}
          <Step2BottomActions
            step2ZonesReady={step2ZonesReady}
            coverageDecisionReady={coverageDecisionReady}
            canContinueCalendar={canContinueCalendar}
            handleNext={handleNext}
            col={col}
            continueLabel={continueLabel}
            operationalSelectionReady={operationalSelectionReady}
            isMovementStep2={isMovementStep2}
            isBusinessStep2={isBusinessStep2}
          />
        </div>
    </>
  );
}
