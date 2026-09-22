import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const out='qa-step2-map-restoration', results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
try {
for(const [label,width,height] of [['desktop',1440,900],['samsung',412,915],['iphone',390,844]]) {
 const ctx=await browser.createBrowserContext(), p=await ctx.newPage();await p.setViewport({width,height});
 const errors=[];p.on('pageerror',e=>errors.push(e.stack || e.message));
 await p.evaluateOnNewDocument(()=>window.__VOLANTINIPRO_DEBUG_STEP2__=true);
 await p.goto('http://localhost:5176/configuratore?step=2&service=d2d&qty=10000',{waitUntil:'networkidle2',timeout:90000});
 async function state(){return p.evaluate(()=>{
  const s=window.__VOLANTINIPRO_STEP2_STATE__,m=window.__VOLANTINIPRO_STEP2_MAP__,polygons=[],points=[];let boundaries=0;
  m?.eachLayer(l=>{if(l.options?.vpZoneId!==undefined)polygons.push({id:l.options.vpZoneId,name:l.options.vpZoneName,type:l.options.vpZoneType,color:l.options.color,fill:l.options.fillOpacity,weight:l.options.weight});if(l.getLatLng)points.push({point:l.getLatLng(),radius:l.getRadius?.()});if(l.options?.pane==='municipalityBoundaryPane'&&l.getBounds)boundaries++;});
  return {areaMode:s?.areaMode,ids:s?.canonicalSelectedIds,containingNil:s?.containingNil,point:s?.selectedSearchPoint,radiusKm:s?.radiusKm,requiredFlyers:s?.requiredFlyers,finalFlyers:s?.finalFlyers,canContinue:s?.canContinueCalendar,apiNilCount:s?.apiNilCount,municipalities:s?.radiusMunicipalityRows,intersectedNils:s?.intersectedNils?.map(n=>({id:n.code,name:n.name})),polygons,points,boundaries,map:window.__VOLANTINIPRO_STEP2_MAP_STATE__,summary:document.querySelector('[data-testid=milano-territory-summary]')?.innerText,overflow:document.documentElement.scrollWidth>innerWidth};
 });}
 async function snap(name){await delay(900);const s=await state();results.push({viewport:label,case:name,...s});writeFileSync(`${out}/runtime.json`,JSON.stringify(results,null,2));await p.screenshot({path:`${out}/${label}-${name}.png`,fullPage:true});assert(!s.overflow,`${label}/${name} overflow`);assert.deepEqual(errors,[]);console.log(label,name,JSON.stringify({ids:s.ids,polygons:s.polygons.length,radius:s.radiusKm,municipalities:s.municipalities?.length}));return s;}
 async function toggle(sel){await p.$eval(sel,e=>e.scrollIntoView({block:'center'}));await p.click(sel);await delay(700);}
 async function clickNil(name){
  await p.$eval('.leaflet-container',e=>e.scrollIntoView({block:'center'}));
  await p.evaluate(name=>{const m=window.__VOLANTINIPRO_STEP2_MAP__;let target;m.eachLayer(l=>{if(l.options?.vpZoneName===name&&l.getBounds)target=l;});if(!target)throw Error(`No rendered polygon ${name}`);m.fitBounds(target.getBounds(),{padding:[60,60],maxZoom:14,animate:false});},name);await delay(900);
  const point=await p.evaluate(name=>{const m=window.__VOLANTINIPRO_STEP2_MAP__;let t;m.eachLayer(l=>{if(l.options?.vpZoneName===name&&l.getBounds)t=l;});const r=m.getContainer().getBoundingClientRect(),size=m.getSize();for(let y=70;y<size.y-65;y+=7)for(let x=65;x<size.x-65;x+=7){const ll=m.containerPointToLatLng([x,y]);if(t._containsPoint(m.latLngToLayerPoint(ll)))return {x:r.left+x,y:r.top+y};}throw Error(`No interior point ${name}`);},name);
  await p.mouse.move(point.x,point.y);await delay(300);await p.mouse.click(point.x,point.y);await delay(1000);
 }
 async function searchNil(name){await p.focus('#vp-milano-nil-search');await p.keyboard.down('Control');await p.keyboard.press('A');await p.keyboard.up('Control');await p.keyboard.press('Backspace');await p.type('#vp-milano-nil-search',name,{delay:30});await delay(350);}
 try {
 await p.waitForSelector('#step2-search-input',{timeout:60000});await p.type('#step2-search-input','Via Antonio Oroboni, Milano',{delay:30});
 await p.waitForFunction(()=>[...document.querySelectorAll('div[style]')].some(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180),{timeout:45000});
 await p.evaluate(()=>[...document.querySelectorAll('div[style]')].find(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180).click());
 await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.apiNilCount===88,{timeout:90000});await delay(2500);
 let s=await snap('initial');assert.deepEqual(s.ids,[]);assert.equal(s.containingNil?.name,'BRUZZANO');assert(s.boundaries>0);assert(s.polygons.filter(l=>l.type==='nil').length>=88);assert(s.polygons.find(l=>l.name==='BRUZZANO')?.fill<0.2);const address=s.point;
 assert(s.points.some(l=>Math.abs(l.point.lat-address.lat)<1e-5&&Math.abs(l.point.lng-address.lng)<1e-5),'address marker');
 await toggle('[data-testid=map-toggle-nil]');s=await state();assert.equal(s.polygons.filter(l=>l.type==='nil').length,0);assert.deepEqual(s.ids,[]);assert(s.boundaries>0);await toggle('[data-testid=map-toggle-nil]');
 await toggle('.vp-milano-mode-card.is-nil');await p.waitForSelector('#vp-milano-nil-search');await delay(1000);
 await clickNil('BRUZZANO');s=await snap('nil-add');assert.equal(s.ids.length,1);assert(s.polygons.find(l=>l.name==='BRUZZANO')?.fill>=.3);assert(s.requiredFlyers>0);await searchNil('BRUZZANO');assert(await p.$('[data-nil-toggle="remove"]'),'map selection reflected in search');
 await clickNil('BRUZZANO');s=await snap('nil-remove');assert.deepEqual(s.ids,[]);assert(s.polygons.find(l=>l.name==='BRUZZANO')?.fill<.2);assert.equal(s.canContinue,false);
 await clickNil('BRUZZANO');await clickNil('COMASINA');s=await snap('nil-multi');assert.equal(s.ids.length,2);assert(s.requiredFlyers>0);const ids=s.ids;
 await toggle('[data-testid=map-toggle-nil]');assert.deepEqual((await state()).ids,ids);await toggle('[data-testid=map-toggle-nil]');
 await searchNil('COMASINA');await toggle('[data-nil-toggle="remove"]');s=await state();assert.equal(s.ids.length,1);await toggle('[data-nil-toggle="add"]');s=await state();assert.equal(s.ids.length,2);assert(s.polygons.find(l=>l.name==='COMASINA')?.fill>=.3);
 await toggle('.vp-milano-mode-card.is-radius');
 for(const [i,km] of [.5,1,2,3].entries()){
  await p.waitForSelector('.vp-milano-radius-presets button:not([disabled])',{timeout:90000});await p.$$eval('.vp-milano-radius-presets button',(es,i)=>es[i].click(),i);
  await p.waitForFunction(km=>window.__VOLANTINIPRO_STEP2_STATE__?.radiusKm===km,{timeout:30000},km);await p.waitForSelector('.vp-milano-radius-presets button:not([disabled])',{timeout:90000});await delay(2000);
  s=await snap(`radius-${km}`);assert(s.points.some(l=>l.radius===km*1000&&Math.abs(l.point.lat-address.lat)<1e-5&&Math.abs(l.point.lng-address.lng)<1e-5),'real circle');assert(s.polygons.some(l=>l.type==='nil'),'rendered NIL');assert(s.boundaries>0);
 }
 assert(s.polygons.some(l=>l.type==='municipality'),'external municipal boundaries');assert(s.municipalities.length>1);assert(Math.abs(s.municipalities.reduce((a,r)=>a+r.contribution,0)-100)<=s.municipalities.length*.5);assert(s.summary.includes('Quota delle famiglie stimate nel raggio'));for(const row of s.municipalities)assert(s.summary.includes(row.name));
 const radiusIds=s.ids;await toggle('[data-testid=map-toggle-comuni]');s=await state();assert(!s.polygons.some(l=>l.type==='municipality'));assert(s.polygons.some(l=>l.type==='nil'));assert.deepEqual(s.ids,radiusIds);await toggle('[data-testid=map-toggle-comuni]');await toggle('[data-testid=map-toggle-nil]');s=await state();assert(!s.polygons.some(l=>l.type==='nil'));assert(s.polygons.some(l=>l.type==='municipality'));assert.deepEqual(s.ids,radiusIds);await toggle('[data-testid=map-toggle-nil]');
 await toggle('.vp-milano-mode-card.is-nil');await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.apiNilCount===88,{timeout:90000});await delay(2000);s=await state();assert.deepEqual(s.ids,[]);await clickNil('BRUZZANO');s=await snap('return-nil');assert.equal(s.ids.length,1);assert(s.requiredFlyers>0);
 if(width<500)assert(await p.$eval('.vp-milano-summary',e=>getComputedStyle(e).position==='static'));
 console.log(`PASS ${label}: A B C D E F G with actual canvas mouse clicks`);
 } catch(e){await p.screenshot({path:`${out}/${label}-failure.png`,fullPage:true});writeFileSync(`${out}/${label}-failure.json`,JSON.stringify(await state(),null,2));writeFileSync(`${out}/${label}-failure.txt`,await p.evaluate(()=>document.body.innerText));throw e;}
 await ctx.close();
}
}finally{await browser.close();}
