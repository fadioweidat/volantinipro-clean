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
