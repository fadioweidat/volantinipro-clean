// TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com.
// Unica fonte di verita' lato frontend per l'email Admin autorizzata —
// riusata sia dal form Login (blocco pre-invio magic link) sia da
// AdminGuard (blocco post-sessione). Il vero enforcement resta lato
// backend (public.is_authorized_admin_email(), stesso valore, migration
// 20260905150000_admin_email_allowlist.sql): questo modulo esiste solo
// per UX veloce (niente round-trip di rete per un'email chiaramente
// sbagliata) e non e' mai l'unica barriera.
export const ADMIN_AUTHORIZED_EMAIL = "fenice.sp@gmail.com";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isAuthorizedAdminEmail(email) {
  if (!email) return false;
  return normalizeEmail(email) === ADMIN_AUTHORIZED_EMAIL;
}
