const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // 1. "4 \u2013 Periodo campagna" -> "4 \u2013 Quando vuoi distribuire?" with microcopy
  const searchPeriodo = 'className:"vp-s1-section-num",children:"4 \\u2013 Periodo campagna"}),_jsx(Step1PeriodPresets';
  const replacePeriodo = 'className:"vp-s1-section-num",children:"4 \\u2013 Quando vuoi distribuire?"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:14,marginTop:-4},children:"Scegli il periodo o indica una data preferita."}),_jsx(Step1PeriodPresets';
  content = content.replace(searchPeriodo, replacePeriodo);

  // 2. "6 \u2013 Urgenza distribuzione" -> "6 \u2013 Priorit\u00e0 operativa" with microcopy
  const searchUrgenza = 'className:"vp-s1-section-num",children:"6 \\u2013 Urgenza distribuzione"}),_jsx("div",{style:{display:"grid"';
  const replaceUrgenza = 'className:"vp-s1-section-num",children:"6 \\u2013 Priorit\\u00e0 operativa"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:14,marginTop:-4},children:"Standard oppure urgente se vuoi partire più velocemente."}),_jsx("div",{style:{display:"grid"';
  content = content.replace(searchUrgenza, replaceUrgenza);

  fs.writeFileSync('volantinipro-final.jsx', content);
  console.log('Patch 5 applied');
} catch (e) {
  console.error("Error:", e);
}
