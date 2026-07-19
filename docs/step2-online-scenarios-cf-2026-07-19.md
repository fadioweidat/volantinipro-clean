# Step 2 — verifica online reale scenari C–F

Data: 2026-07-19, Europe/Rome  
Ambiente: applicazione locale `http://127.0.0.1:5173`, Google Chrome headless, servizi reali, nessuna fixture o intercettazione delle risposte.

## Esito sintetico

| Scenario | Esito | Nota |
|---|---|---|
| C — Indirizzo e raggio | PASS | Geocoding Nominatim, raggi 1/3/5 km, NIL, quantità e round-trip verificati |
| D — Multi-comune | PASS | Cormano, Bresso, Monza; deduplicazione, rimozione e persistenza verificate |
| E — Hand to Hand | FAIL applicazione | Dati reali disponibili, ma il payload territoriale conserva `Milan` invece di `Milano` |
| F — Business Bergamo | PASS | 132 attività reali, categorie, copie, materiali, competitor `null`, nessuna NIL |

Nessuno scenario finale è BLOCKED. E è stato interrotto dopo la conferma del difetto applicativo; la persistenza Step 3 → Step 2 non è stata eseguita.

## Scenario C — indirizzo e raggio

Indirizzo: Piazza del Duomo 1, Milano. Mapbox geocoding ha risposto HTTP 403; fallback Nominatim HTTP 200 in 27 ms. Punto selezionato: `45.4636899, 9.1910507`, mantenuto come centro esatto per tutti i raggi.

| Raggio | Territori/NIL intersecati | Fabbisogno base | Consigliato | Copertura con 10.000 | Confini/geometrie |
|---|---:|---:|---:|---:|---:|
| 1 km | 5 | 12.782 | 14.060 | 71,1% | 5 |
| 3 km | 34 | 115.040 | 126.545 | 7,9% | 34 |
| 5 km | 64 | 319.554 | 351.510 | 2,8% | 64 |

Il comune coinvolto rimane Milano; la variazione del raggio amplia le NIL intersecate. `analysis-istat` ha risposto HTTP 200 per 1 km (850 ms), 3 km (723–858 ms) e 5 km (1470 ms), con `municipality=Milano`, `analysisLevel=nil`, `selectionScope=address`.

Persistenza PASS: punto, raggio finale 5 km, decisione utente e quantità sono identici dopo Step 2 → Step 3 → Step 2.

## Scenario D — multi-comune

Ordine iniziale: `Cormano → Bresso → Monza`. Tutti e tre i comuni sono rimasti presenti, senza duplicati, con tre confini disponibili. Il secondo tentativo di aggiungere Cormano è stato deduplicato. Dopo la rimozione di Bresso sono rimasti `Cormano → Monza`.

Persistenza PASS dopo il ricalcolo completo del ritorno: nomi e ordine dei comuni, quantità, decisione e ordine di allocazione invariati.

Richieste principali dell’esecuzione conclusiva:

- Nominatim Cormano/Bresso/Monza: HTTP 200, 7–27 ms per il geocoding e 92–296 ms per i confini.
- `analysis-istat` Cormano: HTTP 200, 745 ms.
- `analysis-istat` multi-comune: HTTP 200, 1096–1656 ms.
- Overpass primario: HTTP 200, 4345–5747 ms.
- Mapbox geocoding: HTTP 403.

## Scenario E — Hand to Hand

Configurazione: settore Retail, target aggiuntivo Stazioni e fermate, punto Piazza del Duomo, Milano, raggio 3 km, due promoter.

Dati reali ricevuti prima dell’interruzione:

- Overpass primario: HTTP 200, 2734 ms; 58 POI selezionabili e selezionati.
- Supabase RPC TPL: HTTP 200, 1531–1603 ms.
- Fermate TPL: 906; fonti `atm_milano`, `trenord_lombardia`.
- Promoter: 2; capacità stimata 4.000; fabbisogno 1.600.
- Il modello D2D è inattivo. Il campo tecnico `families: 0` non è mostrato tra i KPI principali H2H; cassette non presenti tra i KPI principali.

