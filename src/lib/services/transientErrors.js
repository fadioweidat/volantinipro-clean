// Utility condivisa per rilevamento e gestione errori transitori di rete e PostgREST schema cache (PGRST002 / HTTP 503)
export function isTransientSchemaOrNetworkError(err) {
  if (!err) return false;
  const msg = (err?.message || err?.details || String(err || '')).toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  const code = String(err?.code || '').toLowerCase();

  return (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    code === 'pgrst000' ||
    code === 'pgrst002' ||
    msg.includes('schema cache') ||
    msg.includes('schema-cache') ||
    msg.includes('pgrst000') ||
    msg.includes('pgrst002') ||
    msg.includes('retrying') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('connection refused') ||
    msg.includes('gateway timeout') ||
    msg.includes('upstream') ||
    msg.includes('timeout') ||
    msg.includes('temporaneamente non disponibile')
  );
}

export const USER_FRIENDLY_TRANSIENT_ERROR = 'Servizio temporaneamente non disponibile. Riprova tra poco.';
