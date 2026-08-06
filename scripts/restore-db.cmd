@echo off
cd /d "%~dp0.."
echo ===================================================
echo       QanoAI WhatsAppSupport - Restore DB
echo ===================================================
echo.
set /p BACKUP_FILE="Enter the full name of the backup file (e.g. backup_20260805_150000.sql): "

if not exist "%BACKUP_FILE%" (
    echo Error: File "%BACKUP_FILE%" does not exist in the scripts directory.
    pause
    exit /b 1
)

echo.
echo WARNING: This will overwrite the current database.
set /p CONFIRM="Are you sure you want to restore from %BACKUP_FILE%? (Y/N): "
if /i "%CONFIRM%" neq "Y" (
    echo Restore cancelled.
    pause
    exit /b 0
)

echo.
echo Restoring PostgreSQL database from %BACKUP_FILE%...
type scripts\%BACKUP_FILE% | docker compose exec -T postgres psql -U qanoai -d qanoai

echo.
echo Restore completed successfully!
pause
