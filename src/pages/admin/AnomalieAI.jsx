import { useEffect, useState } from "react";
import { detectAnomalie, SOGLIE_ANOMALIE } from "../../lib/services/anomalie-api.js";

const C = { orange: "#E8571A", green: "#2ECC8A", yellow: "#FBBF24", red: "#F87171", white: "#FFFFFF" };
const F = { sans: "'DM Sans', Inter, system-ui, sans-serif", serif: "'DM Serif Display', Georgia, serif" };

const GRAVITA_COLORS = { alta: C.red, media: C.yellow, bassa: "rgba(255,255,255,.5)" };
const TIPO_LABELS = {
  operatore_inattivo: "Operatore inattivo",
  campagna_ferma: "Campagna ferma",
  cliente_insolvente: "Cliente insolvente",
  gps_anomalo: "GPS anomalo",
  foto_mancanti: "Foto mancanti",
  errori_ripetuti: "Errori ripetuti",
};

export default function AnomalieAI() {
  const [state, setState] = useState({ loading: true, error: null, anomalie: [], availability: {} });
  const [gravitaFilter, setGravitaFilter] = useState("all");

  const scan = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await detectAnomalie();
      setState({ loading: false, error: null, anomalie: result.anomalie, availability: result.availability });
    } catch (err) {
      setState({ loading: false, error: err?.message || "Errore durante l'analisi.", anomalie: [], availability: {} });
    }
  };

  useEffect(() => {
    scan();
  }, []);

  const filtered = gravitaFilter === "all" ? state.anomalie : state.anomalie.filter((a) => a.gravita === gravitaFilter);
  const counts = { alta: 0, media: 0, bassa: 0 };
  state.anomalie.forEach((a) => { counts[a.gravita] = (counts[a.gravita] || 0) + 1; });

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={badgeStyle}>AI COPILOT</div>
          <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>Rilevamento anomalie</h1>
          <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>Regole deterministiche su dati reali — nessun LLM, nessuna modifica automatica ai dati.</p>
        </div>
        <button onClick={scan} disabled={state.loading} style={scanButtonStyle}>{state.loading ? "Analisi in corso..." : "Ricontrolla ora"}</button>
      </header>

      {state.error && <div style={{ ...noticeStyle, borderColor: "rgba(248,113,113,.3)", color: C.red }}>{state.error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {["alta", "media", "bassa"].map((g) => (
          <button key={g} onClick={() => setGravitaFilter(gravitaFilter === g ? "all" : g)} style={{
            ...cardStyle, textAlign: "left", cursor: "pointer",
            border: `1px solid ${gravitaFilter === g ? GRAVITA_COLORS[g] : "rgba(255,255,255,.08)"}`,
          }}>
            <p style={eyebrowStyle}>Gravità {g}</p>
            <strong style={{ fontFamily: F.serif, fontSize: 28, color: GRAVITA_COLORS[g] }}>{counts[g] || 0}</strong>
          </button>
        ))}
      </div>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={eyebrowStyle}>{filtered.length} anomalie {gravitaFilter !== "all" ? `(gravità ${gravitaFilter})` : "rilevate"}</p>
          {gravitaFilter !== "all" && <button onClick={() => setGravitaFilter("all")} style={mutedLinkStyle}>Mostra tutte</button>}
        </div>
        {state.loading ? (
          <div style={mutedTinyStyle}>Analisi in corso...</div>
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>Nessuna anomalia rilevata con questi filtri — dati reali analizzati, nessun problema trovato.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map((a) => (
              <div key={a.id} style={rowStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontFamily: F.sans, fontSize: 13, color: C.white }}>{a.titolo}</strong>
                  <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: `${GRAVITA_COLORS[a.gravita]}18`, color: GRAVITA_COLORS[a.gravita] }}>{a.gravita}</span>
                </div>
                <div style={mutedTinyStyle}>{TIPO_LABELS[a.tipo] || a.tipo} · {a.dettaglio}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <p style={eyebrowStyle}>Soglie applicate</p>
        <div style={mutedTinyStyle}>
          Cliente insolvente: oltre {SOGLIE_ANOMALIE.clienteInsolventeGiorni} giorni senza pagamento registrato · Velocità GPS implausibile: oltre {SOGLIE_ANOMALIE.gpsVelocitaMaxKmH} km/h ·
          Precisione GPS scarsa: oltre ±{SOGLIE_ANOMALIE.gpsAccuratezzaMaxM}m · Errori ripetuti: {SOGLIE_ANOMALIE.erroriRipetutiSoglia}+ fallimenti nelle ultime {SOGLIE_ANOMALIE.erroriRipetutiFinestraOre}h.
        </div>
      </section>
    </main>
  );
}

const badgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 20 };
const eyebrowStyle = { margin: "0 0 8px", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" };
const mutedTinyStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)", lineHeight: 1.6 };
const mutedLinkStyle = { background: "none", border: "none", color: C.orange, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" };
const emptyStyle = { padding: 16, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12 };
const noticeStyle = { padding: 12, marginBottom: 14, borderRadius: 10, border: "1px solid rgba(248,113,113,.3)", color: C.red, fontFamily: F.sans, fontSize: 12, background: "#122036" };
const rowStyle = { padding: 12, borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" };
const scanButtonStyle = { padding: "10px 18px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" };
