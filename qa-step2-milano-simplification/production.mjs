import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const out='qa-step2-milano-simplification';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const results=process.env.PROD_VIEWPORT ? JSON.parse(readFileSync(`${out}/production.json`,'utf8')).filter(r=>r.viewport!==process.env.PROD_VIEWPORT) : [];
try {
 for (const [name,width,height] of [['desktop',1440,900],['samsung',412,915],['iphone',390,844]]) {
  if(process.env.PROD_VIEWPORT && name!==process.env.PROD_VIEWPORT)continue;
  const failures=[];
  const context=await browser.createBrowserContext();const page=await context.newPage();await page.setViewport({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push({url:r.url().replace(/access_token=[^&]+/g,'access_token=REDACTED'),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url().replace(/access_token=[^&]+/g,'access_token=REDACTED'),status:r.status()});});
  await page.goto('https://www.volantinipro.it/configuratore?step=2&service=d2d&qty=10000',{waitUntil:'networkidle2',timeout:90000});
  await page.waitForSelector('#step2-search-input');await page.type('#step2-search-input','Via Antonio Oroboni, Milano',{delay:40});
  await page.waitForFunction(()=>[...document.querySelectorAll('div[style]')].some(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180),{timeout:45000});
  await page.evaluate(()=>{let el=[...document.querySelectorAll('div[style]')].filter(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180).at(-1);el.click();});
  await page.waitForSelector('[data-testid=milano-mode-chooser]',{timeout:60000}).catch(async e=>{await page.screenshot({path:`${out}/production-blocker.png`,fullPage:true});writeFileSync(`${out}/production-blocker.txt`,await page.evaluate(()=>document.body.innerText));throw e;});await page.waitForFunction(()=>document.querySelector('[data-testid=milano-address-context]')?.innerText.includes('BRUZZANO'),{timeout:90000}).catch(async e=>{await page.screenshot({path:`${out}/production-${name}-data-timeout.png`,fullPage:true});writeFileSync(`${out}/production-${name}-data-timeout.txt`,await page.evaluate(()=>document.body.innerText));writeFileSync(`${out}/production-${name}-network.json`,JSON.stringify(failures,null,2));throw e;});await new Promise(r=>setTimeout(r,1500));
  assert.equal(await page.$('#vp-milano-nil-search'),null);assert.equal(await page.$('.vp-milano-advanced'),null);
  assert.equal(await page.$$eval('.vp-milano-mode-card',els=>els.length),2);
  assert(await page.$eval('.vp-milano-summary .btn',e=>e.disabled));
  await page.screenshot({path:`${out}/production-${name}-initial.png`,fullPage:true});
  await page.click('.vp-milano-mode-card.is-nil');await page.waitForSelector('#vp-milano-nil-search');await page.type('#vp-milano-nil-search','BRUZZANO',{delay:40});
  await page.waitForSelector('[data-nil-toggle=add]',{timeout:60000});await page.click('[data-nil-toggle=add]');
  await page.waitForFunction(()=>document.querySelector('.vp-milano-summary')?.innerText.includes('7.524'),{timeout:60000});
  assert.equal(await page.$eval('.vp-milano-advanced',e=>e.open),false);
  await page.screenshot({path:`${out}/production-${name}-nil.png`,fullPage:true});
  await page.click('.vp-milano-mode-card.is-radius');await page.waitForSelector('.vp-milano-radius-presets button:not([disabled])',{timeout:90000});await page.click('.vp-milano-radius-presets button:not([disabled])');
  await page.waitForFunction(()=>document.querySelector('.vp-milano-radius-presets button')?.getAttribute('aria-pressed')==='true',{timeout:30000});await new Promise(r=>setTimeout(r,6000));
  assert.equal(await page.$('#vp-milano-nil-search'),null);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/production-${name}-radius.png`,fullPage:true});
  results.push({viewport:name,width,height,url:page.url(),initialUnconfirmed:true,nilSearchAndSelection:true,radiusPreset:true,overflow,errors});writeFileSync(`${out}/production.json`,JSON.stringify(results,null,2));
  console.log('PASS production',name);await context.close();
 }
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
