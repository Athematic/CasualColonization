# A tiny fake of POST /v1/images/generations (JSON) and POST /v1/images/edits (multipart/form-data,
# one or more "image[]" PNG parts, which it checks) on 127.0.0.1, run in a background runspace with
# System.Net.HttpListener (no Node or Python needed). Each recorded request has Body (the JSON body or
# the multipart text fields) and Files (Name, FileName, ContentType, Length, Bytes of each file part).
# The behaviour is picked by a token in the prompt, "[[scenario:<name>]]":
#   ok          200 with a real RGBA PNG (transparent background) or an RGB PNG for opaque requests
#   fakealpha   200 with an RGB PNG painted with a grey/white checkerboard (fake transparency)
#   opaquealpha 200 with an RGBA PNG whose pixels are all opaque
#   rate429     first call 429 with Retry-After: 1, then ok
#   ratereset   first call 429 with x-ratelimit-remaining-requests: 0 and x-ratelimit-reset-requests: 1s, then ok
#   err500      first two calls 500, then ok
#   always500   always 500
#   quota       429 insufficient_quota
#   policy      400 moderation_blocked
#   slow        waits 4 s, then ok
# Dot-source this file, then: $srv = Start-FakeOpenAIServer -ExpectedKey 'sk-...'; ...; Stop-FakeOpenAIServer $srv

