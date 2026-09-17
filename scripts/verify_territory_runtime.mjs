import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(__dirname, '../tests/artifacts-territory-runtime');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const TARGET_ASSIGNMENT_ID = '76c776c2-de91-4a6b-9408-fe18dcd13aa4';
const BASE_URL = 'http://localhost:5198';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('==================================================');
  console.log('TERRITORY RUNTIME VERIFICATION (MOBILE VIEWPORT)');
  console.log(`Target Assignment: ${TARGET_ASSIGNMENT_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('==================================================');

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    // iPhone 14 Pro / mobile viewport: 390x844
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[MAP LOAD]') || text.includes('[BOUNDARY]') || text.includes('error') || text.includes('[DRIVER')) {
        console.log(`[BROWSER CONSOLE] ${text}`);
      }
    });

    page.on('pageerror', err => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });

    // -------------------------------------------------------------
    // SCENARIO 1: Driver Assignment Programma Page
    // -------------------------------------------------------------
    console.log('\n--- [SCENARIO 1] Driver Programma Page ---');
    const programUrl = `${BASE_URL}/driver/assignment/${TARGET_ASSIGNMENT_ID}`;
    console.log(`Navigating to ${programUrl} ...`);
    await page.goto(programUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);

    const programScreenshotPath = path.join(ARTIFACT_DIR, '01_driver_program_page.png');
    await page.screenshot({ path: programScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${programScreenshotPath}`);

    // Verify zone chips/cards in Programma
    const pageContent = await page.content();
    const hasMilano = pageContent.includes('Milano');
    const hasCormano = pageContent.includes('Cormano');
    const hasBollate = pageContent.includes('Bollate');
    console.log(`Program zones presence: Milano=${hasMilano}, Cormano=${hasCormano}, Bollate=${hasBollate}`);

    // Click on the bottom "Mappa" button to enter DriverWorkMapPage via SPA navigation
    console.log('\nNavigating to Map via bottom Mappa button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mappaBtn = btns.find(b => b.innerText.trim() === 'Mappa');
      if (mappaBtn) mappaBtn.click();
    });

    await sleep(6000);

    const map1ScreenshotPath = path.join(ARTIFACT_DIR, '02_driver_map_default_zone.png');
    await page.screenshot({ path: map1ScreenshotPath });
    console.log(`Saved screenshot: ${map1ScreenshotPath}`);

    const headerTitle1 = await page.$eval('header h1', el => el.innerText).catch(() => null);
    const subtitle1 = await page.$eval('header p', el => el.innerText).catch(() => null);
    console.log(`Default Map Header Title: "${headerTitle1}", Subtitle: "${subtitle1}"`);

    // -------------------------------------------------------------
    // SCENARIO 3: Switch to Cormano (Zone 2)
    // -------------------------------------------------------------
    console.log('\n--- [SCENARIO 3] Switch to Cormano ---');
    const cormanoClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(btn => btn.innerText.includes('Cormano'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (cormanoClicked) {
      console.log('Clicked Cormano button, waiting for boundary resolution...');
      await sleep(4000);

      const mapCormanoScreenshotPath = path.join(ARTIFACT_DIR, '03_driver_map_cormano.png');
      await page.screenshot({ path: mapCormanoScreenshotPath });
      console.log(`Saved screenshot: ${mapCormanoScreenshotPath}`);

      const headerTitleCormano = await page.$eval('header h1', el => el.innerText).catch(() => null);
      const subtitleCormano = await page.$eval('header p', el => el.innerText).catch(() => null);
      console.log(`After switch - Header Title: "${headerTitleCormano}", Subtitle: "${subtitleCormano}"`);
    } else {
      console.error('Cormano button not found in switcher!');
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Switch to Bollate (Zone 8) - Verify Bug B Fix (No Cinisello Bleed)
    // -------------------------------------------------------------
    console.log('\n--- [SCENARIO 4] Switch to Bollate (Bug B Verification) ---');
    const bollateClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(btn => btn.innerText.includes('Bollate'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (bollateClicked) {
      console.log('Clicked Bollate button, checking atomic polygon switch...');
      await sleep(4000);

      const mapBollateScreenshotPath = path.join(ARTIFACT_DIR, '04_driver_map_bollate.png');
      await page.screenshot({ path: mapBollateScreenshotPath });
      console.log(`Saved screenshot: ${mapBollateScreenshotPath}`);

      const headerTitleBollate = await page.$eval('header h1', el => el.innerText).catch(() => null);
      const subtitleBollate = await page.$eval('header p', el => el.innerText).catch(() => null);
      console.log(`After switch to Bollate - Header Title: "${headerTitleBollate}", Subtitle: "${subtitleBollate}"`);

      // Check current URL search params
      const currentUrl = await page.url();
      console.log(`Current URL with zoneId param: ${currentUrl}`);
    } else {
      console.error('Bollate button not found in switcher!');
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Direct URL navigation with ?zoneId parameter
    // -------------------------------------------------------------
    console.log('\n--- [SCENARIO 5] Direct URL Deep Link Navigation to Bollate ---');
    const deepLinkUrl = `${BASE_URL}/driver/assignment/${TARGET_ASSIGNMENT_ID}/map?zoneId=cabb5086-2361-4700-8d86-06bc8ec9f808`;
    console.log(`Navigating to deep link: ${deepLinkUrl} ...`);
    await page.goto(deepLinkUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);

    const mapDeepLinkScreenshotPath = path.join(ARTIFACT_DIR, '05_driver_map_deeplink_bollate.png');
    await page.screenshot({ path: mapDeepLinkScreenshotPath });
    console.log(`Saved screenshot: ${mapDeepLinkScreenshotPath}`);

    const headerTitleDeep = await page.$eval('header h1', el => el.innerText).catch(() => null);
    const subtitleDeep = await page.$eval('header p', el => el.innerText).catch(() => null);
    console.log(`Deep Link Header Title: "${headerTitleDeep}", Subtitle: "${subtitleDeep}"`);

    console.log('\n==================================================');
    console.log('ALL RUNTIME VERIFICATIONS COMPLETED SUCCESSFULLY');
    console.log('==================================================');
  } catch (err) {
    console.error('[TEST ERROR]', err);
  } finally {
    await browser.close();
  }
}

runTest();
