#Requires -Version 7.0
# Shared helpers for Generate-Images.ps1 (images/generations) and Edit-Images.ps1 (images/edits):
# prompt parsing, manifest, the run loop, OpenAI Images API calls, PNG checks and the contact sheets. Nothing in here reads, stores or prints the API key: it is passed in as a
# SecureString and handed straight to Invoke-WebRequest -Token.

$ErrorActionPreference = 'Stop'

if (-not ('ImageGenTool.PngInspector' -as [type])) {
    Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'PngInspector.cs'))) -Language CSharp
}

$script:Utf8NoBom = [Text.UTF8Encoding]::new($false)
$script:StandardSizes = @('1024x1024', '1536x1024', '1024x1536')
$script:FileHashCache = @{}

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
    param($Doc, $Id, $Section, $Category, $Size, $Background, $Prompt, $Notes, $Subject)
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
        Subject    = $Subject
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
                        -Size $size -Background $bg -Prompt ($parts -join "`n`n") -Notes $null -Subject $subject))
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
                    -Background 'opaque' -Prompt "$style`n`n$($c.Body)" -Notes $notes -Subject $c.Body))
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

function Select-JobsByPattern {
    <# -Only: wildcards matched against the job id or key; a pattern without * ? [ matches anywhere. #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs, [string[]]$Only)
    if (-not $Only) { return , $Jobs }
    $patterns = @(foreach ($p in $Only) {
            foreach ($q in ($p -split ',')) {
                $q = $q.Trim()
                if (-not $q) { continue }
                if ($q -match '[\*\?\[]') { $q } else { "*$q*" }
            }
        })
    if ($patterns.Count -eq 0) { return , $Jobs }
    return , @($Jobs | Where-Object {
            $j = $_
            @($patterns | Where-Object { $j.Id -like $_ -or $j.Key -like $_ }).Count -gt 0
        })
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
    $jobs = Select-JobsByPattern -Jobs $jobs -Only $Only
    return , (Expand-JobVariants -Jobs $jobs -Variants $Variants)
}

# ---------------------------------------------------------------------------------------------
# Manifest and plan
# ---------------------------------------------------------------------------------------------

function Get-PromptHash {
    <#
    SHA-256 of size, background and the assembled prompt: any change makes the job pending again.
    Edit jobs carry their own HashInput (mode, grid, size, background, prompt and the SHA-256 of every
    reference image), so a new master, style bible or anchor re-queues them too.
    #>
    param([Parameter(Mandatory)]$Job)
    $text = if ($Job.PSObject.Properties['HashInput'] -and $Job.HashInput) { [string]$Job.HashInput }
            else { "$($Job.Size)|$($Job.Background)|$($Job.Prompt)" }
    return Get-Sha256Hex -Bytes ($script:Utf8NoBom.GetBytes($text))
}

function Get-Sha256Hex {
    param([Parameter(Mandatory)][AllowEmptyCollection()][byte[]]$Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $h = $sha.ComputeHash($Bytes) } finally { $sha.Dispose() }
    return ([BitConverter]::ToString($h) -replace '-', '').ToLowerInvariant()
}

