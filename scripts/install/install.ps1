# ─────────────────────────────────────────────────────────────────────────────
# Ix — Windows Installer (PowerShell)
#
# Installs everything needed to run Ix:
#   1. Node.js (checks / installs / upgrades)
#   2. Docker Desktop (checks / prompts)
#   3. Backend (ArangoDB + Memory Layer via Docker)
#   4. ix CLI$
#
# Usage:
#   irm https://ix-infra.com/install.ps1 | iex
#
# Options (env vars):
#   $env:IX_VERSION = "0.2.0"     Override version
#   $env:IX_SKIP_BACKEND = "1"    Skip Docker backend
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ── Config ───────────────────────────────────────────────────────────────────

$GithubOrg = "ix-infrastructure"
$GithubRepo = "Ix"
$GithubRaw = "https://raw.githubusercontent.com/$GithubOrg/$GithubRepo/main"
$IxHome = if ($env:IX_HOME) { $env:IX_HOME } else { "$env:USERPROFILE\.ix" }
$IxBin = "$IxHome\bin"
$ComposeDir = "$IxHome\backend"
$HealthUrl = "http://localhost:8090/v1/health"
$ArangoUrl = "http://localhost:8529/_api/version"
$NodeMinMajor = 20

# ── Helpers ──────────────────────────────────────────────────────────────────

function Pause-On-Failure {
    if ($Host.Name -eq "ConsoleHost") {
        Write-Host ""
        Read-Host "Press Enter to exit"
    }
}

function Write-Ok($msg) {
    Write-Host "  [ok] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [!!] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  [error] $msg" -ForegroundColor Red
    Pause-On-Failure
    exit 1
}

trap {
    Write-Host ""
    Write-Host "Ix installer failed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Error:" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)"
    Write-Host ""

    if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
        Write-Host "Location:" -ForegroundColor Yellow
        Write-Host $_.InvocationInfo.PositionMessage
        Write-Host ""
    }

    Write-Host "Troubleshooting:"
    Write-Host "  1. Make sure Docker Desktop is running."
    Write-Host "  2. Try running this script from an already-open PowerShell window."
    Write-Host "  3. Re-run with:"
    Write-Host "     powershell -ExecutionPolicy Bypass -File .\install.ps1"
    Write-Host ""

    Pause-On-Failure
    exit 1
}

