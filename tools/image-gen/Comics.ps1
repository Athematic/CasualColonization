#Requires -Version 7.0
# Comics for Generate-Images.ps1 -Doc comics: docs/COMIC_PROMPTS.md (the style, page, panel and cast blocks) and
# docs/comics/*.md (the scripts). Dot-sourced by ImageGen.psm1, so it shares the module's scope (New-ImageJob).

# The Images API takes prompts up to 32000 characters for the GPT image models.
$script:ComicPromptLimit = 32000
$script:ComicTitles = @('Captain', 'Corporal', 'Lieutenant', 'Mr', 'Mrs', 'Miss', 'Ms', 'Old', 'Father', 'Mother', 'Sister', 'Brother', 'Master', 'Sergeant',
    'Governor', 'Doctor', 'Dr', 'Don', 'Dona', 'Doña', 'Fray', 'Lady', 'Lord', 'Chief', 'Elder', 'Grandmother', 'Grandfather', 'Madame', 'Monsieur',
    'Reverend', 'Collector', 'Inspector', 'Aunt', 'Uncle', 'Mama', 'Tata', 'Young')
# Speaker labels in the scripts that are lettering, not a person.
$script:ComicLetteringLabels = @('CAPTION', 'SFX', 'NOTE ON MAP', 'ALL', 'BOTH', 'EVERYONE', 'CROWD')

function Read-ComicPrompts {
    <# The four editable blocks of docs/COMIC_PROMPTS.md: ```comic, ```page, ```panel and ```cast. #>
    param([Parameter(Mandatory)][string]$Path)
    $text = [IO.File]::ReadAllText($Path)
    $r = [ordered]@{}
    foreach ($n in 'comic', 'page', 'panel', 'cast') {
        $m = [regex]::Match($text, '```' + $n + '\r?\n([\s\S]*?)\r?\n```')
        if (-not $m.Success) { throw "No ``````$n block found in $Path" }
        $r[$n] = $m.Groups[1].Value.Trim()
    }
    return [pscustomobject]$r
}

function ConvertTo-ComicPlain {
    param([AllowEmptyString()][string]$Text)
    return (($Text -replace '[\*`]', '') -replace '\s+', ' ').Trim()
}

function Get-ComicPanelHint {
    <# The size word in the lead of a panel description ("Wide establishing panel.", "Splash, ...", "Small inset: ..."), or $null. #>
    param([AllowEmptyString()][string]$Visual)
    $first = ($Visual -split '(?<=[.!?:])\s', 2)[0]
    $words = @($first -split '\s+')
    # Only the lead counts: within the first five words, or anywhere in a short first sentence.
    $lead = if ($words.Count -le 10) { $first } else { ($words | Select-Object -First 5) -join ' ' }
    foreach ($rule in @(@('splash', '\bsplash\b'), @('wide', '\b(wide|establishing|panoramic|full-width)\b'), @('tall', '\b(tall|narrow)\b'), @('small', '\b(small|tiny|inset)\b'))) {
        $m = [regex]::Match($lead, $rule[1], 'IgnoreCase')
        if ($m.Success) { return $(if ($rule[0] -eq 'wide') { $m.Value.ToLowerInvariant() } else { $rule[0] }) }
    }
    return $null
}

function Add-ComicAliases {
    <# Names a character can be called in the visuals: the full name and every capitalised word of it that no other character shares; groups ("Two scarlet macaws") by their last word. #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Cast)
    $owners = @{}
    $tokensOf = @{}
    foreach ($c in $Cast) {
        $clean = ($c.Name -replace '\(.*?\)', '').Trim()
        $tokens = @($clean -split '\s+' | Where-Object { $_ })
        if ($tokens.Count -gt 1 -and $tokens[0] -in 'The', 'Two', 'Three', 'A', 'An', 'Some') { $c.IsGroup = $true }
        $keep = @($tokens | Where-Object { $_.Length -ge 3 -and [char]::IsUpper($_[0]) -and $_ -notin $script:ComicTitles })
        $tokensOf[$c.Name] = $keep
        foreach ($t in $keep) {
            if (-not $owners.ContainsKey($t)) { $owners[$t] = [System.Collections.Generic.HashSet[string]]::new() }
            $null = $owners[$t].Add($c.Name)
        }
    }
    foreach ($c in $Cast) {
        $al = [System.Collections.Generic.List[object]]::new()
        if ($c.IsGroup) {
            $last = (($c.Name -split '\s+') | Select-Object -Last 1).ToLowerInvariant()
            $al.Add(@{ Text = $last; CI = $true })
            if ($last.EndsWith('s') -and $last.Length -gt 4) { $al.Add(@{ Text = $last.Substring(0, $last.Length - 1); CI = $true }) }
        } else {
            $al.Add(@{ Text = ($c.Name -replace '\(.*?\)', '').Trim(); CI = $false })
            foreach ($t in $tokensOf[$c.Name]) { if ($owners[$t].Count -eq 1 -and $t -ne $al[0].Text) { $al.Add(@{ Text = $t; CI = $false }) } }
        }
        $c.Aliases = $al.ToArray()
    }
}

