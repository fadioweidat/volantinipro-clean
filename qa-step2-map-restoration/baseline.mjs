import puppeteer from 'puppeteer-core';
import {writeFileSync} from 'node:fs';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
try {
const p=await b.newPage();await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>window.__VOLANTINIPRO_DEBUG_STEP2__=true);
await p.goto('http://localhost:5176/configuratore?step=2&service=d2d&qty=10000',{waitUntil:'networkidle2',timeout:60000});
await p.waitForSelector('#step2-search-input',{timeout:60000});await p.type('#step2-search-input','Via Antonio Oroboni, Milano',{delay:30});
await p.waitForFunction(()=>[...document.querySelectorAll('div[style]')].some(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180));
await p.evaluate(()=>[...document.querySelectorAll('div[style]')].find(e=>/Oroboni/.test(e.innerText)&&/indirizzo\/punto/.test(e.innerText)&&e.innerText.length<180).click());
await p.waitForFunction(()=>window.__VOLANTINIPRO_STEP2_STATE__?.apiNilCount===88,{timeout:90000});
const snaps=[];async function snap(mode){await new Promise(r=>setTimeout(r,2500));const s=await p.evaluate(()=>({map:window.__VOLANTINIPRO_STEP2_MAP_STATE__,selected:window.__VOLANTINIPRO_STEP2_STATE__.canonicalSelectedIds,mode:window.__VOLANTINIPRO_STEP2_STATE__.areaMode,intersectedNils:window.__VOLANTINIPRO_STEP2_STATE__.intersectedNils,polygons:window.__VOLANTINIPRO_STEP2_STATE__.step2MapZonesCount}));snaps.push({mode,...s});await p.screenshot({path:`qa-step2-map-restoration/baseline-${mode}.png`,fullPage:true});writeFileSync('qa-step2-map-restoration/baseline.json',JSON.stringify(snaps,null,2));console.log(mode,s.map);}
await snap('initial');await p.click('.vp-milano-mode-card.is-nil');await snap('nil');await p.click('.vp-milano-mode-card.is-radius');await p.waitForSelector('.vp-milano-radius-presets button:not([disabled])',{timeout:90000});await p.$$eval('.vp-milano-radius-presets button',es=>es[3].click());await new Promise(r=>setTimeout(r,7000));await snap('radius');
}finally{await b.close();}
