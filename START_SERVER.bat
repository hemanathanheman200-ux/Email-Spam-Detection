@echo off
REM Double-click or run from Cmd — always starts this folder's SpamGuard app.
cd /d "%~dp0"
echo Starting from: %CD%
echo URLs: http://127.0.0.1:5000/  and  http://127.0.0.1:5000/login
echo.
landingenv\Scripts\python.exe run.py
pause
