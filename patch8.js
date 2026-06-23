const fs = require('fs');

try {
  let code = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // 1. Replace 'Residential relevance'
  code = code.replace(/"Residential relevance"/g, '"Rilevanza residenziale"');
  code = code.replace(/label:"Residential relevance"/g, 'label:"Rilevanza residenziale"');

  // 2. Hide 'Lettura zona' when loading or no zones
  const searchStr = '{city && isResidentialStep2 && selZones.length > 0 && (';
  if (code.includes(searchStr)) {
    code = code.replace(searchStr, '{city && isResidentialStep2 && selZones.length > 0 && !apiLoading && zonesInRadius.length > 0 && (');
    console.log('Patched Lettura zona visibility.');
  }

  // 3. Fix the chip overflow.
  code = code.replace(
    'marginBottom: 2 }}>{row.l}</div>',
    'marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.l}</div>'
  );
  
  // Let's also find the map component to make sure it doesn't render old zones if apiLoading is true
  // In `volantinipro-final.jsx`, the map likely receives `apiLoading`.
  // Actually, setting `apiData` to `null` on fetch start in `useServiceAnalysis.js` ALREADY guarantees `zonesInRadius` is empty,
  // which naturally clears the map layers. So we don't need to patch the map visibility explicitly.

  fs.writeFileSync('volantinipro-final.jsx', code);
  console.log('Patch 8 applied successfully.');
} catch (e) {
  console.error(e);
}
