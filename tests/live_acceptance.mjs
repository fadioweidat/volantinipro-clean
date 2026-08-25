import https from 'https';

const API_URL = "https://mqkelrsvksrzrpmbstvd.supabase.co/functions/v1/fadi-gateway";
const SECRET = "test_secret_vp1_fadi_live";

async function fetchLive(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runLiveAcceptance() {
  console.log("=== LIVE ACCEPTANCE TEST (FADI-GATEWAY) ===");

  let result;

  // 1. Metodo diverso da POST
  result = await fetchLive(API_URL, { method: "GET" });
  if (result.status === 405) console.log("✅ Metodo GET rifiutato (405)");
  else throw new Error("Metodo GET non rifiutato correttamente, status: " + result.status);

  // 2. Richiesta senza secret
  result = await fetchLive(API_URL, { method: "POST" });
  if (result.status === 401) console.log("✅ Richiesta senza secret rifiutata (401)");
  else throw new Error("Richiesta senza secret non rifiutata correttamente");

  // 3. Secret errato
  result = await fetchLive(API_URL, {
    method: "POST",
    headers: { "Authorization": "Bearer sbagliato" }
  });
  if (result.status === 401) console.log("✅ Richiesta con secret errato rifiutata (401)");
  else throw new Error("Richiesta con secret errato non rifiutata correttamente");

  const authHeaders = {
    "Authorization": `Bearer ${SECRET}`,
    "Content-Type": "application/json"
  };

  // 4. Action non allowlisted
  result = await fetchLive(API_URL, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ action: "drop_tables" })
  });
  if (result.status === 403) console.log("✅ Action non allowlisted rifiutata (403)");
  else throw new Error("Action non allowlisted non rifiutata correttamente");

  // 5. Health
  result = await fetchLive(API_URL, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ action: "health" })
  });
  if (result.status === 200 && result.data.message) {
    console.log("✅ Endpoint 'health' risponde correttamente");
  } else throw new Error("Endpoint 'health' fallito");

  // 6. get_active_campaigns
  result = await fetchLive(API_URL, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ action: "get_active_campaigns" })
  });
  if (result.status === 200 && Array.isArray(result.data.data)) {
    console.log(`✅ 'get_active_campaigns' ha restituito ${result.data.data.length} campagne reali`);
    const c = result.data.data[0];
    if (c) {
      console.log(`   --> Campione (ID: ${c.id}, Qty: ${c.quantity})`);
      if (c.user_id || c.client_email) throw new Error("Esporta PII non necessari!");
    }
  } else throw new Error("'get_active_campaigns' fallito");

  // 7. get_driver_assignments
  result = await fetchLive(API_URL, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ action: "get_driver_assignments" })
  });
  if (result.status === 200 && Array.isArray(result.data.data)) {
    console.log(`✅ 'get_driver_assignments' ha restituito ${result.data.data.length} assignment reali`);
  } else throw new Error("'get_driver_assignments' fallito");

  // 8. get_recent_quotes
  result = await fetchLive(API_URL, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ action: "get_recent_quotes" })
  });
  if (result.status === 200 && Array.isArray(result.data.data)) {
    console.log(`✅ 'get_recent_quotes' ha restituito ${result.data.data.length} preventivi reali`);
  } else throw new Error("'get_recent_quotes' fallito");

  // 9. get_operational_anomalies
  result = await fetchLive(API_URL, {
    method: "POST", headers: authHeaders, body: JSON.stringify({ action: "get_operational_anomalies" })
  });
  if (result.status === 200 && result.data.data && Array.isArray(result.data.data.unassigned_active_campaigns)) {
    console.log(`✅ 'get_operational_anomalies' ha eseguito con successo, trovate ${result.data.data.unassigned_active_campaigns.length} anomalie`);
  } else throw new Error("'get_operational_anomalies' fallito");

  console.log("\n=== TUTTI I TEST LIVE SUPERATI ===");
}

runLiveAcceptance().catch(console.error);
