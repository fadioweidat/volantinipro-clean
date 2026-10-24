// Server-side provisioning only. Does not create jobs or start/stop sessions.
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DEVICE_ID_RE } from '../server/traccar/protocol.js';

export async function registerDevice(args, { env = process.env, fetchImpl = fetch, output = console.log } = {}) {
  const device = args.device;
  if (!DEVICE_ID_RE.test(device || '')) throw new Error('Device ID non valido');
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const credential = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !credential) throw new Error('Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY solo sul computer amministrativo');
  async function request(path, options = {}) {
    const r = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...options, headers: { apikey: credential, Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!r.ok) throw new Error('Operazione non riuscita. Verifica migration e configurazione (nessun segreto viene mostrato).');
    return r.status === 204 ? null : r.json();
  }
  if (args.disable) {
    await request(`traccar_devices?device_id=eq.${encodeURIComponent(device)}`, {
      method: 'PATCH', body: JSON.stringify({ enabled: false }),
    });
    output('Backup Traccar disabilitato per il dispositivo indicato.');
    return;
  }
  const hours = Number(args.hours ?? 2);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('La finestra deve essere maggiore di zero e al massimo 24 ore');
  if (!/^[0-9a-f-]{36}$/i.test(args.session || '')) throw new Error('Indica --session con la sessione VolantiniPro già avviata');
  const server = new URL(args.server || '');
  if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash
    || server.pathname !== '/api/gps/traccar') throw new Error('Indica --server con URL HTTPS completo che termina in /api/gps/traccar');
  const sessions = await request(`delivery_sessions?id=eq.${args.session}&select=id,assignment_id,device_id,status,ended_at&limit=1`);
  const session = sessions?.[0];
  if (!session?.assignment_id || !session.device_id || session.status !== 'started' || session.ended_at) {
    throw new Error('Avvia prima il lavoro sul dispositivo VolantiniPro corretto; non viene creata alcuna sessione automaticamente');
  }
  const secret = randomBytes(32).toString('hex');
  const now = new Date();
  await request('traccar_devices?on_conflict=device_id', {
    method: 'POST', body: JSON.stringify({
      device_id: device, token_hash: createHash('sha256').update(secret).digest('hex'),
      operator_id: null, assignment_id: session.assignment_id, vp_device_id: session.device_id,
      enabled: true, enabled_from: now.toISOString(),
      enabled_until: new Date(now.getTime() + hours * 3600000).toISOString(),
      rate_window_started_at: null, rate_count: 0,
    }),
  });
  server.searchParams.set('key', secret);
  output(`Registrazione completata per ${hours} ore. La chiave precedente, se presente, è stata revocata.`);
  output('URL Server privato: copialo solo in Traccar Client; non inviarlo a clienti o in screenshot pubblici.');
  output(server.toString());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      device: { type: 'string' }, session: { type: 'string' }, server: { type: 'string' },
      hours: { type: 'string' }, disable: { type: 'boolean' },
    } });
    await registerDevice(values);
  } catch (error) {
    // Do not print upstream responses, URLs, credentials or stack traces.
    console.error(error.message.startsWith('Invalid URL') ? 'URL Server non valido' : error.message);
    process.exitCode = 1;
  }
}
