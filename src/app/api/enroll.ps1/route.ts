import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const platformUrl = req.nextUrl.searchParams.get("platform_url") || req.nextUrl.origin;

  const script = `# Device Pool Bootstrap Script (Windows)
$ErrorActionPreference = "Stop"

$PlatformUrl = if ($env:PLATFORM_URL) { $env:PLATFORM_URL } else { "${platformUrl}" }
if (-not $env:ENROLL_TOKEN) { throw "ENROLL_TOKEN environment variable is required" }
$EnrollToken = $env:ENROLL_TOKEN

$ConfigDir = "C:\\ProgramData\\DevicePool"

Write-Host "=== Device Pool Agent Bootstrap ==="
Write-Host "Platform: $PlatformUrl"
Write-Host ""

$Hostname = $env:COMPUTERNAME
$IpAddr = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" -or $_.PrefixOrigin -eq "Manual" } | Select-Object -First 1).IPAddress

Write-Host "Hostname: $Hostname"
Write-Host "IP: $IpAddr"
Write-Host ""

# Register
Write-Host "Registering device..."
$body = @{
    token = $EnrollToken
    hostname = $Hostname
    osType = "windows"
    architecture = $env:PROCESSOR_ARCHITECTURE
    ipAddress = $IpAddr
    accessMethods = @(@{ method = "rdp"; port = 3389 })
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "$PlatformUrl/api/enrollment/register" -Method POST -ContentType "application/json" -Body $body

$DeviceId = $response.deviceId
$DeviceToken = $response.deviceToken

if (-not $DeviceId) { throw "Registration failed" }

Write-Host "Registered! Device ID: $DeviceId"

# Save config
New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
@{
    serverUrl = $PlatformUrl
    deviceId = $DeviceId
    deviceToken = $DeviceToken
} | ConvertTo-Json | Set-Content "$ConfigDir\\agent.json"

# Restrict permissions
$acl = Get-Acl "$ConfigDir\\agent.json"
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow")
$acl.SetAccessRule($rule)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators","FullControl","Allow")
$acl.SetAccessRule($rule)
Set-Acl "$ConfigDir\\agent.json" $acl

Write-Host ""
Write-Host "=== Bootstrap Complete ==="
Write-Host "Device ID: $DeviceId"
Write-Host "Config: $ConfigDir\\agent.json"
Write-Host ""
Write-Host "Next: install and run the agent as a Windows service"
`;

  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
