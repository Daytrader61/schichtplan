@echo off
cd /d "C:\Users\Hacer\.openclaw\workspace\schichtplan"

:: Starte Server
start /B "" node server.js

:: Warte kurz
timeout /t 3 /nobreak >nul

:: Starte SSH Tunnel
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -o ExitOnForwardFailure=yes -R 80:localhost:3000 nokey@localhost.run > tunnel-log.txt 2>&1
