begin;

drop policy if exists proof_photos_select_policy on public.proof_photos;
drop policy if exists proof_photos_select_authorized on public.proof_photos;
create policy proof_photos_select_authorized
on public.proof_photos for select to authenticated
using (
  public.gps_is_admin()
  or (
    driver_id = auth.uid()
    and exists (
      select 1 from public.delivery_sessions s
      where s.id = proof_photos.session_id
        and s.campaign_id = proof_photos.campaign_id
        and s.driver_id = auth.uid()
    )
  )
  or (
    approved_at is not null
    and exists (
      select 1 from public.campaigns c
      where c.id = proof_photos.campaign_id
        and c.user_id = auth.uid()
    )
  )
);

drop policy if exists proof_photos_insert_driver on public.proof_photos;
drop policy if exists proof_photos_insert_authorized on public.proof_photos;
create policy proof_photos_insert_authorized
on public.proof_photos for insert to authenticated
with check (
  public.gps_is_admin()
  or (
    driver_id = auth.uid()
    and session_id is not null
    and exists (
      select 1 from public.delivery_sessions s
      where s.id = proof_photos.session_id
        and s.campaign_id = proof_photos.campaign_id
        and s.driver_id = auth.uid()
        and s.status in ('started', 'paused', 'completed')
        and s.assignment_id is not null
        and public.gps_assignment_is_valid(
          s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now()
        )
    )
  )
);

drop policy if exists proof_photos_storage_insert_driver on storage.objects;
drop policy if exists proof_photos_storage_insert_authorized on storage.objects;
create policy proof_photos_storage_insert_authorized
on storage.objects for insert to authenticated
with check (
  bucket_id = 'proof-photos'
  and (
    public.gps_is_admin()
    or exists (
      select 1
      from public.delivery_sessions s
      where s.id = case
        when (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[4])::uuid
        else null
      end
        and s.campaign_id = case
          when (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[2])::uuid
          else null
        end
        and (storage.foldername(name))[1] = 'campaign'
        and (storage.foldername(name))[3] = 'session'
        and (storage.foldername(name))[5] = 'photo'
        and s.driver_id = auth.uid()
        and s.status in ('started', 'paused', 'completed')
        and s.assignment_id is not null
        and public.gps_assignment_is_valid(
          s.assignment_id, s.driver_id, s.campaign_id, s.group_id, now()
        )
    )
  )
);

drop policy if exists proof_photos_storage_read_related on storage.objects;
drop policy if exists proof_photos_storage_select_authorized on storage.objects;
create policy proof_photos_storage_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'proof-photos'
  and (
    public.gps_is_admin()
    or exists (
      select 1
      from public.proof_photos p
      where p.storage_path = name
        and (
          p.driver_id = auth.uid()
          or (
            p.approved_at is not null
            and exists (
              select 1 from public.campaigns c
              where c.id = p.campaign_id and c.user_id = auth.uid()
            )
          )
        )
    )
  )
);

commit;
