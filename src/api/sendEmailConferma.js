export async function sendEmailConferma({ cliente, campagna, type = "conferma" }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !cliente?.email) return { skipped: true };
  const endpoint = `${url}/functions/v1/send-email-conferma`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cliente, campagna, type }),
  });
  if (!response.ok) throw new Error("Email conferma non inviata");
  return response;
}

// Invio preventivo Step4 via email ("Invia preventivo via email"). A
// differenza di sendEmailConferma() sopra, non lancia mai per una risposta
// non-ok: ritorna sempre { ok, code? } cosi' la UI puo' mostrare un
// messaggio specifico (rate limit, email non valida, servizio non
// configurato) invece di un errore generico.
export async function sendQuoteByEmail({ recipientEmail, recipientName, quote, requestId }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, code: "NOT_CONFIGURED" };
  const endpoint = `${url}/functions/v1/send-email-conferma`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "preventivo", recipientEmail, recipientName, preventivo: quote, requestId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: body?.code || `HTTP_${response.status}` };
    return { ok: true, id: body?.id, deduped: Boolean(body?.deduped) };
  } catch (err) {
    return { ok: false, code: "NETWORK_ERROR", error: err?.message || String(err) };
  }
}
