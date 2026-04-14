@echo off
title Vetraj Server — PM2
cd /d D:\verraj-prod\VETRAJ-DOCTOR
echo.
echo  ============================================
echo   VETRAJ PET HOSPITAL — SERVER MANAGER
echo  ============================================
echo.

:: Check if PM2 is running
pm2 describe vetraj >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] Server pehle se chal raha hai!
    pm2 list
) else (
    echo  [START] Server start ho raha hai...
    pm2 start server.js --name vetraj
    pm2 save
)

echo.
echo  Links:
echo   Form      : http://localhost:3000/
echo   Dashboard : http://localhost:3000/dashboard.html
echo   Telecaller: http://localhost:3000/caller.html
echo.
echo  Server band karne ke liye: pm2 stop vetraj
echo  Logs dekhne ke liye      : pm2 logs vetraj
echo.
pause