Bug applicativo confermato e motivo dell’interruzione:

```text
selectedSearchPoint.parentComune = "Milan"
selectedSearchPoint.city = "Milan"
truthModel.userSelections.selectedMunicipalities[0].name = "Milan"
```

Il nome arriva dal bootstrap Nominatim del punto operativo configurato nello Step 1 e non attraversa la canonicalizzazione italiana usata dalla ricerca Nominatim dello Step 2. Il payload H2H viola quindi il contratto territoriale corrente `Milan → Milano`. Nessuna correzione è stata applicata. Il passaggio a Step 3 e la persistenza non sono stati eseguiti dopo la conferma del bug.

## Scenario F — Business Bergamo

- Comune: Bergamo.
- Overpass primario: HTTP 200, 10.526 ms.
- Attività reali: 132.
- Categorie: Tabacchi, Supermercato, Abbigliamento, Negozio.
- Attività selezionate: 132.
- Copie assegnate alle prime due attività: 3 e 5; le restanti mantengono 2 copie.
- Materiali necessari: 268.
- Materiali residui: 4.732.
- Materiali mancanti: 0.
- `competitorCount`: `null`, perché non è arrivato un `competitor_count` esplicito.
- NIL selezionate/restituite: 0.

Persistenza PASS: Bergamo, attività selezionate, copie per attività, piano materiali e competitor `null` conservati dopo Step 3 → Step 2.

## Servizi e instabilità

Raggiungibili:

- Nominatim: HTTP 200.
- Supabase `analysis-istat`: HTTP 200.
- Supabase RPC TPL: HTTP 200.
- Overpass primario: HTTP 200 nelle esecuzioni conclusive.

Instabili o non configurati:

- Mapbox geocoding: HTTP 403 in tutti gli scenari interessati; fallback Nominatim funzionante. Classificazione: configurazione esterna/credenziale.
- Tile Mapbox: numerosi `ERR_BLOCKED_BY_ORB` registrati dal browser.
- Overpass: osservati HTTP 429 nello scenario C e HTTP 504 in tentativi precedenti D/E. Le esecuzioni successive hanno restituito HTTP 200 e dati utilizzabili. Il fallback `overpass.kumi.systems` può risultare `ERR_ABORTED` quando la richiesta primaria termina per prima.
- Richieste annullate durante cambio raggio, cambio comune o navigazione risultano `ERR_ABORTED`; sono conservate nel report grezzo e non mascherate.

Conteggi grezzi `requestfailed` nelle esecuzioni usate: C 40, D 58, E 19, F 42. Sono prevalentemente tile Mapbox ORB e richieste annullate durante cambi di stato; gli status HTTP significativi sono riportati sopra.

Errori pagina: 0 in C, D, E e F. Console warning/error: C 12, D 10, E 11, F 7; principalmente Mapbox 403/ORB, layer civici non disponibile, retry/abort Overpass e diagnostica di navigazione.

## Evidenze

La directory `artifacts/step2-online-cf-2026-07-19` contiene:

- screenshot di ogni checkpoint 1/3/5 km e dei round-trip C/D/F;
- screenshot E al momento dell’interruzione;
- `online-verification-cf-first-run.json`;
- `online-verification-cf-second-run.json` con C PASS e l’evidenza completa E;
- `online-verification-cf.json` con l’esecuzione conclusiva D PASS.

## Raccomandazione

Non procedere al merge su main: lo scenario E conferma una regressione applicativa di canonicalizzazione nel bootstrap H2H proveniente dallo Step 1. Correggere soltanto previa nuova autorizzazione e poi rieseguire E, incluso il round-trip. C, D e F non richiedono modifiche applicative.

In questa verifica non è stato modificato codice applicativo, non è stato iniziato P2 e non è stato eseguito alcun merge.
