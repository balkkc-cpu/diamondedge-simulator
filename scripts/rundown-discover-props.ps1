# List proposition markets The Rundown exposes for a sport + date (requires API key).
# Docs: https://docs.therundown.io/authentication — uses header X-TheRundown-Key (not ?key=).
# Usage:
#   $env:RUNDOWN_API_KEY = "your_key"
#   .\scripts\rundown-discover-props.ps1
# Optional: -SportId 3 -DateOverride 2026-05-07

param(
  [string] $ApiKey = $env:RUNDOWN_API_KEY,
  [string] $SportId = "3",
  [string] $DateOverride = "",
  [int] $OffsetMinutes = 300
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-ApiKey([string]$k) {
  if (-not $k) { return $k }
  $k = $k.Trim()
  # Strip UTF-8 BOM if pasted at start
  $k = $k.TrimStart([char]0xFEFF)
  $k
}

function Read-KeyFromEnvFile([string]$fp) {
  if (-not (Test-Path $fp)) { return $null }
  foreach ($line in Get-Content -LiteralPath $fp -Encoding UTF8) {
    foreach ($var in @("RUNDOWN_API_KEY", "THERUNDOWN_API_KEY")) {
      if ($line -match "^\s*$var\s*=\s*(.+)\s*$") {
        $v = $matches[1].Trim()
        if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
          $v = $v.Substring(1, $v.Length - 2)
        }
        $v = Normalize-ApiKey $v
        if ($v.Length -gt 8) { return $v }
      }
    }
  }
  $null
}

$ApiKey = Normalize-ApiKey $ApiKey
if (-not $ApiKey) { $ApiKey = $env:THERUNDOWN_API_KEY }

if (-not $ApiKey) {
  $repoRoot = Split-Path -Parent $PSScriptRoot
  foreach ($fname in @(".env.local", ".env", ".env.vercel.pulled")) {
    $ApiKey = Read-KeyFromEnvFile (Join-Path $repoRoot $fname)
    if ($ApiKey) { break }
  }
}

if (-not $ApiKey) {
  Write-Error "RUNDOWN_API_KEY or THERUNDOWN_API_KEY missing or empty. Add to .env.local or pass -ApiKey."
  exit 1
}

if (-not $DateOverride) {
  $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Eastern Standard Time")
  $DateOverride = [System.TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow, $tz).ToString("yyyy-MM-dd")
}

$base = "https://therundown.io/api/v2/sports/$SportId/markets/$DateOverride"
$uri = "$base`?offset=$OffsetMinutes"
$headers = @{ "X-TheRundown-Key" = $ApiKey }

Write-Host "GET $uri (header X-TheRundown-Key: redacted)`n" -ForegroundColor DarkGray

try {
  $data = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
} catch {
  $msg = $_.Exception.Message
  $body = $null
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $body = $_.ErrorDetails.Message
  } elseif ($_.Exception.Response) {
    try {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $sr.ReadToEnd()
      $sr.Close()
    } catch {}
  }
  Write-Host "Request failed: $msg" -ForegroundColor Red
  if ($body) { Write-Host "Response body: $($body.Substring(0, [Math]::Min(500, $body.Length)))" -ForegroundColor Yellow }
  Write-Host ""
  Write-Host "401 usually means the key is wrong, revoked, or for a different product." -ForegroundColor Yellow
  Write-Host "Fix: paste the key from The Rundown dashboard (no spaces). Try regenerating the key." -ForegroundColor Yellow
  Write-Host "Also confirm you are on https://therundown.io (not api.therundown.io unless that is what they gave you)." -ForegroundColor Yellow
  exit 1
}

$key = "$SportId"
$list = $data.$key
if (-not $list) {
  Write-Warning "No array at key '$key'. Response keys: $($data.PSObject.Properties.Name -join ', ')"
  exit 0
}

$props = $list | Where-Object { $_.proposition -eq $true } | Sort-Object { $_.id }
Write-Host ("Proposition markets: {0} (sport {1}, date {2})`n" -f $props.Count, $SportId, $DateOverride)

$props | ForEach-Object {
  $live = $_.live_variant_id
  $liveTxt = if ($live) { " live=$live" } else { "" }
  Write-Host ("  id={0}  {1}{2}" -f $_.id, $_.name, $liveTxt)
}

$ids = ($props | ForEach-Object { $_.id } | Sort-Object -Unique) -join ","
Write-Host "`nRUNDOWN_MARKET_IDS-style merge (core + props): 1,2,3 + catalog`n  (catalog proposition ids only:)`n  $ids`n"
