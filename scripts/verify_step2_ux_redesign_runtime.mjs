import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:/Users/fady/.gemini/antigravity/brain/1874960a-73ff-468e-8fcf-6a385a815078';
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function runVerification() {
  console.log('--- Starting Step 2 UX Redesign Runtime Verification ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const viewports = [
    { name: 'desktop', width: 1440, height: 900, isMobile: false },
    { name: 'samsung', width: 412, height: 915, isMobile: true },
    { name: 'iphone', width: 390, height: 844, isMobile: true }
  ];

  for (const vp of viewports) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile });

    // Navigate directly to Step 2 with 10.000 flyers
    await page.goto('http://localhost:5180/configuratore?service=d2d&qty=10000&printed=true&format=A5&urgency=normal&step=2', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Type address in search input
    const searchInput = await page.$('#step2-search-input');
    if (searchInput) {
      await searchInput.click();
      await page.evaluate(() => {
        const inp = document.querySelector('#step2-search-input');
        if (inp) {
          inp.value = '';
          inp.focus();
        }
      });
      await searchInput.type('Via Antonio Oroboni 2, Milano', { delay: 40 });
      await new Promise(r => setTimeout(r, 2500));

      // Click on the autocomplete suggestion
      const clicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div'));
        const target = els.find(el => (el.textContent.includes('Via Antonio Oroboni') || el.textContent.includes('indirizzo/punto')) && el.getAttribute('style')?.includes('cursor: pointer'));
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      console.log(`[${vp.name}] Clicked address suggestion:`, clicked);
      // Wait for GIS load and containment calculation
      await new Promise(r => setTimeout(r, 5000));
    }

    // Capture full-page screenshot: Address detected context (Blocco A & B)
    const screenshotPathAddress = path.join(ARTIFACTS_DIR, `step2_redesign_address_${vp.name}.png`);
    await page.screenshot({ path: screenshotPathAddress, fullPage: true });
    console.log(`[${vp.name}] Saved address detection screenshot to ${screenshotPathAddress}`);

    // Click "★ Usa NIL BRUZZANO"
    const nilClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Usa NIL') || b.textContent.includes('BRUZZANO'));
      if (btn) {
        btn.click();
        return btn.textContent.trim();
      }
      return false;
    });
    console.log(`[${vp.name}] Clicked NIL action:`, nilClicked);
    await new Promise(r => setTimeout(r, 4000));

    // Capture full-page screenshot: NIL selected (Blocco C & D)
    const screenshotPathNil = path.join(ARTIFACTS_DIR, `step2_redesign_nil_selected_${vp.name}.png`);
    await page.screenshot({ path: screenshotPathNil, fullPage: true });
    console.log(`[${vp.name}] Saved NIL selected screenshot to ${screenshotPathNil}`);

    // Click decision card "Adatta a 7.524 volantini" (Card 1)
    const decisionClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const adaptBtn = buttons.find(b => b.textContent.includes('Adatta') || b.textContent.includes('7.524') || b.textContent.includes('Continua con'));
      if (adaptBtn) {
        adaptBtn.click();
        return adaptBtn.textContent.trim();
      }
      return false;
    });
    console.log(`[${vp.name}] Clicked decision card:`, decisionClicked);
    await new Promise(r => setTimeout(r, 2000));

    // Capture full-page screenshot: Decision made & sidebar unlocked
    const screenshotPathDecision = path.join(ARTIFACTS_DIR, `step2_redesign_decision_made_${vp.name}.png`);
    await page.screenshot({ path: screenshotPathDecision, fullPage: true });
    console.log(`[${vp.name}] Saved decision made screenshot to ${screenshotPathDecision}`);

    // Verify Continue CTA status
    const ctaStatus = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const nextBtn = buttons.find(b => b.textContent.includes('Continua allo Step') || b.textContent.includes('Continua'));
      return nextBtn ? { text: nextBtn.textContent.trim(), disabled: nextBtn.disabled } : null;
    });
    console.log(`[${vp.name}] CTA Status:`, ctaStatus);

    await page.close();
  }

  await browser.close();
  console.log('\n--- Step 2 UX Redesign Runtime Verification Completed Successfully ---');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
