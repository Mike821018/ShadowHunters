@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "CF_TUNNEL_TOKEN=%CF_TUNNEL_TOKEN%"

if exist "%ROOT_DIR%server.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%server.env") do (
        if /I "%%A"=="CF_TUNNEL_TOKEN" set "CF_TUNNEL_TOKEN=%%B"
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

if not defined CF_TUNNEL_TOKEN (
    echo [ERROR] CF_TUNNEL_TOKEN is empty.
    echo.
    echo Fixed domain (Named Tunnel) requires a token from Cloudflare dashboard:
    echo   Zero Trust ^> Networks ^> Tunnels ^> your tunnel ^> Run tunnel
    echo.
    echo Add token by one of these ways:
    echo   1) set CF_TUNNEL_TOKEN=your_token_here
    echo   2) add CF_TUNNEL_TOKEN=your_token_here in server.env
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo  ShadowHunters - Cloudflare Named Tunnel
echo  Mode : fixed domain / stable URL
echo ============================================================
echo  Keep this window open while hosting.
echo  Press Ctrl+C to stop the tunnel.
echo ============================================================
echo.

"%CLOUDFLARED%" tunnel run --token "%CF_TUNNEL_TOKEN%" --no-autoupdate

if not %ERRORLEVEL%==0 (
    echo.
    echo [ERROR] cloudflared named tunnel failed to start.
    echo Verify tunnel token and route settings in Cloudflare dashboard.
    pause
    exit /b 1
)

endlocal
