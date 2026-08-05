create or replace function public.gps_get_operator_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'campaign_name', c.campaign_name,
    'service_type', c.service_type,
    'distribution_mode', c.distribution_mode,
    'status', c.status,
    'address_input', c.address_input,
    'address', c.address,
    'zone_name', c.zone_name,
    'city', c.city,
    'distribution_start_date', c.distribution_start_date,
    'distribution_end_date', c.distribution_end_date,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'campaign_zones', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', z.id,
            'zone_name', z.zone_name,
            'status', z.status,
            'quantity_assigned', z.quantity_assigned,
            'priority', z.priority,
            'center_lat', z.center_lat,
            'center_lng', z.center_lng,
            'radius_km', case when z.radius_m is not null then z.radius_m::numeric / 1000 else null end,
            'geometry_geojson', z.polygon_geojson
          )
          order by coalesce(z.priority, 999), z.zone_name
        )
        from public.campaign_zones z
        where z.campaign_id = c.id
          and z.group_id = a.group_id
      ),
      '[]'::jsonb
    )
  ) into v_result
  from public.campaigns c
  join public.operator_assignments a on a.campaign_id = c.id
  where c.id = p_campaign_id
    and a.operator_id = v_uid
    and public.gps_assignment_is_valid(
      a.id, a.operator_id, a.campaign_id, a.group_id, now()
    )
  limit 1;

  if v_result is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  return v_result;
end;
$function$;