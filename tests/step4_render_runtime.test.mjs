import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { resolveConfiguratorDistributionZones } from '../src/lib/pricing/resolveConfiguratorDistributionZones.js';
import { summarizeCampaignZones } from '../src/lib/step2/campaignZonesModel.js';

// Executes the actual React component, including all its child panels,
// rather than matching text in Step4.jsx (which failed to catch ReferenceErrors).
test('Step4 renders real React tree with both multi-PV and multi-comune scenarios', { timeout: 60000 }, async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const originalLocalStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const { makeStep4, multiPv, multiComune } = await server.ssrLoadModule('/tests/fixtures/step4_runtime.jsx');
    assert.equal(summarizeCampaignZones(multiPv.campaignZones).isMultiZone, true);
    assert.equal(multiComune.campaignZones, undefined, 'legacy multi-comune must not accidentally exercise multi-PV pricing');
    assert.equal(resolveConfiguratorDistributionZones(multiComune, multiComune.quantity).zones.length, 3, 'all three municipality tiers must be exercised');
    for (const [name, data] of [['multi-PV',multiPv],['multi-comune',multiComune]]) {
      const html = renderToString(makeStep4(data));
      assert.match(html, /Preventivo|Distribuzione|Prezzo/i, `${name} should render the real quote panel`);
      assert.ok(html.length > 2000, `${name} must not render a blank shell`);
    }
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    await server.close();
  }
});
