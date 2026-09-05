import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../AdminLayout.jsx";
import { F, C } from "../../../lib/constants.js";
import {
  adminDecideModificationRequest,
  adminListConversations,
  adminListDriverDirectory,
  adminListMessages,
  adminListModificationRequests,
  adminMarkMessagesSeen,
  adminSendDriverMessage,
  adminSendMessage,
  MODIFICATION_STATUS_LABELS,
  MODIFICATION_TYPES,
} from "../../../lib/services/hub-api.js";
import { adminListIssues, adminRouteIssue, ISSUE_STATUS_LABELS } from "../../../lib/services/customer-issues-api.js";
import { listCampaignAssignments } from "../../../lib/services/admin-api.js";

// TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING — PARTE E.
// Admin e' l'hub centrale: vede TUTTE le conversazioni (Cliente<->Admin e
// Driver<->Admin, mai una terza), tutte le segnalazioni, tutte le richieste
// di modifica. Nessun accesso diretto Cliente<->Driver e' possibile da qui:
// ogni azione passa da una RPC che forza recipient_role/kind lato DB.

const FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "customer_admin", label: "Clienti" },
  { value: "driver_admin", label: "Driver" },
  { value: "unread", label: "Non letti" },
  { value: "issues", label: "Segnalazioni" },
  { value: "modification_requests", label: "Richieste modifica" },
];

const cardStyle = { background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 16 };

export function AdminCommunicationsPage({ onNav }) {
  const [filter, setFilter] = useState("all");
  const [conversations, setConversations] = useState([]);
  const [issues, setIssues] = useState([]);
  const [modRequests, setModRequests] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      let convs;
      if (filter === "driver_admin") {
        // TICKET — FIX FIRST MESSAGE ADMIN -> DRIVER: la directory include
        // TUTTI gli assignment reali, non solo quelli con gia' una
        // conversazione, cosi' l'Admin puo' scrivere per primo a un Driver
        // che non ha mai scritto (conversation_id resta null finche' non
        // parte il primo messaggio).
        const rows = await adminListDriverDirectory();
        convs = (Array.isArray(rows) ? rows : []).map((r) => ({
          key: `assignment:${r.assignment_id}`,
          kind: "driver_admin",
          id: r.conversation_id,
          assignment_id: r.assignment_id,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          zone_name: r.zone_name,
          assignment_status: r.assignment_status,
          operator_name: r.operator_name,
          unread_count: r.unread_count,
          last_message: r.last_message,
          updated_at: r.updated_at,
        }));
      } else {
        const kind = filter === "customer_admin" ? filter : null;
        const unreadOnly = filter === "unread";
        const rows = await adminListConversations({ kind, unreadOnly });
        convs = (Array.isArray(rows) ? rows : []).map((c) => ({ ...c, key: c.id }));
      }
      const [issueRows, modRows] = await Promise.all([
        adminListIssues(null).catch(() => []),
        adminListModificationRequests({}).catch(() => []),
      ]);
      setConversations(convs);
      setIssues(Array.isArray(issueRows) ? issueRows : []);
      setModRequests(Array.isArray(modRows) ? modRows : []);
    } catch (e) {
      setError(e?.message || "Comunicazioni non disponibili.");
    }
  }, [filter]);

  // Polling leggero (20s): nuovi messaggi/segnalazioni/richieste visibili
  // senza logout/refresh, stesso ordine di grandezza di Cliente/Driver.
  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 20000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.key === selectedKey) || null,
    [conversations, selectedKey]
  );

  return (
    <AdminLayout title="Comunicazioni" subtitle="Hub centrale: messaggi Cliente/Driver, segnalazioni, richieste di modifica. Dati reali Supabase." breadcrumbs={[{ label: "Comunicazioni" }]} onNav={onNav}>
      {error && <div style={{ ...cardStyle, borderColor: "rgba(239,68,68,.3)", color: "#fecaca", marginBottom: 14 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.value} type="button" onClick={() => setFilter(f.value)}
            style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.14)", background: filter === f.value ? C.orange : "rgba(255,255,255,.05)", color: filter === f.value ? "#0B1020" : "rgba(255,255,255,.75)", fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            {f.label}
          </button>
        ))}
      </div>

      {(filter === "all" || filter === "customer_admin" || filter === "driver_admin" || filter === "unread") && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 16 }}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {conversations.length === 0 && <div style={{ padding: 16, fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>{filter === "driver_admin" ? "Nessun Driver assegnato." : "Nessuna conversazione."}</div>}
            {conversations.map((c) => (
              <button key={c.key} type="button" onClick={() => setSelectedKey(c.key)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: 12, borderBottom: "1px solid rgba(255,255,255,.06)", background: c.key === selectedKey ? "rgba(232,87,26,.1)" : "transparent", border: "none", borderTop: "none", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>
                    {c.kind === "customer_admin" ? (c.customer_name || c.campaign_name || `Campagna #${String(c.campaign_id || "").slice(0, 8)}`) : (c.operator_name || c.zone_name || `Assignment #${String(c.assignment_id || "").slice(0, 8)}`)}
                  </strong>
                  {c.unread_count > 0 && <span style={{ fontSize: 10, fontWeight: 900, color: "#0B1020", background: "#f97316", borderRadius: 999, padding: "2px 7px" }}>{c.unread_count}</span>}
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
                  {c.kind === "customer_admin" ? "Cliente" : `Driver${c.zone_name ? ` · ${c.zone_name}` : ""}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`}
                </div>
                {c.last_message ? (
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_message.text}</div>
                ) : c.kind === "driver_admin" && !c.id ? (
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 4, fontStyle: "italic" }}>Nessuna conversazione ancora — scrivi il primo messaggio</div>
                ) : null}
              </button>
            ))}
          </div>
          <div style={cardStyle}>
            {selectedConversation ? (
              <ConversationDetail conversation={selectedConversation} onSent={reload} />
            ) : (
              <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>Seleziona una conversazione.</div>
            )}
          </div>
        </div>
      )}

      {filter === "issues" && <IssuesPanel issues={issues} assignments={assignments} setAssignments={setAssignments} onChanged={reload} />}
      {filter === "modification_requests" && <ModificationRequestsPanel requests={modRequests} onDecided={reload} />}
    </AdminLayout>
  );
}

