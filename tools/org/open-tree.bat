@echo off
REM Double-click this to rebuild the agent tree and open it.
REM Survives restarts: it always picks the newest session unless you name one.
REM
REM   open-tree.bat                 newest session
REM   open-tree.bat --list          show available sessions
REM   open-tree.bat --session 2368  a specific one
REM   open-tree.bat --all           include the old research agents

setlocal
cd /d "%~dp0..\.."

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found on your PATH.
  echo   The tree is built by a small node script, so node has to be callable.
  echo.
  pause
  exit /b 1
)

node tools\org\tree.js %*
if errorlevel 1 (
  echo.
  echo   Could not build the tree. The message above says why.
  echo.
  pause
  exit /b 1
)

REM --list prints to the console and writes nothing; don't try to open a file.
echo %* | find /i "--list" >nul
if not errorlevel 1 (
  echo.
  pause
  exit /b 0
)

start "" "%CD%\tools\org\tree.html"
exit /b 0
