import React, { useState } from 'react';
import { FIELDS, nextMissing } from './feasibilitySchemas.js';

export default function FeasibilityConversation({ inputs, messages, busy, onSend, onReview }) {
  const [message, setMessage] = useState('');
  const missing = nextMissing(inputs);
  return <section className="vf-panel" aria-labelledby="vf-conversation-title">
    <span className="vf-eyebrow">Un passo alla volta</span><h2 id="vf-conversation-title">Parlaci della tua attività</h2>
    <p>Raccogliamo le informazioni mancanti. Potrai verificare ogni dato prima dell’analisi.</p>
    <div className="vf-chat" role="log" aria-label="Conversazione" aria-live="polite">{messages.map((item, i) => <p key={i} className={`vf-message vf-message-${item.role}`}><strong>{item.role === 'user' ? 'Tu' : 'VolantiniPro'}</strong><span>{item.text}</span></p>)}</div>
    <p className="vf-question">{missing ? FIELDS[missing].question : 'I dati essenziali sono raccolti. Verifica il riepilogo e le ipotesi di conversione.'}</p>
    <form onSubmit={event => { event.preventDefault(); if (message.trim() && !busy) { onSend(message.trim()); setMessage(''); } }}>
      <label htmlFor="vf-chat-input">Il tuo messaggio</label><textarea id="vf-chat-input" maxLength={1500} rows={3} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ad esempio: ho una palestra…" disabled={busy} />
      <p className="vf-small">Il messaggio e i dati di questa analisi vengono inviati al servizio AI OpenAI. Evita nomi di clienti, contatti e dati sensibili. Non salviamo la chat nel browser; i soli dati del riepilogo restano in questa sessione.</p>
      <div className="vf-actions"><button className="vf-primary" disabled={busy || !message.trim()}>{busy ? 'Lettura del messaggio…' : 'Invia messaggio'}</button><button type="button" onClick={onReview} disabled={busy}>Apri riepilogo</button></div>
    </form>
  </section>;
}
