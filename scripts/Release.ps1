<#
    Publie une release GitHub avec l'APK signe.
    Prerequis : version incrementee dans package.json, commit + push faits, cle %USERPROFILE%\.tomline-signing\fourchettesure.properties.
    Usage : .\scripts\Release.ps1 [-Notes "texte"] [-NotesFile f.md] [-NoPublish]
#>
param([string]$Notes, [string]$NotesFile, [switch]$NoPublish)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$ver"
$props = Join-Path $env:USERPROFILE '.tomline-signing\fourchettesure.properties'
if (-not (Test-Path $props)) { throw "Cle de signature absente : $props" }
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) { throw 'ANDROID_HOME invalide (SDK Android introuvable).' }

if (-not $NoPublish) {
    if (git status --porcelain) { throw 'Arbre git non propre : commit d abord.' }
    git fetch origin --tags | Out-Null
    if (git log '@{u}..' --oneline) { throw 'Commits non pousses : git push d abord.' }
    if (git tag -l $tag) { throw "Le tag $tag existe deja : incremente la version dans package.json." }
}

npm run build; if ($LASTEXITCODE) { throw 'npm run build a echoue' }
# CI=true evite le prompt de telemetrie Capacitor ; retire ensuite car gh refuse de publier en mode CI sans GH_TOKEN.
$oldCI = $env:CI; $env:CI = 'true'
npx cap sync android; $syncCode = $LASTEXITCODE
$env:CI = $oldCI
if ($syncCode) { throw 'cap sync a echoue' }
Push-Location android
try { .\gradlew.bat assembleRelease --no-daemon; if ($LASTEXITCODE) { throw 'gradle assembleRelease a echoue' } } finally { Pop-Location }

$src = 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $src)) { throw "APK signe introuvable : $src (build non signe ?)" }
$apk = "FourchetteSure-$tag.apk"
Copy-Item $src $apk -Force
Write-Output "APK : $apk"
if ($NoPublish) { return }

if ($NotesFile) { $Notes = Get-Content $NotesFile -Raw }
if (-not $Notes) {
    $prev = git describe --tags --abbrev=0 2>$null
    $range = if ($prev) { "$prev..HEAD" } else { 'HEAD' }
    $Notes = (git log $range --pretty='- %s') -join "`n"
}
gh release create $tag $apk --title "FourchetteSure $tag" --notes $Notes
if ($LASTEXITCODE) { throw 'gh release create a echoue' }
Write-Output "Release $tag publiee."
