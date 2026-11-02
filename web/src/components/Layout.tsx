import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app'
import { addDays, dm, dow, today } from '../lib/format'
import { ROLE_LABEL } from '../lib/types'
import { supabase } from '../lib/supabase'

const DATED = ['/', '/nhap', '/kho', '/so-tien']

const icons = {
  sell: <svg viewBox="0 0 24 24"><path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" /><circle cx="8" cy="11" r=".6" /></svg>,
  buy: <svg viewBox="0 0 24 24"><path d="M3 7h13l5 5v5h-3" /><path d="M3 7v10h3" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M10 17h4" /></svg>,
  stock: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 14h6" /></svg>,
  cash: <svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v6M18 9v6" /></svg>,
  report: <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  ship: <svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17h7M15 6h3l2.5 8.5M4 13h7l2 4" /><path d="M6 13V9h5" /></svg>,
  debt: <svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h4" /></svg>,
  catalog: <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  people: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" /></svg>,
  log: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  excel: <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8l6 8M15 8l-6 8" /></svg>,
  gear: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>,
  logout: <svg viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>,
  more: <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>,
}

export default function Layout() {
  const { shop, role, memberships, setShopId, day, setDay, isManager, session } = useApp()
  const loc = useLocation()
  const dated = DATED.includes(loc.pathname)
  return (
    <div className="app">
      <aside className="side" aria-label="Menu">
        <div className="side-brand"><img src="/icon.svg" alt="" width="30" height="30" /><div><b>Sổ Hải Sản</b><span>{shop?.name}</span></div></div>
        <nav className="side-nav">
          <NavLink to="/" end>{icons.sell}Bán hàng</NavLink>
          <NavLink to="/nhap">{icons.buy}Nhập hàng</NavLink>
          <NavLink to="/kho">{icons.stock}Kho</NavLink>
          <NavLink to="/so-tien">{icons.cash}Sổ tiền</NavLink>
          <NavLink to="/bao-cao">{icons.report}Lời lỗ</NavLink>
          <div className="side-h">Quản lý</div>
          <NavLink to="/shipper">{icons.ship}Shipper</NavLink>
          <Link to="/so-tien#cong-no">{icons.debt}Công nợ</Link>
          <NavLink to="/danh-muc">{icons.catalog}Danh mục</NavLink>
          <NavLink to="/nhan-vien">{icons.people}Nhân viên</NavLink>
          {isManager && <NavLink to="/nhat-ky">{icons.log}Nhật ký thay đổi</NavLink>}
          {isManager && <NavLink to="/excel">{icons.excel}Nhập / xuất Excel</NavLink>}
          <NavLink to="/cai-dat">{icons.gear}Cài đặt quán</NavLink>
        </nav>
        <div className="side-foot">
          <span title={session?.user.email}>{session?.user.email}</span>
          <button type="button" onClick={() => void supabase.auth.signOut()}>{icons.logout}Đăng xuất</button>
        </div>
      </aside>
      <header className="top">
        <div className="top-row">
          <div className="brand">
            {memberships.length > 1 ? (
              <select aria-label="Chọn quán" value={shop?.id} onChange={e => setShopId(e.target.value)}>
                {memberships.map(m => <option key={m.shop_id} value={m.shop_id}>{m.shops.name}</option>)}
              </select>
            ) : shop?.name}
          </div>
          {role && <span className="role">{ROLE_LABEL[role]}</span>}
        </div>
        {dated && (
          <div className="top-row" style={{ marginTop: 8 }}>
            <div className="datebox">
              <button type="button" aria-label="Ngày trước" onClick={() => setDay(addDays(day, -1))}>‹</button>
              <input type="date" aria-label="Chọn ngày" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
              <button type="button" aria-label="Ngày sau" onClick={() => setDay(addDays(day, 1))}>›</button>
            </div>
            {day !== today() && <button type="button" className="chip" onClick={() => setDay(today())}>Hôm nay</button>}
            <span style={{ fontSize: 13, opacity: .85, marginLeft: 'auto' }}>{dow(day)} {day === today() ? '· hôm nay' : dm(day)}</span>
          </div>
        )}
      </header>
      <main><Outlet /></main>
      <nav className="tabs"><div className="in">
        <NavLink to="/" end>{icons.sell}Bán hàng</NavLink>
        <NavLink to="/nhap">{icons.buy}Nhập hàng</NavLink>
        <NavLink to="/kho">{icons.stock}Kho</NavLink>
        <NavLink to="/so-tien">{icons.cash}Sổ tiền</NavLink>
        <NavLink to="/bao-cao">{icons.report}Lời lỗ</NavLink>
        <NavLink to="/them">{icons.more}Thêm</NavLink>
      </div></nav>
    </div>
  )
}