function Start-FakeOpenAIServer {
    param([Parameter(Mandatory)][string]$ExpectedKey)
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $probe.Start(); $port = ([System.Net.IPEndPoint]$probe.LocalEndpoint).Port; $probe.Stop()

    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()

    $state = [hashtable]::Synchronized(@{
            ExpectedKey = $ExpectedKey
            Counts      = [hashtable]::Synchronized(@{})
            Requests    = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
            Png         = @{}
        })
    foreach ($kind in 'alpha', 'opaque-alpha', 'rgb', 'checker') { $state.Png[$kind] = [ImageGenTool.PngWriter]::Sample($kind, 64) }

    $serverScript = {
        param($Listener, $State)
        function Send($ctx, [int]$status, $obj, [hashtable]$headers) {
            $json = $obj | ConvertTo-Json -Depth 6 -Compress
            $bytes = [Text.Encoding]::UTF8.GetBytes($json)
            $ctx.Response.StatusCode = $status
            $ctx.Response.ContentType = 'application/json'
            if ($headers) { foreach ($k in $headers.Keys) { $ctx.Response.AddHeader($k, [string]$headers[$k]) } }
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.Close()
        }
        function ImageReply($ctx, [string]$kind, $body) {
            $png = $State.Png[$kind]
            Send $ctx 200 @{
                created = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                background = $body.background; output_format = 'png'; quality = $body.quality; size = $body.size
                data = @(@{ b64_json = [Convert]::ToBase64String($png) })
            } $null
        }
        # Minimal multipart/form-data parser: Latin-1 maps bytes 1:1 to chars, so file parts survive intact.
        function Read-Multipart([byte[]]$bytes, [string]$contentType) {
            $fields = [ordered]@{}
            $files = [System.Collections.Generic.List[object]]::new()
            if ($contentType -notmatch 'boundary="?([^";]+)"?') { return @{ Fields = $fields; Files = $files; Error = 'no boundary' } }
            $boundary = '--' + $Matches[1]
            $latin1 = [Text.Encoding]::GetEncoding(28591)
            $text = $latin1.GetString($bytes)
            $segments = $text -split [regex]::Escape($boundary)
            foreach ($seg in $segments) {
                if ($seg -eq '' -or $seg.StartsWith('--')) { continue }
                $s = $seg
                if ($s.StartsWith("`r`n")) { $s = $s.Substring(2) }
                if ($s.EndsWith("`r`n")) { $s = $s.Substring(0, $s.Length - 2) }
                $split = $s.IndexOf("`r`n`r`n")
                if ($split -lt 0) { continue }
                $head = $s.Substring(0, $split)
                $data = $s.Substring($split + 4)
                $name = $null; $fileName = $null; $ctype = $null
                foreach ($h in ($head -split "`r`n")) {
                    if ($h -match '^(?i)content-disposition:') {
                        if ($h -match '[;\s]name="([^"]*)"') { $name = $Matches[1] } elseif ($h -match '[;\s]name=([^;\s]+)') { $name = $Matches[1] }
                        if ($h -match 'filename="([^"]*)"') { $fileName = $Matches[1] }
                    } elseif ($h -match '^(?i)content-type:\s*(.+)$') { $ctype = $Matches[1].Trim() }
                }
                if ($null -ne $fileName) {
                    $fb = $latin1.GetBytes($data)
                    $files.Add([pscustomobject]@{ Name = $name; FileName = $fileName; ContentType = $ctype; Length = $fb.Length; Bytes = $fb })
                } else {
                    $fields[$name] = [Text.Encoding]::UTF8.GetString($latin1.GetBytes($data))
                }
            }
            return @{ Fields = $fields; Files = $files; Error = $null }
        }
        while ($Listener.IsListening) {
            try { $ctx = $Listener.GetContext() } catch { break }
            try {
                $req = $ctx.Request
                $ms = [IO.MemoryStream]::new()
                $req.InputStream.CopyTo($ms)
                $rawBytes = $ms.ToArray()
                $isMultipart = "$($req.ContentType)" -match '^multipart/form-data'
                $raw = if ($isMultipart) { '' } else { [Text.Encoding]::UTF8.GetString($rawBytes) }
                $body = $null
                $files = @()
                $mpError = $null
                if ($isMultipart) {
                    $mp = Read-Multipart $rawBytes $req.ContentType
                    $mpError = $mp.Error
                    $body = [pscustomobject]$mp.Fields
                    $files = @($mp.Files)
                } else {
                    try { $body = $raw | ConvertFrom-Json } catch { }
                }
                $auth = $req.Headers['Authorization']
                $scenario = 'ok'
                if ($body -and $body.prompt -match '\[\[scenario:([a-z0-9-]+)\]\]') { $scenario = $Matches[1] }
                $n = 1 + [int]$State.Counts[$scenario]
                $State.Counts[$scenario] = $n
                $null = $State.Requests.Add([pscustomobject]@{
                        Path = $req.Url.AbsolutePath; Method = $req.HttpMethod; Auth = $auth; ContentType = $req.ContentType
                        Raw = $raw; Body = $body; Files = $files; Scenario = $scenario; Count = $n; Time = [DateTime]::UtcNow
                    })
                $path = $req.Url.AbsolutePath
                if ($req.HttpMethod -ne 'POST' -or $path -notin '/v1/images/generations', '/v1/images/edits') {
                    Send $ctx 404 @{ error = @{ message = 'not found'; type = 'invalid_request_error'; code = 'not_found' } } $null; continue
                }
                if ($auth -ne "Bearer $($State.ExpectedKey)") {
                    Send $ctx 401 @{ error = @{ message = 'Incorrect API key provided.'; type = 'invalid_request_error'; code = 'invalid_api_key' } } $null; continue
                }
                if ($path -eq '/v1/images/edits') {
                    # the real endpoint takes multipart/form-data with one or more image parts
                    $bad = $null
                    if (-not $isMultipart) { $bad = 'images/edits expects multipart/form-data' }
                    elseif ($mpError) { $bad = "bad multipart body: $mpError" }
                    elseif ($files.Count -eq 0) { $bad = "image is required (send one or more 'image[]' file parts)" }
                    else {
                        foreach ($f in $files) {
                            if ($f.Name -notin 'image', 'image[]') { $bad = "unexpected file field '$($f.Name)'"; break }
                            if ($f.ContentType -notmatch '^image/(png|webp|jpeg)$') { $bad = "Invalid file '$($f.Name)': unsupported mimetype ('$($f.ContentType)')"; break }
                            if ($f.Length -lt 8 -or $f.Bytes[0] -ne 0x89 -or $f.Bytes[1] -ne 0x50) { $bad = "file '$($f.FileName)' is not a PNG"; break }
                        }
                    }
                    if (-not $bad -and $body.PSObject.Properties['moderation']) { $bad = "Unknown parameter: 'moderation'." }
                    if ($bad) { Send $ctx 400 @{ error = @{ message = $bad; type = 'invalid_request_error'; code = 'invalid_value' } } $null; continue }
                }
                if (-not $body -or -not $body.prompt) {
                    Send $ctx 400 @{ error = @{ message = 'prompt is required'; type = 'invalid_request_error'; code = 'missing_prompt' } } $null; continue
                }
                $okKind = if ($body.background -eq 'transparent') { 'alpha' } else { 'rgb' }
                switch ($scenario) {
                    'fakealpha' { ImageReply $ctx 'checker' $body }
                    'opaquealpha' { ImageReply $ctx 'opaque-alpha' $body }
                    'rate429' {
                        if ($n -eq 1) { Send $ctx 429 @{ error = @{ message = 'Rate limit reached for images per minute.'; type = 'requests'; code = 'rate_limit_exceeded' } } @{ 'Retry-After' = '1' } }
                        else { ImageReply $ctx $okKind $body }
                    }
                    'ratereset' {
                        if ($n -eq 1) { Send $ctx 429 @{ error = @{ message = 'Rate limit reached.'; type = 'requests'; code = 'rate_limit_exceeded' } } @{ 'x-ratelimit-remaining-requests' = '0'; 'x-ratelimit-reset-requests' = '1s' } }
                        else { ImageReply $ctx $okKind $body }
                    }
                    'err500' {
                        if ($n -le 2) { Send $ctx 500 @{ error = @{ message = 'The server had an error while processing your request.'; type = 'server_error'; code = $null } } $null }
                        else { ImageReply $ctx $okKind $body }
                    }
                    'always500' { Send $ctx 500 @{ error = @{ message = 'The server had an error while processing your request.'; type = 'server_error'; code = $null } } $null }
                    'quota' { Send $ctx 429 @{ error = @{ message = 'You exceeded your current quota, please check your plan and billing details.'; type = 'insufficient_quota'; code = 'insufficient_quota' } } $null }
                    'policy' { Send $ctx 400 @{ error = @{ message = 'Your request was rejected as a result of our safety system.'; type = 'image_generation_user_error'; code = 'moderation_blocked' } } $null }
                    'slow' { Start-Sleep -Seconds 4; ImageReply $ctx $okKind $body }
                    default { ImageReply $ctx $okKind $body }
                }
            } catch {
                try { $ctx.Response.StatusCode = 500; $ctx.Response.Close() } catch { }
            }
        }
    }

    $ps = [powershell]::Create()
    $null = $ps.AddScript($serverScript).AddArgument($listener).AddArgument($state)
    $handle = $ps.BeginInvoke()
    [pscustomobject]@{ Port = $port; ApiBase = "http://127.0.0.1:$port/v1"; Listener = $listener; State = $state; PowerShell = $ps; Handle = $handle }
}

function Stop-FakeOpenAIServer {
    param([Parameter(Mandatory)]$Server)
    try { $Server.Listener.Stop(); $Server.Listener.Close() } catch { }
    try { $null = $Server.Handle.AsyncWaitHandle.WaitOne(2000) } catch { }
    try { $Server.PowerShell.Dispose() } catch { }
}

function Reset-FakeOpenAIServer {
    param([Parameter(Mandatory)]$Server)
    $Server.State.Counts.Clear()
    $Server.State.Requests.Clear()
}
