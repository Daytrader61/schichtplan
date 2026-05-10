@echo off
title Schichtplan Tunnel
cd /d "C:\Users\Hacer\.openclaw\workspace\schichtplan"
echo %date% %time% Tunnel started > tunnel-status.txt
:loop
ssh -N -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run 2> tunnel-url.txt
echo %date% %time% Restarting... >> tunnel-status.txt
timeout /t 5 >nul
goto loop
