# Step 2 P2-A safe fixes

## Contratto browser offline portabile

Eseguire il server Vite e poi:

```sh
npm run test:browser:offline
```

Lo script risolve prima `playwright` dalle dipendenze del progetto. Se Playwright è fornito da un runtime esterno, impostare `PLAYWRIGHT_MODULE_PATH` alla directory `node_modules` che lo contiene. Non è presente alcun percorso utente codificato nel test.

Variabili opzionali:

- `STEP2_OFFLINE_BASE_URL`: URL del server, default `http://localhost:5173/`;
- `PLAYWRIGHT_MODULE_PATH`: directory di risoluzione alternativa per Playwright;
- `STEP2_BROWSER_EXECUTABLE`: browser di sistema esplicitamente scelto. Se assente, Playwright usa il proprio browser installato.

## Stati POI e TPL

Gli errori sono warning non bloccanti con `role="status"` e `aria-live="polite"`. Timeout, rate limit e indisponibilità temporanea sono descritti senza esporre codici tecnici. Una risposta valida vuota continua a usare l'empty state esistente.

Non è stato aggiunto un pulsante di retry: gli hook attuali non espongono una funzione riutilizzabile e duplicare la fetch avrebbe esteso l'architettura oltre il perimetro P2-A.

## Geocoding e route lazy

Comune, CAP, indirizzo e punto operativo usano pulsanti `type="button"` con focus visibile. Il contratto browser verifica Tab, Enter, Space, Escape e assenza di navigazioni da submit. Il fallback delle route lazy espone uno stato di caricamento leggibile e annunciato alle tecnologie assistive.
