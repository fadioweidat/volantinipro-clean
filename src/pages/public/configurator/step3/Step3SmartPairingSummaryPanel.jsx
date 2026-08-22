import React from "react";
import { motion } from "framer-motion";
import { NavButton } from "../../../../components/NavButton.jsx";
import { C, F } from "../../../../lib/constants.js";

export function Step3SmartPairingSummaryPanel({ isMobile, realSmartPairingSlots, pairingDays, formSent, svcLabel, compactZoneLabel, allZonesList, showZoneDetails, setShowZoneDetails, activeQty, averagePairingDiscount, handlePrimary, navError, handleSkipPairing, handleBackToZone }) {
  return (
    <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: isMobile ? "relative" : "sticky",
        top: 24
      }}>
          <div style={{
          background: "rgba(255,255,255,.04)",
          borderRadius: 20,
          padding: "24px",
          border: "1px solid rgba(255,255,255,.1)",
          boxShadow: "0 14px 35px rgba(0,0,0,0.3)"
        }}>
            <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,.08)"
          }}>
              <span style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,.4)",
              textTransform: "uppercase",
              letterSpacing: ".1em"
            }}>Riepilogo Smart Pairing</span>
              <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: realSmartPairingSlots.length > 0 ? C.green : C.yellow,
              boxShadow: `0 0 10px ${realSmartPairingSlots.length > 0 ? C.green : C.yellow}`
            }} />
            </div>

            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 13,
            fontFamily: F.sans,
            fontSize: 13
          }}>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Servizio</span>
                <span style={{
                color: C.white,
                fontWeight: 700
              }}>{svcLabel}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Zone</span>
                <div style={{
                textAlign: "right"
              }}>
                  <div style={{
                  color: C.white,
                  fontWeight: 700
                }}>{compactZoneLabel}</div>
                  {allZonesList.length > 1 && <button type="button" onClick={() => setShowZoneDetails(!showZoneDetails)} style={{
                  background: "none",
                  border: "none",
                  color: "#E8571A",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                  marginTop: 2
                }}>
                      {showZoneDetails ? "▲ Nascondi elenco" : "• Visualizza elenco"}
                    </button>}
                </div>
              </div>
              {showZoneDetails && allZonesList.length > 1 && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: "auto"
            }} transition={{
              duration: 0.2
            }} style={{
              padding: "10px 12px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              fontSize: 11,
              color: "#CBD5E1",
              maxHeight: 130,
              overflowY: "auto",
              lineHeight: 1.5
            }}>
                  {allZonesList.join(" · ")}
                </motion.div>}
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Quantità</span>
                <span style={{
                color: C.white,
                fontWeight: 700
              }}>{activeQty.toLocaleString("it-IT")} vol.</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Possibile sconto</span>
                <span style={{
                color: C.green,
                fontWeight: 800
              }}>{averagePairingDiscount > 0 ? `-${averagePairingDiscount}%` : "Fino a -40%"}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Tempo stimato</span>
                <span style={{
                color: C.white,
                fontWeight: 600
              }}>{realSmartPairingSlots.length > 0 ? "Immediato" : "2-3 giorni"}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Stato ricerca</span>
                <span style={{
                padding: "3px 8px",
                borderRadius: 6,
                background: realSmartPairingSlots.length > 0 ? pairingDays.length > 0 ? "rgba(46,204,138,0.15)" : "rgba(6,182,212,0.15)" : "rgba(255,255,255,.07)",
                color: realSmartPairingSlots.length > 0 ? pairingDays.length > 0 ? C.green : C.cyan : "rgba(255,255,255,.7)",
                fontSize: 11,
                fontWeight: 700
              }}>
                  {realSmartPairingSlots.length > 0 ? pairingDays.length > 0 ? "Confermato" : "Compatibili" : (formSent ? "Richiesta registrata" : "Nessun match")}
                </span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,.08)"
            }}>
                <span style={{
                color: "rgba(255,255,255,.6)"
              }}>Slot disponibili</span>
                <span style={{
                color: realSmartPairingSlots.length > 0 ? C.green : C.white,
                fontWeight: 800,
                fontSize: 15
              }}>{realSmartPairingSlots.length}</span>
              </div>
            </div>
          </div>

          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}>
            {pairingDays.length > 0 ? <button className="btn" onClick={handlePrimary} style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(232,87,26,0.35)",
            transition: "all .2s"
          }}>
                Attivami e genera preventivo
              </button> : realSmartPairingSlots.length > 0 ? <div style={{
            padding: "10px",
            textAlign: "center",
            fontFamily: F.sans,
            fontSize: 12,
            color: "rgba(255,255,255,.5)"
          }}>
                Scegli una o più date compatibili per continuare
              </div> : null}
            {navError && <div style={{
            padding: "9px 12px",
            borderRadius: 8,
            background: "rgba(248,113,113,.12)",
            border: "1px solid rgba(248,113,113,.3)",
            fontFamily: F.sans,
            fontSize: 12,
            color: C.red
          }}>
                {navError}
              </div>}

            <button className="btn" onClick={handleSkipPairing} style={{
            width: "100%",
            padding: "13px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(255,255,255,.03)",
            color: "rgba(255,255,255,.85)",
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all .2s"
          }}>
              Continua senza Smart Pairing →
            </button>
            <NavButton onClick={handleBackToZone} full>{"← Zona e mappa"}</NavButton>
          </div>
        </div>
  );
}
