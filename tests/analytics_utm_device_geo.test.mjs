// Analytics Visitatori — parsing UTM / referrer / device / geo. PURI.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUtm, classifyReferrer, resolveTrafficSource } from '../src/lib/analytics/utm.js';
import { parseUserAgent, deviceTypeFromUA, browserFamilyFromUA, osFamilyFromUA } from '../src/lib/analytics/device.js';
import { readVercelGeo, prettyRegion } from '../src/lib/analytics/geo.js';

test('parseUtm: 5 campi + gclid/fbclid inferiscono la sorgente', () => {
  const u = parseUtm('?utm_source=Instagram&utm_medium=Social&utm_campaign=Estate&utm_content=story&utm_term=volantini');
  assert.deepEqual(u, { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'estate', utm_content: 'story', utm_term: 'volantini' });
  assert.equal(parseUtm('?gclid=abc').utm_source, 'google');
  assert.equal(parseUtm('?fbclid=abc').utm_source, 'facebook');
  assert.deepEqual(parseUtm(''), {});
  assert.deepEqual(parseUtm(null), {});
});

test('classifyReferrer: organic / social / referral / direct / internal', () => {
  assert.deepEqual(classifyReferrer('https://www.google.com/search?q=x'), { host: 'google.com', type: 'organic', source: 'google' });
  assert.equal(classifyReferrer('https://l.instagram.com/').source, 'instagram');
  assert.equal(classifyReferrer('https://wa.me/123').source, 'whatsapp');
  assert.equal(classifyReferrer('https://m.facebook.com/').source, 'facebook');
  assert.deepEqual(classifyReferrer('https://altro-sito.it/pagina'), { host: 'altro-sito.it', type: 'referral', source: 'altro-sito.it' });
  assert.equal(classifyReferrer('').type, 'direct');
  assert.equal(classifyReferrer(null).type, 'direct');
  assert.equal(classifyReferrer('https://www.volantinipro.it/preventivo', 'www.volantinipro.it').type, 'internal');
});

test('resolveTrafficSource: UTM prevale, poi referrer, poi direct', () => {
  assert.equal(resolveTrafficSource({ utm: { utm_source: 'newsletter', utm_medium: 'email' } }).source, 'newsletter');
  assert.equal(resolveTrafficSource({ referrerHost: 'google.com', referrerType: 'organic' }).source, 'google');
  assert.equal(resolveTrafficSource({}).source, 'direct');
});

test('device: type / browser / os famiglia (no fingerprint)', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.deepEqual(parseUserAgent(iphone), { device_type: 'mobile', browser: 'Safari', os: 'iOS' });
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  assert.deepEqual(parseUserAgent(win), { device_type: 'desktop', browser: 'Chrome', os: 'Windows' });
  assert.equal(deviceTypeFromUA('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceTypeFromUA('facebookexternalhit/1.1'), 'bot');
  assert.equal(deviceTypeFromUA('WhatsApp/2.23'), 'bot');
  assert.equal(browserFamilyFromUA('... Edg/120 ...'), 'Edge');
  assert.equal(osFamilyFromUA('... Android 13; ...'), 'Android');
  assert.equal(deviceTypeFromUA(''), 'desktop');
});

test('readVercelGeo: country/region/city dagli header, MAI IP; city url-decoded', () => {
  const headers = {
    'x-vercel-ip-country': 'it',
    'x-vercel-ip-country-region': '25',
    'x-vercel-ip-city': 'Cinisello%20Balsamo',
    'x-forwarded-for': '203.0.113.9',
    'x-real-ip': '203.0.113.9',
  };
  const g = readVercelGeo(headers);
  assert.deepEqual(g, { country: 'IT', region: '25', city: 'Cinisello Balsamo' });
  assert.equal(prettyRegion('IT', '25'), 'Lombardia');
  // niente IP nell'output
  assert.doesNotMatch(JSON.stringify(g), /203\.0\.113\.9/);
  assert.equal(readVercelGeo({}), null);
  assert.equal(readVercelGeo(new Map()), null);
});

test('readVercelGeo: accetta anche headers.get() (Fetch API)', () => {
  const map = new Map([['x-vercel-ip-country', 'FR'], ['x-vercel-ip-city', 'Paris']]);
  const g = readVercelGeo({ get: (k) => map.get(k) ?? null });
  assert.equal(g.country, 'FR');
  assert.equal(g.city, 'Paris');
});
