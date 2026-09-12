/* Client per l'Edge Function `send-consultation-request`.
 *
 * - NON invia mai un destinatario: il `to` interno è deciso server-side.
 * - Usa la anon key (come gli altri client in src/api/*). Nessun secret.
 * - Ritorna un risultato strutturato { ok, id?, code?, emailDispatched? }.
 *
 * Campi inviati (whitelist esplicita — nessun campo arbitrario):
 *   nome, telefono, email, comune, servizio, quantita, timing, customDate,
 *   messaggio, _hp (honeypot, sempre stringa vuota).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTES_MAX = 3000;

/**
 * Sanitizza il payload lato client: whitelist di campi, cap lunghezze,
 * nessun `to`/segreto. Il server RISANITIZZA comunque — questo è solo
 * il primo strato di difesa.
 */
function buildConsultationPayload(spec = {}) {
  const s = (v, max = 150) => String(v == null ? "" : v).trim().slice(0, max);
  const emailRaw = s(spec.email, 254).toLowerCase();
  const allowedServ = ["d2d", "h2h", "b2b"];

  const payload = {
    nome: s(spec.nome, 150),
    telefono: s(spec.telefono, 30),
    comune: s(spec.comune, 150),
    servizio: allowedServ.includes(String(spec.servizio ?? ""))
      ? spec.servizio
      : "d2d",
    quantita: Number.isFinite(Number(spec.quantita)) ? Number(spec.quantita) : 10000,
    timing: s(spec.timing, 40) || "asap",
    messaggio: String(spec.messaggio ?? "").trim().slice(0, NOTES_MAX),
    _hp: "", // honeypot — sempre vuoto
  };

  // Email opzionale: inclusa solo se valida
  if (emailRaw && EMAIL_RE.test(emailRaw)) {
    payload.email = emailRaw;
  }

  // customDate solo per timing === "custom"
  if (spec.timing === "custom" && spec.customDate) {
    payload.customDate = s(spec.customDate, 30);
  }

  return payload;
}

/**
 * Invia la richiesta consulenza all'Edge Function.
 * @returns {{ ok: boolean, id?: string, code?: string, emailDispatched?: boolean }}
 */
export async function sendConsultationRequest(spec = {}) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, code: "BACKEND_NOT_CONFIGURED" };

  const endpoint = `${url.replace(/\/+$/, "")}/functions/v1/send-consultation-request`;
  const payload = buildConsultationPayload(spec);

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

    if (res.ok && data?.ok) {
      return {
        ok: true,
        id: data.id,
        persisted: Boolean(data.persisted ?? true),
        emailDispatched: Boolean(data.emailDispatched),
      };
    }

    return {
      ok: false,
      code: data?.code || `HTTP_${res.status}`,
    };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}

// Esporta anche il builder per i test
export { buildConsultationPayload };
