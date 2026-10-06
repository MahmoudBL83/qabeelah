Param(
  [string]$ApiBase = 'http://localhost:4000/api',
  [string]$TenantId
)
if (-not $TenantId) { Write-Host 'Usage: .\verify-domain.ps1 <tenantId>'; exit 1 }

Write-Host "Starting domain verification for tenant $TenantId (start)"
$start = Invoke-RestMethod -Method Post -Uri "$ApiBase/tenants/$TenantId/domain/verify/start" -UseBasicParsing -Headers @{ Authorization = "Bearer $env:QABILA_TOKEN" }
Write-Host "Token: $($start.token)"
Write-Host "Instructions:`n$($start.instructions | ConvertTo-Json -Depth 5)"

Write-Host "After adding TXT or HTTP file, run confirm (dns)"
$confirm = Invoke-RestMethod -Method Post -Uri "$ApiBase/tenants/$TenantId/domain/verify/confirm" -Body (@{ method = 'dns' } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing -Headers @{ Authorization = "Bearer $env:QABILA_TOKEN" }
Write-Host "Confirm result:`n$($confirm | ConvertTo-Json -Depth 5)"