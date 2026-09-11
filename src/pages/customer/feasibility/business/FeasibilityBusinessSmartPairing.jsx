import React, { useState } from 'react';
import { hasSupabaseConfig, saveSmartPairingWaitlist } from '../../../../lib/supabaseClient.js';

// STEP 3 (§13, §14): Smart Pairing è OPZIONALE/SKIPPABLE in Business Mode.
// Nessun campo obbligatorio, nessun blocco della navigazione: "Salta" è
// sempre disponibile e non richiede alcun dato. Se l'utente si iscrive,
// viene riusata la funzione esistente saveSmartPairingWaitlist (stessa
// tabella/RLS/dedupe della Campaign Mode) — nessuna nuova scrittura DB,
// nessuna modifica alla logica Smart Pairing esistente.
export default function FeasibilityBusinessSmartPairing({ inputs, onNext, onBack }) {
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function subscribe() {
    if (!email.trim() || !hasSupabaseConfig()) { onNext(); return; }
    setBusy(true);
    let delayMs = 0;
    try {
      await saveSmartPairingWaitlist({
        nome: `Fattibilità attività · ${inputs.businessType || 'attività'}`.slice(0, 120),
        email: email.trim(),
        whatsapp: whatsapp.trim() || null,
        comune: inputs.location,
        servizio: 'd2d',
        note: `Richiesta da Studio di Fattibilità AI (Business Mode) per: ${inputs.businessType || 'attività non specificata'}.`,
      });
      setNotice('Richiesta registrata. Ti avviseremo se ci sono opportunità nella tua zona.');
      delayMs = 900;
    } catch {
      setNotice('Non siamo riusciti a registrare la richiesta ora. Puoi continuare comunque: nulla è andato perso nella tua analisi.');
      delayMs = 900;
    } finally {
      setBusy(false);
      setTimeout(onNext, delayMs);
    }
  }

  return (
    <section className="vf-panel">
      <span className="vf-eyebrow">Passo 3 di 4 · Facoltativo</span>
      <h2>Vuoi essere avvisato di opportunità nella tua zona?</h2>
      <p>Questo passo è del tutto facoltativo: puoi saltarlo senza alcuna conseguenza sul tuo report di fattibilità.</p>
      {notice && <p role="status" className="vf-notice">{notice}</p>}
      <div className="vf-form-grid">
        <div className="vf-field">
          <label htmlFor="vfb-sp-email">Email (facoltativa)</label>
          <input id="vfb-sp-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@esempio.it" />
        </div>
        <div className="vf-field">
          <label htmlFor="vfb-sp-whatsapp">WhatsApp (facoltativo)</label>
          <input id="vfb-sp-whatsapp" value={whatsapp} onChange={event => setWhatsapp(event.target.value)} placeholder="+39…" />
        </div>
      </div>
      <div className="vf-actions">
        <button type="button" onClick={onBack} disabled={busy}>Torna indietro</button>
        <button type="button" onClick={onNext} disabled={busy} data-testid="vfb-skip-smart-pairing">Salta questo passo</button>
        <button type="button" className="vf-primary" onClick={subscribe} disabled={busy || !email.trim()}>
          {busy ? 'Invio…' : 'Avvisami'}
        </button>
      </div>
    </section>
  );
}
