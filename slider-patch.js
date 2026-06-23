const fs = require('fs');

// Patch volantinipro-final.jsx
let vf = fs.readFileSync('volantinipro-final.jsx', 'utf8');

// The original slider code:
// _jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantità volantini"}),

// We need to replace it with a wrapper that contains the slider and the tacche (markers).
const oldSliderVF = '_jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantit\\u00e0 volantini"})';

const newSliderVF = `_jsxs("div",{style:{position:"relative", marginBottom:30},children:[
  _jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantit\\u00e0 volantini",style:{"--progress": \`\${(((Math.max(5000,Math.min(100000,n.qty||10000)))-5000)/(100000-5000))*100}%\`}}),
  _jsx("div",{style:{position:"absolute",left:0,right:0,top:22,display:"flex",justifyContent:"space-between",pointerEvents:"none",padding:"0 10px"},children:
    [5000, 10000, 25000, 50000, 100000].map(val => {
      const p = ((val - 5000) / (100000 - 5000)) * 100;
      return _jsx("div",{style:{position:"absolute",left:\`calc(\${p}% + \${10 - p*0.2}px)\`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"},children:
        _jsx("div",{style:{width:1,height:4,background:"rgba(255,255,255,0.2)",marginBottom:4}})
      }, val);
    })
  })
]})`;

if(vf.includes(oldSliderVF)) {
  vf = vf.replace(oldSliderVF, newSliderVF);
  fs.writeFileSync('volantinipro-final.jsx', vf);
  console.log('Patched volantinipro-final.jsx successfully');
} else {
  console.log('Could not find slider string in volantinipro-final.jsx');
}

// Patch ServiceStep.jsx
let ss = fs.readFileSync('src/components/planner/ServiceStep.jsx', 'utf8');

const oldSliderSS = `                <div className="quantity-slider-wrapper">
                  <input
                    type="range"
                    min={5000}
                    max={100000}
                    step={1000}
                    value={service.quantity || 5000}
                    onChange={(event) => onServiceChange({ quantity: Number(event.target.value) })}
                    className="quantity-slider"
                    aria-label="Seleziona quantitA volantini"
                    style={{ '--progress': \`\${(((service.quantity || 5000) - 5000) / (100000 - 5000)) * 100}%\` }}
                  />
                </div>`;

const newSliderSS = `                <div className="quantity-slider-wrapper" style={{ position: "relative", marginBottom: "30px" }}>
                  <input
                    type="range"
                    min={5000}
                    max={100000}
                    step={1000}
                    value={Math.max(5000, Math.min(100000, service.quantity || 5000))}
                    onChange={(event) => onServiceChange({ quantity: Number(event.target.value) })}
                    className="vp-s1-range quantity-slider"
                    aria-label="Seleziona quantitA volantini"
                    style={{ '--progress': \`\${(((Math.max(5000, Math.min(100000, service.quantity || 5000))) - 5000) / (100000 - 5000)) * 100}%\` }}
                  />
                  <div style={{ position: "absolute", left: 0, right: 0, top: "22px", display: "flex", justifyContent: "space-between", pointerEvents: "none", padding: "0 10px" }}>
                    {[5000, 10000, 25000, 50000, 100000].map(val => {
                      const p = ((val - 5000) / (100000 - 5000)) * 100;
                      return (
                        <div key={val} style={{ position: "absolute", left: \`calc(\${p}% + \${10 - p*0.2}px)\`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 1, height: 4, background: "rgba(255,255,255,0.2)", marginBottom: 4 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>`;

if(ss.includes(oldSliderSS)) {
  ss = ss.replace(oldSliderSS, newSliderSS);
  fs.writeFileSync('src/components/planner/ServiceStep.jsx', ss);
  console.log('Patched ServiceStep.jsx successfully');
} else {
  // Try a less strict replace for ServiceStep.jsx if the exact string wasn't found
  console.log('Could not find strict slider string in ServiceStep.jsx, might need manual check');
}
