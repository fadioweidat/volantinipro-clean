const fs = require('fs');
let code = fs.readFileSync('volantinipro-final.jsx', 'utf8');

// 1. Backslash stringa
code = code.split("\\'Zona e Mappa\\'").join('«Zona e Mappa»');

// 2. Format numbers
// Since replacing (n.qty||0).toLocaleString("it-IT") didn't work before because maybe the codebase didn't have it explicitly formatted like that?
// Actually in volantinipro-final.jsx, the code is: (n.qty||0).toLocaleString("it-IT")
// Let me use a custom formatter for the slider buttons
code = code.split('A.toLocaleString("it-IT")').join('new Intl.NumberFormat("it-IT").format(A)');
code = code.split('(n.qty||0).toLocaleString("it-IT")').join('new Intl.NumberFormat("it-IT").format(n.qty||0)');
// And if there's no toLocaleString, we can find:
// {5e3,1e4,25e3,5e4,1e5].map(A=>_jsx("button",{onClick:()=>D({qty:A}),...children:A.toLocaleString("it-IT")}
// Actually they already had .toLocaleString("it-IT"). The issue was maybe "5000" didn't have a dot. new Intl.NumberFormat does.

// 3. B2B Accent
code = code.split('{ id: "b2b", icon: "", l: "Business", c: C.purple }').join('{ id: "b2b", icon: "", l: "Business", c: C.green }');
code = code.split('{ id: "b2b", icon: "", l: "Business Distribution", c: C.purple }').join('{ id: "b2b", icon: "", l: "Business Distribution", c: C.green }');

fs.writeFileSync('volantinipro-final.jsx', code);
console.log('Patched volantinipro-final.jsx successfully!');
