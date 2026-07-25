import { useState } from "react";

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", navy: "#0B192C", navyDeep: "#060F1A", navyMid: "#122036",
  cream: "#FDFBF7", green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF", muted: "#64748B", white: "#FFFFFF",
};

function NavButton({ onClick, children, full = false, compact = false, style, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vp-navbtn"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        width: full ? "100%" : undefined,
        minHeight: compact ? 38 : 42,
        padding: compact ? "8px 12px" : "10px 18px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,.16)",
        background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
        color: "#F1F5F9",
        fontFamily: F.sans,
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: "pointer",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 10px 24px rgba(0,0,0,.16)",
        transition: "border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ fontFamily: F.sans, fontSize: 10, color: C.red, marginTop: 4, fontWeight: 600 }}>
      {msg}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

export default function QuickQuotePage({ onStart, onContact }) {
  const [form, setForm] = useState({
    service: "d2d", comune: "", qty: 1e4, printed: "true", format: "A5",
    urgency: "standard", startDate: "", endDate: "",
  });
  const [errors, setErrors] = useState({});

  const inputStyle = (hasError) => ({
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${hasError ? "#F8717188" : "rgba(255,255,255,.12)"}`,
    background: hasError ? "rgba(248,113,113,.04)" : "rgba(255,255,255,.06)",
    color: C.white, fontFamily: F.sans, fontSize: 14, colorScheme: "dark", transition: "all .2s",
  });

  const validate = () => {
    const next = {};
    if (!form.service) next.service = "Seleziona un servizio";
    if (!form.comune.trim()) next.comune = "Inserisci un comune o una zona";
    if (!form.qty || form.qty < 100) next.qty = "Inserisci una quantità (min. 100)";
    if (!form.format) next.format = "Seleziona un formato";
    if (!form.printed) next.printed = "Specifica se già stampato";
    if (!form.urgency) next.urgency = "Seleziona urgenza";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onStart("step4", { ...form, source: "quick_quote" });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, padding: "72px 28px 120px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <NavButton onClick={() => onStart("home")} style={{ marginBottom: 24 }}>Home</NavButton>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.blue, marginBottom: 12 }}>
            Scorciatoia
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: 48, color: C.white, letterSpacing: "-1.5px", marginBottom: 12 }}>
            Preventivo rapido
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: "rgba(255,255,255,.52)", lineHeight: 1.6 }}>
            Ricevi una stima immediata in Step 4. Potrai poi completare la configurazione o parlare con un consulente.
          </p>
        </div>

        <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", padding: "32px", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <div>
              <FieldLabel>Tipo di servizio</FieldLabel>
              <select
                value={form.service}
                onChange={(e) => setForm((prev) => ({ ...prev, service: e.target.value }))}
                style={inputStyle(errors.service)}
              >
                <option value="d2d">Door to Door (Cassette)</option>
                <option value="h2h">Hand to Hand (Promoter)</option>
                <option value="b2b">Business Distribution (Attività)</option>
              </select>
              <FieldError msg={errors.service} />
            </div>
            <div>
              <FieldLabel>Comune o zona target</FieldLabel>
              <input
                value={form.comune}
                onChange={(e) => setForm((prev) => ({ ...prev, comune: e.target.value }))}
                placeholder="Es: Milano, Cormano..."
                style={inputStyle(errors.comune)}
              />
              <FieldError msg={errors.comune} />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <FieldLabel>quantità volantini</FieldLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[5000, 10000, 25000, 50000, 100000].map((value) => (
                <button
                  key={value}
                  onClick={() => setForm((prev) => ({ ...prev, qty: value }))}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    border: `1px solid ${form.qty === value ? C.blue : "rgba(255,255,255,.12)"}`,
                    background: form.qty === value ? `${C.blue}22` : "rgba(255,255,255,.04)",
                    color: form.qty === value ? C.blue : "rgba(255,255,255,.6)",
                    fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s",
                  }}
                >
                  {value.toLocaleString("it-IT", { useGrouping: true })}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                value={form.qty}
                onChange={(e) => setForm((prev) => ({ ...prev, qty: parseInt(e.target.value) || 0 }))}
                placeholder="Inserisci quantità manuale"
                style={inputStyle(errors.qty)}
              />
              <div style={{ position: "absolute", right: 14, top: 12, fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.3)" }}>
                pz.
              </div>
            </div>
            <FieldError msg={errors.qty} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <div>
              <FieldLabel>Formato materiale</FieldLabel>
              <select
                value={form.format}
                onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))}
                style={inputStyle(errors.format)}
              >
                <option value="A6">A6 (10x15)</option>
                <option value="A5">A5 (15x21)</option>
                <option value="A4">A4 (21x29)</option>
                <option value="DL">DL (10x21)</option>
              </select>
              <FieldError msg={errors.format} />
            </div>
            <div>
              <FieldLabel>Stato materiale</FieldLabel>
              <select
                value={form.printed}
                onChange={(e) => setForm((prev) => ({ ...prev, printed: e.target.value }))}
                style={inputStyle(errors.printed)}
              >
                <option value="true">Sì, già stampato</option>
                <option value="false">No, devo stamparlo</option>
              </select>
              <FieldError msg={errors.printed} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
            <div>
              <FieldLabel>Urgenza</FieldLabel>
              <select
                value={form.urgency}
                onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value }))}
                style={inputStyle(errors.urgency)}
              >
                <option value="standard">Standard</option>
                <option value="urgent">Urgente (+30%)</option>
              </select>
              <FieldError msg={errors.urgency} />
            </div>
            <div>
              <FieldLabel>Periodo (Inizio - Fine)</FieldLabel>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  style={{ ...inputStyle(false), padding: "10px 8px" }}
                />
                <span style={{ color: "rgba(255,255,255,.2)" }}>-</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  style={{ ...inputStyle(false), padding: "10px 8px" }}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", marginBottom: 24 }}>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.5 }}>
              <b>Nota:</b> Il periodo è indicativo. Il preventivo rapido non include lo Smart Pairing. Potrai analizzare le opportunità di risparmio nel configuratore completo.
            </div>
          </div>

          <button
            onClick={handleSubmit}
            className="vb"
            style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: C.blue, color: C.white, fontFamily: F.sans, fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: `0 10px 30px ${C.blue}33` }}
          >
            Calcola preventivo rapido
          </button>
        </div>

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.65)", marginBottom: 12 }}>
            Preferisci supporto diretto?
          </p>
          <button
            onClick={() => onContact("consultant")}
            style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            className="vb"
          >
            Parla con un consulente
          </button>
        </div>
      </div>
    </div>
  );
}
