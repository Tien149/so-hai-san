# Sổ Hải Sản

App quản lý cho quán hải sản: bán hàng, nhập hàng, tồn kho, hao hụt, thu chi, công nợ, lời lỗ.
Nhiều quán dùng chung một hệ thống, mỗi quán dữ liệu riêng. Cài lên điện thoại như app thường (PWA).

## Tính năng

| Màn hình | Làm gì |
|---|---|
| Bán hàng | Ghi đơn nhanh: chọn món hay bán, giá tự điền theo lần trước, gõ `270` = 270.000đ. Tiền mặt / chuyển khoản / ghi nợ. Tạo hóa đơn copy gửi Zalo. |
| Nhập hàng | Mối hàng, size, số kg, giá/kg, cước xe + bãi, nợ mối. Hiện giá vốn/kg đã cộng cước. |
| Kho | Tồn từng món tới ngày bất kỳ, giá vốn bình quân, lãi/kg, ghi hao hụt, kiểm kho. |
| Sổ tiền | Tiền vào/ra trong ngày theo tiền mặt và tài khoản, chi phí khác, tiền mặt theo sổ, công nợ khách và mối. |
| Lời lỗ | Doanh thu, giá vốn, lãi ròng theo ngày, theo món, khách mua nhiều, tiền nhập theo mối. |
| Nhật ký | Mọi lần thêm/sửa/xóa: ai, lúc nào, giá trị cũ → mới. Không ai sửa/xóa được. |
| Nhân viên | Chủ quán / Quản lý / Thu ngân. Thu ngân chỉ sửa dòng mình ghi trong ngày. |
| Excel | Nhập sổ Excel cũ (tự nhận mẫu "nguồn" và "đã bán", cảnh báo giá gõ nhầm), xuất sổ ra Excel. |

## Cấu trúc

```
supabase/migrations/   Lược đồ Postgres: bảng, phân quyền (RLS), nhật ký, hàm báo cáo
supabase/tests/        Kiểm thử phân quyền trên Postgres cục bộ (sh supabase/tests/run.sh)
web/                   App React + Vite + PWA
```

Cách tính:
- **Giá vốn** = giá nhập bình quân gia quyền của món, đã cộng cước xe + bãi.
- **Lãi ròng** = doanh thu − giá vốn hàng đã bán + tiền chế biến/ship + thu khác − hao hụt − chi phí khác.
- **Dòng tiền** tính theo ngày thực trả tiền (khách trả nợ hôm nào thì tiền vào hôm đó).

## Triển khai lần đầu (khoảng 20 phút)

### 1. Tạo máy chủ Supabase
1. Đăng ký tại https://supabase.com, bấm **New project**, chọn vùng **Southeast Asia (Singapore)**.
2. Vào **SQL Editor**, dán toàn bộ nội dung file `supabase/migrations/20261102000000_init.sql`, bấm **Run**.
3. Vào **Authentication → Providers → Email**: bật Email. Nếu muốn khách đăng ký xong dùng ngay, tắt **Confirm email**.
4. Vào **Authentication → URL Configuration**: điền **Site URL** là địa chỉ app sau khi lên Vercel (bước 2).
5. Vào **Project Settings → API**, chép **Project URL** và **anon public key**.

### 2. Đưa app lên Vercel
1. Đăng ký https://vercel.com bằng tài khoản GitHub, bấm **Add New → Project**, chọn repo này.
2. **Root Directory**: `web`. Framework: Vite.
3. **Environment Variables**: `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (lấy ở bước 1.5).
4. Bấm **Deploy**. Có link dạng `https://ten-app.vercel.app`, gắn tên miền riêng ở **Settings → Domains** nếu muốn.

### 3. Cài lên điện thoại
- Android: mở link bằng Chrome → menu ⋮ → **Cài đặt ứng dụng**.
- iPhone: mở bằng Safari → nút Chia sẻ → **Thêm vào MH chính**.

## Chạy thử trên máy (không cần deploy)

1. Cài Node.js bản LTS từ https://nodejs.org (chỉ làm một lần).
2. Giải nén thư mục này, bấm đúp `chay-thu-windows.bat` (Windows) hoặc `chay-thu-mac.command` (Mac).
3. Lần đầu đợi 1–3 phút cài thư viện, sau đó trình duyệt tự mở http://localhost:5173.

Bản chạy thử dùng chung máy chủ dữ liệu với bản thật (cấu hình trong `web/.env.development`), nên khi thử hãy tạo một quán riêng tên "Quán thử" để không lẫn số liệu. Điện thoại cùng wifi mở địa chỉ "Network" hiện trong cửa sổ đen.

## Chạy trên máy để phát triển

```sh
cd web
cp .env.example .env.local   # điền URL và key Supabase
npm install
npm run dev                  # http://localhost:5173
npm test                     # kiểm thử đọc số, ngày, file Excel
```

Kiểm thử phân quyền cơ sở dữ liệu (cần Postgres 16 cục bộ): `sh supabase/tests/run.sh`.

## Việc nên làm tiếp
- Đăng nhập bằng số điện thoại (OTP) cho người không dùng email: cần nhà cung cấp SMS trong Supabase.
- Gói thuê bao cho các quán (giới hạn theo gói, thanh toán).
- Đóng gói lên CH Play / App Store bằng Capacitor từ chính code `web/`.
- Thư viện `xlsx` bản npm 0.18.5 có cảnh báo bảo mật khi đọc file lạ; nên đổi sang bản 0.20.x từ https://cdn.sheetjs.com trước khi cho nhiều quán dùng.
