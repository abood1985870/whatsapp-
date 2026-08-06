@echo off
rem ------------------------------------------------------------
rem QanoAI WhatsAppSupport - Stop Script
rem ------------------------------------------------------------

setlocal

rem Stop Docker containers
if exist docker-compose.yml (
  echo Stopping infrastructure containers...
  docker-compose down
) else (
  echo No docker-compose.yml found. Skipping Docker shutdown.
)

rem Kill Node processes (development servers)
echo Terminating Node processes...
taskkill /F /IM node.exe >nul 2>&1

endlocal
