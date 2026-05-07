# Sets Vercel DATABASE_URL to a PostgreSQL URI (required for prisma db push on deploy).
# Neon: Dashboard -> your project -> Connection string -> URI (postgresql://...&sslmode=require)
#
# Usage (pick one):
#   .\scripts\set-vercel-database-url.ps1 -DatabaseUrl 'postgresql://USER:PASS@HOST/DB?sslmode=require'
#   Put the URI alone on the first line of .env.db.deploy (gitignored), then:
#   .\scripts\set-vercel-database-url.ps1 -FromFile .env.db.deploy

param(
  [string] $DatabaseUrl = "",
  [string] $FromFile = ""
)

# Vercel CLI writes normal progress to stderr. PowerShell 7+ can treat that as a terminating error.
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}
catch {}

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Invoke-VercelCli {
  param([Parameter(Mandatory)][string[]] $Argv)
  # Do not pipe: native exit codes are lost inside pipelines.
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & npx.cmd --yes vercel @Argv
  }
  finally {
    $ErrorActionPreference = $oldEap
  }
}

if ($FromFile) {
  if (-not (Test-Path $FromFile)) { throw "File not found: $FromFile" }
  $raw = (Get-Content -LiteralPath $FromFile -Raw).Trim()
  if ($raw -match '^DATABASE_URL\s*=\s*(.+)$') { $DatabaseUrl = $matches[1].Trim().Trim('"').Trim("'") }
  else { $DatabaseUrl = $raw.Trim().Trim('"').Trim("'") }
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "Provide -DatabaseUrl 'postgresql://...' or -FromFile path (one line URI or DATABASE_URL=`"...`")."
}

if ($DatabaseUrl -notmatch '^(postgres(ql)?)://') {
  throw "DATABASE_URL must start with postgresql:// or postgres:// (got: $($DatabaseUrl.Substring(0, [Math]::Min(24, $DatabaseUrl.Length)))...)"
}

Write-Host "Updating Vercel DATABASE_URL for production + preview..."
Invoke-VercelCli -Argv @(
  "env", "update", "DATABASE_URL", "production",
  "--value", $DatabaseUrl,
  "--yes",
  "--sensitive"
)
if ($LASTEXITCODE -ne 0) { throw "vercel env update production failed (exit $LASTEXITCODE)" }

Invoke-VercelCli -Argv @(
  "env", "add", "DATABASE_URL", "preview",
  "--value", $DatabaseUrl,
  "--yes",
  "--sensitive"
)
if ($LASTEXITCODE -ne 0) {
  Write-Host "Preview: add returned $LASTEXITCODE; trying update..."
  Invoke-VercelCli -Argv @(
    "env", "update", "DATABASE_URL", "preview",
    "--value", $DatabaseUrl,
    "--yes",
    "--sensitive"
  )
  if ($LASTEXITCODE -ne 0) { throw "vercel env preview failed (exit $LASTEXITCODE)" }
}

Write-Host "Done. Trigger a redeploy: npx vercel --prod"
