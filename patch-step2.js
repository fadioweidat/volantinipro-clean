const fs = require('fs');

// Patch Step2Map.jsx
let step2Map = fs.readFileSync('src/components/Step2Map.jsx', 'utf8');

const oldZonesListCode = `    const activeZone = (campaignZones || []).find(z => z.id === activeZoneId);
    const zonesList = activeZone ? [activeZone] : [{ id: 'active_zone', city, radiusKm: radius }];
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId || z.id === 'active_zone';
      const zCity = city || z.city || null;`;

const newZonesListCode = `    const activeZone = (campaignZones || []).find(z => z.id === activeZoneId);
    const zonesList = activeZone ? [activeZone] : [{ id: 'active_zone', city, radiusKm: radius }];
    (campaignZones || []).forEach(z => {
      if (!zonesList.find(x => x.id === z.id)) {
        zonesList.push(z);
      }
    });
    
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId || z.id === 'active_zone';
      const zCity = isActive ? city : (z.city || null);`;

if (step2Map.includes(oldZonesListCode)) {
  step2Map = step2Map.replace(oldZonesListCode, newZonesListCode);
} else {
  // alternative match if "const isActive = z.id === activeZoneId;"
  const altOld = `    const activeZone = (campaignZones || []).find(z => z.id === activeZoneId);
    const zonesList = activeZone ? [activeZone] : [{ id: 'active_zone', city, radiusKm: radius }];
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId;
      const zCity = city || z.city || null;`;

  const altNew = `    const activeZone = (campaignZones || []).find(z => z.id === activeZoneId);
    const zonesList = activeZone ? [activeZone] : [{ id: 'active_zone', city, radiusKm: radius }];
    (campaignZones || []).forEach(z => {
      if (!zonesList.find(x => x.id === z.id)) {
        zonesList.push(z);
      }
    });
    
    zonesList.forEach(z => {
      const isActive = z.id === activeZoneId || z.id === 'active_zone';
      const zCity = isActive ? city : (z.city || null);`;
  
  if (step2Map.includes(altOld)) {
    step2Map = step2Map.replace(altOld, altNew);
  } else {
    console.log("Could not find zonesList code to patch in Step2Map.jsx");
  }
}

// Fix addTo map issue
step2Map = step2Map.replace(/addTo\(isActive \? map : group\)/g, "addTo(group)");

fs.writeFileSync('src/components/Step2Map.jsx', step2Map);
console.log("Patched Step2Map.jsx");

// Patch volantinipro-final.jsx
let vpf = fs.readFileSync('volantinipro-final.jsx', 'utf8');

const oldText1 = 'Distribuzione selettiva: \\n${flyerQuantityFromStep1.toLocaleString("it-IT")} pz su ${requiredFlyers.toLocaleString("it-IT")} di copertura totale. \\nPuoi procedere con la selezione attuale.';
const newText1 = 'Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantit\\u00e0.';

// We need regex to handle exact matching with backticks in the JSX file.
const textRegex = /Distribuzione selettiva:[^`]+Puoi procedere con la selezione attuale\./g;
vpf = vpf.replace(textRegex, 'Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantità.');

fs.writeFileSync('volantinipro-final.jsx', vpf);
console.log("Patched volantinipro-final.jsx");