function ConversationDetail({ conversation, onSent }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // TICKET — FIX FIRST MESSAGE ADMIN -> DRIVER: per una riga della directory
  // Driver senza chat ancora, conversation.id e' null finche' l'Admin non
  // invia il primo messaggio. Stato locale cosi' il resto della UI (polling,
  // lista messaggi) si aggancia subito alla conversazione appena creata,
  // senza dover riselezionare la riga dalla lista.
  const [conversationId, setConversationId] = useState(conversation.id || null);

  useEffect(() => { setConversationId(conversation.id || null); setMessages([]); }, [conversation.key, conversation.id]);

  const reload = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    const rows = await adminListMessages(conversationId).catch(() => []);
    setMessages(Array.isArray(rows) ? rows : []);
    if ((rows || []).some((m) => m.recipient_role === "admin" && !m.seen_at)) {
      adminMarkMessagesSeen(conversationId).catch(() => {});
    }
  }, [conversationId]);

  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (conversation.kind === "driver_admin") {
        // get-or-create idempotente: stesso path per il primo messaggio e
        // per i successivi, l'Admin non deve mai sapere se la chat esisteva.
        const msg = await adminSendDriverMessage({ assignmentId: conversation.assignment_id, text: text.trim() });
        setConversationId(msg.conversation_id);
      } else {
        await adminSendMessage({ conversationId, text: text.trim() });
      }
      setText("");
      await reload();
      onSent?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 10 }}>
        {conversation.kind === "customer_admin" ? `Cliente — ${conversation.customer_name || "Campagna " + String(conversation.campaign_id || "").slice(0, 8)}` : `Driver — ${conversation.operator_name || ""}${conversation.zone_name ? ` · ${conversation.zone_name}` : ""}`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto", marginBottom: 10 }}>
        {!conversationId && <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>Nessun messaggio ancora. Scrivi il primo messaggio a questo Driver.</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.sender_role === "admin" ? "flex-end" : "flex-start", maxWidth: "75%" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 2 }}>{m.sender_role}</div>
            <div style={{ padding: "8px 12px", borderRadius: 12, background: m.sender_role === "admin" ? "rgba(232,87,26,.18)" : "rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 13, color: C.white }}>{m.text}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`${conversationId ? "Rispondi" : "Scrivi il primo messaggio"} a ${conversation.kind === "customer_admin" ? "Cliente" : "Driver"}…`}
          style={{ flex: 1, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, color: "#fff", padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }} />
        <button type="submit" disabled={busy} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: C.orange, color: "#0B1020", fontWeight: 800, cursor: "pointer" }}>Invia</button>
      </form>
    </div>
  );
}

