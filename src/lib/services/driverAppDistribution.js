// Distribuzione VolantiniPro Driver (Android) + testi WhatsApp condivisi.
//
// Due messaggi INDIPENDENTI, mai accorpati:
//  - installazione app: uguale per tutti, inoltrabile, senza token, senza
//    assignment id, senza dati campagna;
//  - link lavoro: personale (contiene ?access=<token> dell'assegnazione),
//    da non inoltrare.
// Nessuno stato "app installata" viene dedotto dall'invio/apertura di un
// messaggio: wa.me apre solo una chat, non prova nulla.
import { cleanPhoneNumber } from './recipientResolver.js';

// Pagina pubblica di download. Volutamente FUORI da /driver/: l'APK
// installata intercetta ogni https://www.volantinipro.it/driver/* (App Link),
// quindi /driver/download aprirebbe l'app invece della pagina. Dominio fisso
// (non window.location.origin): il link deve essere identico per tutti, anche
// se l'Admin lavora da un ambiente di sviluppo.
export const DRIVER_APP_DOWNLOAD_URL = 'https://www.volantinipro.it/app-driver';

// APK ufficiale: asset a nome fisso dell'ultima GitHub Release (repo pubblico,
// scaricabile senza login). Stesso valore usato da public/app-driver/index.html.
export const DRIVER_APK_FILE_NAME = 'VolantiniPro-Driver.apk';
export const DRIVER_APK_FILE_URL = `https://github.com/fadioweidat/volantinipro-clean/releases/latest/download/${DRIVER_APK_FILE_NAME}`;

export const DRIVER_APP_BUTTON_LABEL = '📲 Invia app Android';
export const DRIVER_JOB_BUTTON_LABEL = '📍 Invia link lavoro';

export function buildDriverAppInstallWhatsAppMessage() {
  return `📲 VOLANTINIPRO DRIVER

Per lavorare con VolantiniPro installa l'app Android.

⬇️ Scarica VolantiniPro Driver:
${DRIVER_APP_DOWNLOAD_URL}

L'app va installata una sola volta.

Puoi inoltrare questo messaggio agli operatori che devono installare l'app.`;
}

// wa.me con il messaggio di installazione. Senza numero valido apre il
// selettore contatti di WhatsApp (wa.me/?text=), come "Invia via WhatsApp"
// nel Centro Operazioni.
export function buildDriverAppInstallWhatsAppUrl(phone = null) {
  const digits = cleanPhoneNumber(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildDriverAppInstallWhatsAppMessage())}`;
}

// Cornice unica del messaggio lavoro. `details` e' il blocco gia' composto dai
// builder esistenti (campagna, zone, quantita', data, compenso secondo le loro
// regole): qui non si aggiunge ne' si toglie alcun dato, solo intestazione,
// link personale e istruzioni.
export function buildDriverJobWhatsAppMessage({ details, link, mapLink = null }) {
  const mapSection = mapLink ? `\nApri mappa:\n${mapLink}\n` : '';
  return `📍 NUOVO LAVORO ASSEGNATO

${String(details || '').trim()}

👇 Apri il tuo lavoro VolantiniPro:
${link || 'Link non disponibile'}
${mapSection}
Apri il link e premi «Apri il lavoro».
Conferma la presa in carico dal programma.
Quando inizi la distribuzione, avvia il GPS.

⚠️ Il link del lavoro è personale e non deve essere inoltrato ad altri operatori.`;
}
