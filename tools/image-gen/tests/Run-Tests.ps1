#Requires -Version 7.0
<#
.SYNOPSIS
Self-contained tests for tools/image-gen (no Pester needed, no network, no real API key).
Run: pwsh -NoProfile -NonInteractive -File tools/image-gen/tests/Run-Tests.ps1
Exit code = number of failed tests.
#>
param([string]$Filter = '*')

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tool = Split-Path -Parent $here
$repo = Split-Path -Parent (Split-Path -Parent $tool)
$script = Join-Path $tool 'Generate-Images.ps1'
$spriteDocReal = Join-Path $repo 'docs/SPRITE_PROMPTS.md'
$boxDocReal = Join-Path $repo 'docs/BOX_ART_PROMPTS.md'
Import-Module (Join-Path $tool 'ImageGen.psm1') -Force
. (Join-Path $here 'FakeOpenAI.ps1')

$secret = 'sk-test-secret-DO-NOT-LEAK-1234567890'
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("image-gen-tests-" + [guid]::NewGuid().ToString('n'))
$null = New-Item -ItemType Directory -Path $scratch

$results = [System.Collections.Generic.List[object]]::new()
function Test([string]$Name, [scriptblock]$Body) {
    if ($Name -notlike $Filter) { return }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $Body
        $results.Add([pscustomobject]@{ Name = $Name; Ok = $true; Error = $null; Ms = $sw.ElapsedMilliseconds })
        Write-Host "PASS  $Name ($($sw.ElapsedMilliseconds) ms)" -ForegroundColor Green
    } catch {
        $results.Add([pscustomobject]@{ Name = $Name; Ok = $false; Error = "$($_.Exception.Message) @ $($_.InvocationInfo.PositionMessage)"; Ms = $sw.ElapsedMilliseconds })
        Write-Host "FAIL  $Name : $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "      $($_.InvocationInfo.PositionMessage)" -ForegroundColor DarkGray
    }
}
function Assert-Equal($Expected, $Actual, [string]$What = '') {
    if ($Expected -ne $Actual) { throw "Expected [$Expected] but got [$Actual] $What" }
}
function Assert-True($Cond, [string]$What = 'condition') { if (-not $Cond) { throw "Expected true: $What" } }
function Assert-Match([string]$Text, [string]$Pattern, [string]$What = '') {
    if ($Text -notmatch $Pattern) { throw "Expected match /$Pattern/ $What; text was: $($Text.Substring(0, [Math]::Min(600, $Text.Length)))" }
}
function Assert-NoMatch([string]$Text, [string]$Pattern, [string]$What = '') {
    if ($Text -match $Pattern) { throw "Did not expect /$Pattern/ $What" }
}

# Writes a small sprite document in the same format as docs/SPRITE_PROMPTS.md.
function New-SpriteFixture([string]$Path, [string[]]$Rows, [string]$MasterExtra = '') {
    $nl = "`n"
    $fence = '```'
    $md = "# Fixture$nl$nl## 2. Master style block$nl$nl${fence}master${nl}STYLE: fixture master.$MasterExtra${nl}${fence}$nl$nl" +
          "### 4.2 Units$nl$nl${fence}category units${nl}FORMAT: fixture unit.${nl}${fence}$nl$nl" +
          "| File | Size | BG | Prompt |$nl| --- | --- | --- | --- |$nl" + (($Rows | Where-Object { $_ -notmatch '^\| `terrain/' }) -join $nl) + $nl + $nl +
          "### 4.7 Terrain$nl$nl${fence}category terrain${nl}FORMAT: fixture tile.${nl}${fence}$nl$nl" +
          "| File | Size | BG | Prompt |$nl| --- | --- | --- | --- |$nl" + (($Rows | Where-Object { $_ -match '^\| `terrain/' }) -join $nl) + $nl
    [IO.File]::WriteAllText($Path, $md)
}
function Row([string]$Id, [string]$Bg, [string]$Prompt, [string]$Size = '1024x1024') { "| ``$Id`` | $Size | $Bg | $Prompt |" }

# Runs Generate-Images.ps1 in this process and returns its exit code and all output as text.
function Invoke-Tool([hashtable]$Params) {
    $global:LASTEXITCODE = 0
    $out = & $script @Params *>&1 | Out-String -Width 300
    [pscustomobject]@{ Exit = $LASTEXITCODE; Out = $out }
}

