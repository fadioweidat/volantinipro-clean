import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error('AndroidManifest.xml non trovato. Esegui prima: npx cap add android');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];

for (const permission of permissions) {
  if (xml.includes(`android:name="${permission}"`)) continue;
  xml = xml.replace(
    /<application\b/,
    `<uses-permission android:name="${permission}" />\n    <application`,
  );
}

fs.writeFileSync(manifestPath, xml);
console.log('Permessi Android background GPS applicati:', manifestPath);
