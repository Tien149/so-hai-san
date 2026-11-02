#!/bin/bash
# Sổ Hải Sản - chạy thử trên máy (macOS / Linux): bấm đúp file này
cd "$(dirname "$0")/web" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Chưa có Node.js. Cài bản LTS ở https://nodejs.org rồi chạy lại file này."
  (open https://nodejs.org/ 2>/dev/null || xdg-open https://nodejs.org/ 2>/dev/null) &
  read -r -p "Bấm Enter để đóng"; exit 1
fi
if [ ! -d node_modules ]; then
  echo "Lần đầu: đang cài thư viện, đợi 1-3 phút..."
  npm install || { read -r -p "Cài thư viện bị lỗi. Bấm Enter để đóng"; exit 1; }
fi
echo
echo "App chạy tại http://localhost:5173 (sửa code là trang tự cập nhật)"
echo "Điện thoại cùng wifi: mở địa chỉ Network bên dưới. Tắt app: Ctrl+C"
echo
npm run dev -- --open --host
