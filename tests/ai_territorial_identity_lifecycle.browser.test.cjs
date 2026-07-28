const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseUrl = process.env.AI_TERRITORIAL_PHASE4_URL || 'http://127.0.0.1:5180';
const identity = (id, role = 'cliente') => ({ status: 'authenticated', authUser: { id, email: `${id}@example.test` }, profile: { role } });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(`${baseUrl}/zona`, { waitUntil: 'domcontentloaded' });
    await page.setContent('<div id="root-a"></div><div id="root-b"></div><script type="module" src="/tests/fixtures/territorial-panel-harness.jsx"></script>');
    await page.waitForFunction(() => Boolean(window.__territoryHarness));
    const render = (slot, options) => page.evaluate(([target, value]) => window.__territoryHarness.render(target, value), [slot, options]);
    await render('root-a', { label: 'Varedo', identity: identity('client-a'), contextId: 'tab-a', quoteRef: 'quote-a' });
    await page.waitForFunction(() => Boolean(window.__territoryHarness.sessionId('root-a')));
    await page.locator('#root-a').getByRole('button', { name: 'Apri assistente' }).click();
    await page.locator('#root-a').getByRole('button', { name: 'Spiegami questa analisi.' }).click();
    await page.waitForFunction(() => {
      const id = window.__territoryHarness.sessionId('root-a');
      return (window.__territoryHarness.state(id)?.history?.length ?? 0) >= 2;
    });
    const initialState = await page.evaluate(() => window.__territoryHarness.state(window.__territoryHarness.sessionId('root-a')));
    assert.match(initialState.history.at(-1).content, /Analisi Door to Door per Varedo/);
    await page.locator('#root-a').getByText(/Analisi Door to Door per Varedo/).waitFor();
    const quoteASession = await page.evaluate(() => window.__territoryHarness.sessionId('root-a'));
    assert.equal(await page.evaluate((id) => window.__territoryHarness.stateExists(id), quoteASession), true);

    await render('root-a', { label: 'Varedo', identity: identity('client-a'), contextId: 'tab-a', quoteRef: 'quote-b' });
    await page.waitForFunction((id) => !window.__territoryHarness.stateExists(id), quoteASession);
    const quoteBSession = await page.evaluate(() => window.__territoryHarness.sessionId('root-a'));
    assert.notEqual(quoteASession, quoteBSession, 'Due preventivi dello stesso utente devono avere sessioni distinte.');

    await render('root-a', { label: 'Milano', identity: identity('client-b'), contextId: 'tab-a', quoteRef: 'quote-b' });
    await page.waitForFunction((id) => !window.__territoryHarness.stateExists(id), quoteBSession);
    const accountBSession = await page.evaluate(() => window.__territoryHarness.sessionId('root-a'));
    assert.notEqual(quoteBSession, accountBSession, 'Il cambio account deve invalidare la sessione precedente.');

    await render('root-a', { label: 'Milano', identity: identity('client-b', 'admin'), contextId: 'tab-a', quoteRef: 'quote-b' });
    await page.waitForFunction((id) => !window.__territoryHarness.stateExists(id), accountBSession);
    const adminSession = await page.evaluate(() => window.__territoryHarness.sessionId('root-a'));
    assert.notEqual(accountBSession, adminSession, 'Il cambio ruolo deve cambiare contesto.');

    await render('root-a', { label: 'Milano', identity: { status: 'signed_out' }, contextId: 'tab-a', quoteRef: 'quote-b' });
    await page.locator('#root-a').getByText('Sessione AI territoriale non disponibile.').waitFor();
    assert.equal(await page.evaluate((id) => window.__territoryHarness.stateExists(id), adminSession), false, 'Logout live deve cancellare cronologia e snapshot.');

    await render('root-a', { label: 'Varedo', identity: identity('client-a'), contextId: 'tab-a2', quoteRef: 'quote-a2' });
    await render('root-b', { label: 'Milano', identity: identity('client-b'), contextId: 'tab-b', quoteRef: 'quote-b2' });
    for (const slot of ['root-a', 'root-b']) {
      const openButton = page.locator(`#${slot}`).getByRole('button', { name: 'Apri assistente' });
      if (await openButton.count()) await openButton.click();
      await page.locator(`#${slot}`).getByRole('button', { name: 'Spiegami questa analisi.' }).click();
    }
    await page.locator('#root-a').getByText(/per Varedo/).waitFor(); await page.locator('#root-b').getByText(/per Milano/).waitFor();
    const sessionB = await page.evaluate(() => window.__territoryHarness.sessionId('root-b'));
    await page.evaluate(() => window.__territoryHarness.unmount('root-a'));
    assert.equal(await page.evaluate((id) => window.__territoryHarness.stateExists(id), sessionB), true, 'Unmount A non deve cancellare B.');
    await page.locator('#root-b').getByRole('button', { name: 'Quali dati risultano mancanti?' }).click();
    await page.locator('#root-b').getByText(/Stato del calcolo/).last().waitFor();
    console.log('PASS Phase 4 identity lifecycle: quote, account, role, logout live e unmount isolato');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
