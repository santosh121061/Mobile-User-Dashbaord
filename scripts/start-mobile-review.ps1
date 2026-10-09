param(
    [switch]$SeedFixtures,
    [switch]$ResetMetroCache,
    [switch]$StartServices,
    [string]$BackendRoot = $env:MOBILE_BACKEND_ROOT,
    [string]$NodePath = $env:MOBILE_NODE_PATH
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($BackendRoot) -or -not [IO.Path]::IsPathRooted($BackendRoot)) {
    throw 'Set MOBILE_BACKEND_ROOT or pass -BackendRoot with the absolute separate Laravel repository path.'
}
$BackendRoot = [IO.Path]::GetFullPath($BackendRoot)
if (-not (Test-Path -LiteralPath (Join-Path $BackendRoot 'tools/mobile-integration.php'))) {
    throw 'The configured backend lacks the existing guarded integration helper.'
}
if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $installedNode = Get-Command node.exe -CommandType Application -ErrorAction Stop
    $NodePath = $installedNode.Source
}
$nodePath = (Get-Item -LiteralPath $NodePath -ErrorAction Stop).FullName
$nodeVersion = & $nodePath -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or ([version]$nodeVersion -lt [version]'22.13.0')) {
    throw 'Use an existing Node.js version meeting the project engine (>=22.13.0). No runtime was installed.'
}
$env:MOBILE_INTEGRATION_ROOT = Join-Path $BackendRoot '.runtime/mobile-integration'
$apiLogs = Join-Path $BackendRoot '.runtime/mobile-validation'
$phpPath = Join-Path $BackendRoot '.runtime/php/php.exe'
$logs = Join-Path $repo '.runtime/mobile-validation'
$record = Join-Path $logs 'servers.json'
. (Join-Path $PSScriptRoot 'mobile-review-helpers.ps1')
if (-not $SeedFixtures -and -not $ResetMetroCache -and -not $StartServices) {
    $availability = Get-ReviewAvailability
    $previousIntegrationMode = $env:ADMIN_MOBILE_INTEGRATION
    try {
        $env:ADMIN_MOBILE_INTEGRATION = 'isolated'
        $guardJson = & $phpPath -d max_execution_time=120 (Join-Path $BackendRoot 'tools/mobile-integration.php') guard
        if ($LASTEXITCODE -ne 0) { throw 'The separate read-only local database identity check failed.' }
        $localDatabaseIdentity = $guardJson | ConvertFrom-Json -ErrorAction Stop
        if ($localDatabaseIdentity.database -ne 'knit_admin_test' -or $localDatabaseIdentity.port -ne 5433 -or
            $localDatabaseIdentity.workspace_data_directory -ne $true) {
            throw 'The separate read-only local database identity is unexpected.'
        }
    } finally {
        $env:ADMIN_MOBILE_INTEGRATION = $previousIntegrationMode
    }
    $availability | Add-Member -NotePropertyName local_database_identity_verified -NotePropertyValue $true
    $availability | Add-Member -NotePropertyName local_database_identity -NotePropertyValue $localDatabaseIdentity
    $availability | ConvertTo-Json -Depth 4
    return
}
Assert-ReviewInspection
[IO.Directory]::CreateDirectory($logs) | Out-Null
[IO.Directory]::CreateDirectory($apiLogs) | Out-Null
$saved = if (Test-Path -LiteralPath $record) { Get-Content -LiteralPath $record -Raw | ConvertFrom-Json } else { $null }
$apiArguments = @('-d','max_execution_time=120','-d','opcache.enable_cli=1','-S','127.0.0.1:9082','-t',(Join-Path $BackendRoot 'public'),(Join-Path $BackendRoot 'tools/mobile-integration.php'))
$metroArguments = @((Join-Path $repo 'node_modules/expo/bin/cli'),'start','--localhost','--port','8082')
$apiCommand = $phpPath + ' ' + ($apiArguments -join ' ')
$metroCommand = $nodePath + ' ' + ($metroArguments -join ' ')
$apiCommands = @($apiCommand)
$metroCommands = @($metroCommand, ($metroCommand + ' --clear'))
$apiId = if ($saved) { [int]$saved.api } else { 0 }
$metroId = if ($saved) { [int]$saved.metro } else { 0 }
$apiIdentity = Get-ExistingReviewService $apiId $(if ($saved) { $saved.api_identity }) $phpPath $apiCommands 9082
$metroIdentity = Get-ExistingReviewService $metroId $(if ($saved) { $saved.metro_identity }) $nodePath $metroCommands 8082
$env:ADMIN_MOBILE_INTEGRATION = 'isolated'
& $phpPath -d max_execution_time=120 (Join-Path $BackendRoot 'tools/mobile-integration.php') guard
if ($LASTEXITCODE -ne 0) { throw 'The workspace test database guard failed; no server was started.' }
if ($SeedFixtures) {
    if ($apiIdentity) { throw 'Close the proven isolated API before seeding fixtures.' }
    & $phpPath -d max_execution_time=120 (Join-Path $BackendRoot 'tools/mobile-integration.php') seed
    if ($LASTEXITCODE -ne 0) { throw 'Isolated synthetic fixture setup failed.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $env:MOBILE_INTEGRATION_ROOT 'fixtures.json'))) {
    throw 'Synthetic fixtures are absent. Run this script with -SeedFixtures to set up only the guarded test database.'
}
if ($ResetMetroCache -and $metroIdentity) {
    Stop-VerifiedReviewService $metroIdentity $nodePath $metroCommands 8082
    $metroId = 0
    $metroIdentity = $null
    [pscustomobject]@{php=$phpPath;node=$nodePath;api=$apiId;metro=$metroId;api_identity=$apiIdentity;metro_identity=$metroIdentity} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $record
}
function Save-ReviewServices {
    [pscustomobject]@{php=$phpPath;node=$nodePath;api=$apiId;metro=$metroId;api_identity=$apiIdentity;metro_identity=$metroIdentity} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $record
}
if (-not $apiIdentity) {
    Assert-ReviewPortFree 9082
    $service = Start-Process -FilePath $phpPath -ArgumentList $apiArguments -WorkingDirectory $BackendRoot -RedirectStandardOutput (Join-Path $apiLogs 'api.stdout.log') -RedirectStandardError (Join-Path $apiLogs 'api.stderr.log') -WindowStyle Hidden -PassThru
    $apiId = $service.Id
    $apiIdentity = Get-ReviewIdentity $apiId $phpPath $apiCommands
    if (-not $apiIdentity) { throw 'The new API process exited before its identity could be recorded.' }
    Save-ReviewServices
}
if (-not $metroIdentity) {
    Assert-ReviewPortFree 8082
    $env:PATH = (Split-Path -Parent $nodePath) + ';' + $env:PATH
    $env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:9082/api'
    $env:EXPO_PUBLIC_APP_ENV = 'development'
    $env:EXPO_NO_TELEMETRY = '1'
    $env:CI = $null
    if ($ResetMetroCache) { $metroArguments += '--clear' }
    $service = Start-Process -FilePath $nodePath -ArgumentList $metroArguments -WorkingDirectory $repo -RedirectStandardOutput (Join-Path $logs 'metro.stdout.log') -RedirectStandardError (Join-Path $logs 'metro.stderr.log') -WindowStyle Hidden -PassThru
    $metroId = $service.Id
    $metroIdentity = Get-ReviewIdentity $metroId $nodePath $metroCommands
    if (-not $metroIdentity) { throw 'The new Metro process exited before its identity could be recorded.' }
    Save-ReviewServices
}
Save-ReviewServices
$config = (Wait-ReviewEndpoint 'http://127.0.0.1:9082/api/v1/mobile/config' $apiIdentity $phpPath $apiCommands 9082).Content | ConvertFrom-Json
if (-not $config.data.features.'api.enabled') { throw 'The isolated API is disabled. Restore it with the guarded integration helper before review.' }
$page = Wait-ReviewEndpoint 'http://localhost:8082/login' $metroIdentity $nodePath $metroCommands 8082
if ($page.StatusCode -ne 200 -or $page.Content -notmatch 'User Dashboard') { throw 'The mobile preview health check failed.' }
$bundleUri = Get-ReviewBundleUri $page.Content ([uri]'http://localhost:8082/login')
$null = Assert-ReviewIdentity $metroIdentity $nodePath $metroCommands 8082 -RequireListener
$bundle = Invoke-ReviewLocalGet $bundleUri 600
Assert-ReviewBundleResponse $bundle
$null = Assert-ReviewIdentity $metroIdentity $nodePath $metroCommands 8082 -RequireListener
[pscustomobject]@{outcome='PASS';database='knit_admin_test';api_pid=$apiId;metro_pid=$metroId;review_url='http://localhost:8082/login';api_url='http://127.0.0.1:9082/api/v1/mobile/config';account_source=(Join-Path $env:MOBILE_INTEGRATION_ROOT 'fixtures.json');password_source=(Join-Path $BackendRoot 'tools/mobile-integration.php synthetic fixture block')} | ConvertTo-Json
