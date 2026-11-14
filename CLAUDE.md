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
