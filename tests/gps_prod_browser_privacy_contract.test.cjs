const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const files = {
  gpsApi: readFileSync('src/lib/services/gps-api.js', 'utf8'),
  hook: readFileSync('src/hooks/useGpsTracking.js', 'utf8'),
  page: readFileSync('src/pages/driver/TrackingPage.jsx', 'utf8'),
  supabaseClient: readFileSync('src/lib/supabaseClient.js', 'utf8'),
};

const combined = Object.values(files).join('\n');

assert.doesNotMatch(combined, /DEV_DRIVER_ID/, 'no development driver fallback');
assert.doesNotMatch(combined, /service_role/, 'no browser service_role');
assert.doesNotMatch(combined, /https?:\/\/(?!127\.0\.0\.1|localhost)/, 'no hardcoded remote endpoint');
assert.doesNotMatch(combined, /mqkelrsvksrzrpmbstvd|pooler\.supabase\.com/, 'no project ref or pooler reference');
assert.doesNotMatch(combined, /public\.profiles|quote_requests|campaigns\.user_id|customer_id\s*=\s*auth\.uid/, 'no schema fallback from non-production GPS designs');
assert.doesNotMatch(files.page, /react-leaflet|leaflet|Nominatim|photo-proof|Foto prova|uploadProofPhoto/, 'no map/geocoding/photo-proof in this porting block');
assert.doesNotMatch(files.page, /\/operator|\/ai|Dashboard AI|terza dashboard/i, 'no new route or third dashboard');

assert.match(files.hook, /queuedAt/, 'offline retry queue is preserved');
assert.match(files.hook, /isPermanentGpsWriteError/, 'permanent auth/RLS errors are not retried forever');
assert.doesNotMatch(files.gpsApi, /console\.log\([^)]*lat|console\.log\([^)]*lng/i, 'raw coordinates must not be logged');

console.log('gps_prod_browser_privacy_contract: PASS');
