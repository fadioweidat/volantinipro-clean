# Fase 2: collaudo su preview-qa (23/11/2026)

- Branch: `fix/step2-pv-fase2-20261123`, creato da integration 2dbf7ab. Commit: e6c37d2, 9391895, 34a76ff, 498b6c2, 2f1202c.
- preview-qa: 5411e15 → **6764f9f**. Ci sono arrivati solo i 5 commit, con cherry-pick e senza force. Non c'è stato nessun merge da integration, quindi niente commit GPS.
- Database: il bundle contiene solo il ref di prova `lmcdmsnmatbgouybxonm`, nessuna traccia di `mqkelrsvksrzrpmbstvd`.
- Suite: 2640 passati, 6 falliti (le 6 falle note). Build ok.
- Telefono: simulato con un riquadro largo 412 px dentro la stessa pagina, perché la finestra di Chrome è massimizzata.

| Gruppo | Esito | Prova |
|---|---|---|
| C1/C2 multi-PV | ✅ | 6 cambi rapidi PV1↔PV2. Ogni PV tiene i suoi valori: PV1 92.169 famiglie / 101.278 consigliati; PV2 114.302 / 125.732. Nessun valore passa all'altro PV. |
| B2 punto manuale su PV nuovo | ✅ | PV2 nuovo, punto toccato a Milano (45.504, 9.178). Risultato: raggio 3 km confermato, 114.302 famiglie, PV1 invariato. |
| D2 "Scegli quartieri" | ✅ | Il PV1 viene salvato come `custom_zone` / `nil`, non come "Comune intero". |
| D1 NIL manuali | ✅ | LORETO - CASORETTO - NOLO scelto a mano è ancora selezionato dopo 18 s (7.133 famiglie). |
| A3 civici | ✅ | "Via Oroboni 10" trova "Via Antonio Oroboni 10" e il risultato è selezionabile. Screenshot: `A3-oroboni.jpg`. |
| G "Italia" a Mapbox | ✅ | La richiesta parte come "Via Oroboni 10, Milano, Italia"; il campo resta "Via Oroboni 10, Milano". |
| A8 civico richiesto | ✅ | Con "Via Zxqwerty 5, Milano" non compaiono "Usa Milano comune completo" né Municipi o comuni; restano "Indirizzo non trovato" e il punto manuale. |
| B3 mappa in vista | ✅ | La tastiera si chiude (focus da INPUT a BODY) e la mappa scorre in cima. Screenshot: `B3-B4-punto-manuale.jpg`. |
| B4 barra compatta | ✅ | La barra dice "Tocca la mappa per scegliere il punto" e "Annulla" è raggiungibile. |
| B5 box contatti | ✅ | Su telefono, nello Step 2, compare "Contatti ×": si apre, si riduce e si nasconde per la sessione. Negli altri step e su desktop il box resta completo. Screenshot: `B5-*`. |
| Step 3-4 con 2 PV | ✅ | 17.846 volantini, €289,69 + €350,48 = €640,17; 7.042 + 115.183 = 122.225 famiglie uniche. |
| PDF | non provato | Il pulsante "Scarica preventivo PDF" c'è, ma il download non è stato fatto. |

## Osservazioni (non introdotte dalla Fase 2)
1. Per un PV nuovo con una ricerca a Milano non trovata, la mappa del punto manuale mostra tutta l'Italia invece di Milano. Bisogna spostarla e ingrandirla a mano.
2. Il punto manuale prende sempre il comune "Milano", anche se si tocca fuori città. Codice già presente in integration.
3. Dopo "Reset zona" il pannello Copertura mostrava ancora "NIL: BRUZZANO" e "Raggio da Via Antonio Oroboni 10", cioè la zona precedente.
4. La barra del punto manuale copre in parte i pulsanti + e − dello zoom.
5. Famiglie del PV2: 114.302 nello Step 2 e 115.183 nello Step 4, perché lo Step 4 usa un metodo di stima diverso (raster), come dice la pagina stessa.
