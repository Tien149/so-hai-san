@echo off
title So Hai San - chay thu tren may
cd /d "%~dp0web"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua co Node.js tren may. Dang mo trang tai, cai ban LTS xong thi bam dup lai file nay.
  start https://nodejs.org/
  pause
  exit /b
)
if not exist node_modules (
  echo Lan dau: dang cai thu vien, doi 1-3 phut...
  call npm install
  if errorlevel 1 ( echo Cai thu vien bi loi. Chup man hinh gui lai nhe. & pause & exit /b )
)
echo.
echo App chay tai http://localhost:5173  ^(sua code la trang tu cap nhat^)
echo Dien thoai cung wifi: mo dia chi "Network" ben duoi.
echo Tat app: dong cua so nay.
echo.
call npm run dev -- --open --host
pause
