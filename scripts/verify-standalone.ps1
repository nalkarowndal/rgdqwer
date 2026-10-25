# CI-only: exercise the delivered ZIP, never an existing install or user profile.
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true') { throw 'Standalone verification is CI-only' }
$archives = @(Get-ChildItem 'release\rgdqwer-*-windows-x64-unsigned-standalone.zip')
if ($archives.Count -ne 1) { throw 'Exactly one standalone ZIP required' }
$archive = $archives[0]
& node --import tsx scripts/release-checksums.ts release standalone
if ($LASTEXITCODE -ne 0) { throw 'Standalone checksum generation failed' }
$archiveHash = (Get-FileHash $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = (Get-Content 'release\SHA256SUMS-standalone.txt' -Raw).Trim()
if ($manifest -ne "$archiveHash  $($archive.Name)") { throw 'Standalone checksum mismatch' }
$id = [Guid]::NewGuid().ToString()
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) "rgdqwer 직접 실행 QA $id"
if (Test-Path $qaRoot) { throw 'QA directory collision' }
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$appDir = Join-Path $qaRoot '스튜디오 원본'
$movedDir = Join-Path $qaRoot '스튜디오 이동 후'
$profile = Join-Path $qaRoot '프로필 data'
Expand-Archive -LiteralPath $archive.FullName -DestinationPath $appDir
foreach ($file in @('rgdqwer.exe', 'START_HERE.txt', 'resources\app.asar', 'LICENSE.electron.txt', 'LICENSES.chromium.html')) {
  if (-not (Test-Path -LiteralPath (Join-Path $appDir $file) -PathType Leaf)) { throw "Standalone file missing: $file" }
}
if (Test-Path -LiteralPath (Join-Path $appDir 'Uninstall rgdqwer.exe')) { throw 'Standalone ZIP contains uninstaller' }
$exeHash = (Get-FileHash (Join-Path $appDir 'rgdqwer.exe')).Hash
& node --import tsx scripts/smoke-packaged.ts --executable (Join-Path $appDir 'rgdqwer.exe') --profile $profile --mode seed --report test-results/standalone-win32-seed.json
if ($LASTEXITCODE -ne 0) { throw 'Standalone initial launch failed' }
Move-Item -LiteralPath $appDir -Destination $movedDir
if ((Test-Path -LiteralPath $appDir) -or (Get-FileHash (Join-Path $movedDir 'rgdqwer.exe')).Hash -ne $exeHash) { throw 'Standalone relocation failed' }
& node --import tsx scripts/smoke-packaged.ts --executable (Join-Path $movedDir 'rgdqwer.exe') --profile $profile --mode verify --report test-results/standalone-win32-moved.json
if ($LASTEXITCODE -ne 0) { throw 'Relocated standalone launch failed' }
@{
  archive = $archive.Name; archiveSha256 = $archiveHash; extracted = $true;
  unicodeAndSpacePaths = $true; relocated = $true; settingsAndModelRetained = $true;
  isolatedQaProfile = $true; signed = $false; realInferenceVerified = $false
} | ConvertTo-Json | Set-Content 'test-results\standalone-win32.json'
# Leave only these unique QA directories for runner disposal; no user-data deletion.
