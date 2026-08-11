param(
    [string]$VersionFile = "VERSION"
)

if (-not (Test-Path $VersionFile)) {
    Write-Error "Version file '$VersionFile' not found."
    exit 1
}

$version = (Get-Content $VersionFile -Raw).Trim()
Write-Output "Using version: $version"

$patterns = @('*.html','*.js','*.css')
$files = Get-ChildItem -Path . -Recurse -Include $patterns -File

$pattern = '\?v=(?!\{)[^"''>\s]+'
$regex = [regex]::new($pattern)

$count = 0
foreach ($f in $files) {
    $text = Get-Content $f.FullName -Raw
    $new = $regex.Replace($text, "?v=$version")
    if ($new -ne $text) {
        Set-Content -Path $f.FullName -Value $new -Encoding UTF8
        Write-Output "Updated: $($f.FullName)"
        $count++
    }
}

Write-Output "Updated $count files."
