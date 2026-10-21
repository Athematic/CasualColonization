#Requires -Version 7.0
<#
.SYNOPSIS
Generates the sprite and box-art images described in docs/SPRITE_PROMPTS.md and
docs/BOX_ART_PROMPTS.md with the OpenAI Images API (POST /v1/images/generations).

.DESCRIPTION
Builds a job list from the two prompt documents (shared style blocks + per-image prompt, size and
background), then generates each image, resuming from a manifest in the output folder. Transparent
sprites are requested with background=transparent and output_format=png, and every PNG is checked
for a real alpha channel with transparent pixels (and for a painted checkerboard).

The API key is asked for at startup with hidden input, or taken from OPENAI_API_KEY after you
confirm. It is held only as a SecureString in memory and is never written anywhere.

.EXAMPLE
pwsh ./tools/image-gen/Generate-Images.ps1 -List
.EXAMPLE
pwsh ./tools/image-gen/Generate-Images.ps1 -Doc sprites -Only 'bible/*' -DryRun
.EXAMPLE
pwsh ./tools/image-gen/Generate-Images.ps1 -Only 'units/free-colonist*' -Quality low -Variants 2
#>
[CmdletBinding()]
param(
    # Which prompt document(s) to use.
    [ValidateSet('sprites', 'boxart', 'all')][string]$Doc = 'all',
    # Wildcard patterns matched against the job id ("units/caravel__none") or key ("sprites/units/caravel__none").
    # A pattern without * or ? matches as a substring. Comma-separate or repeat for several.
    [string[]]$Only,
    # Takes per prompt; take 2 and later are saved as <id>__v2.png, <id>__v3.png ...
    [ValidateRange(1, 10)][int]$Variants = 1,
    # Show the job list and exit.
    [switch]$List,
    # Print the assembled prompts and request parameters without calling the API.
    [switch]$DryRun,
    # Output folder for PNGs, manifest.json and index.html. Default: tools/image-gen/output
    [string]$OutDir,
    # Image model. Must be a GPT image model that supports background=transparent for the sprites.
    [string]$Model = 'gpt-image-2.5-flare',
    [ValidateSet('low', 'medium', 'high', 'xhigh', 'max', 'auto')][string]$Quality = 'medium',
    [ValidateSet('auto', 'low')][string]$Moderation = 'auto',
    # API base URL (for tests against a local fake server).
    [string]$ApiBase = 'https://api.openai.com/v1',
    # Skip the cost confirmation.
    [switch]$Yes,
    # Use OPENAI_API_KEY from the environment without asking.
    [switch]$UseEnvKey,
    # Do not regenerate done jobs whose prompt text changed since they were made.
    [switch]$KeepChanged,
    # Regenerate jobs even if they are done.
    [switch]$Force,
    # Do not retry jobs that failed in an earlier run.
    [switch]$SkipFailed,
    # Regenerate done jobs whose PNG check flagged a problem (e.g. no real transparency).
    [switch]$RedoFlagged,
    # Also make "<front>__titled" box-art jobs with model-lettered title (BOX_ART_PROMPTS.md section 6).
    [switch]$IncludeTitle,
    # At most this many API jobs in this run (0 = no limit).
    [ValidateRange(0, 100000)][int]$MaxJobs = 0,
    # HTTP attempts per job for rate limits, 5xx and network errors.
    [ValidateRange(1, 20)][int]$MaxRetries = 6,
    # Stop after this many jobs in a row fail.
    [ValidateRange(1, 1000)][int]$MaxConsecutiveFailures = 5,
    [double]$RetryBaseSeconds = 2,
    [double]$MaxRetryDelaySeconds = 120,
    [ValidateRange(10, 3600)][int]$RequestTimeoutSec = 600,
    # Do not write index.html.
    [switch]$NoContactSheet,
    # Override the prompt documents (mainly for tests).
    [string]$SpriteDoc,
    [string]$BoxArtDoc
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ImageGen.psm1') -Force

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $SpriteDoc) { $SpriteDoc = Join-Path $repoRoot 'docs/SPRITE_PROMPTS.md' }
if (-not $BoxArtDoc) { $BoxArtDoc = Join-Path $repoRoot 'docs/BOX_ART_PROMPTS.md' }
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot 'output' }
$OutDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
$manifestPath = Join-Path $OutDir 'manifest.json'

