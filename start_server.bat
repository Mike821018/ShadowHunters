@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

set "SERVER_HOST=127.0.0.1"
set "SERVER_PORT=5600"
set "BOOTSTRAP_TEST_ROOM=0"

if exist "%ROOT_DIR%server.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%server.env") do (
        if not "%%A"=="" (
            if not "%%A:~0,1%%"=="#" (
                if /I "%%A"=="HOST" set "SERVER_HOST=%%B"
                if /I "%%A"=="PORT" set "SERVER_PORT=%%B"
                if /I "%%A"=="BOOTSTRAP_TEST_ROOM" set "BOOTSTRAP_TEST_ROOM=%%B"
            )
        )
    )
)

set "BOOTSTRAP_ENABLED=0"
if /I "%BOOTSTRAP_TEST_ROOM%"=="1" set "BOOTSTRAP_ENABLED=1"
if /I "%BOOTSTRAP_TEST_ROOM%"=="true" set "BOOTSTRAP_ENABLED=1"
if /I "%BOOTSTRAP_TEST_ROOM%"=="yes" set "BOOTSTRAP_ENABLED=1"
if /I "%BOOTSTRAP_TEST_ROOM%"=="on" set "BOOTSTRAP_ENABLED=1"

if exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    set "PYTHON=%ROOT_DIR%.venv\Scripts\python.exe"
) else (
    set "PYTHON=python"
)

echo Starting ShadowHunters server...
echo Using Python: %PYTHON%
echo Host: %SERVER_HOST%
echo Port: %SERVER_PORT%
echo Bootstrap test room: %BOOTSTRAP_ENABLED%

if "%BOOTSTRAP_ENABLED%"=="1" if exist "%ROOT_DIR%scripts\bootstrap_test_room.py" (
    echo Starting test room bootstrap...
    start "ShadowHunters Bootstrap" /min "%PYTHON%" "%ROOT_DIR%scripts\bootstrap_test_room.py" --host "%SERVER_HOST%" --port "%SERVER_PORT%"
)

if not "%BOOTSTRAP_ENABLED%"=="1" (
    echo Test room bootstrap disabled.
)

"%PYTHON%" main.py serve --host "%SERVER_HOST%" --port "%SERVER_PORT%" %*

endlocal
