import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { C, F } from "../../../../lib/constants.js";
import { MONTHS_SHORT } from "../../../../lib/appConstants.js";

export function Step4PlanningPanel({ box, secHead, isQuick, sectionAccent, data, isMobile, nonEmpty, selDays, selectedDatesLabel, urgencySurchargePctLabel, sent, disc, col, pairsData }) {
  return (
    <>
      {!isQuick && <div style={{
          ...box(),
          padding: "18px"
        }}>
              {secHead("4", "Pianificazione", "Date, Smart Pairing e stato operativo", sectionAccent)}
            {data.smartPairingRequestSent ? <div style={{
            padding: "14px",
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.58)",
            background: "rgba(251,191,36,.06)",
            border: "1px solid rgba(251,191,36,.2)",
            borderRadius: 10,
            lineHeight: 1.6
          }}>
                <b style={{
              color: C.yellow
            }}>Richiesta data diversa inviata.</b><br />
                Periodo preferito: {data.contactRequestData?.periodo || "Dato non disponibile"}<br />
                Ti avviseremo via WhatsApp o email appena disponibile uno slot compatibile.
              </div> : <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
                {/* Status chips con evidenza su Priorità, Periodo, Operatore, Stato */}
                <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
              gap: 10
            }}>
                  {nonEmpty([{
                icon: "calendar",
                l: "Periodo",
                v: selDays.length > 0 ? selectedDatesLabel : "Da definire con il team",
                c: selDays.length > 0 ? C.white : "#A5B4FC",
                highlight: true
              }, {
                icon: "lightning",
                l: "Priorità",
                v: data.urgency === "urgent" ? `URGENTE (+${urgencySurchargePctLabel}%)` : data.urgency === "express" ? `EXPRESS (+${urgencySurchargePctLabel}%)` : "Standard operativa",
                c: data.urgency === "urgent" || data.urgency === "express" ? C.red : C.white,
                highlight: data.urgency === "urgent" || data.urgency === "express"
              }, {
                icon: "package",
                l: "Stato",
                v: sent ? "CONFERMATA" : "PRONTA PER ATTIVAZIONE",
                c: sent ? C.green : "#E8571A",
                highlight: true
              }, {
                icon: "user",
                l: "Operatore",
                v: "Assegnazione in zona",
                c: C.white,
                highlight: false
              }, {
                icon: "link",
                l: "Smart Pairing",
                v: disc > 0 ? `Attivo (-${disc}%)` : "Non richiesto",
                c: disc > 0 ? C.green : "rgba(255,255,255,.5)",
                highlight: false
              }, selDays.length > 0 && {
                icon: "pin",
                l: "Giornate",
                v: `${selDays.length} ${selDays.length === 1 ? "data confermata" : "date confermate"}`,
                c: col,
                highlight: false
              }]).map(({
                icon,
                l,
                v,
                c,
                highlight
              }) => <div key={l} style={{
                padding: "14px 16px",
                background: highlight ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.025)",
                borderRadius: 14,
                border: `1px solid ${highlight ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.06)"}`,
                boxShadow: highlight ? "0 4px 12px rgba(0,0,0,0.15)" : "none"
              }}>
                      <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6
                }}>
                        <Step1Icon name={icon} size={14} color={c} />
                        <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.45)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em"
                  }}>{l}</span>
                      </div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: highlight ? 14 : 13,
                  fontWeight: highlight ? 800 : 600,
                  color: c
                }}>{v}</div>
                    </div>)}
                </div>

                {/* Giornate con Smart Pairing */}
                {selDays.length > 0 && <div>
                    <div style={{
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                color: "rgba(255,255,255,.28)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginBottom: 8
              }}>Giornate pianificate</div>
                    <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 5
              }}>
                      {selDays.map(k => {
                  const p = pairsData[k] || null;
                  const pts = k.split("-");
                  const isPaired = Boolean(p);
                  return <div key={k} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: p?.type === "same" ? "rgba(46,204,138,.08)" : p ? "rgba(232,87,26,.08)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${p?.type === "same" ? "rgba(46,204,138,.2)" : p ? "rgba(232,87,26,.2)" : "rgba(255,255,255,.07)"}`
                  }}>
                            <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isPaired ? p.type === "same" ? C.green : C.orange : "rgba(255,255,255,.22)",
                      flexShrink: 0
                    }} />
                            <div style={{
                      flex: 1
                    }}>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.white
                      }}>{pts[2]} {MONTHS_SHORT[parseInt(pts[1])]}</div>
                              {isPaired && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)"
                      }}>Zona compatibile: {p.zone} — {p.type === "same" ? "stessa zona" : "zona vicina"}</div>}
                              {!isPaired && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.35)"
                      }}>Data richiesta — conferma in attesa</div>}
                            </div>
                            {p?.disc > 0 && <span style={{
                      padding: "3px 9px",
                      borderRadius: 100,
                      background: p.type === "same" ? "rgba(46,204,138,.15)" : "rgba(232,87,26,.15)",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      color: p.type === "same" ? C.green : C.orange
                    }}>-{p.disc}%</span>}
                          </div>;
                })}
                    </div>
                  </div>}

                {selDays.length === 0 && <div style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: "rgba(46,204,138,.05)",
              border: "1px solid rgba(46,204,138,.15)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start"
            }}>
                    <Step1Icon name="calendar" size={24} color={C.white} style={{
                flexShrink: 0
              }} />
                    <div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.white,
                  marginBottom: 4
                }}>Data da confermare</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.55
                }}>
                        La data verrà concordata con il team operativo entro 24 ore dalla conferma della campagna.
                      </div>
                    </div>
                  </div>}
              </div>}
            </div>}
    </>
  );
}
