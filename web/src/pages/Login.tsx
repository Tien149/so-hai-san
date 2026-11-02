import { useState, type FormEvent } from 'react'
import { supabase, errText, configured, toLoginEmail } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password: pw })
        if (error) throw error
      } else if (mode === 'up') {
        if (pw.length < 6) throw new Error('Mật khẩu cần ít nhất 6 ký tự')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name.trim() } } })
        if (error) throw error
        if (!data.session) setMsg('Đã tạo tài khoản. Mở email để bấm link xác nhận, rồi quay lại đăng nhập.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
        if (error) throw error
        setMsg('Đã gửi email đặt lại mật khẩu.')
      }
    } catch (e) { setMsg(errText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="center">
      <form className="auth card" onSubmit={submit}>
        <div className="logo"><img src="/icon.svg" alt="" /><div><h1>Sổ Hải Sản</h1><div className="sub">Bán hàng, nhập hàng, kho và lời lỗ cho quán hải sản</div></div></div>
        {!configured && <p className="note">Chưa cấu hình máy chủ. Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào file .env.</p>}
        {mode === 'up' && <div className="f"><label htmlFor="l_name">Họ tên</label><input id="l_name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>}
        <div className="f"><label htmlFor="l_email">{mode === 'in' ? 'Tên đăng nhập hoặc email' : 'Email'}</label><input id="l_email" type={mode === 'in' ? 'text' : 'email'} required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} /></div>
        {mode !== 'reset' && <div className="f"><label htmlFor="l_pw">Mật khẩu</label><input id="l_pw" type="password" required value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></div>}
        {msg && <p className="note">{msg}</p>}
        <button className="btn" type="submit" disabled={busy}>{mode === 'in' ? 'Đăng nhập' : mode === 'up' ? 'Tạo tài khoản' : 'Gửi email đặt lại'}</button>
        <div className="row-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="chip" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setMsg(null) }}>{mode === 'up' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
          {mode === 'in' && <button type="button" className="chip" onClick={() => { setMode('reset'); setMsg(null) }}>Quên mật khẩu</button>}
        </div>
      </form>
    </div>
  )
}
