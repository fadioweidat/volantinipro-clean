# Piano B GPS con Traccar Client

Branch: `feature/traccar-backup`. Nessun merge e nessuna attivazione automatica.
Una sola migration additiva, NON applicata. Esiste un solo Supabase: produzione.
Solo la sessione database applica migration ed Edge Functions da
`integration/rc2-full-site`, dopo il merge. Questa sessione non le applica.
La revisione aggiunge un pannello alla home Admin tramite una sola integrazione
in `AdminDashboard.jsx`; GPS nativo, RPC esistenti, token Driver e monitor non
vengono riscritti. L’avvio manuale Admin è esplicitamente autorizzato per il Piano B.

## Cosa è stato verificato prima dell'implementazione

Schema Supabase di produzione letto il 24 ottobre 2026, senza leggere nomi,
telefoni, token personali o coordinate degli operatori:

- `public.gps_tracking_points`: `campaign_id`, `session_id`, `driver_id`, `lat`,
  `lng`, `accuracy`, `speed`, `heading`, `recorded_at`. `speed` è m/s: il monitor
  esistente moltiplica per 3,6 per mostrare km/h.
- `public.delivery_sessions`: collega il punto al lavoro tramite `assignment_id`,
  oltre a `campaign_id`, `group_id`, `driver_id` e `device_id`.
- `public.operator_assignments`: operatore e finestra di validità dell'incarico.
  Nei partecipanti senza account `operator_id` è NULL e l'identità GPS è
  `coalesce(operator_id, assignment.id)`. NON bisogna assumere che `driver_id`
  sia sempre un utente autenticato.
- La funzione esistente `gps_assignment_is_valid_v2` controlla anche operatore
  abilitato, incarico attivo/non revocato, gruppo coerente e campagna
  `in_progress`. Viene riutilizzata senza modificarla.
- Il trigger PostGIS `gps_tracking_points_set_geom` esiste già e non viene
  sostituito. I nuovi inserimenti passano nello stesso trigger.
- Monitor e cliente leggono questa tabella; non sono stati aggiunti percorsi
  di lettura alternativi. La conferma visiva sui dispositivi resta nel pilot.

La skill `volantinipro-backend` non era presente nei percorsi di skill del
repository. Sono state seguite le istruzioni di `AGENTS.md`, runtime acceptance
e le convenzioni Supabase/serverless presenti nel progetto.

## Fonti ufficiali e formati

Verificate il 24 ottobre 2026:

- https://www.traccar.org/osmand/
- https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/protocol/OsmAndProtocolDecoder.java
- https://www.traccar.org/client/
- https://www.traccar.org/client-configuration/
- https://github.com/traccar/traccar-client

Non si assume che tutti i telefoni/versioni inviino lo stesso formato:

| Formato | Trasporto | Tempo | Velocità | Batteria |
| --- | --- | --- | --- | --- |
| OsmAnd | GET con query, POST con query o form URL-encoded | Unix secondi o millisecondi; ISO con fuso | nodi per questa integrazione | `batt` 0–100 |
| JSON Traccar | POST `application/json` | `location.timestamp`, ISO con fuso o Unix | `location.coords.speed` in m/s | `location.battery.level` 0–1 |

Il JSON usa `device_id`, `location.coords.latitude/longitude/accuracy/speed/heading/altitude`
e `location.battery.level/is_charging`. Il parametro JSON `_` e gli `extras`
non vengono interpretati: nessun override di operatore, sessione o campagna.
Nodi → m/s: `speed * 1852 / 3600`. Coordinate e tempo del fix non vengono
spostati, ricostruiti o sostituiti con l'ora di ricezione.
Valori JSON `-1` per velocità/direzione/accuratezza/batteria diventano NULL
(dato non disponibile), senza inventare uno zero.

Non sono supportati TCP/NMEA, inoltro da Traccar Server, batch JSON, localizzazione
da sole celle/Wi-Fi o il parametro alternativo `location=lat,lon`: non fanno parte
dei due payload richiesti. Per OsmAnd usare `id`/`deviceid`, `lat`, `lon`.

## Come funziona la sicurezza

1. URL HTTPS e Device ID associato a una chiave casuale di 256 bit. L'ID
   leggibile `RAGAZZO01` non è una password. Nel DB resta solo SHA-256 della chiave.
