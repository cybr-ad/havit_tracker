@echo off
title HAVIT Pro - Executive Tracker
cd /d "%~dp0"

echo ===================================================
echo   Starting HAVIT Pro Server with Real Email OTP...
echo ===================================================

start "" /B python server.py 8080

timeout /t 1 /nobreak >nul
start "" http://localhost:8080
