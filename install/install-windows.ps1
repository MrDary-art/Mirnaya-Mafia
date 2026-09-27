#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Bundle,
    [string]$BundleUrl,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$BundleSha256,
    [string]$InstallDir = "$env:ProgramData\MasterNegotiations"
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with code $LASTEXITCODE. Installation data was preserved." }
}
function Receive-Verified([string]$Url, [string]$Path, [string]$Sha) {
    if (-not $Url.StartsWith('https://')) { throw 'HTTPS download required' }
    for ($attempt=0; $attempt -lt 3; $attempt++) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile "$Path.partial" -TimeoutSec 180
            if ((Get-FileHash -LiteralPath "$Path.partial" -Algorithm SHA256).Hash -ne $Sha) { throw 'Checksum mismatch' }
            Move-Item -LiteralPath "$Path.partial" -Destination $Path -Force
            return
        } catch { if ($attempt -eq 2) { throw }; Start-Sleep -Seconds 2 }
    }
}
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -notin @('AMD64','x86')) { throw 'Windows x64 is required' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as Administrator to install services.' }
$build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
if ($build -lt 19045) { throw 'Windows 10 22H2 or Windows 11 is required' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if (Test-Path -LiteralPath (Join-Path $InstallDir 'installation.json')) { Write-Output "Existing installation preserved. Use $InstallDir\arena.cmd status or update."; exit 0 }
foreach ($name in @('arena-api','arena-web')) {
    if ((Get-Service -Name $name -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath (Join-Path $InstallDir 'installation-plan.json'))) { throw "Service $name already exists. Nothing was replaced." }
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($InstallDir))
if ($drive.AvailableFreeSpace -lt 8GB) { throw 'At least 8 GB free space is required' }
$stage = Join-Path $InstallDir ('staging-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$archive = Join-Path $stage 'release.zip'
if ($Bundle) {
    $Bundle = [IO.Path]::GetFullPath($Bundle)
    if ((Get-FileHash -LiteralPath $Bundle -Algorithm SHA256).Hash -ne $BundleSha256) { throw 'Release checksum mismatch' }
    Copy-Item -LiteralPath $Bundle -Destination $archive
} elseif ($BundleUrl) { Receive-Verified $BundleUrl $archive $BundleSha256 } else { throw 'Specify -Bundle or -BundleUrl and -BundleSha256 from the release.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$payload = Join-Path $stage 'payload'
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $payload $entry.FullName))
        if (-not $target.StartsWith($payload + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive entry' }
    }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($archive, $payload)
$tools = Join-Path $InstallDir 'tools'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$uvArchive = Join-Path $stage 'uv.zip'
Receive-Verified 'https://github.com/astral-sh/uv/releases/download/0.12.19/uv-x86_64-pc-windows-msvc.zip' $uvArchive '6dbb02d79e419522f1c500f0adb1cddcff0cda7d59b0d66ea7f5e3b4a1b2f5f0'
[IO.Compression.ZipFile]::ExtractToDirectory($uvArchive, (Join-Path $stage 'uv'))
Copy-Item -LiteralPath (Join-Path $stage 'uv\uv.exe') -Destination (Join-Path $tools 'uv.exe') -Force
$uv = Join-Path $tools 'uv.exe'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $InstallDir 'python'
$env:UV_CACHE_DIR = Join-Path $InstallDir 'cache'
$env:PYTHONUTF8 = '1'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Invoke-Checked $uv @('python','install','3.12.12','--no-bin')
if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'runtime\Scripts\python.exe'))) {
    Invoke-Checked $uv @('venv','--managed-python','--python','3.12.12',(Join-Path $InstallDir 'runtime'))
}
$python = Join-Path $InstallDir 'runtime\Scripts\python.exe'
Invoke-Checked $uv @('pip','sync','--python',$python,'--require-hashes',(Join-Path $payload 'install\requirements.lock'))
$env:ARENA_INSTALL_BUNDLE = $archive
$env:ARENA_INSTALL_HOME = $InstallDir
$env:PYTHONPATH = $payload
$verifyScript = Join-Path $stage 'verify_release.py'
[IO.File]::WriteAllText($verifyScript, @'
import os
from pathlib import Path
from install.setup import unpack_release
print(unpack_release(Path(os.environ["ARENA_INSTALL_BUNDLE"]), Path(os.environ["ARENA_INSTALL_HOME"])))
'@, [Text.UTF8Encoding]::new($false))
$release = & $python $verifyScript
if ($LASTEXITCODE -ne 0) { throw 'Release verification failed' }
Remove-Item Env:PYTHONPATH
Invoke-Checked $python @((Join-Path $release 'install\setup.py'),'--home',$InstallDir)
