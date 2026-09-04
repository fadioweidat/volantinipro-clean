import React, { useState } from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { C, F } from "../../../../lib/constants.js";
import { sendQuoteByEmail } from "../../../../api/sendEmailConferma.js";
import { buildInfoWhatsAppUrl, buildInfoMailtoUrl } from "../../../../lib/contactConfig.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mappa quotePdfData (già costruito per il PDF in Step4.jsx, stessa fonte
// dati — nessun ricalcolo) sul payload atteso da sendQuoteByEmail. Il
// grandTotal è quello reale mostrato in Step4/PDF, mai ricalcolato qui né
// nel backend email.
function buildQuotePayloadFromPdfData(quotePdfData) {
  const pricing = quotePdfData?.pricing || {};
  return {
    location: quotePdfData?.area?.mainArea || null,
    quantity: quotePdfData?.campaign?.quantity ?? null,
    service: quotePdfData?.service || null,
    distribution: quotePdfData?.campaign?.variant || null,
    printingLabel: pricing.printingLine?.label || null,
    printingAmount: pricing.printingLine?.amount ?? null,
    graphicLabel: pricing.graphicLine?.inTotal ? pricing.graphicLine.label : null,
    graphicAmount: pricing.graphicLine?.inTotal ? pricing.graphicLine.amount : null,
    extras: (quotePdfData?.extras || []).map((e) => ({ label: e.label, amount: e.price })),
    grandTotal: pricing.grandTotal ?? null,
    quoteId: quotePdfData?.quoteId || null,
  };
}

function makeRequestId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function Step4SendQuoteEmail({ quotePdfData, clientForm, setClientForm, handleDownloadPdf, pdfBusy, compact, col }) {
  // idle -> asking (email mancante) -> sending -> sent | error
  const [status, setStatus] = useState("idle");
  const [inlineEmail, setInlineEmail] = useState("");

  async function doSend(email) {
    setStatus("sending");
    const quote = buildQuotePayloadFromPdfData(quotePdfData);
    const requestId = makeRequestId();
    const res = await sendQuoteByEmail({ recipientEmail: email, recipientName: clientForm?.nome || undefined, quote, requestId });
    setStatus(res.ok ? "sent" : "error");
    if (res.ok) setTimeout(() => setStatus("idle"), 4000);
  }

  function handleClick() {
    if (status === "sending") return; // FASE 6: niente doppio invio da doppio click
    const email = (clientForm?.email || "").trim();
    if (EMAIL_RE.test(email)) {
      doSend(email);
      return;
    }
    setStatus("asking");
  }

  function handleInlineConfirm() {
    const email = inlineEmail.trim();
    if (!EMAIL_RE.test(email)) return;
    if (typeof setClientForm === "function") setClientForm((prev) => ({ ...prev, email }));
    doSend(email);
  }

  const buttonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: compact ? "100%" : undefined,
    padding: compact ? "10px" : "12px",
    borderRadius: compact ? 9 : 10,
    border: "1px solid rgba(46,204,138,.25)",
    background: "rgba(46,204,138,.07)",
    color: C.green,
    fontFamily: F.sans,
    fontSize: 13,
    fontWeight: 700,
    cursor: status === "sending" ? "wait" : "pointer",
  };

  const whatsappUrl = buildInfoWhatsAppUrl();
  const mailtoUrl = buildInfoMailtoUrl();

  return (
    <div>
      <button type="button" className="btn" onClick={handleClick} disabled={status === "sending"} style={buttonStyle}>
        {status === "sending" ? "Invio…" : status === "sent" ? "✓ Inviato" : (
          <><Step1Icon name="mail" size={15} color={C.green} /> Invia preventivo via email</>
        )}
      </button>

      {status === "asking" && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            type="email"
            placeholder="La tua email"
            value={inlineEmail}
            onChange={(e) => setInlineEmail(e.target.value)}
            style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.2)", color: C.white, fontFamily: F.sans, fontSize: 12 }}
          />
          <button type="button" className="btn" onClick={handleInlineConfirm} disabled={!EMAIL_RE.test(inlineEmail.trim())} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: C.green, color: "#080F1E", fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Invia
          </button>
        </div>
      )}

      {status === "sent" && (
        <div style={{ fontFamily: F.sans, fontSize: 10, color: C.green, textAlign: "center", marginTop: 6 }}>
          Controlla la tua casella email.
        </div>
      )}

      {status === "error" && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 9, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, color: "#EF4444", lineHeight: 1.45, marginBottom: 8 }}>
            Non siamo riusciti a inviare l'email. Puoi comunque scaricare il PDF oppure contattarci.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={handleDownloadPdf} disabled={pdfBusy} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${col}40`, background: `${col}0e`, color: col, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: pdfBusy ? "wait" : "pointer" }}>
              Scarica PDF
            </button>
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(46,204,138,.3)", background: "rgba(46,204,138,.08)", color: C.green, fontFamily: F.sans, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                WhatsApp
              </a>
            )}
            <a href={mailtoUrl} style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(56,189,248,.3)", background: "rgba(56,189,248,.08)", color: "#38BDF8", fontFamily: F.sans, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              Email
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
