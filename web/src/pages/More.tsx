import { Link } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase } from '../lib/supabase'

export default function More() {
  const { isManager, role, session } = useApp()
  return (
    <>
      <div className="menu">
        <Link to="/so-tien#cong-no">Công nợ <span>khách nợ, nợ mối hàng</span></Link>
        <Link to="/shipper">Shipper <span>lương shipper nhà, tiền ship theo đơn, còn nợ</span></Link>
        <Link to="/danh-muc">Danh mục <span>món hàng, khách, mối hàng, số điện thoại</span></Link>
        {isManager && <Link to="/nhat-ky">Nhật ký thay đổi <span>ai thêm, sửa, xóa gì, lúc nào</span></Link>}
        {isManager && <Link to="/excel">Nhập / xuất Excel <span>chuyển sổ cũ vào app, tải sổ về máy</span></Link>}
        <Link to="/nhan-vien">Nhân viên <span>{role === 'owner' ? 'thêm người, phân quyền' : 'xem người trong quán'}</span></Link>
        <Link to="/cai-dat">Cài đặt quán <span>tên, số điện thoại, tiền mặt ban đầu</span></Link>
      </div>
      <div className="card stack">
        <div className="sub">Đang đăng nhập: {session?.user.email}</div>
        <div><button type="button" className="btn ghost" onClick={() => void supabase.auth.signOut()}>Đăng xuất</button></div>
      </div>
      <p className="sub">Cài app lên điện thoại: mở trang này bằng Chrome (Android) và chọn "Cài đặt ứng dụng", hoặc Safari (iPhone), bấm Chia sẻ rồi "Thêm vào MH chính".</p>
    </>
  )
}
