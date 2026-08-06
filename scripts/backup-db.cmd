@echo off
cd /d "%~dp0.."
echo ===================================================
echo       QanoAI WhatsAppSupport - Backup DB
echo ===================================================
echo.
set BACKUP_FILE=backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%

echo Backing up PostgreSQL database to %BACKUP_FILE%...
docker compose exec -t postgres pg_dump -U qanoai qanoai > scripts\%BACKUP_FILE%

echo.
echo Backup completed successfully: scripts\%BACKUP_FILE%
pause