function Test-Healthy {
    try {
        $null = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        $null = Invoke-WebRequest -Uri $ArangoUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Get-LatestVersion {
    if ($env:IX_VERSION) { return $env:IX_VERSION }

    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GithubOrg/$GithubRepo/releases/latest" -ErrorAction Stop
        return $release.tag_name -replace '^v', ''
    } catch {
        return "0.1.0"
    }
}

function Test-DockerRunning {
    $dockerInfoOutput = cmd /c "docker info 2>&1"
    $dockerExitCode = $LASTEXITCODE

    if ($dockerExitCode -eq 0) {
        return $true
    }

    Write-Host ""
    Write-Host "  Docker is installed but Docker Engine is not reachable." -ForegroundColor Yellow
    Write-Host "  Start Docker Desktop, wait until it says Docker is running, then re-run this installer."
    Write-Host ""

    if ($dockerInfoOutput) {
        Write-Host "  Docker output:"
        $dockerInfoOutput | ForEach-Object {
            Write-Host "    $_"
        }
        Write-Host ""
    }

    return $false
}

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "+" + ("=" * 42) + "+" -ForegroundColor Cyan
Write-Host "|       Ix - Install                |" -ForegroundColor Cyan
Write-Host "+" + ("=" * 42) + "+" -ForegroundColor Cyan
Write-Host ""

$Version = Get-LatestVersion
Write-Host "  Version:  $Version"
Write-Host "  Platform: windows-amd64"

# ── Step 1: Node.js ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- 1. Node.js (runtime) --" -ForegroundColor White

function Get-NodeMajorVersion {
    try {
        $ver = & node -v 2>$null
        if (-not $ver) { return 0 }
        return [int]($ver -replace '^v','').Split('.')[0]
    } catch {
        return 0
    }
}

function Install-NodeJS($action) {
    $wingetAvailable = Get-Command winget -ErrorAction SilentlyContinue
    $chocoAvailable = Get-Command choco -ErrorAction SilentlyContinue

    if ($wingetAvailable) {
        Write-Host "  $action Node.js via winget..."
        if ($action -eq "Upgrading") {
            winget upgrade OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        } else {
            winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
        }
    } elseif ($chocoAvailable) {
        Write-Host "  $action Node.js via Chocolatey..."
        if ($action -eq "Upgrading") {
            choco upgrade nodejs-lts -y
        } else {
            choco install nodejs-lts -y
        }
    } else {
        Write-Host "  $action Node.js via official installer..."
        $nodeInstaller = "$env:TEMP\node-install.msi"
        Write-Host "  Downloading Node.js LTS installer..."

        try {
            $nodeIndex = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -ErrorAction Stop
            $ltsEntry = $nodeIndex | Where-Object { $_.lts -ne $false } | Select-Object -First 1
            $nodeVer = $ltsEntry.version -replace '^v', ''
        } catch {
            $nodeVer = "22.14.0"
        }

        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVer/node-v$nodeVer-x64.msi" `
            -OutFile $nodeInstaller -UseBasicParsing -ErrorAction Stop

        Write-Host "  Running installer..."
        Start-Process msiexec.exe -ArgumentList "/i", $nodeInstaller, "/qn", "/norestart" -Wait -NoNewWindow
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
    }

    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:Path = "$machinePath;$userPath"
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $currentMajor = Get-NodeMajorVersion

    if ($currentMajor -ge $NodeMinMajor) {
        $nodeVer = & node -v 2>$null
        Write-Ok "Node.js $nodeVer is installed (>= $NodeMinMajor required)"
    } else {
        $nodeVer = & node -v 2>$null
        Write-Warn "Node.js $nodeVer is too old (>= $NodeMinMajor required)"

        Install-NodeJS "Upgrading"

        $currentMajor = Get-NodeMajorVersion
        if ($currentMajor -lt $NodeMinMajor) {
            Write-Err "Node.js upgrade failed. Install Node.js $NodeMinMajor+ manually: https://nodejs.org/"
        }

        $nodeVer = & node -v 2>$null
        Write-Ok "Node.js upgraded to $nodeVer"
    }
} else {
    Install-NodeJS "Installing"

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Err "Node.js installation failed. Install Node.js $NodeMinMajor+ manually: https://nodejs.org/"
    }

    $nodeVer = & node -v 2>$null
    Write-Ok "Node.js $nodeVer installed"
}

# ── Step 2: Docker ───────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- 2. Docker --" -ForegroundColor White

if ($env:IX_SKIP_BACKEND -eq "1") {
    Write-Host "  (skipped via IX_SKIP_BACKEND=1)"
} else {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue

    if (-not $dockerCmd) {
        Write-Host ""
        Write-Host "  Docker Desktop is required to run the Ix backend." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Install Docker Desktop for Windows:"
        Write-Host "    https://docs.docker.com/desktop/install/windows-install/"
        Write-Host ""
        Write-Host "  Or via winget:"
        Write-Host "    winget install Docker.DockerDesktop"
        Write-Host ""

        Write-Err "Install Docker Desktop and re-run this installer."
    }

    Write-Ok "Docker is installed"

    if (Test-DockerRunning) {
        Write-Ok "Docker is running"
    } else {
        Write-Err "Docker is not running."
    }
}

# ── Step 3: Backend ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- 3. Backend (ArangoDB + Memory Layer) --" -ForegroundColor White