2. Tabella nuova `traccar_devices`, RLS attiva e nessun accesso anon/customer.
   La RPC di ingestione è `SECURITY INVOKER`, eseguibile solo da `service_role`.
   Il controllo Admin usa una RPC invoker pubblica e una funzione privilegiata
   nello schema non esposto `traccar_private`: entrambe sono negate ad anon e
   service-role; ogni azione richiede UID autenticato e il controllo esistente
   `gps_is_admin()` (ruolo admin e allowlist email).
3. Il dispositivo è associato a un operatore registrato OPPURE a un'assegnazione
   precisa. In modalità app si mantiene `vp_device_id` della sessione esistente;
   in modalità Admin il binding contiene anche `admin_session_id`, per evitare
   di attribuire punti a un’altra sessione o campagna dello stesso operatore.
4. Nessun avvio/resume causato da un punto GPS. Occorre una sessione `started`,
   non chiusa, appartenente a un incarico valido. Può essere avviata dalla
   normale app oppure **esplicitamente dall’Admin senza app Driver**.
5. Finestra esplicita `enabled_from`/`enabled_until`, massimo 24 ore. Il pilot
   usa 2 ore. Scaduta la finestra occorre riabilitare il dispositivo per il turno
   successivo, anche se qualcuno ha dimenticato una sessione aperta.
6. Sono ignorati punti prima dell'avvio/ultima modifica della sessione, durante
   una pausa, dopo lo stop o fuori dalla finestra. Si verifica la validità sia
   all'ora del fix sia alla ricezione. Usare `updated_at` come limite conservativo
   impedisce di importare, dopo una ripresa, fix registrati durante la pausa.
7. Rifiutati fix vecchi oltre 5 minuti o futuri oltre 30 secondi. Il buffering
   non è un'autorizzazione a conservare posizioni fuori turno. Può perdere fix
   legittimi durante disconnessioni lunghe: scelta conservativa per la privacy.
8. Più sessioni compatibili = nessun inserimento, non “scegli l'ultima”.
9. Transazione con lock e rivalidazione dopo l'attesa; massimo 120 invii/minuto
   per dispositivo autenticato. Il segreto rimane necessario anche per GET.
10. Deduplicazione persistente: indice univoco parziale sul digest di Device ID,
    timestamp e coordinate. I retry identici non duplicano il punto. Non si
    fondono punti vicini di due sorgenti diverse o fix con timestamp differenti.

I punti nuovi hanno `source='traccar'`; `source_metadata` conserva solo
altitudine, batteria percentuale e stato carica. I vecchi punti mantengono i
nuovi campi NULL: nessuna riscrittura o riclassificazione dello storico.
Non sono una certificazione anti-frode: come qualsiasi GPS dal telefono, i fix
non dimostrano da soli la consegna di volantini.

## Preparazione tecnica PRIMA della prova sul telefono

**Non esiste un database di staging. Una preview Vercel non isola il database.**
Non applicare SQL né distribuire Edge Functions da questo branch o da questa
sessione. I test SQL descritti sotto usano soltanto PostgreSQL/WASM locale.

1. La PR deve avere base `integration/rc2-full-site`. Prima di ogni pubblicazione:
   fetch del branch remoto e di integration, verifica dei commit, rebase su
   integration; in caso di conflitti fermarsi, senza risoluzioni automatiche.
   Non forzare integration e non modificare il lavoro delle sessioni database/SEO.
2. Dopo il merge, **solo la sessione database**, lavorando da integration,
   revisiona e applica la migration
   `supabase/migrations/20261024102649_traccar_backup_ingest.sql`.
   Non eseguire tutte le migration storiche. L’ordine e la compatibilità con
   altre modifiche DB devono essere verificati da quella sessione.