if ($Model -match '^dall-e') {
    Write-Host "Model '$Model' was retired and has no transparent backgrounds. Use a GPT image model such as gpt-image-2.5-flare." -ForegroundColor Red
    exit 2
}

# The command to print when a run stops, built from this script's own bound parameters.
$resumeParts = @('pwsh', '-File', "'$PSCommandPath'")
foreach ($k in $PSBoundParameters.Keys) {
    $v = $PSBoundParameters[$k]
    if ($v -is [switch]) { if ($v.IsPresent) { $resumeParts += "-$k" } }
    elseif ($v -is [array]) { $resumeParts += "-$k"; $resumeParts += (($v | ForEach-Object { "'$_'" }) -join ',') }
    else { $resumeParts += "-$k"; $resumeParts += "'$v'" }
}
$resumeCommand = $resumeParts -join ' '

function Get-ApiKeySecure {
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

# ------------------------------------------------------------------------- jobs
$jobs = Get-ImageJobs -SpriteDoc $SpriteDoc -BoxArtDoc $BoxArtDoc -Doc $Doc -Only $Only -Variants $Variants -IncludeTitle:$IncludeTitle
$byDoc = $jobs | Group-Object Doc | ForEach-Object { "$($_.Name): $($_.Count)" }
$countText = if ($byDoc) { ($byDoc -join ', ') } else { 'none' }

if ($List) {
    $jobs | Select-Object Key, Size, Background, Section | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Output
    Write-Output "Jobs: $($jobs.Count) ($countText)"
    exit 0
}

if ($jobs.Count -eq 0) {
    Write-Warning 'No jobs match the selection.'
    exit 0
}

$manifest = Read-Manifest -Path $manifestPath
$plan = @(Get-JobPlan -Jobs $jobs -Manifest $manifest -OutDir $OutDir -KeepChanged:$KeepChanged -Force:$Force -SkipFailed:$SkipFailed -RedoFlagged:$RedoFlagged)
$toRun = @($plan | Where-Object Action -eq 'run')
if ($MaxJobs -gt 0 -and $toRun.Count -gt $MaxJobs) { $toRun = @($toRun | Select-Object -First $MaxJobs) }
$settings = [pscustomobject]@{
    Model = $Model; Quality = $Quality; Moderation = $Moderation; ApiBase = $ApiBase
    MaxRetries = $MaxRetries; RetryBaseSeconds = $RetryBaseSeconds; MaxRetryDelaySeconds = $MaxRetryDelaySeconds
    RequestTimeoutSec = $RequestTimeoutSec
}

if ($DryRun) {
    $runKeys = [System.Collections.Generic.HashSet[string]]::new([string[]]@($toRun | ForEach-Object { $_.Job.Key }))
    foreach ($p in $plan) {
        $j = $p.Job
        $body = New-ImageRequestBody -Job $j -Settings $settings
        $runs = $runKeys.Contains($j.Key)
        Write-Output ('=' * 100)
        Write-Output "$($j.Key)   [$(if ($runs) { 'would run' } else { 'skip' }): $($p.Reason)]"
        Write-Output "section: $($j.Section)"
        Write-Output "output:  $(Join-Path $OutDir $j.OutputRel)"
        Write-Output "request: POST $($ApiBase.TrimEnd('/'))/images/generations model=$($body.model) size=$($body.size) quality=$($body.quality) background=$($body.background) output_format=$($body.output_format) n=$($body.n) moderation=$($body.moderation)"
        if ($j.Notes) { Write-Output "note:    $($j.Notes)" }
        Write-Output "prompt ($($j.Prompt.Length) chars):"
        Write-Output $j.Prompt
    }
    Write-Output ('=' * 100)
    Write-Output "Dry run: $($jobs.Count) jobs ($countText); $($toRun.Count) would call the API. No request was sent."
    exit 0
}

# ------------------------------------------------------------------------- confirm
$skippedCount = $plan.Count - @($plan | Where-Object Action -eq 'run').Count
Write-Host "Selected $($jobs.Count) jobs ($countText). Already done or skipped: $skippedCount. To generate now: $($toRun.Count)." -ForegroundColor Cyan
foreach ($g in ($plan | Where-Object Action -eq 'run' | Group-Object Reason)) { Write-Host "  $($g.Count) x $($g.Name)" }

# Record every selected job, so the manifest shows the whole picture even before it runs.
foreach ($p in $plan) {
    $key = $p.Job.Key
    if ($null -eq $manifest['jobs'][$key]) {
        $manifest['jobs'][$key] = [ordered]@{
            doc = $p.Job.Doc; id = $p.Job.Id; section = $p.Job.Section; size = $p.Job.Size; background = $p.Job.Background
            output = $p.Job.OutputRel; status = 'pending'; attempts = 0; lastError = $null; promptHash = $p.Hash
            createdAt = Get-UtcStamp; startedAt = $null; finishedAt = $null; model = $null; check = $null
        }
        if ($p.Action -eq 'skip') {
            $manifest['jobs'][$key]['status'] = 'skipped'
            $manifest['jobs'][$key]['lastError'] = $p.Reason
        }
    }
}

if ($toRun.Count -eq 0) {
    Save-Manifest -Manifest $manifest -Path $manifestPath
    if (-not $NoContactSheet) { $null = Write-ContactSheet -OutDir $OutDir -Manifest $manifest -Jobs $jobs }
    Write-Host 'Nothing to generate: every selected job is done or skipped.' -ForegroundColor Green
    exit 0
}

$transparentCount = @($toRun | Where-Object { $_.Job.Background -eq 'transparent' }).Count
if ($transparentCount -gt 0 -and $Model -match '^gpt-image-2(-\d{4}-\d{2}-\d{2})?$') {
    Write-Warning "$Model only had transparent backgrounds in preview; if requests fail or come back opaque, use -Model gpt-image-2.5-flare or gpt-image-1.5."
}
$estimate = Get-CostEstimate -Jobs ($toRun | ForEach-Object Job) -Quality $Quality
Write-Host ("This run will make {0} image generation calls (one image each; retries for rate limits and server errors come on top)." -f $toRun.Count) -ForegroundColor Cyan
Write-Host ("Model {0}, quality {1}. Rough cost estimate: about `${2:0.00} (check current OpenAI pricing)." -f $Model, $Quality, $estimate)
if (-not $Yes) {
    $ans = Read-Host 'Continue? [y/N]'
    if ($ans -notmatch '^(y|yes)$') { Write-Host 'Cancelled; nothing was sent.'; exit 3 }
}

$apiKey = Get-ApiKeySecure

# ------------------------------------------------------------------------- run
$manifest['lastRun'] = [ordered]@{
    startedAt = Get-UtcStamp; model = $Model; quality = $Quality; moderation = $Moderation; apiBase = $ApiBase
    selected = $jobs.Count; planned = $toRun.Count; finishedAt = $null; stopReason = $null
}
Save-Manifest -Manifest $manifest -Path $manifestPath

$stopReason = $null
$completed = $false
$consecutiveFailures = 0
$ran = [System.Collections.Generic.List[string]]::new()
$runFailed = [System.Collections.Generic.List[string]]::new()
$runDone = [System.Collections.Generic.List[string]]::new()
$runFlagged = [System.Collections.Generic.List[string]]::new()
$t0 = Get-Date
try {
    for ($i = 0; $i -lt $toRun.Count; $i++) {
        $p = $toRun[$i]
        $job = $p.Job
        $entry = $manifest['jobs'][$job.Key]
        $pct = [int](100 * $i / $toRun.Count)
        $eta = ''
        if ($i -gt 0) {
            $per = ((Get-Date) - $t0).TotalSeconds / $i
            $eta = ', about {0:0} min left' -f ($per * ($toRun.Count - $i) / 60)
        }
        Write-Progress -Activity "Generating images ($Model, $Quality)" -Status "$($i + 1)/$($toRun.Count): $($job.Key)$eta" -PercentComplete $pct
        Write-Host "[$($i + 1)/$($toRun.Count)] $($job.Key) ($($job.Size), $($job.Background)) - $($p.Reason)"

        $entry['status'] = 'pending'
        $entry['startedAt'] = Get-UtcStamp
        $entry['promptHash'] = $p.Hash
        $entry['model'] = $Model
        $entry['quality'] = $Quality
        $entry['output'] = $job.OutputRel
        Save-Manifest -Manifest $manifest -Path $manifestPath

        $r = Invoke-JobGeneration -Job $job -Entry $entry -Settings $settings -ApiKey $apiKey
        $ran.Add($job.Key)
        if ($r.Ok) {
            $bytes = $r.Images[0]
            $check = Test-ImageResult -Bytes $bytes -Background $job.Background -Size $job.Size
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
        Save-Manifest -Manifest $manifest -Path $manifestPath
        if ($stopReason) { break }
        if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
            $stopReason = "$consecutiveFailures jobs in a row failed; check the errors above before spending more."
            break
        }
    }
    if (-not $stopReason) { $completed = $true }
} finally {
    Write-Progress -Activity 'Generating images' -Completed
    if (-not $completed -and -not $stopReason) { $stopReason = 'interrupted (Ctrl+C)' }
    $manifest['lastRun']['finishedAt'] = Get-UtcStamp
    $manifest['lastRun']['stopReason'] = $stopReason
    Save-Manifest -Manifest $manifest -Path $manifestPath
    $apiKey = $null

    $statuses = foreach ($j in $jobs) { $e = $manifest['jobs'][$j.Key]; if ($e) { $e['status'] } else { 'pending' } }
    $counts = $statuses | Group-Object | ForEach-Object { "$($_.Name) $($_.Count)" }
    Write-Host ''
    Write-Host '==================== Summary ====================' -ForegroundColor Cyan
    Write-Host "This run: $($ran.Count) jobs attempted, $($runDone.Count) succeeded, $($runFailed.Count) failed, $($runFlagged.Count) flagged by the PNG check."
    Write-Host "All selected jobs: $($counts -join ', ')"
    foreach ($k in $runFailed) { Write-Host "  failed:  $k  $($manifest['jobs'][$k]['lastError'])" -ForegroundColor Red }
    foreach ($k in $runFlagged) { Write-Host "  flagged: $k  $(@($manifest['jobs'][$k]['check']['issues']) -join '; ')" -ForegroundColor Yellow }
    Write-Host "Output:   $OutDir"
    Write-Host "Manifest: $manifestPath"
    if (-not $NoContactSheet) {
        try { $sheet = Write-ContactSheet -OutDir $OutDir -Manifest $manifest -Jobs $jobs; Write-Host "Contact sheet: $sheet" }
        catch { Write-Warning "Could not write the contact sheet: $($_.Exception.Message)" }
    }
    if ($stopReason) {
        Write-Host "Stopped: $stopReason" -ForegroundColor Red
        Write-Host 'The manifest is saved. Run the same command again to resume; done jobs are skipped:'
        Write-Host "  $resumeCommand"
    }
}

if ($stopReason) { exit 2 }
if ($runFailed.Count -gt 0) { exit 1 }
exit 0
