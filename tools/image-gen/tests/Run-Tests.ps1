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
$editScript = Join-Path $tool 'Edit-Images.ps1'
$editPromptsReal = Join-Path $tool 'edit-prompts.md'
$thumbPromptsReal = Join-Path $tool 'thumb-prompts.md'
$committedManifest = Join-Path $tool 'output/manifest.json'
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

# Runs Edit-Images.ps1 the same way.
function Invoke-EditTool([hashtable]$Params) {
    $global:LASTEXITCODE = 0
    $out = & $editScript @Params *>&1 | Out-String -Width 300
    [pscustomobject]@{ Exit = $LASTEXITCODE; Out = $out }
}

# A fake generator output folder for Edit-Images.ps1: masters under sprites/, a manifest.json with the
# given rows (Id, Subject, Bg = transparent, Status = done, NoFile), the style bible, and a prompt doc
# with the subjects. Returns @{ Doc; Style }.
function New-EditFixture([string]$Dir, [object[]]$Rows) {
    $null = New-Item -ItemType Directory -Force (Join-Path $Dir 'sprites/bible')
    $style = Join-Path $Dir 'sprites/bible/style-bible.png'
    if (-not (Test-Path $style)) { [IO.File]::WriteAllBytes($style, [ImageGenTool.PngWriter]::Sample('rgb', 32)) }
    $m = New-Manifest
    $m['jobs']['sprites/bible/style-bible'] = [ordered]@{ doc = 'sprites'; id = 'bible/style-bible'; size = '1536x1024'; background = 'opaque'; output = 'sprites/bible/style-bible.png'; status = 'done' }
    $docRows = @()
    foreach ($row in $Rows) {
        $bg = if ($row.Bg) { $row.Bg } else { 'transparent' }
        $status = if ($row.Status) { $row.Status } else { 'done' }
        $rel = "sprites/$($row.Id).png"
        $m['jobs']["sprites/$($row.Id)"] = [ordered]@{ doc = 'sprites'; id = $row.Id; size = '1024x1024'; background = $bg; output = $rel; status = $status }
        $f = Join-Path $Dir $rel
        if (-not $row.NoFile -and -not (Test-Path $f)) {
            $null = New-Item -ItemType Directory -Force (Split-Path -Parent $f)
            [IO.File]::WriteAllBytes($f, [ImageGenTool.PngWriter]::Sample($(if ($bg -eq 'transparent') { 'alpha' } else { 'rgb' }), 64))
        }
        $docRows += Row $row.Id $bg $row.Subject
    }
    Save-Manifest -Manifest $m -Path (Join-Path $Dir 'manifest.json')
    $doc = Join-Path $Dir 'doc.md'
    New-SpriteFixture $doc $docRows
    return @{ Doc = $doc; Style = $style }
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

    Test 'box art doc parses into 18 jobs (33 with -IncludeTitle)' {
        $jobs = Get-BoxArtJobs -Path $boxDocReal
        Assert-Equal 18 $jobs.Count 'box art jobs'
        $ids = ($jobs.Id -join ',')
        Assert-Equal 'front-a-landfall,front-b-trade-at-the-river,front-c-the-growing-colony,front-d-the-explorers-map,front-e-liberty,front-f-winter-quarters,front-g-the-great-river,front-h-a-feast-of-nations,front-i-two-harbours,front-j-the-silver-road,front-k-the-lost-city,front-l-australia-the-first-harbour,front-m-australia-into-the-outback,front-n-vinland-the-longships,front-o-vinland-the-first-winter,back-cover,wide-banner,app-icon' $ids
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
        Assert-Equal 33 $titled.Count 'with titles'
        Assert-Equal '1024x1536' ($titled | Where-Object Id -eq 'front-l-australia-the-first-harbour').Size 'a SETTING line before the format line keeps the portrait size'
        $t = $titled | Where-Object Id -eq 'front-a-landfall__titled'
        Assert-Match $t.Prompt 'TITLE: In the empty sky band' 'title add-on appended'
        Assert-NoMatch $t.Prompt 'any text, letters' 'no-text rule removed for titled run'
        Assert-Match $a.Prompt 'any text, letters' 'no-text rule kept for normal run'
    }

    Test 'filters and variants' {
        $all = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal
        Assert-Equal 312 $all.Count 'all jobs'
        $f = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc sprites -Only 'units/free-colonist*'
        Assert-Equal 6 $f.Count 'free colonist roles'
        $g = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Only 'caravel', 'boxart/front-*'
        Assert-Equal 16 $g.Count 'substring + wildcard patterns'
        $v = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc boxart -Only 'app-icon' -Variants 3
        Assert-Equal 'boxart/app-icon,boxart/app-icon__v2,boxart/app-icon__v3' ($v.Key -join ',')
        Assert-Equal 'boxart/app-icon__v3.png' $v[2].OutputRel
        Assert-Equal (Get-PromptHash $v[0]) (Get-PromptHash $v[2]) 'variants share the prompt'
    }

    # ------------------------------------------------------------------ thumbnails (-Variant thumb|both)
    Test 'thumbs: prompt file, own keys, paths and hashes; full jobs unchanged' {
        $tp = Read-ThumbPrompts -Path $thumbPromptsReal
        Assert-True ($tp.Skip -contains 'bible') 'style bible skipped'
        Assert-True ($tp.Tile -contains 'terrain' -and $tp.Tile -contains 'ground-overlays') 'tile categories'
        $full = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal
        $fullDefault = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant full -ThumbPrompts $tp
        Assert-Equal (($full | ForEach-Object { "$($_.Key)=$(Get-PromptHash $_)" }) -join ';') (($fullDefault | ForEach-Object { "$($_.Key)=$(Get-PromptHash $_)" }) -join ';') '-Variant full is the default job list'
        $thumbs = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant thumb -ThumbPrompts $tp
        Assert-Equal 293 $thumbs.Count 'one thumbnail per sprite except the style bible; no box art'
        Assert-True (@($thumbs | Where-Object { $_.Key -notlike 'thumbs/*' -or $_.OutputRel -ne "thumbs/$($_.Id).png" -or $_.Doc -ne 'thumbs' -or $_.Kind -ne 'thumb' }).Count -eq 0) 'thumbs/<category>/<id> keys and paths'
        Assert-True (-not ($thumbs.Id -contains 'bible/style-bible')) 'no bible thumbnail'
        $both = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant both -ThumbPrompts $tp
        Assert-Equal 605 $both.Count 'both = 312 full + 293 thumbs'
        $docOrder = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant both -ThumbPrompts $tp -DocumentOrder
        Assert-Equal 'sprites/bible/style-bible,sprites/units/free-colonist__none,thumbs/units/free-colonist__none,sprites/units/free-colonist__soldier' (($docOrder[0..3] | ForEach-Object Key) -join ',') '-DocumentOrder: each full job followed by its thumbnail'
        Assert-Equal 'sprites/bible/style-bible' $both[0].Key 'style bible first'
        Assert-Equal ($both[1].Key -replace '^sprites/', 'thumbs/') $both[2].Key 'each full job followed by its thumbnail'
        $sprites = @($both | Where-Object Doc -eq 'sprites')
        Assert-True ($sprites[1].Id -like 'ui/*') 'reverse section order: UI pieces right after the bible'
        Assert-True ($sprites[-1].Id -like 'units/*') 'reverse section order: colonist units last'
        $firstUnit = [array]::IndexOf(@($sprites.Id), (@($sprites.Id) | Where-Object { $_ -like 'units/*' } | Select-Object -First 1))
        Assert-True (@($sprites[$firstUnit..($sprites.Count - 1)] | Where-Object { $_.Id -notlike 'units/*' }).Count -eq 0) 'units form the final block'
        $fullHashes = @{}; foreach ($j in $full) { $fullHashes[$j.Key] = Get-PromptHash $j }
        foreach ($j in ($both | Where-Object Kind -eq 'full')) { Assert-Equal $fullHashes[$j.Key] (Get-PromptHash $j) "$($j.Key) hash unchanged with -Variant both" }

        $f = $full | Where-Object Key -eq 'sprites/units/expert-lumberjack__none'
        $t = $thumbs | Where-Object Key -eq 'thumbs/units/expert-lumberjack__none'
        Assert-Equal 'sprites/units/expert-lumberjack__none' $t.FullKey
        Assert-Equal 'transparent' $t.Background
        Assert-Equal '1024x1024' $t.Size
        Assert-Equal 'icon' $t.ThumbStyle
        Assert-True ((Get-PromptHash $t) -ne (Get-PromptHash $f)) 'own prompt hash'
        Assert-Match $t.Prompt '^THUMBNAIL VERSION\. This image is an icon for a 32-pixel game sprite' 'line rule first'
        Assert-True ($t.Prompt.Contains($f.Prompt)) 'the full prompt is included unchanged'
        $iSubject = $t.Prompt.IndexOf('SUBJECT: '); $iOverride = $t.Prompt.IndexOf('THUMBNAIL OVERRIDE.')
        Assert-True ($iSubject -gt 0 -and $iOverride -gt $iSubject) 'the override comes after the full prompt'
        Assert-Match $t.Prompt '61 to 82 pixels on this 1024x1024 image' 'outline placeholder'
        Assert-Match $t.Prompt 'BACKGROUND: fully transparent' 'background block'
        Assert-Match $t.Prompt 'FIGURE: a large head and hat' 'units category block'
        Assert-Match $t.Prompt 'axe head very large' 'per-sprite block'
        Assert-Match $t.Prompt 'REMEMBER, THE MOST IMPORTANT RULE: every outline is a very thick[\s\S]*with oversized props held clear of the body\.$' 'line rule last'
        Assert-Match ($thumbs | Where-Object Id -eq 'units/expert-lumberjack__missionary').Prompt 'white \(#fffdf6\) collar and a broad white sash'
        Assert-Match ($thumbs | Where-Object Id -eq 'units/caravel__none').Prompt 'at most 3 thick lines for the masts'
        $o = $thumbs | Where-Object Id -eq 'terrain/ocean'
        Assert-Equal 'tile' $o.ThumbStyle
        Assert-Equal 'opaque' $o.Background
        Assert-Match $o.Prompt '^THUMBNAIL VERSION of a map tile'
        Assert-Match $o.Prompt 'TILE: keep it a seamless, full-bleed'
        Assert-Match $o.Prompt 'BACKGROUND: an opaque, full-bleed square'
        Assert-NoMatch $o.Prompt 'road-sign' 'tiles do not get the outline-everything icon rule'
        Assert-Match ($thumbs | Where-Object Id -eq 'ui/caption-frame').Prompt '61 to 82 pixels on this 1536x1024 image' 'outline from the shorter side'

        $v = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant thumb -ThumbPrompts $tp -Only 'units/caravel__none' -Variants 2
        Assert-Equal 'thumbs/units/caravel__none,thumbs/units/caravel__none__v2' (($v | ForEach-Object Key) -join ',')
        Assert-Equal 'thumbs/units/caravel__none__v2.png' $v[1].OutputRel
        Assert-Equal 'sprites/units/caravel__none__v2' $v[1].FullKey 'take 2 pairs with full take 2'
        Assert-Equal 'sprites/units/caravel__none__v2' $v[1].ManifestExtra['fullKey']
        Assert-Equal 'sprites/units/caravel__none' $v[0].ManifestExtra['fullKey'] 'take 1 untouched by the copy'
        Assert-Equal 0 (Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc boxart -Variant thumb -ThumbPrompts $tp).Count 'no box-art thumbnails'
        Assert-Equal 18 (Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Doc boxart -Variant both -ThumbPrompts $tp).Count 'both: covers only as full'
        Assert-Equal 0 (Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant thumb -ThumbPrompts $tp -Only 'bible/*').Count 'no bible thumbnail'
    }

    Test 'thumbs: the committed manifest keeps every full prompt hash (default -Variant full)' {
        if (-not (Test-Path $committedManifest)) { Write-Host "      (skipped: no tools/image-gen/output/manifest.json; it is kept locally, not in git)"; return }
        $out = Join-Path $scratch 'committed'
        $null = New-Item -ItemType Directory -Force $out
        Copy-Item $committedManifest (Join-Path $out 'manifest.json')
        $before = [IO.File]::ReadAllText((Join-Path $out 'manifest.json'))
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 302 $m['jobs'].Count 'committed manifest: 302 jobs'
        $jobs = Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal
        $all = @(Get-JobPlan -Jobs $jobs -Manifest $m -OutDir $out)
        Assert-Equal 312 $all.Count
        # The two road spokes were rewritten on purpose (meandering roads), so they re-queue.
        $rewritten = 'sprites/decor/road__spoke', 'sprites/decor/road__spoke-diagonal'
        $changed = @($all | Where-Object { $_.Job.Key -in $rewritten })
        Assert-Equal 2 @($changed | Where-Object PromptChanged).Count 'the rewritten road prompts re-queue'
        $plan = @($all | Where-Object { $m['jobs'].Contains($_.Job.Key) -and $_.Job.Key -notin $rewritten })
        Assert-Equal 300 $plan.Count 'every other committed job is still in the list'
        Assert-Equal 10 @($all | Where-Object { $_.Action -eq 'run' -and $_.Reason -eq 'new' }).Count 'the ten new covers are new jobs'
        foreach ($p in $plan) {
            Assert-Equal $m['jobs'][$p.Job.Key]['promptHash'] $p.Hash "$($p.Job.Key) prompt hash"
            Assert-True (-not $p.PromptChanged) "$($p.Job.Key) not changed"
        }
        $tp = Read-ThumbPrompts -Path $thumbPromptsReal
        $tplan = @(Get-JobPlan -Jobs (Get-ImageJobs -SpriteDoc $spriteDocReal -BoxArtDoc $boxDocReal -Variant thumb -ThumbPrompts $tp) -Manifest $m -OutDir $out)
        Assert-True (@($tplan | Where-Object { $_.Action -ne 'run' -or $_.Reason -ne 'new' }).Count -eq 0) 'every thumbnail is a new job'
        # the CLI: no full job reads as changed; the dry runs write nothing
        $r = Invoke-Tool @{ DryRun = $true; OutDir = $out }
        Assert-Equal 0 $r.Exit
        Assert-NoMatch $r.Out 'prompt changed' 'no output files here, so every job reads as "output file missing"'
        Assert-NoMatch $r.Out '(?-i)THUMBNAIL OVERRIDE' 'no thumbnail by default'
        $r = Invoke-Tool @{ DryRun = $true; OutDir = $out; Variant = 'thumb'; Only = 'units/expert-lumberjack__none' }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'thumbs/units/expert-lumberjack__none   \[would run: new\]'
        Assert-Match $r.Out 'variant: thumb \(icon blocks of thumb-prompts\.md\), full version: sprites/units/expert-lumberjack__none'
        Assert-Match $r.Out ([regex]::Escape((Join-Path $out 'thumbs/units/expert-lumberjack__none.png')))
        Assert-Match $r.Out 'THUMBNAIL OVERRIDE\. These rules replace'
        Assert-Match $r.Out 'background=transparent'
        Assert-Match $r.Out 'Dry run: 1 jobs \(thumbs: 1\); 1 would call the API'
        Assert-Equal $before ([IO.File]::ReadAllText((Join-Path $out 'manifest.json'))) 'manifest untouched by the dry runs'
    }

    Test 'thumbs: -List counts and the box-art note' {
        $r = Invoke-Tool @{ List = $true; Variant = 'thumb' }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'Jobs: 293 \(thumbs: 293\)'
        Assert-Match $r.Out 'thumbs/units/man-of-war__none'
        $r = Invoke-Tool @{ List = $true; Variant = 'both' }
        Assert-Match $r.Out 'Jobs: 605 \(sprites: 294, boxart: 18, thumbs: 293\)'
        $r = Invoke-Tool @{ List = $true; Variant = 'thumb'; Doc = 'boxart' }
        Assert-Match $r.Out 'box art has no thumbnail variant'
        $r = Invoke-Tool @{ DryRun = $true; Variant = 'thumb'; Doc = 'boxart'; OutDir = (Join-Path $scratch 'dry-box') }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'No jobs match the selection'
    }

    # ------------------------------------------------------------------ CLI: list / dry run
    Test '-List shows the jobs and counts without asking for a key' {
        $saved = $env:OPENAI_API_KEY; $env:OPENAI_API_KEY = $null
        try { $r = Invoke-Tool @{ List = $true } } finally { $env:OPENAI_API_KEY = $saved }
        Assert-Equal 0 $r.Exit
        Assert-Match $r.Out 'Jobs: 312 \(sprites: 294, boxart: 18\)'
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
        # Sections run in reverse (units last): the terrain tile first, then the two units in order.
        $req = $srv.State.Requests[1]
        Assert-Equal "Bearer $secret" $req.Auth 'bearer token sent'
        Assert-Match $req.ContentType 'application/json'
        Assert-Equal 'gpt-image-2.5-flare' $req.Body.model
        Assert-Equal 'transparent' $req.Body.background
        Assert-Equal 'png' $req.Body.output_format
        Assert-Equal 1 $req.Body.n
        Assert-Equal '1024x1024' $req.Body.size
        Assert-Match $req.Body.prompt '^STYLE: fixture master\.\n\nFORMAT: fixture unit\.\n\nSUBJECT: first unit'
        Assert-Equal 'opaque' $srv.State.Requests[0].Body.background
        Assert-Match $srv.State.Requests[2].Body.prompt 'SUBJECT: second unit'
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

    Test 'thumbs: a thumb run on a copy of the committed manifest; full entries untouched; resume per variant' {
        if (-not (Test-Path $committedManifest)) { Write-Host "      (skipped: no tools/image-gen/output/manifest.json; it is kept locally, not in git)"; return }
        Reset-FakeOpenAIServer $srv
        $out = Join-Path $scratch 'thumb-e2e'
        $null = New-Item -ItemType Directory -Force $out
        Copy-Item $committedManifest (Join-Path $out 'manifest.json')
        $orig = Read-Manifest (Join-Path $out 'manifest.json')
        $origJson = @{}
        foreach ($k in $orig['jobs'].Keys) { $origJson[$k] = ConvertTo-Json -InputObject $orig['jobs'][$k] -Depth 10 -Compress }
        $one = @{ Only = 'units/expert-lumberjack__none'; OutDir = $out }

        $r = Invoke-Tool ($common + $one + @{ Variant = 'thumb' })
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Equal 1 $srv.State.Requests.Count 'one thumbnail call'
        Assert-Match $r.Out 'thumbnails: 1, full images: 0'
        $q = $srv.State.Requests[0]
        Assert-Equal '/v1/images/generations' $q.Path
        Assert-Equal 'transparent' $q.Body.background
        Assert-Match $q.Body.prompt '^THUMBNAIL VERSION'
        Assert-Match $q.Body.prompt 'SUBJECT: an expert lumberjack'
        Assert-Match $q.Body.prompt 'THUMBNAIL OVERRIDE\.'
        Assert-True (Test-Path (Join-Path $out 'thumbs/units/expert-lumberjack__none.png')) 'thumbnail file'
        Assert-True (-not (Test-Path (Join-Path $out 'sprites'))) 'no full image made'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 303 $m['jobs'].Count '302 full entries + 1 thumbnail'
        $e = $m['jobs']['thumbs/units/expert-lumberjack__none']
        Assert-Equal 'done' $e['status']
        Assert-Equal 'thumbs' $e['doc']
        Assert-Equal 'units/expert-lumberjack__none' $e['id']
        Assert-Equal 'thumbs/units/expert-lumberjack__none.png' $e['output']
        Assert-Equal 'thumb' $e['variant']
        Assert-Equal 'icon' $e['thumbStyle']
        Assert-Equal 'sprites/units/expert-lumberjack__none' $e['fullKey']
        Assert-True $e['check']['ok'] 'PNG check'
        Assert-True ($e['promptHash'] -ne $m['jobs']['sprites/units/expert-lumberjack__none']['promptHash']) 'own hash'
        Assert-Equal 'thumb' $m['lastRun']['variant']
        foreach ($k in $origJson.Keys) {
            Assert-Equal $origJson[$k] (ConvertTo-Json -InputObject $m['jobs'][$k] -Depth 10 -Compress) "$k untouched"
        }

        # resume: the thumbnail is done
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + $one + @{ Variant = 'thumb' })
        Assert-Equal 0 $srv.State.Requests.Count 'thumbnail not made twice'
        Assert-Match $r.Out 'Nothing to generate'
        # the full image (done in the committed manifest; put a file there, as on the user's machine) is still done
        $null = New-Item -ItemType Directory -Force (Join-Path $out 'sprites/units')
        [IO.File]::WriteAllBytes((Join-Path $out 'sprites/units/expert-lumberjack__none.png'), [ImageGenTool.PngWriter]::Sample('alpha', 64))
        $r = Invoke-Tool ($common + $one)
        Assert-Equal 0 $srv.State.Requests.Count 'full: done in the committed manifest'
        $r = Invoke-Tool ($common + $one + @{ Variant = 'both' })
        Assert-Equal 0 $srv.State.Requests.Count 'both: both done'
        $sheet = [IO.File]::ReadAllText((Join-Path $out 'index.html'))
        Assert-Match $sheet 'sprites/units/expert-lumberjack__none \(full \| thumb\)' 'one card for both versions'
        Assert-Match $sheet 'src="thumbs/units/expert-lumberjack__none\.png"'
        Assert-Match $sheet 'src="sprites/units/expert-lumberjack__none\.png"'
        # a deleted thumbnail is made again, only the thumbnail
        Remove-Item (Join-Path $out 'thumbs/units/expert-lumberjack__none.png')
        $r = Invoke-Tool ($common + $one)
        Assert-Equal 0 $srv.State.Requests.Count '-Variant full ignores the thumbnails'
        $sheet = [IO.File]::ReadAllText((Join-Path $out 'index.html'))
        Assert-NoMatch $sheet '\(full \| thumb\)' 'no pair without a thumbnail file'
        $r = Invoke-Tool ($common + $one + @{ Variant = 'both' })
        Assert-Equal 1 $srv.State.Requests.Count 'the missing thumbnail only'
        Assert-Match $srv.State.Requests[0].Body.prompt '^THUMBNAIL VERSION'
        # a full-only run shows the thumbnail from disk next to the full image
        $r = Invoke-Tool ($common + $one)
        Assert-Match ([IO.File]::ReadAllText((Join-Path $out 'index.html'))) '\(full \| thumb\)' 'thumbnail from disk shown next to the full image'

        # editing thumb-prompts.md re-queues the thumbnails, never the full images
        $tpf = Join-Path $scratch 'thumb-prompts-edited.md'
        [IO.File]::WriteAllText($tpf, ([IO.File]::ReadAllText($thumbPromptsReal) -replace 'THUMBNAIL VERSION\. This image is an icon', 'THUMBNAIL VERSION. This image is a bold icon'))
        $r = Invoke-Tool ($common + $one + @{ Variant = 'both'; DryRun = $true; ThumbPromptFile = $tpf })
        Assert-Match $r.Out 'thumbs/units/expert-lumberjack__none   \[would run: prompt changed\]'
        Assert-Match $r.Out 'sprites/units/expert-lumberjack__none   \[skip: done\]'
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + $one + @{ Variant = 'thumb'; ThumbPromptFile = $tpf })
        Assert-Equal 1 $srv.State.Requests.Count
        Assert-Match $srv.State.Requests[0].Body.prompt 'a bold icon'
        Assert-True (@(Get-ChildItem (Join-Path $out '_replaced/thumbs') -Recurse -Filter '*.png').Count -eq 1) 'old thumbnail kept in _replaced/thumbs'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal $origJson['sprites/units/expert-lumberjack__none'] (ConvertTo-Json -InputObject $m['jobs']['sprites/units/expert-lumberjack__none'] -Depth 10 -Compress) 'the full entry is still untouched'
    }

    Test 'thumbs: -Variant both on a fixture, variants, a failing thumbnail is retried on its own' {
        Reset-FakeOpenAIServer $srv
        $doc = Join-Path $scratch 'thumb-both.md'
        $out = Join-Path $scratch 'thumb-both-out'
        New-SpriteFixture $doc @(
            (Row 'units/tb-one__none' 'transparent' 'first unit [[scenario:ok]]'),
            (Row 'terrain/tb-flat' 'opaque' 'flat tile [[scenario:ok]]')
        )
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; Variant = 'both'; Variants = 2 })
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Equal 8 $srv.State.Requests.Count '2 sprites x 2 takes x (full + thumb)'
        foreach ($rel in 'sprites/units/tb-one__none.png', 'sprites/units/tb-one__none__v2.png', 'thumbs/units/tb-one__none.png', 'thumbs/units/tb-one__none__v2.png', 'sprites/terrain/tb-flat.png', 'thumbs/terrain/tb-flat.png') {
            Assert-True (Test-Path (Join-Path $out $rel)) $rel
        }
        $thumbTile = @($srv.State.Requests | Where-Object { $_.Body.prompt -match '^THUMBNAIL VERSION of a map tile' })
        Assert-Equal 2 $thumbTile.Count 'tile thumbnails use the tile blocks'
        Assert-Equal 'opaque' $thumbTile[0].Body.background 'terrain thumbnails stay opaque'
        $m = Read-Manifest (Join-Path $out 'manifest.json')
        Assert-Equal 'sprites/units/tb-one__none__v2' $m['jobs']['thumbs/units/tb-one__none__v2']['fullKey']
        # one thumbnail fails (its entry alone), and is retried alone on the next run
        $m['jobs']['thumbs/units/tb-one__none']['status'] = 'failed'
        Save-Manifest -Manifest $m -Path (Join-Path $out 'manifest.json')
        Reset-FakeOpenAIServer $srv
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; Variant = 'both'; Variants = 2; SkipFailed = $true })
        Assert-Equal 0 $srv.State.Requests.Count '-SkipFailed applies to thumbnails too'
        $r = Invoke-Tool ($common + @{ SpriteDoc = $doc; OutDir = $out; Variant = 'both'; Variants = 2 })
        Assert-Equal 1 $srv.State.Requests.Count 'only the failed thumbnail'
        Assert-Match $srv.State.Requests[0].Body.prompt '^THUMBNAIL VERSION\. This image is an icon'
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

    # ------------------------------------------------------------------ Edit-Images.ps1 (images/edits)
    $editCommon = @{ ApiBase = $srv.ApiBase; Yes = $true; UseEnvKey = $true; RetryBaseSeconds = 0.2; MaxRetryDelaySeconds = 5 }

    Test 'edits: fixture jobs, modes per category, references, prompt assembly' {
        $dir = Join-Path $scratch 'ed-jobs'
        $fx = New-EditFixture $dir @(
            @{ Id = 'units/alpha__none'; Subject = 'first unit [[scenario:ok]]' },
            @{ Id = 'units/alpha__missionary'; Subject = 'a missionary [[scenario:ok]]' },
            @{ Id = 'terrain/flat'; Bg = 'opaque'; Subject = 'flat tile [[scenario:ok]]' },
            @{ Id = 'decor/tree'; Subject = 'a tree [[scenario:ok]]' },
            @{ Id = 'units/missing__none'; Subject = 'no file'; NoFile = $true },
            @{ Id = 'units/later__none'; Subject = 'not made yet'; Status = 'pending' }
        )
        $prompts = Read-EditPrompts -Path $editPromptsReal
        $docList = Get-SpriteJobs -Path $fx.Doc
        $docJobs = [ordered]@{}; foreach ($j in $docList) { $docJobs[$j.Key] = $j }
        $src = Read-Manifest -Path (Join-Path $dir 'manifest.json')
        $b = Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -DocJobs $docJobs -StyleRef $fx.Style -AnchorDir (Join-Path $dir 'anchors')
        Assert-Equal 'bold/units/alpha__none,pixel-32/units/alpha__none,bold/units/alpha__missionary,pixel-32/units/alpha__missionary,bold/terrain/flat' (($b.Jobs | ForEach-Object Key) -join ',')
        Assert-Match ($b.Warnings -join ';') 'units/missing__none not found' 'missing master warned'
        $bold = $b.Jobs[0]; $pix = $b.Jobs[1]
        Assert-Equal 'edits' $bold.Endpoint
        Assert-Equal 'bold/units/alpha__none.png' $bold.OutputRel
        Assert-Equal 'master,style' ((@($bold.References) | ForEach-Object Role) -join ',') 'master first, then the style bible'
        Assert-Equal (Join-Path $dir 'sprites/units/alpha__none.png') $bold.References[0].Path
        Assert-Equal 'transparent' $bold.Background
        Assert-Equal '1024x1024' $bold.Size
        Assert-Match $bold.Prompt '^Redraw image 1 as a small-size game sprite' 'bold template first'
        Assert-Match $bold.Prompt '31 to 41 pixels wide on this 1024-pixel image' 'outline placeholder'
        Assert-Match $bold.Prompt 'BACKGROUND: fully transparent' 'background block'
        Assert-Match $bold.Prompt 'Image 1 is the original master to redraw' 'reference lines'
        Assert-Match $bold.Prompt 'Image 2 is the game''s style bible' 'style reference line'
        Assert-Match $bold.Prompt 'SUBJECT OF IMAGE 1 \(from its original prompt\): first unit' 'subject from the doc'
        Assert-Match $bold.Prompt 'FIGURE: the figure''s head' 'units category block'
        Assert-Match $bold.Prompt 'trade tool is the most important part' 'match block for __none'
        Assert-NoMatch $bold.Prompt 'blocks tall minus the margins' 'pixel-only category block not in bold'
        Assert-Match $pix.Prompt 'exactly 32 by 32 pixels' 'grid size'
        Assert-Match $pix.Prompt '32 by 32 image pixels' 'cell size'
        Assert-Match $pix.Prompt 'blocks tall minus the margins' 'pixel-only category block'
        Assert-Match $b.Jobs[2].Prompt 'white \(#fffdf6\) collar' 'missionary match block'
        $t = $b.Jobs[4]
        Assert-Equal 'opaque' $t.Background
        Assert-Match $t.Prompt 'TILE: keep it a seamless, full-bleed' 'terrain block'
        Assert-Match $t.Prompt 'BACKGROUND: an opaque, full-bleed square'
        Assert-True ($bold.HashInput -match "ref:master:$($bold.References[0].Sha256)") 'hash input has the master hash'
        Assert-True ((Get-PromptHash $bold) -ne (Get-PromptHash $pix)) 'modes hash differently'

        # -Category brings in a skipped category; -Grid makes one job per size; -Mode filters
        $c = Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -DocJobs $docJobs -Category decor -Grid 16, 24
        Assert-Equal 'bold/decor/tree,pixel-16/decor/tree,pixel-24/decor/tree' (($c.Jobs | ForEach-Object Key) -join ',')
        Assert-Equal '1024x1024' $c.Jobs[1].Size
        Assert-Equal '1008x1008' $c.Jobs[2].Size '24 cells of 42 px'
        Assert-Match $c.Jobs[2].Prompt '42 by 42 image pixels'
        Assert-Equal 'master' ((@($c.Jobs[0].References) | ForEach-Object Role) -join ',') 'no style ref given'
        $d = Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -DocJobs $docJobs -Mode pixel -Only 'missionary'
        Assert-Equal 'pixel-32/units/alpha__missionary' (($d.Jobs | ForEach-Object Key) -join ',')
        $g1 = Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -DocJobs $docJobs -Mode pixel -Grid 24 -Model 'gpt-image-1.5' -Only 'alpha__none'
        Assert-Equal '1024x1024' $g1.Jobs[0].Size 'standard sizes only on gpt-image-1.5'
        Assert-Match $g1.Jobs[0].Notes 'not whole pixels'
        # an anchor for the category is attached third
        $null = New-Item -ItemType Directory -Force (Join-Path $dir 'anchors/bold')
        [IO.File]::WriteAllBytes((Join-Path $dir 'anchors/bold/units.png'), [ImageGenTool.PngWriter]::Sample('alpha', 16))
        $e = Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -DocJobs $docJobs -StyleRef $fx.Style -AnchorDir (Join-Path $dir 'anchors') -Mode bold -Only 'alpha__none'
        Assert-Equal 'master,style,anchor' ((@($e.Jobs[0].References) | ForEach-Object Role) -join ',')
        Assert-Match $e.Jobs[0].Prompt 'Image 3 is an approved small-size redraw'
        Assert-True ((Get-PromptHash $e.Jobs[0]) -ne (Get-PromptHash $bold)) 'an anchor changes the hash'
    }

    Test 'edits: input_fidelity only where the SDK supports it; form fields' {
        Assert-Equal 'high' (Test-InputFidelitySupport -Model 'gpt-image-1.5')
        Assert-Equal 'high' (Test-InputFidelitySupport -Model 'gpt-image-1')
        Assert-Equal $null (Test-InputFidelitySupport -Model 'gpt-image-1-mini')
        Assert-Equal 'low' (Test-InputFidelitySupport -Model 'gpt-image-1-mini' -Requested low)
        Assert-Equal $null (Test-InputFidelitySupport -Model 'gpt-image-2')
        Assert-Equal $null (Test-InputFidelitySupport -Model 'gpt-image-2.5-flare')
        Assert-Equal $null (Test-InputFidelitySupport -Model 'gpt-image-1.5' -Requested omit)
        Assert-Equal 1024 (Get-PixelGridSize -N 16)
        Assert-Equal 1008 (Get-PixelGridSize -N 24)
        Assert-Equal 1024 (Get-PixelGridSize -N 32)
        $dir = Join-Path $scratch 'ed-form'
        $fx = New-EditFixture $dir @(@{ Id = 'units/f__none'; Subject = 'form [[scenario:ok]]' })
        $prompts = Read-EditPrompts -Path $editPromptsReal
        $src = Read-Manifest -Path (Join-Path $dir 'manifest.json')
        $j = (Get-EditJobs -SourceManifest $src -InDir $dir -Prompts $prompts -StyleRef $fx.Style -Mode bold).Jobs[0]
        $settings = [pscustomobject]@{ Model = 'gpt-image-1.5'; Quality = 'high'; InputFidelity = 'auto' }
        $form = New-ImageEditForm -Job $j -Settings $settings
        Assert-Equal 'model,prompt,n,size,quality,background,output_format,input_fidelity,image[],image[]' (($form | ForEach-Object Name) -join ',')
        Assert-Equal 'high' ($form | Where-Object Name -eq 'input_fidelity').Value
        Assert-Equal 'image/png' $form[-1].ContentType
        $settings.Model = 'gpt-image-2.5-flare'
        $form = New-ImageEditForm -Job $j -Settings $settings
        Assert-True (-not ($form.Name -contains 'input_fidelity')) 'no input_fidelity for gpt-image-2.5'
        Assert-True (-not ($form.Name -contains 'moderation')) 'images/edits has no moderation field'
    }

    Test 'edits: -List and -DryRun send nothing' {
        $dir = Join-Path $scratch 'ed-dry'
        $fx = New-EditFixture $dir @(@{ Id = 'units/d__none'; Subject = 'dry [[scenario:ok]]' })
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool @{ InDir = $dir; SpriteDoc = $fx.Doc; List = $true }
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Match $r.Out 'pixel-32/units/d__none'
        Assert-Match $r.Out 'Jobs: 2 \(bold: 1, pixel-32: 1\)'
        $r = Invoke-EditTool @{ InDir = $dir; SpriteDoc = $fx.Doc; DryRun = $true; Model = 'gpt-image-1.5' }
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Match $r.Out 'images/edits \(multipart/form-data\) model=gpt-image-1\.5 n=1 size=1024x1024 quality=medium background=transparent output_format=png input_fidelity=high'
        Assert-Match $r.Out 'image\[\] 1: master .*d__none\.png'
        Assert-Match $r.Out 'image\[\] 2: style .*style-bible\.png'
        Assert-Match $r.Out 'Dry run: 2 edit jobs \(bold: 1, pixel-32: 1\); 2 would call the API'
        Assert-Equal 0 $srv.State.Requests.Count 'no request'
        Assert-True (-not (Test-Path (Join-Path $dir 'edited/manifest.json'))) 'no manifest written'
    }

    Test 'edits: multipart request, outputs, manifest, resume, prompt-hash invalidation' {
        Reset-FakeOpenAIServer $srv
        $dir = Join-Path $scratch 'ed-e2e'
        $fx = New-EditFixture $dir @(
            @{ Id = 'units/e-one__none'; Subject = 'edit one [[scenario:ok]]' },
            @{ Id = 'terrain/e-flat'; Bg = 'opaque'; Subject = 'edit tile [[scenario:ok]]' }
        )
        $pf = Join-Path $dir 'prompts.md'
        Copy-Item $editPromptsReal $pf
        $p = $editCommon + @{ InDir = $dir; SpriteDoc = $fx.Doc; PromptFile = $pf }
        $r = Invoke-EditTool $p
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Equal 3 $srv.State.Requests.Count 'bold + pixel for the unit, bold for the tile'
        Assert-Match $r.Out 'This run will make 3 image edit calls with 6 input images'
        $q = $srv.State.Requests[0]
        Assert-Equal '/v1/images/edits' $q.Path
        Assert-Match $q.ContentType '^multipart/form-data; boundary='
        Assert-Equal "Bearer $secret" $q.Auth
        Assert-Equal 'gpt-image-2.5-flare' $q.Body.model
        Assert-Equal '1' $q.Body.n
        Assert-Equal '1024x1024' $q.Body.size
        Assert-Equal 'medium' $q.Body.quality
        Assert-Equal 'transparent' $q.Body.background
        Assert-Equal 'png' $q.Body.output_format
        Assert-True (-not $q.Body.PSObject.Properties['input_fidelity']) 'no input_fidelity for 2.5'
        Assert-Match $q.Body.prompt 'SUBJECT OF IMAGE 1 \(from its original prompt\): edit one'
        Assert-Equal 2 @($q.Files).Count 'master + style bible'
        Assert-Equal 'image[]' $q.Files[0].Name
        Assert-Equal 'image/png' $q.Files[0].ContentType
        Assert-Equal (Get-FileSha256 (Join-Path $dir 'sprites/units/e-one__none.png')) (Get-Sha256Hex $q.Files[0].Bytes) 'first image is the master, byte for byte'
        Assert-Equal (Get-FileSha256 $fx.Style) (Get-Sha256Hex $q.Files[1].Bytes) 'second image is the style bible'
        Assert-Equal 'opaque' $srv.State.Requests[2].Body.background
        $m = Read-Manifest (Join-Path $dir 'edited/manifest.json')
        foreach ($k in 'bold/units/e-one__none', 'pixel-32/units/e-one__none', 'bold/terrain/e-flat') {
            Assert-Equal 'done' $m['jobs'][$k]['status'] $k
            Assert-True $m['jobs'][$k]['check']['ok'] "$k PNG check"
            Assert-True (Test-Path (Join-Path $dir "edited/$k.png")) "$k file"
        }
        Assert-Equal 'pixel' $m['jobs']['pixel-32/units/e-one__none']['mode']
        Assert-Equal 32 $m['jobs']['pixel-32/units/e-one__none']['grid']
        Assert-Equal 'sprites/units/e-one__none' $m['jobs']['bold/units/e-one__none']['sourceId']
        Assert-Equal 'style' $m['jobs']['bold/units/e-one__none']['references'][1]['role']
        Assert-Equal 'tools/image-gen/Edit-Images.ps1' $m['tool']
        $sheet = [IO.File]::ReadAllText((Join-Path $dir 'edited/index.html'))
        Assert-Match $sheet 'Redraw Contact Sheet'
        Assert-Match $sheet '\.\./sprites/units/e-one__none\.png' 'original shown next to the redraws'
        Assert-Match $sheet 'pixel-32/units/e-one__none\.png'
        Assert-True (-not (Test-Path (Join-Path $dir 'index.html'))) 'the generator contact sheet is untouched'

        # resume: nothing to do
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool $p
        Assert-Equal 0 $srv.State.Requests.Count 'no calls on a re-run'
        Assert-Match $r.Out 'Nothing to redraw'

        # editing the bold template re-queues only the bold jobs
        $txt = [IO.File]::ReadAllText($pf) -replace 'Redraw image 1 as a small-size game sprite\.', 'Redraw image 1 as a small-size game sprite, very boldly.'
        [IO.File]::WriteAllText($pf, $txt)
        $r = Invoke-EditTool ($p + @{ DryRun = $true })
        Assert-Match $r.Out 'bold/units/e-one__none   \[would run: prompt changed\]'
        Assert-Match $r.Out 'pixel-32/units/e-one__none   \[skip: done\]'
        Assert-Match $r.Out '; 2 would call the API'
        $r = Invoke-EditTool ($p + @{ KeepChanged = $true })
        Assert-Equal 0 $srv.State.Requests.Count '-KeepChanged'
        $r = Invoke-EditTool $p
        Assert-Equal 2 $srv.State.Requests.Count 'two bold jobs redrawn'
        Assert-True (@(Get-ChildItem (Join-Path $dir 'edited/_replaced') -Recurse -Filter '*.png').Count -eq 2) 'old takes kept'

        # a new style bible re-queues everything; a new master only its own jobs
        [IO.File]::WriteAllBytes($fx.Style, [ImageGenTool.PngWriter]::Sample('rgb', 40))
        $r = Invoke-EditTool ($p + @{ DryRun = $true })
        Assert-Match $r.Out '; 3 would call the API' 'style bible changed'
        $r = Invoke-EditTool ($p + @{ DryRun = $true; NoStyleRef = $true })
        Assert-Match $r.Out '; 3 would call the API' 'leaving the style bible out changes the hash too'
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool $p
        Assert-Equal 3 $srv.State.Requests.Count
        [IO.File]::WriteAllBytes((Join-Path $dir 'sprites/terrain/e-flat.png'), [ImageGenTool.PngWriter]::Sample('rgb', 48))
        $r = Invoke-EditTool ($p + @{ DryRun = $true })
        Assert-Match $r.Out 'bold/terrain/e-flat   \[would run: prompt changed\]'
        Assert-Match $r.Out '; 1 would call the API' 'master changed'
        # a deleted redraw is made again
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool $p
        Remove-Item (Join-Path $dir 'edited/pixel-32/units/e-one__none.png')
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool $p
        Assert-Equal 1 $srv.State.Requests.Count 'missing output regenerated'
        Assert-Match $srv.State.Requests[0].Body.prompt 'exactly 32 by 32'
    }

    Test 'edits: 429 and 5xx are retried with a fresh multipart body' {
        Reset-FakeOpenAIServer $srv
        $dir = Join-Path $scratch 'ed-retry'
        $fx = New-EditFixture $dir @(
            @{ Id = 'units/r-rl__none'; Subject = 'limited [[scenario:rate429]]' },
            @{ Id = 'units/r-flaky__none'; Subject = 'flaky [[scenario:err500]]' },
            @{ Id = 'units/r-broken__none'; Subject = 'broken [[scenario:always500]]' },
            @{ Id = 'units/r-after__none'; Subject = 'after [[scenario:ok]]' }
        )
        $r = Invoke-EditTool ($editCommon + @{ InDir = $dir; SpriteDoc = $fx.Doc; Mode = 'bold'; MaxRetries = 3 })
        Assert-Equal 1 $r.Exit "exit 1 when a job failed: $($r.Out)"
        $rl = @($srv.State.Requests | Where-Object Scenario -eq 'rate429')
        Assert-Equal 2 $rl.Count
        Assert-True (($rl[1].Time - $rl[0].Time).TotalSeconds -ge 0.95) 'waited for Retry-After: 1'
        foreach ($q in $srv.State.Requests) { Assert-Equal 2 @($q.Files).Count "every attempt carries both images ($($q.Scenario) #$($q.Count))" }
        Assert-Match $r.Out 'rate limited \(429\); retrying'
        Assert-Match $r.Out 'server error \(500\); retrying'
        $m = Read-Manifest (Join-Path $dir 'edited/manifest.json')
        Assert-Equal 'done' $m['jobs']['bold/units/r-rl__none']['status']
        Assert-Equal 2 $m['jobs']['bold/units/r-rl__none']['attempts']
        Assert-Equal 'done' $m['jobs']['bold/units/r-flaky__none']['status']
        Assert-Equal 3 $m['jobs']['bold/units/r-flaky__none']['attempts']
        Assert-Equal 'failed' $m['jobs']['bold/units/r-broken__none']['status']
        Assert-Match $m['jobs']['bold/units/r-broken__none']['lastError'] '\[server\] HTTP 500'
        Assert-Equal 'done' $m['jobs']['bold/units/r-after__none']['status'] 'run continued'
    }

    Test 'edits: quota stops and resumes; policy refusal fails one job' {
        Reset-FakeOpenAIServer $srv
        $dir = Join-Path $scratch 'ed-quota'
        $rows = @(
            @{ Id = 'units/q-one__none'; Subject = 'one [[scenario:ok]]' },
            @{ Id = 'units/q-pol__none'; Subject = 'refused [[scenario:policy]]' },
            @{ Id = 'units/q-two__none'; Subject = 'two [[scenario:quota]]' },
            @{ Id = 'units/q-three__none'; Subject = 'three [[scenario:ok]]' }
        )
        $fx = New-EditFixture $dir $rows
        $p = $editCommon + @{ InDir = $dir; SpriteDoc = $fx.Doc; Mode = 'bold' }
        $r = Invoke-EditTool $p
        Assert-Equal 2 $r.Exit 'exit 2 on a stop'
        Assert-Equal 3 $srv.State.Requests.Count 'no retry, no calls after insufficient_quota'
        Assert-Match $r.Out 'Stopped: insufficient quota'
        Assert-Match $r.Out 'Edit-Images\.ps1'
        $m = Read-Manifest (Join-Path $dir 'edited/manifest.json')
        Assert-Equal 'done' $m['jobs']['bold/units/q-one__none']['status']
        Assert-Equal 'failed' $m['jobs']['bold/units/q-pol__none']['status']
        Assert-Match $m['jobs']['bold/units/q-pol__none']['lastError'] '\[policy\] HTTP 400 moderation_blocked'
        Assert-Equal 'pending' $m['jobs']['bold/units/q-two__none']['status'] 'quota job stays pending'
        Assert-Equal 'pending' $m['jobs']['bold/units/q-three__none']['status']
        # credit added (and the refused subject reworded): the re-run does the remaining three
        $rows[1].Subject = 'reworded [[scenario:ok]]'; $rows[2].Subject = 'two [[scenario:ok]]'
        $fx = New-EditFixture $dir $rows
        Reset-FakeOpenAIServer $srv
        $r = Invoke-EditTool $p
        Assert-Equal 0 $r.Exit $r.Out
        Assert-Equal 3 $srv.State.Requests.Count 'resumed'
    }

    Test 'edits: a wrong key stops the run' {
        Reset-FakeOpenAIServer $srv
        $dir = Join-Path $scratch 'ed-auth'
        $fx = New-EditFixture $dir @(@{ Id = 'units/w1__none'; Subject = 'a [[scenario:ok]]' }, @{ Id = 'units/w2__none'; Subject = 'b [[scenario:ok]]' })
        $env:OPENAI_API_KEY = 'sk-wrong'
        try { $r = Invoke-EditTool ($editCommon + @{ InDir = $dir; SpriteDoc = $fx.Doc; Mode = 'bold' }) } finally { $env:OPENAI_API_KEY = $secret }
        Assert-Equal 2 $r.Exit
        Assert-Equal 1 $srv.State.Requests.Count
        Assert-Match $r.Out 'the API key was rejected'
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
