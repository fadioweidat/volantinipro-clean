import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const execPath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : fs.existsSync(CHROME_PATH) ? CHROME_PATH : null;

if (!execPath) {
  console.log('No browser executable found at standard locations.');
  process.exit(0);
}

// Start preview server
const preview = spawn('npx', ['vite', 'preview', '--port', '4173'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  shell: true,
  stdio: 'pipe',
});

function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 200);
      }).on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 200);
      });
    };
    check();
  });
}

try {
  await waitForServer('http://localhost:4173');
  console.log('Preview server ready at http://localhost:4173');

  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const outDir = path.resolve(import.meta.dirname, '../qa-feasibility');
  fs.mkdirSync(outDir, { recursive: true });

  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });

    // Screenshot TrustBar specifically
    const trustBar = await page.$('section[aria-label="Garanzie e tecnologie di monitoraggio"]');
    if (trustBar) {
      await trustBar.scrollIntoView();
      await new Promise(r => setTimeout(r, 500));
      await trustBar.screenshot({ path: path.join(outDir, `${vp.name}-trustbar.png`) });
    }

    // Scroll to why different section
    const whyDiff = await page.$('#chi-siamo');
    if (whyDiff) {
      await whyDiff.scrollIntoView();
      await new Promise(r => setTimeout(r, 400));
      await whyDiff.screenshot({ path: path.join(outDir, `${vp.name}-why-different.png`) });
    }

    // Check texts
    const trustBarText = await page.$eval('section[aria-label="Garanzie e tecnologie di monitoraggio"]', el => el.innerText);
    const whyDiffText = await page.$eval('#chi-siamo', el => el.innerText);

    console.log(`[${vp.name}] TrustBar has ROI:`, trustBarText.includes('Analisi convenienza e ROI'));
    console.log(`[${vp.name}] WhyDiff has Studio fattibilità:`, whyDiffText.includes('Studio di fattibilità'));
    console.log(`[${vp.name}] WhyDiff has AI + ANALISI:`, whyDiffText.includes('AI + ANALISI'));

    // Test CTA click on desktop
    if (vp.name === 'desktop-1440') {
      const ctaHref = await page.$eval('.why-diff-cta', el => el.getAttribute('href'));
      console.log(`[${vp.name}] CTA href:`, ctaHref);
    }

    await page.close();
  }

  await browser.close();
  console.log('Screenshots saved to qa-feasibility/');
} catch (err) {
  console.error('QA Error:', err);
} finally {
  preview.kill();
  process.exit(0);
}