if ($env:IX_SKIP_BACKEND -eq "1") {
    Write-Host "  (skipped via IX_SKIP_BACKEND=1)"
} elseif (Test-Healthy) {
    Write-Ok "Backend is already running and healthy"
    Write-Host "  Memory Layer: http://localhost:8090"
    Write-Host "  ArangoDB:     http://localhost:8529"
} else {
    New-Item -ItemType Directory -Force -Path $ComposeDir | Out-Null

    Write-Host "  Downloading docker-compose.yml..."
    Invoke-WebRequest -Uri "$GithubRaw/docker-compose.standalone.yml" `
        -OutFile "$ComposeDir\docker-compose.yml" -UseBasicParsing -ErrorAction Stop

    Write-Ok "Downloaded docker-compose.yml"

    Write-Host "  Starting backend services..."
    docker compose -f "$ComposeDir\docker-compose.yml" up -d --pull always
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Docker Compose failed to start backend services."
    }

    Write-Host "  Waiting for services to become healthy..."
    $healthy = $false

    for ($i = 0; $i -lt 30; $i++) {
        if (Test-Healthy) {
            $healthy = $true
            break
        }

        Write-Host -NoNewline "."
        Start-Sleep -Seconds 2
    }

    Write-Host ""

    if ($healthy) {
        Write-Ok "Backend is ready"
    } else {
        Write-Warn "Backend may still be starting."
        Write-Host "  Check logs with:"
        Write-Host "    docker compose -f `"$ComposeDir\docker-compose.yml`" logs"
    }

    Write-Host "  Memory Layer: http://localhost:8090"
    Write-Host "  ArangoDB:     http://localhost:8529"
}

# ── Step 4: ix CLI ───────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- 4. ix CLI --" -ForegroundColor White

$TarballName = "ix-$Version-windows-amd64.zip"
$TarballUrl = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$TarballName"
$InstallDir = "$IxHome\cli"

New-Item -ItemType Directory -Force -Path $IxBin | Out-Null
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$existingVersion = ""
if (Test-Path "$IxBin\ix.cmd") {
    try {
        $existingVersion = & "$IxBin\ix.cmd" --version 2>$null
    } catch {
        $existingVersion = ""
    }
}

if ($existingVersion -eq $Version) {
    Write-Ok "ix CLI v$Version is already installed"
} else {
    Write-Host "  Downloading ix CLI v$Version..."
    $tmpZip = "$env:TEMP\$TarballName"

    try {
        Invoke-WebRequest -Uri $TarballUrl -OutFile $tmpZip -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Warn "Could not download pre-built CLI from:"
        Write-Warn "  $TarballUrl"
        Write-Host ""
        Write-Host "  Build from source instead:"
        Write-Host "    git clone https://github.com/$GithubOrg/$GithubRepo.git"
        Write-Host "    cd $GithubRepo"
        Write-Host "    .\setup.sh"

        Write-Err "CLI download failed."
    }

    Expand-Archive -Path $tmpZip -DestinationPath $InstallDir -Force
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue

    Write-Ok "Extracted CLI to $InstallDir"

    @"
@echo off
"%~dp0..\cli\ix-$Version-windows-amd64\ix.cmd" %*
"@ | Out-File -FilePath "$IxBin\ix.cmd" -Encoding ascii

    Write-Ok "Installed: $IxBin\ix.cmd"

    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$IxBin*") {
        [Environment]::SetEnvironmentVariable("PATH", "$IxBin;$userPath", "User")
        Write-Ok "Added $IxBin to user PATH"
    }

    if ($env:Path -notlike "*$IxBin*") {
        $env:Path = "$IxBin;$env:Path"
    }
}

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "+" + ("=" * 42) + "+" -ForegroundColor Green
Write-Host "|       Ix is ready!                |" -ForegroundColor Green
Write-Host "+" + ("=" * 42) + "+" -ForegroundColor Green
Write-Host ""

if ($env:IX_SKIP_BACKEND -ne "1") {
    Write-Host "  Backend:  http://localhost:8090"
    Write-Host "  ArangoDB: http://localhost:8529"
    Write-Host ""
}

$ixCmd = Get-Command ix -ErrorAction SilentlyContinue
if ($ixCmd) {
    try {
        $cliVersion = & ix --version 2>$null
        Write-Ok "ix CLI v$cliVersion is working"
    } catch {
        Write-Warn "ix installed but could not verify. Open a new terminal to use it."
    }
} else {
    Write-Warn "ix is not in PATH yet. Open a new terminal to use it."
}

Write-Host ""
Write-Host "  Connect a project:"
Write-Host "    cd ~\my-project"
Write-Host "    ix map ."
Write-Host ""
Write-Host "  To uninstall:"
Write-Host "    irm $GithubRaw/uninstall.ps1 | iex"
Write-Host ""