function IssuesPanel({ issues, assignments, setAssignments, onChanged }) {
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    // Assignment reali per l'instradamento manuale (fallback admin_queue) —
    // caricate una sola volta per campagna quando servono, per non appesantire
    // il polling generale della pagina.
    const campaignIds = [...new Set(issues.map((i) => i.campaign_id).filter(Boolean))];
    if (!campaignIds.length) return;
    Promise.all(campaignIds.map((id) => listCampaignAssignments(id).catch(() => [])))
      .then((lists) => setAssignments(lists.flat()));
  }, [issues, setAssignments]);

  const route = async (issueId, assignmentId) => {
    if (!assignmentId) return;
    setBusyId(issueId);
    try {
      await adminRouteIssue(issueId, assignmentId);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={cardStyle}>
      {issues.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>Nessuna segnalazione.</div>}
      {issues.map((i) => (
        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <div>
            <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{i.municipality} — {i.street} {i.house_number || ""}</strong>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
              {ISSUE_STATUS_LABELS[i.status] || i.status} · {i.routed_to === "driver" ? "assegnata" : "coda Admin"}
              {i.seen_at ? ` · vista ${new Date(i.seen_at).toLocaleString("it-IT")}` : ""}
              {i.resolved_at ? ` · risolta ${new Date(i.resolved_at).toLocaleString("it-IT")}` : ""}
            </div>
          </div>
          {i.routed_to !== "driver" && (i.status === "new" || i.status === "assigned") && (
            <select defaultValue="" disabled={busyId === i.id} onChange={(e) => route(i.id, e.target.value)}
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 12 }}>
              <option value="" disabled>Instrada a…</option>
              {assignments.filter((a) => a.campaign_id === i.campaign_id).map((a) => (
                <option key={a.id} value={a.id}>{a.operator_name || a.participant_label || a.id.slice(0, 8)}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

function ModificationRequestsPanel({ requests, onDecided }) {
  const [busyId, setBusyId] = useState(null);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      await adminDecideModificationRequest({ requestId: id, decision });
      onDecided();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={cardStyle}>
      {requests.length === 0 && <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.4)" }}>Nessuna richiesta di modifica.</div>}
      {requests.map((r) => (
        <div key={r.id} style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{r.customer_name || r.campaign_name || String(r.campaign_id).slice(0, 8)} · {MODIFICATION_TYPES.find((t) => t.value === r.type)?.label || r.type}</strong>
            <span style={{ fontSize: 11, fontWeight: 900, color: r.status === "approved" || r.status === "applied" ? C.green : r.status === "rejected" ? "#fca5a5" : "rgba(255,255,255,.6)" }}>{MODIFICATION_STATUS_LABELS[r.status] || r.status}</span>
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 4 }}>
            Attuale: {JSON.stringify(r.current_value)} · Richiesto: {r.note || JSON.stringify(r.requested_value)}
          </div>
          {r.status === "pending" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, "approved")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(46,204,138,.4)", background: "rgba(46,204,138,.1)", color: C.green, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Approva</button>
              <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, "rejected")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,.4)", background: "rgba(239,68,68,.1)", color: "#fca5a5", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Rifiuta</button>
            </div>
          )}
          {r.status === "approved" && (
            <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, "applied")} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Segna come applicata</button>
          )}
        </div>
      ))}
    </div>
  );
}
