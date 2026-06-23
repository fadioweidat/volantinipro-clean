const fs = require('fs');
let code = fs.readFileSync('src/components/planner/ServiceStep.jsx', 'utf8');

// 1. Format numbers
code = code.split('quantity.toLocaleString("it-IT")').join('new Intl.NumberFormat("it-IT").format(quantity)');
code = code.split('Number(service.quantity || 5000).toLocaleString("it-IT")').join('new Intl.NumberFormat("it-IT").format(Number(service.quantity || 5000))');
code = code.split('Number(service.quantity || 0).toLocaleString("it-IT")').join('new Intl.NumberFormat("it-IT").format(Number(service.quantity || 0))');

// 2. B2B Accent
code = code.split('accent: "#7C3AED"').join('accent: "#10B981"');

fs.writeFileSync('src/components/planner/ServiceStep.jsx', code);
console.log('Patched ServiceStep.jsx successfully!');
