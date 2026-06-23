const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // Find the exact string to replace
  const searchSection = '_jsxs("div",{id:"section-quantita",className:"vp-s1-card-inner",children:[_jsx("div",{className:"vp-s1-section-num",children:"3 \\u2013 Quantit\\u00e0 volantini"}),_jsx("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12},children:[5e3,1e4,25e3,5e4,1e5].map(A=>_jsx("button",{onClick:()=>D({qty:A}),className:`vp-s1-pill ${n.qty===A?"active":""}`,children:A.toLocaleString("it-IT")},A))}),_jsx("input",{type:"number",min:"1",value:n.qty||"",onChange:A=>D({qty:Math.max(0,+A.target.value||0)}),className:"vp-s1-input"})]})';

  const replaceSection = `_jsxs("div",{id:"section-quantita",className:"vp-s1-card-inner",children:[
_jsx("div",{className:"vp-s1-section-num",style:{marginBottom:6,paddingBottom:0,borderBottom:"none"},children:"3 \\u2013 Quantit\\u00e0 volantini"}),
_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:20,marginTop:-4},children:"Seleziona una quantità o trascina il cursore."}),
_jsx("div",{style:{display:"flex",gap:6,flexWrap:l?"wrap":"nowrap",marginBottom:24},children:[5e3,1e4,25e3,5e4,1e5].map(A=>_jsx("button",{onClick:()=>D({qty:A}),className:\`vp-s1-pill \${n.qty===A?"active":""}\`,style:{flex:1,minWidth:l?"30%":0,textAlign:"center"},children:A.toLocaleString("it-IT")},A))}),
_jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantità volantini"}),
_jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,flexWrap:"wrap",gap:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"},children:[
_jsxs("div",{style:{fontFamily:F.sans,fontSize:14,color:"rgba(255,255,255,.9)",fontWeight:500},children:["Quantità selezionata: ",_jsx("b",{style:{color:C.orange,fontSize:18,marginLeft:6,letterSpacing:"-0.5px"},children:(n.qty||0).toLocaleString("it-IT")})," volantini"]}),
_jsx("input",{type:"number",min:5000,max:100000,value:n.qty||"",onChange:A=>D({qty:A.target.value?parseInt(A.target.value,10):""}),onBlur:A=>D({qty:Math.max(5000,Math.min(100000,+(A.target.value||10000)))}),className:"vp-s1-input",style:{width:110,padding:"8px 12px",textAlign:"right",fontSize:14,fontWeight:700}})
]})
]}`.replace(/\n/g, '');

  if (!content.includes(searchSection)) {
    console.error("Could not find section-quantita exact string!");
    // Wait, maybe the template string `...` in the map is slightly different.
    // Let me do a regex replace instead.
    const regex = /_jsxs\("div",\{id:"section-quantita"[\s\S]*?className:"vp-s1-input"\}\)\]\}\)/;
    content = content.replace(regex, replaceSection);
  } else {
    content = content.replace(searchSection, replaceSection);
  }

  // Inject CSS
  const cssToInject = `.vp-s1-range { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); outline: none; margin: 8px 0; }
.vp-s1-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #E8571A; cursor: pointer; transition: transform 0.15s; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
.vp-s1-range::-webkit-slider-thumb:hover { transform: scale(1.15); }
.vp-s1-range:focus::-webkit-slider-thumb { outline: 2px solid rgba(232,87,26,0.5); outline-offset: 2px; }
.vp-s1-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #E8571A; cursor: pointer; transition: transform 0.15s; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
/* Nuove classi Fase 3B-1 */`;
  
  content = content.replace('/* Nuove classi Fase 3B-1 */', cssToInject);

  fs.writeFileSync('volantinipro-final.jsx', content);
  console.log('Patch 6 applied');

} catch (e) {
  console.error("Error patching:", e);
}
