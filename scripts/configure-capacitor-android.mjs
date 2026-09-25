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


const driverDeepLinkFilter = `
            <!-- VolantiniPro Driver deep links: WhatsApp/browser -> APK -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="www.volantinipro.it" android:pathPrefix="/driver/" />
                <data android:scheme="https" android:host="volantinipro.it" android:pathPrefix="/driver/" />
            </intent-filter>`;

if (!xml.includes('android:host="www.volantinipro.it"')) {
  const activityClose = xml.indexOf('</activity>');
  if (activityClose === -1) {
    console.error('Activity Android non trovata: impossibile configurare i deep link Driver.');
    process.exit(1);
  }
  xml = xml.slice(0, activityClose) + driverDeepLinkFilter + '\n        ' + xml.slice(activityClose);
}

fs.writeFileSync(manifestPath, xml);
console.log('Permessi Android background GPS + deep link Driver applicati:', manifestPath);
