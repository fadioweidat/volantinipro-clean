# Email Templates — VolantiniPro

## Magic Link (Accesso Dashboard)

Il file `supabase/email-templates/magic-link.html` contiene il template
HTML brandizzato per l'email di accesso magic link.

### Come aggiornare su Supabase

1. Vai su **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Seleziona **"Magic Link"**
3. Copia il contenuto di `supabase/email-templates/magic-link.html`
4. Incollalo nel campo **"Body"**
5. Imposta **Subject:** `Accedi alla tua dashboard VolantiniPro`
6. Clicca **Save**

### Variabili disponibili nel template

| Variabile | Descrizione |
|-----------|-------------|
| `{{ .ConfirmationURL }}` | URL del magic link (generato da Supabase) |
| `{{ .Email }}` | Email del destinatario |
| `{{ .SiteURL }}` | URL del sito configurato in Supabase |

### Sender settings (Supabase → Auth → SMTP)

- **From name:** `VolantiniPro`
- **From email:** `noreply@volantinipro.it`
- **Reply-to:** `info@volantinipro.it`
