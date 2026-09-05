import React, { useCallback, useEffect, useState } from "react";
import { C, F } from "../../lib/constants.js";
import Button from "../ui/Button.jsx";
import {
  customerCreateModificationRequest,
  customerListMessages,
  customerListModificationRequests,
  customerMarkMessagesSeen,
  customerSendMessage,
  MODIFICATION_STATUS_LABELS,
  MODIFICATION_TYPES,
} from "../../lib/services/hub-api.js";

// TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING.
// Due sezioni pensate per la Dashboard Cliente (CampaignDashboardPage in
// volantinipro-final.jsx): "Configurazione campagna" (Step1-4 in sola
// lettura, dati REALI da campagna.metadata — nessun dato inventato) +
// "Richiedi modifica", e "Messaggi" (chat SOLO con Admin — Cliente<->Driver
// e' strutturalmente impossibile lato RPC/DB, non solo nascosto in UI).

const cardStyle = { background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 20, marginTop: 16 };
const eyebrowStyle = { margin: "0 0 10px", fontFamily: F.sans, fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.5)", fontWeight: 900 };
const rowLabelStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)", textTransform: "uppercase", letterSpacing: ".06em" };
const rowValueStyle = { fontFamily: F.sans, fontSize: 14, color: C.white, fontWeight: 700, marginTop: 2 };

function Field({ label, value }) {
  return (
    <div>
      <div style={rowLabelStyle}>{label}</div>
      <div style={rowValueStyle}>{value == null || value === "" ? "Non disponibile" : String(value)}</div>
    </div>
  );
}

