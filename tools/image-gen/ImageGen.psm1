#Requires -Version 7.0
# Helpers for Generate-Images.ps1: prompt parsing, manifest, OpenAI Images API calls, PNG checks
# and the contact sheet. Nothing in here reads, stores or prints the API key: it is passed in as a
# SecureString and handed straight to Invoke-WebRequest -Token.

$ErrorActionPreference = 'Stop'

if (-not ('ImageGenTool.PngInspector' -as [type])) {
    Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'PngInspector.cs'))) -Language CSharp
}

$script:Utf8NoBom = [Text.UTF8Encoding]::new($false)
$script:StandardSizes = @('1024x1024', '1536x1024', '1024x1536')

# ---------------------------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------------------------

function ConvertTo-Slug {
    param([Parameter(Mandatory)][string]$Text)
    $s = $Text.ToLowerInvariant() -replace "['’]", ''
    $s = $s -replace '[^a-z0-9]+', '-'
    return $s.Trim('-')
}

function New-ImageJob {
    param($Doc, $Id, $Section, $Category, $Size, $Background, $Prompt, $Notes)
    [pscustomobject]@{
        Doc        = $Doc
        Id         = $Id
        BaseId     = $Id
        Variant    = 1
        Key        = "$Doc/$Id"
        Section    = $Section
        Category   = $Category
        Size       = $Size
        Background = $Background
        Prompt     = $Prompt
        OutputRel  = "$Doc/$Id.png"
        Notes      = $Notes
    }
}

