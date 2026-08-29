/* Client per l'Edge Function `send-graphic-request`.
 *
 * - NON invia mai un destinatario: il `to` interno è deciso server-side.
 * - Usa la anon key (come gli altri client in src/api/*). Nessun secret.
 * - Ritorna un risultato strutturato; il chiamante fa fallback su mailto se
 *   { ok:false }.
 */
import { buildGraphicRequestPayload } from "../lib/email/graphicRequestPayload.js";

export async function sendGraphicRequest(spec = {}) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, code: "BACKEND_NOT_CONFIGURED" };

  const endpoint = `${url.replace(/\/+$/, "")}/functions/v1/send-graphic-request`;
  const payload = buildGraphicRequestPayload(spec);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data?.ok) return { ok: true, clientConfirmed: Boolean(data.clientConfirmed) };
    return { ok: false, code: data?.code || `HTTP_${res.status}` };
  } catch (err) {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}
