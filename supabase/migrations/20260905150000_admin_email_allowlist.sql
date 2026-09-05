-- TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com.
--
-- Restringe l'accesso Admin (RPC + RLS) alla SOLA email autorizzata,
-- rafforzando le due funzioni centrali gia' usate ovunque nel progetto
-- (jwt_is_admin() e gps_is_admin(), decine di call site in RPC/RLS —
-- vedi 20260821211000_remote_baseline.sql) invece di duplicare il
-- controllo in ogni singolo posto: "una sola source of truth", come
-- richiesto dal ticket.
--
-- is_authorized_admin_email() e' la NUOVA singola fonte di verita' per
-- l'email: entrambe le funzioni la richiamano. Case-insensitive (trim +
-- lower), letta dal claim 'email' del JWT (stesso posto da cui
-- jwt_is_admin() gia' legge 'role'/'app_role' — nessun nuovo meccanismo).
-- service_role resta un bypass legittimo (chiamate server-side/Edge
-- Function con la service key, mai dal browser, gia' cosi' prima di
-- questo fix): un conto tecnico interno non ha un'email utente da
-- verificare, e negarlo romperebbe le Edge Function esistenti.
--
-- Effetto collaterale INTENZIONALE (richiesto esplicitamente dal ticket):
-- qualunque altro account con profiles.role='admin' ma email diversa da
-- fenice.sp@gmail.com perde l'accesso Admin. Non e' un bug.
--
-- Nessuna modifica a: GPS tracking, coverage, Driver App/token flow,
-- messaging, segnalazioni, pricing, Payments, Marketplace, SEO, Step1-4.

begin;

create or replace function public.is_authorized_admin_email()
returns boolean
  language sql stable
as $$
  select lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) = 'fenice.sp@gmail.com';
$$;

create or replace function public.jwt_is_admin()
returns boolean
  language sql stable
as $$
  select coalesce(auth.role() = 'service_role', false)
    or (
      (
        coalesce(auth.jwt() ->> 'role', '') in ('admin', 'super_admin')
        or coalesce(auth.jwt() ->> 'app_role', '') in ('admin', 'super_admin')
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
      and public.is_authorized_admin_email()
    );
$$;

create or replace function public.gps_is_admin()
returns boolean
  language sql stable security definer
  set search_path to ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'admin'
      )
      and public.is_authorized_admin_email()
    );
$$;

commit;
