@echo off
cd /d "%~dp0..\.."
echo resolved to: %CD%
if exist tools\org	ree.js (echo tree.js found) else (echo MISSING)
