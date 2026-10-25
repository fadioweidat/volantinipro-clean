# Monitor GPS Live — diagnosi in sola lettura, 25 ottobre 2026

## Esito

Non è stata trovata una causa nella migration Traccar applicata oggi.
È confermata una lettura incompleta, già presente nel codice precedente:
il monitor riceve soltanto i 1.000 punti più vecchi, senza paginazione.
Questo spiega 21 falsi zero più una sessione realmente senza punti (22 righe
a zero su 25). Non spiega da solo l’affermazione che TUTTE e 25 siano a zero:
tre sessioni devono avere punti anche nel risultato troncato. La causa
specifica di quegli ulteriori tre zeri non è confermata senza la risposta
della richiesta del browser interessato e il relativo stato UI.
Non si dichiara il problema risolto.

## Dati e collegamenti

- 2.348 punti, in 58 sessioni, 29 campagne, 21 driver.
- 30 assegnazioni e 28 gruppi distinti nelle sessioni con punti.
- Nessun punto orfano; campagne e driver dei punti coincidono con quelli
  delle rispettive sessioni.
- 80 punti storici appartengono a sessioni senza assignment_id; 515 a sessioni
  senza device_id. Questi campi non servono per collegarli: session_id esiste.
- Catena: gps_tracking_points.session_id → delivery_sessions.id →
  assignment_id/group_id/device_id. campaign_id e driver_id sono anche nei punti.
  Non si deve “recuperare” la traccia di un’altra sessione per assegnarla a una vuota.
- Nell’intervallo 01/09–25/10 Europe/Rome: esattamente 25 sessioni,
  24 con punti, totale 1.775. I restanti 573 punti sono fuori dall’intervallo.
- Source è NULL per tutti i 2.348 punti. Impronta dei campi originali:
  0ad70834eeefe58182eb4363e1dcdcf3, identica allo snapshot precedente alla migration.

## Sessioni dell’intervallo

La colonna “Letti con cap” riproduce la query ASC limitata ai primi 1.000 punti,
non è una misura acquisita dal browser dell’utente.

