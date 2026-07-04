import { useEffect, useState } from "react";
import { listImpostazioni, updateImpostazione } from "../../lib/services/config-api.js";

const C = { orange: "#E8571A", green: "#2ECC8A", yellow: "#FBBF24", red: "#F87171", white: "#FFFFFF" };
const F = { sans: "'DM Sans', Inter, system-ui, sans-serif", serif: "'DM Serif Display', Georgia, serif" };

export default function CentroConfigurazione() {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: true });
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  const reload = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const result = await listImpostazioni({ search });
    console.info("[CONFIG_SETTINGS_LOAD]", { count: result.rows.length, available: result.available, search });
    setState({ loading: false, error: result.error || null, rows: result.rows, available: result.available });
  };

  useEffect(() => {
    const timer = setTimeout(reload, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={badgeStyle}>CONFIG</div>
        <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>Centro Configurazione</h1>
        <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>Impostazioni generali — valori salvati e tracciati nell'audit log.</p>
      </header>

      <div style={{ ...noticeStyle, borderColor: "rgba(251,191,36,.3)", color: C.yellow, marginBottom: 16 }}>
        Queste impostazioni sono salvate e tracciate, ma non sono ancora collegate al comportamento reale del sito (colori, tema, valuta visualizzata restano quelli attuali nel codice). Collegarle è un lavoro separato.
      </div>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {state.error && <div style={{ ...noticeStyle, borderColor: "rgba(248,113,113,.3)", color: C.red }}>{state.error}</div>}
      {!state.available && !state.loading && (
        <div style={{ ...noticeStyle, borderColor: "rgba(251,191,36,.3)", color: C.yellow }}>
          Tabella "impostazioni" non ancora configurata (vedi CONFIG_CENTER_SETUP.sql).
        </div>
      )}

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca impostazione..." style={searchInputStyle} />

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <p style={eyebrowStyle}>{state.rows.length} impostazioni</p>
        {state.loading ? (
          <div style={mutedTinyStyle}>Caricamento...</div>
        ) : state.rows.length === 0 ? (
          <div style={emptyStyle}>Nessuna impostazione trovata.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {state.rows.map((row) => (
              <SettingRow key={row.chiave} row={row} onSaved={(msg) => { setNotice(msg); reload(); }} onError={(msg) => setNotice(msg)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SettingRow({ row, onSaved, onError }) {
  const [value, setValue] = useState(() => (typeof row.valore === "string" ? row.valore : JSON.stringify(row.valore ?? "")));
  const [motivazione, setMotivazione] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Le impostazioni sono jsonb: se il valore corrente era testo semplice
      // lo salviamo come stringa JSON, altrimenti proviamo a parsare.
      let parsed = value;
      try { parsed = JSON.parse(value); } catch { /* resta stringa semplice */ }
      await updateImpostazione(row.chiave, parsed, motivazione || null);
      setMotivazione("");
      onSaved(`"${row.chiave}" aggiornato.`);
    } catch (err) {
      onError(err?.message || "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const currentDisplay = typeof row.valore === "string" ? row.valore : JSON.stringify(row.valore);
  const defaultDisplay = typeof row.valore_predefinito === "string" ? row.valore_predefinito : JSON.stringify(row.valore_predefinito);

  return (
    <div style={rowStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{row.chiave}</strong>
        <span style={{ ...mutedTinyStyle, textTransform: "uppercase" }}>{row.categoria}</span>
      </div>
      {row.descrizione && <div style={{ ...mutedTinyStyle, marginBottom: 8 }}>{row.descrizione}</div>}
      <div style={mutedTinyStyle}>Valore predefinito: {defaultDisplay ?? "—"}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <input value={motivazione} onChange={(e) => setMotivazione(e.target.value)} placeholder="Motivazione (opzionale)" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button onClick={save} disabled={saving} style={saveButtonStyle}>{saving ? "..." : "Salva"}</button>
      </div>
      <div style={{ ...mutedTinyStyle, marginTop: 4, opacity: 0.6 }}>Valore attuale salvato: {currentDisplay}{row.updated_by_email ? ` · ultima modifica di ${row.updated_by_email}` : ""}</div>
    </div>
  );
}

const badgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 20 };
const eyebrowStyle = { margin: "0 0 10px", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" };
const emptyStyle = { padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 };
const noticeStyle = { padding: 12, borderRadius: 10, border: "1px solid rgba(46,204,138,.24)", color: C.green, fontFamily: F.sans, fontSize: 12, background: "#122036" };
const searchInputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 13 };
const inputStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 12, boxSizing: "border-box" };
const saveButtonStyle = { padding: "8px 16px", borderRadius: 8, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" };
const rowStyle = { padding: 14, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" };
