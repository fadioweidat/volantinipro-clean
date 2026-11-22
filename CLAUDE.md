# VolantiniPro — regola permanente Preview QA

## Branch permanente `preview-qa`

- `preview-qa` è **solo per collaudo**: non è un branch di produzione, non deve essere configurato come Production Branch di Vercel e non deve essere promosso o pubblicato direttamente in produzione.
- La sua origine è la linea stabile `release/prod-stable-20261105`. In questa prima preparazione vi confluiscono le correzioni già verificate di `fix/multipv-unique-families-pricing-20261114`.
- Gli sviluppi successivi si eseguono su branch dedicati. Solo dopo verifica e approvazione si integrano in `preview-qa` per test end-to-end.
- **Usare e condividere sempre l'URL di branch stabile Vercel** (`volantinipro-git-preview-qa-<scope>.vercel.app`), non il dominio unico associato a un singolo deploy. Verificare il dominio reale di Vercel prima di configurare Mapbox.
- Autorizzare su Mapbox **solo** l'URL fisso di `preview-qa` per il token usato in Preview. Non allargare indiscriminatamente le restrizioni a `*.vercel.app`; non modificare i permessi del token di produzione senza autorizzazione.
- Nessun merge in produzione, promozione Vercel, modifica al database o migrazione senza l'**OK esplicito di Fadi**. Una Preview riuscita non costituisce autorizzazione alla pubblicazione.
- Per il collaudo commerciale verificare sempre il flusso Step 1 → 2 → 3 → 4, le famiglie uniche multi-PV, i prezzi e il PDF. Non dichiarare PASS senza prova runtime dello scenario richiesto.

Questa regola si applica a tutte le sessioni e a tutti gli agenti che operano nel repository. Le altre istruzioni di `AGENTS.md` e le regole di sicurezza restano valide.

## Collaudi e carico sul database (regola 6, aggiornata 2026-11-22)

- `preview-qa` usa un **database Supabase di prova separato** (`volantinipro-qa`, ref `lmcdmsnmatbgouybxonm`), tramite le variabili Vercel `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` limitate al branch `preview-qa`. Su `preview-qa` i **collaudi pesanti sono permessi** (Step 2 ripetuti, Milano intera, più punti vendita, cambi servizio, suite nel browser).
- Su **www (produzione, ref `mqkelrsvksrzrpmbstvd`) solo controlli leggeri**: uno scenario alla volta, distanziati, niente Milano intera ripetuta, niente cicli di carico. Avvisare Fadi prima di qualunque controllo che richieda molte analisi.
- Prima di un collaudo pesante verificare che il codice di `preview-qa` punti al progetto di prova e non a quello di produzione. Se le due variabili del branch vengono tolte (rollback), anche su `preview-qa` valgono di nuovo solo controlli leggeri.
- Lo sviluppo locale (`.env.local`) punta ancora alla produzione: i collaudi pesanti in locale contano come carico sulla produzione.

## Allineamento di `integration/rc2-full-site` alla produzione

- Preparare sempre la riconciliazione su un **branch dedicato creato da `integration/rc2-full-site`** e integrare `release/prod-stable-20261105` in quel branch.
- In qualsiasi conflitto, la logica **già pubblicata in produzione** ha precedenza assoluta per prezzi multi-PV e multi-comune, famiglie uniche, conteggi di comuni e NIL, dato Milano **741.887 famiglie** e geocodifica dei numeri civici. Conservare le modifiche di integration soltanto quando non alterano tali contratti.
- Documentare per ogni conflitto la scelta e la motivazione; eseguire suite completa e collaudi reali prima di proporre il merge.
- **Non aggiornare, fondere o pubblicare `integration/rc2-full-site` senza l'OK esplicito di Fadi.** Il branch di riconciliazione resta separato fino all'approvazione.
