@echo off
setlocal

set "PORT=5600"

:: -------------------------------------------------------------------
:: 讀取 server.env 取得 PORT（若有設定）
:: -------------------------------------------------------------------
set "ROOT_DIR=%~dp0"
if exist "%ROOT_DIR%server.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%server.env") do (
        if /I "%%A"=="PORT" set "PORT=%%B"
    )
)

:: -------------------------------------------------------------------
:: 找 ngrok 執行檔（優先 PATH，其次 WinGet 安裝位置）
:: -------------------------------------------------------------------
set "NGROK="

for /f "usebackq delims=" %%I in (`where ngrok 2^>nul`) do (
    if not defined NGROK set "NGROK=%%I"
)

if not defined NGROK (
    set "WINGET_NGROK=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    if exist "%WINGET_NGROK%" set "NGROK=%WINGET_NGROK%"
)

if not defined NGROK (
    for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_*") do (
        if exist "%%~fD\ngrok.exe" if not defined NGROK set "NGROK=%%~fD\ngrok.exe"
    )
)

if not defined NGROK (
    echo [ERROR] ngrok not found.
    echo Please install with: winget install ngrok.ngrok
    pause
    exit /b 1
)

:: -------------------------------------------------------------------
:: 防呆：若已有本機 ngrok 行程，先清掉避免 endpoint 衝突
:: -------------------------------------------------------------------
tasklist /FI "IMAGENAME eq ngrok.exe" | find /I "ngrok.exe" >nul
if %ERRORLEVEL%==0 (
    echo [INFO] Existing ngrok process detected. Stopping old process...
    taskkill /IM ngrok.exe /F >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo ============================================================
echo  ShadowHunters - ngrok tunnel
echo  Port : %PORT%
echo  Mode : single tunnel (stable)
echo ============================================================
echo  Public URL will appear below. Share it with players.
echo  Press Ctrl+C to stop the tunnel.
echo ============================================================
echo.

"%NGROK%" http 127.0.0.1:%PORT%

if not %ERRORLEVEL%==0 (
    echo.
    echo [ERROR] ngrok failed to start.
    echo Common fixes:
    echo   1) If you see ERR_NGROK_334, this means same endpoint is already online.
    echo      Stop other ngrok sessions on your other devices first, then retry.
    echo      You can also close active endpoint in dashboard:
    echo      https://dashboard.ngrok.com/endpoints
    echo   2) If token/auth issue, run:
    echo      ngrok authtoken ^<YOUR_TOKEN^>
    echo   3) If version issue, run:
    echo      ngrok update
    pause
    exit /b 1
)

endlocal
