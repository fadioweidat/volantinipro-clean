// Base URL per link destinati ad un ALTRO dispositivo (es. telefono del
// driver via WhatsApp), non per link aperti nello stesso browser che li
// genera. window.location.origin e' sbagliato ogni volta che l'Admin lavora
// da un origin che ha senso solo sulla sua macchina (localhost/127.0.0.1 in
// dev): sul telefono "localhost" indica il telefono stesso, non il server.
// VITE_PUBLIC_APP_URL (LAN IP in dev, dominio reale in produzione) ha sempre
// priorita' quando presente; altrimenti si ricade su window.location.origin
// (comportamento invariato per chi gia' lavora da un origin condivisibile).
export function getPublicAppUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      console.warn("[PUBLIC_APP_URL_FALLBACK_LOCALHOST]", {
        origin,
        hint: "Imposta VITE_PUBLIC_APP_URL (LAN IP in dev, dominio in produzione) per generare link apribili da un altro dispositivo.",
      });
    }
    return origin;
  }

  return "";
}

// Base assoluta per il redirect del magic link Auth (Cliente e Admin),
// passata come `emailRedirectTo` a supabase.auth.signInWithOtp e quindi
// serializzata nel redirect_to del ConfirmationURL.
//
// Regola: in PRODUZIONE non si usa MAI window.location.origin. Se la richiesta
// del magic link parte da un dev server raggiungibile in LAN
// (es. http://192.168.10.65:5174) o da localhost, quell'origin finirebbe nel
// link ricevuto via email e il Cliente atterrerebbe su un IP privato non
// pubblico (bug riprodotto: http://192.168.10.65:5174/#access_token=...).
// In produzione la base e' sempre il dominio pubblico configurato
// (VITE_PUBLIC_APP_URL, es. https://www.volantinipro.it).
//
// In SVILUPPO (import.meta.env.DEV === true) window.location.origin resta
// corretto: e' l'host reale da cui parte la richiesta ed e' raggiungibile
// dalla stessa macchina / rete che apre poi il link.
export function getAuthRedirectBase() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const currentOrigin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

  if (import.meta.env.DEV) {
    return currentOrigin || configured;
  }

  // Produzione.
  if (configured) return configured;
  // VITE_PUBLIC_APP_URL assente in produzione e' un errore di configurazione:
  // l'origin corrente in prod E' comunque il dominio pubblico, meglio quello
  // di una stringa vuota che romperebbe signInWithOtp.
  if (currentOrigin) {
    console.warn("[AUTH_REDIRECT_BASE_MISSING_PUBLIC_APP_URL]", {
      hint: "Imposta VITE_PUBLIC_APP_URL (dominio pubblico) nell'ambiente Production.",
    });
    return currentOrigin;
  }
  return "";
}
