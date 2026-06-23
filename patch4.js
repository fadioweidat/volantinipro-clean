const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // Using string replace instead of regex to avoid escaping issues
  const search1 = '\\u00a0Non trovi la data desiderata? Puoi sempre inviare una richiesta. Smart Pairing \\u00e8 una opportunit\\u00e0 opzionale di risparmio e non limita le date disponibili.\\u00a0';
  const replace1 = '\\u00a0non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o vicino.\\u00a0';
  
  content = content.replace(search1, replace1);

  const search2 = '"Non trovi la data desiderata? Puoi sempre inviare una richiesta. Smart Pairing \\u00e8 una opportunit\\u00e0 opzionale di risparmio e non limita le date disponibili."';
  const replace2 = '"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o vicino."';
  
  content = content.replace(search2, replace2);

  fs.writeFileSync('volantinipro-final.jsx', content);
  console.log('Patch 4 applied');
} catch (e) {
  console.error("Error:", e);
}
