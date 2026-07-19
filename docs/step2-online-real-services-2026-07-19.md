# Step 2 — verifica online con servizi reali

Data: 19 luglio 2026  
Esito complessivo: **interrotta dopo bug applicativo confermato**, come richiesto.

## 1. Ambiente utilizzato

- applicazione locale Vite: `http://127.0.0.1:5173`;
- browser: Google Chrome headless tramite Playwright 1.61.1;
- rete: accesso diretto ai servizi esterni, senza fixture o sostituzioni;
- Supabase: progetto `mqkelrsvksrzrpmbstvd.supabase.co`;
- Overpass configurato: `overpass-api.de`;
- analisi remota: abilitata;
- credenziali registrate nel rapporto soltanto come presenti/assenti; token e chiavi sono redatti.

## 2–3. Servizi raggiungibili e non raggiungibili

| Servizio | Esito | Evidenza |
| --- | --- | --- |
| Supabase Functions `analysis-istat` | Raggiungibile | HTTP 200 per Varedo e Milano/Milan; 0,6–0,8 s nelle richieste finali |
| Supabase RPC `get_map_sectors` | Raggiungibile | HTTP 200 |
| Supabase `demographic_indicators` | Raggiungibile | HTTP 200; Varedo interrogato con codice `108045`, Milano con `015146` |
| Nominatim ricerca e confine | Raggiungibile | HTTP 200; Varedo e Milano geocodificati, geometrie restituite |
| Overpass | Parziale | HTTP 200 nello Scenario A; HTTP 504 Gateway Timeout nello Scenario B |
| Mapbox geocoding | Non raggiungibile con la credenziale corrente | HTTP 403 Forbidden |
| Mapbox tiles | Non utilizzabili con la credenziale corrente | richieste fallite/ORB associate alle risposte Mapbox non autorizzate |
| NIL Milano | Non verificabile nel client | backend chiamato con `municipality=Milan`, `analysisLevel=comune`; zero `nil_breakdown` |
| TPL/mobilità | Non verificato | scenario H2H non avviato dopo lo stop obbligatorio |
| POI H2H/Business | Non verificato | scenari E/F non avviati; solo chiamata Overpass D2D osservata |

## 4–6. Scenari

| Scenario | Stato | Risultato |
| --- | --- | --- |
| A — D2D Varedo | PASS | confine presente; 6.176 famiglie; fabbisogno base 6.176; consigliati 6.794; copertura 100%; report aperto; Step 3 e ritorno completati; persistenza completa |
| B — D2D Milano e NIL | FAIL | Nominatim restituisce il comune reale alle coordinate `45.4641943, 9.1896346`, ma il client conserva `Milan`; richiesta territoriale inviata con `municipality=Milan`; NIL disponibili 0 |
| C — indirizzo e raggio | BLOCKED | non avviato dopo bug applicativo confermato |
| D — multi-comune | BLOCKED | non avviato dopo bug applicativo confermato |
| E — Hand to Hand | BLOCKED | non avviato dopo bug applicativo confermato |
| F — Business Bergamo | BLOCKED | non avviato dopo bug applicativo confermato |

## 7. Screenshot

Scenario A:

- `A-d2d-varedo-step2.png`;
- `A-d2d-varedo-territorial-report.png`;
- `A-d2d-varedo-step3.png`;
- `A-d2d-varedo-returned-step2.png`.

Lo Scenario B è stato interrotto al controllo NIL prima del checkpoint screenshot. Lo stato completo e le risposte reali sono conservati nel JSON di evidenza.

## 8. Richieste di rete

Il dettaglio completo, comprensivo di URL redatti, metodo, status HTTP, durata, dati JSON restituiti, richieste fallite e timestamp, è in `artifacts/step2-online-2026-07-19/online-verification.json`.

Richieste determinanti:

- Varedo: `analysis-istat?...municipality=Varedo...` → HTTP 200;
- Milano tramite fallback: Nominatim `search?q=Milano...` → HTTP 200;
- chiamata successiva: `analysis-istat?...municipality=Milan&analysisLevel=comune...` → HTTP 200, `nil_breakdown=[]`;
- Mapbox geocoding Varedo/Milano → HTTP 403;
- Overpass Scenario B → HTTP 504.

## 9. Errori console e pagina

- errori pagina JavaScript: 0 in entrambi gli scenari;
- Mapbox: `Failed to load resource` HTTP 403;
- Overpass nello Scenario B: `Failed to load resource` HTTP 504;
- warning gestito: `ADDRESS_POINTS_LAYER_UNAVAILABLE`;
- warning informativo al ritorno: `STEP3_NAV_BACK_TO_STEP2_REASON`.

## 10–11. Payload e persistenza

Scenario A, payload Step 2 → Step 3:

- territorio: `Varedo · comune completo`;
- servizio: `d2d`;
- quantità corrente: 10.000;
- fabbisogno consigliato: 6.794;
- copertura: 100%;
- selezioni utente conservate.

Persistenza dopo il ritorno a Step 2: territorio, quantità corrente, consigliato, copertura e `userSelections` tutti invariati.

Scenario B: payload territoriale ricevuto con dati comunali e codice Milano `015146`, ma senza NIL perché il nome operativo è rimasto `Milan` e l'analisi è stata richiesta a livello `comune`.

## 12. Bug applicativo confermato

**Canonicalizzazione mancante del comune Milano nel fallback Nominatim.**

Sequenza riproducibile:

1. Mapbox risponde 403.
2. Nominatim risponde 200 per il comune corretto, nome localizzato `Milan`, coordinate `45.4641943, 9.1896346`.
3. Step 2 conserva `Milan` e mostra `Milan · comune completo`.
4. `analysis-istat` viene invocato con `municipality=Milan`, `analysisLevel=comune`, `selectionScope=municipality`.
5. La funzione risponde 200 con dati del comune/codice `015146`, ma `nil_breakdown=[]`.
6. Stato Step 2: `apiNilCount=0`, `apiNilWithGeometryCount=0`, `availableNils=[]`.

Classificazione: **applicazione**, innescata dal fallback reso necessario dalla credenziale Mapbox non valida. Nessuna correzione applicata.

## 13. Problemi esterni

- **credenziali/API key:** Mapbox HTTP 403;
- **timeout servizio esterno:** Overpass HTTP 504 nello Scenario B;
- **dato assente ma gestito:** layer civici non disponibile, segnalato con warning senza page error;
- nessuna evidenza di CORS o rate limit 429.

## 14. Limiti della verifica

- scenari C–F non eseguiti per lo stop obbligatorio dopo il bug applicativo;
- tooltip NIL, selezione NIL, raggi multipli, multi-comune, H2H, TPL e Business non possono ricevere un esito PASS;
- Mapbox non è validabile finché il token configurato restituisce 403;
- Overpass ha mostrato disponibilità intermittente (200 e 504).

## 15. Raccomandazione finale

Non iniziare P2 e non dichiarare completata la verifica online. Serve una nuova autorizzazione per correggere la canonicalizzazione `Milan` → `Milano` nel percorso di fallback Nominatim. Separatamente, occorre sostituire o riabilitare la credenziale Mapbox. Dopo questi interventi va rieseguita l'intera matrice A–F.
