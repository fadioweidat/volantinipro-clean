// Plugin Vite SOLO server-side (mai bundlato nel client, mai eseguito da
// `vite build`/`vite preview`): espone un endpoint locale che minta una
// sessione Supabase REALE (via Admin API + verify pubblico) per un unico
// utente di test, cosi' il flusso Driver puo' essere provato in LAN senza
// magic link email, mantenendo intatte RLS e auth.uid() lato RPC (nessuna
// sessione finta: il token restituito e' un token reale emesso da GoTrue).
//
// La service_role key vive esclusivamente qui (processo Node del dev
// server, letta da .env.local senza prefisso VITE_, quindi mai inclusa nel
// bundle client da Vite) e non lascia mai questo processo: viene usata solo
// per chiamare /auth/v1/admin/generate_link, il cui risultato (hashed_token)
// viene poi verificato con la sola anon key (endpoint pubblico) per ottenere
// access_token/refresh_token reali.

const TEST_CAMPAIGN_ID = '59a27968-3e3d-4bc0-9635-74d9235e1463';
const TEST_USER_EMAIL = 'fenice.sp@gmail.com';
const ENDPOINT_PATH = '/__dev/driver-test-session';

function isLocalOrLanHost(hostHeader) {
  const hostname = String(hostHeader || '').split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  return /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function driverTestSessionPlugin(env) {
  return {
    name: 'driver-test-session-dev-bypass',
    // Mai in `vite build`/`vite preview`: configureServer non viene invocato
    // in quelle modalita', e apply:'serve' lo esclude esplicitamente anche
    // da qualunque altro hook futuro aggiunto a questo plugin.
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT_PATH, async (req, res, next) => {
        if (req.method !== 'POST') return next();

        if (env.VITE_ENABLE_DRIVER_DEV_BYPASS !== 'true') {
          return sendJson(res, 403, { error: 'Bypass DEV disattivato (VITE_ENABLE_DRIVER_DEV_BYPASS non e\' true).' });
        }
        if (!isLocalOrLanHost(req.headers.host)) {
          return sendJson(res, 403, { error: 'Bypass DEV disponibile solo da localhost o LAN privata (192.168.x.x).' });
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = env.VITE_SUPABASE_URL;
        const anonKey = env.VITE_SUPABASE_ANON_KEY;
        if (!serviceRoleKey || !supabaseUrl || !anonKey) {
          return sendJson(res, 500, { error: 'Bypass DEV non configurato (env Supabase mancanti).' });
        }

        const body = await readJsonBody(req);
        if (body.campaignId !== TEST_CAMPAIGN_ID) {
          return sendJson(res, 403, { error: 'Bypass DEV disponibile solo per la campagna di test.' });
        }

        try {
          const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'magiclink', email: TEST_USER_EMAIL }),
          });
          if (!linkRes.ok) {
            const errText = await linkRes.text().catch(() => '');
            console.error('[DEV BYPASS] generate_link fallito:', linkRes.status, errText);
            return sendJson(res, 502, { error: 'Impossibile generare il link di test lato Supabase.' });
          }
          const linkData = await linkRes.json();
          const hashedToken = linkData?.hashed_token || linkData?.properties?.hashed_token;
          if (!hashedToken) {
            return sendJson(res, 502, { error: 'Risposta Supabase senza hashed_token.' });
          }

          const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
            method: 'POST',
            headers: {
              apikey: anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
          });
          if (!verifyRes.ok) {
            const errText = await verifyRes.text().catch(() => '');
            console.error('[DEV BYPASS] verify fallito:', verifyRes.status, errText);
            return sendJson(res, 502, { error: 'Impossibile verificare il token di test lato Supabase.' });
          }
          const session = await verifyRes.json();
          if (!session?.access_token) {
            return sendJson(res, 502, { error: 'Sessione di test non valida (nessun access_token).' });
          }

          console.log(`[DEV BYPASS] sessione di test emessa per ${TEST_USER_EMAIL} (campagna ${TEST_CAMPAIGN_ID})`);
          return sendJson(res, 200, {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at,
            tokenType: session.token_type || 'bearer',
          });
        } catch (err) {
          console.error('[DEV BYPASS] errore inatteso:', err?.message || err);
          return sendJson(res, 500, { error: 'Bypass DEV fallito per un errore interno.' });
        }
      });
    },
  };
}