function StepBlock({ title, children }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", marginBottom: 12 }}>
      <div style={{ fontFamily: F.serif, fontSize: 15, color: C.white, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>{children}</div>
    </div>
  );
}

// ── PARTE A — Configurazione campagna (Step1-4, sola lettura) ─────────────
// Fonte dati REALE: campagna.metadata (scritta dal configuratore stesso,
// stessa struttura usata da printQuotePdf.js/quote_summary) — nessuna
// ricostruzione o valore inventato lato frontend. Se un campo manca nei
// metadata resta "Non disponibile", mai un placeholder.
export function CampaignConfigSection({ campagna }) {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState(null);
  const meta = campagna?.metadata || {};
  const quote = meta.quote_summary || {};
  const step4 = meta.printing?.specs || {};
  const zones = Array.isArray(campagna?.campaignZones) ? campagna.campaignZones : [];

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <p style={eyebrowStyle}>Configurazione campagna</p>
        <Button variant="secondary" onClick={() => { setRequestType(null); setShowRequestModal(true); }}>Richiedi modifica</Button>
      </div>

      <StepBlock title="Step 1 — Servizio">
        <Field label="Servizio" value={campagna?.servizio} />
        <Field label="Quantità" value={campagna?.quantita?.toLocaleString("it-IT")} />
        <Field label="Materiale" value={meta.materiale} />
      </StepBlock>

      <StepBlock title="Step 2 — Zona">
        <Field label="Comune" value={meta.comune || campagna?.zona} />
        <Field label="Raggio" value={quote.area?.radiusKm != null ? `${quote.area.radiusKm} km` : null} />
        <Field label="Modalità area" value={quote.area?.areaMode} />
        <Field label="Zone/NIL selezionate" value={zones.length ? `${zones.length} zone` : (campagna?.comuni || []).join(", ")} />
      </StepBlock>

      <StepBlock title="Step 3 — Distribuzione">
        <Field label="Tipo" value={quote.campaign?.variant} />
        <Field label="Piano" value={meta.piano} />
        <Field label="Formato" value={meta.formato} />
      </StepBlock>

      <StepBlock title="Step 4 — Riepilogo">
        <Field label="Stampa" value={step4.format ? `${String(step4.format).toUpperCase()} · ${step4.sides || ""} · ${step4.color || ""}` : (meta.printing?.enabled ? "Richiesta" : "Non richiesta")} />
        <Field label="Grafica" value={quote.campaign?.graphicStatus} />
        <Field label="Servizi extra" value={(meta.extra_services || meta.servizi_extra || []).length ? (meta.extra_services || meta.servizi_extra).join(", ") : "Nessuno"} />
        <Field label="Totale confermato" value={campagna?.totale_euro != null ? `€ ${Number(campagna.totale_euro).toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : null} />
      </StepBlock>

      <ModificationRequestsList campaignId={campagna?.id} />

      {showRequestModal && (
        <ModificationRequestModal
          campaignId={campagna?.id}
          campagna={campagna}
          initialType={requestType}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </section>
  );
}

// ── PARTE B — Richiedi modifica ────────────────────────────────────────────
function ModificationRequestModal({ campaignId, campagna, initialType, onClose }) {
  const [type, setType] = useState(initialType || MODIFICATION_TYPES[0].value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const currentValueFor = (t) => {
    if (t === "quantita") return { quantita: campagna?.quantita ?? null };
    if (t === "zona") return { zona: campagna?.zona ?? null };
    if (t === "servizio") return { servizio: campagna?.servizio ?? null };
    return {};
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) { setError("Descrivi cosa vuoi modificare."); return; }
    setBusy(true); setError(null);
    try {
      await customerCreateModificationRequest({
        campaignId, type, currentValue: currentValueFor(type), requestedValue: { note: note.trim() }, note: note.trim(),
      });
      onClose();
    } catch (err) {
      setError(err?.message || "Invio richiesta non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ background: C.navyMid, border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 22, maxWidth: 420, width: "100%", display: "grid", gap: 10 }}>
        <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white }}>Richiedi modifica</div>
        <p style={{ margin: 0, fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
          La modifica NON è applicata automaticamente: la richiesta va all'Admin, che la valuta e — se cambia prezzo/pagamento — aggiorna tutto tramite il flusso esistente.
        </p>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          {MODIFICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <textarea placeholder="Descrivi la modifica richiesta" rows={4} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...selectStyle, resize: "vertical" }} />
        {error && <p style={{ margin: 0, fontSize: 12, color: "#fca5a5" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" type="button" onClick={onClose}>Annulla</Button>
          <Button variant="primary" type="submit" disabled={busy}>{busy ? "Invio…" : "Invia richiesta"}</Button>
        </div>
      </form>
    </div>
  );
}

function ModificationRequestsList({ campaignId }) {
  const [requests, setRequests] = useState([]);

  const reload = useCallback(async () => {
    if (!campaignId) return;
    try {
      const rows = await customerListModificationRequests(campaignId);
      setRequests(Array.isArray(rows) ? rows : []);
    } catch {
      // Nessun crash della dashboard se la richiesta fallisce: sezione vuota.
    }
  }, [campaignId]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 20000);
    return () => window.clearInterval(timer);
  }, [reload]);

  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ ...rowLabelStyle, marginBottom: 8 }}>Richieste di modifica</div>
      <div style={{ display: "grid", gap: 8 }}>
        {requests.map((r) => (
          <div key={r.id} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 13, color: C.white, fontWeight: 700 }}>{MODIFICATION_TYPES.find((t) => t.value === r.type)?.label || r.type}</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>{r.note}</div>
              {r.admin_note && <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.7)", marginTop: 4 }}>Admin: {r.admin_note}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, color: r.status === "approved" || r.status === "applied" ? C.green : r.status === "rejected" ? "#fca5a5" : "rgba(255,255,255,.6)", alignSelf: "flex-start" }}>
              {MODIFICATION_STATUS_LABELS[r.status] || r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PARTE D — Messaggi (chat SOLO con Admin) ───────────────────────────────
export function CustomerMessagesPanel({ campaignId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!campaignId) return;
    try {
      const rows = await customerListMessages(campaignId);
      setMessages(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.message || null);
    }
  }, [campaignId]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    if (messages.some((m) => m.recipient_role === "customer" && !m.seen_at)) {
      customerMarkMessagesSeen(campaignId).catch(() => {});
    }
  }, [messages, campaignId]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      await customerSendMessage({ campaignId, text: text.trim() });
      setText("");
      await reload();
    } catch (err) {
      setError(err?.message || "Invio messaggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const unreadCount = messages.filter((m) => m.recipient_role === "customer" && !m.seen_at).length;

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>
        Messaggi
        {unreadCount > 0 && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 900, color: C.navy, background: C.green, borderRadius: 999, padding: "2px 7px" }}>{unreadCount}</span>
        )}
      </p>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 10 }}>Admin / Assistenza VolantiniPro</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", marginBottom: 10 }}>
        {messages.length === 0 && <p style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>Nessun messaggio. Scrivi ad Admin per qualsiasi domanda sulla campagna.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.sender_role === "customer" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ padding: "8px 12px", borderRadius: 12, background: m.sender_role === "customer" ? "rgba(232,87,26,.18)" : "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", fontFamily: F.sans, fontSize: 13, color: C.white }}>
              {m.text}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 2, textAlign: m.sender_role === "customer" ? "right" : "left" }}>
              {new Date(m.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {m.sender_role === "customer" && (m.seen_at ? " · letto" : " · inviato")}
            </div>
          </div>
        ))}
      </div>
      {error && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi un messaggio ad Admin…" style={{ ...selectStyle, flex: 1 }} />
        <Button variant="primary" type="submit" disabled={busy}>Invia</Button>
      </form>
    </section>
  );
}

const selectStyle = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, color: "#fff", padding: "8px 10px", fontFamily: "inherit", fontSize: 13 };
