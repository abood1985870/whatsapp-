@echo off
cd /d "%~dp0.."
echo ===================================================
echo       QanoAI WhatsAppSupport - Status Check
echo ===================================================
echo.
echo Checking Docker Infrastructure Status...
docker compose ps

echo.
echo Checking Port Bindings...
netstat -ano | findstr "3000 3001 3002 5432 6379 9000 8080"
echo.
echo 3000 = Frontend (Next.js)
echo 3001 = Backend API (NestJS)
echo 3002 = Realtime Server (Socket.IO)
echo 5432 = Database (PostgreSQL)
echo 6379 = Cache (Redis)
echo 9000 = Storage (MinIO)
echo 8080 = WhatsApp (Evolution API)
echo.
pause
