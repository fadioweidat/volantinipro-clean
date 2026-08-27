-- Modifica del numero di telefono di un operatore dalla schermata Admin
-- "Assegna lavoro" (Step 1).
--
-- Dove vive davvero il telefono dell'operatore:
--   operator_profiles NON ha una colonna phone (verificato: user_id,
--   display_name, active, disabled_at, created_at, updated_at).
--   Il telefono e' su public.profiles.phone (text, NULLABLE), collegato via
--   operator_profiles.user_id = profiles.id — la stessa fonte gia' usata dal
--   join dentro admin_list_operators().
--
-- Perche' serve una RPC e non un update diretto:
--   l'unica policy di UPDATE su profiles e' profiles_own_update
--   (auth.uid() = id) — un authenticated non puo' toccare la riga profiles
--   di un ALTRO utente. Serve quindi una funzione SECURITY DEFINER con guard
--   admin, stesso identico pattern di admin_list_operators /
--   admin_update_operator_assignment (jwt_is_admin(), search_path esplicito,
--   EXECUTE solo authenticated + service_role, mai anon).
--
-- Rimozione numero: p_phone NULL o stringa vuota/whitespace -> phone = NULL
-- (consentito perche' profiles.phone e' nullable).
--
-- Nessun impatto su Driver Flow / access_token / GPS / ruoli: si aggiorna
-- solo profiles.phone (+ updated_at). Il trigger
-- protect_profile_authorization_fields blocca solo i cambi di `role`.

CREATE OR REPLACE FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text")
    RETURNS TABLE("id" "uuid", "display_name" "text", "phone" "text", "status" "text", "active" boolean, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_norm text;
  v_digits text;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_operator_id is null then
    raise exception 'operator_id obbligatorio.' using errcode = '22023';
  end if;

  -- Normalizza: trim + collassa spazi interni. Vuoto -> NULL (rimozione).
  v_norm := nullif(btrim(regexp_replace(coalesce(p_phone, ''), '\s+', ' ', 'g')), '');

  if v_norm is not null then
    -- Solo caratteri telefonici (+, cifre, spazi, - . ( )) e almeno 8 cifre.
    v_digits := regexp_replace(v_norm, '[^0-9]', '', 'g');
    if v_norm !~ '^[+]?[0-9 ().\-]{7,}$' or v_digits !~ '^[0-9]{8,15}$' then
      raise exception 'Numero di telefono non valido.' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from public.operator_profiles op
    join public.profiles p on p.id = op.user_id
    where op.user_id = p_operator_id
  ) then
    raise exception 'Operatore non trovato (id: %).', p_operator_id
      using errcode = '02000';
  end if;

  update public.profiles
     set phone = v_norm,
         updated_at = now()
   where profiles.id = p_operator_id;

  return query
    select
      op.user_id as id,
      op.display_name,
      p.phone,
      case when op.active and op.disabled_at is null then 'active' else 'inactive' end as status,
      op.active,
      op.created_at
    from public.operator_profiles op
    left join public.profiles p on p.id = op.user_id
    where op.user_id = p_operator_id;
end;
$$;

ALTER FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_set_operator_phone"("p_operator_id" "uuid", "p_phone" "text") TO "service_role";
