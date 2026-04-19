# Add GraphicsMagick and Ghostscript to PATH
$gmPath = "C:\Program Files\GraphicsMagick-1.3.42-Q16"
$gsPath = "C:\Program Files\gs\gs10.03.0\bin"

# Get current user PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

$pathsToAdd = @()

if ($currentPath -notlike "*GraphicsMagick*") {
    $pathsToAdd += $gmPath
    Write-Host "Adding GraphicsMagick to PATH" -ForegroundColor Green
}

if ($currentPath -notlike "*gs10*") {
    $pathsToAdd += $gsPath
    Write-Host "Adding Ghostscript to PATH" -ForegroundColor Green
}

if ($pathsToAdd.Count -gt 0) {
    $newPath = $currentPath + ";" + ($pathsToAdd -join ";")
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "PATH updated! Please restart your terminal." -ForegroundColor Cyan

    # Also update current session
    $env:Path = $env:Path + ";" + ($pathsToAdd -join ";")
} else {
    Write-Host "Paths already configured." -ForegroundColor Yellow
}

# Verify
Write-Host ""
Write-Host "Verifying installations:" -ForegroundColor Cyan
Write-Host "GraphicsMagick: " -NoNewline
& "$gmPath\gm.exe" version 2>&1 | Select-Object -First 1

Write-Host "Ghostscript: " -NoNewline
& "$gsPath\gswin64c.exe" --version 2>&1 | Select-Object -First 1
