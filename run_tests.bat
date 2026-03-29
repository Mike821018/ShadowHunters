@echo off
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

set "SERVER_HOST=127.0.0.1"
set "SERVER_PORT=5600"
set "SERVER_DB_PATH=%ROOT_DIR%backend\data\shadowhunters.db"
set "TEST_GAMES=4"
set "TEST_EIGHT_PLAYER_GAMES=4"
set "TEST_BATCH_SIZE=2"

if exist "%ROOT_DIR%server.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT_DIR%server.env") do (
        if not "%%A"=="" (
            if not "%%A:~0,1%%"=="#" (
                if /I "%%A"=="HOST" set "SERVER_HOST=%%B"
                if /I "%%A"=="PORT" set "SERVER_PORT=%%B"
                if /I "%%A"=="DB_PATH" set "SERVER_DB_PATH=%%B"
            )
        )
    )
)

set "SHADOWHUNTERS_DB_PATH=%SERVER_DB_PATH%"

if exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    set "PYTHON=%ROOT_DIR%.venv\Scripts\python.exe"
) else (
    set "PYTHON=python"
)

echo Running ShadowHunters test suite...
echo Using Python: %PYTHON%
echo Host: %SERVER_HOST%
echo Port: %SERVER_PORT%
echo DB Path: %SHADOWHUNTERS_DB_PATH%
echo Games: %TEST_GAMES%
echo Eight-player games: %TEST_EIGHT_PLAYER_GAMES%
echo Batch size: %TEST_BATCH_SIZE%

"%PYTHON%" main.py test --host "%SERVER_HOST%" --port "%SERVER_PORT%" --games %TEST_GAMES% --eight-player-games %TEST_EIGHT_PLAYER_GAMES% --batch-size %TEST_BATCH_SIZE% %*

endlocal