@echo off
ssh -N -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run
