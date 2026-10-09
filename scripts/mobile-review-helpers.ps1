function Get-ReviewProcess([int]$processId) {
    try {
        Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + $processId) -ErrorAction Stop
    } catch {
        throw 'Process inspection was denied. Ownership cannot be proven; no uncertain process will be reused or stopped.'
    }
}

function Get-ReviewListeners([int]$port) {
    try {
        @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -EQ $port)
    } catch {
        throw 'Listener inspection was denied. Ownership cannot be proven; no uncertain process will be reused or stopped.'
    }
}

function Assert-ReviewInspection {
    if (-not (Get-ReviewProcess $PID)) { throw 'The launcher process could not be inspected.' }
    $null = Get-ReviewListeners 9082
    $null = Get-ReviewListeners 8082
}

function Normalize-ReviewCommand([string]$command) {
    if ([string]::IsNullOrWhiteSpace($command) -or ([regex]::Matches($command, '"').Count % 2)) {
        throw 'The process command line could not be validated.'
    }
    $arguments = @([regex]::Matches($command, '"[^"\r\n]*"|[^\s"]+') | ForEach-Object {
        $_.Value.Trim('"').Replace('/', '\')
    })
    $arguments -join [char]0
}

function Get-ReviewIdentity([int]$processId, [string]$expectedPath, [string[]]$expectedCommands) {
    $process = Get-ReviewProcess $processId
    if (-not $process) { return $null }
    if (-not $process.CreationDate -or -not $process.CommandLine -or
        -not [string]::Equals($process.ExecutablePath, $expectedPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The recorded executable or creation identity does not match this review service.'
    }
    $actualCommand = Normalize-ReviewCommand $process.CommandLine
    $matchesExpected = @($expectedCommands | Where-Object {
        [string]::Equals((Normalize-ReviewCommand $_), $actualCommand, [StringComparison]::OrdinalIgnoreCase)
    }).Count -gt 0
    if (-not $matchesExpected) { throw 'The process command line does not match this workspace review service.' }
    [pscustomobject]@{
        pid = $processId
        path = $process.ExecutablePath
        created_utc = $process.CreationDate.ToUniversalTime().ToString('o')
        command_line = [string]$process.CommandLine
    }
}

function Assert-ReviewIdentity($identity, [string]$expectedPath, [string[]]$expectedCommands, [int]$port, [switch]$RequireListener) {
    if (-not $identity -or -not $identity.created_utc -or -not $identity.command_line) {
        throw 'The recorded service lacks a persisted creation time and command line. Existing processes were left untouched.'
    }
    $current = Get-ReviewIdentity ([int]$identity.pid) $expectedPath $expectedCommands
    if (-not $current) { throw 'The recorded review process exited.' }
    if ($current.created_utc -cne $identity.created_utc -or $current.command_line -cne $identity.command_line) {
        throw 'The recorded PID was reused or its process identity changed. Existing processes were left untouched.'
    }
    $listeners = @(Get-ReviewListeners $port)
    if (@($listeners | Where-Object OwningProcess -NE $identity.pid).Count -gt 0) {
        throw 'The review port belongs to another process. Existing processes were left untouched.'
    }
    if ($RequireListener -and -not $listeners.Count) { throw 'The recorded process does not own the review listener.' }
    $current
}

function Get-ExistingReviewService([int]$processId, $identity, [string]$expectedPath, [string[]]$expectedCommands, [int]$port) {
    if (-not $processId) { return $null }
    if (-not (Get-ReviewProcess $processId)) { return $null }
    if (-not $identity -or [int]$identity.pid -ne $processId) {
        throw 'The legacy PID record cannot establish ownership. Existing processes were left untouched.'
    }
    Assert-ReviewIdentity $identity $expectedPath $expectedCommands $port -RequireListener
}

function Assert-ReviewPortFree([int]$port) {
    if (@(Get-ReviewListeners $port).Count) { throw ('Port ' + $port + ' is occupied; no duplicate service was started.') }
}

function Stop-VerifiedReviewService($identity, [string]$expectedPath, [string[]]$expectedCommands, [int]$port) {
    $boundProcess = Get-Process -Id $identity.pid -ErrorAction Stop
    try {
        $null = $boundProcess.Handle
        $created = $boundProcess.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffff')
        $recorded = [DateTime]::Parse($identity.created_utc).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffff')
        if ($created -cne $recorded) { throw 'The process handle belongs to a reused PID; no process was stopped.' }
        $null = Assert-ReviewIdentity $identity $expectedPath $expectedCommands $port -RequireListener
        Stop-Process -InputObject $boundProcess -ErrorAction Stop
    } finally {
        $boundProcess.Dispose()
    }
}

function Wait-ReviewEndpoint([string]$url, $identity, [string]$expectedPath, [string[]]$expectedCommands, [int]$port) {
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $null = Assert-ReviewIdentity $identity $expectedPath $expectedCommands $port
        if (@(Get-ReviewListeners $port).Count) {
            try {
                $response = Invoke-ReviewLocalGet ([uri]$url) 10
                if ($response.StatusCode -eq 200) {
                    $null = Assert-ReviewIdentity $identity $expectedPath $expectedCommands $port -RequireListener
                    return $response
                }
            } catch [System.Net.WebException] { }
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ('The owned review endpoint did not become ready within 120 seconds: ' + $url)
}

function Get-ReviewBundleUri([string]$html, [uri]$pageUri) {
    $sources = @([regex]::Matches($html, '<script\b[^>]*\bsrc\s*=\s*["''](?<source>[^"'']+)["'']') | ForEach-Object {
        [uri]::new($pageUri, [Net.WebUtility]::HtmlDecode($_.Groups['source'].Value))
    } | Where-Object { $_.AbsolutePath.EndsWith('.bundle', [StringComparison]::Ordinal) })
    if ($sources.Count -ne 1) { throw 'The preview did not advertise exactly one entry JavaScript bundle.' }
    $bundleUri = $sources[0]
    if ($bundleUri.Scheme -ne $pageUri.Scheme -or $bundleUri.Host -ne $pageUri.Host -or
        $bundleUri.Port -ne $pageUri.Port -or $bundleUri.UserInfo -or $bundleUri.Fragment -or
        $bundleUri.AbsolutePath -ne '/node_modules/expo-router/entry.bundle' -or
        $bundleUri.Query -notmatch '(?:\?|&)platform=web(?:&|$)') {
        throw 'The advertised entry bundle is not the expected local web entry point.'
    }
    $bundleUri
}

function Assert-ReviewBundleResponse($response) {
    if ($response.StatusCode -ne 200 -or
        [string]$response.Headers['Content-Type'] -notmatch '^(?:application|text)/(?:java|ecma)script\b' -or
        [string]::IsNullOrWhiteSpace($response.Content) -or
        $response.Content -notmatch '(?:__d|__r)\s*\(') {
        throw 'The advertised entry JavaScript bundle did not compile successfully; the app is not ready.'
    }
}

function Invoke-ReviewHttpGet([uri]$Uri, [int]$TimeoutSeconds) {
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    try {
        $response = $client.GetAsync($Uri.AbsoluteUri).GetAwaiter().GetResult()
        $headers = @{'Content-Type'=[string]$response.Content.Headers.ContentType}
        [pscustomobject]@{StatusCode=[int]$response.StatusCode;Headers=$headers;
            Content=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            BaseResponse=[pscustomobject]@{ResponseUri=$response.RequestMessage.RequestUri}}
    } finally {
        if ($response) { $response.Dispose() }
        $client.Dispose()
        $handler.Dispose()
    }
}

function Invoke-ReviewLocalGet([uri]$uri, [int]$timeoutSeconds = 15) {
    $allowedOrigin = $uri.Scheme -eq 'http' -and -not $uri.UserInfo -and -not $uri.Fragment -and (
        ($uri.Host -eq '127.0.0.1' -and $uri.Port -eq 9082) -or
        ($uri.Host -eq 'localhost' -and $uri.Port -eq 8082)
    )
    if (-not $allowedOrigin) { throw 'Availability requests must use the fixed local hosts and ports.' }
    # Reject every redirect rather than letting a fixed local probe follow another origin.
    $response = Invoke-ReviewHttpGet $uri $timeoutSeconds
    if ($response.StatusCode -ne 200) { throw 'The fixed local endpoint is unavailable; redirects are not accepted.' }
    $finalUri = if ($response.BaseResponse.ResponseUri) {
        [uri]$response.BaseResponse.ResponseUri
    } elseif ($response.BaseResponse.RequestMessage.RequestUri) {
        [uri]$response.BaseResponse.RequestMessage.RequestUri
    } else {
        throw 'The response origin could not be verified.'
    }
    if ($finalUri.Scheme -cne $uri.Scheme -or $finalUri.Host -cne $uri.Host -or
        $finalUri.Port -ne $uri.Port -or $finalUri.UserInfo -or $finalUri.Fragment) {
        throw 'The fixed local request changed its origin; redirects are not accepted.'
    }
    $response
}

function Get-ReviewAvailability {
    $configUri = [uri]'http://127.0.0.1:9082/api/v1/mobile/config'
    $pageUri = [uri]'http://localhost:8082/login'
    $configResponse = Invoke-ReviewLocalGet $configUri
    if ([string]$configResponse.Headers['Content-Type'] -notmatch '^application/json\b') {
        throw 'The fixed API configuration endpoint did not return JSON.'
    }
    $configuration = $configResponse.Content | ConvertFrom-Json -ErrorAction Stop
    $data = $configuration.data
    if (-not $data -or ($data.schema_version -isnot [int] -and $data.schema_version -isnot [long]) -or
        $data.schema_version -ne 1) { throw 'The fixed API configuration schema is incompatible.' }
    foreach ($feature in @('api.enabled', 'account.recovery.enabled', 'account.verification.enabled', 'account.require_verified')) {
        if ($data.features.$feature -isnot [bool]) { throw 'The fixed API configuration is incomplete.' }
    }
    if (-not $data.features.'api.enabled') { throw 'The existing local API is disabled.' }
    if ($data.version_policy.enforced -isnot [bool] -or $data.version_policy.revision -notmatch '^[a-f0-9]{64}$') {
        throw 'The fixed API version policy is incompatible.'
    }
    $page = Invoke-ReviewLocalGet $pageUri
    if ([string]$page.Headers['Content-Type'] -notmatch '^text/html\b' -or $page.Content -notmatch '<title[^>]*>\s*User Dashboard\s*</title>') {
        throw 'The fixed login endpoint did not return the expected app HTML.'
    }
    $bundleUri = Get-ReviewBundleUri $page.Content $pageUri
    $bundle = Invoke-ReviewLocalGet $bundleUri 600
    Assert-ReviewBundleResponse $bundle
    [pscustomobject]@{
        outcome = 'AVAILABLE_UNMANAGED'
        ownership_verified = $false
        http_database_identity_verified = $false
        http_workspace_identity_verified = $false
        api_url = $configUri.AbsoluteUri
        review_url = $pageUri.AbsoluteUri
        entry_bundle_compiled = $true
    }
}
