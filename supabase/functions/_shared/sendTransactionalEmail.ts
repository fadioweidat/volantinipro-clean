// Servizio email transazionale centralizzato (Edge Functions Deno, server-side).
//
// - Legge RESEND_API_KEY dal server env (Deno.env). MAI dal frontend, mai nel
//   bundle Vite, mai loggata.
// - Fail closed: se la key (o il from) mancano, NON tenta l'invio e ritorna un
//   errore strutturato { ok: false, code: "EMAIL_NOT_CONFIGURED" }.
// - Valida il destinatario, imposta `from` configurato e `reply-to` se presente.
// - Ritorna sempre un risultato strutturato { ok, id?, code?, error? } — mai
//   throw verso il chiamante, mai la key nell'output.
//
// Usa l'SDK ufficiale Resend via specifier Deno `npm:` (runtime backend soltanto).

// @ts-ignore  — risolto dal runtime Edge Functions, non dal bundle frontend
import { Resend } from "npm:resend@4.0.1";

declare const Deno: any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type TransactionalEmailResult = {
  ok: boolean;
  id?: string;
  code?: string;
  error?: string;
};

function readFrom(): string | null {
  const v = (Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
  return v || null;
}

function readReplyTo(explicit?: string): string | undefined {
  const candidate = (explicit || Deno.env.get("RESEND_REPLY_TO_EMAIL") || "").trim();
  return candidate && EMAIL_RE.test(stripName(candidate)) ? candidate : undefined;
}

// "VolantiniPro <noreply@x.it>" -> "noreply@x.it"
function stripName(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  const from = readFrom();

  // Fail closed — nessun tentativo di invio senza configurazione completa.
  if (!apiKey || !from) {
    return { ok: false, code: "EMAIL_NOT_CONFIGURED", error: "Resend non configurato sul server" };
  }

  const to = String(input?.to || "").trim();
  if (!to || !EMAIL_RE.test(to)) {
    return { ok: false, code: "INVALID_RECIPIENT", error: "Destinatario email non valido" };
  }
  const subject = String(input?.subject || "").trim().slice(0, 250);
  const html = String(input?.html || "");
  const text = input?.text != null ? String(input.text) : undefined;
  if (!subject || !html) {
    return { ok: false, code: "INVALID_CONTENT", error: "Oggetto o contenuto mancante" };
  }

  try {
    const resend = new Resend(apiKey);
    const replyTo = readReplyTo(input?.replyTo);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    });
    if (error) {
      // error di Resend: messaggio pubblico, MAI la key.
      return { ok: false, code: "RESEND_ERROR", error: String(error?.message || error) };
    }
    return { ok: true, id: data?.id };
  } catch (err: any) {
    return { ok: false, code: "SEND_FAILED", error: String(err?.message || err) };
  }
}
