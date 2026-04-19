$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$tempDir = Join-Path $env:TEMP 'vmaker_deps'
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

Write-Host "=== Installing Remaining Dependencies ===" -ForegroundColor Cyan

# Try direct GraphicsMagick download
Write-Host "[1/2] Downloading GraphicsMagick..." -ForegroundColor Yellow
$gmUrl = 'https://sourceforge.net/projects/graphicsmagick/files/graphicsmagick-binaries/1.3.42/GraphicsMagick-1.3.42-Q16-win64-dll.exe/download'

try {
    $webClient = New-Object System.Net.WebClient
    $gmInstaller = Join-Path $tempDir 'gm_installer.exe'
    $webClient.DownloadFile($gmUrl, $gmInstaller)

    if (Test-Path $gmInstaller) {
        Write-Host "      Installing GraphicsMagick..." -ForegroundColor Yellow
        Start-Process -FilePath $gmInstaller -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait
        Write-Host "      GraphicsMagick installed!" -ForegroundColor Green
    }
} catch {
    Write-Host "      GraphicsMagick download failed. Opening download page..." -ForegroundColor Yellow
    Start-Process "https://sourceforge.net/projects/graphicsmagick/files/graphicsmagick-binaries/1.3.42/"
}

# LibreOffice with correct URL
Write-Host "[2/2] Downloading LibreOffice..." -ForegroundColor Yellow
$loUrl = 'https://download.documentfoundation.org/libreoffice/stable/24.2.5/win/x86_64/LibreOffice_24.2.5_Win_x86-64.msi'

try {
    $loInstaller = Join-Path $tempDir 'libreoffice.msi'

    Write-Host "      Downloading (this may take several minutes)..." -ForegroundColor Yellow
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($loUrl, $loInstaller)

    if (Test-Path $loInstaller) {
        $fileSize = (Get-Item $loInstaller).Length / 1MB
        Write-Host "      Downloaded $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
        Write-Host "      Installing LibreOffice silently..." -ForegroundColor Yellow
        Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i', "`"$loInstaller`"", '/qn', '/norestart' -Wait
        Write-Host "      LibreOffice installed!" -ForegroundColor Green
    }
} catch {
    Write-Host "      LibreOffice download failed. Opening download page..." -ForegroundColor Yellow
    Start-Process "https://www.libreoffice.org/download/download-libreoffice/"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
