import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const out='qa-step2-milano-simplification';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
 for(const [label,width,height] of [['desktop',1440,900],['samsung',412,915],['iphone',390,844]]) {
  const p=await browser.newPage(); await p.setViewport({width,height});
  const errors=[];p.on('pageerror',e=>errors.push(e.stack || e.message));
  await p.evaluateOnNewDocument(()=>window.__VOLANTINIPRO_DEBUG_STEP2__=true);
  await p.goto('http://localhost:5176/configuratore?step=2&service=d2d&qty=10000',{waitUntil:'networkidle2',timeout:90000});
  async function search(q,match){
   await p.waitForSelector('#step2-search-input');
   await p.focus('#step2-search-input');await p.keyboard.down('Control');await p.keyboard.press('A');await p.keyboard.up('Control');await p.keyboard.press('Backspace'); await p.type('#step2-search-input',q,{delay:30});
   await p.waitForFunction(match=>[...document.querySelectorAll('div[style]')].some(e=>e.innerText?.includes(match)&&e.innerText.length<180),{timeout:30000},match).catch(async e=>{writeFileSync(`${out}/failure-search.txt`,await p.evaluate(()=>document.body.innerText));throw e;});
   await delay(1200);
   assert(await p.evaluate(match=>{const e=[...document.querySelectorAll('div[style]')].filter(e=>e.innerText?.includes(match)&&e.innerText.length<180).at(-1);e?.click();return !!e;},match));
  }
  async function snap(name){
   await delay(700);
   const state=await p.evaluate(()=>{
    const s=window.__VOLANTINIPRO_STEP2_STATE__;const m=window.__VOLANTINIPRO_STEP2_MAP__;const layers=[];
    m?.eachLayer(l=>{if(l.getLatLng)layers.push({pane:l.options?.pane,point:l.getLatLng(),radius:l.getRadius?.()});});
    const boundary=[];m?.eachLayer(l=>{if(l.options?.pane==='municipalityBoundaryPane'&&l.getBounds)boundary.push({visible:m.getBounds().contains(l.getBounds()),bounds:l.getBounds()});});
    return {areaMode:s?.areaMode,searchMode:s?.searchMode,selectedNils:s?.selectedNils,canonicalSelectedIds:s?.canonicalSelectedIds,containingNil:s?.containingNil,point:s?.selectedSearchPoint,coordinates:s?.coordinates,radiusKm:s?.radiusKm,requiredFlyers:s?.requiredFlyers,availableFlyers:s?.availableFlyers,finalFlyers:s?.finalFlyers,apiNilCount:s?.apiNilCount,hasConfirmedCoverageMode:s?.hasConfirmedCoverageMode,canContinueCalendar:s?.canContinueCalendar,map:window.__VOLANTINIPRO_STEP2_MAP_STATE__,center:m?.getCenter(),addressPixel:s?.selectedSearchPoint && m ? m.latLngToContainerPoint([s.selectedSearchPoint.lat,s.selectedSearchPoint.lng]) : null,mapSize:m?.getSize(),layers,boundary,overflow:document.documentElement.scrollWidth>innerWidth,summary:document.querySelector('[data-testid=milano-territory-summary]')?.innerText,advancedOpen:document.querySelector('.vp-milano-advanced')?.open};
   });
   await p.screenshot({path:`${out}/${label}-${name}.png`,fullPage:true});
   console.log(label,name);results.push({viewport:label,case:name,...state});writeFileSync(`${out}/runtime.json`,JSON.stringify(results,null,2));
   assert.equal(state.overflow,false,`${label}/${name}: overflow`);assert.deepEqual(errors,[],`${label}/${name}: browser errors`);return state;
  }
  await search('Via Antonio Oroboni, Milano','indirizzo/punto · Milano');
  await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.apiNilCount===88,{timeout:90000});await delay(3500);
  let s=await snap('initial');
  assert.equal(s.areaMode,'unconfirmed_address');assert.deepEqual(s.selectedNils,[]);assert.equal(s.containingNil?.name,'BRUZZANO');
  assert.equal(s.map.renderedZonePolygonLayers,0);assert.equal(s.map.renderedCoveragePolygonLayers,0);
  assert(s.boundary.length>0&&s.boundary.every(b=>b.visible),'full Milano boundary visible');
  assert(Math.abs(s.addressPixel.x-s.mapSize.x/2)<=1.5&&Math.abs(s.addressPixel.y-s.mapSize.y/2)<=1.5,'address centered');
  assert(s.layers.some(l=>l.point&&Math.abs(l.point.lat-s.point.lat)<0.00001&&Math.abs(l.point.lng-s.point.lng)<0.00001),'actual address marker');
  assert.equal(await p.$('#vp-milano-nil-search'),null);assert.equal(await p.$('.vp-milano-advanced'),null);
  assert.equal(await p.$$eval('.vp-milano-mode-card',els=>els.length),2);
  if(width<500){assert(await p.$eval('.vp-milano-summary',e=>getComputedStyle(e).position==='static'));assert(await p.$$eval('.vp-milano-mode-card',els=>els[1].getBoundingClientRect().top>=els[0].getBoundingClientRect().bottom));}
  const address=s.point;
  await p.click('.vp-milano-mode-card.is-nil');await p.waitForSelector('#vp-milano-nil-search');await delay(2000);
  assert.deepEqual((await snap('nil-empty')).canonicalSelectedIds,[]);
  async function addNil(name){
   await p.focus('#vp-milano-nil-search');await p.keyboard.down('Control');await p.keyboard.press('A');await p.keyboard.up('Control');await p.keyboard.press('Backspace');await p.type('#vp-milano-nil-search',name,{delay:40});
   await p.waitForSelector('[data-nil-toggle="add"]',{timeout:20000}).catch(async e=>{writeFileSync(`${out}/failure.txt`,await p.evaluate(()=>document.body.innerText));throw e;});await p.click('[data-nil-toggle="add"]');await delay(1200);
  }
  await addNil('BRUZZANO');s=await snap('nil-bruzzano');assert.equal(s.selectedNils.length,1);assert(s.requiredFlyers>0);assert.equal(s.advancedOpen,false);assert.equal(await p.$('[data-testid=milano-radius-controls]'),null);
  await addNil('COMASINA');s=await snap('nil-multiple');assert.equal(s.selectedNils.length,2);assert.equal(s.apiNilCount,88);
  await p.click('.vp-milano-advanced > summary');await snap('advanced');await p.click('.vp-milano-advanced > summary');
  await p.click('.vp-milano-mode-card.is-radius');await p.waitForSelector('[data-testid=milano-radius-controls]');
  await p.waitForSelector('.vp-milano-radius-presets button:not([disabled])',{timeout:90000});await p.click('.vp-milano-radius-presets button:not([disabled])');
  await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.radiusKm===0.5,{timeout:30000});await delay(5000);
  s=await snap('radius');assert.equal(await p.$('#vp-milano-nil-search'),null);assert.equal(s.coordinates.lat,address.lat);assert.equal(s.coordinates.lng,address.lng);
  assert(s.layers.some(l=>l.radius===500&&Math.abs(l.point.lat-address.lat)<0.00001&&Math.abs(l.point.lng-address.lng)<0.00001),'real 500 m circle centered at address');
  await p.click('.vp-milano-mode-card.is-nil');await p.waitForSelector('#vp-milano-nil-search');await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.apiNilCount===88,{timeout:90000});await delay(1500);s=await snap('return-nil');assert.deepEqual(s.canonicalSelectedIds,[]);assert.equal(s.apiNilCount,88);
  await addNil('BRUZZANO');s=await snap('return-selected');assert.equal(s.selectedNils.length,1);assert(s.requiredFlyers>0);
  await p.waitForSelector('.vp-milano-quantity-actions button');await p.click('.vp-milano-quantity-actions button');await delay(1500);s=await snap('quantity-confirmed');assert.equal(s.finalFlyers,s.requiredFlyers);assert.equal(s.canContinueCalendar,true);
  await search('Varedo','Varedo (MB)');await p.waitForFunction(()=>!document.querySelector('[data-testid=milano-mode-chooser]'),{timeout:90000});await delay(6000);s=await snap('other-comune');
  assert.equal(await p.$('[data-testid=milano-mode-chooser]'),null);assert(s.requiredFlyers>0);
  console.log(`PASS ${label}: initial, boundary, NIL multi-select, radius, reverse transition, other Comune, no overflow/errors`);
  await p.close();
 }
} finally {await browser.close();}