| Sessione | Avvio UTC | Stato DB | Punti DB | Letti con cap | Campagna | Assegnazione | Gruppo |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| f4d06b0c-196f-4d8c-80df-a5b4d4a19d29 | 2026-10-04 13:45 | started | 7 | 0 | df9c4bc9-3f8a-4db6-8507-609451f17953 | 364f4bc7-10c0-4a5f-8dc8-98bbdb6997cc | f7946a50-3322-4a70-8e4a-46a127cf84d5 |
| e4e7b72a-83d2-4923-96e9-76b3e3cae2c0 | 2026-09-30 13:41 | started | 26 | 0 | 1f1706f5-2c68-4921-a02a-eaaeb9c62e59 | 0588afd2-3df8-4f15-b72c-8b95c24eee4b | c139baf2-9140-4416-9864-0ffae1dda13e |
| 9fe2199b-6f07-42cf-9562-4f81331fc91b | 2026-09-29 19:16 | started | 10 | 0 | 87df2760-f1f2-4c5d-b2c6-c3b7d222b347 | bdcc74b2-6552-4b3c-9995-52be3a3529b5 | ab39b9db-e725-4d42-b4a9-90ec25668b5f |
| c7da50a0-3e6c-47d5-ac41-3411c991989a | 2026-09-25 10:00 | started | 149 | 0 | aed50d1c-37d8-46f1-b8ae-e1e693d18ba4 | b43f46f2-f28b-431c-8b2f-e1d9f03ea998 | 003f5527-e55d-45d9-865c-5dd6ada150af |
| ac878ec5-3651-4bc4-9dae-d867acff0ddb | 2026-09-24 10:01 | started | 1 | 0 | f3b337af-153c-4f41-8523-997bf35333f2 | 4ccda2cf-6997-4a0f-8ae0-dbdda43c96fb | 95804ee8-23f9-4657-a8be-2b5c2308606c |
| 6d399900-7420-4df1-b09f-b8d46a2fa71a | 2026-09-24 10:00 | started | 26 | 0 | f3b337af-153c-4f41-8523-997bf35333f2 | 966f1b1a-d440-4a2d-99dd-d7cd0eb079cc | 95804ee8-23f9-4657-a8be-2b5c2308606c |
| daa4c400-543c-4a89-9774-910771eb62ee | 2026-09-24 10:00 | started | 1 | 0 | f3b337af-153c-4f41-8523-997bf35333f2 | 4ccda2cf-6997-4a0f-8ae0-dbdda43c96fb | 95804ee8-23f9-4657-a8be-2b5c2308606c |
| 2813435c-27a0-4f89-b1fd-3e5a194dabdc | 2026-09-24 09:01 | started | 4 | 0 | f3b337af-153c-4f41-8523-997bf35333f2 | 8e1150b4-2808-45cd-b716-115001c4623d | 95804ee8-23f9-4657-a8be-2b5c2308606c |
| d3e5dede-950f-40b0-99d4-4bca9a7c6365 | 2026-09-24 08:07 | started | 66 | 0 | f3b337af-153c-4f41-8523-997bf35333f2 | 4ccda2cf-6997-4a0f-8ae0-dbdda43c96fb | 95804ee8-23f9-4657-a8be-2b5c2308606c |
| c2652080-6782-4d6b-88b3-ce6c944dffcb | 2026-09-23 17:32 | started | 177 | 0 | 810ad5f5-bd2a-4481-b212-d713d883f819 | 8e3cb302-50e2-41cb-9153-6ce2e7d0fa3b | 23b204cd-af3a-4526-a0aa-3400b1e0a5ae |
| 924b5418-7ec8-4603-bb5e-5752eb4aada3 | 2026-09-22 07:02 | started | 18 | 0 | 84b5aef0-eb35-4097-8aff-ca129c76aca7 | d50ecfea-7f74-41fc-8dfa-fa2cc12b9a37 | 3f0b888a-5988-4163-a70d-0ab28e21d744 |
| 11a8608a-75bb-4d26-abce-8ca9918b6a1e | 2026-09-21 10:27 | started | 559 | 0 | 7816679c-a3c1-4665-9540-f5c890e52e4d | 850e0492-8eae-4024-9468-a8d54d6a035a | ff82d822-a610-4155-9abb-4372b6bcaf28 |
| 933cd0db-2249-4588-8543-34e0557fae50 | 2026-09-21 09:50 | started | 212 | 0 | 9f99eb7e-76f7-4fee-af44-76ed9e04bf5a | 246ef922-5928-4cc4-84df-9b47e906858b | b7ada2db-724f-4e96-8b1b-2aea10a4bcc0 |
| beccf761-68af-49a9-8bd0-ea66abf82fbe | 2026-09-19 15:35 | completed | 8 | 0 | dc5a5357-453c-46bc-9d1b-48a592ef6152 | 58bb64af-7929-4de1-8375-b43fa52519a4 | cbbed7ba-c445-46a6-80df-910b2e3d5b54 |
| 315d4be2-f885-4227-b843-e7f04c04b879 | 2026-09-18 18:50 | started | 39 | 0 | 8bb10172-b8c5-4198-b628-c4d12f4ce1ff | 514fd75c-6e11-4f78-a97f-e76f097c6ef5 | 121f4c38-d213-49f1-845c-b81b0ec534c8 |
| 0f1e5f56-5300-46cd-94d1-6075e022a63e | 2026-09-18 14:57 | started | 1 | 0 | 6adc7b7a-6b0a-4b29-b9a7-841c3302dcb4 | 972acf13-489b-4620-a22b-c6959a2a7405 | 219a3fba-9cd6-4934-a941-9ede6552ef85 |
| e0f9c4bd-0148-4907-a01d-8623c8ef389b | 2026-09-18 14:00 | completed | 1 | 0 | 6adc7b7a-6b0a-4b29-b9a7-841c3302dcb4 | 972acf13-489b-4620-a22b-c6959a2a7405 | 219a3fba-9cd6-4934-a941-9ede6552ef85 |
| cb6a0b74-d7a1-4590-85b2-fb67ee13e2d9 | 2026-09-18 13:54 | completed | 0 | 0 | 6adc7b7a-6b0a-4b29-b9a7-841c3302dcb4 | 972acf13-489b-4620-a22b-c6959a2a7405 | 219a3fba-9cd6-4934-a941-9ede6552ef85 |
| 78dcc40b-bd37-4f53-8452-807f4b903a44 | 2026-09-17 14:37 | started | 6 | 0 | 2e64339d-6c51-4160-93c2-d4b4cd04e654 | 76c776c2-de91-4a6b-9408-fe18dcd13aa4 | 002b8db0-5680-40da-a50f-8b94550b6a74 |
| 6d8ba237-bfc2-4d68-9f09-ba0e91d45462 | 2026-09-14 10:07 | started | 18 | 0 | a2b6e00f-1399-4a25-9bee-0d12d63f474c | 07be7d1f-4483-4b15-8b01-e163d50f71af | cc001851-dc68-4783-8f4d-68fd7aa38d7c |
| 5b70b0a2-144e-4781-87bd-de8e0575ec68 | 2026-09-12 12:23 | started | 9 | 0 | c54077d0-4aff-4c47-bea5-17cd403b4a2c | 83e81581-c06a-4ff7-aa51-b7925d55b030 | 69a7893f-7e3f-46c0-8df5-00ae022ccca2 |
| ca8fbaf7-6825-4aa1-b7d5-702070687b53 | 2026-09-12 11:54 | completed | 8 | 0 | c54077d0-4aff-4c47-bea5-17cd403b4a2c | 83e81581-c06a-4ff7-aa51-b7925d55b030 | 69a7893f-7e3f-46c0-8df5-00ae022ccca2 |
| 464a880e-ecaf-4be4-b547-71e2062ec410 | 2026-09-12 10:14 | completed | 34 | 32 | c54077d0-4aff-4c47-bea5-17cd403b4a2c | 83e81581-c06a-4ff7-aa51-b7925d55b030 | 69a7893f-7e3f-46c0-8df5-00ae022ccca2 |
| 7c20bb3f-fd7a-4883-bc66-8736b91ce38f | 2026-09-06 19:26 | started | 70 | 70 | 68f4222f-efc5-43c1-babf-2f62ec8e7ea1 | f9e17877-8ef1-44aa-a926-dcfb2cfabd1b | 12778b3e-7efd-4ff5-b0a4-360dd89797ba |
| 77f4c70f-6f7a-4cb0-ad0a-05f89437c0d8 | 2026-09-05 09:00 | started | 325 | 325 | 119f43d3-4b23-4674-bcef-08b7479e92ac | b4687659-88e5-4f11-a8f1-4d457d1e9ae9 | cc3c3d40-8e44-49cf-8674-38a856d457d1 |

