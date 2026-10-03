# Builds the Voice-Follow tester installer natively on Windows.
# Run from a PowerShell prompt inside the unzipped source folder:
#   powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
# Needs: Node.js 18 (https://nodejs.org, LTS 18.x), Git, Python 3. electron-builder downloads
# the rest. First run takes 10-20 minutes (downloads Electron and native modules).
$ErrorActionPreference = "Stop"

Write-Host "== Node version (must be 18.x)"; node -v
if (-not (Test-Path "build-resources\voice-follow\model.int8.onnx")) {
  # The speech model (184 MB) is bundled into the installer. Copy it from an installed tester app
  # (per-user install under LocalAppData, or an all-users install under Program Files):
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Voice-Sikhi-To-The-Max\resources\voice-follow\model.int8.onnx",
    "$env:ProgramFiles\Voice-Sikhi-To-The-Max\resources\voice-follow\model.int8.onnx"
  )
  $installed = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($installed) {
    New-Item -ItemType Directory -Force -Path "build-resources\voice-follow" | Out-Null
    Copy-Item $installed "build-resources\voice-follow\model.int8.onnx"
    Write-Host "== model copied from $installed"
  } else {
    throw "Put the speech model at build-resources\voice-follow\model.int8.onnx first (from an installed tester app, or ask Arashdeep for the file)."
  }
}

# node-gyp (needed for the mdns module) ships a gyp that imports distutils, which Python 3.12
# removed. If the default python lacks it, point node-gyp at a Python 3.8-3.11 on this PC.
function Test-Distutils($exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $false }
  $out = cmd /c "`"$exe`" -c `"import distutils`" 2>&1"
  return ($LASTEXITCODE -eq 0)
}
if (-not (Test-Distutils $env:npm_config_python)) {
  $default = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (Test-Distutils $default) {
    $env:npm_config_python = $default
  } else {
    $py = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python31[01]\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python3[89]\python.exe", "C:\Python31[01]\python.exe", "C:\Python3[89]\python.exe", "C:\Program Files\Python31[01]\python.exe", "C:\tools\fb-python\fb-python31[01]\python.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName | Where-Object { Test-Distutils $_ } | Select-Object -First 1
    if (-not $py) { throw "node-gyp needs a Python 3.8-3.11 (with distutils); install one and set `$env:npm_config_python to it." }
    $env:npm_config_python = $py
  }
}
Write-Host "== node-gyp will use $env:npm_config_python"

# The mdns module compiles against Apple's Bonjour SDK (dns_sd.h + dnssd.lib). If it is not
# installed, unpack the SDK that ships in assets\ into a user folder (no admin needed; 7-Zip
# required, as msiexec /a refuses to run unelevated on some PCs) and point node-gyp at it.
if (-not $env:BONJOUR_SDK_HOME -or -not (Test-Path "$env:BONJOUR_SDK_HOME\Include\dns_sd.h")) {
  $sdk = "$env:LOCALAPPDATA\BonjourSDK"
  if (Test-Path "C:\Program Files\Bonjour SDK\Include\dns_sd.h") {
    $sdk = "C:\Program Files\Bonjour SDK"
  } elseif (-not (Test-Path "$sdk\Include\dns_sd.h")) {
    $7z = @("C:\Program Files\7-Zip\7z.exe", (Get-Command 7z -ErrorAction SilentlyContinue).Source) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $7z) { throw "mdns needs the Bonjour SDK. Either install assets\bonjoursdksetup.exe (admin) or install 7-Zip so this script can unpack it into $sdk." }
    $tmp = Join-Path $env:TEMP "bonjour-sdk-unpack"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    & $7z x -y "-o$tmp\setup" "assets\bonjoursdksetup.exe" | Out-Null
    & $7z x -y "-o$tmp\msi" "$tmp\setup\BonjourSDK64.msi" | Out-Null
    New-Item -ItemType Directory -Force "$sdk\Include", "$sdk\Lib\x64", "$sdk\Lib\Win32" | Out-Null
    Copy-Item "$tmp\msi\dns_sd.h" "$sdk\Include\dns_sd.h"
    Copy-Item "$tmp\msi\dnssd64.lib" "$sdk\Lib\x64\dnssd.lib"
    Copy-Item "$tmp\msi\dnssd32.lib" "$sdk\Lib\Win32\dnssd.lib"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "== Bonjour SDK unpacked to $sdk"
  }
  $env:BONJOUR_SDK_HOME = $sdk
}
Write-Host "== BONJOUR_SDK_HOME=$env:BONJOUR_SDK_HOME"

Write-Host "== Installing dependencies (this rebuilds native modules for Windows)"
npm ci

Write-Host "== Excluding research data from the installer"
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));if(!p.build.files.includes('!research${/*}'))p.build.files.push('!research${/*}');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"

Write-Host "== Building the app"
npm run build

# The upload key is not in the source: inject it into the compiled config (VF_UPLOAD_KEY env var).
if (-not $env:VF_UPLOAD_KEY) { throw "Set VF_UPLOAD_KEY (the S3 upload key) in this shell before building." }
$cfg = "www\js\addons\voice-follow\shadow\config.js"
(Get-Content $cfg -Raw).Replace("__VF_UPLOAD_KEY__", $env:VF_UPLOAD_KEY) | Set-Content $cfg -NoNewline
if (Select-String -Path $cfg -Pattern "__VF_UPLOAD_KEY__" -Quiet) { throw "upload key was not injected" }

Write-Host "== Packaging the installer"
npx electron-builder --win --x64 --publish never

git checkout package.json
$exe = Get-ChildItem builds\*.exe | Sort-Object LastWriteTime | Select-Object -Last 1
Write-Host "== DONE: $($exe.FullName) ($([math]::Round($exe.Length/1MB)) MB)"
Write-Host "   Checks: the installer must contain resources\voice-follow\model.int8.onnx and run on a PC"
Write-Host "   that never had the app: search works, and %APPDATA%\Voice-Sikhi-To-The-Max\voice-follow\shadow\errors.log"
Write-Host "   shows 'startup ... db query: ok'."
