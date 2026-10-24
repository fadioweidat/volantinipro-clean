// Works in the admin browser and in the provisioning CLI. No credentials are
// persisted here; the optional project-wide bypass is for the owner's pilot.
export function buildTraccarServerUrl(server, key, bypass = '') {
  const url = new URL(server);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname !== '/api/gps/traccar' || !/^[a-f0-9]{64}$/.test(key)) {
    throw new Error('URL o chiave Traccar non validi');
  }
  url.searchParams.set('key', key);
  if (bypass) {
    // Do not accidentally send a Vercel project credential to another host.
    if (!url.hostname.startsWith('volantinipro-')
      || !url.hostname.endsWith('-fenicesp-gmailcoms-projects.vercel.app')
      || typeof bypass !== 'string' || bypass.length > 2048 || /\s/.test(bypass)) {
      throw new Error('Il bypass è consentito solo sulla preview Vercel di VolantiniPro');
    }
    url.searchParams.set('x-vercel-protection-bypass', bypass);
  }
  // No x-vercel-set-bypass-cookie: mobile clients must avoid a redirect flow.
  return url.toString();
}

export async function createTraccarCredentials(cryptoApi = globalThis.crypto) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { key, tokenHash };
}
