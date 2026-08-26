import { useState } from "react";
import { TimingUrgencyPicker } from "../../components/TimingUrgencyPicker.jsx";
import { trackConsultationRequested } from "../../lib/analytics/siteEvents.js";

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", navy: "#0B192C", navyDeep: "#060F1A", navyMid: "#122036",
  cream: "#FDFBF7", green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF", muted: "#64748B", white: "#FFFFFF",
};

function NavButton({ onClick, children, style, ...rest }) {
  return (
    <button
      type="button" onClick={onClick} className="vp-navbtn"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, minHeight: 42, padding: "10px 18px",
        borderRadius: 10, border: "1px solid rgba(255,255,255,.16)",
        background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
        color: "#F1F5F9", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// required=true -> asterisco rosso; required=false -> "(opzionale)", stesso
// pattern gia' usato dal solo campo "Messaggio opzionale" prima di questa
// modifica, ora esteso a tutti i campi del form.
function FieldLabel({ children, required }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>
      {children}
      {required ? (
        <span style={{ color: C.red, marginLeft: 4 }}>*</span>
      ) : (
        <span style={{ color: "rgba(255,255,255,.3)", fontWeight: 600, marginLeft: 4 }}>(opzionale)</span>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 9,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
  color: C.white, fontFamily: F.sans, fontSize: 13, colorScheme: "dark",
};

export default function ConsultantPage({ onStart, data }) {
  const [form, setForm] = useState({
    nome: "", telefono: "", email: "",
    comune: data?.cityName || data?.searchedLocation || "",
    service: data?.type || data?.selectedService || "d2d",
    qty: data?.qty || data?.flyerQuantity || 10000,
    messaggio: "",
  });
  const [timing, setTiming] = useState("asap");
  const [customDate, setCustomDate] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const goToQuick = () => {
    onStart("quick", { comune: form.comune, service: form.service, qty: form.qty });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, padding: "72px 28px 120px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <NavButton onClick={() => onStart("home")} style={{ marginBottom: 22 }}>Home</NavButton>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.orange, marginBottom: 12 }}>
            Supporto diretto
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: 46, color: C.white, letterSpacing: "-1.4px", marginBottom: 10 }}>
            Parla con un consulente
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 16, color: "rgba(255,255,255,.52)", maxWidth: 660, lineHeight: 1.65 }}>
            Raccontaci la campagna e ti ricontattiamo per costruire una proposta operativa sulla tua zona.
          </p>
        </div>

        <div style={{ borderRadius: 16, padding: "24px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 20 }}>
            <div>
              <FieldLabel required>Nome e Cognome</FieldLabel>
              <input value={form.nome} onChange={setField("nome")} placeholder="Nome e Cognome" style={inputStyle} />
            </div>
            <div>
              <FieldLabel required>Telefono / WhatsApp</FieldLabel>
              <input value={form.telefono} onChange={setField("telefono")} placeholder="Telefono / WhatsApp" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input value={form.email} onChange={setField("email")} placeholder="Email" style={inputStyle} />
            </div>
            <div>
              <FieldLabel required>Comune o zona</FieldLabel>
              <input value={form.comune} onChange={setField("comune")} placeholder="Comune o zona" style={inputStyle} />
            </div>
            <div>
              <FieldLabel required>Servizio</FieldLabel>
              <select value={form.service} onChange={setField("service")} style={inputStyle}>
                <option value="d2d">Door to Door</option>
                <option value="h2h">Hand to Hand</option>
                <option value="b2b">Business Distribution</option>
              </select>
            </div>
            <div>
              <FieldLabel required>Quantità</FieldLabel>
              <select value={form.qty} onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))} style={inputStyle}>
                {[5000, 10000, 25000, 50000, 100000].map((v) => (
                  <option key={v} value={v}>{v.toLocaleString("it-IT", { useGrouping: true })} volantini</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Quando vuoi distribuire</FieldLabel>
            <TimingUrgencyPicker
              timing={timing} onTimingChange={setTiming}
              customDate={customDate} onCustomDateChange={setCustomDate}
              inputStyle={inputStyle}
            />
          </div>

          <div>
            <FieldLabel>Messaggio</FieldLabel>
            <textarea
              value={form.messaggio} onChange={setField("messaggio")}
              placeholder="Raccontaci di più sulla campagna" rows={4}
              style={{ ...inputStyle, width: "100%", resize: "vertical", marginBottom: 12 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => { trackConsultationRequested(); setSubmitted(true); }}
              className="vb"
              style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              Invia richiesta
            </button>
            <button
              onClick={goToQuick}
              style={{ padding: "12px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Preventivo rapido
            </button>
          </div>

          {submitted && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.22)", fontFamily: F.sans, fontSize: 12, color: C.green }}>
              Richiesta registrata. Ti ricontattiamo per costruire una proposta operativa sulla tua zona.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


