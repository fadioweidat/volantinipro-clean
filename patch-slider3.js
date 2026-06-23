const fs = require('fs');

let vf = fs.readFileSync('volantinipro-final.jsx', 'utf8');

// Notice the character \u00e0 is rendered as  in console sometimes, but in the file it is literally:
// "aria-label":"Seleziona quantit\u00e0 volantini" or "aria-label":"Seleziona quantità volantini" depending on the encoding.
// Let's use a regex replace to match either.
const sliderRegex = /_jsx\("input",\{type:"range",min:5000,max:100000,step:1000,value:Math\.max\(5000,Math\.min\(100000,n\.qty\|\|10000\)\),onChange:A=>D\(\{qty:\+A\.target\.value\}\),className:"vp-s1-range","aria-label":"Seleziona quantit[\\u00e0à] volantini"\}\)/g;

const newSlider = `_jsxs("div",{style:{position:"relative", paddingBottom:24},children:[
  _jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantità volantini",style:{"--progress": \`\${(((Math.max(5000,Math.min(100000,n.qty||10000)))-5000)/(100000-5000))*100}%\`}}),
  _jsx("div",{style:{position:"absolute",left:0,right:0,top:28,display:"flex",pointerEvents:"none",padding:"0 10px"},children:
    [5000, 10000, 25000, 50000, 100000].map(val => {
      const p = ((val - 5000) / (100000 - 5000)) * 100;
      return _jsx("div",{key: val, style:{position:"absolute",left:\`calc(\${p}% + \${10 - p*0.2}px)\`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"},children:
        _jsx("div",{style:{width:1,height:6,background:"rgba(255,255,255,0.3)"}})
      });
    })
  })
]})`;

if(vf.match(sliderRegex)) {
  vf = vf.replace(sliderRegex, newSlider);
  console.log('Slider replaced successfully in volantinipro-final.jsx');
} else {
  console.log('Failed to find slider string in volantinipro-final.jsx');
}

fs.writeFileSync('volantinipro-final.jsx', vf);
