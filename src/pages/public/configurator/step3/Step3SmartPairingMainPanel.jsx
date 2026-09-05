import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { C, F } from "../../../../lib/constants.js";
import { calendarDateKey } from "../../../../lib/smartPairingAvailability.js";
import { MONTHS_FULL } from "../../../../lib/appConstants.js";

export function Step3SmartPairingMainPanel({ availabilityStatus, setAvailabilityStatus, setAvailabilityRetryCount, realSmartPairingSlots, availableDates, isMobile, handleContinueToStep4, shouldShowContinueToStep4, handleSkipPairing, month, setMonth, year, setYear, selDays, setSelDays, isSelectableCalendarDate, preferredPeriod, updatePreferredPeriod, togglePreferredWeekday, showRequest, setShowRequest, form, setForm, formError, setFormError, formSent, setFormSent, handleRequestSubmit, setSmartPairingRegistered, dateMode, pairs, toggle, sanitizeWhatsAppLocal, isSubmittingWaitlist = false }) {
  const DI = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
  const dim = (m, y) => new Date(y, m + 1, 0).getDate();
  const fdow = (m, y) => {
    let d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,.14)",
    background: "rgba(255,255,255,.07)",
    color: C.white,
    fontFamily: F.sans,
    fontSize: 14
  };
  return (
    <>
      {/* 4 & 9. CALENDARIO COMPATTO OPPURE CASO "NESSUNO SLOT" / ERRORE */}
                {/* STATO ERROR: errore di rete/backend — NON equivale a zero match */}
                {availabilityStatus === "error" ? <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(239,68,68,0.03) 100%)",
                    borderRadius: 20,
                    padding: "32px 26px",
                    border: "1px solid rgba(239,68,68,0.30)",
                    textAlign: "center",
                    marginBottom: 28,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
                  }}
                >
                  <div style={{
                    width: 54, height: 54, borderRadius: "50%",
                    background: "rgba(239,68,68,0.15)",
                    color: "#F87171",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 16px"
                  }}><Step1Icon name="alert" size={26} color="#F87171" /></div>
                  <h3 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, marginBottom: 8 }}>
                    Impossibile verificare la disponibilità Smart Pairing.
                  </h3>
                  <p style={{
                    fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,0.7)",
                    maxWidth: 520, margin: "0 auto 24px", lineHeight: 1.6
                  }}>
                    Si è verificato un errore durante il controllo delle campagne compatibili.
                    Non possiamo confermare se ci siano o meno slot disponibili.
                    Riprova oppure continua senza Smart Pairing: il matching non è stato verificato.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                      id="step3-retry-availability"
                      onClick={() => { setAvailabilityStatus("loading"); setAvailabilityRetryCount(c => c + 1); }}
                      style={{
                        padding: "12px 24px", borderRadius: 10,
                        background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
                        color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800,
                        border: "none", cursor: "pointer",
                        boxShadow: "0 4px 14px rgba(99,102,241,0.4)"
                      }}
                    >↺ Riprova verifica</button>
                    <button
                      id="step3-skip-unverified"
                      onClick={handleSkipPairing}
                      style={{
                        padding: "12px 20px", borderRadius: 10,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >Continua senza Smart Pairing →</button>
                  </div>
                </motion.div>
                /* STATO SUCCESS + ZERO MATCH: risposta 200 confermata con 0 slot */
                : realSmartPairingSlots.length === 0 && availableDates.size === 0 ? <motion.div initial={{
                opacity: 0,
                y: 10
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                duration: 0.2
              }} style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.03) 100%)",
                borderRadius: 20,
                padding: "32px 26px",
                border: "1px solid rgba(251,191,36,0.25)",
                textAlign: "center",
                marginBottom: 28,
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
              }}>
                    <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: "rgba(251,191,36,0.15)",
                  color: C.yellow,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px"
                }}><Step1Icon name="search" size={26} color={C.yellow} /></div>
                    <h3 style={{
                  fontFamily: F.serif,
                  fontSize: 24,
                  color: C.white,
                  marginBottom: 8
                }}>Nessuna campagna compatibile al momento.</h3>
                    <p style={{
                  fontFamily: F.sans,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.7)",
                  maxWidth: 520,
                  margin: "0 auto 24px",
                  lineHeight: 1.6
                }}>
                      Al momento non ci sono campagne compatibili. Puoi registrare la richiesta Smart Pairing; la disponibilità potrà essere verificata nuovamente quando saranno presenti nuove campagne compatibili.
                    </p>
                    <div style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "center",
                  flexWrap: "wrap"
                }}>
                      {!formSent && <button onClick={() => setShowRequest(true)} style={{
                    padding: "12px 24px",
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 800,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(232,87,26,0.4)"
                  }}>
                          Attivami
                        </button>}
                      <button onClick={handleSkipPairing} style={{
                    padding: "12px 20px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}>
                        Continua senza Smart Pairing →
                      </button>
                    </div>
                  </motion.div> : <div style={{
                marginBottom: 28
              }}>
                    {realSmartPairingSlots.length > 0 && <div style={{
                  display: "flex",
                  gap: 14,
                  marginBottom: 14,
                  flexWrap: "wrap"
                }}>
                      {[{
                    c: C.green,
                    l: "Verde: Smart Pairing stessa zona confermato"
                  }, {
                    c: C.purple,
                    l: "Viola/Blu: Smart Pairing zona compatibile confermato"
                  }, {
                    c: C.orange,
                    l: "Bordo/check: selezionato"
                  }].map(({
                    c,
                    l
                  }) => <div key={l} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                          <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: c,
                      flexShrink: 0
                    }} />
                          <span style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      color: "rgba(255,255,255,.6)"
                    }}>{l}</span>
                        </div>)}
                    </div>}

                    <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 14
                }}>
                      <button onClick={() => {
                    if (month > 0) setMonth(m => m - 1);else {
                      setMonth(11);
                      setYear(y => y - 1);
                    }
                  }} style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.04)",
                    color: C.white,
                    cursor: "pointer",
                    fontSize: 14
                  }}>-</button>
                      <span style={{
                    fontFamily: F.serif,
                    fontSize: 20,
                    color: C.white,
                    minWidth: 165,
                    textAlign: "center"
                  }}>{MONTHS_FULL[month]} {year}</span>
                      <button onClick={() => {
                    if (month < 11) setMonth(m => m + 1);else {
                      setMonth(0);
                      setYear(y => y + 1);
                    }
                  }} style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.04)",
                    color: C.white,
                    cursor: "pointer",
                    fontSize: 14
                  }}>+ </button>
                    </div>

                    <div style={{
                  position: "relative",
                  background: "rgba(255,255,255,.03)",
                  borderRadius: 16,
                  padding: 16,
                  border: "1px solid rgba(255,255,255,.08)",
                  overflow: "hidden"
                }}>
                      <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7,1fr)",
                    gap: 4,
                    marginBottom: 6
                  }}>
                        {DI.map(d => <div key={d} style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255,255,255,.3)",
                      textAlign: "center",
                      padding: "4px 0"
                    }}>{d}</div>)}
                      </div>
                      <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7,1fr)",
                    gap: 4
                  }}>
                        {Array(fdow(month, year)).fill(null).map((_, i) => <div key={`e${i}`} />)}
                        {Array(dim(month, year)).fill(null).map((_, i) => {
                      const d = i + 1,
                        k = calendarDateKey(year, month, d),
                        pair = pairs[k];
                      const sel = selDays.includes(k);
                      const selectable = Boolean(pair) && isSelectableCalendarDate(k, availableDates, pair);
                      let bg = "rgba(255,255,255,.025)",
                        border = "1px solid rgba(255,255,255,.04)",
                        tc = "rgba(255,255,255,.22)";
                      if (sel && pair) {
                        bg = pair.type === "same" ? "rgba(46,204,138,.25)" : "rgba(167,139,250,.22)";
                        border = `2px solid ${pair.type === "same" ? C.green : C.purple}`;
                        tc = C.white;
                      } else if (pair?.type === "same") {
                        bg = "rgba(46,204,138,.1)";
                        border = "1px solid rgba(46,204,138,.3)";
                        tc = C.green;
                      } else if (pair?.type === "nearby") {
                        bg = "rgba(167,139,250,.1)";
                        border = "1px solid rgba(167,139,250,.3)";
                        tc = C.purple;
                      } else if (selectable) {
                        bg = "rgba(46,204,138,.08)";
                        border = "1px solid rgba(46,204,138,.24)";
                        tc = C.green;
                      }
                      return <div key={d} onClick={() => toggle(d)} style={{
                        minHeight: isMobile ? 44 : 52,
                        borderRadius: 8,
                        padding: "6px 2px",
                        textAlign: "center",
                        cursor: selectable ? "pointer" : "default",
                        background: bg,
                        border,
                        transition: "all .15s"
                      }}>
                              <div style={{
                          fontFamily: F.sans,
                          fontSize: 12,
                          fontWeight: sel ? 700 : 400,
                          color: tc,
                          marginBottom: 1
                        }}>{d}</div>
                              {pair && !sel && <div style={{
                          fontFamily: F.sans,
                          fontSize: 8,
                          fontWeight: 700,
                          color: pair.type === "same" ? C.green : C.purple,
                          marginTop: 2
                        }}>-{pair.disc}%</div>}
                              {sel && <div style={{
                          fontSize: 8,
                          marginTop: 2,
                          color: C.white,
                          fontWeight: 800
                        }}>{pair ? `-${pair.disc}%` : "✓"}</div>}
                            </div>;
                    })}
                      </div>
                    </div>
                    <button onClick={() => {
                  setShowRequest(v => !v);
                  setSelDays([]);
                  setFormSent(false);
                  setSmartPairingRegistered(false);
                  setFormError("");
                }} style={{
                  marginTop: 14,
                  padding: "11px 15px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.04)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  width: "100%"
                }}>
                      Non trovo il giorno che voglio · Avvisami per date diverse
                    </button>
                  </div>}

                {showRequest && <div style={{
                marginBottom: 28,
                borderRadius: 16,
                padding: "22px",
                background: "rgba(255,255,255,.05)",
                border: "2px solid rgba(251,191,36,.3)"
              }}>
                    {shouldShowContinueToStep4 ? <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14
                }}>
                        <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 4px"
                  }}>
                          <span style={{
                      color: C.green,
                      fontWeight: 900,
                      fontSize: 22
                    }}>✓</span>
                          <div style={{
                      fontFamily: F.sans,
                      fontSize: 14,
                      color: C.white,
                      fontWeight: 600,
                      lineHeight: 1.5
                    }}>
                            Richiesta registrata. Ti avviseremo appena ci sono slot compatibili.
                          </div>
                        </div>
                        <button className="btn" onClick={handleContinueToStep4} style={{
                    width: "100%",
                    padding: "14px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 6px 18px rgba(232,87,26,0.35)"
                  }}>
                          Continua al preventivo →
                        </button>
                      </div> : <>
                        <div style={{
                    fontFamily: F.serif,
                    fontSize: 20,
                    color: C.white,
                    marginBottom: 6
                  }}>Registrami per Smart Pairing</div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: "rgba(255,255,255,.6)",
                    lineHeight: 1.55,
                    marginBottom: 16
                  }}>
                          Ti avviseremo via WhatsApp o Email quando lavoriamo nella tua zona o in una zona vicina compatibile.
                        </div>
                        <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginBottom: 14
                  }}>
                          <input value={form.nome} onChange={e => setForm(f => ({
                      ...f,
                      nome: e.target.value
                    }))} placeholder="Nome e Cognome" style={inputStyle} />
                          <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 12
                    }}>
                            <div>
                              <div style={{
                          display: "flex",
                          alignItems: "center",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,.14)",
                          background: "rgba(255,255,255,.07)",
                          overflow: "hidden",
                          transition: "border-color .2s, box-shadow .2s"
                        }}>
                                <span style={{
                            alignSelf: "stretch",
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "0 12px",
                            background: "rgba(46,204,138,.12)",
                            borderRight: "1px solid rgba(255,255,255,.1)",
                            color: C.green,
                            fontFamily: F.sans,
                            fontSize: 14,
                            fontWeight: 900
                          }}>+39</span>
                                <input value={form.telefono} onChange={e => setForm(f => ({
                            ...f,
                            telefono: sanitizeWhatsAppLocal(e.target.value)
                          }))} placeholder="327 123 4567" type="tel" inputMode="numeric" style={{
                            ...inputStyle,
                            border: "none",
                            background: "transparent",
                            borderRadius: 0,
                            paddingLeft: 12
                          }} />
                              </div>
                            </div>
                            <input value={form.email} onChange={e => setForm(f => ({
                        ...f,
                        email: e.target.value
                      }))} placeholder="Email" type="email" style={inputStyle} />
                          </div>
                          <div style={{
                      padding: 14,
                      borderRadius: 14,
                      background: "rgba(255,255,255,.035)",
                      border: "1px solid rgba(255,255,255,.09)"
                    }}>
                            <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 12,
                        flexWrap: "wrap"
                      }}>
                              <div style={{
                          fontFamily: F.sans,
                          fontSize: 12,
                          color: "rgba(255,255,255,.58)",
                          fontWeight: 800,
                          letterSpacing: ".06em",
                          textTransform: "uppercase"
                        }}>Periodo preferito</div>
                              <div style={{
                          color: "rgba(255,255,255,.48)",
                          fontSize: 16
                        }}>CAL</div>
                            </div>
                            <div style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 12
                      }}>
                              {[["single_date", "Data singola"], ["date_range", "Intervallo date"], ["weekdays", "Giorni preferiti"], ["text", "Testo libero"]].map(([type, label]) => {
                          const active = (form.preferredPeriod?.type || "single_date") === type;
                          return <button key={type} type="button" onClick={() => updatePreferredPeriod({
                            type
                          })} style={{
                            padding: "7px 10px",
                            borderRadius: 999,
                            border: `1px solid ${active ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.12)"}`,
                            background: active ? "rgba(46,204,138,.13)" : "rgba(255,255,255,.035)",
                            color: active ? C.green : "rgba(255,255,255,.68)",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "pointer"
                          }}>
                                    {label}
                                  </button>;
                        })}
                            </div>
                            {(form.preferredPeriod?.type || "single_date") === "single_date" && <input type="date" value={form.preferredPeriod?.startDate || ""} onChange={e => updatePreferredPeriod({
                        startDate: e.target.value
                      })} style={inputStyle} />}
                            {form.preferredPeriod?.type === "date_range" && <div style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                        gap: 10
                      }}>
                                <input type="date" value={form.preferredPeriod?.startDate || ""} onChange={e => updatePreferredPeriod({
                          startDate: e.target.value
                        })} style={inputStyle} />
                                <input type="date" value={form.preferredPeriod?.endDate || ""} onChange={e => updatePreferredPeriod({
                          endDate: e.target.value
                        })} style={inputStyle} />
                              </div>}
                            {form.preferredPeriod?.type === "weekdays" && <div style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap"
                      }}>
                                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab"].map(day => {
                          const active = (form.preferredPeriod?.weekdays || []).includes(day);
                          return <button key={day} type="button" onClick={() => togglePreferredWeekday(day)} style={{
                            minWidth: 46,
                            padding: "9px 10px",
                            borderRadius: 10,
                            border: `1px solid ${active ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.12)"}`,
                            background: active ? "rgba(46,204,138,.14)" : "rgba(255,255,255,.04)",
                            color: active ? C.green : "rgba(255,255,255,.72)",
                            fontFamily: F.sans,
                            fontSize: 12,
                            fontWeight: 850,
                            cursor: "pointer"
                          }}>{day}</button>;
                        })}
                              </div>}
                            {form.preferredPeriod?.type === "text" && <input value={form.preferredPeriod?.text || ""} onChange={e => updatePreferredPeriod({
                        text: e.target.value
                      })} placeholder="Seleziona una data o scrivi giorni preferiti" style={inputStyle} />}
                            <div style={{
                        marginTop: 8,
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(255,255,255,.42)"
                      }}>Esempio: 3 agosto, prossima settimana, lun-mar</div>
                          </div>
                          <textarea value={form.note || ""} onChange={e => setForm(f => ({
                      ...f,
                      note: e.target.value
                    }))} placeholder="Note opzionali" rows={3} style={{
                      ...inputStyle,
                      resize: "vertical"
                    }} />
                        </div>
                        {formError && <div style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "rgba(248,113,113,.15)",
                    border: "1px solid rgba(248,113,113,.3)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    color: C.red,
                    marginBottom: 12
                  }}>{formError}</div>}
                        <button
                          className="btn"
                          onClick={handleRequestSubmit}
                          disabled={isSubmittingWaitlist}
                          style={{
                            width: "100%",
                            padding: "14px",
                            borderRadius: 12,
                            border: "none",
                            background: isSubmittingWaitlist
                              ? "rgba(255,255,255,0.18)"
                              : "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
                            color: C.white,
                            fontFamily: F.sans,
                            fontSize: 14,
                            fontWeight: 800,
                            cursor: isSubmittingWaitlist ? "not-allowed" : "pointer",
                            opacity: isSubmittingWaitlist ? 0.7 : 1,
                            boxShadow: isSubmittingWaitlist ? "none" : "0 6px 18px rgba(99,102,241,0.3)"
                          }}
                        >
                          {isSubmittingWaitlist ? "Salvataggio richiesta..." : "Avvisami appena ci sono slot compatibili"}
                        </button>
                      </>}
                  </div>}

                {/* 5. PERCHÉ CONVIENE */}
                <div style={{
                background: "rgba(255,255,255,0.025)",
                borderRadius: 18,
                padding: "24px",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 24
              }}>
                  <h3 style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: C.white,
                  marginBottom: 16
                }}>Perché scegliere Smart Pairing?</h3>
                  <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                  gap: 12
                }}>
                    {["Risparmio economico fino al 40%", "Minore impatto ambientale", "Maggiore efficienza logistica", "Distribuzione ottimizzata in zona", "Stesso report finale certificato GPS"].map((adv, idx) => <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "rgba(46,204,138,0.06)",
                    border: "1px solid rgba(46,204,138,0.18)"
                  }}>
                        <span style={{
                      color: C.green,
                      fontWeight: 900,
                      fontSize: 15
                    }}>✓</span>
                        <span style={{
                      fontFamily: F.sans,
                      fontSize: 13,
                      color: "rgba(255,255,255,0.88)",
                      fontWeight: 600
                    }}>{adv}</span>
                      </div>)}
                  </div>
                </div>

                {/* 6. COME FUNZIONA */}
                <div id="smart-pairing-how" style={{
                background: "rgba(255,255,255,0.025)",
                borderRadius: 18,
                padding: "24px",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 24
              }}>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#E8571A",
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  marginBottom: 6
                }}>Algoritmo di abbinamento</div>
                  <h3 style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: C.white,
                  marginBottom: 14
                }}>Come funziona Smart Pairing</h3>
                  <p style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.65)",
                  lineHeight: 1.6,
                  marginBottom: 16
                }}>
                    Il sistema calcola il risparmio in base alla corrispondenza della zona analizzando i seguenti parametri:
                  </p>
                  <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                  gap: 10,
                  marginBottom: 18
                }}>
                    {[{
                    icon: "pin",
                    label: "Zona"
                  }, {
                    icon: "truck",
                    label: "Distanza"
                  }, {
                    icon: "calendar",
                    label: "Slot disponibili"
                  }, {
                    icon: "briefcase",
                    label: "Servizio compatibile"
                  }].map((param, idx) => <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: C.white,
                    fontWeight: 600
                  }}>
                        <Step1Icon name={param.icon} size={16} color={C.white} />
                        <span>{param.label}</span>
                      </div>)}
                  </div>
                  <div style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(232,87,26,0.1)",
                  border: "1px solid rgba(232,87,26,0.3)",
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 600,
                  lineHeight: 1.5
                }}>
                    Successivamente crea automaticamente gruppi di distribuzione compatibili, abbattendo i costi di uscita logistica.
                  </div>
                </div>

                {/* 10. MIGLIORARE LA FIDUCIA */}
                <div style={{
                background: "rgba(255,255,255,0.025)",
                borderRadius: 18,
                padding: "24px",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: 24
              }}>
                  <h3 style={{
                  fontFamily: F.serif,
                  fontSize: 20,
                  color: C.white,
                  marginBottom: 10
                }}>Come viene calcolato il risparmio?</h3>
                  <p style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.65)",
                  lineHeight: 1.6,
                  marginBottom: 14
                }}>
                    Il sistema calcola il risparmio in base alla corrispondenza territoriale: <b style={{
                    color: C.white
                  }}>Stessa zona (fino al 40%) o Zona vicina entro 5 km (fino al 20%)</b>.
                  </p>
                  <div style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "rgba(46,204,138,0.08)",
                  borderLeft: `3px solid ${C.green}`,
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.55
                }}>
                    <Step1Icon name="lock" size={15} color="rgba(255,255,255,0.85)" style={{
                    flexShrink: 0,
                    marginTop: 2
                  }} />
                    <span><b>Garanzia trasparenza:</b> Il risparmio mostrato deriva esclusivamente da campagne realmente compatibili. <b>Non vengono utilizzati dati casuali.</b></span>
                  </div>
                </div>


    </>
  );
}
