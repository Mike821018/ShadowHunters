@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ============================================================
echo  ShadowHunters - Run All
echo  1) restart server + ngrok
echo  2) open ngrok URL in browser
echo ============================================================
echo.

call "%ROOT_DIR%restart_server_ngrok.bat"
if errorlevel 1 (
  echo [ERROR] restart_server_ngrok.bat failed.
  pause
  exit /b 1
)

echo.
echo Waiting for ngrok web API (127.0.0.1:4040)...
set "NGROK_URL="
set "URL_FILE=%TEMP%\shadowhunters_ngrok_url.txt"
del "%URL_FILE%" >nul 2>&1

for /l %%I in (1,1,30) do (
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -UseBasicParsing -TimeoutSec 2; if($t -and $t.tunnels -and $t.tunnels.Count -gt 0){ $t.tunnels[0].public_url }"`) do (
    if not defined NGROK_URL set "NGROK_URL=%%U"
  )
  if defined NGROK_URL goto :url_ready
  timeout /t 1 /nobreak >nul
)

:url_ready

if "%NGROK_URL%"=="" (
  echo [WARN] ngrok URL is empty.
  echo Please check the "ShadowHunters ngrok" window.
  pause
  exit /b 0
)

echo [OK] ngrok URL: %NGROK_URL%
echo Opening browser...
start "" "%NGROK_URL%/lobby.html"

echo.
echo Done.
endlocal
