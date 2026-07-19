# Step 2 — verifica browser offline del contratto territoriale

Data: 19 luglio 2026

## Ambito

La verifica usa esclusivamente fixture e infrastruttura browser offline. Non richiede modifiche alla logica applicativa, al Truth Model, al View Model, al GIS, alle API, al database o agli Step 1, 3 e 4.

Comando eseguito:

```powershell
node tests/browser_step2_offline_contract.cjs
```

Esito finale: `PASS` (exit code 0).

## Matrice eseguita

| Scenario | Esito | Evidenza canonica |
| --- | --- | --- |
| D2D Varedo | PASS | territorio `Varedo · comune completo`; famiglie 6.176; fabbisogno base 6.176; margine 618 (10%); consigliati 6.794; copertura 100%; quantità corrente 10.000 |
| H2H | PASS | 1 punto operativo selezionato; fabbisogno 800; quantità corrente 10.000; mobilità disponibile; fixture Overpass e TPL utilizzate |
| Business Bergamo | PASS | territorio `Bergamo · comune completo`; 1 attività selezionata; materiali richiesti 1; competitor `null`; nessun NIL |
| Step 2 → Step 3 | PASS | navigazione a `/calendario` con servizio, comune e quantità preservati |
| Step 3 → Step 2 | PASS | ritorno a `/zona` completato |
| Persistenza | PASS | quantità corrente, fabbisogno consigliato, copertura e decisione utente invariati dopo il ritorno |

## Copertura dell'infrastruttura offline

La suite ha intercettato senza traffico residuo non gestito:

- `analysis-istat`: 5 richieste;
- `analysis-poi-search`: 2 richieste;
- Overpass: 3 richieste;
- trasporto TPL/RPC: 2 richieste;
- geocoding Mapbox: 4 richieste;
- Nominatim: 7 richieste;
- demografia: 4 richieste;
- richieste non intercettate: 0;
- errori pagina: 0.

## Arresti incontrati durante il riallineamento

Gli arresti intermedi non hanno evidenziato difetti applicativi:

1. Suggerimento del comune cercato con struttura DOM e testo non correnti — **infrastruttura**.
2. Selezione POI H2H verificata prima del completamento del debounce — **infrastruttura**.
3. Fixture H2H inizialmente pilotata con un target non compatibile con i POI forniti — **fixture**.
4. Selettore Business generico e successivo toggle duplicato del target Retail — **infrastruttura**.

Classificazione finale dei difetti applicativi osservati: **nessuno**.
