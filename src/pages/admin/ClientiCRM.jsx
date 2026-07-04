import { useEffect, useMemo, useState } from "react";
import { listClienti, getClienteReferenti, updateCliente, createReferente, updateReferente, deleteReferente, CLIENTI_STATI } from "../../lib/services/crm-api.js";

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  yellow: "#FBBF24",
  blue: "#60A5FA",
  purple: "#A78BFA",
  red: "#F87171",
  white: "#FFFFFF",
};
const F = { sans: "'DM Sans', Inter, system-ui, sans-serif", serif: "'DM Serif Display', Georgia, serif" };

const STATO_LABELS = { nuovo: "Nuovo", attivo: "Attivo", inattivo: "Inattivo", vip: "VIP" };
const STATO_COLORS = { nuovo: C.blue, attivo: C.green, inattivo: "rgba(255,255,255,.4)", vip: C.yellow };

const FIELD_GROUPS = [
  {
    title: "Anagrafica",
    fields: [
      ["nome", "Nome"],
      ["cognome", "Cognome"],
      ["azienda", "Ragione sociale"],
      ["categoria", "Categoria"],
    ],
  },
  {
    title: "Dati fiscali",
    fields: [
      ["piva", "P. IVA"],
      ["codice_fiscale", "Codice fiscale"],
      ["pec", "PEC"],
      ["sdi", "Codice SDI"],
    ],
  },
  {
    title: "Contatti",
    fields: [
      ["email", "Email"],
      ["telefono", "Telefono"],
      ["cellulare", "Cellulare"],
    ],
  },
  {
    title: "Indirizzo",
    fields: [
      ["indirizzo", "Indirizzo"],
      ["comune", "Comune"],
      ["provincia", "Provincia"],
      ["cap", "CAP"],
      ["nazione", "Nazione"],
    ],
  },
];

