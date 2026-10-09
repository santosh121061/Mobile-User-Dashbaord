[CmdletBinding()]
param([switch]$AcceptApprovedAndroidLicense, [string]$NativeRoot = $env:MOBILE_NATIVE_TOOLS_ROOT)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($NativeRoot)) { $NativeRoot=Join-Path $workspace '.runtime\mobile-native' }
if (-not [IO.Path]::IsPathRooted($NativeRoot)) { throw 'NativeRoot must be an absolute project tool directory.' }
$nativeRoot=[IO.Path]::GetFullPath($NativeRoot)
if (!(Test-Path -LiteralPath $nativeRoot)) { New-Item -ItemType Directory -Path $nativeRoot | Out-Null }
$drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($nativeRoot).Substring(0,1))
if ($drive.Free -lt 12GB) { throw 'Need at least 12 GiB free before native tool setup. No user files will be removed.' }
function Get-VerifiedArchive([string]$Url,[string]$Hash,[string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { Invoke-WebRequest -Uri $Url -OutFile $Path }
  if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Hash.ToLowerInvariant()) { throw "Download integrity check failed: $Path" }
  Write-Output "Verified $(Split-Path -Leaf $Path)"
}
function Expand-Safe([string]$Archive,[string]$Destination) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
  try { foreach($entry in $zip.Entries) {
    $target=[IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
    if (!$target.StartsWith([IO.Path]::GetFullPath($Destination)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive contains a path outside its destination.' }
  } } finally { $zip.Dispose() }
  Expand-Archive -LiteralPath $Archive -DestinationPath $Destination
}
$assets=Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
$package=$assets[0].binary.package
$jdkArchive=Join-Path $nativeRoot 'jdk17.zip'
Get-VerifiedArchive $package.link $package.checksum $jdkArchive
$jdkRoot=Join-Path $nativeRoot 'jdk'
if (!(Test-Path -LiteralPath $jdkRoot)) { Expand-Safe $jdkArchive $jdkRoot }
$jdk=Get-ChildItem -LiteralPath $jdkRoot -Directory | Select-Object -First 1
$env:JAVA_HOME=$jdk.FullName
$env:PATH="$($jdk.FullName)\bin;$env:PATH"
& "$env:JAVA_HOME\bin\java.exe" -version
if (!$AcceptApprovedAndroidLicense) { Write-Output 'JDK ready. SDK download awaits explicit Android agreement approval.'; exit 0 }
# Approved in the main chat on 2026-10-08: https://developer.android.com/studio#downloads.
# Do not accept other agreements or run sdkmanager --licenses / yes-to-all commands.
$sdkRoot=Join-Path $nativeRoot 'android-sdk'
$cliArchive=Join-Path $nativeRoot 'android-commandline.zip'
Get-VerifiedArchive 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a' $cliArchive
$cliDestination=Join-Path $nativeRoot 'commandline-extracted'
if (!(Test-Path -LiteralPath $cliDestination)) { Expand-Safe $cliArchive $cliDestination }
$cliTarget=Join-Path $sdkRoot 'cmdline-tools\latest'
if (!(Test-Path -LiteralPath $cliTarget)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $cliTarget) -Force | Out-Null
  $cliSource=Join-Path $cliDestination 'cmdline-tools'
  $resolvedSource=[IO.Path]::GetFullPath($cliSource); $resolvedTarget=[IO.Path]::GetFullPath($cliTarget)
  foreach($path in @($resolvedSource,$resolvedTarget)) { if(!$path.StartsWith($nativeRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Native tool path is outside the project runtime.' } }
  Move-Item -LiteralPath $resolvedSource -Destination $resolvedTarget
}
$env:ANDROID_HOME=$sdkRoot
& "$cliTarget\bin\sdkmanager.bat" --sdk_root=$sdkRoot --version
if ($LASTEXITCODE -ne 0) { throw 'SDK tools did not run; installation has not continued.' }
Write-Output 'SDK tools ready. Package licence prompts must be reviewed individually before acceptance.'
& "$cliTarget\bin\sdkmanager.bat" --sdk_root=$sdkRoot --list | Out-File -LiteralPath (Join-Path $nativeRoot 'available-packages.txt') -Encoding utf8