3. Fino a quel passaggio mantenere il backup disabilitato. L’attivazione
   successiva richiede variabili server `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `TRACCAR_BACKUP_ENABLED=true`.
   `VITE_SUPABASE_URL` è solo fallback URL; la service-role non va nel client.
   Qualsiasi collaudo remoto dopo l’attivazione scrive nel database di produzione:
   concordarlo prima con la sessione database e usare una campagna dedicata.
   I passaggi seguenti sono istruzioni per quel momento, non azioni da fare ora.
4. Accedere alla home Admin della preview con un account admin autorizzato.
   Aprire **Piano B GPS · Traccar**. Preparare una campagna di prova
   `in_progress` e un operatore già assegnato con incarico attivo: non occorre
   avviare l’app Driver e non usare una campagna reale cliente per collaudi.
5. Selezionare campagna e operatore, inserire Device ID (es. `RAGAZZO01`) e
   durata massima (default 2 ore, massimo 24). Premere **Avvia Piano B GPS**.
   Il pannello crea la sessione nelle normali `delivery_sessions`, associa
   precisamente il dispositivo, genera una chiave casuale e salva solo l’hash.
   La scadenza non supera quella dell’incarico. Il retry dello stesso avvio
   dopo un errore di rete non duplica la sessione e non prolunga il turno.
6. Nel pannello è visibile l’ultimo punto Traccar ricevuto. **Aggiorna Piano B**
   rilegge i dati. **Chiudi sessione GPS → Conferma chiusura** usa la RPC di
   chiusura già esistente, disabilita quel binding e blocca i punti successivi.
   Non chiude sessioni native tramite questo pannello. L’audit registra l’admin.
7. La chiave resta solo nella memoria della pagina. Dopo un ricaricamento usare
   **Rigenera URL**: revoca la precedente chiave senza cambiare sessione o
   prolungare la scadenza. Il pannello non carica né memorizza il bypass Vercel.

## Preview protetta: Protection Bypass for Automation

Non disattivare Deployment Protection e non usare un link di condivisione del browser.

1. In Vercel aprire il progetto VolantiniPro → **Settings → Deployment
   Protection → Protection Bypass for Automation**.
2. Creare un segreto dedicato al proprio collaudo (es. `traccar-pilot`).
   Copiarlo privatamente. Se l’interfaccia usa nomi diversi, consultare la
   documentazione ufficiale collegata sotto. Non usare un segreto di produzione.
3. Nel pannello Admin della preview incollarlo nel campo **Bypass Vercel per
   il tuo collaudo**. Dopo aver avviato la sessione premere **Copia URL Server**.
   Il pannello compone l’URL completo, codificando anche caratteri `+`, `/`, `=`.
   Incollare direttamente il risultato in Traccar Client.
4. Il parametro per un client senza header personalizzati è
   **`x-vercel-protection-bypass`**. Non aggiungere
   `x-vercel-set-bypass-cookie`: serve a flussi browser con redirect/cookie,
   non al ricevitore GPS.
5. Il segreto consente accesso ai deployment protetti **dell’intero progetto**,
   non soltanto a `/api/gps/traccar`; può inoltre saltare alcune verifiche
   WAF/bot. Le richieste senza segreto restano protette e l’autenticazione
   applicativa Admin resta necessaria. Usarlo solo sul proprio telefono per
   il pilot, non distribuirlo agli operatori, revocarlo in Vercel a fine prova.
   Un telefono con un vecchio bypass riceverà nuovamente la protezione Vercel.

Riferimento ufficiale:
https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation

## Indirizzo da mettere in “Server”

Alias del branch di prova, da confermare dopo l’ultimo deployment:

```text
https://volantinipro-git-feature-tra-80b3a2-fenicesp-gmailcoms-projects.vercel.app/api/gps/traccar?key=CHIAVE_PRIVATA_DISPOSITIVO&x-vercel-protection-bypass=SEGRETO_VERCEL_CODIFICATO
```

**Questo è un modello, non un URL già operativo:** i due segreti sono diversi e
non possono essere inventati. **Copia URL Server** nel pannello produce quello
completo utilizzabile, dopo l’attivazione tecnica e l’inserimento del bypass.
Non inviare il link in chat, screenshot, ticket o git. Non basta che la pagina
web si apra: il browser può avere cookie Vercel che Traccar Client non possiede.
Un 401, redirect verso il login Vercel o HTML non è una conferma del ricevitore.

Solo dopo merge e attivazione produzione (non eseguiti in questo lavoro):

```text
https://www.volantinipro.it/api/gps/traccar?key=CHIAVE_PRIVATA_DISPOSITIVO
```

In produzione il bypass Vercel non va aggiunto. Non usare il server demo e non
aggiungere `:5055`: questo endpoint usa HTTPS sulla porta standard 443.

### CLI opzionale per una sessione già aperta

Per chi vuole agganciare una sessione esistente, avviata dall’app o dal pannello:

```bash
node --env-file=.env.traccar-test scripts/traccar-register.mjs \
  --device RAGAZZO01 --session UUID_SESSIONE_DI_PROVA \
  --server https://HOST_PREVIEW/api/gps/traccar --hours 2
