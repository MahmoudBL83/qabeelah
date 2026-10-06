@echo off
echo ===================================================
echo Starting Qabelah Services (API & Web)
echo ===================================================

echo [1/2] Starting Backend API on port 3001...
start "Qabelah API" cmd /c "pnpm --filter api dev"

echo [2/2] Starting Frontend Web App on port 5173...
start "Qabelah Web" cmd /c "pnpm --filter web dev"

echo.
echo Both services have been launched in separate terminal windows!
echo - API: http://localhost:3001
echo - Web: http://localhost:5173
echo.
pause
