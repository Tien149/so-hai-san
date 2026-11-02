import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'

export default function Onboarding() {
  const app = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const id = await must(supabase.rpc('create_shop', { p_name: name, p_phone: phone || null, p_address: address || null })) as string
      app.setShopId(id); await app.reloadShops(); app.toast('Đã tạo quán'); navigate('/')
    } catch (e) { app.fail(e) } finally { setBusy(false) }
  }
  return (
    <div className="center">
      <form className="auth card" onSubmit={submit}>
        <h1>Tạo quán của bạn</h1>
        <p className="sub" style={{ margin: 0 }}>Bạn sẽ là chủ quán. Nếu bạn là nhân viên, hãy gửi email <b>{app.session?.user.email}</b> cho chủ quán để được thêm vào quán.</p>
        <div className="f"><label htmlFor="o_name">Tên quán</label><input id="o_name" required value={name} placeholder="Hải sản Cô Ba" onChange={e => setName(e.target.value)} /></div>
        <div className="f"><label htmlFor="o_phone">Số điện thoại</label><input id="o_phone" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div className="f"><label htmlFor="o_addr">Địa chỉ</label><input id="o_addr" value={address} onChange={e => setAddress(e.target.value)} /></div>
        <button className="btn" type="submit" disabled={busy}>Tạo quán</button>
        <div className="row-actions"><button type="button" className="chip" onClick={() => void app.reloadShops()}>Tôi vừa được thêm vào quán, tải lại</button>
          <button type="button" className="chip" onClick={() => void supabase.auth.signOut()}>Đăng xuất</button></div>
      </form>
    </div>
  )
}
