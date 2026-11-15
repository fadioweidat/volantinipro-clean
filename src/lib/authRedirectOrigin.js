// La Preview QA ha un origin stabile e deve completare il magic link sullo
// stesso host, anche quando VITE_PUBLIC_APP_URL punta al sito di produzione.
// Nessun cambiamento al redirect della produzione o ai controlli di ruolo.
export function selectAuthRedirectOrigin({ currentOrigin, configuredOrigin, isDev }) {
  if (isDev) return currentOrigin || configuredOrigin;

  try {
    const url = new URL(currentOrigin);
    if (
      url.protocol === "https:" &&
      /^volantinipro-git-preview-qa-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname)
    ) {
      return url.origin;
    }
  } catch {
    // Origin assente/non valido: usa il normale redirect pubblico configurato.
  }

  return configuredOrigin || currentOrigin;
}
