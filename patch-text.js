const fs = require('fs');

let c = fs.readFileSync('volantinipro-final.jsx', 'utf8');

const targetStr = '{isResidentialStep2 ? `Hai selezionato \n${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per \ncopertura completa. Puoi procedere con copertura parziale oppure aumentare la quantit\u00e0.` : `Hai selezionato \n${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per \ncopertura completa. Puoi procedere con copertura parziale oppure aumentare la quantit\u00e0."}';

const regex = /\{isResidentialStep2 \? `Hai selezionato[^}]+}/;
c = c.replace(regex, '{isResidentialStep2 ? `Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantità.` : `Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT")} volantini su ${requiredFlyers.toLocaleString("it-IT")} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantità.`}');

fs.writeFileSync('volantinipro-final.jsx', c);
