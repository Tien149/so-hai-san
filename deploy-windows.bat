@echo off
title So Hai San - dong goi va dua len mang
cd /d "%~dp0web"
where node >nul 2>nul
if errorlevel 1 ( echo Chua co Node.js. Cai tai https://nodejs.org roi chay lai. & pause & exit /b )
if not exist node_modules ( call npm install )
echo.
echo [1/2] Dang dong goi app...
call npm run build
if errorlevel 1 ( echo Dong goi bi loi. Chup man hinh gui lai nhe. & pause & exit /b )
echo /*  /index.html  200> dist\_redirects
echo.
echo [2/2] Dang dua len Netlify...
echo Lan dau trinh duyet se mo trang Netlify: dang nhap roi bam "Authorize". Cac lan sau tu chay.
call npx -y netlify-cli deploy --prod --no-build --dir dist --site 3218624e-fcc9-4f52-aeba-6ef8f417bf7e
if errorlevel 1 (
  echo.
  echo Can dang nhap Netlify. Trinh duyet se mo, dang nhap dung tai khoan Netlify cua quan roi bam "Authorize".
  call npx -y netlify-cli login
  call npx -y netlify-cli deploy --prod --no-build --dir dist --site 3218624e-fcc9-4f52-aeba-6ef8f417bf7e
)
if errorlevel 1 (
  echo.
  echo Tu dong dua len khong duoc. Cach tay: keo thu muc "dist" vua mo vao trang Netlify vua mo.
  start "" "%~dp0web\dist"
  start https://app.netlify.com/projects/so-hai-san/deploys
  pause
  exit /b
)
echo.
echo Xong! App moi da len https://so-hai-san.netlify.app
pause
