import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(__dirname, '../tests/artifacts-territory-runtime');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const NIL_ASSIGNMENT_ID = '972acf13-489b-4620-a22b-c6959a2a7405';
const ACCESS_TOKEN = '1db95ac85352edfcb7523ef0d44c59aec0f5b9444f6c0dcef16e6e148c3bcf27';
const BASE_URL = 'http://localhost:5198';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runNilRadiusVerification() {
  console.log('================================================================');
  console.log('NIL BRUZZANO + RADIUS CONTRACT RUNTIME MOBILE VERIFICATION');
  console.log(`Assignment ID: ${NIL_ASSIGNMENT_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('================================================================');

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    // Mobile Viewport: 390x844 (iPhone 14)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[MAP LOAD]') || text.includes('[BOUNDARY]') || text.includes('error') || text.includes('[DRIVER')) {
        console.log(`[BROWSER CONSOLE] ${text}`);
      }
    });

    // -------------------------------------------------------------
    // TEST 1: NIL PROGRAMMA PAGE (BRUZZANO & COMASINA)
    // -------------------------------------------------------------
    console.log('\n--- [TEST 1] NIL Programma View ---');
    const programUrl = `${BASE_URL}/driver/assignment/${NIL_ASSIGNMENT_ID}?access=${ACCESS_TOKEN}`;
    console.log(`Navigating to ${programUrl} ...`);
    await page.goto(programUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);

    const nilProgramScreenshot = path.join(ARTIFACT_DIR, '06_nil_bruzzano_program_page.png');
    await page.screenshot({ path: nilProgramScreenshot, fullPage: true });
    console.log(`Saved screenshot: ${nilProgramScreenshot}`);

    const content = await page.content();
    const hasBruzzano = content.includes('BRUZZANO');
    const hasComasina = content.includes('COMASINA');
    const has7524 = content.includes('7.524');
    const has4174 = content.includes('4.174');
    console.log(`NIL Programma content: BRUZZANO=${hasBruzzano}, COMASINA=${hasComasina}, Qty 7.524=${has7524}, Qty 4.174=${has4174}`);

    // -------------------------------------------------------------
    // TEST 2: NIL WORK MAP (BRUZZANO BOUNDARY)
    // -------------------------------------------------------------
    console.log('\n--- [TEST 2] NIL Bruzzano Work Map ---');
    // Navigate via bottom Mappa button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mappaBtn = btns.find(b => b.innerText.trim() === 'Mappa');
      if (mappaBtn) mappaBtn.click();
    });

    await sleep(6000);

    const nilMapScreenshot = path.join(ARTIFACT_DIR, '07_nil_bruzzano_map.png');
    await page.screenshot({ path: nilMapScreenshot });
    console.log(`Saved screenshot: ${nilMapScreenshot}`);

    const headerTitle = await page.$eval('header h1', el => el.innerText).catch(() => null);
    const subtitle = await page.$eval('header p', el => el.innerText).catch(() => null);
    console.log(`NIL Map Header: Title="${headerTitle}", Subtitle="${subtitle}"`);

    // -------------------------------------------------------------
    // TEST 3: SWITCH TO COMASINA
    // -------------------------------------------------------------
    console.log('\n--- [TEST 3] Switch to COMASINA ---');
    const comasinaClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(btn => btn.innerText.includes('COMASINA'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (comasinaClicked) {
      console.log('Clicked COMASINA chip, waiting for resolution...');
      await sleep(4000);

      const comasinaMapScreenshot = path.join(ARTIFACT_DIR, '08_nil_comasina_map.png');
      await page.screenshot({ path: comasinaMapScreenshot });
      console.log(`Saved screenshot: ${comasinaMapScreenshot}`);

      const comasinaTitle = await page.$eval('header h1', el => el.innerText).catch(() => null);
      const comasinaSubtitle = await page.$eval('header p', el => el.innerText).catch(() => null);
      console.log(`After switch - Header: Title="${comasinaTitle}", Subtitle="${comasinaSubtitle}"`);
    } else {
      console.error('COMASINA chip not found');
    }

    console.log('\n================================================================');
    console.log('NIL RUNTIME VERIFICATION COMPLETED');
    console.log('================================================================');
  } catch (err) {
    console.error('[TEST ERROR]', err);
  } finally {
    await browser.close();
  }
}

runNilRadiusVerification();