function Get-FileSha256 {
    <# SHA-256 of a file, cached per path + length + write time for the run. #>
    param([Parameter(Mandatory)][string]$Path)
    $fi = [IO.FileInfo]::new($Path)
    $k = "$($fi.FullName)|$($fi.Length)|$($fi.LastWriteTimeUtc.Ticks)"
    if (-not $script:FileHashCache.ContainsKey($k)) { $script:FileHashCache[$k] = Get-Sha256Hex -Bytes ([IO.File]::ReadAllBytes($fi.FullName)) }
    return $script:FileHashCache[$k]
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

function Test-InputFidelitySupport {
    <#
    input_fidelity per the OpenAI Python SDK 3.35.1 (ImageEditParams): "high" and "low" on gpt-image-1 and
    gpt-image-1.5, only "low" on gpt-image-1-mini, and "omit this parameter" for gpt-image-2. The SDK does
    not list it for the gpt-image-2.5 models either, so it is omitted for them. Returns the value to send,
    or $null to leave the field out.
    #>
    param([string]$Model, [ValidateSet('auto', 'high', 'low', 'omit')][string]$Requested = 'auto')
    if ($Requested -eq 'omit') { return $null }
    $m = "$Model".ToLowerInvariant()
    if ($m -match '^gpt-image-1-mini') {
        if ($Requested -eq 'auto') { return $null }
        return 'low'
    }
    if ($m -match '^gpt-image-1(\.5)?(-\d{4}-\d{2}-\d{2})?$') {
        if ($Requested -eq 'auto') { return 'high' }
        return $Requested
    }
    return $null
}

function New-ImageEditForm {
    <#
    .SYNOPSIS
    The multipart/form-data fields for POST /images/edits, as a list of parts: text fields have Value,
    file parts have FileName, ContentType and Bytes. The images go as repeated "image[]" parts (the SDK's
    "brackets" array format for a list of images), the master first.
    #>
    param([Parameter(Mandatory)]$Job, [Parameter(Mandatory)]$Settings)
    $parts = [System.Collections.Generic.List[object]]::new()
    $fields = [ordered]@{
        model         = $Settings.Model
        prompt        = $Job.Prompt
        n             = '1'
        size          = Resolve-ImageSize -Size $Job.Size -Model $Settings.Model
        quality       = $Settings.Quality
        background    = $Job.Background
        output_format = 'png'
    }
    $wanted = 'auto'
    if ($Settings.PSObject.Properties['InputFidelity'] -and $Settings.InputFidelity) { $wanted = $Settings.InputFidelity }
    $fid = Test-InputFidelitySupport -Model $Settings.Model -Requested $wanted
    if ($fid) { $fields['input_fidelity'] = $fid }
    foreach ($k in $fields.Keys) {
        $parts.Add([pscustomobject]@{ Name = $k; Value = [string]$fields[$k]; FileName = $null; ContentType = $null; Bytes = $null })
    }
    $i = 0
    foreach ($ref in @($Job.References)) {
        $i++
        $bytes = [IO.File]::ReadAllBytes($ref.Path)
        $parts.Add([pscustomobject]@{ Name = 'image[]'; Value = $null; FileName = ('{0}-{1}.png' -f $i, $ref.Role); ContentType = 'image/png'; Bytes = $bytes })
    }
    return , $parts.ToArray()
}

function New-MultipartContent {
    <# A fresh System.Net.Http.MultipartFormDataContent (one per HTTP attempt: a sent body is not reused). #>
    param([Parameter(Mandatory)][object[]]$Parts)
    $mp = [System.Net.Http.MultipartFormDataContent]::new()
    foreach ($p in $Parts) {
        $cd = [System.Net.Http.Headers.ContentDispositionHeaderValue]::new('form-data')
        $cd.Name = '"' + $p.Name + '"'
        if ($null -ne $p.Bytes) {
            $c = [System.Net.Http.ByteArrayContent]::new([byte[]]$p.Bytes)
            $cd.FileName = '"' + $p.FileName + '"'
            # the API rejects image parts sent as application/octet-stream, so the type is always set
            $c.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new([string]$p.ContentType)
        } else {
            $c = [System.Net.Http.StringContent]::new([string]$p.Value, $script:Utf8NoBom)
            $c.Headers.ContentType = $null
        }
        $c.Headers.ContentDisposition = $cd
        $mp.Add($c)
    }
    return , $mp
}

function Invoke-ImageRequest {
    <#
    .SYNOPSIS
    One POST to {ApiBase}/images/generations (JSON -Body) or {ApiBase}/images/edits (multipart, -Form parts
    from New-ImageEditForm). Returns an object with Ok, Status, Code, Type, Message, Headers (lower-case
    names) and Images (decoded PNG bytes). Never throws for HTTP or network errors.
    #>
    param(
        [Parameter(Mandatory)][string]$ApiBase,
        [Parameter(Mandatory)][securestring]$ApiKey,
        $Body,
        [object[]]$Form,
        [string]$Endpoint = 'images/generations',
        [int]$TimeoutSec = 600
    )
    $ProgressPreference = 'SilentlyContinue'   # no download progress bar from Invoke-WebRequest
    $uri = $ApiBase.TrimEnd('/') + '/' + $Endpoint.TrimStart('/')
    $params = @{
        Uri                = $uri
        Method             = 'Post'
        Authentication     = 'Bearer'
        Token              = $ApiKey
        SkipHttpErrorCheck = $true
        TimeoutSec         = $TimeoutSec
        ErrorAction        = 'Stop'
    }
    $multipart = $null
    if ($Form) {
        # Invoke-WebRequest takes the Content-Type with its boundary from the MultipartFormDataContent
        $multipart = New-MultipartContent -Parts $Form
        $params['Body'] = $multipart
    } else {
        $json = ConvertTo-Json -InputObject $Body -Depth 5 -Compress
        $params['Body'] = $script:Utf8NoBom.GetBytes($json)
        $params['ContentType'] = 'application/json'
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
    } finally {
        if ($multipart) { $multipart.Dispose() }
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
    $req = @{ ApiBase = $Settings.ApiBase; ApiKey = $ApiKey; TimeoutSec = $Settings.RequestTimeoutSec }
    if (Test-EditJob $Job) {
        $req['Endpoint'] = 'images/edits'
        $req['Form'] = New-ImageEditForm -Job $Job -Settings $Settings   # reads the reference images once per job
    } else {
        $req['Endpoint'] = 'images/generations'
        $req['Body'] = New-ImageRequestBody -Job $Job -Settings $Settings
    }
    $r = $null
    for ($attempt = 1; $attempt -le $Settings.MaxRetries; $attempt++) {
        $Entry['attempts'] = [int]$Entry['attempts'] + 1
        $r = Invoke-ImageRequest @req
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
# Shared command-line plumbing and the run loop (Generate-Images.ps1 and Edit-Images.ps1)
# ---------------------------------------------------------------------------------------------

function Test-EditJob {
    param($Job)
    return [bool]($Job -and $Job.PSObject.Properties['Endpoint'] -and $Job.Endpoint -eq 'edits')
}

function Get-ResumeCommand {
    <# The command to print when a run stops, rebuilt from the script's bound parameters. #>
    param([Parameter(Mandatory)][string]$ScriptPath, [Parameter(Mandatory)][System.Collections.IDictionary]$BoundParameters)
    $parts = @('pwsh', '-File', "'$ScriptPath'")
    foreach ($k in $BoundParameters.Keys) {
        $v = $BoundParameters[$k]
        if ($v -is [switch]) { if ($v.IsPresent) { $parts += "-$k" } }
        elseif ($v -is [array]) { $parts += "-$k"; $parts += (($v | ForEach-Object { "'$_'" }) -join ',') }
        else { $parts += "-$k"; $parts += "'$v'" }
    }
    return ($parts -join ' ')
}

function Get-ApiKeySecure {
    <#
    Asks for the key with hidden input, or uses OPENAI_API_KEY after confirming (-UseEnvKey: without asking).
    Returns a SecureString; the key is never written or printed.
    #>
    param([switch]$UseEnvKey)
    if ($env:OPENAI_API_KEY) {
        $use = [bool]$UseEnvKey
        if (-not $use) {
            $ans = Read-Host 'OPENAI_API_KEY is set in this environment. Use it for this run? [Y/n]'
            $use = ($ans -eq '' -or $ans -match '^(y|yes)$')
        }
        if ($use) { return (ConvertTo-SecureString -String $env:OPENAI_API_KEY -AsPlainText -Force) }
    } elseif ($UseEnvKey) {
        throw '-UseEnvKey was given, but OPENAI_API_KEY is not set.'
    }
    $sec = Read-Host -Prompt 'OpenAI API key (hidden; kept in memory for this run only)' -AsSecureString
    if ($null -eq $sec -or $sec.Length -eq 0) { throw 'No API key entered.' }
    return $sec
}

function Add-PlanToManifest {
    <#
    Records every selected job in the manifest, so it shows the whole picture before the run. Jobs with a
    ManifestExtra dictionary (edit jobs: mode, grid, source, references) get those fields refreshed.
    #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Plan, [Parameter(Mandatory)]$Manifest)
    foreach ($p in $Plan) {
        $key = $p.Job.Key
        if ($null -eq $Manifest['jobs'][$key]) {
            $Manifest['jobs'][$key] = [ordered]@{
                doc = $p.Job.Doc; id = $p.Job.Id; section = $p.Job.Section; size = $p.Job.Size; background = $p.Job.Background
                output = $p.Job.OutputRel; status = 'pending'; attempts = 0; lastError = $null; promptHash = $p.Hash
                createdAt = Get-UtcStamp; startedAt = $null; finishedAt = $null; model = $null; check = $null
            }
            if ($p.Action -eq 'skip') {
                $Manifest['jobs'][$key]['status'] = 'skipped'
                $Manifest['jobs'][$key]['lastError'] = $p.Reason
            }
        }
        if ($p.Job.PSObject.Properties['ManifestExtra'] -and $p.Job.ManifestExtra -and $p.Action -eq 'run') {
            foreach ($k in $p.Job.ManifestExtra.Keys) { $Manifest['jobs'][$key][$k] = $p.Job.ManifestExtra[$k] }
        }
    }
}

function Invoke-ImageJobRun {
    <#
    .SYNOPSIS
    The run loop shared by both scripts: one job after the other with a progress bar, the manifest saved
    atomically before and after every job, PNG checks, the quota/auth/access stop, the consecutive-failure
    stop, the summary and the contact sheet. Returns @{ StopReason; Failed; Done; Flagged }.
    An interrupted run (Ctrl+C) still saves the manifest and prints the summary in the finally block.
    #>
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$ToRun,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs,
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$ManifestPath,
        [Parameter(Mandatory)][string]$OutDir,
        [Parameter(Mandatory)]$Settings,
        [Parameter(Mandatory)][securestring]$ApiKey,
        [int]$MaxConsecutiveFailures = 5,
        [string]$ResumeCommand = '',
        [string]$Activity = 'Generating images',
        [ValidateSet('generate', 'edit')][string]$SheetKind = 'generate',
        [hashtable]$SheetOptions = @{},
        [switch]$NoContactSheet
    )
    $stopReason = $null
    $completed = $false
    $consecutiveFailures = 0
    $ran = [System.Collections.Generic.List[string]]::new()
    $runFailed = [System.Collections.Generic.List[string]]::new()
    $runDone = [System.Collections.Generic.List[string]]::new()
    $runFlagged = [System.Collections.Generic.List[string]]::new()
    $t0 = Get-Date
    try {
        for ($i = 0; $i -lt $ToRun.Count; $i++) {
            $p = $ToRun[$i]
            $job = $p.Job
            $entry = $Manifest['jobs'][$job.Key]
            $pct = [int](100 * $i / $ToRun.Count)
            $eta = ''
            if ($i -gt 0) {
                $per = ((Get-Date) - $t0).TotalSeconds / $i
                $eta = ', about {0:0} min left' -f ($per * ($ToRun.Count - $i) / 60)
            }
            Write-Progress -Activity "$Activity ($($Settings.Model), $($Settings.Quality))" -Status "$($i + 1)/$($ToRun.Count): $($job.Key)$eta" -PercentComplete $pct
            Write-Host "[$($i + 1)/$($ToRun.Count)] $($job.Key) ($($job.Size), $($job.Background)) - $($p.Reason)"

            $entry['status'] = 'pending'
            $entry['startedAt'] = Get-UtcStamp
            $entry['promptHash'] = $p.Hash
            $entry['model'] = $Settings.Model
            $entry['quality'] = $Settings.Quality
            $entry['output'] = $job.OutputRel
            Save-Manifest -Manifest $Manifest -Path $ManifestPath

            $r = Invoke-JobGeneration -Job $job -Entry $entry -Settings $Settings -ApiKey $ApiKey
            $ran.Add($job.Key)
            if ($r.Ok) {
                $bytes = $r.Images[0]
                $check = Test-ImageResult -Bytes $bytes -Background $job.Background -Size (Resolve-ImageSize -Size $job.Size -Model $Settings.Model)
                if (-not $check['isPng']) {
                    $entry['status'] = 'failed'
                    $entry['lastError'] = "response was not a PNG: $(@($check['issues']) -join '; ')"
                    $runFailed.Add($job.Key)
                    $consecutiveFailures++
                } else {
                    if ((Test-Path -LiteralPath $p.File) -and $p.PromptChanged) {
                        # keep the old take of a changed prompt instead of silently overwriting it
                        $old = Join-Path $OutDir ('_replaced/' + $job.OutputRel -replace '\.png$', ('.' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.png'))
                        $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $old)
                        Move-Item -LiteralPath $p.File -Destination $old -Force
                    }
                    Save-BytesAtomic -Path $p.File -Bytes $bytes
                    $entry['status'] = 'done'
                    $entry['lastError'] = $null
                    $entry['check'] = $check
                    $runDone.Add($job.Key)
                    $consecutiveFailures = 0
                    if ($check['ok']) {
                        Write-Host "  saved $($job.OutputRel) ($($check['colorTypeName']), $($check['width'])x$($check['height']))" -ForegroundColor Green
                    } else {
                        $runFlagged.Add($job.Key)
                        Write-Host "  saved $($job.OutputRel), but CHECK FAILED: $(@($check['issues']) -join '; ')" -ForegroundColor Yellow
                    }
                }
            } else {
                $msg = "[$($r.Class)] HTTP $($r.Status)$(if ($r.Code) { " $($r.Code)" }): $($r.Message)"
                $entry['status'] = 'failed'
                $entry['lastError'] = $msg
                $runFailed.Add($job.Key)
                $consecutiveFailures++
                Write-Host "  FAILED $msg" -ForegroundColor Red
                switch ($r.Class) {
                    'fatal_quota' { $stopReason = "insufficient quota or billing limit: $($r.Message). Add credit or raise the limit at platform.openai.com (Settings > Billing / Limits)." }
                    'fatal_auth' { $stopReason = "the API key was rejected (HTTP 401): $($r.Message)" }
                    'fatal_access' { $stopReason = "access denied (HTTP 403): $($r.Message). Image models can require organization verification." }
                }
                if ($r.Class -like 'fatal_*') {
                    # the job itself was not at fault: leave it pending so the next run retries it
                    $entry['status'] = 'pending'
                    $runFailed.Remove($job.Key) | Out-Null
                }
            }
            $entry['finishedAt'] = Get-UtcStamp
            Save-Manifest -Manifest $Manifest -Path $ManifestPath
            if ($stopReason) { break }
            if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
                $stopReason = "$consecutiveFailures jobs in a row failed; check the errors above before spending more."
                break
            }
        }
        if (-not $stopReason) { $completed = $true }
    } finally {
        Write-Progress -Activity $Activity -Completed
        if (-not $completed -and -not $stopReason) { $stopReason = 'interrupted (Ctrl+C)' }
        $Manifest['lastRun']['finishedAt'] = Get-UtcStamp
        $Manifest['lastRun']['stopReason'] = $stopReason
        Save-Manifest -Manifest $Manifest -Path $ManifestPath

        $statuses = foreach ($j in $Jobs) { $e = $Manifest['jobs'][$j.Key]; if ($e) { $e['status'] } else { 'pending' } }
        $counts = $statuses | Group-Object | ForEach-Object { "$($_.Name) $($_.Count)" }
        Write-Host ''
        Write-Host '==================== Summary ====================' -ForegroundColor Cyan
        Write-Host "This run: $($ran.Count) jobs attempted, $($runDone.Count) succeeded, $($runFailed.Count) failed, $($runFlagged.Count) flagged by the PNG check."
        Write-Host "All selected jobs: $($counts -join ', ')"
        foreach ($k in $runFailed) { Write-Host "  failed:  $k  $($Manifest['jobs'][$k]['lastError'])" -ForegroundColor Red }
        foreach ($k in $runFlagged) { Write-Host "  flagged: $k  $(@($Manifest['jobs'][$k]['check']['issues']) -join '; ')" -ForegroundColor Yellow }
        Write-Host "Output:   $OutDir"
        Write-Host "Manifest: $ManifestPath"
        if (-not $NoContactSheet) {
            try {
                $sheet = if ($SheetKind -eq 'edit') { Write-EditContactSheet -OutDir $OutDir -Manifest $Manifest -Jobs $Jobs @SheetOptions }
                         else { Write-ContactSheet -OutDir $OutDir -Manifest $Manifest -Jobs $Jobs }
                Write-Host "Contact sheet: $sheet"
            } catch { Write-Warning "Could not write the contact sheet: $($_.Exception.Message)" }
        }
        if ($stopReason) {
            Write-Host "Stopped: $stopReason" -ForegroundColor Red
            Write-Host 'The manifest is saved. Run the same command again to resume; done jobs are skipped:'
            Write-Host "  $ResumeCommand"
        }
    }
    return [pscustomobject]@{ StopReason = $stopReason; Failed = $runFailed.Count; Done = $runDone.Count; Flagged = $runFlagged.Count }
}

# ---------------------------------------------------------------------------------------------
# Cost and contact sheet
# ---------------------------------------------------------------------------------------------

function Get-CostEstimate {
    <#
    Very rough USD estimate, from the per-image prices quoted in docs/SPRITE_PROMPTS.md for
    1024x1024 (low 0.01, medium 0.04, high 0.17); non-square sizes cost about 1.5x. Check current pricing.
    #>
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs,
        [string]$Quality = 'medium',
        # Edits: rough USD per input (reference) image. Input images are billed as image input tokens;
        # high input fidelity uses more of them. See Edit-Images.ps1 / README for the assumption.
        [double]$PerInputImage = 0.0
    )
    $per = switch ($Quality) { 'low' { 0.011 } 'medium' { 0.042 } 'high' { 0.167 } default { 0.25 } }
    $sum = 0.0
    foreach ($j in $Jobs) {
        $sum += if ($j.Size -eq '1024x1024') { $per } else { $per * 1.5 }
        if ($PerInputImage -gt 0 -and $j.PSObject.Properties['References']) { $sum += $PerInputImage * @($j.References).Count }
    }
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

# ---------------------------------------------------------------------------------------------
# Edits (Edit-Images.ps1): prompt templates, job list, contact sheet
# ---------------------------------------------------------------------------------------------

function Read-EditPrompts {
    <#
    .SYNOPSIS
    Reads tools/image-gen/edit-prompts.md. Only fenced blocks count; everything else is documentation.
      ```modes                      lines "category: bold, pixel" or "category: skip" (folder categories)
      ```mode bold|pixel            the main template of a redraw mode
      ```background transparent|opaque
      ```reference master|style|anchor   how each attached image is described ({INDEX} = its position)
      ```category <name> [mode]     added for jobs of that prompt-doc category (units, ships, goods, ...)
      ```match <pattern>[,...] [mode]    added for sprite ids matching the wildcard(s)
    Placeholders in any block: {N} {CELL} {WIDTH} {HEIGHT} {OUTLINE} {PALETTE}.
    #>
    param([Parameter(Mandatory)][string]$Path)
    $text = [IO.File]::ReadAllText($Path)
    $r = [pscustomobject]@{
        Path       = $Path
        Modes      = [ordered]@{}
        Templates  = @{}
        Background = @{}
        Reference  = @{}
        Category   = [System.Collections.Generic.List[object]]::new()
        Match      = [System.Collections.Generic.List[object]]::new()
    }
    $lines = $text -split '\r?\n'
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -notmatch '^```([a-z][a-z-]*)(?:[ \t]+(.+?))?[ \t]*$') { continue }
        $kind = $Matches[1]
        $argText = if ($Matches.Count -gt 2 -and $Matches[2]) { $Matches[2].Trim() } else { '' }
        $body = [System.Collections.Generic.List[string]]::new()
        $i++
        while ($i -lt $lines.Count -and -not $lines[$i].StartsWith('```')) { $body.Add($lines[$i]); $i++ }
        $b = ($body -join "`n").Trim()
        $words = @($argText -split '\s+' | Where-Object { $_ })
        switch ($kind) {
            'modes' {
                foreach ($l in $body) {
                    $l = ($l -replace '#.*$', '').Trim()
                    if ($l -notmatch '^([a-z0-9-]+)\s*:\s*(.*)$') { continue }
                    $cat = $Matches[1]
                    $ms = @($Matches[2] -split '[,\s]+' | Where-Object { $_ -and $_ -ne 'skip' })
                    foreach ($m in $ms) { if ($m -notin 'bold', 'pixel') { throw "${Path}: unknown mode '$m' for category '$cat' (bold | pixel | skip)" } }
                    $r.Modes[$cat] = $ms
                }
            }
            'mode' {
                if ($words.Count -lt 1 -or $words[0] -notin 'bold', 'pixel') { throw "${Path}: ``````mode needs 'bold' or 'pixel'" }
                $r.Templates[$words[0]] = $b
            }
            'background' {
                if ($words.Count -lt 1 -or $words[0] -notin 'transparent', 'opaque') { throw "${Path}: ``````background needs 'transparent' or 'opaque'" }
                $r.Background[$words[0]] = $b
            }
            'reference' {
                if ($words.Count -lt 1 -or $words[0] -notin 'master', 'style', 'anchor') { throw "${Path}: ``````reference needs master, style or anchor" }
                $r.Reference[$words[0]] = $b
            }
            'category' {
                if ($words.Count -lt 1) { throw "${Path}: ``````category needs a name" }
                $mode = if ($words.Count -gt 1) { $words[1] } else { $null }
                $r.Category.Add([pscustomobject]@{ Name = $words[0]; Mode = $mode; Text = $b })
            }
            'match' {
                if ($words.Count -lt 1) { throw "${Path}: ``````match needs a pattern" }
                $mode = if ($words.Count -gt 1) { $words[1] } else { $null }
                $pats = @($words[0] -split ',' | Where-Object { $_ })
                $r.Match.Add([pscustomobject]@{ Patterns = $pats; Mode = $mode; Text = $b })
            }
        }
    }
    foreach ($m in 'bold', 'pixel') { if (-not $r.Templates.ContainsKey($m)) { throw "${Path}: no ``````mode $m block" } }
    if ($r.Modes.Count -eq 0) { throw "${Path}: no ``````modes block" }
    return $r
}

function Get-PixelGridSize {
    <#
    Output edge for an N-cell pixel grid: N * cell, a multiple of 16 (gpt-image-2 / 2.5 accept any edge
    divisible by 16), as close to the master's edge as possible. 16 -> 1024 (64-px cells), 24 -> 1008
    (42-px cells), 32 -> 1024 (32-px cells).
    #>
    param([Parameter(Mandatory)][int]$N, [int]$Edge = 1024)
    $best = 0
    $c0 = [Math]::Max(1, [int][Math]::Floor($Edge / $N) - 20)
    for ($c = $c0; $c -le $c0 + 40; $c++) {
        $s = $N * $c
        if ($s % 16 -ne 0) { continue }
        if ($best -eq 0 -or [Math]::Abs($s - $Edge) -lt [Math]::Abs($best - $Edge) -or
            ([Math]::Abs($s - $Edge) -eq [Math]::Abs($best - $Edge) -and $s -lt $best)) { $best = $s }
    }
    return $best
}

function Expand-EditPlaceholders {
    param([string]$Text, [hashtable]$Values)
    if (-not $Text) { return $Text }
    $t = $Text
    foreach ($k in $Values.Keys) { $t = $t.Replace('{' + $k + '}', [string]$Values[$k]) }
    return $t
}

function Get-EditJobs {
    <#
    .SYNOPSIS
    Edit jobs from the generator manifest: every entry with status "done" whose master file exists, in the
    modes its category allows (edit-prompts.md ```modes, or -Category to include more), one job per mode
    and grid size. Returns @{ Jobs; Warnings }.
    #>
    param(
        [Parameter(Mandatory)]$SourceManifest,
        [Parameter(Mandatory)][string]$InDir,
        [Parameter(Mandatory)]$Prompts,
        [System.Collections.IDictionary]$DocJobs = @{},
        [string[]]$Mode = @('bold', 'pixel'),
        [int[]]$Grid = @(32),
        [string]$Model = 'gpt-image-2.5-flare',
        [string]$StyleRef,
        [string]$AnchorDir,
        [ValidateSet('sprites', 'boxart', 'all')][string]$Doc = 'sprites',
        [string[]]$Category,
        [string[]]$Only,
        [int]$Variants = 1
    )
    $warnings = [System.Collections.Generic.List[string]]::new()
    $jobs = [System.Collections.Generic.List[object]]::new()
    $palette = '#1b1a17 (ink), #fffdf6 (white), #f3c9a0 (skin), #d23c2a (red), #3a6fb0 (slate blue), #fbf3df (cream), #a8743f (wood), #b9b2a6 (stone), #9a5b2e (hull brown), #ffd23f (gold), #8ed0ec (light blue), #58a548 (green)'
    $wantCats = @($Category | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $styleOk = $false
    if ($StyleRef) {
        if (Test-Path -LiteralPath $StyleRef) { $styleOk = $true }
        else { $warnings.Add("Style reference $StyleRef not found: the edits run without it.") }
    }
    # document order (DocJobs is ordered like the prompt docs), then manifest key, so the list is stable
    $order = @{}
    $idx = 0
    foreach ($k in $DocJobs.Keys) { $order[$k] = $idx; $idx++ }
    $srcKeys = @($SourceManifest['jobs'].Keys | Sort-Object { if ($order.ContainsKey($_)) { $order[$_] } else { [int]::MaxValue } }, { $_ })
    foreach ($srcKey in $srcKeys) {
        $e = $SourceManifest['jobs'][$srcKey]
        if ($null -eq $e -or $e['status'] -ne 'done' -or -not $e['id']) { continue }
        $entryDoc = [string]$e['doc']
        if ($Doc -ne 'all' -and $entryDoc -ne $Doc) { continue }
        $id = [string]$e['id']
        $folderCat = if ($entryDoc -eq 'boxart') { 'boxart' } else { ($id -split '/')[0] }
        if ($folderCat -eq 'bible') { if ($wantCats -notcontains 'bible') { continue } }
        $bg = [string]$e['background']
        $allowed = @()
        if ($Prompts.Modes.Contains($folderCat)) { $allowed = @($Prompts.Modes[$folderCat] | Where-Object { $_ }) }
        if ($wantCats.Count -gt 0) {
            if ($wantCats -notcontains $folderCat) { continue }
            # a category named in -Category but skipped in the rules: bold, plus pixel for transparent sprites
            if ($allowed.Count -eq 0) { $allowed = if ($bg -eq 'transparent') { @('bold', 'pixel') } else { @('bold') } }
        }
        $modes = @($Mode | Where-Object { $allowed -contains $_ })
        if ($modes.Count -eq 0) { continue }
        $master = Join-Path $InDir ([string]$e['output'])
        if (-not (Test-Path -LiteralPath $master)) {
            $warnings.Add("Master for $entryDoc/$id not found at $master (done in the manifest): skipped.")
            continue
        }
        $dj = $DocJobs["$entryDoc/$id"]
        $docCat = if ($dj -and $dj.Category) { [string]$dj.Category } else { $folderCat }
        $subject = if ($dj -and $dj.Subject) { [string]$dj.Subject } else { 'not described in the prompt document; redraw exactly what image 1 shows.' }
        $section = if ($dj) { $dj.Section } else { [string]$e['section'] }
        if ([string]$e['size'] -notmatch '^(\d+)x(\d+)$') { $warnings.Add("$entryDoc/${id}: unknown size '$($e['size'])': skipped."); continue }
        $mw = [int]$Matches[1]; $mh = [int]$Matches[2]
        $masterSha = Get-FileSha256 -Path $master

        foreach ($m in $modes) {
            $gridList = if ($m -eq 'pixel') { @($Grid) } else { @(0) }
            foreach ($n in $gridList) {
                if ($m -eq 'pixel' -and $mw -ne $mh) { $warnings.Add("$entryDoc/${id}: pixel mode needs a square master ($mw x $mh): skipped."); continue }
                $modeDir = if ($m -eq 'pixel') { "pixel-$n" } else { 'bold' }
                $size = if ($m -eq 'pixel') { $edge = Get-PixelGridSize -N $n -Edge $mw; "${edge}x${edge}" } else { "${mw}x${mh}" }
                $size = Resolve-ImageSize -Size $size -Model $Model
                $null = $size -match '^(\d+)x(\d+)$'
                $w = [int]$Matches[1]; $h = [int]$Matches[2]
                $cell = if ($n -gt 0) { $w / [double]$n } else { 0 }
                $cellText = if ($n -gt 0) { if ([Math]::Abs($cell - [Math]::Round($cell)) -lt 1e-9) { '{0}' -f [int]$cell } else { '{0:0.##}' -f $cell } } else { '' }
                $vals = @{
                    N = $n; CELL = $cellText; WIDTH = $w; HEIGHT = $h; PALETTE = $palette
                    OUTLINE = ('{0} to {1}' -f [int][Math]::Round($w * 0.03), [int][Math]::Round($w * 0.04))
                }

                # reference images: the master first, then the style bible, then this category's anchor
                $refs = [System.Collections.Generic.List[object]]::new()
                $refs.Add([pscustomobject]@{ Role = 'master'; Path = $master; Sha256 = $masterSha })
                if ($styleOk -and ([IO.Path]::GetFullPath($StyleRef) -ne [IO.Path]::GetFullPath($master))) {
                    $refs.Add([pscustomobject]@{ Role = 'style'; Path = $StyleRef; Sha256 = (Get-FileSha256 -Path $StyleRef) })
                }
                if ($AnchorDir) {
                    foreach ($cand in @(@($docCat, $folderCat) | Select-Object -Unique)) {
                        $a = Join-Path (Join-Path $AnchorDir $modeDir) "$cand.png"
                        if (Test-Path -LiteralPath $a) {
                            $refs.Add([pscustomobject]@{ Role = 'anchor'; Path = $a; Sha256 = (Get-FileSha256 -Path $a) })
                            break
                        }
                    }
                }

                $parts = [System.Collections.Generic.List[string]]::new()
                $parts.Add((Expand-EditPlaceholders -Text ($Prompts.Templates[$m]) -Values $vals))
                $bgText = $Prompts.Background[$bg]
                if ($bgText) { $parts.Add((Expand-EditPlaceholders $bgText $vals)) }
                $catTexts = @($Prompts.Category | Where-Object { $_.Name -eq $docCat -and (-not $_.Mode -or $_.Mode -eq $m) } | ForEach-Object { Expand-EditPlaceholders $_.Text $vals })
                if ($catTexts.Count) { $parts.Add(($catTexts -join "`n")) }
                $matchTexts = @($Prompts.Match | Where-Object {
                        $mt = $_
                        (-not $mt.Mode -or $mt.Mode -eq $m) -and @($mt.Patterns | Where-Object { $id -like $_ }).Count -gt 0
                    } | ForEach-Object { Expand-EditPlaceholders $_.Text $vals })
                if ($matchTexts.Count) { $parts.Add(($matchTexts -join "`n")) }
                $refLines = [System.Collections.Generic.List[string]]::new()
                for ($k = 0; $k -lt $refs.Count; $k++) {
                    $t = $Prompts.Reference[$refs[$k].Role]
                    if (-not $t) { $t = "Image {INDEX}: $($refs[$k].Role) reference." }
                    $refLines.Add((Expand-EditPlaceholders $t ($vals + @{ INDEX = $k + 1 })))
                }
                $parts.Add(($refLines -join "`n"))
                $parts.Add("SUBJECT OF IMAGE 1 (from its original prompt): $subject")
                $prompt = $parts -join "`n`n"

                $hashInput = "edit-v1|mode=$m|grid=$n|size=$size|background=$bg|" + (($refs | ForEach-Object { "ref:$($_.Role):$($_.Sha256)" }) -join '|') + "|prompt=$prompt"
                $extra = [ordered]@{
                    mode       = $m
                    grid       = $(if ($n -gt 0) { $n } else { $null })
                    sourceId   = "$entryDoc/$id"
                    source     = [string]$e['output']
                    references = @($refs | ForEach-Object { [ordered]@{ role = $_.Role; file = $_.Path; sha256 = $_.Sha256 } })
                }
                $notes = if ($m -eq 'pixel' -and [Math]::Abs($cell - [Math]::Round($cell)) -gt 1e-9) { "cells are $cellText px (not whole pixels) at $size; use a gpt-image-2 / 2.5 model for exact cells" } else { $null }
                $jobs.Add([pscustomobject]@{
                        Doc           = $modeDir
                        Id            = $id
                        BaseId        = $id
                        Variant       = 1
                        Key           = "$modeDir/$id"
                        Section       = "$modeDir < $section"
                        Category      = $folderCat
                        DocCategory   = $docCat
                        Size          = $size
                        Background    = $bg
                        Prompt        = $prompt
                        OutputRel     = "$modeDir/$id.png"
                        Notes         = $notes
                        Subject       = $subject
                        Endpoint      = 'edits'
                        Mode          = $m
                        Grid          = $n
                        SourceId      = "$entryDoc/$id"
                        SourceFile    = $master
                        References    = $refs.ToArray()
                        HashInput     = $hashInput
                        ManifestExtra = $extra
                    })
            }
        }
    }
    $sel = Select-JobsByPattern -Jobs $jobs.ToArray() -Only $Only
    return [pscustomobject]@{ Jobs = (Expand-JobVariants -Jobs $sel -Variants $Variants); Warnings = $warnings.ToArray() }
}

