-- TICKET — APPROVAZIONE FOTO PROOF ADMIN -> CLIENTE.
--
-- Le foto prova del Driver arrivano correttamente (campaign/driver/session/
-- assignment corretti, oggetto storage presente) ma restano `pending` per
-- sempre: non esiste alcun percorso di approvazione (nessun pulsante, nessuna
-- RPC, `authenticated` non ha UPDATE su proof_photos, nessuna policy UPDATE).
-- Risultato: il Cliente (che vede solo `approved_at IS NOT NULL`, sia via
-- filtro applicativo sia via RLS) e il report vedono 0 foto.
--
-- Fix additivo:
--   - colonna proof_photos.approved_by (audit; nullable, nessuna FK per non
--     dipendere da grant su auth.users dentro SECURITY DEFINER);
--   - RPC approve_proof_photo(p_photo_id uuid) SECURITY DEFINER: unico modo
--     per valorizzare approved_at. Autorizzazione con gli stessi guard
--     centrali gia' usati ovunque: service_role (Edge/server) OPPURE
--     (gps_is_admin() AND is_authorized_admin_email()). Nessun accesso per
--     authenticated generico, Driver (anon+token) o Cliente.
--   - Idempotente: se gia' approvata ritorna la riga esistente, nessun errore.
--
-- NON tocca: Driver upload pipeline / getUserMedia, gps_register_proof_photo,
-- driver_register_proof_photo, le policy INSERT/SELECT esistenti di
-- proof_photos e storage.objects, il filtro Cliente (`approvedOnly`), GPS
-- tracking, coverage, NIL map, messaging, pricing, Payments, Admin Magic Link.

begin;

alter table public.proof_photos
  add column if not exists approved_by uuid;

comment on column public.proof_photos.approved_by is
  'auth.uid() dell''Admin che ha approvato la foto via approve_proof_photo (null per approvazioni service_role).';

create or replace function public.approve_proof_photo(p_photo_id uuid)
returns public.proof_photos
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_photo public.proof_photos%rowtype;
begin
  if p_photo_id is null then
    raise exception 'FOTO_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- Autorizzazione: stessi guard centrali del progetto. service_role resta un
  -- bypass legittimo (chiamate server-side/Edge, mai dal browser); ogni altro
  -- caso richiede Admin reale sull'unica email autorizzata.
  if not (
    coalesce(auth.role() = 'service_role', false)
    or (public.gps_is_admin() and public.is_authorized_admin_email())
  ) then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  select * into v_photo from public.proof_photos where id = p_photo_id;
  if not found then
    raise exception 'FOTO_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- Idempotenza: gia' approvata -> ritorna lo stato esistente, nessun errore,
  -- nessuna riscrittura di approved_at/approved_by.
  if v_photo.approved_at is not null then
    return v_photo;
  end if;

  update public.proof_photos
     set approved_at = now(),
         approved_by = auth.uid()
   where id = p_photo_id
   returning * into v_photo;

  return v_photo;
end;
$function$;

revoke all on function public.approve_proof_photo(uuid) from public;
grant execute on function public.approve_proof_photo(uuid) to authenticated, service_role;

commit;
