begin;

-- GPS-4H: allow authenticated users to reach the existing campaigns RLS
-- policies when public.current_user_owns_campaign(uuid) checks campaign
-- ownership for GPS read policies.
--
-- The function intentionally remains SECURITY INVOKER. This migration does
-- not change GPS policies, legacy ownership mapping, schema, RPCs, or anon
-- access.

grant select on table public.campaigns to authenticated;

commit;