function Write-EditContactSheet {
    <#
    Writes index.html in the edited folder: one row per master with the original, then every redraw
    (bold, pixel-N, variants), each also shown small (browser-scaled; the exact grid snap and the real
    downscale are in the sprite pipeline's contact sheet).
    #>
    param(
        [Parameter(Mandatory)][string]$OutDir,
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Jobs
    )
    $enc = { param($s) [System.Net.WebUtility]::HtmlEncode([string]$s) }
    $rel = {
        param($from, $to)
        $r = [IO.Path]::GetRelativePath($from, $to) -replace '\\', '/'
        ($r -split '/' | ForEach-Object { if ($_ -eq '..') { $_ } else { [uri]::EscapeDataString($_) } }) -join '/'
    }
    $sb = [System.Text.StringBuilder]::new()
    $null = $sb.AppendLine('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
    $null = $sb.AppendLine('<title>Redraw Contact Sheet</title><style>')
    $null = $sb.AppendLine(':root{--bg:#f5eedc;--card:#fffdf6;--ink:#1b1a17;--muted:#6b665c;--bad:#b3261e;--ok:#2e7d32;--chk1:#2b4a6f;--chk2:#36597f;--grass:#a6d878}')
    $null = $sb.AppendLine('@media (prefers-color-scheme: dark){:root{--bg:#1c1b19;--card:#262522;--ink:#f1ece0;--muted:#a9a395}}')
    $null = $sb.AppendLine('body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}h1{font-size:20px;margin:0 0 4px}p.meta{color:var(--muted);margin:0 0 16px;max-width:980px}')
    $null = $sb.AppendLine('.row{background:var(--card);border-radius:8px;padding:8px;margin:0 0 12px;box-shadow:0 1px 2px rgba(0,0,0,.15)}.row h2{font-size:15px;margin:0 0 6px;word-break:break-all}')
    $null = $sb.AppendLine('.cols{display:flex;flex-wrap:wrap;gap:12px}.col{width:220px;min-width:0}.thumb{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:4px;background:repeating-conic-gradient(var(--chk1) 0 25%,var(--chk2) 0 50%) 0 0/24px 24px}')
    $null = $sb.AppendLine('.thumb img{max-width:100%;max-height:100%}.small{color:var(--muted);font-size:12px}.bad{color:var(--bad)}.okc{color:var(--ok)}.key{font-weight:600}')
    $null = $sb.AppendLine('.minis{display:flex;gap:4px;align-items:flex-end;margin-top:4px;flex-wrap:wrap}.minis span{background:var(--grass);padding:2px;line-height:0;border-radius:2px}.px{image-rendering:pixelated}')
    $null = $sb.AppendLine('details{font-size:12px;margin-top:4px}details pre{white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}.empty{color:#dfe6ee;font-size:12px}</style></head><body>')
    $null = $sb.AppendLine("<h1>Redraw Contact Sheet</h1><p class=""meta"">$(& $enc ((Get-Date).ToString('yyyy-MM-dd HH:mm'))) &middot; $($Jobs.Count) jobs. Each row: the original master, then each redraw. The small images are scaled by the browser (pixel redraws with nearest-neighbour, which samples about one point per cell), only for a first impression: for the real comparison run the sprite pipeline with <code>--in</code> on the bold folder and <code>--grid-in</code> on a pixel folder, whose contact sheet puts original, bold and pixel-grid side by side.</p>")
    $groups = [ordered]@{}
    foreach ($j in $Jobs) {
        $k = if ($j.PSObject.Properties['SourceId']) { $j.SourceId } else { $j.Key }
        if (-not $groups.Contains($k)) { $groups[$k] = [System.Collections.Generic.List[object]]::new() }
        $groups[$k].Add($j)
    }
    foreach ($k in $groups.Keys) {
        $list = $groups[$k]
        $first = $list[0]
        $null = $sb.Append("<section class=""row""><h2>$(& $enc $k)</h2><div class=""cols"">")
        if ($first.PSObject.Properties['SourceFile'] -and (Test-Path -LiteralPath $first.SourceFile)) {
            $src = & $rel $OutDir $first.SourceFile
            $null = $sb.Append("<div class=""col""><div class=""thumb""><img loading=""lazy"" src=""$src"" alt=""""></div><div class=""key"">original</div><div class=""minis"">")
            foreach ($n in 32, 48, 64) { $null = $sb.Append("<span><img loading=""lazy"" src=""$src"" width=""$n"" height=""$n"" alt=""""></span>") }
            $null = $sb.Append('</div></div>')
        }
        foreach ($j in $list) {
            $e = $Manifest['jobs'][$j.Key]
            $status = if ($e) { $e['status'] } else { 'pending' }
            $file = Join-Path $OutDir $j.OutputRel
            $null = $sb.Append('<div class="col"><div class="thumb">')
            $has = Test-Path -LiteralPath $file
            $src = $null
            if ($has) {
                $src = ($j.OutputRel -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
                $null = $sb.Append("<img loading=""lazy"" src=""$src"" alt=""$(& $enc $j.Key)"">")
            } else {
                $null = $sb.Append("<span class=""empty"">$(& $enc $status)</span>")
            }
            $label = $j.Doc
            if ($j.Variant -gt 1) { $label += " v$($j.Variant)" }
            $null = $sb.Append("</div><div class=""key"">$(& $enc $label)</div><div class=""small"">$(& $enc $j.Size) &middot; $(& $enc $j.Background) &middot; $(& $enc $status)</div>")
            if ($has) {
                $null = $sb.Append('<div class="minis">')
                if ($j.PSObject.Properties['Mode'] -and $j.Mode -eq 'pixel') {
                    $n = [int]$j.Grid
                    foreach ($z in 1, 2, 4) { $null = $sb.Append("<span><img class=""px"" loading=""lazy"" src=""$src"" width=""$($n * $z)"" height=""$($n * $z)"" alt=""""></span>") }
                } else {
                    foreach ($n in 32, 48, 64) { $null = $sb.Append("<span><img loading=""lazy"" src=""$src"" width=""$n"" height=""$n"" alt=""""></span>") }
                }
                $null = $sb.Append('</div>')
            }
            if ($e -and $e['check'] -is [System.Collections.IDictionary]) {
                $chk = $e['check']
                if ($chk['ok']) { $null = $sb.Append("<div class=""small okc"">PNG check ok ($(& $enc $chk['colorTypeName']))</div>") }
                else { $null = $sb.Append("<div class=""small bad"">$(& $enc (@($chk['issues']) -join '; '))</div>") }
            }
            if ($e -and $e['status'] -eq 'failed' -and $e['lastError']) { $null = $sb.Append("<div class=""small bad"">$(& $enc $e['lastError'])</div>") }
            $null = $sb.Append("<details><summary>prompt</summary><pre>$(& $enc $j.Prompt)</pre></details></div>")
        }
        $null = $sb.AppendLine('</div></section>')
    }
    $null = $sb.AppendLine('</body></html>')
    if (-not (Test-Path -LiteralPath $OutDir)) { $null = New-Item -ItemType Directory -Path $OutDir -Force }
    $path = Join-Path $OutDir 'index.html'
    $tmp = "$path.tmp-$PID"
    [IO.File]::WriteAllText($tmp, $sb.ToString(), $script:Utf8NoBom)
    [IO.File]::Move($tmp, $path, $true)
    return $path
}

Export-ModuleMember -Function ConvertTo-Slug, Get-SpriteJobs, Get-BoxArtJobs, Expand-JobVariants, Select-JobsByPattern, Get-ImageJobs,
    Get-PromptHash, Get-Sha256Hex, Get-FileSha256, Get-UtcStamp, New-Manifest, Read-Manifest, Save-Manifest, Get-JobPlan, Resolve-ImageSize,
    New-ImageRequestBody, Test-InputFidelitySupport, New-ImageEditForm, New-MultipartContent, Invoke-ImageRequest, Get-ErrorClass,
    ConvertFrom-RateLimitDuration, Get-RetryDelaySeconds, Invoke-JobGeneration, Test-ImageResult, Save-BytesAtomic,
    Test-EditJob, Get-ResumeCommand, Get-ApiKeySecure, Add-PlanToManifest, Invoke-ImageJobRun, Get-CostEstimate, Write-ContactSheet,
    Read-EditPrompts, Get-PixelGridSize, Expand-EditPlaceholders, Get-EditJobs, Write-EditContactSheet
