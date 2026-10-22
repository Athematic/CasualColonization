#Requires -Version 7.0
<#
.SYNOPSIS
Redraws the generated sprite masters as small-size-optimised versions with the OpenAI image EDIT API
(POST /v1/images/edits), so that tools/sprite-pipeline can downscale them without losing the style.

DEPRECATED / EXPERIMENTAL: too costly (every edit also pays for its input images) and the results were not
good enough (even "bold" kept lines too thin). Use Generate-Images.ps1 -Variant thumb instead, which makes a
separate small-size generation of each sprite. This script and its tests are kept for reference.

.DESCRIPTION
The image models cannot output tiny images: GPT image models return about 1024 px and up (the standard
sizes are 1024x1024, 1536x1024 and 1024x1536; 256x256 and 512x512 belong to the retired dall-e-2). So
this tool does not downscale. It asks the edit endpoint to REDRAW each master at the normal output size,
designed to read at 16 to 64 px, with the master (and the style bible, and an optional approved anchor
per category) as input images. tools/sprite-pipeline then does the exact, deterministic downscale.

Two redraw modes, to compare:
  bold   same subject and composition, outlines 3 to 4 percent of the width, props enlarged and held
         clear of the body, few interior lines, flat palette colours. Feed it to the sprite pipeline
         with --in for the smooth sizes.
  pixel  the same subject as true pixel art on an exact N x N grid (-Grid 16, 24, 32), one flat
         square block per cell. Feed it to the sprite pipeline with --grid-in / --grid, which samples
         the cells back into an exact N x N sprite and reports a grid fidelity score.

Jobs come from the generator's output/manifest.json (status done). Prompts are in edit-prompts.md.
Output: output/edited/<mode>[-<N>]/<category>/<id>.png, with output/edited/manifest.json (resumable,
same rules as Generate-Images.ps1) and output/edited/index.html (original next to every redraw).

The API key is asked for at startup with hidden input, or taken from OPENAI_API_KEY after you
confirm. It is held only as a SecureString in memory and is never written anywhere.

