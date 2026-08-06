@echo off
cd /d "%~dp0.."
echo ===================================================
echo       QanoAI WhatsAppSupport - System Update
echo ===================================================
echo.
echo [1/3] Pulling latest code from Git...
git pull origin main

echo.
echo [2/3] Installing latest dependencies...
pnpm install

echo.
echo [3/3] Applying database migrations...
pnpm --filter database run prisma migrate deploy
pnpm --filter database run prisma generate

echo.
echo Update completed successfully!
echo Please restart the system using stop-qanoai.cmd and start-qanoai.cmd
pause