function Read-ComicScript {
    <#
    .SYNOPSIS
    Parses one docs/comics/<slug>.md: Title, Setting, Cast (Name, Look, Aliases) and Pages (Number, Panels with
    Number, Visual, Hint, Speakers). Both writers' variants: the cast under "## Cast" or a bold "**Cast**" /
    "**Cast.**" line, bullets "- **Name**, look" / "- **Name**: look" / "- **Name:** look"; panels "**Panel N.**" or "N.".
    The first paragraph after a panel marker is the visual; CAPTION / SFX / NAME: lines are lettering and only
    their speaker names are kept.
    #>
    param([Parameter(Mandatory)][string]$Path)
    $lines = [IO.File]::ReadAllText($Path) -split '\r?\n'
    $slug = [IO.Path]::GetFileNameWithoutExtension($Path)
    $title = $slug
    $setting = ''
    $castRaw = [System.Collections.Generic.List[string]]::new()
    $pageStart = [System.Collections.Generic.List[object]]::new()
    $inCast = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $l = $lines[$i]
        if ($l -match '^# (.+)$' -and $title -eq $slug) { $title = ConvertTo-ComicPlain $Matches[1]; continue }
        if ($l -match '^\*\*Setting[.:]?\*\*:?\s*(.+)$') { $setting = ConvertTo-ComicPlain $Matches[1]; continue }
        if ($l -match '^## PAGE (\d+)\b') { $inCast = $false; $pageStart.Add(@([int]$Matches[1], $i)); continue }
        if ($l -match '^(## Cast\b.*|\*\*Cast[.:]?\*\*)\s*$') { $inCast = $true; continue }
        if ($inCast) {
            if ($l -match '^(## |---|\*\()') { $inCast = $false; continue }
            if ($l -match '^- (.+)$') { $castRaw.Add($Matches[1]) }
            elseif ($l -match '^\s+\S' -and $castRaw.Count -gt 0) { $castRaw[$castRaw.Count - 1] += ' ' + $l.Trim() }
        }
    }

    $cast = [System.Collections.Generic.List[object]]::new()
    foreach ($raw in $castRaw) {
        if ($raw -notmatch '^\*\*(.+?)\*\*(.*)$') { continue }
        $name = ConvertTo-ComicPlain ($Matches[1].Trim().TrimEnd(':', ','))
        $look = ($Matches[2] -replace '^[\s:,—–-]+', '')
        # "**Aimée Lebrun** (9): red coat ..." -> "aged 9, red coat ..."
        $look = $look -replace '^\((\d+)\)[\s:,]*', 'aged $1, ' -replace '^\(([^)]*)\)[\s:,]*', '($1) '
        $look = ConvertTo-ComicPlain $look
        $cast.Add([pscustomobject]@{ Name = $name; Look = $look; Aliases = @(); IsGroup = $false })
    }
    Add-ComicAliases -Cast $cast.ToArray()

    $lettering = '^(?<who>[\p{Lu}][\p{Lu}0-9 .\x27\u2019\-]*?)(\s*\([^)]*\))?\s*:\s'
    $pages = [System.Collections.Generic.List[object]]::new()
    for ($p = 0; $p -lt $pageStart.Count; $p++) {
        $from = $pageStart[$p][1] + 1
        $to = if ($p + 1 -lt $pageStart.Count) { $pageStart[$p + 1][1] - 1 } else { $lines.Count - 1 }
        # A later "## " heading (not a page) ends the page.
        for ($k = $from; $k -le $to; $k++) { if ($lines[$k] -match '^## ') { $to = $k - 1; break } }
        $panels = [System.Collections.Generic.List[object]]::new()
        $cur = $null
        for ($k = $from; $k -le $to; $k++) {
            $l = $lines[$k]
            $rest = $null
            if ($l -match '^\*\*Panel (\d+)\.?\*\*\s*(.*)$') { $num = [int]$Matches[1]; $rest = $Matches[2] }
            elseif ($l -match '^(\d+)\.\s+(.*)$') { $num = [int]$Matches[1]; $rest = $Matches[2] }
            if ($null -ne $rest) {
                $cur = @{ Number = $num; Visual = [System.Collections.Generic.List[string]]::new(); State = 'before'; Speakers = [System.Collections.Generic.List[string]]::new() }
                $panels.Add($cur)
                $l = $rest
            }
            if (-not $cur) { continue }
            $t = $l.Trim()
            if ($t -eq '---') { continue }
            if (-not $t) { if ($cur.State -eq 'in') { $cur.State = 'done' }; continue }
            if (($t + ' ') -cmatch $lettering) {
                $cur.State = 'done'
                $who = $Matches['who'].Trim()
                if (-not $cur.Speakers.Contains($who)) { $cur.Speakers.Add($who) }
                continue
            }
            if ($cur.State -ne 'done') { $cur.State = 'in'; $cur.Visual.Add($t) }
        }
        $outPanels = @(foreach ($c in $panels) {
                $v = ConvertTo-ComicPlain ($c.Visual -join ' ')
                [pscustomobject]@{ Number = $c.Number; Visual = $v; Hint = (Get-ComicPanelHint $v); Speakers = @($c.Speakers) }
            })
        $pages.Add([pscustomobject]@{ Number = $pageStart[$p][0]; Panels = $outPanels })
    }
    return [pscustomobject]@{ Slug = $slug; Title = $title; Setting = $setting; Cast = $cast.ToArray(); Pages = $pages.ToArray(); Path = $Path }
}

