@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ============================================================
echo  ShadowHunters - Restart Server + ngrok
echo ============================================================

echo [1/4] Stop existing ngrok process...
taskkill /IM ngrok.exe /F >nul 2>&1

echo [2/4] Stop existing ShadowHunters server process...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*main.py serve*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo [3/4] Start server...
start "ShadowHunters Server" /D "%ROOT_DIR%" cmd /c start_server.bat

echo Waiting for server health check...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..30 | ForEach-Object { try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:5600/index.html' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Seconds 1 }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
    echo [WARN] Server health check timed out. ngrok may return 502 until server is ready.
) else (
    echo [OK] Server is ready.
)

echo [4/4] Start ngrok...
start "ShadowHunters ngrok" /D "%ROOT_DIR%" cmd /c start_ngrok.bat

echo ============================================================
echo  Started. You should now have 2 windows:
echo  - ShadowHunters Server
echo  - ShadowHunters ngrok
echo ============================================================

endlocal