```

Il file locale protetto può contenere `VERCEL_AUTOMATION_BYPASS_SECRET`:
lo script lo aggiunge solo agli host preview VolantiniPro ammessi, mai al dominio
produzione. Non condividere il file. Lo script non avvia il lavoro, registra il
binding e stampa l’URL privato; una nuova registrazione ruota la chiave e può
rinnovare la finestra. Non sostituisce la chiusura della sessione dal pannello.

## Android / Samsung — istruzioni semplici

1. Installa **Traccar Client**, non Traccar Manager, dal link Google Play della
   [pagina ufficiale](https://www.traccar.org/client/).
2. Tieni il servizio fermo mentre configuri. In **Identificatore dispositivo /
   Device identifier** scrivi esattamente `RAGAZZO01` (o l'ID assegnato a te).
3. In **Server URL** incolla l'URL privato completo ricevuto dall'amministratore,
   compreso `?key=...`. Non basta incollare `www.volantinipro.it`.
4. Consenti la posizione precisa e l'accesso in background/“Consenti sempre”,
   quando proposto dal sistema. Nelle impostazioni batteria del telefono
   consenti l'uso senza restrizioni per Traccar Client. Su Samsung rimuovi
   l'app dalle app in sospensione se presente; i nomi cambiano con la versione.
5. Per il pilot imposta accuratezza **Highest / Massima**, intervallo **30
   secondi**, distanza **0** se disponibile, angolo **0**, heartbeat fermo
   **60 secondi**. Sono impostazioni di prova, non una garanzia di puntualità.
6. Abilita il buffering offline, se presente, per conservare i punti durante
   errori transitori e consentire i retry. La privacy limita il recupero a fix
   entro 5 minuti e ancora autorizzati: non è un archivio fuori turno. Il “Password” nelle impostazioni protegge la schermata
   dell'app: non è la chiave di autenticazione dell'endpoint.
7. Avvia il Piano B dal pannello Admin, poi attiva il servizio Traccar. A fine lavoro
   ferma Traccar e chiudi la sessione dal pannello Admin. L'app può trasmettere anche
   fuori turno se la lasci accesa: il server scarta i fix non autorizzati, ma è
   meglio spegnerla quando non lavori.

## iPhone — istruzioni semplici

1. Installa **Traccar Client** dal link App Store della pagina ufficiale.
2. Con il servizio fermo, inserisci lo stesso Device ID registrato e l'URL Server
   completo, compresa la chiave privata.
3. Consenti **Posizione precisa** e l'accesso **Sempre** per il funzionamento
   in background; se iOS lo richiede in un secondo momento, completa il consenso
   nelle impostazioni Privacy e sicurezza → Localizzazione → Traccar Client.
4. Per il pilot scegli accuratezza **Highest / Massima**, intervallo **30
   secondi**, heartbeat **60 secondi** se disponibili. Su iPhone il solo valore
   distanza zero non garantisce invii temporizzati: la guida Traccar indica
   l'accuratezza massima per questa modalità. Non c'è il wake lock Android.
5. Avvia il Piano B dal pannello Admin e poi il servizio Traccar. Abilita
   il buffering se disponibile, con gli stessi limiti di privacy indicati sopra. Metti l'app in
   background senza forzarne la chiusura. Prova anche con schermo bloccato.
6. Alla fine ferma il servizio e chiudi la sessione dal pannello Admin.

Le autorizzazioni e i limiti del sistema operativo restano determinanti: non
promettiamo tracciamento continuo garantito o un invio esatto ogni 30 secondi.

## Prova personale prima di darlo agli operatori

Usa un lavoro di prova dedicato, il tuo telefono e una finestra di 2 ore.

| Prova | Azione | Risultato da verificare |
| --- | --- | --- |
| Primo punto | Senza aprire l’app Driver: avvia Piano B da Admin e Traccar; cammina all’aperto | Punti `source='traccar'` nella stessa sessione |
| Monitor e cliente | Apri le viste esistenti della campagna di prova | Punti sulla stessa traccia, senza modifiche UI |
| Background | Blocca schermo e cammina 5–10 minuti | Nuovi fix con tempi coerenti; nessuna garanzia finché non misurato sul telefono |
| Pausa | Metti in pausa VolantiniPro, lascia Traccar acceso brevemente | Nessun nuovo punto Traccar memorizzato durante la pausa |
| Ripresa | Riprendi e cammina | Nuovi fix successivi alla ripresa; i fix della pausa non vengono recuperati |
| Fine | Chiudi la sessione dal pannello Admin, lascia Traccar acceso brevemente | Nessun nuovo punto salvato; poi spegni Traccar |
| Sconosciuto | Cambia temporaneamente ID con uno non registrato | Nessun inserimento; risposta valida resta HTTP 200 |
| Duplicato | Test automatico con reinvio identico | Un solo punto; non fabbricare coordinate su lavori reali |
| Errore temporaneo | Tecnico: simulare errore DB solo nel test isolato | HTTP 503, poi retry salvato una volta sola |
| Perdita conferma | Test automatico: DB salva ma risposta si perde | 503 iniziale; retry 200 senza doppione |
| Scadenza | Test automatico su PostgreSQL/WASM locale, senza Supabase remoto | Backup smette di registrare alla scadenza anche con sessione aperta |

Nota sul sito attuale: i pulsanti Driver di pausa/ripresa risultano dietro un
flag disattivato. Non sono stati riattivati in questo lavoro. Se non sono
visibili, limitare la verifica automatica al DB locale isolato. Non esiste
un Supabase di test: eventuali verifiche remote della RPC esistente
`gps_transition_session_v3` devono essere concordate con la sessione database
dopo il merge, con autorizzazione Driver valida. Non forzare stati né inserire
coordinate sintetiche nel database di produzione.

Controllo SQL limitato alla sessione di prova:

```sql
select recorded_at, lat, lng, accuracy, speed, source
from public.gps_tracking_points
where session_id = 'UUID_SESSIONE_DI_PROVA' and source = 'traccar'
order by recorded_at desc
limit 30;
```

Se GPS nativo e Traccar sono accesi insieme, entrambi possono inviare punti
nella stessa sessione. Solo i retry identici di Traccar sono deduplicati:
non si cancellano né si fondono punti originali delle due sorgenti. Verificare
la qualità della traccia nel pilot prima di usare il backup operativamente.

## Risposte HTTP e limiti di affidabilità

- **200** per punto salvato, duplicato o scartato volutamente: dispositivo
  sconosciuto, chiave errata/mancante, nessuna sessione attiva, pausa, fuori
  finestra, fix vecchio/futuro o limite per dispositivo. Non si rivela se un ID esiste.
- **503** con `Retry-After: 30` per errore DB/server, timeout, risposta RPC non
  valida, configurazione mancante o backup disabilitato. Non si conferma un fix
  che potrebbe non essere stato scritto. Traccar può conservarlo e ritentare
  con buffering attivo; la ritrasmissione effettiva va verificata sul telefono.
- Se il DB ha salvato ma la risposta si perde, il retry viene riconosciuto
  come duplicato e riceve 200. Nessun doppio punto.
- Richiesta malformata: 400; metodo diverso da GET/POST: 405; corpo oltre 16 KiB:
  413; content type non supportato: 415. Questi errori richiedono correggere il client.
- Durante guasti oltre 5 minuti, o dopo stop/scadenza/revoca, i fix in coda
  vengono scartati intenzionalmente: non si promette recupero illimitato.
- I log applicativi riportano solo `traccar_backup_unavailable` o
  `traccar_backup_ingest_failed`, mai payload/coordinate/chiavi/identità. Le URL
  GET e la chiave nella query possono comparire nei log HTTP della piattaforma:
  trattare quei log e l'URL Server come riservati. Per revocare la chiave,
  disabilitare o registrare nuovamente il dispositivo.

## Disattivazione senza toccare il GPS attuale

Disabilitare un dispositivo:

```bash
node --env-file=.env.traccar-test scripts/traccar-register.mjs --device RAGAZZO01 --disable
```

Oppure impostare `TRACCAR_BACKUP_ENABLED=false` sul solo deployment del backup.
In entrambi i casi il GPS precedente continua con il suo codice e le sue RPC.
Non eliminare punti GPS e non annullare una campagna per disattivare Traccar.

## Test riproducibili

```bash
npm ci --prefix tests/traccar --ignore-scripts
node --test tests/traccar_protocol.test.mjs tests/traccar_database.test.mjs tests/traccar_admin_ui.test.mjs
npm run build
```

La dipendenza PGlite è fissata a versione esatta con lockfile dentro la cartella
di test; non cambia package.json o lockfile dell'app. La prova HTTP locale
esegue il vero handler, la migration e la RPC su PostgreSQL/WASM, con ruoli e
permessi. Il trasporto PostgREST è adattato al DB locale: non è una prova della
rete Supabase di produzione, del trigger PostGIS completo, di Realtime o degli
smartphone. Questi restano requisiti di accettazione del pilot.

## Esito delle verifiche di sviluppo

- Base: `c9c3189f5df90a5c135d50f2e4ae3553a88963e0`.
- Migration eseguita e controllata sul database PostgreSQL/WASM isolato,
  con ingest riservata a `service_role` e controllo sessioni riservato ad
  admin autenticati in allowlist. Provati utenti normali, admin fuori allowlist,
  UID assente, anon e service-role: nessun avvio manuale consentito.
- Handler HTTP locale collegato alla RPC reale nel DB isolato: inserimento,
  duplicato, sconosciuto, pausa, avvio Admin senza Driver, chiusura e retry
  dopo perdita della conferma verificati. Nessun punto fittizio in produzione.
- Revisione aggiornata: 47 test Traccar passati (protocollo, SQL/permessi, HTTP→DB e
  comportamenti del nuovo pannello, NULL nell’indice e rollback che conserva
  colonne nullable e storico). I test UI sono isolati con React, non
  una prova del dashboard autenticato nel browser o del telefono fisico.
- Build Vite e prerender SEO delle 11 pagine riusciti dopo la revisione.
- 127 verifiche GPS esistenti: 126 passate, 1 fallita. Lo stesso errore
  `DriverWorkMapPage: traccia propria + tracce gruppo, punti GPS per sessione,
  legenda "Tu"` si riproduce anche sul commit base senza questa modifica
  (30/31 nel file `gps_device_isolation.test.mjs`). Cerca una vecchia stringa
  `g.latlngs.map`; non è stato corretto modificando file fuori ambito.
- Non verificati: telefono fisico Android/iPhone, dashboard autenticate con
  punti Traccar reali, PostGIS completo e Supabase/PostgREST remoto dopo la
  migration. La sola preview non attiva il backup: servono migration, variabili
  server e registrazione del telefono. Esiste solo il database di produzione;
  la sessione database gestisce l’applicazione da integration dopo il merge.

### Regressioni della revisione Admin

Le 49 verifiche mirate di home Admin e isolamento GPS danno 47 PASS e due
fallimenti, entrambi riprodotti sul commit base invariato `c9c3189`: il test
analytics/PII di `admin_commercial_home.test.mjs` e l’asserzione statica
`g.latlngs.map` in `gps_device_isolation.test.mjs`. Nessun file di quelle
funzionalità è stato modificato per farli passare. La regressione complessiva
resta quindi PARZIALE, non tutta verde.

Alla consegna la migration non è applicata al DB remoto e la prova della
preview con Traccar fisico non è stata eseguita. L’accesso Vercel del
collegamento restituisce 403 per il team: serve il consenso del titolare o la
configurazione privata del bypass dal dashboard Vercel. Non esiste ancora un
URL con credenziali reali che possa essere dichiarato collaudato.

## Cosa modifica la migration e come tornare indietro

La sola applicazione SQL crea oggetti e colonne: non avvia sessioni, non
registra dispositivi e non riscrive lo storico GPS. Le scritture operative
avvengono successivamente, quando si usano pannello o endpoint.

| Oggetto | Modifica |
| --- | --- |
| `public.traccar_devices` | Nuova tabella: Device ID, hash della chiave, collegamento a operatore/assegnazione e sessione, finestra autorizzata, contatore invii. RLS attiva. Nessun accesso diretto anon/authenticated; CRUD per service-role. |
| `public.gps_tracking_points` | Tabella ESISTENTE: aggiunge tre colonne nullable `source`, `source_event_id`, `source_metadata` e l’indice univoco parziale `gps_tracking_points_traccar_event_uidx` per evitare duplicati Traccar. Nessun UPDATE dello storico. |
| `public.traccar_ingest_point` | Nuova funzione SECURITY INVOKER, eseguibile soltanto da service-role. Valida autorizzazione/tempi e inserisce nella tabella GPS esistente. |
| `traccar_private` | Nuovo schema con funzione `admin_control` SECURITY DEFINER. Accesso applicativo tramite authenticated, ma ogni azione richiede UID e controllo Admin esistente. |
| `public.traccar_admin_control` | Nuova funzione SECURITY INVOKER, wrapper autenticato per lista, avvio, chiusura e rotazione chiave; anon e service-role esclusi. |

Non sostituisce funzioni, trigger o policy delle tabelle esistenti. Riutilizza
`gps_assignment_is_valid_v2`, `gps_is_admin` e `gps_transition_session_v3`.
A funzionalità attiva il pannello crea/chiude righe di `delivery_sessions` e
scrive audit in `gps_operator_audit_log`; l’endpoint scrive punti GPS. Queste
sono tabelle esistenti, anche se la loro struttura non cambia, salvo le tre
colonne della tabella GPS indicate sopra.

**Ritorno indietro operativo (preferito):** prima chiudere le sole sessioni
Piano B aperte, poi disabilitare il backup e i binding e fermare Traccar sui
telefoni. Ripristinare il codice tramite normale revert/PR su integration,
senza force. Conservare schema e dati evita perdita dello storico e non
richiede eliminare punti nativi. Con endpoint disabilitato si risponde 503:
fermare anche i client evita retry inutili. Revocare il bypass del pilot.

**Rimozione dello schema, solo se necessaria:** lo script manuale è
`supabase/migrations/rollback/20261024102649_traccar_backup_ingest.rollback.sql`.
Rimuove soltanto le tre funzioni nuove, lo schema `traccar_private`,
`traccar_devices` e l’indice anti-duplicati. Le tre colonne GPS rimangono
presenti e nullable, con i loro valori; punti, sessioni e audit non vengono
cancellati. Non usa CASCADE e si ferma se ci sono sessioni Piano B ancora
aperte, colonne non conformi o dipendenze impreviste.

**ATTENZIONE: termina con ROLLBACK = prova a vuoto. Per ripristinare davvero sostituire ROLLBACK con COMMIT.**

Lo script termina con `ROLLBACK` per impostazione predefinita. La sessione
database, da integration e dopo OK esplicito, potrà usarlo per una migration
compensativa con COMMIT. Prima chiudere le sole sessioni Piano B, fermare i
client e disabilitare il ricevitore. L’eliminazione di `traccar_devices` perde
mapping, hash e finestre: salvarli prima se occorre conservarli. Nessuno script
SQL di questa PR è stato applicato in modo permanente al database remoto.

## Esito della revisione database e aggiornamento richiesto

- Indice confermato: `WHERE source = 'traccar'`; `ON CONFLICT` invariato.
  L’indice unico permette più NULL in `source_event_id`; i punti storici con
  `source=NULL` restano esclusi.
- La migration imposta, subito dopo BEGIN, `SET LOCAL lock_timeout = '5s'` e
  `SET LOCAL statement_timeout = '60s'`. Non promettono assenza di lock: un
  lock non ottenuto entro 5 secondi o un comando oltre 60 secondi fa fallire
  la transazione. Nessun retry automatico della migration.
- Resta invariata la consegna: nessuna applicazione da feature/preview;
  migration ed eventuali Edge Functions soltanto dalla sessione database,
  da integration dopo il merge autorizzato dall’utente.
- Il merge in integration è riservato all’utente e deve essere fast-forward,
  senza merge commit. Prima di ogni pubblicazione fare fetch/rebase e fermarsi
  in caso di conflitti; non forzare integration.
