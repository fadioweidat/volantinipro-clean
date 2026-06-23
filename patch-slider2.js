const fs = require('fs');

let vf = fs.readFileSync('volantinipro-final.jsx', 'utf8');

// 1. Replace the slider
const oldSlider = '_jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantit\\u00e0 volantini"})';

const newSlider = `_jsxs("div",{style:{position:"relative", paddingBottom:16},children:[
  _jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantit\\u00e0 volantini",style:{"--progress": \`\${(((Math.max(5000,Math.min(100000,n.qty||10000)))-5000)/(100000-5000))*100}%\`}}),
  _jsx("div",{style:{position:"absolute",left:0,right:0,top:32,display:"flex",pointerEvents:"none",padding:"0 10px"},children:
    [5000, 10000, 25000, 50000, 100000].map(val => {
      const p = ((val - 5000) / (100000 - 5000)) * 100;
      return _jsx("div",{key: val, style:{position:"absolute",left:\`calc(\${p}% + \${10 - p*0.2}px)\`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"},children:
        _jsx("div",{style:{width:1,height:6,background:"rgba(255,255,255,0.3)"}})
      });
    })
  })
]})`;

if(vf.includes(oldSlider)) {
  vf = vf.replace(oldSlider, newSlider);
  console.log('Slider replaced successfully in volantinipro-final.jsx');
} else {
  console.log('Failed to find slider string in volantinipro-final.jsx');
}

// 2. Replace the input
const oldInput = '_jsx("input",{type:"number",min:5000,max:100000,value:n.qty||"",onChange:A=>D({qty:A.target.value?parseInt(A.target.value,10):""}),onBlur:A=>D({qty:Math.max(5000,Math.min(100000,+(A.target.value||10000)))}),className:"vp-s1-input",style:{width:110,padding:"8px 12px",textAlign:"right",fontSize:14,fontWeight:700}})';

const newInput = `_jsx("input",{type:"text",inputMode:"numeric",value:n.qty ? new Intl.NumberFormat("it-IT").format(n.qty) : "",onChange:A=>{const v = A.target.value.replace(/\\D/g, "");D({qty: v ? parseInt(v, 10) : ""})},onBlur:A=>{const v = A.target.value.replace(/\\D/g, "");D({qty: Math.max(5000, Math.min(100000, v ? parseInt(v, 10) : 10000))})},className:"vp-s1-input",style:{width:110,padding:"8px 12px",textAlign:"right",fontSize:14,fontWeight:700}})`;

if(vf.includes(oldInput)) {
  vf = vf.replace(oldInput, newInput);
  console.log('Input replaced successfully in volantinipro-final.jsx');
} else {
  console.log('Failed to find input string in volantinipro-final.jsx');
}

fs.writeFileSync('volantinipro-final.jsx', vf);
