-- Allow an authenticated customer to create only their own profile.
-- saveCampaign upserts public.profiles before inserting public.campaigns.
drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);
