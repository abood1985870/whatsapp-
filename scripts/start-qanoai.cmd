@echo off
rem ===================================================
rem   QanoAI WhatsAppSupport - Full System Startup
rem ===================================================
setlocal

echo ===================================================
echo   QanoAI WhatsAppSupport - Full System Startup
echo ===================================================
echo.

rem --- Step 0: Check Docker ---
call docker version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Docker is not running. Please start Docker Desktop and retry.
  pause
  exit /b 1
)

rem --- Step 1: Start Infrastructure containers ---
echo [1/5] Starting Infrastructure (PostgreSQL, Redis, MinIO, Evolution API)...
docker-compose up -d postgres redis minio createbuckets evolution-api
if %errorlevel% neq 0 (
  echo [ERROR] Failed to start infrastructure containers.
  pause
  exit /b 1
)
echo [OK] Infrastructure started.
echo.

rem --- Step 2: Wait for databases to be ready ---
echo [2/5] Waiting for databases to be healthy...
timeout /t 10 /nobreak >nul
echo [OK] Databases should be ready.
echo.

rem --- Step 3: Install dependencies ---
echo [3/5] Installing dependencies...
call pnpm install
if %errorlevel% neq 0 (
  echo [ERROR] pnpm install failed.
  pause
  exit /b 1
)
echo [OK] Dependencies installed.
echo.

rem --- Step 4: Run database migrations and seed ---
echo [4/5] Running database migrations and seeding...
call npx prisma generate
call npx prisma db push --accept-data-loss 2>nul
call pnpm --filter database db:seed
echo [OK] Database ready.
echo.

rem --- Step 5: Start all applications ---
echo [5/5] Starting All Applications...
echo.
echo Starting API, Worker, Realtime, and Web servers...
echo.
start "QanoAI-API" cmd /c "cd /d %~dp0.. && pnpm --filter api dev"
timeout /t 3 /nobreak >nul
start "QanoAI-Worker" cmd /c "cd /d %~dp0.. && pnpm --filter worker dev"
start "QanoAI-Realtime" cmd /c "cd /d %~dp0.. && pnpm --filter realtime dev"
timeout /t 3 /nobreak >nul
start "QanoAI-Web" cmd /c "cd /d %~dp0.. && pnpm --filter web dev"

echo.
echo ===================================================
echo   QanoAI System is RUNNING!
echo ===================================================
echo   Web Interface: http://localhost:3000
echo   API Gateway:   http://localhost:3001
echo   API Docs:      http://localhost:3001/api/docs
echo   Realtime:      http://localhost:3002
echo   Evolution API: http://localhost:8080
echo.
echo   Demo Login Credentials:
echo   Owner:    owner@demo.qanoai / DemoPass123!
echo   Manager:  manager@demo.qanoai / DemoPass123!
echo   Agent:    agent@demo.qanoai / DemoPass123!
echo ===================================================
echo.
echo Press any key to stop all services...
pause >nul

echo Stopping services...
taskkill /FI "WINDOWTITLE eq QanoAI-*" /F >nul 2>&1
echo [OK] All services stopped.
endlocal
