import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { NavButton } from "../../../../components/NavButton.jsx";
import { C, F } from "../../../../lib/constants.js";
import { Step4SendQuoteEmail } from "./Step4SendQuoteEmail.jsx";

export function Step4CampaignActionsPanel({ sent, savedCampaign, onHome, onNav, returnFromLogin, setReturnFromLogin, showLoginRequired, handleLoginRequiredNavigation, campaignSaveError, isQuick, handleDownloadPdf, pdfBusy, col, quotePdfData, canConfirm, savingCampaign, handleConfirmCampaign, confirmSyncStatus, clientForm, setClientForm, confirmProblem, pdfError, onBack, data, handleOpenSavedCampaign }) {
  return (
    <>
      {/* Dashboard ed esecuzione / Modificabile badge */}
            {!sent ? <>
                <div style={{
              marginBottom: 14,
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(56,189,248,.07)",
              border: "1px solid rgba(56,189,248,.25)",
              display: "flex",
              alignItems: "center",
              gap: 12
            }}>
                  <Step1Icon name="chart" size={22} color="#38BDF8" /><div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#38BDF8"
                }}>Dashboard ed esecuzione campagna</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.6)",
                  lineHeight: 1.45,
                  marginTop: 2
                }}>
                      La dashboard sarà disponibile dopo il salvataggio della campagna.
                    </div>
                  </div>
                </div>
                <div style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(46,204,138,.07)",
              border: "1px solid rgba(46,204,138,.2)",
              display: "flex",
              gap: 10,
              alignItems: "center"
            }}>
                  <span style={{
                color: C.green,
                fontSize: 16,
                flexShrink: 0
              }}>✓</span>
                  <div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.green
                }}>Configurazione flessibile</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.5)",
                  lineHeight: 1.4,
                  marginTop: 1
                }}>Potrai concordare variazioni prima del via operativo.</div>
                  </div>
                </div>
              </> : savedCampaign?.id && <div style={{
            marginBottom: 14,
            padding: "16px 18px",
            borderRadius: 14,
            background: "rgba(46,204,138,.12)",
            border: "1px solid rgba(46,204,138,.35)",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
                    <span style={{
                color: C.green,
                fontWeight: 900,
                fontSize: 24
              }}>✓</span>
                    <div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 18,
                  color: C.green
                }}>Campagna salvata e confermata!</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.7)",
                  lineHeight: 1.4,
                  marginTop: 2
                }}>
                        ID Campagna: <b style={{
                    color: C.white
                  }}>{savedCampaign.id}</b>. Puoi accedere alla dashboard di monitoraggio.
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={handleOpenSavedCampaign} style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              background: C.green,
              color: "#080F1E",
              border: "none",
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              transition: "all .2s"
            }}>
                    Apri Dashboard Campagna →
                  </button>
                </div>}

            {returnFromLogin && <div style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(46,204,138,.1)",
            border: "1px solid rgba(46,204,138,.35)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10
          }}>
                <div>
                  <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#2ECC8A",
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 4
              }}>
                    <span style={{
                  color: "#2ECC8A",
                  fontWeight: 900
                }}>✓</span> Campagna pronta
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.7)",
                lineHeight: 1.45
              }}>
                    La tua campagna è pronta. Clicca su "Conferma e avvia" per procedere.
                  </div>
                </div>
                <button type="button" onClick={() => setReturnFromLogin(false)} style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,.4)",
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
              flexShrink: 0
            }}>×</button>
              </div>}

            {showLoginRequired && <div style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(239,68,68,.1)",
            border: "1px solid rgba(239,68,68,.35)",
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}>
                <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#EF4444",
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800
            }}>
                  <Step1Icon name="lock" size={13} color="#EF4444" /> Login necessario per salvare la campagna
                </div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.45
            }}>
                  Per salvare la tua campagna e accedere alla dashboard operativa, accedi al tuo account o crea un profilo in pochi secondi.
                </div>
                <button type="button" onClick={handleLoginRequiredNavigation} style={{
              alignSelf: "flex-start",
              padding: "8px 16px",
              borderRadius: 8,
              background: "#EF4444",
              color: C.white,
              border: "none",
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer"
            }}>
                  Vai al Login →
                </button>
              </div>}

            {campaignSaveError && !showLoginRequired && <div style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.3)",
            fontFamily: F.sans,
            fontSize: 12,
            color: "#EF4444"
          }}>
                {campaignSaveError}
              </div>}

            {/* CTAs */}
            {isQuick ? <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 10
          }}>
                <button className="btn s4-btn-green" onClick={() => onHome("step1")} style={{
              width: "100%",
              padding: "16px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(232,87,26,0.4)",
              transition: "all .2s"
            }}>
                  Completa configurazione →
                </button>
                <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8
            }}>
                  <button className="btn" onClick={handleDownloadPdf} disabled={pdfBusy} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${col}40`,
                background: `${col}0e`,
                color: col,
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: pdfBusy ? "wait" : "pointer"
              }}>
                    {pdfBusy ? "Attendi…" : <><Step1Icon name="printer" size={15} color={col} /> Scarica PDF</>}
                  </button>
                  <button className="btn" onClick={() => onHome("consultant")} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "12px",
                borderRadius: 10,
                border: "1px solid rgba(56,189,248,.3)",
                background: "rgba(56,189,248,.08)",
                color: "#38BDF8",
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}>
                    <Step1Icon name="user" size={15} color="#38BDF8" /> Consulenza
                  </button>
                </div>
                <Step4SendQuoteEmail quotePdfData={quotePdfData} clientForm={clientForm} setClientForm={setClientForm} handleDownloadPdf={handleDownloadPdf} pdfBusy={pdfBusy} col={col} compact={false} />
              </div> : <button className="btn s4-btn-green" disabled={!canConfirm || savingCampaign} onClick={handleConfirmCampaign} style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: !canConfirm ? "rgba(255,255,255,.08)" : sent ? "rgba(46,204,138,.9)" : "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
            color: !canConfirm ? "rgba(255,255,255,.3)" : C.white,
            fontFamily: F.sans,
            fontSize: 15,
            fontWeight: 800,
            cursor: canConfirm && !savingCampaign ? "pointer" : "not-allowed",
            marginBottom: 10,
            boxShadow: canConfirm && !sent ? "0 8px 24px rgba(232,87,26,0.4)" : "none",
            transition: "all .2s"
          }}>
                {savingCampaign ? "Salvataggio in corso..." : sent ? "✓ Campagna confermata" : "Conferma e avvia la campagna →"}
              </button>}

            {sent && <div style={{
            marginBottom: 10,
            padding: "10px 11px",
            borderRadius: 10,
            background: "rgba(46,204,138,.07)",
            border: "1px solid rgba(46,204,138,.2)",
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.58)",
            lineHeight: 1.55
          }}>
                <b style={{
              color: C.green
            }}>Campagna confermata.</b> Riceverai una email entro 1h con i dettagli operativi.
                {confirmSyncStatus && <><br /><span style={{
                color: "rgba(255,255,255,.4)"
              }}>{confirmSyncStatus}</span></>}
              </div>}

          {!sent && !isQuick && (
            <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ color: C.white, margin: '0 0 16px 0', fontSize: 16 }}>I tuoi dati per il preventivo</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <input type="text" placeholder="Nome *" value={clientForm.nome} onChange={e => setClientForm({...clientForm, nome: e.target.value})} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: C.white, width: '100%' }} />
                <input type="email" placeholder="Email *" value={clientForm.email} onChange={e => setClientForm({...clientForm, email: e.target.value})} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: C.white, width: '100%' }} />
                <input type="tel" placeholder="Telefono *" value={clientForm.telefono} onChange={e => setClientForm({...clientForm, telefono: e.target.value})} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: C.white, width: '100%' }} />
                <input type="text" placeholder="Azienda (opzionale)" value={clientForm.azienda} onChange={e => setClientForm({...clientForm, azienda: e.target.value})} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: C.white, width: '100%' }} />
              </div>
            </div>
          )}

            {!canConfirm && confirmProblem && !isQuick && <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: C.red,
            textAlign: "center",
            marginBottom: 8
          }}>{confirmProblem}</div>}

            {!isQuick && <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 4
          }}>
                <button className="btn" onClick={handleDownloadPdf} disabled={pdfBusy} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              padding: "10px",
              borderRadius: 9,
              border: `1px solid ${col}40`,
              background: `${col}0e`,
              color: col,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: pdfBusy ? "wait" : "pointer"
            }}>
                  {pdfBusy ? "Generazione PDF…" : <><Step1Icon name="printer" size={15} color={col} /> Scarica preventivo PDF</>}
                </button>
                <Step4SendQuoteEmail quotePdfData={quotePdfData} clientForm={clientForm} setClientForm={setClientForm} handleDownloadPdf={handleDownloadPdf} pdfBusy={pdfBusy} col={col} compact={true} />
                {pdfError && <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: C.red,
              textAlign: "center"
            }}>{pdfError}</div>}
              </div>}

            {!sent && <div style={{
            marginTop: 10,
            padding: "14px",
            borderRadius: 11,
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.07)"
          }}>
                <div style={{
              fontFamily: F.sans,
              fontSize: 9,
              fontWeight: 800,
              color: "rgba(255,255,255,.28)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 12
            }}>Cosa succede dopo?</div>
                {["Riceveremo la tua richiesta.", "Verificheremo disponibilità e operatori.", "Ti confermeremo il calendario entro 24h.", "Potrai ancora modificare la configurazione prima dell'avvio."].map((step, i) => <div key={i} style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: i < 3 ? 8 : 0
            }}>
                    <div style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(46,204,138,.14)",
                border: "1px solid rgba(46,204,138,.25)",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                color: C.green,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>{i + 1}</div>
                    <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.5)",
                lineHeight: 1.5
              }}>{step}</span>
                  </div>)}
              </div>}

            <div style={{
            display: "flex",
            gap: 8,
            marginTop: 10
          }}>
              <NavButton onClick={onBack} compact style={{
              flex: 1
            }}>{"← Modifica configurazione"}</NavButton>
              <NavButton onClick={() => onHome("home")} compact style={{
              flex: 1
            }}>Home</NavButton>
            </div>
    </>
  );
}
