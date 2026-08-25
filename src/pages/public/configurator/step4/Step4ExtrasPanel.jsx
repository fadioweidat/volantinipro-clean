import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { C, F } from "../../../../lib/constants.js";
import { CONTROL_PRO_INCLUDED_IDS, EXTRA_CATEGORIES } from "../../../../lib/extraServicesRegistry.js";

// Raggruppamento visivo dei servizi facoltativi in 3 gruppi (solo
// presentazione: id/prezzi restano quelli di extraServicesRegistry.js).
const CATEGORY_ORDER = [EXTRA_CATEGORIES.CONTROLLO_REPORT, EXTRA_CATEGORIES.MARKETING, EXTRA_CATEGORIES.ASSISTENZA];
const CATEGORY_LABELS = {
  [EXTRA_CATEGORIES.CONTROLLO_REPORT]: "Controllo e Report",
  [EXTRA_CATEGORIES.MARKETING]: "Marketing",
  [EXTRA_CATEGORIES.ASSISTENZA]: "Assistenza",
};

function formatExtraPrice(ext, eur) {
  return ext.priceUnit === "day" ? `${eur(ext.price)} / giorno` : `+${eur(ext.price)}`;
}

export function Step4ExtrasPanel({ box, secHead, isQuick, sectionAccent, selectedExtras, optionalExtras, isMobile, svcCommercial, eur, urgencySurchargePctLabel, removeOptionalExtra, addOptionalExtra, isOptionalExtraSelected, selectedExtraIds }) {
  const isControlProSelected = (selectedExtraIds || []).includes("control_pro");
  const groupedOptionalExtras = CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    items: optionalExtras.filter(ext => ext.category === category)
  })).filter(group => group.items.length > 0);
  const uncategorizedExtras = optionalExtras.filter(ext => !CATEGORY_ORDER.includes(ext.category));
  return (
    <div style={{
          ...box(),
          padding: "18px"
        }}>
            {secHead("3", isQuick ? "Personalizza il tuo preventivo" : "Servizi inclusi", isQuick ? "Seleziona i servizi extra per la tua campagna" : "Cosa ricevi con questa campagna", sectionAccent)}

            {/* ── Servizi già inclusi — commercial cards ── */}
            {selectedExtras.length === 0 ? <div style={{
            padding: "16px",
            textAlign: "center",
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 10,
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.34)"
          }}>
                Nessun servizio extra selezionato. Scopri le opzioni disponibili qui sotto.
              </div> : <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            marginBottom: 20
          }}>
                {selectedExtras.map(ext => {
              const comm = svcCommercial[ext.id] || {};
              const cardCol = comm.col || (ext.price === 0 && !ext.isUrgent ? C.green : ext.isUrgent ? C.red : C.blue);
              const optionalConfig = optionalExtras.find(opt => opt.id === ext.id);
              return <div key={ext.id} className="s4-svc-card" style={{
                padding: "16px 18px",
                borderRadius: 14,
                background: `${cardCol}08`,
                border: `1px solid ${cardCol}28`,
                display: "flex",
                flexDirection: "column",
                gap: 12
              }}>
                      {/* Header */}
                      <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start"
                }}>
                        <div style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center"
                  }}>
                          <Step1Icon name={comm.icon || ext.icon} size={22} color={cardCol} />
                          <div>
                            <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginBottom: 2
                      }}>
                              <div style={{
                          fontFamily: F.serif,
                          fontSize: 16,
                          color: C.white,
                          letterSpacing: "-.2px"
                        }}>{comm.head || ext.label}</div>
                              {comm.badge && <span style={{
                          padding: "2px 7px",
                          borderRadius: 5,
                          background: `${cardCol}22`,
                          border: `1px solid ${cardCol}44`,
                          fontFamily: F.sans,
                          fontSize: 9,
                          fontWeight: 800,
                          color: cardCol,
                          flexShrink: 0
                        }}>{comm.badge}</span>}
                            </div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 9,
                        fontWeight: 700,
                        color: cardCol,
                        textTransform: "uppercase",
                        letterSpacing: ".06em"
                      }}>
                              {ext.price === 0 && !ext.isUrgent ? "Incluso" : ext.isUrgent ? "Servizio urgente" : "Extra selezionato"}
                            </div>
                          </div>
                        </div>
                        <div style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: `${cardCol}18`,
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    color: cardCol,
                    flexShrink: 0
                  }}>
                          {ext.price > 0 ? (ext.priceUnit === "day" ? `${eur(ext.price)} / giorno` : eur(ext.price)) : ext.isUrgent ? `+${urgencySurchargePctLabel}%` : "✓"}
                        </div>
                      </div>
                      {/* Benefits */}
                      {comm.bullets && <ul style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}>
                          {comm.bullets.map((b, i) => <li key={i} style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start"
                  }}>
                              <span style={{
                      color: cardCol,
                      fontSize: 12,
                      flexShrink: 0,
                      lineHeight: "18px"
                    }}>✓</span>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      color: "rgba(255,255,255,.65)",
                      lineHeight: 1.45
                    }}>{b}</span>
                            </li>)}
                        </ul>}
                      {!comm.bullets && ext.description && <p style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.5,
                  margin: 0
                }}>{ext.description}</p>}
                      {optionalConfig && <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 8,
                  paddingTop: 4
                }}>
                          <button type="button" onClick={() => removeOptionalExtra(optionalConfig)} style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: `1px solid ${cardCol}35`,
                    background: "rgba(255,255,255,.04)",
                    color: "rgba(255,255,255,.76)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                            Rimuovi
                          </button>
                        </div>}
                    </div>;
            })}
              </div>}

            {/* ── Optional non ancora aggiunti, raggruppati in 3 gruppi ── */}
            {optionalExtras.length > 0 && <div style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid rgba(255,255,255,.08)"
          }}>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,.5)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 16
            }}>Aggiungi servizi facoltativi al preventivo</div>
                {groupedOptionalExtras.map((group, groupIdx) => <div key={group.category} style={{
              marginTop: groupIdx === 0 ? 0 : 22
            }}>
                    <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10
              }}>
                      <span style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "rgba(255,255,255,.66)",
                  textTransform: "uppercase",
                  letterSpacing: ".1em"
                }}>{group.label}</span>
                      <span style={{
                  flex: 1,
                  height: 1,
                  background: "rgba(255,255,255,.08)"
                }} />
                    </div>
                    <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))",
                gap: 12
              }}>
                      {group.items.map(ext => renderOptionalCard(ext))}
                    </div>
                  </div>)}
                {uncategorizedExtras.length > 0 && <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))",
              gap: 12,
              marginTop: 22
            }}>
                    {uncategorizedExtras.map(ext => renderOptionalCard(ext))}
                  </div>}
              </div>}
          </div>
  );

  function renderOptionalCard(ext) {
    const comm = svcCommercial[ext.id] || {};
    const cardCol = comm.col || C.blue;
    const selected = isOptionalExtraSelected(ext);
    const isControlPro = ext.id === "control_pro";
    const includedInControlPro = !isControlPro && isControlProSelected && CONTROL_PRO_INCLUDED_IDS.includes(ext.id);
    return <div key={ext.id} style={{
      padding: "16px",
      borderRadius: 14,
      background: includedInControlPro ? "rgba(139,92,246,.06)" : selected ? `${cardCol}0f` : "rgba(255,255,255,.025)",
      border: `1px solid ${includedInControlPro ? "rgba(139,92,246,.3)" : selected ? `${cardCol}45` : "rgba(255,255,255,.08)"}`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: 14,
      opacity: includedInControlPro ? .78 : 1,
      transition: "border-color .2s"
    }}>
      <div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8
        }}>
          <div style={{
            display: "flex",
            gap: 10,
            alignItems: "center"
          }}>
            <Step1Icon name={comm.icon || ext.icon} size={22} color={cardCol} />
            <div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 7
              }}>
                <div style={{
                  fontFamily: F.serif,
                  fontSize: 16,
                  color: C.white
                }}>{comm.head || ext.label}</div>
                {isControlPro && comm.badge && <span style={{
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: `${cardCol}22`,
                  border: `1px solid ${cardCol}44`,
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800,
                  color: cardCol,
                  flexShrink: 0
                }}>{comm.badge}</span>}
              </div>
              <div style={{
                marginTop: 3,
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.46)",
                textTransform: "uppercase",
                letterSpacing: ".08em"
              }}>{includedInControlPro ? "Incluso nel pacchetto" : "Anteprima premium disponibile"}</div>
            </div>
          </div>
          <span style={{
            padding: "4px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.16)",
            fontFamily: F.sans,
            fontSize: 12,
            fontWeight: 800,
            color: "rgba(255,255,255,.85)",
            whiteSpace: "nowrap"
          }}>{includedInControlPro ? "Incluso" : selected ? "Extra selezionato" : formatExtraPrice(ext, eur)}</span>
        </div>
        {isControlPro && ext.bundleIncludesLabel && <div style={{
          fontFamily: F.sans,
          fontSize: 11.5,
          fontWeight: 700,
          color: cardCol,
          lineHeight: 1.5,
          paddingLeft: 32,
          marginBottom: 6
        }}>{ext.bundleIncludesLabel}</div>}
        <div style={{
          fontFamily: F.sans,
          fontSize: 12,
          color: "rgba(255,255,255,.66)",
          lineHeight: 1.5,
          paddingLeft: 32
        }}>{ext.micro || comm.bullets?.[0] || ext.description}</div>
        {comm.bullets && <ul style={{
          listStyle: "none",
          padding: "10px 0 0 32px",
          margin: 0,
          display: "grid",
          gap: 6
        }}>
          {comm.bullets.slice(0, 3).map((b, i) => <li key={i} style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.62)",
            lineHeight: 1.45
          }}>
            <span style={{
              color: cardCol,
              fontWeight: 900
            }}>+</span>
            <span>{b}</span>
          </li>)}
        </ul>}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 8
      }}>
        {includedInControlPro ? <div style={{
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          border: "1px solid rgba(139,92,246,.35)",
          background: "rgba(139,92,246,.08)",
          color: "rgba(196,181,253,.9)",
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 800,
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: ".04em"
        }}>
          Già incluso nel Controllo PRO
        </div> : selected ? <button type="button" onClick={() => removeOptionalExtra(ext)} style={{
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          border: `1px solid ${cardCol}35`,
          background: "rgba(255,255,255,.04)",
          color: "rgba(255,255,255,.76)",
          fontFamily: F.sans,
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          transition: "all .2s"
        }}>
          Rimuovi
        </button> : <button type="button" onClick={() => addOptionalExtra(ext.addId || ext.id)} style={{
          width: "100%",
          padding: "10px",
          borderRadius: 10,
          border: `1px solid ${cardCol}40`,
          background: `${cardCol}12`,
          color: cardCol,
          fontFamily: F.sans,
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          transition: "all .2s"
        }}>
          Aggiungi al preventivo
        </button>}
      </div>
    </div>;
  }
}
