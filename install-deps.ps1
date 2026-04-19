$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

# Create temp directory
$tempDir = Join-Path $env:TEMP 'vmaker_deps'
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

Write-Host "=== Installing Dependencies for CiRA VMaker ===" -ForegroundColor Cyan
Write-Host ""

# Install Ghostscript
Write-Host "[1/3] Downloading Ghostscript..." -ForegroundColor Yellow
$gsUrl = 'https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10030/gs10030w64.exe'
$gsInstaller = Join-Path $tempDir 'gs_installer.exe'

try {
    Invoke-WebRequest -Uri $gsUrl -OutFile $gsInstaller -UseBasicParsing
    Write-Host "      Installing Ghostscript silently..." -ForegroundColor Yellow
    Start-Process -FilePath $gsInstaller -ArgumentList '/S' -Wait
    Write-Host "      Ghostscript installed!" -ForegroundColor Green
} catch {
    Write-Host "      Failed to install Ghostscript: $_" -ForegroundColor Red
}

# Install GraphicsMagick
Write-Host "[2/3] Downloading GraphicsMagick..." -ForegroundColor Yellow
$gmUrl = 'https://sourceforge.net/projects/graphicsmagick/files/graphicsmagick-binaries/1.3.43/GraphicsMagick-1.3.43-Q16-win64-dll.exe/download'
$gmInstaller = Join-Path $tempDir 'gm_installer.exe'

try {
    # SourceForge redirects, so we need to follow redirects
    Invoke-WebRequest -Uri $gmUrl -OutFile $gmInstaller -UseBasicParsing -MaximumRedirection 5
    Write-Host "      Installing GraphicsMagick silently..." -ForegroundColor Yellow
    Start-Process -FilePath $gmInstaller -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait
    Write-Host "      GraphicsMagick installed!" -ForegroundColor Green
} catch {
    Write-Host "      Failed to install GraphicsMagick: $_" -ForegroundColor Red
    Write-Host "      Please download manually from: https://sourceforge.net/projects/graphicsmagick/files/" -ForegroundColor Yellow
}

# Install LibreOffice
Write-Host "[3/3] Downloading LibreOffice (this may take a while)..." -ForegroundColor Yellow
$loUrl = 'https://download.documentfoundation.org/libreoffice/stable/24.2.4/win/x86_64/LibreOffice_24.2.4_Win_x86-64.msi'
$loInstaller = Join-Path $tempDir 'libreoffice_installer.msi'

try {
    Invoke-WebRequest -Uri $loUrl -OutFile $loInstaller -UseBasicParsing
    Write-Host "      Installing LibreOffice silently (this takes a few minutes)..." -ForegroundColor Yellow
    Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', $loInstaller, '/qn', '/norestart' -Wait
    Write-Host "      LibreOffice installed!" -ForegroundColor Green
} catch {
    Write-Host "      Failed to install LibreOffice: $_" -ForegroundColor Red
    Write-Host "      Please download manually from: https://www.libreoffice.org/download/download/" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Cyan
Write-Host "Please restart your terminal and the server for changes to take effect." -ForegroundColor White
Write-Host ""

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
