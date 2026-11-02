import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { ROLE_LABEL, type Member, type Role } from '../lib/types'
import { ConfirmButton, Empty } from '../components/ui'

export default function Members() {
  const app = useApp()
  const { shop, role, session } = app
  const owner = role === 'owner'
  const [list, setList] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('cashier')

  const load = useCallback(async () => {
    if (!shop) return
    try { setList(await must(supabase.rpc('list_members', { p_shop: shop.id })) as Member[]) } catch (e) { app.fail(e) }
  }, [shop]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try { await must(supabase.rpc('add_member', { p_shop: shop!.id, p_email: email, p_role: newRole })); app.toast('Đã thêm ' + email); setEmail(''); await load() }
    catch (e) { app.fail(e) }
  }
  const setRole = async (uid: string, r: Role) => {
    try { await must(supabase.from('shop_members').update({ role: r }).eq('shop_id', shop!.id).eq('user_id', uid)); app.toast('Đã đổi quyền'); await load() }
    catch (e) { app.fail(e) }
  }
  const remove = async (uid: string) => {
    try {
      await must(supabase.from('shop_members').delete().eq('shop_id', shop!.id).eq('user_id', uid))
      if (uid === session?.user.id) { await app.reloadShops(); return }
      app.toast('Đã xóa khỏi quán'); await load()
    } catch (e) { app.fail(e) }
  }

  return (
    <>
      <h1>Nhân viên</h1>
      <div className="card"><div className="tw">
        {!list.length ? <Empty>Đang tải…</Empty> : (
          <table><tbody>{list.map(m => (
            <tr key={m.user_id}>
              <td><b>{m.display_name || m.email}</b><div className="sub">{m.email}</div></td>
              <td>{owner && m.user_id !== session?.user.id ? (
                <select aria-label="Quyền" value={m.role} onChange={e => void setRole(m.user_id, e.target.value as Role)}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>) : ROLE_LABEL[m.role]}</td>
              <td style={{ width: 1 }}>{(owner && m.user_id !== session?.user.id) && <ConfirmButton onConfirm={() => remove(m.user_id)} confirmText="Chắc chắn?">Xóa</ConfirmButton>}
                {(!owner && m.user_id === session?.user.id) && <ConfirmButton onConfirm={() => remove(m.user_id)} confirmText="Chắc chắn?">Rời quán</ConfirmButton>}</td>
            </tr>))}</tbody></table>)}
      </div></div>
      {owner && (
        <div className="card">
          <form className="entry" onSubmit={add}>
            <div className="f c6"><b>Thêm người vào quán</b><span className="sub">Người đó cần tự đăng ký tài khoản trong app trước, rồi bạn nhập email của họ ở đây.</span></div>
            <div className="f c3"><label htmlFor="m_email">Email</label><input id="m_email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="f c3"><label htmlFor="m_role">Quyền</label>
              <select id="m_role" value={newRole} onChange={e => setNewRole(e.target.value as Role)}>{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            <div className="c6"><button className="btn" type="submit">Thêm</button></div>
          </form>
        </div>
      )}
      <div className="card sub stack">
        <div><b>Chủ quán:</b> toàn quyền, thêm/xóa nhân viên, xem nhật ký.</div>
        <div><b>Quản lý:</b> sửa/xóa mọi dòng, ghi trả nợ, xem nhật ký và lời lỗ.</div>
        <div><b>Thu ngân:</b> ghi bán, nhập, thu chi; chỉ sửa/xóa dòng mình ghi trong hôm nay.</div>
      </div>
    </>
  )
}
