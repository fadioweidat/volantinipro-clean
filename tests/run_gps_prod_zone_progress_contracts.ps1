[CmdletBinding()]
param(
  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 54341,
  [string]$DbName = "postgres",
  [string]$DbUser = "postgres",
  [string]$DbContainer = "supabase_db_volantinipro-gps-zone-progress-design"
)

$ErrorActionPreference = "Stop"
$expectedContainer = "supabase_db_volantinipro-gps-zone-progress-design"

if ($DbHost -notin @("127.0.0.1", "localhost")) {
  throw "Remote database hosts are forbidden: $DbHost"
}
if ($DbPort -ne 54341) {
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
if ($LASTEXITCODE -ne 0 -or ($publishedPort -notmatch ":54341$")) {
  throw "Container does not publish PostgreSQL on local port 54341"
}
if (-not (Test-NetConnection -ComputerName $DbHost -Port $DbPort -InformationLevel Quiet)) {
  throw "PostgreSQL is not reachable through $DbHost`:$DbPort"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$stages = @(
  @{ Name = "fixture"; Path = Join-Path $repoRoot "tests\fixtures\gps_prod_zone_progress_baseline.sql" },
  @{ Name = "migration"; Path = Join-Path $repoRoot "supabase\migrations\202607230001_campaign_zone_progress.sql" },
  @{ Name = "schema contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_schema_contract.sql" },
  @{ Name = "RPC contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_rpc_contract.sql" },
  @{ Name = "behavior contract"; Path = Join-Path $repoRoot "tests\gps_prod_zone_progress_behavior_contract.sql" }
)

foreach ($stage in $stages) {
  Write-Host "==> $($stage.Name)"
  if (-not (Test-Path -LiteralPath $stage.Path)) {
    throw "Missing test input: $($stage.Path)"
  }

  Get-Content -Raw -LiteralPath $stage.Path |
    & docker exec -i $DbContainer psql -X -v ON_ERROR_STOP=1 -U $DbUser -d $DbName -f -

  if ($LASTEXITCODE -ne 0) {
    throw "Stage failed: $($stage.Name) (exit $LASTEXITCODE)"
  }
}

Write-Host "GPS zone progress contracts completed successfully against $DbHost`:$DbPort/$DbName."
