import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
const results=[];
try {
for(const [name,width,height] of [['desktop',1440,900],['samsung',412,915],['iphone',390,844]]) {
 const context=await browser.createBrowserContext(); const page=await context.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width,height,isMobile:width<500,hasTouch:width<500});
 await page.goto('http://localhost:5175/configuratore',{waitUntil:'networkidle2',timeout:60000});
 await page.waitForSelector('.vp-s1-service-card');
 const click=async(selector,text)=>{await page.$$eval(selector,(els,t)=>{const el=els.find(e=>e.textContent.includes(t));if(!el)throw Error('Missing '+t);el.click();},text);};
 await click('.vp-s1-service-card','Door to Door');
 await click('#section-settore button','Ristorazione');
 await click('#section-quantita button','25.000');
 await click('#section-periodo button','Prima possibile');
 await click('#section-formato button','DL');
 await click('#section-urgenza button','Urgente');
 await click('#section-piano button','Trimestrale');
 await page.waitForFunction(()=>document.querySelector('.vp-s1-choices').textContent.includes('25.000'));
 const summary=await page.$eval('.vp-s1-summary',el=>el.textContent);
 assert.match(summary,/25.000/); assert.match(summary,/DL/); assert.match(summary,/Trimestrale/);
 // Printing transition and material format synchronization use real controls.
 await click('#section-formato button','Aggiungi stampa al preventivo');
 await page.waitForFunction(()=>document.querySelector('.vp-s1-summary').textContent.includes('Costo stampa'));
 await click('#section-formato button','No, solo distribuzione');
 await click('#section-formato button','A5');
 // Restore reference-like selected state before visual capture.
 await click('#section-quantita button','10.000');
 await click('#section-urgenza button','Standard');
 await click('#section-piano button','Singola');
 await page.evaluate(()=>scrollTo(0,0));
 await new Promise(r=>setTimeout(r,500));
 const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,sections:document.querySelectorAll('.vp-s1-section-number').length,inputSizes:[...document.querySelectorAll('.vp-s1-root input:not([type=range]),.vp-s1-root select')].filter(e=>e.getBoundingClientRect().width).map(e=>parseFloat(getComputedStyle(e).fontSize)),services:[...document.querySelectorAll('.vp-s1-service-card')].map(e=>({width:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x}))}));
 assert.ok(metrics.scrollWidth<=width,JSON.stringify(metrics)); assert.equal(metrics.sections,7);
 if(width<500) assert.ok(metrics.inputSizes.every(s=>s>=16));
 await page.screenshot({path:`qa-step1-redesign/final-${name}.png`,fullPage:true});
 await page.screenshot({path:`qa-step1-redesign/final-${name}-top.png`});
 const cta=await page.$('.vp-s1-finish button'); assert.equal(await cta.evaluate(e=>e.disabled),false);
 const storedBefore=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>/draft|configurator/i.test(k))));
 await cta.click();
 await page.waitForFunction(()=>!document.querySelector('.vp-s1-root'),{timeout:60000});
 const afterText=await page.evaluate(()=>document.body.innerText);
 assert.match(afterText,/Zona|zona|Mappa|mappa/);
 const storedAfter=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>/draft|configurator/i.test(k))));
 await page.screenshot({path:`qa-step1-redesign/step2-${name}.png`});
 results.push({name,metrics,errors,step2Reached:true,storedBefore,storedAfter});
 console.log(name,'PASS',JSON.stringify(metrics));
 await context.close();
}
writeFileSync('qa-step1-redesign/runtime.json',JSON.stringify(results,null,2));
} finally {await browser.close();}