function Select-ComicCast {
    <# The cast entries (in cast order) named in the visual texts or among the speakers. #>
    param([AllowEmptyCollection()][object[]]$Cast, [string[]]$Texts, [string[]]$Speakers)
    $text = $Texts -join "`n"
    $spk = (@($Speakers | Where-Object { $_ -notmatch '[\x27\u2019]S\b' -and $_ -notin $script:ComicLetteringLabels }) -join "`n")
    return , @($Cast | Where-Object {
            $c = $_
            $hit = $false
            foreach ($a in $c.Aliases) {
                $re = '(?<!\p{L})' + [regex]::Escape($a.Text) + '(?!\p{L})'
                $opt = if ($a.CI) { 'IgnoreCase' } else { 'None' }
                if ([regex]::IsMatch($text, $re, $opt) -or [regex]::IsMatch($spk, $re, 'IgnoreCase')) { $hit = $true; break }
            }
            $hit
        })
}

function Format-ComicCast {
    param([AllowEmptyCollection()][object[]]$Chars, [string]$Header, [int]$LookMax = 0)
    if (@($Chars).Count -eq 0) { return '' }
    $rows = foreach ($c in $Chars) {
        $look = $c.Look
        if ($LookMax -lt 0) { $look = '' }
        elseif ($LookMax -gt 0 -and $look.Length -gt $LookMax) {
            $cut = $look.Substring(0, $LookMax)
            $dot = $cut.LastIndexOf('. ')
            $look = if ($dot -ge 40) { $cut.Substring(0, $dot + 1) } else { ($cut -replace '\s+\S*$', '') + '.' }
        }
        if ($look) { "- $($c.Name): $look" } else { "- $($c.Name)" }
    }
    return "$Header`n" + ($rows -join "`n")
}

function New-ComicPrompt {
    <# style + SETTING + CAST + unit block + body; if it would pass the API's prompt limit, the cast descriptions are shortened first (last resort: names only, then a plain cut), with a warning. #>
    param([string]$Style, [string]$Setting, [object[]]$Chars, [string]$CastHeader, [string]$UnitBlock, [string]$Body, [string]$Label)
    foreach ($lookMax in 0, 240, 140, 60, -1) {
        $parts = @($Style)
        if ($Setting) { $parts += "SETTING: $Setting" }
        $cb = Format-ComicCast -Chars $Chars -Header $CastHeader -LookMax $lookMax
        if ($cb) { $parts += $cb }
        $parts += $UnitBlock
        if ($Body) { $parts += $Body }
        $prompt = $parts -join "`n`n"
        if ($prompt.Length -le $script:ComicPromptLimit) {
            if ($lookMax -ne 0) { Write-Warning "${Label}: prompt over $($script:ComicPromptLimit) characters; cast descriptions shortened (limit $lookMax characters each, -1 = names only)." }
            return $prompt
        }
    }
    Write-Warning "${Label}: prompt still over $($script:ComicPromptLimit) characters with names only; truncated."
    return $prompt.Substring(0, $script:ComicPromptLimit)
}

function Get-ComicScriptPaths {
    param([Parameter(Mandatory)][string]$ComicsDir)
    return @(Get-ChildItem -LiteralPath $ComicsDir -Filter '*.md' -File | Where-Object { $_.Name -ne 'README.md' } | Sort-Object Name | ForEach-Object FullName)
}