.EXAMPLE
pwsh ./tools/image-gen/Edit-Images.ps1 -List
.EXAMPLE
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/expert-lumberjack*' -Mode bold,pixel -DryRun
.EXAMPLE
pwsh ./tools/image-gen/Edit-Images.ps1 -Only 'units/expert-lumberjack*' -Mode bold,pixel -Quality medium
#>
[CmdletBinding()]
param(
    # Redraw modes: bold, pixel or both.
    [ValidateSet('bold', 'pixel')][string[]]$Mode = @('bold', 'pixel'),
    # Pixel grid sizes (cells per side) for -Mode pixel; several make one job each.
    [ValidateSet(16, 24, 32)][int[]]$Grid = @(32),
    # Wildcard patterns matched against the sprite id ("units/caravel__none") or the job key
    # ("bold/units/caravel__none", "pixel-32/units/caravel__none"). Without * or ? a pattern matches as a substring.
    [string[]]$Only,
    # Folder categories to include (units, goods, terrain, decor, ...). Default: the ```modes block in
    # edit-prompts.md. A category marked skip there gets bold (and pixel when transparent) when named here.
    [string[]]$Category,
    # Which generator documents to take masters from.
    [ValidateSet('sprites', 'boxart', 'all')][string]$Doc = 'sprites',
    # Takes per redraw; take 2 and later are saved as <id>__v2.png ...
    [ValidateRange(1, 10)][int]$Variants = 1,
    # Show the job list and exit.
    [switch]$List,
    # Print the assembled prompts, reference images and request fields without calling the API.
    [switch]$DryRun,
    # The generator's output folder: masters (sprites/..., boxart/...) and its manifest.json. Default: tools/image-gen/output
    [string]$InDir,
    # The generator manifest. Default: <InDir>/manifest.json
    [string]$SourceManifest,
    # Output folder for the redraws, their manifest.json and index.html. Default: <InDir>/edited
    [string]$OutDir,
    # Style reference sent as the second image. Default: <InDir>/sprites/bible/style-bible.png
    [string]$StyleRef,
    # Send no style reference.
    [switch]$NoStyleRef,
    # Folder with approved redraws, one per category: <AnchorDir>/<mode>[-N]/<category>.png, for example
    # anchors/bold/units.png or anchors/pixel-32/ships.png. Default: <InDir>/anchors
    [string]$AnchorDir,
    # The prompt templates. Default: tools/image-gen/edit-prompts.md
    [string]$PromptFile,
    # The sprite prompt document, for the subject text of each master. Default: docs/SPRITE_PROMPTS.md
    [string]$SpriteDoc,
    [string]$BoxArtDoc,
    # Image model. Must support images/edits with background=transparent.
    [string]$Model = 'gpt-image-2.5-flare',
    [ValidateSet('low', 'medium', 'high', 'xhigh', 'max', 'auto')][string]$Quality = 'medium',
    # input_fidelity: auto sends "high" where the model supports it (gpt-image-1, gpt-image-1.5) and leaves
    # it out elsewhere (gpt-image-2 and 2.5 take no input_fidelity).
    [ValidateSet('auto', 'high', 'low', 'omit')][string]$InputFidelity = 'auto',
    # Rough USD per input image for the cost estimate (reference images are billed as image input tokens).
    [double]$InputImageCost = 0.03,
    # API base URL (for tests against a local fake server).
    [string]$ApiBase = 'https://api.openai.com/v1',
    [switch]$Yes,
    [switch]$UseEnvKey,
    [switch]$KeepChanged,
    [switch]$Force,
    [switch]$SkipFailed,
    [switch]$RedoFlagged,
    [ValidateRange(0, 100000)][int]$MaxJobs = 0,
    [ValidateRange(1, 20)][int]$MaxRetries = 6,
    [ValidateRange(1, 1000)][int]$MaxConsecutiveFailures = 5,
    [double]$RetryBaseSeconds = 2,
    [double]$MaxRetryDelaySeconds = 120,
    [ValidateRange(10, 3600)][int]$RequestTimeoutSec = 600,
    [switch]$NoContactSheet
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ImageGen.psm1') -Force

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$resolve = { param($p) $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p) }
if (-not $InDir) { $InDir = Join-Path $PSScriptRoot 'output' }
$InDir = & $resolve $InDir
if (-not $SourceManifest) { $SourceManifest = Join-Path $InDir 'manifest.json' }
$SourceManifest = & $resolve $SourceManifest
if (-not $OutDir) { $OutDir = Join-Path $InDir 'edited' }
$OutDir = & $resolve $OutDir
if (-not $PromptFile) { $PromptFile = Join-Path $PSScriptRoot 'edit-prompts.md' }
if (-not $SpriteDoc) { $SpriteDoc = Join-Path $repoRoot 'docs/SPRITE_PROMPTS.md' }
if (-not $BoxArtDoc) { $BoxArtDoc = Join-Path $repoRoot 'docs/BOX_ART_PROMPTS.md' }
if ($NoStyleRef) { $StyleRef = $null }
elseif (-not $StyleRef) { $StyleRef = Join-Path $InDir 'sprites/bible/style-bible.png' }
if ($StyleRef) { $StyleRef = & $resolve $StyleRef }
if (-not $AnchorDir) { $AnchorDir = Join-Path $InDir 'anchors' }
$AnchorDir = & $resolve $AnchorDir
$manifestPath = Join-Path $OutDir 'manifest.json'

if ($Model -match '^dall-e') {
    Write-Host "Model '$Model' was retired. Use a GPT image model such as gpt-image-2.5-flare." -ForegroundColor Red
    exit 2
}
if (-not (Test-Path -LiteralPath $SourceManifest)) {
    Write-Host "No generator manifest at $SourceManifest. Run Generate-Images.ps1 first, or pass -InDir / -SourceManifest." -ForegroundColor Red
    exit 2
}

$resumeCommand = Get-ResumeCommand -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters

# ------------------------------------------------------------------------- jobs
$prompts = Read-EditPrompts -Path $PromptFile
$docJobs = [ordered]@{}
if ((Test-Path -LiteralPath $SpriteDoc) -and $Doc -in 'sprites', 'all') {
    $docList = Get-SpriteJobs -Path $SpriteDoc
    foreach ($j in $docList) { $docJobs[$j.Key] = $j }
}
if ((Test-Path -LiteralPath $BoxArtDoc) -and $Doc -in 'boxart', 'all') {
    $docList = Get-BoxArtJobs -Path $BoxArtDoc
    foreach ($j in $docList) { $docJobs[$j.Key] = $j }
}
$src = Read-Manifest -Path $SourceManifest
$built = Get-EditJobs -SourceManifest $src -InDir $InDir -Prompts $prompts -DocJobs $docJobs -Mode $Mode -Grid $Grid -Model $Model `
    -StyleRef $StyleRef -AnchorDir $AnchorDir -Doc $Doc -Category $Category -Only $Only -Variants $Variants
foreach ($w in $built.Warnings) { Write-Warning $w }
$jobs = @($built.Jobs)
$byMode = @($jobs | Group-Object Doc | Sort-Object Name | ForEach-Object { "$($_.Name): $($_.Count)" })
$countText = if ($byMode) { ($byMode -join ', ') } else { 'none' }

if ($List) {
    $jobs | Select-Object Key, Size, Background, @{ n = 'Refs'; e = { (@($_.References) | ForEach-Object Role) -join '+' } }, Section |
        Format-Table -AutoSize -Wrap | Out-String -Width 240 | Write-Output
    Write-Output "Jobs: $($jobs.Count) ($countText)"
    exit 0
}

if ($jobs.Count -eq 0) {
    Write-Warning 'No edit jobs match the selection (check -Only, -Mode, -Category and that the masters exist).'
    exit 0
}

$manifest = Read-Manifest -Path $manifestPath
$manifest['tool'] = 'tools/image-gen/Edit-Images.ps1'
$plan = @(Get-JobPlan -Jobs $jobs -Manifest $manifest -OutDir $OutDir -KeepChanged:$KeepChanged -Force:$Force -SkipFailed:$SkipFailed -RedoFlagged:$RedoFlagged)
$toRun = @($plan | Where-Object Action -eq 'run')
if ($MaxJobs -gt 0 -and $toRun.Count -gt $MaxJobs) { $toRun = @($toRun | Select-Object -First $MaxJobs) }
$settings = [pscustomobject]@{
    Model = $Model; Quality = $Quality; Moderation = $null; InputFidelity = $InputFidelity; ApiBase = $ApiBase
    MaxRetries = $MaxRetries; RetryBaseSeconds = $RetryBaseSeconds; MaxRetryDelaySeconds = $MaxRetryDelaySeconds
    RequestTimeoutSec = $RequestTimeoutSec
}

if ($DryRun) {
    $runKeys = [System.Collections.Generic.HashSet[string]]::new([string[]]@($toRun | ForEach-Object { $_.Job.Key }))
    foreach ($p in $plan) {
        $j = $p.Job
        $runs = $runKeys.Contains($j.Key)
        $form = New-ImageEditForm -Job $j -Settings $settings
        $fields = ($form | Where-Object { $null -eq $_.Bytes -and $_.Name -ne 'prompt' } | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' '
        Write-Output ('=' * 100)
        Write-Output "$($j.Key)   [$(if ($runs) { 'would run' } else { 'skip' }): $($p.Reason)]"
        Write-Output "section: $($j.Section)"
        Write-Output "output:  $(Join-Path $OutDir $j.OutputRel)"
        Write-Output "request: POST $($ApiBase.TrimEnd('/'))/images/edits (multipart/form-data) $fields"
        $k = 0
        foreach ($r in $j.References) { $k++; Write-Output ("image[] {0}: {1} {2} (sha256 {3})" -f $k, $r.Role, $r.Path, $r.Sha256.Substring(0, 12)) }
        if ($j.Notes) { Write-Output "note:    $($j.Notes)" }
        Write-Output "prompt ($($j.Prompt.Length) chars):"
        Write-Output $j.Prompt
    }
    Write-Output ('=' * 100)
    Write-Output "Dry run: $($jobs.Count) edit jobs ($countText); $($toRun.Count) would call the API. No request was sent."
    exit 0
}

# ------------------------------------------------------------------------- confirm
$skippedCount = $plan.Count - @($plan | Where-Object Action -eq 'run').Count
Write-Host "Selected $($jobs.Count) edit jobs ($countText). Already done or skipped: $skippedCount. To redraw now: $($toRun.Count)." -ForegroundColor Cyan
foreach ($g in ($plan | Where-Object Action -eq 'run' | Group-Object Reason)) { Write-Host "  $($g.Count) x $($g.Name)" }

Add-PlanToManifest -Plan $plan -Manifest $manifest

if ($toRun.Count -eq 0) {
    Save-Manifest -Manifest $manifest -Path $manifestPath
    if (-not $NoContactSheet) { $null = Write-EditContactSheet -OutDir $OutDir -Manifest $manifest -Jobs $jobs }
    Write-Host 'Nothing to redraw: every selected job is done or skipped.' -ForegroundColor Green
    exit 0
}

$transparentCount = @($toRun | Where-Object { $_.Job.Background -eq 'transparent' }).Count
if ($transparentCount -gt 0 -and $Model -match '^gpt-image-2(-\d{4}-\d{2}-\d{2})?$') {
    Write-Warning "$Model only had transparent backgrounds in preview; if requests fail or come back opaque, use -Model gpt-image-2.5-flare or gpt-image-1.5."
}
$runJobs = @($toRun | ForEach-Object Job)
$inputImages = ($runJobs | ForEach-Object { @($_.References).Count } | Measure-Object -Sum).Sum
$estimate = Get-CostEstimate -Jobs $runJobs -Quality $Quality -PerInputImage $InputImageCost
$fid = Test-InputFidelitySupport -Model $Model -Requested $InputFidelity
Write-Host ("This run will make {0} image edit calls with {1} input images in all (one output image each; retries for rate limits and server errors come on top)." -f $toRun.Count, $inputImages) -ForegroundColor Cyan
Write-Host ("Model {0}, quality {1}, input_fidelity {2}. Rough cost estimate: about `${3:0.00}: the output images, plus about `${4:0.00} per input image (an assumption; input images are billed as image input tokens, and high input fidelity uses more of them). Check current OpenAI pricing." -f $Model, $Quality, $(if ($fid) { $fid } else { 'not sent' }), $estimate, $InputImageCost)
if ($toRun.Count -gt 6 -and -not $Only) {
    Write-Host "Tip: try a small sample first, for example: -Only 'units/expert-lumberjack*' -Mode bold,pixel" -ForegroundColor DarkCyan
}
if (-not $Yes) {
    $ans = Read-Host 'Continue? [y/N]'
    if ($ans -notmatch '^(y|yes)$') { Write-Host 'Cancelled; nothing was sent.'; exit 3 }
}

$apiKey = Get-ApiKeySecure -UseEnvKey:$UseEnvKey

# ------------------------------------------------------------------------- run
$manifest['lastRun'] = [ordered]@{
    startedAt = Get-UtcStamp; model = $Model; quality = $Quality; inputFidelity = $fid; apiBase = $ApiBase
    modes = @($Mode); grids = @($Grid); promptFile = $PromptFile; styleRef = $StyleRef; anchorDir = $AnchorDir
    selected = $jobs.Count; planned = $toRun.Count; finishedAt = $null; stopReason = $null
}
Save-Manifest -Manifest $manifest -Path $manifestPath

$result = $null
try {
    $result = Invoke-ImageJobRun -ToRun $toRun -Jobs $jobs -Manifest $manifest -ManifestPath $manifestPath -OutDir $OutDir `
        -Settings $settings -ApiKey $apiKey -MaxConsecutiveFailures $MaxConsecutiveFailures -ResumeCommand $resumeCommand `
        -Activity 'Redrawing images' -SheetKind edit -NoContactSheet:$NoContactSheet
} finally {
    $apiKey = $null
}

if ($result.StopReason) { exit 2 }
if ($result.Failed -gt 0) { exit 1 }
exit 0
