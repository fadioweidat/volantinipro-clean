# Piano B GPS con Traccar Client

Branch: `feature/traccar-backup`. Nessun merge e nessuna attivazione automatica.
Solo file nuovi e una migration additiva. GPS nativo, lifecycle delle sessioni,
token Driver, monitor e dashboard esistenti rimangono invariati.

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
   La RPC nuova è `SECURITY INVOKER`, eseguibile solo da `service_role`.
3. Il dispositivo è associato a un operatore registrato OPPURE a un'assegnazione
   precisa, più `vp_device_id` del telefono che ha avviato il lavoro VolantiniPro.
   Lo script di registrazione sceglie l'assegnazione precisa per evitare ambiguità.
4. Nessun avvio/resume automatico. Occorre una sessione esistente `started`,
   non chiusa, appartenente a quel dispositivo e a un incarico valido.
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

Questi passaggi spettano all'amministratore tecnico, una volta per l'ambiente:

1. Usare la preview del branch, con database di staging compatibile. Non fare
   merge solo per ottenere una prova. Nessuna migration è stata applicata al
   Supabase di produzione durante lo sviluppo.
2. Revisionare e applicare **solo**
   `supabase/migrations/20261024102649_traccar_backup_ingest.sql` nel database
   scelto per la prova. Non lanciare indiscriminatamente tutte le migration
   storiche: il repository contiene rebaseline e riconciliazioni precedenti.
