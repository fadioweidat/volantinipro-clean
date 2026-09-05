import { useState } from "react";
import { saveSmartPairingWaitlist } from "../../lib/supabaseClient.js";

// Enterprise — campagne su larga scala, multi-città e multi-sede.
// Backend: riusa saveSmartPairingWaitlist (nessuna nuova tabella). Il payload
// mantiene servizio "Enterprise" e la nota inizia con [ENTERPRISE LEAD].
// Design: compatto/SaaS, dark premium, brand VolantiniPro.

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", orangeHover: "#D14A14", navy: "#0B1020",
  blue: "#60A5FA", green: "#2ECC8A", red: "#F87171", white: "#FFFFFF",
};

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
  color: C.white, fontFamily: F.sans, fontSize: 13, colorScheme: "dark",
};

function FieldLabel({ children, required }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.42)", marginBottom: 5 }}>
      {children}
      {required
        ? <span style={{ color: C.red, marginLeft: 4 }}>*</span>
        : <span style={{ color: "rgba(255,255,255,.28)", fontWeight: 600, marginLeft: 4 }}>(opzionale)</span>}
    </div>
  );
}

function EnterpriseContactModal({ onClose }) {
  const [form, setForm] = useState({
    azienda: "", referente: "", email: "", telefono: "",
    sedi: "", citta: "", quantita: "", frequenza: "Da definire",
    messaggio: "", privacy: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const setField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // doppio submit impedito
    if (!form.azienda.trim() || !form.referente.trim() || !form.email.trim() || !form.telefono.trim() || !form.privacy) {
      setError("Compila i campi obbligatori e accetta la privacy.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const note = [
      "[ENTERPRISE LEAD]",
      "Servizio: Enterprise",
      `Azienda: ${form.azienda.trim()}`,
      `Referente: ${form.referente.trim()}`,
      `Telefono: ${form.telefono.trim()}`,
      `Numero sedi / punti vendita: ${form.sedi.trim() || "-"}`,
      `Città / Regioni: ${form.citta.trim() || "-"}`,
      `Quantità: ${form.quantita.trim() || "-"}`,
      `Frequenza: ${form.frequenza}`,
      "",
      "Esigenze:",
      form.messaggio.trim() || "-",
    ].join("\n");

    const payload = {
      nome: form.nome.trim() || form.azienda.trim() || "Richiesta Enterprise",
      servizio: "Enterprise",
      email: form.email.trim(),
      whatsapp: form.telefono.trim(),
      comune: form.citta.trim() || "Multi-città",
      note,
    };

    try {
      await saveSmartPairingWaitlist(payload);
      setSubmitted(true); // successo solo dopo insert riuscito
    } catch (err) {
      setError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setSubmitting(false);
    }
  };

  const overlay = {
    position: "fixed", inset: 0, zIndex: 9999, background: "rgba(6,15,26,.85)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  };

  if (submitted) {
    return (
      <div style={overlay} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#111A2A", borderRadius: 16, padding: 32, border: "1px solid rgba(255,255,255,.08)", maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(46,204,138,.12)", color: C.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 26 }}>✓</div>
          <h3 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, margin: "0 0 12px" }}>Richiesta ricevuta.</h3>
          <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.6, margin: "0 0 24px" }}>
            Ti ricontatteremo a breve per definire il progetto su misura per la tua azienda.
          </p>
          <button type="button" onClick={onClose} style={{ background: C.orange, color: "#fff", border: "none", padding: "11px 24px", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111A2A", borderRadius: 16, padding: 24, border: "1px solid rgba(255,255,255,.08)", maxWidth: 620, width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative" }}>
        <button type="button" onClick={onClose} aria-label="Chiudi" style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: "rgba(255,255,255,.5)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.blue, marginBottom: 8 }}>Soluzioni Enterprise</div>
          <h2 style={{ fontFamily: F.serif, fontSize: 26, color: C.white, letterSpacing: "-.5px", margin: "0 0 8px" }}>Parla con il team Enterprise</h2>
          <p style={{ fontFamily: F.sans, fontSize: 13.5, color: "rgba(255,255,255,.6)", lineHeight: 1.5, margin: 0 }}>
            Per campagne complesse, multi-sede o continuative prepariamo un progetto operativo su misura.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <FieldLabel required>Azienda</FieldLabel>
              <input value={form.azienda} onChange={setField("azienda")} placeholder="Nome azienda" style={inputStyle} required />
            </div>
            <div>
              <FieldLabel required>Referente</FieldLabel>
              <input value={form.referente} onChange={setField("referente")} placeholder="Il tuo nome" style={inputStyle} required />
            </div>
            <div>
              <FieldLabel required>Email</FieldLabel>
              <input type="email" value={form.email} onChange={setField("email")} placeholder="email@azienda.com" style={inputStyle} required />
            </div>
            <div>
              <FieldLabel required>Telefono</FieldLabel>
              <input value={form.telefono} onChange={setField("telefono")} placeholder="Recapito telefonico" style={inputStyle} required />
            </div>
            <div>
              <FieldLabel>Numero sedi / punti vendita</FieldLabel>
              <input value={form.sedi} onChange={setField("sedi")} placeholder="es. 12" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Città / Regioni</FieldLabel>
              <input value={form.citta} onChange={setField("citta")} placeholder="es. Lombardia e Piemonte" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Quantità indicativa</FieldLabel>
              <input value={form.quantita} onChange={setField("quantita")} placeholder="es. 500.000" style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Frequenza</FieldLabel>
              <select value={form.frequenza} onChange={setField("frequenza")} style={inputStyle}>
                <option value="Da definire">Da definire</option>
                <option value="Una tantum">Una tantum</option>
                <option value="Mensile">Mensile</option>
                <option value="Continuativa">Continuativa</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Messaggio / esigenze</FieldLabel>
            <textarea value={form.messaggio} onChange={setField("messaggio")} placeholder="Raccontaci brevemente le tue necessità operative" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <label htmlFor="privacy-enterprise" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.5)", lineHeight: 1.45, cursor: "pointer" }}>
            <input type="checkbox" id="privacy-enterprise" checked={form.privacy} onChange={setField("privacy")} style={{ marginTop: 2, cursor: "pointer" }} required />
            <span>Acconsento al trattamento dei dati personali secondo la <a href="/privacy" style={{ color: C.blue, textDecoration: "none" }} target="_blank" rel="noreferrer">Privacy Policy</a> per la gestione della richiesta di contatto.</span>
          </label>

          {error && <div style={{ color: C.red, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600 }}>{error}</div>}

          <button type="submit" disabled={submitting} style={{ background: C.orange, color: "#fff", border: "none", padding: "12px 20px", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", width: "100%", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Invio in corso…" : "Invia richiesta"}
          </button>
        </form>
      </div>
    </div>
  );
}