try {
    # ------------------------------------------------------------------ parsing the real docs
    Test 'sprites doc parses into 294 jobs with unique ids' {
        $jobs = Get-SpriteJobs -Path $spriteDocReal
        Assert-Equal 294 $jobs.Count 'sprite jobs'
        Assert-Equal 294 (@($jobs.Id | Sort-Object -Unique)).Count 'unique ids'
        Assert-Equal 'bible/style-bible' $jobs[0].Id 'first job is the style bible'
        Assert-Equal '1536x1024' $jobs[0].Size
        Assert-Equal 'opaque' $jobs[0].Background
        Assert-Equal 13 (@($jobs.Category | Sort-Object -Unique)).Count 'categories'
        Assert-Equal 161 (@($jobs | Where-Object { $_.Category -eq 'units' })).Count 'colonist role sprites (27 x 6 - 1)'
        Assert-True (-not ($jobs.Id -contains 'units/native-convert__missionary')) 'no native-convert missionary'
        Assert-Equal 22 (@($jobs | Where-Object Background -eq 'opaque')).Count 'opaque jobs (bible + 13 terrain + 8 plowed)'
        Assert-Equal 3 (@($jobs | Where-Object Size -eq '1536x1024')).Count 'wide jobs: bible, caption frame, title emblem'
        Assert-True (@($jobs | Where-Object { $_.OutputRel -notlike 'sprites/*.png' }).Count -eq 0) 'outputs under sprites/'
    }

    Test 'sprite prompts are master + category block + SUBJECT line' {
        $jobs = Get-SpriteJobs -Path $spriteDocReal
        $j = $jobs | Where-Object Id -eq 'units/free-colonist__none'
        Assert-Match $j.Prompt '^STYLE: clean-line European comic illustration' 'starts with the master block'
        Assert-Match $j.Prompt 'DO NOT INCLUDE: any text' 'master block complete'
        Assert-Match $j.Prompt 'FORMAT: A single game unit sprite\.' 'units category block'
        Assert-Match $j.Prompt "`n`nSUBJECT: a free colonist, a sturdy young man" 'subject line'
        Assert-Equal 'transparent' $j.Background
        Assert-Equal 'sprites/units/free-colonist__none.png' $j.OutputRel
        Assert-Match $j.Section 'freeColonist' 'section includes the #### type heading'
        $t = $jobs | Where-Object Id -eq 'terrain/ocean'
        Assert-Match $t.Prompt 'FORMAT: A seamless square map tile' 'terrain category block'
        Assert-Equal 'opaque' $t.Background
        Assert-NoMatch $j.Prompt 'tinted\(img' 'code samples are not part of prompts'
    }

    Test 'box art doc parses into 8 jobs (13 with -IncludeTitle)' {
        $jobs = Get-BoxArtJobs -Path $boxDocReal
        Assert-Equal 8 $jobs.Count 'box art jobs'
        $ids = ($jobs.Id -join ',')
        Assert-Equal 'front-a-landfall,front-b-trade-at-the-river,front-c-the-growing-colony,front-d-the-explorers-map,front-e-liberty,back-cover,wide-banner,app-icon' $ids
        Assert-Equal '1024x1536' ($jobs | Where-Object Id -eq 'front-a-landfall').Size
        Assert-Equal '1024x1536' ($jobs | Where-Object Id -eq 'back-cover').Size
        Assert-Equal '1536x1024' ($jobs | Where-Object Id -eq 'wide-banner').Size
        Assert-Equal '1024x1024' ($jobs | Where-Object Id -eq 'app-icon').Size
        Assert-True (@($jobs | Where-Object Background -ne 'opaque').Count -eq 0) 'covers are opaque'
        $a = $jobs[0]
        Assert-Match $a.Prompt '^STYLE: A painted-looking but strictly flat' 'cover style block first'
        Assert-Match $a.Prompt "`n`nFRONT COVER, portrait\. Morning on a wild Atlantic coast" 'concept appended'
        Assert-Match ($jobs | Where-Object Id -eq 'wide-banner').Notes 'reference image' 'banner note about the reference image'
        $titled = Get-BoxArtJobs -Path $boxDocReal -IncludeTitle
        Assert-Equal 13 $titled.Count 'with titles'
        $t = $titled | Where-Object Id -eq 'front-a-landfall__titled'
        Assert-Match $t.Prompt 'TITLE: In the empty sky band' 'title add-on appended'
        Assert-NoMatch $t.Prompt 'any text, letters' 'no-text rule removed for titled run'
        Assert-Match $a.Prompt 'any text, letters' 'no-text rule kept for normal run'
    }

    Test 'filters and variants' {
        $all = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal
        Assert-Equal 302 $all.Count 'all jobs'
        $f = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc sprites -Only 'units/free-colonist*'
        Assert-Equal 6 $f.Count 'free colonist roles'
        $g = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Only 'caravel', 'boxart/front-*'
        Assert-Equal 6 $g.Count 'substring + wildcard patterns'
        $v = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc boxart -Only 'app-icon' -Variants 3
        Assert-Equal 'boxart/app-icon,boxart/app-icon__v2,boxart/app-icon__v3' ($v.Key -join ',')
        Assert-Equal 'boxart/app-icon__v3.png' $v[2].OutputRel
        Assert-Equal (Get-PromptHash $v[0]) (Get-PromptHash $v[2]) 'variants share the prompt'
    }

    # ------------------------------------------------------------------ CLI: list / dry run
    Test '-List shows the jobs and counts without asking for a key' {
        $saved = $env:OPENAI_API_KEY; $env:OPENAI_API_KEY = $null
        try { $r = Invoke-Tool @{ List = $true } } finally { $env:OPENAI_API_KEY = $saved }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'Jobs: 302 \(sprites: 294, boxart: 8\)'
        Assert-Match $r.Out 'sprites/units/man-of-war__none'
    }

    Test '-DryRun prints assembled prompts, sends nothing, writes nothing' {
        $out = Join-Path $scratch 'dry'
        $saved = $env:OPENAI_API_KEY; $env:OPENAI_API_KEY = $null
        try { $r = Invoke-Tool @{ DryRun = $true; Doc = 'boxart'; Only = 'app-icon'; OutDir = $out; Variants = 2 } } finally { $env:OPENAI_API_KEY = $saved }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'boxart/app-icon   \[would run: new\]'
        Assert-Match $r.Out 'boxart/app-icon__v2'
        Assert-Match $r.Out 'model=gpt-image-2\.5-flare size=1024x1024 quality=medium background=opaque output_format=png n=1 moderation=auto'
        Assert-Match $r.Out 'APP ICON, square\. A single bold emblem'
        Assert-Match $r.Out 'Dry run: 2 jobs \(boxart: 2\); 2 would call the API'
        Assert-True (-not (Test-Path (Join-Path $out 'manifest.json'))) 'no manifest written'
    }

    Test '-DryRun of a transparent sprite requests background=transparent' {
        $r = Invoke-Tool @{ DryRun = $true; Doc = 'sprites'; Only = 'goods/food'; OutDir = (Join-Path $scratch 'dry2'); Quality = 'high' }
        Assert-Match $r.Out 'size=1024x1024 quality=high background=transparent output_format=png'
        Assert-Match $r.Out 'SUBJECT: Food: a ripe ear of maize'
    }

    # ------------------------------------------------------------------ helpers
    Test 'size mapping' {
        Assert-Equal '1024x1536' (Resolve-ImageSize '1024x1536' 'gpt-image-1')
        Assert-Equal '1536x1024' (Resolve-ImageSize '1792x1024' 'gpt-image-1')
        Assert-Equal '1024x1536' (Resolve-ImageSize '800x1400' 'gpt-image-1.5')
        Assert-Equal '1024x1024' (Resolve-ImageSize '512x512' 'gpt-image-1-mini')
        Assert-Equal '1536x864' (Resolve-ImageSize '1536x864' 'gpt-image-2.5-flare')
        Assert-Equal '1536x1024' (Resolve-ImageSize '1500x1000' 'gpt-image-2.5-flare') 'not divisible by 16'
        Assert-Equal '1536x1024' (Resolve-ImageSize '4000x1000' 'gpt-image-2') 'aspect beyond 3:1'
    }

    Test 'error classification' {
        Assert-Equal 'fatal_quota' (Get-ErrorClass -Status 429 -Code 'insufficient_quota' -Type 'insufficient_quota' -Message 'You exceeded your current quota')
        Assert-Equal 'fatal_quota' (Get-ErrorClass -Status 400 -Code 'billing_hard_limit_reached' -Message 'Billing hard limit has been reached')
        Assert-Equal 'rate_limit' (Get-ErrorClass -Status 429 -Code 'rate_limit_exceeded' -Message 'Rate limit reached for images per minute')
        Assert-Equal 'fatal_auth' (Get-ErrorClass -Status 401 -Code 'invalid_api_key')
        Assert-Equal 'fatal_access' (Get-ErrorClass -Status 403 -Message 'Your organization must be verified')
        Assert-Equal 'policy' (Get-ErrorClass -Status 400 -Code 'moderation_blocked' -Message 'rejected by our safety system')
        Assert-Equal 'policy' (Get-ErrorClass -Status 400 -Code 'content_policy_violation')
        Assert-Equal 'server' (Get-ErrorClass -Status 503)
        Assert-Equal 'network' (Get-ErrorClass -Status 0 -Code 'network')
        Assert-Equal 'invalid' (Get-ErrorClass -Status 400 -Code 'invalid_value' -Message 'Invalid size')
    }

    Test 'retry delays honour server hints and back off exponentially' {
        $rng = [System.Random]::new(1)
        $d = Get-RetryDelaySeconds -Headers @{ 'retry-after' = '7' } -Attempt 1 -Status 429 -Random $rng
        Assert-True ($d -ge 7 -and $d -le 7.5) "Retry-After 7 -> $d"
        $d = Get-RetryDelaySeconds -Headers @{ 'retry-after-ms' = '1500'; 'retry-after' = '9' } -Attempt 1 -Status 429 -Random $rng
        Assert-True ($d -ge 1.5 -and $d -le 2) "retry-after-ms wins -> $d"
        $d = Get-RetryDelaySeconds -Headers @{ 'x-ratelimit-remaining-requests' = '0'; 'x-ratelimit-reset-requests' = '1m30s'; 'x-ratelimit-remaining-tokens' = '5'; 'x-ratelimit-reset-tokens' = '5m' } -Attempt 1 -Status 429 -Random $rng
        Assert-True ($d -ge 90 -and $d -le 90.5) "exhausted request limit resets in 90 s -> $d"
        $date = [DateTimeOffset]::UtcNow.AddSeconds(5).ToString('r')
        $d = Get-RetryDelaySeconds -Headers @{ 'retry-after' = $date } -Attempt 1 -Status 503 -Random $rng
        Assert-True ($d -ge 3 -and $d -le 6) "HTTP-date Retry-After -> $d"
        foreach ($a in 1..4) {
            $d = Get-RetryDelaySeconds -Headers @{} -Attempt $a -Status 500 -BaseSeconds 2 -Random $rng
            $exp = 2 * [Math]::Pow(2, $a - 1)
            Assert-True ($d -ge $exp / 2 -and $d -le $exp) "attempt $a backoff $d within [$($exp/2), $exp]"
        }
        $d = Get-RetryDelaySeconds -Headers @{ 'retry-after' = '999' } -Attempt 1 -Status 429 -MaxSeconds 120 -Random $rng
        Assert-Equal 120 $d 'capped'
        Assert-Equal 0.02 (ConvertFrom-RateLimitDuration '20ms')
        Assert-Equal 360 (ConvertFrom-RateLimitDuration '6m0s')
        Assert-Equal 3723.5 (ConvertFrom-RateLimitDuration '1h2m3.5s')
    }

    Test 'PNG check: real alpha, missing alpha, painted checkerboard' {
        $alpha = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('alpha', 64)) -Background transparent
        Assert-True $alpha['ok'] "RGBA with transparent pixels passes: $($alpha['issues'] -join '; ')"
        Assert-Equal 6 $alpha['colorType']
        Assert-True ($alpha['transparentFraction'] -gt 0.5) 'mostly transparent'
        $rgb = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('rgb', 64)) -Background transparent
        Assert-True (-not $rgb['ok']) 'RGB fails a transparent job'
        Assert-Match ($rgb['issues'] -join ';') 'no alpha channel \(PNG colour type 2, RGB\)'
        $op = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('opaque-alpha', 64)) -Background transparent
        Assert-Match ($op['issues'] -join ';') 'alpha channel present but no transparent pixels'
        $chk = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('checker', 64)) -Background transparent
        Assert-True $chk['checkerboardSuspected'] 'checkerboard detected'
        Assert-Match ($chk['issues'] -join ';') 'painted grey and white checkerboard'
        $flat = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('rgb', 64)) -Background opaque
        Assert-True $flat['ok'] 'RGB passes an opaque job'
        Assert-True (-not $flat['checkerboardSuspected']) 'flat background is not a checkerboard'
        $tr = Test-ImageResult -Bytes ([ImageGenTool.PngWriter]::Sample('alpha', 64)) -Background opaque
        Assert-Match ($tr['issues'] -join ';') 'opaque, full-bleed' 'transparent pixels flagged on an opaque job'
        $bad = Test-ImageResult -Bytes ([Text.Encoding]::ASCII.GetBytes('this is not a png file at all, honestly')) -Background opaque
        Assert-True (-not $bad['isPng']) 'not a PNG'
    }

    Test 'PNG check on the repo images: images/units have fake transparency' {
        foreach ($f in Get-ChildItem (Join-Path $repo 'images/units') -Filter *.png) {
            $c = Test-ImageResult -Bytes ([IO.File]::ReadAllBytes($f.FullName)) -Background transparent
            Assert-True (-not $c['ok']) "$($f.Name) flagged"
            Assert-Equal 2 $c['colorType'] "$($f.Name) colour type"
            Assert-True $c['checkerboardSuspected'] "$($f.Name) painted checkerboard detected"
        }
        $b = [ImageGenTool.PngInspector]::InspectFile((Join-Path $repo 'images/bible.png'))
        Assert-True $b.IsPng 'bible is a PNG'
        Assert-True $b.PixelsAnalysed "bible pixels decoded: $($b.Error)"
        $cover = Test-ImageResult -Bytes ([IO.File]::ReadAllBytes((Join-Path $repo 'images/covers/landfall.png'))) -Background opaque
        Assert-True $cover['ok'] "cover passes as opaque: $($cover['issues'] -join '; ')"
    }

    Test 'manifest save is atomic and round-trips' {
        $p = Join-Path $scratch 'm/manifest.json'
        $m = New-Manifest
        $m['jobs']['sprites/a'] = [ordered]@{ status = 'done'; attempts = 2 }
        Save-Manifest -Manifest $m -Path $p
        Save-Manifest -Manifest $m -Path $p
        $back = Read-Manifest -Path $p
        Assert-Equal 'done' $back['jobs']['sprites/a']['status']
        Assert-Equal 0 (@(Get-ChildItem (Split-Path $p) -Filter '*.tmp-*')).Count 'no temp files left'
        [IO.File]::WriteAllText($p, '{ "jobs": { broken')
        $fresh = Read-Manifest -Path $p 3>$null
        Assert-Equal 0 $fresh['jobs'].Count 'corrupt manifest replaced by a new one'
        Assert-True (@(Get-ChildItem (Split-Path $p) -Filter 'manifest.json.corrupt-*').Count -eq 1) 'corrupt copy kept'
    }

    # ------------------------------------------------------------------ against the fake server
    $srv = Start-FakeOpenAIServer -ExpectedKey $secret
    $env:OPENAI_API_KEY = $secret
    $common = @{ Doc = 'sprites'; ApiBase = $srv.ApiBase; Yes = $true; UseEnvKey = $true; RetryBaseSeconds = 0.2; MaxRetryDelaySeconds = 5 }

    Test 'end to end: success, resume, missing file, prompt change, -KeepChanged' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'e2e.md'
        $out = Join-Path $scratch 'e2e-out'
        New-SpriteFixture $doc @(
            (Row 'units/alpha-one__none' 'transparent' 'first unit [[scenario:ok]]'),
            (Row 'units/alpha-two__none' 'transparent' 'second unit [[scenario:ok]]'),
            (Row 'terrain/flat' 'opaque' 'flat tile [[scenario:ok]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $r.Exit "first run exit; output: $($r.Out)"
        Assert-Equal 3 $srv.State.Requests.Count 'three API calls'
        $req = $srv.State.Requests[0]
        Assert-Equal "Bearer $secret" $req.Auth 'bearer token sent'
        Assert-Match $req.ContentType 'application/json'
        Assert-Equal 'gpt-image-2.5-flare' $req.Body.model
        Assert-Equal 'transparent' $req.Body.background
        Assert-Equal 'png' $req.Body.output_format
        Assert-Equal 1 $req.Body.n
        Assert-Equal '1024x1024' $req.Body.size
        Assert-Match $req.Body.prompt '^STYLE: fixture master\.\n\nFORMAT: fixture unit\.\n\nSUBJECT: first unit'
        Assert-Equal 'opaque' $srv.State.Requests[2].Body.background
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        foreach ($k in 'sprites/units/alpha-one__none', 'sprites/units/alpha-two__none', 'sprites/terrain/flat') {
            Assert-Equal 'done' $m['jobs'][$k]['status'] $k
            Assert-Equal 1 $m['jobs'][$k]['attempts'] "$k attempts"
            Assert-True $m['jobs'][$k]['check']['ok'] "$k PNG check"
            Assert-True ($m['jobs'][$k]['promptHash'] -match '^[0-9a-f]{64}$') "$k hash"
            Assert-True ($m['jobs'][$k]['startedAt'] -and $m['jobs'][$k]['finishedAt']) "$k timestamps"
        }
        $png = [ImageGenTool.PngInspector]::InspectFile((Join-Path $out 'sprites/units/alpha-one__none.png'))
        Assert-Equal 6 $png.ColorType 'saved RGBA'
        Assert-True (Test-Path (Join-Path $out 'index.html')) 'contact sheet'
        Assert-Match ([IO.File]::ReadAllText((Join-Path $out 'index.html'))) 'sprites/units/alpha-two__none'

        # resume: nothing to do
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $r.Exit
        Assert-Equal 0 $srv.State.Requests.Count 'no API calls on re-run'
        Assert-Match $r.Out 'Nothing to generate'

        # a deleted output file is regenerated
        Remove-Item (Join-Path $out 'sprites/units/alpha-two__none.png')
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 1 $srv.State.Requests.Count 'missing file regenerated'
        Assert-Match $srv.State.Requests[0].Body.prompt 'second unit'

        # prompt text changed -> pending again, unless -KeepChanged
        New-SpriteFixture $doc @(
            (Row 'units/alpha-one__none' 'transparent' 'first unit, now with a hat [[scenario:ok]]'),
            (Row 'units/alpha-two__none' 'transparent' 'second unit [[scenario:ok]]'),
            (Row 'terrain/flat' 'opaque' 'flat tile [[scenario:ok]]')
        )
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; KeepChanged = $true })
        Assert-Equal 0 $srv.State.Requests.Count '-KeepChanged keeps the old image'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; DryRun = $true })
        Assert-Match $r.Out 'sprites/units/alpha-one__none   \[would run: prompt changed\]'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 1 $srv.State.Requests.Count 'changed prompt regenerated'
        Assert-Match $srv.State.Requests[0].Body.prompt 'now with a hat'
        Assert-True (@(Get-ChildItem (Join-Path $out '_replaced') -Recurse -Filter '*.png').Count -eq 1) 'old take kept in _replaced'

        # a master-block change invalidates every job
        New-SpriteFixture $doc @(
            (Row 'units/alpha-one__none' 'transparent' 'first unit, now with a hat [[scenario:ok]]'),
            (Row 'units/alpha-two__none' 'transparent' 'second unit [[scenario:ok]]'),
            (Row 'terrain/flat' 'opaque' 'flat tile [[scenario:ok]]')
        ) -MasterExtra ' Thicker lines.'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; DryRun = $true })
        Assert-Match $r.Out 'Dry run: 3 jobs \(sprites: 3\); 3 would call the API'
    }

    Test 'variants become separate files and manifest entries' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'var.md'
        $out = Join-Path $scratch 'var-out'
        New-SpriteFixture $doc @((Row 'units/vee__none' 'transparent' 'variant unit [[scenario:ok]]'))
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; Variants = 3 })
        Assert-Equal 0 $r.Exit
        Assert-Equal 3 $srv.State.Requests.Count
        foreach ($n in 'vee__none.png', 'vee__none__v2.png', 'vee__none__v3.png') { Assert-True (Test-Path (Join-Path $out "sprites/units/$n")) $n }
    }

    Test '429 with Retry-After is honoured, then succeeds' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'r429.md'
        $out = Join-Path $scratch 'r429-out'
        New-SpriteFixture $doc @(
            (Row 'units/rl__none' 'transparent' 'rate limited [[scenario:rate429]]'),
            (Row 'units/rr__none' 'transparent' 'reset header [[scenario:ratereset]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Equal 4 $srv.State.Requests.Count 'two calls per job'
        $gap = ($srv.State.Requests[1].Time - $srv.State.Requests[0].Time).TotalSeconds
        Assert-True ($gap -ge 0.95) "waited for Retry-After: 1 (gap $gap s)"
        $gap2 = ($srv.State.Requests[3].Time - $srv.State.Requests[2].Time).TotalSeconds
        Assert-True ($gap2 -ge 0.95) "waited for x-ratelimit-reset-requests: 1s (gap $gap2 s)"
        Assert-Match $r.Out 'rate limited \(429\); retrying'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'done' $m['jobs']['sprites/units/rl__none']['status']
        Assert-Equal 2 $m['jobs']['sprites/units/rl__none']['attempts']
    }

    Test '500 errors are retried with backoff; persistent 500 fails the job' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'r500.md'
        $out = Join-Path $scratch 'r500-out'
        New-SpriteFixture $doc @(
            (Row 'units/flaky__none' 'transparent' 'flaky [[scenario:err500]]'),
            (Row 'units/broken__none' 'transparent' 'broken [[scenario:always500]]'),
            (Row 'units/after__none' 'transparent' 'after [[scenario:ok]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; MaxRetries = 3 })
        Assert-Equal 1 $r.Exit 'exit 1 when a job failed'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'done' $m['jobs']['sprites/units/flaky__none']['status']
        Assert-Equal 3 $m['jobs']['sprites/units/flaky__none']['attempts']
        Assert-Equal 'failed' $m['jobs']['sprites/units/broken__none']['status']
        Assert-Equal 3 $m['jobs']['sprites/units/broken__none']['attempts']
        Assert-Match $m['jobs']['sprites/units/broken__none']['lastError'] '\[server\] HTTP 500'
        Assert-Equal 'done' $m['jobs']['sprites/units/after__none']['status'] 'run continued'
        Assert-Match $r.Out 'server error \(500\); retrying'
    }

    Test 'content-policy refusal fails the job and the run continues' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'pol.md'
        $out = Join-Path $scratch 'pol-out'
        New-SpriteFixture $doc @(
            (Row 'units/refused__none' 'transparent' 'refused [[scenario:policy]]'),
            (Row 'units/fine__none' 'transparent' 'fine [[scenario:ok]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 1 $r.Exit
        Assert-Equal 2 $srv.State.Requests.Count 'policy refusal is not retried'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'failed' $m['jobs']['sprites/units/refused__none']['status']
        Assert-Match $m['jobs']['sprites/units/refused__none']['lastError'] '\[policy\] HTTP 400 moderation_blocked: Your request was rejected'
        Assert-Equal 'done' $m['jobs']['sprites/units/fine__none']['status']
        # -SkipFailed leaves it alone; a normal re-run retries it
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; SkipFailed = $true })
        Assert-Equal 0 $srv.State.Requests.Count '-SkipFailed'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 1 $srv.State.Requests.Count 'failed job retried on re-run'
    }

    Test 'insufficient_quota stops the run cleanly and the next run resumes' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'quota.md'
        $out = Join-Path $scratch 'quota-out'
        New-SpriteFixture $doc @(
            (Row 'units/q-one__none' 'transparent' 'one [[scenario:ok]]'),
            (Row 'units/q-two__none' 'transparent' 'two [[scenario:quota]]'),
            (Row 'units/q-three__none' 'transparent' 'three [[scenario:ok]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 2 $r.Exit 'exit 2 on a stop'
        Assert-Equal 2 $srv.State.Requests.Count 'no retry and no further calls after insufficient_quota'
        Assert-Match $r.Out 'Stopped: insufficient quota'
        Assert-Match $r.Out 'Run the same command again to resume'
        Assert-Match $r.Out ([regex]::Escape('-SpriteDoc'))
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'done' $m['jobs']['sprites/units/q-one__none']['status']
        Assert-Equal 'pending' $m['jobs']['sprites/units/q-two__none']['status'] 'quota job stays pending'
        Assert-Equal 'pending' $m['jobs']['sprites/units/q-three__none']['status']
        Assert-Match $m['lastRun']['stopReason'] 'insufficient quota'
        # credit added: re-run resumes with the remaining two
        New-SpriteFixture $doc @(
            (Row 'units/q-one__none' 'transparent' 'one [[scenario:ok]]'),
            (Row 'units/q-two__none' 'transparent' 'two [[scenario:ok]]'),
            (Row 'units/q-three__none' 'transparent' 'three [[scenario:ok]]')
        )
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $r.Exit
        Assert-Equal 2 $srv.State.Requests.Count 'resumed with the two pending jobs'
    }

    Test 'repeated failures stop the run' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'rep.md'
        $out = Join-Path $scratch 'rep-out'
        New-SpriteFixture $doc @(1..5 | ForEach-Object { Row "units/p$($_)__none" 'transparent' "refused $_ [[scenario:policy]]" })
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; MaxConsecutiveFailures = 3 })
        Assert-Equal 2 $r.Exit
        Assert-Equal 3 $srv.State.Requests.Count
        Assert-Match $r.Out '3 jobs in a row failed'
    }

    Test 'wrong key stops the run' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'auth.md'
        $out = Join-Path $scratch 'auth-out'
        New-SpriteFixture $doc @((Row 'units/a1__none' 'transparent' 'a [[scenario:ok]]'), (Row 'units/a2__none' 'transparent' 'b [[scenario:ok]]'))
        $env:OPENAI_API_KEY = 'sk-wrong'
        try { $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out }) } finally { $env:OPENAI_API_KEY = $secret }
        Assert-Equal 2 $r.Exit
        Assert-Equal 1 $srv.State.Requests.Count
        Assert-Match $r.Out 'the API key was rejected'
    }

    Test 'fake transparency in a response is flagged; -RedoFlagged regenerates it' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'fake.md'
        $out = Join-Path $scratch 'fake-out'
        New-SpriteFixture $doc @((Row 'units/checker__none' 'transparent' 'checker [[scenario:fakealpha]]'))
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Match $r.Out 'CHECK FAILED: no alpha channel'
        Assert-Match $r.Out 'flagged: sprites/units/checker__none'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'done' $m['jobs']['sprites/units/checker__none']['status']
        Assert-True (-not $m['jobs']['sprites/units/checker__none']['check']['ok'])
        Assert-True $m['jobs']['sprites/units/checker__none']['check']['checkerboardSuspected']
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $srv.State.Requests.Count 'flagged jobs are kept by default'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; RedoFlagged = $true })
        Assert-Equal 1 $srv.State.Requests.Count '-RedoFlagged'
    }

    Test 'existing file without a manifest entry is skipped unless -Force' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'exist.md'
        $out = Join-Path $scratch 'exist-out'
        New-SpriteFixture $doc @((Row 'units/old__none' 'transparent' 'old [[scenario:ok]]'))
        $null = New-Item -ItemType Directory -Force (Join-Path $out 'sprites/units')
        [IO.File]::WriteAllBytes((Join-Path $out 'sprites/units/old__none.png'), [ImageGenTool.PngWriter]::Sample('alpha', 8))
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $srv.State.Requests.Count
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'skipped' $m['jobs']['sprites/units/old__none']['status']
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; Force = $true })
        Assert-Equal 1 $srv.State.Requests.Count '-Force'
    }

    Test '-MaxJobs limits the calls in one run' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'max.md'
        $out = Join-Path $scratch 'max-out'
        New-SpriteFixture $doc @(1..4 | ForEach-Object { Row "units/m$($_)__none" 'transparent' "m $_ [[scenario:ok]]" })
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; MaxJobs = 2 })
        Assert-Equal 2 $srv.State.Requests.Count
        Assert-Match $r.Out 'This run will make 2 image generation calls'
    }

    Test 'killing the process mid-run leaves a valid manifest' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'kill.md'
        $out = Join-Path $scratch 'kill-out'
        New-SpriteFixture $doc @((Row 'units/k1__none' 'transparent' 'k1 [[scenario:ok]]'), (Row 'units/k2__none' 'transparent' 'k2 [[scenario:slow]]'), (Row 'units/k3__none' 'transparent' 'k3 [[scenario:ok]]'))
        $pwsh = (Get-Process -Id $PID).Path
        $procArgs = @('-NoProfile', '-NonInteractive', '-File', $script, '-Doc', 'sprites', '-SpriteDoc', $doc, '-OutDir', $out, '-ApiBase', $srv.ApiBase, '-Yes', '-UseEnvKey')
        $proc = Start-Process -FilePath $pwsh -ArgumentList $procArgs -PassThru -RedirectStandardOutput (Join-Path $scratch 'kill.stdout') -RedirectStandardError (Join-Path $scratch 'kill.stderr')
        $deadline = (Get-Date).AddSeconds(60)
        while (@($srv.State.Requests | Where-Object Scenario -eq 'slow').Count -eq 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 100 }
        Start-Sleep -Milliseconds 500
        Stop-Process -Id $proc.Id -Force
        $proc.WaitForExit()
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'done' $m['jobs']['sprites/units/k1__none']['status']
        Assert-Equal 'pending' $m['jobs']['sprites/units/k2__none']['status'] 'interrupted job stays pending'
        Assert-Equal 'pending' $m['jobs']['sprites/units/k3__none']['status']
        Start-Sleep -Seconds 4   # let the slow request finish on the server
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out })
        Assert-Equal 0 $r.Exit
        Assert-Equal 2 @($srv.State.Requests | Where-Object { $_.Body.prompt -match 'k2|k3' }).Count 'resumed the two unfinished jobs'
    }

    Test 'the API key never reaches disk or output' {
        $hits = Get-ChildItem $scratch -Recurse -File | Where-Object { [IO.File]::ReadAllText($_.FullName) -match [regex]::Escape($secret) }
        Assert-Equal 0 @($hits).Count "files containing the key: $($hits.FullName -join ', ')"
        $r = Invoke-Tool ($common + @{ SpriteDoc = (Join-Path $scratch 'e2e.md'); OutDir = (Join-Path $scratch 'e2e-out'); Force = $true })
        Assert-NoMatch $r.Out ([regex]::Escape($secret)) 'console output'
        $hits = Get-ChildItem $scratch -Recurse -File | Where-Object { [IO.File]::ReadAllText($_.FullName) -match [regex]::Escape($secret) }
        Assert-Equal 0 @($hits).Count 'after a forced run'
    }
} finally {
    if ($srv) { Stop-FakeOpenAIServer $srv }
    $env:OPENAI_API_KEY = $null
    Remove-Item -Recurse -Force $scratch -ErrorAction SilentlyContinue
}

$failed = @($results | Where-Object { -not $_.Ok })
Write-Host ''
Write-Host "$($results.Count - $failed.Count) passed, $($failed.Count) failed" -ForegroundColor ($(if ($failed.Count) { 'Red' } else { 'Green' }))
foreach ($f in $failed) { Write-Host "  $($f.Name): $($f.Error)" -ForegroundColor Red }
exit $failed.Count
