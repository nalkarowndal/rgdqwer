# CI-only. Refuse any existing installation before running NSIS's stable app identity.
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Installer lifecycle verification is CI-only' }
$registries = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($registry in $registries) {
  $existing = Get-ItemProperty $registry -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*rgdqwer*' }
  if ($existing) { throw 'Existing rgdqwer registration; refusing to install or uninstall' }
}
if (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\rgdqwer')) { throw 'Existing default installation; refusing QA' }
$defaultProfile = Join-Path $env:APPDATA 'rgdqwer'
if (Test-Path $defaultProfile) { throw 'Existing default profile; refusing QA' }
$installers = @(Get-ChildItem 'release\*-windows-x64-unsigned-setup.exe')
if ($installers.Count -ne 1) { throw 'Exactly one installer required' }
$installer = $installers[0].FullName
$id = [Guid]::NewGuid().ToString()
$installDir = Join-Path $env:LOCALAPPDATA "Programs\rgdqwer-m8-$id"
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) "rgdqwer-m8-$id"
if ((Test-Path $installDir) -or (Test-Path $qaRoot)) { throw 'QA directory collision' }
New-Item -ItemType Directory -Path $qaRoot | Out-Null
New-Item -ItemType Directory -Path $defaultProfile | Out-Null
$defaultSentinel = Join-Path $defaultProfile '.m8-retention-sentinel'
Set-Content -Path $defaultSentinel -Value $id
$profile = Join-Path $qaRoot 'profile'
$exe = Join-Path $installDir 'rgdqwer.exe'
function Invoke-Installer {
  # NSIS /D must be last and must not be quoted, including paths with spaces.
  $process = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDir" -PassThru
  if (-not $process.WaitForExit(180000)) { $process.Kill(); throw 'Installer timed out' }
  if ($process.ExitCode -ne 0 -or -not (Test-Path $exe)) { throw 'Installer failed' }
}
function Invoke-Smoke([string]$mode) {
  & node --import tsx scripts/smoke-packaged.ts --executable $exe --profile $profile --mode $mode
  if ($LASTEXITCODE -ne 0) { throw "Packaged smoke failed: $mode" }
}
Invoke-Installer
Invoke-Smoke 'seed'
$before = Get-Content 'test-results\m8-packaged-win32-seed.json' -Raw | ConvertFrom-Json
$database = Join-Path $profile 'studio\studio.sqlite'
$modelHash = (Get-FileHash $before.modelFile).Hash
Invoke-Installer
Invoke-Smoke 'verify'
$dbHash = (Get-FileHash $database).Hash
$uninstaller = Join-Path $installDir 'Uninstall rgdqwer.exe'
if (-not (Test-Path $uninstaller)) { throw 'Owned uninstaller missing' }
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru
if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Uninstaller timed out' }
$deadline = [DateTime]::UtcNow.AddSeconds(60)
while (((Test-Path $exe) -or (Test-Path (Join-Path $installDir 'resources\app.asar'))) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 300 }
if ((Test-Path $exe) -or (Test-Path (Join-Path $installDir 'resources\app.asar'))) { throw 'Uninstall did not remove application' }
if ((Get-FileHash $database).Hash -ne $dbHash -or (Get-FileHash $before.modelFile).Hash -ne $modelHash) { throw 'Upgrade/uninstall changed retained data' }
if (-not (Test-Path (Join-Path $profile '.rgdqwer-qa-profile'))) { throw 'QA profile was removed' }
if ((Get-Content $defaultSentinel -Raw).Trim() -ne $id) { throw 'Default profile sentinel was removed or changed' }
@{ installed = $true; upgraded = $true; uninstalled = $true; isolatedDataRetained = $true; defaultProfileSentinelRetained = $true; signed = $false; realInferenceVerified = $false } | ConvertTo-Json | Set-Content 'test-results\m8-installer-win32.json'
& node --import tsx scripts/release-checksums.ts
if ($LASTEXITCODE -ne 0) { throw 'Checksum generation failed' }
# Deliberately leave the unique QA profile for runner disposal, never delete user data here.
