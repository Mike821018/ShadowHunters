@echo off
setlocal

set "PORT=5600"
set "ROOT_DIR=%~dp0"

if exist "%ROOT_DIR%server.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%server.env") do (
        if /I "%%A"=="PORT" set "PORT=%%B"
    )
)

set "CLOUDFLARED="

for /f "usebackq delims=" %%I in (`where cloudflared 2^>nul`) do (
    if not defined CLOUDFLARED set "CLOUDFLARED=%%I"
)

if not defined CLOUDFLARED (
    if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
)

if not defined CLOUDFLARED (
    if exist "C:\Program Files\cloudflared\cloudflared.exe" set "CLOUDFLARED=C:\Program Files\cloudflared\cloudflared.exe"
)

if not defined CLOUDFLARED (
    echo [ERROR] cloudflared not found.
    echo Install with: winget install -e --id Cloudflare.cloudflared
    pause
    exit /b 1
)

echo ============================================================
echo  ShadowHunters - Cloudflare Quick Tunnel
echo  Port : %PORT%
echo ============================================================
echo  Public URL will appear below (trycloudflare.com)
echo  Keep this window open while hosting.
echo  For fixed domain / stable URL, use start_cloudflare_named.bat
echo  Press Ctrl+C to stop the tunnel.
echo ============================================================
echo.

"%CLOUDFLARED%" tunnel --url "http://127.0.0.1:%PORT%" --no-autoupdate

if not %ERRORLEVEL%==0 (
    echo.
    echo [ERROR] cloudflared failed to start.
    echo If quick tunnel fails and you have config.yaml in .cloudflared, temporarily rename it.
    pause
    exit /b 1
)

endlocal