3. Sul deployment di prova configurare le variabili server:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACCAR_BACKUP_ENABLED=true`.
   `VITE_SUPABASE_URL` è solo il fallback dell'URL. La chiave service-role NON
   deve avere prefisso `VITE_`, NON va inserita nell'app o nel campo Server.
4. Verificare che il telefono possa raggiungere il nuovo endpoint. Un 401 con
   login Vercel o una pagina HTML non è la risposta Traccar. Le preview protette
   richiedono un ambiente di test raggiungibile dal telefono; non distribuire
   agli operatori chiavi di bypass Vercel e non cambiare le protezioni del sito
   di produzione. Il solo “build riuscita” non dimostra l'accessibilità.
5. In VolantiniPro creare un lavoro di prova, assegnarlo al proprio dispositivo
   e avviarlo con il normale pulsante. Non usare una campagna reale del cliente
   per collaudi o coordinate sintetiche.
6. Recuperare l'ID della sessione appena avviata dall'Admin o, in SQL Editor,
   con una query limitata alla campagna di prova:

   ```sql
   select id, status, started_at
   from public.delivery_sessions
   where campaign_id = 'UUID_CAMPAGNA_DI_PROVA'
   order by started_at desc nulls last
   limit 10;
   ```

7. Sul computer amministrativo, con le variabili del DB di prova già presenti
   in un file `.env` locale protetto (mai in git), eseguire:

   ```bash
   node --env-file=.env.traccar-test scripts/traccar-register.mjs \
     --device RAGAZZO01 --session UUID_SESSIONE_DI_PROVA \
     --server https://HOST_PREVIEW/api/gps/traccar --hours 2
   ```

   Lo script legge la sessione, abbina assegnazione e telefono e registra solo
   la nuova tabella. NON avvia né modifica il lavoro. Stampa l'URL privato
   da copiare. Una nuova registrazione ruota la chiave
   precedente e rinnova la finestra: aggiornare il Server sull'app.

## Indirizzo da mettere in “Server”

**Durante il collaudo**, usare l'URL stampato dallo script, che avrà questa forma:

```text
https://HOST_PREVIEW/api/gps/traccar?key=CHIAVE_PRIVATA_DEL_DISPOSITIVO
```

**Solo dopo il merge e l'attivazione in produzione**, il percorso definitivo è:

```text
https://www.volantinipro.it/api/gps/traccar?key=CHIAVE_PRIVATA_DEL_DISPOSITIVO
```

La chiave è diversa per ogni dispositivo. Questi sono modelli, non credenziali
già attive. L'URL privato completo viene generato dopo aver scelto il telefono
e la sessione di prova. Non usare il server demo, non aggiungere `:5055`:
qui si riceve tramite HTTPS sulla porta standard 443.

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
6. Per la prima prova disattiva il buffering offline, se presente, per vedere
   subito errori di invio. Il “Password” nelle impostazioni protegge la schermata
   dell'app: non è la chiave di autenticazione dell'endpoint.
7. Avvia il lavoro in VolantiniPro, poi attiva il servizio Traccar. A fine lavoro
   ferma Traccar e termina la sessione VolantiniPro. L'app può trasmettere anche
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
5. Avvia il lavoro in VolantiniPro e poi il servizio Traccar. Metti l'app in
   background senza forzarne la chiusura. Prova anche con schermo bloccato.
6. Alla fine ferma il servizio e termina il lavoro in VolantiniPro.

Le autorizzazioni e i limiti del sistema operativo restano determinanti: non
promettiamo tracciamento continuo garantito o un invio esatto ogni 30 secondi.

## Prova personale prima di darlo agli operatori

Usa un lavoro di prova dedicato, il tuo telefono e una finestra di 2 ore.

| Prova | Azione | Risultato da verificare |
| --- | --- | --- |
| Primo punto | Avvia lavoro e Traccar; cammina all'aperto | Punti `source='traccar'` nella stessa sessione |
| Monitor e cliente | Apri le viste esistenti della campagna di prova | Punti sulla stessa traccia, senza modifiche UI |
| Background | Blocca schermo e cammina 5–10 minuti | Nuovi fix con tempi coerenti; nessuna garanzia finché non misurato sul telefono |
| Pausa | Metti in pausa VolantiniPro, lascia Traccar acceso brevemente | Nessun nuovo punto Traccar memorizzato durante la pausa |
| Ripresa | Riprendi e cammina | Nuovi fix successivi alla ripresa; i fix della pausa non vengono recuperati |
| Fine | Termina il lavoro, lascia Traccar acceso brevemente | Nessun nuovo punto salvato; poi spegni Traccar |
| Sconosciuto | Cambia temporaneamente ID con uno non registrato | Nessun inserimento; risposta valida resta HTTP 200 |
| Duplicato | Test automatico con reinvio identico | Un solo punto; non fabbricare coordinate su lavori reali |
| Scadenza | Imposta una finestra breve nel DB di test | Backup smette di registrare alla scadenza anche con sessione aperta |

Nota sul sito attuale: i pulsanti Driver di pausa/ripresa risultano dietro un
flag disattivato. Non sono stati riattivati in questo lavoro. Se non sono
visibili, la prova pausa/ripresa va eseguita dal tecnico nel solo ambiente di
test tramite la RPC esistente `gps_transition_session_v3` con autorizzazione
Driver valida. Non forzare stati o inserire coordinate nel database reale per
simulare una prova da telefono.

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

- Richiesta valida: **sempre 200**, anche per sconosciuto, chiave errata/mancante,
  turno chiuso, sessione assente, punto scartato o duplicato. Non si rivela
  pubblicamente se un Device ID esiste.
- Richiesta malformata: 400; metodo diverso da GET/POST: 405; corpo oltre 16 KiB:
  413; content type non supportato: 415.
- **Anche in caso di errore DB, funzione non attivata o configurazione mancante**,
  una richiesta valida riceve 200 con `{"ok":false,"error":"temporarily_unavailable"}`,
  come richiesto. Traccar normalmente considera il 200 una conferma e non
  ritenta quel fix. Quindi questo requisito può causare perdita di punti durante
  un guasto: il pilot deve controllare la presenza effettiva dei punti, non solo
  uno stato “inviato” nell'app. Non viene promesso un backup senza perdita dati.
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
node --test tests/traccar_protocol.test.mjs tests/traccar_database.test.mjs
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
  con permessi `anon`/`authenticated` negati e `service_role` consentito.
- Handler HTTP locale collegato alla RPC reale nel DB isolato: inserimento,
  duplicato, sconosciuto e pausa verificati. Nessun punto fittizio in produzione.
- 28 nuovi test passati; build Vite e prerender delle 11 pagine riusciti.
- 127 verifiche GPS esistenti: 126 passate, 1 fallita. Lo stesso errore
  `DriverWorkMapPage: traccia propria + tracce gruppo, punti GPS per sessione,
  legenda "Tu"` si riproduce anche sul commit base senza questa modifica
  (30/31 nel file `gps_device_isolation.test.mjs`). Cerca una vecchia stringa
  `g.latlngs.map`; non è stato corretto modificando file fuori ambito.
- Non verificati: telefono fisico Android/iPhone, dashboard autenticate con
  punti Traccar reali, PostGIS completo e Supabase/PostgREST remoto dopo la
  migration. La sola preview non attiva il backup: servono migration, variabili
  server e registrazione del telefono nel database scelto per il pilot.
