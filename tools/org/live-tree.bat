@echo off
REM Live agent tree. Rebuilds from disk on every request, and the page
REM refreshes itself every 15s keeping your open branches and scroll position.
REM
REM Leave this window OPEN — closing it stops the server.
REM   live-tree.bat            port 8799
REM   live-tree.bat 8801       another port
REM
REM For a one-off static snapshot instead, use open-tree.bat.

setlocal
cd /d "%~dp0..\.."

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo.
  pause
  exit /b 1
)

set PORT=%1
if "%PORT%"=="" set PORT=8799

echo Starting the live tree on http://127.0.0.1:%PORT%
start "" "http://127.0.0.1:%PORT%/"
node tools\org\tree.js --serve %PORT%

echo.
echo   The tree server has stopped.
pause