const primaryCta = {
  background: C.orange, color: "#fff", border: "none",
  padding: "12px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const ghostCta = {
  background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.22)",
  padding: "12px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function EnterpriseSection() {
  const [modalOpen, setModalOpen] = useState(false);

  const blocks = [
    { t: "Multi-città e multi-sede", d: "Un unico progetto per più comuni, province, regioni o punti vendita." },
    { t: "Coordinamento centralizzato", d: "Un referente unico per organizzazione, operatori e avanzamento lavori." },
    { t: "Prove di distribuzione", d: "Tracking GPS, foto geolocalizzate, verifiche operative e report centralizzati." },
    { t: "Piano personalizzato", d: "Quantità, calendario, aree e modalità operative costruite sulle esigenze dell'azienda." },
  ];

  return (
    <section
      id="enterprise-solutions"
      className="section"
      style={{ background: "#070C16", paddingTop: 56, paddingBottom: 56, paddingLeft: 24, paddingRight: 24, borderTop: "1px solid rgba(255,255,255,.05)", borderBottom: "1px solid rgba(255,255,255,.05)" }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.blue, marginBottom: 12 }}>
            Soluzioni Enterprise
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(26px, 3.6vw, 40px)", color: "#fff", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 14px" }}>
            Distribuzione su larga scala, multi-città e multi-sede.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.6)", lineHeight: 1.6, maxWidth: 680, margin: "0 auto" }}>
            Gestisci campagne complesse senza coordinare decine di fornitori. VolantiniPro organizza distribuzione, operatori, aree, tracking GPS, foto geolocalizzate, verifiche e report da un unico punto di controllo.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2, marginBottom: 28, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,.06)" }}>
          {blocks.map((b, i) => (
            <div key={b.t} style={{ background: "#101624", padding: "18px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(96,165,250,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div>
                <h3 style={{ fontFamily: F.serif, fontSize: 15.5, color: "#fff", margin: "0 0 4px" }}>{b.t}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.5, margin: 0 }}>{b.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setModalOpen(true)} style={primaryCta}>Richiedi un progetto personalizzato</button>
          <button type="button" onClick={() => setModalOpen(true)} style={ghostCta}>Parla con il team Enterprise</button>
        </div>
      </div>

      {modalOpen && <EnterpriseContactModal onClose={() => setModalOpen(false)} />}
    </section>
  );
}