export default function ClientiCRM() {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: true });
  const [search, setSearch] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [comuneFilter, setComuneFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState("");

  const reload = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const result = await listClienti({ search, stato: statoFilter, comune: comuneFilter });
    console.info("[CRM_CLIENTI_LOAD]", { count: result.rows.length, available: result.available, search, statoFilter, comuneFilter });
    setState({ loading: false, error: result.error || null, rows: result.rows, available: result.available });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statoFilter, comuneFilter]);

  useEffect(() => {
    const timer = setTimeout(reload, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selected = useMemo(() => state.rows.find((row) => row.id === selectedId) || null, [state.rows, selectedId]);

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={badgeStyle}>CRM</div>
        <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>Clienti</h1>
        <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>Anagrafica estesa e referenti — dati reali dalla tabella clienti.</p>
      </header>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {state.error && <div style={{ ...noticeStyle, borderColor: "rgba(248,113,113,.3)", color: C.red }}>{state.error}</div>}
      {!state.available && !state.loading && (
        <div style={{ ...noticeStyle, borderColor: "rgba(251,191,36,.3)", color: C.yellow }}>
          Colonne CRM non ancora presenti su "clienti" (vedi CRM_CLIENTI_SETUP.sql) — mostro solo i campi base già esistenti.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca nome, azienda, email, telefono, comune, tag..." style={searchInputStyle} />
        <input value={comuneFilter} onChange={(e) => setComuneFilter(e.target.value)} placeholder="Filtra per comune" style={{ ...searchInputStyle, maxWidth: 220 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", ...CLIENTI_STATI].map((id) => (
            <button
              key={id}
              onClick={() => setStatoFilter(id)}
              style={{
                padding: "8px 14px", borderRadius: 100, fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${statoFilter === id ? (STATO_COLORS[id] || C.white) : "rgba(255,255,255,.12)"}`,
                background: statoFilter === id ? `${STATO_COLORS[id] || C.white}22` : "rgba(255,255,255,.03)",
                color: statoFilter === id ? (STATO_COLORS[id] || C.white) : "rgba(255,255,255,.55)",
              }}
            >
              {id === "all" ? "Tutti" : STATO_LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,380px) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section style={cardStyle}>
          <p style={eyebrowStyle}>{state.rows.length} clienti</p>
          {state.loading ? (
            <div style={mutedTinyStyle}>Caricamento...</div>
          ) : state.rows.length === 0 ? (
            <div style={emptyStyle}>Nessun cliente reale trovato con questi filtri.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 640, overflowY: "auto" }}>
              {state.rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  style={{
                    textAlign: "left", padding: 12, borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${selectedId === row.id ? C.orange : "rgba(255,255,255,.08)"}`,
                    background: selectedId === row.id ? "rgba(232,87,26,.08)" : "rgba(255,255,255,.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{row.azienda || row.nome || row.email || "Cliente"}</strong>
                    {row.stato && (
                      <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: `${STATO_COLORS[row.stato] || C.white}18`, color: STATO_COLORS[row.stato] || C.white }}>
                        {STATO_LABELS[row.stato] || row.stato}
                      </span>
                    )}
                  </div>
                  <div style={mutedTinyStyle}>{row.email || "Email non disponibile"} · {row.comune || "Comune non disponibile"}</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          {selected ? (
            <ClienteDetail
              key={selected.id}
              cliente={selected}
              onSaved={(msg) => { setNotice(msg); reload(); }}
              onError={(msg) => setNotice(msg)}
            />
          ) : (
            <div style={{ ...cardStyle, textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: F.sans, fontSize: 13, padding: 60 }}>
              Seleziona un cliente dalla lista per vedere la scheda completa.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ClienteDetail({ cliente, onSaved, onError }) {
  const [form, setForm] = useState(() => ({ ...cliente }));
  const [saving, setSaving] = useState(false);
  const [referenti, setReferenti] = useState([]);
  const [loadingReferenti, setLoadingReferenti] = useState(true);
  const [newReferente, setNewReferente] = useState({ nome: "", ruolo: "", telefono: "", email: "", note: "" });

  useEffect(() => {
    let cancelled = false;
    setLoadingReferenti(true);
    getClienteReferenti(cliente.id).then((rows) => {
      if (!cancelled) {
        setReferenti(rows);
        setLoadingReferenti(false);
        console.info("[CRM_REFERENTI_LOAD]", { clienteId: cliente.id, count: rows.length });
      }
    });
    return () => { cancelled = true; };
  }, [cliente.id]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const patch = {};
      FIELD_GROUPS.forEach((group) => group.fields.forEach(([key]) => { patch[key] = form[key] ?? null; }));
      patch.stato = form.stato || "nuovo";
      patch.note = form.note ?? null;
      await updateCliente(cliente.id, patch);
      onSaved("Cliente aggiornato.");
    } catch (err) {
      onError(err?.message || "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const addReferente = async () => {
    if (!newReferente.nome.trim()) { onError("Il nome del referente è obbligatorio."); return; }
    try {
      const created = await createReferente(cliente.id, newReferente);
      setReferenti((prev) => [...prev, created]);
      setNewReferente({ nome: "", ruolo: "", telefono: "", email: "", note: "" });
    } catch (err) {
      onError(err?.message || "Errore creazione referente.");
    }
  };

  const removeReferente = async (id) => {
    try {
      await deleteReferente(id);
      setReferenti((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      onError(err?.message || "Errore eliminazione referente.");
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={eyebrowStyle}>Scheda cliente</p>
          <div style={{ display: "flex", gap: 6 }}>
            {CLIENTI_STATI.map((id) => (
              <button key={id} onClick={() => setField("stato", id)} style={{
                padding: "5px 11px", borderRadius: 100, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${form.stato === id ? (STATO_COLORS[id] || C.white) : "rgba(255,255,255,.12)"}`,
                background: form.stato === id ? `${STATO_COLORS[id] || C.white}22` : "rgba(255,255,255,.03)",
                color: form.stato === id ? (STATO_COLORS[id] || C.white) : "rgba(255,255,255,.55)",
              }}>{STATO_LABELS[id]}</button>
            ))}
          </div>
        </div>
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.4)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{group.title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              {group.fields.map(([key, label]) => (
                <label key={key} style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>{label}</span>
                  <input value={form[key] || ""} onChange={(e) => setField(key, e.target.value)} style={inputStyle} />
                </label>
              ))}
            </div>
          </div>
        ))}
        <label style={{ display: "grid", gap: 4, marginBottom: 14 }}>
          <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>Note</span>
          <textarea value={form.note || ""} onChange={(e) => setField("note", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </label>
        <button onClick={save} disabled={saving} style={saveButtonStyle}>{saving ? "Salvataggio..." : "Salva scheda"}</button>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Referenti ({referenti.length})</p>
        {loadingReferenti ? (
          <div style={mutedTinyStyle}>Caricamento...</div>
        ) : referenti.length === 0 ? (
          <div style={emptyStyle}>Nessun referente registrato per questo cliente.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {referenti.map((ref) => (
              <div key={ref.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10, borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div>
                  <strong style={{ fontFamily: F.sans, fontSize: 12, color: C.white }}>{ref.nome}</strong>
                  <div style={mutedTinyStyle}>{ref.ruolo || "Ruolo n/d"} · {ref.telefono || "Tel n/d"} · {ref.email || "Email n/d"}</div>
                </div>
                <button onClick={() => removeReferente(ref.id)} style={removeButtonStyle}>Rimuovi</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
          <input placeholder="Nome*" value={newReferente.nome} onChange={(e) => setNewReferente((p) => ({ ...p, nome: e.target.value }))} style={inputStyle} />
          <input placeholder="Ruolo" value={newReferente.ruolo} onChange={(e) => setNewReferente((p) => ({ ...p, ruolo: e.target.value }))} style={inputStyle} />
          <input placeholder="Telefono" value={newReferente.telefono} onChange={(e) => setNewReferente((p) => ({ ...p, telefono: e.target.value }))} style={inputStyle} />
          <input placeholder="Email" value={newReferente.email} onChange={(e) => setNewReferente((p) => ({ ...p, email: e.target.value }))} style={inputStyle} />
        </div>
        <button onClick={addReferente} style={saveButtonStyle}>Aggiungi referente</button>
      </section>
    </div>
  );
}

const badgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 20 };
const eyebrowStyle = { margin: "0 0 10px", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" };
const emptyStyle = { padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 };
const noticeStyle = { padding: 12, marginBottom: 14, borderRadius: 10, border: "1px solid rgba(46,204,138,.24)", color: C.green, fontFamily: F.sans, fontSize: 12, background: "#122036" };
const searchInputStyle = { flex: 1, minWidth: 220, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 13 };
const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 12, boxSizing: "border-box" };
const saveButtonStyle = { padding: "10px 18px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" };
const removeButtonStyle = { padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: C.red, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" };
