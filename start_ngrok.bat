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
where ngrok >nul 2>&1
if %ERRORLEVEL%==0 (
    set "NGROK=ngrok"
) else (
    set "WINGET_NGROK=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    if exist "%WINGET_NGROK%" (
        set "NGROK=%WINGET_NGROK%"
    )
)

if "%NGROK%"=="" (
    echo [ERROR] ngrok not found.
    echo Please install with: winget install ngrok.ngrok
    pause
    exit /b 1
)

echo ============================================================
echo  ShadowHunters - ngrok tunnel
echo  Port : %PORT%
echo ============================================================
echo  Public URL will appear below. Share it with players.
echo  Press Ctrl+C to stop the tunnel.
echo ============================================================
echo.

"%NGROK%" http %PORT%

endlocal
