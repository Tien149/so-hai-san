import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app'
import { addDays, dm, dow, today } from '../lib/format'
import { ROLE_LABEL } from '../lib/types'

const DATED = ['/', '/nhap', '/kho', '/so-tien']

const icons = {
  sell: <svg viewBox="0 0 24 24"><path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" /><circle cx="8" cy="11" r=".6" /></svg>,
  buy: <svg viewBox="0 0 24 24"><path d="M3 7h13l5 5v5h-3" /><path d="M3 7v10h3" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M10 17h4" /></svg>,
  stock: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 14h6" /></svg>,
  cash: <svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v6M18 9v6" /></svg>,
  report: <svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  more: <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>,
}

export default function Layout() {
  const { shop, role, memberships, setShopId, day, setDay } = useApp()
  const loc = useLocation()
  const dated = DATED.includes(loc.pathname)
  return (
    <div className="app">
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
