const fs = require('fs');

let c = fs.readFileSync('volantinipro-final.jsx', 'utf8');

const regex = /onLayerToggle=\{\(id\) => \{\s*if \(id === "civici" && !civiciAvailable\) return;\s*setActiveMapLayers\(prev => \(\{ \.\.\.prev, \[id\]: !prev\[id\] \}\)\);\s*\}\}/;

c = c.replace(regex, `onLayerToggle={(id) => {
                if (id === "civici" && !civiciAvailable) return;
                if (id === "settori" && !sectors) return;
                setActiveMapLayers(prev => ({ ...prev, [id]: !prev[id] }));
              }}`);

fs.writeFileSync('volantinipro-final.jsx', c);
console.log("Patched onLayerToggle in volantinipro-final.jsx using regex");
