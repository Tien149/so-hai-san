import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { money, parseMoney, plain } from '../lib/format'

export default function Settings() {
  const app = useApp()
  const { shop, role } = app
  const owner = role === 'owner'
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [cash, setCash] = useState('')
  useEffect(() => {
    if (!shop) return
    setName(shop.name); setPhone(shop.phone || ''); setAddress(shop.address || ''); setCash(shop.opening_cash ? plain(shop.opening_cash) : '')
  }, [shop])
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const c = cash.trim() ? parseMoney(cash) : 0
    try {
      await must(supabase.from('shops').update({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, opening_cash: Number.isFinite(c) ? c : 0 }).eq('id', shop!.id))
      app.toast('Đã lưu'); await app.reloadShops()
    } catch (e) { app.fail(e) }
  }
  return (
    <>
      <h1>Cài đặt quán</h1>
      <div className="card">
        <form className="entry" onSubmit={save}>
          <div className="f c6"><label htmlFor="st_name">Tên quán</label><input id="st_name" required value={name} disabled={!owner} onChange={e => setName(e.target.value)} /></div>
          <div className="f c3"><label htmlFor="st_phone">Số điện thoại (in trên hóa đơn)</label><input id="st_phone" inputMode="tel" value={phone} disabled={!owner} onChange={e => setPhone(e.target.value)} /></div>
          <div className="f c3"><label htmlFor="st_addr">Địa chỉ</label><input id="st_addr" value={address} disabled={!owner} onChange={e => setAddress(e.target.value)} /></div>
          <div className="f c6"><label htmlFor="st_cash">Tiền mặt ban đầu trong két</label><input id="st_cash" inputMode="numeric" value={cash} disabled={!owner} placeholder="20.000.000" onChange={e => setCash(e.target.value)} />
            <span className="hint">Số tiền mặt có trước ngày ghi sổ đầu tiên, để tính đúng tiền mặt còn lại. {parseMoney(cash) > 0 && '= ' + money(parseMoney(cash))}</span></div>
          {owner ? <div className="c6"><button className="btn" type="submit">Lưu</button></div> : <p className="note c6">Chỉ chủ quán được sửa.</p>}
        </form>
      </div>
      {app.memberships.length > 0 && owner && <p className="sub">Muốn mở thêm quán (chi nhánh)? Đăng xuất là chưa cần: vào <a href="/quan-moi">tạo quán mới</a>, sau đó đổi quán ở tên quán phía trên cùng.</p>}
    </>
  )
}