function Get-ComicJobs {
    <#
    .SYNOPSIS
    Jobs for docs/comics/*.md. Unit page (default): comics/<slug>/page-01 .. page-12, 1024x1536. panel:
    comics/<slug>/page-01-panel-1 ..., 1536x1024 for wide, splash or establishing panels, else 1024x1024.
    cast: comics/<slug>/cast, 1536x1024, one character model sheet per comic. All opaque, output under comics/<slug>/.
    -Comic: wildcard patterns matched against the slug (no wildcard = anywhere in it).
    #>
    param(
        [Parameter(Mandatory)][string]$PromptDoc,
        [Parameter(Mandatory)][string]$ComicsDir,
        [ValidateSet('page', 'panel', 'cast')][string]$Unit = 'page',
        [string[]]$Comic
    )
    $blocks = Read-ComicPrompts -Path $PromptDoc
    $patterns = @(foreach ($p in $Comic) { foreach ($q in ($p -split ',')) { $q = $q.Trim(); if ($q) { if ($q -match '[\*\?\[]') { $q } else { "*$q*" } } } })
    $jobs = [System.Collections.Generic.List[object]]::new()
    foreach ($path in (Get-ComicScriptPaths -ComicsDir $ComicsDir)) {
        $slug = [IO.Path]::GetFileNameWithoutExtension($path)
        if ($patterns.Count -gt 0 -and @($patterns | Where-Object { $slug -like $_ }).Count -eq 0) { continue }
        $s = Read-ComicScript -Path $path
        $section = "Comic $($s.Slug): $($s.Title)"
        if ($Unit -eq 'cast') {
            $chars = @($s.Cast | Where-Object { -not $_.IsGroup })
            $prompt = New-ComicPrompt -Style $blocks.comic -Setting $s.Setting -Chars $chars -CastHeader 'CAST (every character of this comic):' `
                -UnitBlock $blocks.cast -Body '' -Label "comics/$slug/cast"
            $jobs.Add((New-ImageJob -Doc 'comics' -Id "$slug/cast" -Section $section -Category 'comic-cast' -Size '1536x1024' -Background 'opaque' `
                        -Prompt $prompt -Notes "Model sheet of $($chars.Count) characters." -Subject ($chars.Name -join ', ')))
            continue
        }
        foreach ($pg in $s.Pages) {
            $pn = '{0:00}' -f $pg.Number
            if ($Unit -eq 'page') {
                $chars = Select-ComicCast -Cast $s.Cast -Texts @($pg.Panels.Visual) -Speakers @($pg.Panels.Speakers | ForEach-Object { $_ })
                $body = (@(foreach ($pl in $pg.Panels) {
                            $h = if ($pl.Hint) { " ($($pl.Hint))" } else { '' }
                            "PANEL $($pl.Number)${h}: $($pl.Visual)"
                        }) -join "`n")
                $block = $blocks.page.Replace('{PANEL_COUNT}', [string]$pg.Panels.Count)
                $prompt = New-ComicPrompt -Style $blocks.comic -Setting $s.Setting -Chars $chars -CastHeader 'CAST (draw each exactly as described, the same in every panel):' `
                    -UnitBlock $block -Body $body -Label "comics/$slug/page-$pn"
                $note = "$($pg.Panels.Count) panels; characters: " + $(if ($chars) { $chars.Name -join ', ' } else { 'none named' })
                $jobs.Add((New-ImageJob -Doc 'comics' -Id "$slug/page-$pn" -Section $section -Category 'comic-page' -Size '1024x1536' -Background 'opaque' `
                            -Prompt $prompt -Notes $note -Subject $body))
            } else {
                foreach ($pl in $pg.Panels) {
                    $chars = Select-ComicCast -Cast $s.Cast -Texts @($pl.Visual) -Speakers $pl.Speakers
                    $wide = $pl.Hint -in 'splash', 'wide', 'establishing', 'panoramic', 'full-width'
                    $size = if ($wide) { '1536x1024' } else { '1024x1024' }
                    $h = if ($pl.Hint) { " ($($pl.Hint))" } else { '' }
                    $id = "$slug/page-$pn-panel-$($pl.Number)"
                    $prompt = New-ComicPrompt -Style $blocks.comic -Setting $s.Setting -Chars $chars -CastHeader 'CAST (draw each exactly as described):' `
                        -UnitBlock $blocks.panel -Body "PANEL${h}: $($pl.Visual)" -Label "comics/$id"
                    $note = "page $($pg.Number) panel $($pl.Number); characters: " + $(if ($chars) { $chars.Name -join ', ' } else { 'none named' })
                    $jobs.Add((New-ImageJob -Doc 'comics' -Id $id -Section $section -Category 'comic-panel' -Size $size -Background 'opaque' `
                                -Prompt $prompt -Notes $note -Subject $pl.Visual))
                }
            }
        }
    }
    return , $jobs.ToArray()
}
