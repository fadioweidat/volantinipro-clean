import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { C, F } from "../../../../lib/constants.js";

export function Step4PricingSummaryPanel({ tLabel, baseCost, serviceExtras, disc, smartPairingDiscount, data, urgencySurchargePctLabel, urgSurch, subDiscPct, planDiscountAmount, isQuick, total, flyerQty, svcType, kpis, totF, printingExtra, printingEstimatedPrice, printPriceKnown = true, eur }) {
  return (
    <>
      {/* Price breakdown */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 12
          }}>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.05)"
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.45)"
              }}>Distribuzione {tLabel}</span>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,.72)"
              }}>{eur(baseCost)}</span>
              </div>
              {serviceExtras.map(({
              l,
              v,
              c
            }) => <div key={l} style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.42)"
              }}>{l}</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: c
              }}>{v}</span>
                </div>)}
              {disc > 0 && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: F.sans,
                fontSize: 11,
                color: C.green
              }}><Step1Icon name="link" size={11} color={C.green} /> Smart Pairing -{disc}%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.green
              }}>-{eur(smartPairingDiscount)}</span>
                </div>}
              {data.urgency === "urgent" && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: F.sans,
                fontSize: 11,
                color: C.red
              }}><Step1Icon name="lightning" size={11} color={C.red} /> Urgenza +{urgencySurchargePctLabel}%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.red
              }}>+{eur(urgSurch)}</span>
                </div>}
              {subDiscPct > 0 && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: C.green
              }}>Piano -{subDiscPct}%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.green
              }}>-{eur(planDiscountAmount)}</span>
                </div>}
            </div>

      {/* Investment box */}
            <div style={{
            background: "linear-gradient(135deg, rgba(232,87,26,0.15) 0%, rgba(99,102,241,0.1) 100%)",
            borderRadius: 16,
            padding: "18px 16px",
            border: "2px solid #E8571A",
            marginBottom: 16,
            boxShadow: "0 6px 24px rgba(232,87,26,0.25)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: "rgba(255,255,255,.5)",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 8
            }}>
                {isQuick ? "Stima investimento" : "Il tuo investimento"}
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.55)"
              }}>{isQuick ? "Stima distribuzione" : "Totale distribuzione"}</span>
                <span style={{
                fontFamily: F.serif,
                fontSize: 38,
                fontWeight: 900,
                color: "#E8571A",
                letterSpacing: "-1.5px",
                lineHeight: 1
              }}>{eur(total)}</span>
              </div>
              <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.08)"
            }}>
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>Costo per 1.000 volantini</span>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.75)"
                }}>
                    {flyerQty > 0 ? eur(total / flyerQty * 1000) : "—"}
                  </span>
                </div>
                {svcType === "d2d" && (kpis.families ?? totF) > 0 && <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>Costo per famiglia raggiunta</span>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.75)"
                }}>
                      {eur(total / (kpis.families ?? totF))}
                    </span>
                  </div>}
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>IVA 22% (esclusa)</span>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,.5)"
                }}>+{eur(total * 0.22)}</span>
                </div>
              </div>
            </div>

      {/* P1 STAMPA SEPARATA: stima indicativa mostrata separata dal
                totale distribuzione, mai sommata prima della conferma
                tipografia (vedi metadata.printing.status). */}
            {printingExtra && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            padding: "12px 16px",
            border: "1px dashed rgba(255,255,255,.15)",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10
          }}>
                <div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,.7)"
              }}>Stampa indicativa</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.4)",
                marginTop: 2
              }}>{printPriceKnown ? "Da confermare in tipografia — non inclusa nel totale distribuzione" : "Configurazione da verificare con VolantiniPro — non inclusa nel totale distribuzione"}</div>
                </div>
                <span style={{
                fontFamily: F.sans,
                fontSize: 18,
                fontWeight: 800,
                color: "rgba(255,255,255,.75)"
              }}>{printPriceKnown ? `~${eur(printingEstimatedPrice)}` : "Da verificare"}</span>
              </div>}
    </>
  );
}