Totale DB: 1.775. Totale incluso nel risultato troncato per queste sessioni:
427 = 325 (77f4c70f) + 70 (7c20bb3f) + 32 (464a880e; 34 reali).
559 punti della sessione 11a8608a, ad esempio, sono tutti successivi al taglio
e quindi non arrivano alla pagina con questa query.

## Da dove legge la pagina

Percorso UI: /admin/live, titolo “Monitor GPS Live”.
AdminLiveDashboard.jsx chiama getLiveDrivers() ogni 15 secondi.
In src/lib/services/admin-api.js:
1. selectOptionalTable('delivery_sessions') legge le sessioni (67 disponibili).
2. Query diretta PostgREST, non una RPC punti:
   supabase.from('gps_tracking_points').select('*')
   .in('session_id', sessionIds).order('recorded_at', { ascending: true })
3. Nessuna paginazione e nessun filtro temporale server-side.
4. Raggruppamento pointsBySession per session_id, poi filtro date lato client
   in filterOperationalRows(), basato sull’ultima attività della sessione.
5. Punti totali = lunghezza dell’array della sessione ricevuto; non la somma DB.
   La qualità non può spiegare “Punti totali 0” quando l’array contiene punti.

Il progetto ha max_rows=1000 in supabase/config.toml. I log reali di oggi
confermano richieste del monitor HTTP 200 con Content-Range 0-999/*:
tutti i 67 session ID sono nella richiesta, senza filtro source.
Il millesimo punto è del 12/09/2026 alle 11:53:27.462 UTC.
I 573 punti precedenti a settembre consumano già più della metà del risultato.
Restano fuori 1.348 dei 1.775 punti relativi alle 25 sessioni.

La query ignora inoltre il campo error e usa allPoints || []: è un distinto
difetto di “falso zero” in caso di errore, ma nei log esaminati la richiesta
è riuscita con 1.000 righe, quindi NON è provato che quel ramo spieghi questo caso.

## RLS, source, campagne di prova/archiviate

- Verifica SQL in transazione READ ONLY/ROLLBACK con ruolo authenticated e
  claim dell’Admin titolare, senza creare JWT/sessioni o cambiare permessi:
  gps_is_admin=true, 67 sessioni e 2.348 punti leggibili.
  È una simulazione di autorizzazione DB, NON la verifica del JWT del browser.
- Le richieste HTTP del monitor nei log restituiscono 1.000 righe, non un
  risultato vuoto da RLS.
- Nessuna condizione source nella query; l’indice Traccar non filtra le SELECT.
- getLiveDrivers() non filtra le campagne per test/archivio. Per tutte le 25
  sessioni selezionate, campaigns.is_test=false e status=in_progress.
  Questo non dimostra che le campagne fossero attività commerciali reali:
  riporta soltanto i flag presenti nel DB.

## Prima della migration

Confrontati c9c3189 (prima di Traccar) e 8f7c703:
identici AdminLiveDashboard.jsx, admin-api.js, gps-api.js, report-utils.js,
geofenceEngine.js e AdminLiveFiltersPanel.jsx.
La query senza paginazione e l’errore ignorato sono già nel codice precedente.
La migration non sostituisce tali funzioni, policy o dati GPS.
I confronti prima/dopo applicazione confermano identici punti, sessioni,
funzioni GPS preesistenti e policy.

Il log delle 06:00:12 UTC (prima della migration) mostra già il tetto di
1.000 righe su una lettura GPS con limit=5000, ordinata DESC e con un diverso
insieme di sessioni: dimostra il limite preesistente, NON lo stesso schermo
storico del monitor ASC. Non è disponibile una prova visiva del monitor
prima della migration. Non si inventa una ricostruzione della schermata storica.

## Etichette e nomi

- “Storico terminato” è usato per lifecycle=history, che include anche sessioni
  started inattive da più di 24 ore. Fra le 25: 20 sono ancora started e
  soltanto 5 completed. L’etichetta non dimostra uno Stop eseguito nel DB.
- deriveLiveZoneStatus() riceve coordinate e confini, non lo stato sessione:
  senza ultima posizione restituisce “In attesa GPS” anche per uno storico.
- I nomi campagna esistono per tutte e 25 le sessioni, ma questa UI stampa
  campaign_id/shortId e il filtro campagne usa gli UUID.
- Nessuna delle 25 sessioni ha driver_name/metadata.driver_name utilizzabile;
  displayDriverName() ripiega sull’ID. Un nome assegnazione/profilo è presente
  in 8 casi, ma getLiveDrivers() non esegue quel join. Negli altri non si
  può inventare il nome.

## Ripristino e perimetro

Nessuna modifica a database, codice, PR, permessi o deployment in questa analisi.
Nessun login o magic link richiesto. Browser disponibile non autenticato;
non è stata riprodotta la schermata protetta dello specifico browser utente.
Non ci sono evidenze per raccomandare un rollback Traccar come soluzione
al difetto di paginazione, che esiste anche nella versione precedente.

Lo script già disponibile, NON eseguito, è:
supabase/migrations/rollback/20261024102649_traccar_backup_ingest.rollback.sql.
Termina con ROLLBACK (prova a vuoto), conserva le tre colonne nullable e lo storico.
Un ripristino effettivo richiede revisione/autorizzazione ed esecuzione della
sessione database, dopo chiusura delle sessioni backup e disattivazione del ricevitore.

## Stato

ROOT CAUSE: lettura punti troncata a 1.000 senza paginazione; UI tratta dati non caricati come zero.
FILES CHANGED: nessuno nel repository o nel database; solo questo report.
CODE: FAIL — difetto confermato nel percorso di lettura
TESTS: PASS — conteggi, collegamenti e replay SQL in sola lettura
BUILD: NOT RUN — nessuna modifica codice
RUNTIME: PARTIALLY VERIFIED — log reali; non la pagina autenticata
PRODUCTION: PARTIALLY VERIFIED
ORIGINAL USER SCENARIO: PARTIALLY VERIFIED — 22/25 spiegate, tre zeri non confermati
REGRESSION: NOT VERIFIED — nessuna correzione applicata
PERFORMANCE: NOT APPLICABLE
OVERALL: PARTIALLY VERIFIED — diagnosi, non risoluzione

