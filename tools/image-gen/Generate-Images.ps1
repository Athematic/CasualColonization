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

-Variant thumb makes the THUMBNAIL version of every sprite instead: a separate text-to-image generation of
the same subject with a prompt designed to read at 16 to 48 px (the full prompt plus the THUMBNAIL OVERRIDE
from thumb-prompts.md). Thumbnails are their own manifest entries (thumbs/<category>/<id>) and files
(output/thumbs/<category>/<id>.png). -Variant full (the default) is unchanged; -Variant both makes both.

The API key is asked for at startup with hidden input, or taken from OPENAI_API_KEY after you
confirm. It is held only as a SecureString in memory and is never written anywhere.

.EXAMPLE
pwsh ./tools/image-gen/Generate-Images.ps1 -List
.EXAMPLE
pwsh ./tools/image-gen/Generate-Images.ps1 -Variant thumb -Only 'units/expert-lumberjack*' -Quality medium
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
    # full: the images the prompt documents describe (default, unchanged). thumb: only the thumbnail versions
    # (thumbs/<category>/<id>.png; prompt = full prompt + THUMBNAIL OVERRIDE from thumb-prompts.md). both: each
    # full image followed by its thumbnail. Box art and the style bible get no thumbnail.
    # (Not to be confused with -Variants, the number of takes.)
    [ValidateSet('full', 'thumb', 'both')][string]$Variant = 'full',
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
    [string]$BoxArtDoc,
    # The thumbnail prompt blocks (only read for -Variant thumb or both). Default: tools/image-gen/thumb-prompts.md
    [string]$ThumbPromptFile
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ImageGen.psm1') -Force

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $SpriteDoc) { $SpriteDoc = Join-Path $repoRoot 'docs/SPRITE_PROMPTS.md' }
if (-not $BoxArtDoc) { $BoxArtDoc = Join-Path $repoRoot 'docs/BOX_ART_PROMPTS.md' }
if (-not $ThumbPromptFile) { $ThumbPromptFile = Join-Path $PSScriptRoot 'thumb-prompts.md' }
if (-not $OutDir) { $OutDir = Join-Path $PSScriptRoot 'output' }
$OutDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir)
$manifestPath = Join-Path $OutDir 'manifest.json'

if ($Model -match '^dall-e') {
    Write-Host "Model '$Model' was retired and has no transparent backgrounds. Use a GPT image model such as gpt-image-2.5-flare." -ForegroundColor Red
    exit 2
}

# The command to print when a run stops, built from this script's own bound parameters.
$resumeCommand = Get-ResumeCommand -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters

# ------------------------------------------------------------------------- jobs
$thumbPrompts = $null
if ($Variant -ne 'full') {
    $thumbPrompts = Read-ThumbPrompts -Path $ThumbPromptFile
    if ($Doc -eq 'boxart') {
        Write-Host 'Note: box art has no thumbnail variant (covers are not needed small); no thumbnail jobs for -Doc boxart.' -ForegroundColor Yellow
    }
}
$jobs = Get-ImageJobs -SpriteDoc $SpriteDoc -BoxArtDoc $BoxArtDoc -Doc $Doc -Only $Only -Variants $Variants -IncludeTitle:$IncludeTitle `
    -Variant $Variant -ThumbPrompts $thumbPrompts
$byDoc = foreach ($d in 'sprites', 'boxart', 'thumbs') {
    $n = @($jobs | Where-Object Doc -eq $d).Count
    if ($n) { "${d}: $n" }
}
$countText = if ($byDoc) { ($byDoc -join ', ') } else { 'none' }

if ($List) {
    $jobs | Select-Object Key, Size, Background, Section | Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Output
    Write-Output "Jobs: $($jobs.Count) ($countText)"
    exit 0
}

if ($jobs.Count -eq 0) {
    Write-Warning 'No jobs match the selection.'
    if ($thumbPrompts) { Write-Host "Thumbnails are never made for box art, nor for these categories (settings block of $ThumbPromptFile): $(@($thumbPrompts.Skip) -join ', ')." }
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
        if ($j.Kind -eq 'thumb') { Write-Output "variant: thumb ($($j.ThumbStyle) blocks of $(Split-Path -Leaf $ThumbPromptFile)), full version: $($j.FullKey)" }
        else { Write-Output 'variant: full' }
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
if ($Variant -ne 'full') {
    $thumbRuns = @($toRun | Where-Object { $_.Job.Kind -eq 'thumb' }).Count
    Write-Host "  thumbnails: $thumbRuns, full images: $($toRun.Count - $thumbRuns)"
}

# Record every selected job, so the manifest shows the whole picture even before it runs.
Add-PlanToManifest -Plan $plan -Manifest $manifest

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

$apiKey = Get-ApiKeySecure -UseEnvKey:$UseEnvKey

# ------------------------------------------------------------------------- run
$manifest['lastRun'] = [ordered]@{
    startedAt = Get-UtcStamp; model = $Model; quality = $Quality; moderation = $Moderation; apiBase = $ApiBase; variant = $Variant
    selected = $jobs.Count; planned = $toRun.Count; finishedAt = $null; stopReason = $null
}
Save-Manifest -Manifest $manifest -Path $manifestPath

$result = $null
try {
    $result = Invoke-ImageJobRun -ToRun $toRun -Jobs $jobs -Manifest $manifest -ManifestPath $manifestPath -OutDir $OutDir `
        -Settings $settings -ApiKey $apiKey -MaxConsecutiveFailures $MaxConsecutiveFailures -ResumeCommand $resumeCommand `
        -Activity 'Generating images' -SheetKind generate -NoContactSheet:$NoContactSheet
} finally {
    $apiKey = $null
}

if ($result.StopReason) { exit 2 }
if ($result.Failed -gt 0) { exit 1 }
exit 0
