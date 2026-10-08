import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';

test('real Step3/Step4 browser: 1/2/5 PV, preferences, delete, refresh and mobile, zero writes', {timeout:90000},async()=>{
 const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:0,strictPort:false}});await server.listen();
 const origin=server.resolvedUrls.local[0].replace(/\/$/,'');
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {for(const n of [1,2,5]){
  const context=await browser.createBrowserContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(origin)?r.continue():r.respond({status:200,contentType:'application/json',body:'[]'}));
  await page.setViewport({width:n===5?390:1440,height:844});
  await page.evaluateOnNewDocument(n=>{const city={name:'Milano',lat:45.46,lng:9.19};window.__PAIRING_SEED={type:'d2d',qty:5959,flyerQuantity:5959,subscription:'single',urgency:'normal',hasFlyers:'yes',alreadyPrinted:true,printing:{enabled:false},city,cityName:'Milano',selectedComuni:[city],campaignZones:Array.from({length:n},(_,i)=>({id:'pv'+i,city,cityName:'Milano',searchMode:'municipality',selectedComuni:[city],readyForQuote:true,finalFlyers:5959,assigned_flyers:5959,nilManualMode:true,allocation:[{name:'ISOLA',nil_code:'9',assignedFlyers:5959,requiredFlyers:5959}],kpiSnapshot:{families:5417,population:10000,requiredFlyers:5959,analysisLevel:'nil'}}))};},n);
  await page.goto(origin+'/tests/fixtures/per-pv-pairing.html');await page.waitForSelector('[data-testid="per-pv-pairing"]');
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Punti vendita"] button').length===window.__PAIRING_STATE.campaignZones.length);
  await page.waitForFunction(()=>document.querySelector('[aria-label="Mese delle preferenze"]'));
  await page.evaluate(()=>document.querySelector('[aria-label="Disponibilità del punto vendita"] button[aria-pressed]').click());
  await page.waitForFunction(()=>Object.values(window.__PAIRING_STATE.perPvPairingPreferences).some(d=>d.length===1));
  assert.equal(await page.evaluate(()=>window.__PAIRING_STATE.smartPairingSlots.length),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const boxes=await page.$$eval('[data-testid="per-pv-pairing"] button',nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert.ok(boxes.every(b=>b.width>=44&&b.height>=44));
  // Expose a real React bootstrap/request boundary: old period response settles late.
  await page.evaluate(()=>{window.__PAIRING_DELAYS={pv0:500};});
  await page.click('#change-period');await new Promise(r=>setTimeout(r,100));await page.click('#change-period');
  await page.waitForFunction(()=>{const expected=new Date(Date.parse(window.__PAIRING_STATE.startDate)+5*86400000).toISOString().slice(0,10);return [...document.querySelectorAll('[aria-label="Disponibilità del punto vendita"] button[aria-pressed]')].some(b=>b.textContent===expected);});
  assert.ok(await page.evaluate(()=>window.__PAIRING_REQUESTS.some(r=>r.pvId==='pv0'&&r.signal.aborted)));
  if(n>1){await page.evaluate(()=>document.querySelector('[aria-label="Punti vendita"]').lastElementChild.click());await page.click('#delete-pv');await page.waitForFunction(n=>window.__PAIRING_STATE.campaignZones.length===n-1,{},n);await page.waitForFunction(n=>Object.keys(window.__PAIRING_STATE.perPvPairingPreferences).length===n-1,{},n);}
  await page.reload();await page.waitForSelector('[data-testid="per-pv-pairing"]');assert.equal(await page.evaluate(()=>window.__PAIRING_STATE.campaignZones.length),n>1?n-1:1);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continua senza Smart Pairing →').click());await page.waitForFunction(()=>document.body.innerText.includes('LA TUA CAMPAGNA È PRONTA'));
  assert.equal(await page.evaluate(()=>window.__PAIRING_STATE.smartPairingMode),'per_pv');
  const quantity=await page.evaluate(()=>window.__PAIRING_STATE.campaignZones.reduce((s,z)=>s+z.finalFlyers,0));assert.equal(quantity,5959*(n>1?n-1:1));
  const money=(236.85*(n>1?n-1:1)).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});assert.ok((await page.evaluate(()=>document.body.innerText)).replaceAll('.','').includes(money.replaceAll('.','')));
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await server.close();}
});
