[CmdletBinding()]
param(
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 54361,
  [string]$DbName = "postgres",
  [string]$DbUser = "postgres",
  [string]$DbContainer = "supabase_db_volantinipro-gps-zone-progress-predeploy",
  [string]$CycleLabel = "unspecified"
)

$ErrorActionPreference = "Stop"
$expectedContainer = "supabase_db_volantinipro-gps-zone-progress-predeploy"

if ($DbHost -notin @("127.0.0.1", "localhost")) {
  throw "Remote database hosts are forbidden: $DbHost"
}
if ($DbPort -ne 54361) {
  throw "Unexpected database port: $DbPort"
}
if ($DbName -ne "postgres" -or $DbUser -ne "postgres") {
  throw "Unexpected local database identity"
}
if ($DbContainer -ne $expectedContainer) {
  throw "Unexpected Docker container: $DbContainer"
}

$running = & docker inspect --format "{{.State.Running}}" $DbContainer 2>$null
if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne "true") {
  throw "Local database container is not running: $DbContainer"
}

$publishedPort = & docker port $DbContainer "5432/tcp" 2>$null
if ($LASTEXITCODE -ne 0 -or ($publishedPort -notmatch ":54361$")) {
  throw "Container does not publish PostgreSQL on local port 54361"
}
if (-not (Test-NetConnection -ComputerName $DbHost -Port $DbPort -InformationLevel Quiet)) {
  throw "PostgreSQL is not reachable through $DbHost`:$DbPort"
}

$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-LocalSqlFile {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$Path
  )

  Write-Host "==> $Name"
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing test input: $Path"
  }

  Get-Content -Raw -LiteralPath $Path |
    & docker exec -i $DbContainer psql -X -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -f -

  if ($LASTEXITCODE -ne 0) {
    throw "Stage failed: $Name (exit $LASTEXITCODE)"
  }
}

function Invoke-LocalSqlText {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [string]$Sql
  )

  Write-Host "==> $Name"
  $Sql |
    & docker exec -i $DbContainer psql -X -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -f -

  if ($LASTEXITCODE -ne 0) {
    throw "Stage failed: $Name (exit $LASTEXITCODE)"
  }
}

$stages = @(
  @{ Name = "fixture"; Path = Join-Path $repoRoot "tests\fixtures\gps_prod_zone_progress_baseline.sql" },
  @{ Name = "original migration"; Path = Join-Path $repoRoot "supabase\migrations\202607230001_campaign_zone_progress.sql" },
  @{ Name = "forward-only correction"; Path = Join-Path $repoRoot "supabase\migrations\20260724101527_campaign_zone_progress_predeploy_fixes.sql" },
  @{ Name = "original schema contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_schema_contract.sql" },
  @{ Name = "predeploy schema contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_predeploy_schema_contract.sql" },
  @{ Name = "original RPC contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_rpc_contract.sql" },
  @{ Name = "predeploy RPC contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_predeploy_rpc_contract.sql" },
  @{ Name = "behavior contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_behavior_contract.sql" }
)

foreach ($stage in $stages) {
  Invoke-LocalSqlFile -Name $stage.Name -Path $stage.Path
}

Invoke-LocalSqlText -Name "concurrency cleanup" -Sql @'
delete from public.campaign_zone_progress_history
where campaign_zone_id_snapshot = '40000000-0000-0000-0000-00000000000a';
delete from public.campaign_zone_progress
where campaign_zone_id = '40000000-0000-0000-0000-00000000000a';
'@

$sessionA = @'
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '20s';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}',
  true
);
select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000a',
  41,
  'Concurrency first'
);
select pg_sleep(2);
commit;
'@

$sessionB = @'
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '20s';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-00000000000c","role":"authenticated"}',
  true
);
select public.admin_set_zone_manual_progress(
  '40000000-0000-0000-0000-00000000000a',
  73,
  'Concurrency second'
);
commit;
'@

Write-Host "==> concurrency contract (two PostgreSQL sessions)"
$sessionScript = {
  param($Sql, $Container, $User, $Database)

  $Sql |
    & docker exec -i $Container psql -X -v ON_ERROR_STOP=1 -U $User -d $Database -f -

  if ($LASTEXITCODE -ne 0) {
    throw "Concurrent psql session failed with exit code $LASTEXITCODE"
  }
}

$jobA = Start-Job -ScriptBlock $sessionScript `
  -ArgumentList $sessionA, $DbContainer, $DbUser, $DbName
Start-Sleep -Milliseconds 500
$jobB = Start-Job -ScriptBlock $sessionScript `
  -ArgumentList $sessionB, $DbContainer, $DbUser, $DbName

Wait-Job -Job $jobA, $jobB | Out-Null
Receive-Job -Job $jobA
Receive-Job -Job $jobB

if ($jobA.State -ne 'Completed' -or $jobB.State -ne 'Completed') {
  $states = "A=$($jobA.State), B=$($jobB.State)"
  Remove-Job -Job $jobA, $jobB
  throw "Concurrent sessions failed: $states"
}

Remove-Job -Job $jobA, $jobB

Invoke-LocalSqlText -Name "concurrency assertions" -Sql @'
do $$
begin
  if (select count(*) from public.campaign_zone_progress
      where campaign_zone_id = '40000000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'CONCURRENCY_FAILED: expected exactly one progress row';
  end if;
  if (select manual_percent from public.campaign_zone_progress
      where campaign_zone_id = '40000000-0000-0000-0000-00000000000a') <> 73 then
    raise exception 'CONCURRENCY_FAILED: second transaction must be final state';
  end if;
  if not exists (
    select 1
    from public.campaign_zone_progress_history
    where reason = 'Concurrency first'
      and old_manual_percent is null
      and new_manual_percent = 41
  ) then
    raise exception 'CONCURRENCY_FAILED: first history state is incorrect';
  end if;
  if not exists (
    select 1
    from public.campaign_zone_progress_history
    where reason = 'Concurrency second'
      and old_manual_percent = 41
      and new_manual_percent = 73
  ) then
    raise exception 'CONCURRENCY_FAILED: second history did not observe first new state';
  end if;
  if (select count(*) from public.campaign_zone_progress_history
      where reason in ('Concurrency first', 'Concurrency second')) <> 2 then
    raise exception 'CONCURRENCY_FAILED: expected exactly two serialized history rows';
  end if;
end $$;
select 'GPS zone progress concurrency contract: 5 passed, 0 failed';
'@

Invoke-LocalSqlFile `
  -Name "retention contract" `
  -Path (Join-Path $repoRoot "tests\gps_prod_zone_progress_retention_contract.sql")

Write-Host "GPS-PROD-6M cycle '$CycleLabel' completed successfully against $DbHost`:$DbPort/$DbName."