function Get-SpriteJobs {
    <#
    .SYNOPSIS
    Reads docs/SPRITE_PROMPTS.md the way its section 6.1 describes: the ```master block, every
    ```category <name> block and every | `file` | WxH | transparent-or-opaque | prompt | row.
    Final prompt = master block + category block (the nearest one above the row) + "SUBJECT: " + row prompt.
    #>
    param([Parameter(Mandatory)][string]$Path)
    $text = [IO.File]::ReadAllText($Path)
    $master = [regex]::Match($text, '```master\r?\n([\s\S]*?)\r?\n```')
    if (-not $master.Success) { throw "No ``````master block found in $Path" }
    $masterText = $master.Groups[1].Value.Trim()
    $lines = $text -split '\r?\n'
    $blocks = @{}
    $category = $null
    $section = ''
    $sub = ''
    $ids = @{}
    $jobs = [System.Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '^```category ([a-z0-9-]+)\s*$') {
            $cat = $Matches[1]
            $body = [System.Collections.Generic.List[string]]::new()
            $i++
            while ($i -lt $lines.Count -and -not $lines[$i].StartsWith('```')) { $body.Add($lines[$i]); $i++ }
            $blocks[$cat] = ($body -join "`n").Trim()
            $category = $cat
            continue
        }
        if ($line.StartsWith('```')) {
            # any other fenced block (master, code samples): skip its body
            $i++
            while ($i -lt $lines.Count -and -not $lines[$i].StartsWith('```')) { $i++ }
            continue
        }
        if ($line -match '^#{2,3} (.+)$') { $section = $Matches[1].Trim(); $sub = ''; continue }
        if ($line -match '^#### (.+)$') { $sub = $Matches[1].Trim(); continue }
        if ($line -match '^\| `([a-z0-9/_@-]+)` \| (\d+x\d+) \| (transparent|opaque) \| (.+) \|\s*$') {
            $id = $Matches[1]; $size = $Matches[2]; $bg = $Matches[3]; $subject = $Matches[4].Trim()
            if ($ids.ContainsKey($id)) { throw "Duplicate sprite id '$id' in $Path" }
            $ids[$id] = $true
            $parts = @($masterText)
            if ($category -and $blocks.ContainsKey($category)) { $parts += $blocks[$category] }
            $parts += "SUBJECT: $subject"
            $sectionName = if ($sub) { "$section > $sub" } else { $section }
            $jobs.Add((New-ImageJob -Doc 'sprites' -Id $id -Section $sectionName -Category $category `
                        -Size $size -Background $bg -Prompt ($parts -join "`n`n") -Notes $null))
        }
    }
    return , $jobs.ToArray()
}

function Get-BoxArtJobs {
    <#
    .SYNOPSIS
    Reads docs/BOX_ART_PROMPTS.md: the ```cover style block is pasted, unchanged, before every
    ```text prompt (front cover concepts, back cover, banner, icon). The ```text block that starts
    with "TITLE:" is the optional lettering add-on; with -IncludeTitle each front cover also gets a
    "__titled" job that appends it and drops the no-text rule, as section 6 of the doc explains.
    #>
    param([Parameter(Mandatory)][string]$Path, [switch]$IncludeTitle)
    $text = [IO.File]::ReadAllText($Path)
    $cover = [regex]::Match($text, '```cover\r?\n([\s\S]*?)\r?\n```')
    if (-not $cover.Success) { throw "No ``````cover block found in $Path" }
    $style = $cover.Groups[1].Value.Trim()
    $lines = $text -split '\r?\n'
    $h2 = ''; $h3 = ''
    $title = $null
    $concepts = [System.Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line.StartsWith('```')) {
            $isText = $line -match '^```text\s*$'
            $body = [System.Collections.Generic.List[string]]::new()
            $i++
            while ($i -lt $lines.Count -and -not $lines[$i].StartsWith('```')) { $body.Add($lines[$i]); $i++ }
            if ($isText) {
                $b = ($body -join "`n").Trim()
                if ($b.StartsWith('TITLE:')) { $title = $b }
                else { $concepts.Add([pscustomobject]@{ H2 = $h2; H3 = $h3; Body = $b }) }
            }
            continue
        }
        if ($line -match '^## (.+)$') { $h2 = $Matches[1].Trim(); $h3 = ''; continue }
        if ($line -match '^### (.+)$') { $h3 = $Matches[1].Trim(); continue }
    }

    $jobs = [System.Collections.Generic.List[object]]::new()
    $ids = @{}
    foreach ($c in $concepts) {
        $isFront = $false
        if ($c.H2 -match 'front cover' -and $c.H3 -match '^([A-Z])\.\s+(.+)$') {
            $id = 'front-' + (ConvertTo-Slug "$($Matches[1]) $($Matches[2] -replace '\(.*?\)', '')")
            $isFront = $true
        } else {
            $id = ConvertTo-Slug (($c.Body -split ',')[0])
        }
        if ($ids.ContainsKey($id)) { throw "Duplicate box art id '$id' in $Path" }
        $ids[$id] = $true
        $head = ($c.Body -split '\.')[0]
        $size = if ($head -match '\bportrait\b') { '1024x1536' }
                elseif ($head -match '\blandscape\b') { '1536x1024' }
                else { '1024x1024' }
        $notes = $null
        if ($c.Body -match 'attached front cover|use it as the reference') {
            $notes = 'The prompt refers to an attached reference image; the generations endpoint sends none, so match it to the chosen front cover by hand.'
        }
        $section = if ($c.H3) { "$($c.H2) > $($c.H3)" } else { $c.H2 }
        $jobs.Add((New-ImageJob -Doc 'boxart' -Id $id -Section $section -Category 'cover' -Size $size `
                    -Background 'opaque' -Prompt "$style`n`n$($c.Body)" -Notes $notes))
        if ($IncludeTitle -and $isFront -and $title) {
            # Section 6: remove "any text, letters" from the DO NOT INCLUDE line for this one run.
            $titledStyle = $style -replace 'any text, letters, ', '' -replace ' \(the title is added later\)', ''
            $jobs.Add((New-ImageJob -Doc 'boxart' -Id "${id}__titled" -Section "$section (with title)" -Category 'cover' `
                        -Size $size -Background 'opaque' -Prompt "$titledStyle`n`n$($c.Body)`n`n$title" `
                        -Notes 'Model-lettered title: check the spelling of every letter.'))
        }
    }
    return , $jobs.ToArray()
}

function Expand-JobVariants {
    <# One job per take: take 1 keeps the plain name, takes 2..N get the doc's "__v2", "__v3" suffix. #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs, [int]$Variants = 1)
    if ($Variants -le 1) { return , $Jobs }
    $out = [System.Collections.Generic.List[object]]::new()
    foreach ($j in $Jobs) {
        for ($v = 1; $v -le $Variants; $v++) {
            $c = $j.PSObject.Copy()
            if ($v -gt 1) {
                $c.Id = "$($j.BaseId)__v$v"
                $c.Variant = $v
                $c.Key = "$($j.Doc)/$($c.Id)"
                $c.OutputRel = "$($j.Doc)/$($c.Id).png"
            }
            $out.Add($c)
        }
    }
    return , $out.ToArray()
}

function Get-ImageJobs {
    param(
        [Parameter(Mandatory)][string]$SpriteDoc,
        [Parameter(Mandatory)][string]$BoxArtDoc,
        [ValidateSet('sprites', 'boxart', 'all')][string]$Doc = 'all',
        [string[]]$Only,
        [int]$Variants = 1,
        [switch]$IncludeTitle
    )
    $jobs = @()
    if ($Doc -in 'sprites', 'all') { $jobs += Get-SpriteJobs -Path $SpriteDoc }
    if ($Doc -in 'boxart', 'all') { $jobs += Get-BoxArtJobs -Path $BoxArtDoc -IncludeTitle:$IncludeTitle }
    if ($Only) {
        $patterns = foreach ($p in $Only) {
            foreach ($q in ($p -split ',')) {
                $q = $q.Trim()
                if (-not $q) { continue }
                if ($q -match '[\*\?\[]') { $q } else { "*$q*" }
            }
        }
        $jobs = @($jobs | Where-Object {
                $j = $_
                @($patterns | Where-Object { $j.Id -like $_ -or $j.Key -like $_ }).Count -gt 0
            })
    }
    return , (Expand-JobVariants -Jobs $jobs -Variants $Variants)
}

# ---------------------------------------------------------------------------------------------
# Manifest and plan
# ---------------------------------------------------------------------------------------------

function Get-PromptHash {
    <# SHA-256 of size, background and the assembled prompt: any change makes the job pending again. #>
    param([Parameter(Mandatory)]$Job)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = $sha.ComputeHash($script:Utf8NoBom.GetBytes("$($Job.Size)|$($Job.Background)|$($Job.Prompt)"))
    } finally { $sha.Dispose() }
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Get-UtcStamp { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

function New-Manifest {
    [ordered]@{
        version   = 1
        tool      = 'tools/image-gen/Generate-Images.ps1'
        createdAt = Get-UtcStamp
        updatedAt = $null
        lastRun   = $null
        jobs      = [ordered]@{}
    }
}

function Read-Manifest {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return New-Manifest }
    try {
        $m = [IO.File]::ReadAllText($Path) | ConvertFrom-Json -AsHashtable
        if ($null -eq $m -or $m -isnot [System.Collections.IDictionary]) { throw 'not a JSON object' }
    } catch {
        $backup = "$Path.corrupt-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
        Copy-Item -LiteralPath $Path -Destination $backup
        Write-Warning "Manifest $Path could not be read ($($_.Exception.Message)); kept a copy at $backup and started a new one."
        return New-Manifest
    }
    if (-not $m.Contains('jobs') -or $null -eq $m['jobs']) { $m['jobs'] = [ordered]@{} }
    return $m
}

function Save-Manifest {
    <# Atomic write: the JSON goes to a temp file next to the manifest, which then replaces it in one move. #>
    param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][string]$Path)
    $Manifest['updatedAt'] = Get-UtcStamp
    $json = ConvertTo-Json -InputObject $Manifest -Depth 20
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
    $tmp = "$Path.tmp-$PID"
    [IO.File]::WriteAllText($tmp, $json, $script:Utf8NoBom)
    [IO.File]::Move($tmp, $Path, $true)
}

function Get-JobPlan {
    <#
    .SYNOPSIS
    Decides for each job whether this run calls the API ("run") or not ("skip"), from the manifest
    entry, the prompt hash and whether the output file exists.
    #>
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs,
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$OutDir,
        [switch]$KeepChanged, [switch]$Force, [switch]$SkipFailed, [switch]$RedoFlagged
    )
    foreach ($job in $Jobs) {
        $hash = Get-PromptHash $job
        $file = Join-Path $OutDir $job.OutputRel
        $exists = Test-Path -LiteralPath $file
        $e = $Manifest['jobs'][$job.Key]
        $changed = $false
        $action = 'run'; $reason = 'new'
        if ($null -eq $e) {
            if ($exists -and -not $Force) { $action = 'skip'; $reason = 'output file already exists (not in the manifest); use -Force to regenerate' }
        } else {
            $changed = [bool]($e['promptHash'] -and $e['promptHash'] -ne $hash)
            $flagged = ($e['check'] -is [System.Collections.IDictionary]) -and ($e['check']['ok'] -eq $false)
            switch ($e['status']) {
                'done' {
                    if ($Force) { $reason = 'forced (-Force)' }
                    elseif (-not $exists) { $reason = 'output file missing' }
                    elseif ($changed -and -not $KeepChanged) { $reason = 'prompt changed' }
                    elseif ($RedoFlagged -and $flagged) { $reason = 'flagged by the PNG check (-RedoFlagged)' }
                    else {
                        $action = 'skip'
                        $reason = if ($changed) { 'done (prompt changed, kept by -KeepChanged)' } else { 'done' }
                    }
                }
                'skipped' {
                    if ($Force) { $reason = 'forced (-Force)' }
                    elseif (-not $exists) { $reason = 'output file missing' }
                    else { $action = 'skip'; $reason = 'skipped (existing file kept)' }
                }
                'failed' {
                    if ($SkipFailed -and -not $changed) { $action = 'skip'; $reason = 'failed earlier (-SkipFailed)' }
                    else { $reason = if ($changed) { 'failed earlier, prompt changed' } else { 'retry after earlier failure' } }
                }
                default { $reason = if ($changed) { 'pending, prompt changed' } else { 'pending (resume)' } }
            }
        }
        [pscustomobject]@{
            Job           = $job
            Action        = $action
            Reason        = $reason
            Hash          = $hash
            File          = $file
            PromptChanged = $changed
        }
    }
}

# ---------------------------------------------------------------------------------------------
# OpenAI Images API
# ---------------------------------------------------------------------------------------------

function Resolve-ImageSize {
    <#
    .SYNOPSIS
    Maps a requested WxH to one the model accepts. gpt-image-2 / 2.5 / chatgpt-image-latest take any
    WxH with both edges divisible by 16, aspect between 1:3 and 3:1, up to 3840x2160. Older GPT image
    models take 1024x1024, 1536x1024 (landscape) and 1024x1536 (portrait) only, so pick by aspect.
    #>
    param([Parameter(Mandatory)][string]$Size, [string]$Model = '')
    if ($Size -eq 'auto') { return 'auto' }
    if ($Size -notmatch '^(\d+)x(\d+)$') { throw "Bad size '$Size' (expected WIDTHxHEIGHT)" }
    $w = [int]$Matches[1]; $h = [int]$Matches[2]
    if ($script:StandardSizes -contains "${w}x${h}") { return "${w}x${h}" }
    $flexible = $Model -match '^(gpt-image-2|chatgpt-image)'
    $ratio = $w / [double]$h
    if ($flexible -and $w % 16 -eq 0 -and $h % 16 -eq 0 -and $ratio -ge (1 / 3.0) -and $ratio -le 3 -and
        [Math]::Max($w, $h) -le 3840 -and [Math]::Min($w, $h) -le 2160) {
        return "${w}x${h}"
    }
    if ($ratio -gt 1.2) { return '1536x1024' }
    if ($ratio -lt (1 / 1.2)) { return '1024x1536' }
    return '1024x1024'
}

function New-ImageRequestBody {
    param([Parameter(Mandatory)]$Job, [Parameter(Mandatory)]$Settings)
    $body = [ordered]@{
        model         = $Settings.Model
        prompt        = $Job.Prompt
        n             = 1
        size          = Resolve-ImageSize -Size $Job.Size -Model $Settings.Model
        quality       = $Settings.Quality
        background    = $Job.Background
        output_format = 'png'
        moderation    = $Settings.Moderation
    }
    return $body
}

function Invoke-ImageRequest {
    <#
    .SYNOPSIS
    One POST to {ApiBase}/images/generations. Returns an object with Ok, Status, Code, Type, Message,
    Headers (lower-case names) and Images (decoded PNG bytes). Never throws for HTTP or network errors.
    #>
    param(
        [Parameter(Mandatory)][string]$ApiBase,
        [Parameter(Mandatory)][securestring]$ApiKey,
        [Parameter(Mandatory)]$Body,
        [int]$TimeoutSec = 600
    )
    $ProgressPreference = 'SilentlyContinue'   # no download progress bar from Invoke-WebRequest
    $uri = $ApiBase.TrimEnd('/') + '/images/generations'
    $json = ConvertTo-Json -InputObject $Body -Depth 5 -Compress
    $params = @{
        Uri                = $uri
        Method             = 'Post'
        Body               = $script:Utf8NoBom.GetBytes($json)
        ContentType        = 'application/json'
        Authentication     = 'Bearer'
        Token              = $ApiKey
        SkipHttpErrorCheck = $true
        TimeoutSec         = $TimeoutSec
        ErrorAction        = 'Stop'
    }
    # The fake test server is plain http on 127.0.0.1; PowerShell refuses to send a token over http without this.
    if ($uri -match '^http://(127\.0\.0\.1|localhost|\[::1\])[:/]') { $params['AllowUnencryptedAuthentication'] = $true }
    $result = [pscustomobject]@{ Ok = $false; Status = 0; Code = $null; Type = $null; Message = $null; Headers = @{}; Images = $null; Class = $null }
    try {
        $resp = Invoke-WebRequest @params
    } catch {
        $result.Code = 'network'
        $result.Message = "request failed: $($_.Exception.Message)"
        return $result
    }
    $result.Status = [int]$resp.StatusCode
    $headers = @{}
    foreach ($k in $resp.Headers.Keys) { $headers[$k.ToLowerInvariant()] = (@($resp.Headers[$k]) -join ',') }
    $result.Headers = $headers
    $content = $resp.Content
    if ($content -is [byte[]]) { $content = $script:Utf8NoBom.GetString($content) }
    $parsed = $null
    try { if ($content) { $parsed = $content | ConvertFrom-Json } } catch { $parsed = $null }

    if ($result.Status -ge 200 -and $result.Status -lt 300) {
        $images = [System.Collections.Generic.List[byte[]]]::new()
        if ($parsed -and $parsed.PSObject.Properties['data'] -and $parsed.data) {
            foreach ($d in @($parsed.data)) {
                if ($d.PSObject.Properties['b64_json'] -and $d.b64_json) { $images.Add([Convert]::FromBase64String($d.b64_json)) }
            }
        }
        if ($images.Count -eq 0) {
            $result.Code = 'empty_response'
            $result.Message = 'the response contained no b64_json image'
            return $result
        }
        $result.Ok = $true
        $result.Images = $images
        return $result
    }

    $err = $null
    if ($parsed -and $parsed.PSObject.Properties['error']) { $err = $parsed.error }
    if ($err) {
        $result.Code = if ($err.PSObject.Properties['code']) { [string]$err.code } else { $null }
        $result.Type = if ($err.PSObject.Properties['type']) { [string]$err.type } else { $null }
        $result.Message = if ($err.PSObject.Properties['message']) { [string]$err.message } else { $null }
    }
    if (-not $result.Message) {
        $snippet = if ($content) { ([string]$content).Substring(0, [Math]::Min(300, ([string]$content).Length)) } else { '' }
        $result.Message = "HTTP $($result.Status) $snippet".Trim()
    }
    return $result
}

function Get-ErrorClass {
    <#
    fatal_quota / fatal_auth / fatal_access stop the run; policy and invalid fail the job and the run goes on;
    rate_limit, server and network are retried with backoff.
    #>
    param([int]$Status, [string]$Code, [string]$Type, [string]$Message, [hashtable]$Headers)
    $c = "$Code $Type".ToLowerInvariant()
    $msg = "$Message".ToLowerInvariant()
    if ($c -match 'insufficient_quota|billing_hard_limit|billing_not_active|billing_limit|quota_exceeded' -or $Status -eq 402 -or
        ($Status -eq 429 -and $msg -match 'quota|billing|credit')) { return 'fatal_quota' }
    if ($Status -eq 401 -or $c -match 'invalid_api_key') { return 'fatal_auth' }
    if ($Status -eq 403) { return 'fatal_access' }
    if ($c -match 'moderation_blocked|content_policy|content_filter|safety' -or
        $msg -match 'safety system|content policy|moderation') { return 'policy' }
    if ($Status -eq 429) { return 'rate_limit' }
    if ($Status -eq 0) { return 'network' }
    if ($Headers -and $Headers['x-should-retry'] -eq 'false') { return 'invalid' }
    if ($Status -ge 500 -or $Status -eq 408 -or $Status -eq 409 -or $c -match 'empty_response') { return 'server' }
    if ($Headers -and $Headers['x-should-retry'] -eq 'true') { return 'server' }
    return 'invalid'
}

function ConvertFrom-RateLimitDuration {
    <# Parses x-ratelimit-reset-* values such as "1s", "6m0s", "20ms", "1h2m3.5s" or "0.5" into seconds. #>
    param([string]$Value)
    if (-not $Value) { return $null }
    $v = $Value.Trim()
    $n = 0.0
    if ([double]::TryParse($v, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $n }
    $total = 0.0; $any = $false
    foreach ($m in [regex]::Matches($v, '(\d+(?:\.\d+)?)(ms|h|m|s)')) {
        $any = $true
        $x = [double]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
        switch ($m.Groups[2].Value) {
            'ms' { $total += $x / 1000 }
            'h' { $total += $x * 3600 }
            'm' { $total += $x * 60 }
            's' { $total += $x }
        }
    }
    if ($any) { return $total }
    return $null
}

function Get-RetryDelaySeconds {
    <#
    Server hints first (retry-after-ms, Retry-After seconds or HTTP date, then for 429 the
    x-ratelimit-reset-* header of whichever limit is exhausted), plus a little jitter.
    Otherwise exponential backoff with "equal jitter": base * 2^(attempt-1), randomised in its upper half.
    #>
    param([hashtable]$Headers, [int]$Attempt = 1, [int]$Status = 0, [double]$BaseSeconds = 2, [double]$MaxSeconds = 120, [System.Random]$Random)
    $rand = if ($Random) { $Random } else { [System.Random]::new() }
    $inv = [Globalization.CultureInfo]::InvariantCulture
    $server = $null
    if ($Headers) {
        $x = 0.0
        if ($Headers['retry-after-ms'] -and [double]::TryParse($Headers['retry-after-ms'], [Globalization.NumberStyles]::Float, $inv, [ref]$x)) {
            $server = $x / 1000
        }
        if ($null -eq $server -and $Headers['retry-after']) {
            $ra = [string]$Headers['retry-after']
            if ([double]::TryParse($ra, [Globalization.NumberStyles]::Float, $inv, [ref]$x)) { $server = $x }
            else {
                $d = [DateTimeOffset]::MinValue
                if ([DateTimeOffset]::TryParse($ra, $inv, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$d)) {
                    $server = [Math]::Max(0, ($d - [DateTimeOffset]::UtcNow).TotalSeconds)
                }
            }
        }
        if ($null -eq $server -and $Status -eq 429) {
            $resets = @()
            foreach ($kind in 'requests', 'tokens', 'images') {
                $remaining = $Headers["x-ratelimit-remaining-$kind"]
                $reset = ConvertFrom-RateLimitDuration $Headers["x-ratelimit-reset-$kind"]
                if ($null -ne $reset -and "$remaining" -eq '0') { $resets += $reset }
            }
            if ($resets.Count -gt 0) { $server = ($resets | Measure-Object -Maximum).Maximum }
        }
    }
    if ($null -ne $server -and $server -ge 0) {
        $delay = $server + $rand.NextDouble() * 0.5
    } else {
        $exp = $BaseSeconds * [Math]::Pow(2, [Math]::Max(0, $Attempt - 1))
        $delay = $exp / 2 + $rand.NextDouble() * $exp / 2
    }
    return [Math]::Min($delay, $MaxSeconds)
}

function Invoke-JobGeneration {
    <#
    .SYNOPSIS
    Calls the API for one job, retrying rate limits, 5xx and network errors. Increments
    $Entry.attempts for every HTTP attempt. Returns the last Invoke-ImageRequest result with .Class set.
    #>
    param(
        [Parameter(Mandatory)]$Job,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Entry,
        [Parameter(Mandatory)]$Settings,
        [Parameter(Mandatory)][securestring]$ApiKey
    )
    $body = New-ImageRequestBody -Job $Job -Settings $Settings
    $r = $null
    for ($attempt = 1; $attempt -le $Settings.MaxRetries; $attempt++) {
        $Entry['attempts'] = [int]$Entry['attempts'] + 1
        $r = Invoke-ImageRequest -ApiBase $Settings.ApiBase -ApiKey $ApiKey -Body $body -TimeoutSec $Settings.RequestTimeoutSec
        if ($r.Ok) { $r.Class = 'ok'; return $r }
        $r.Class = Get-ErrorClass -Status $r.Status -Code $r.Code -Type $r.Type -Message $r.Message -Headers $r.Headers
        if ($r.Class -notin 'rate_limit', 'server', 'network') { return $r }
        if ($attempt -ge $Settings.MaxRetries) { return $r }
        $delay = Get-RetryDelaySeconds -Headers $r.Headers -Attempt $attempt -Status $r.Status `
            -BaseSeconds $Settings.RetryBaseSeconds -MaxSeconds $Settings.MaxRetryDelaySeconds
        $what = switch ($r.Class) { 'rate_limit' { 'rate limited (429)' } 'server' { "server error ($($r.Status))" } default { 'network error' } }
        Write-Host ("  {0}; retrying in {1:0.0}s (attempt {2} of {3})" -f $what, $delay, ($attempt + 1), $Settings.MaxRetries) -ForegroundColor Yellow
        Start-Sleep -Milliseconds ([int][Math]::Ceiling($delay * 1000))
    }
    return $r
}

# ---------------------------------------------------------------------------------------------
# PNG checks
# ---------------------------------------------------------------------------------------------

function Test-ImageResult {
    <#
    .SYNOPSIS
    Checks a generated PNG against what the job asked for. Transparent jobs need an alpha channel
    with actually transparent pixels and no painted checkerboard; opaque jobs must have none.
    #>
    param([Parameter(Mandatory)][byte[]]$Bytes, [Parameter(Mandatory)][string]$Background, [string]$Size)
    $rep = [ImageGenTool.PngInspector]::Inspect($Bytes)
    $issues = [System.Collections.Generic.List[string]]::new()
    if (-not $rep.IsPng) {
        $issues.Add("not a PNG file: $($rep.Error)")
    } else {
        if ($rep.Error) { $issues.Add("could not fully check pixels: $($rep.Error)") }
        if ($Background -eq 'transparent') {
            if (-not $rep.HasAlphaChannel) {
                $issues.Add("no alpha channel (PNG colour type $($rep.ColorType), $($rep.ColorTypeName)): the background is not transparent")
            } elseif ($rep.PixelsAnalysed -and $rep.TransparentPixels -eq 0) {
                $issues.Add('alpha channel present but no transparent pixels')
            } elseif ($rep.PixelsAnalysed -and $rep.TransparentFraction -lt 0.01) {
                $issues.Add(('only {0:P2} of pixels are transparent' -f $rep.TransparentFraction))
            }
            if ($rep.CheckerboardSuspected) { $issues.Add('the corners look like a painted grey and white checkerboard (fake transparency)') }
        } elseif ($Background -eq 'opaque') {
            if ($rep.PixelsAnalysed -and $rep.TransparentPixels -gt 0) {
                $issues.Add(('{0} transparent pixels, but the job asks for an opaque, full-bleed image' -f $rep.TransparentPixels))
            }
        }
    }
    $check = [ordered]@{
        ok                    = ($issues.Count -eq 0)
        isPng                 = $rep.IsPng
        width                 = $rep.Width
        height                = $rep.Height
        colorType             = $rep.ColorType
        colorTypeName         = $rep.ColorTypeName
        bitDepth              = $rep.BitDepth
        hasAlpha              = $rep.HasAlphaChannel
        transparentFraction   = [Math]::Round($rep.TransparentFraction, 4)
        checkerboardSuspected = $rep.CheckerboardSuspected
        issues                = @($issues)
    }
    if ($Size -and $Size -match '^(\d+)x(\d+)$' -and $rep.IsPng -and ($rep.Width -ne [int]$Matches[1] -or $rep.Height -ne [int]$Matches[2])) {
        $check['note'] = "image is $($rep.Width)x$($rep.Height), requested $Size"
    }
    return $check
}

function Save-BytesAtomic {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][byte[]]$Bytes)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { $null = New-Item -ItemType Directory -Path $dir -Force }
    $tmp = "$Path.partial"
    [IO.File]::WriteAllBytes($tmp, $Bytes)
    [IO.File]::Move($tmp, $Path, $true)
}

# ---------------------------------------------------------------------------------------------
# Cost and contact sheet
# ---------------------------------------------------------------------------------------------

function Get-CostEstimate {
    <#
    Very rough USD estimate, from the per-image prices quoted in docs/SPRITE_PROMPTS.md for
    1024x1024 (low 0.01, medium 0.04, high 0.17); non-square sizes cost about 1.5x. Check current pricing.
    #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs, [string]$Quality = 'medium')
    $per = switch ($Quality) { 'low' { 0.011 } 'medium' { 0.042 } 'high' { 0.167 } default { 0.25 } }
    $sum = 0.0
    foreach ($j in $Jobs) { $sum += if ($j.Size -eq '1024x1024') { $per } else { $per * 1.5 } }
    return [Math]::Round($sum, 2)
}

function Write-ContactSheet {
    <# Writes index.html in the output folder: every image with its key, status, check result and prompt. #>
    param([Parameter(Mandatory)][string]$OutDir, [Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs)
    $enc = { param($s) [System.Net.WebUtility]::HtmlEncode([string]$s) }
    $sb = [System.Text.StringBuilder]::new()
    $null = $sb.AppendLine('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
    $null = $sb.AppendLine('<title>Image Contact Sheet</title><style>')
    $null = $sb.AppendLine(':root{--bg:#f5eedc;--card:#fffdf6;--ink:#1b1a17;--muted:#6b665c;--bad:#b3261e;--ok:#2e7d32;--chk1:#2b4a6f;--chk2:#36597f}')
    $null = $sb.AppendLine('@media (prefers-color-scheme: dark){:root{--bg:#1c1b19;--card:#262522;--ink:#f1ece0;--muted:#a9a395}}')
    $null = $sb.AppendLine('body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}h1{font-size:20px;margin:0 0 4px}p.meta{color:var(--muted);margin:0 0 16px}')
    $null = $sb.AppendLine('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.card{background:var(--card);border-radius:8px;padding:8px;box-shadow:0 1px 2px rgba(0,0,0,.15);min-width:0}')
    $null = $sb.AppendLine('.thumb{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:4px;background:repeating-conic-gradient(var(--chk1) 0 25%,var(--chk2) 0 50%) 0 0/24px 24px}')
    $null = $sb.AppendLine('.thumb img{max-width:100%;max-height:100%}.key{font-weight:600;word-break:break-all;margin-top:6px}.small{color:var(--muted);font-size:12px}.bad{color:var(--bad)}.okc{color:var(--ok)}')
    $null = $sb.AppendLine('details{font-size:12px;margin-top:4px}details pre{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}.empty{color:#dfe6ee;font-size:12px}</style></head><body>')
    $null = $sb.AppendLine("<h1>Image Contact Sheet</h1><p class=""meta"">$(& $enc ((Get-Date).ToString('yyyy-MM-dd HH:mm'))) &middot; $($Jobs.Count) jobs. The dark blue checkerboard is the page background: real transparency shows it, a painted checkerboard hides it.</p><div class=""grid"">")
    foreach ($job in $Jobs) {
        $e = $Manifest['jobs'][$job.Key]
        $status = if ($e) { $e['status'] } else { 'pending' }
        $file = Join-Path $OutDir $job.OutputRel
        $null = $sb.Append('<div class="card"><div class="thumb">')
        if (Test-Path -LiteralPath $file) {
            $src = ($job.OutputRel -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
            $null = $sb.Append("<img loading=""lazy"" src=""$src"" alt=""$(& $enc $job.Key)"">")
        } else {
            $null = $sb.Append("<span class=""empty"">$(& $enc $status)</span>")
        }
        $null = $sb.Append("</div><div class=""key"">$(& $enc $job.Key)</div><div class=""small"">$(& $enc $job.Size) &middot; $(& $enc $job.Background) &middot; $(& $enc $status)</div>")
        if ($e -and $e['check'] -is [System.Collections.IDictionary]) {
            $chk = $e['check']
            if ($chk['ok']) { $null = $sb.Append("<div class=""small okc"">PNG check ok ($(& $enc $chk['colorTypeName']))</div>") }
            else { $null = $sb.Append("<div class=""small bad"">$(& $enc (@($chk['issues']) -join '; '))</div>") }
        }
        if ($e -and $e['status'] -eq 'failed' -and $e['lastError']) { $null = $sb.Append("<div class=""small bad"">$(& $enc $e['lastError'])</div>") }
        $null = $sb.Append("<details><summary>$(& $enc $job.Section)</summary><pre>$(& $enc $job.Prompt)</pre></details></div>")
        $null = $sb.AppendLine()
    }
    $null = $sb.AppendLine('</div></body></html>')
    $path = Join-Path $OutDir 'index.html'
    $tmp = "$path.tmp-$PID"
    [IO.File]::WriteAllText($tmp, $sb.ToString(), $script:Utf8NoBom)
    [IO.File]::Move($tmp, $path, $true)
    return $path
}

Export-ModuleMember -Function ConvertTo-Slug, Get-SpriteJobs, Get-BoxArtJobs, Expand-JobVariants, Get-ImageJobs,
    Get-PromptHash, Get-UtcStamp, New-Manifest, Read-Manifest, Save-Manifest, Get-JobPlan, Resolve-ImageSize,
    New-ImageRequestBody, Invoke-ImageRequest, Get-ErrorClass, ConvertFrom-RateLimitDuration, Get-RetryDelaySeconds,
    Invoke-JobGeneration, Test-ImageResult, Save-BytesAtomic, Get-CostEstimate, Write-ContactSheet
