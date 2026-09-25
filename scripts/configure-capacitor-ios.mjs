import fs from 'node:fs';
import path from 'node:path';

const plistPath = path.resolve('ios/App/App/Info.plist');

if (!fs.existsSync(plistPath)) {
  console.error('Info.plist non trovato. Esegui prima: npx cap add ios');
  process.exit(1);
}

let plist = fs.readFileSync(plistPath, 'utf8');

function insertBeforeDictClose(fragment) {
  const close = plist.lastIndexOf('</dict>');
  if (close < 0) throw new Error('Info.plist non valido: </dict> mancante');
  plist = plist.slice(0, close) + fragment + '\n' + plist.slice(close);
}

if (!plist.includes('<key>NSLocationWhenInUseUsageDescription</key>')) {
  insertBeforeDictClose(
    '  <key>NSLocationWhenInUseUsageDescription</key>\n' +
    '  <string>VolantiniPro usa la posizione per registrare il percorso durante il lavoro.</string>'
  );
}

if (!plist.includes('<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>')) {
  insertBeforeDictClose(
    '  <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n' +
    '  <string>VolantiniPro usa la posizione anche in background durante una sessione di lavoro attiva.</string>'
  );
}

if (!plist.includes('<key>UIBackgroundModes</key>')) {
  insertBeforeDictClose(
    '  <key>UIBackgroundModes</key>\n' +
    '  <array>\n' +
    '    <string>location</string>\n' +
    '  </array>'
  );
} else if (!/<key>UIBackgroundModes<\/key>[\s\S]*?<array>[\s\S]*?<string>location<\/string>[\s\S]*?<\/array>/.test(plist)) {
  plist = plist.replace(
    /(<key>UIBackgroundModes<\/key>\s*<array>)/,
    '$1\n    <string>location</string>'
  );
}

fs.writeFileSync(plistPath, plist);
console.log('Configurazione iOS background location applicata:', plistPath);
