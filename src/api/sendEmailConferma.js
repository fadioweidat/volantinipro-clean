// Notifica "pagamento ricevuto": solo Admin, con il token della sessione. Il server
// legge destinatario e dati dalla campagna.
export async function sendPaymentReceivedEmail({ campaignId, accessToken }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !accessToken) return;
  await fetch(`${url}/functions/v1/send-email-conferma`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ type: "pagamento_ricevuto", campaign_id: campaignId }),
  });
}

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

// Notifica email Admin per nuova richiesta preventivo.
// SICUREZZA: Il destinatario Admin è vincolato server-side su info@volantinipro.it.
export async function sendQuoteAdminNotification({ campaignId, customer, quote }) {
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
      body: JSON.stringify({
        type: "preventivo_admin",
        quoteId: campaignId,
        recipientEmail: customer?.email, // per reply-to dell'admin
        recipientName: customer?.nome,
        customerPhone: customer?.telefono,
        preventivo: quote,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: body?.code || `HTTP_${response.status}` };
    return { ok: true, id: body?.id, deduped: Boolean(body?.deduped) };
  } catch (err) {
    return { ok: false, code: "NETWORK_ERROR", error: err?.message || String(err) };
  }
}

// Conferma ricezione preventivo inviata all'indirizzo email del cliente.
export async function sendQuoteCustomerConfirmation({ campaignId, customer, quote }) {
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
      body: JSON.stringify({
        type: "preventivo_cliente",
        quoteId: campaignId,
        recipientEmail: customer?.email,
        recipientName: customer?.nome,
        customerPhone: customer?.telefono,
        preventivo: quote,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, code: body?.code || `HTTP_${response.status}` };
    return { ok: true, id: body?.id, deduped: Boolean(body?.deduped) };
  } catch (err) {
    return { ok: false, code: "NETWORK_ERROR", error: err?.message || String(err) };
  }
}

