import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dateTime, dm, money } from '../lib/format'
import { ROLE_LABEL, type AuditRow, type Member, type Role } from '../lib/types'
import { Empty } from '../components/ui'

const TABLES: Record<string, string> = {
  sales: 'Bán hàng', purchases: 'Nhập hàng', cash_entries: 'Thu chi', stock_adjustments: 'Hao hụt/kiểm kho',
  products: 'Món hàng', partners: 'Khách/mối', shop_members: 'Nhân viên', shops: 'Thông tin quán',
}
const ACTIONS: Record<string, [string, string]> = { insert: ['Thêm', 'p-cash'], update: ['Sửa', 'p-warn'], delete: ['Xóa', 'p-debt'] }
const FIELDS: Record<string, string> = {
  date: 'Ngày', product_id: 'Món', customer_id: 'Khách', supplier_id: 'Mối', qty: 'Số lượng', unit_price: 'Đơn giá',
  processing_fee: 'Chế biến', shipping_fee: 'Ship', freight: 'Cước', pay_method: 'Hình thức', paid: 'Đã trả', paid_at: 'Ngày trả',
  amount: 'Số tiền', category: 'Khoản', direction: 'Loại', note: 'Ghi chú', size: 'Size', name: 'Tên', phone: 'SĐT', role: 'Quyền',
  opening_cash: 'Tiền ban đầu', address: 'Địa chỉ', default_sell_price: 'Giá bán mặc định', reason: 'Lý do',
}
const SKIP = new Set(['id', 'shop_id', 'created_at', 'updated_at', 'created_by', 'user_id'])
const MONEY = new Set(['unit_price', 'processing_fee', 'shipping_fee', 'freight', 'amount', 'opening_cash', 'default_sell_price'])
const PAGE = 50

export default function AuditLog() {
  const app = useApp()
  const { shop, productName, partnerName } = app
  const [rows, setRows] = useState<AuditRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [more, setMore] = useState(false)

  const load = useCallback(async (append = false) => {
    if (!shop) return
    try {
      let q = supabase.from('audit_log').select('*').eq('shop_id', shop.id).order('id', { ascending: false }).limit(PAGE)
      if (table) q = q.eq('table_name', table)
      if (action) q = q.eq('action', action)
      if (actor) q = q.eq('actor', actor)
      if (append && rows.length) q = q.lt('id', rows[rows.length - 1].id)
      const data = await must(q) as AuditRow[]
      setRows(append ? [...rows, ...data] : data); setMore(data.length === PAGE)
    } catch (e) { app.fail(e) }
  }, [shop, table, action, actor, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(false) }, [shop, table, action, actor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (shop) supabase.rpc('list_members', { p_shop: shop.id }).then(({ data }) => setMembers((data || []) as Member[])) }, [shop])

  const who = useMemo(() => new Map(members.map(m => [m.user_id, m.display_name || m.email])), [members])
  const show = (k: string, v: unknown) => {
    if (v == null || v === '') return '∅'
    if (k === 'product_id') return cap(productName(String(v))) || 'món đã xóa'
    if (k === 'customer_id' || k === 'supplier_id') return cap(partnerName(String(v))) || '(đã xóa)'
    if (MONEY.has(k)) return money(Number(v))
    if (k === 'paid') return v ? 'có' : 'chưa (nợ)'
    if (k === 'pay_method') return v === 'bank' ? 'chuyển khoản' : 'tiền mặt'
    if (k === 'direction') return v === 'in' ? 'thu' : 'chi'
    if (k === 'date' || k === 'paid_at') return dm(String(v))
    if (k === 'role') return ROLE_LABEL[v as Role] || String(v)
    return String(v)
  }
  const summary = (r: AuditRow) => {
    const d = r.new_data || r.old_data || {}
    if (r.table_name === 'sales' || r.table_name === 'purchases' || r.table_name === 'stock_adjustments')
      return `${cap(productName(String(d.product_id))) || 'món đã xóa'} ${d.qty}kg${d.unit_price ? ' × ' + money(Number(d.unit_price)) : ''} · ngày ${dm(String(d.date))}`
    if (r.table_name === 'cash_entries') return `${d.direction === 'in' ? 'Thu' : 'Chi'} ${cap(String(d.category))} ${money(Number(d.amount))}`
    if (r.table_name === 'shop_members') return `${who.get(String(d.user_id)) || 'người dùng'} · ${ROLE_LABEL[d.role as Role] || String(d.role)}`
    return cap(String(d.name ?? ''))
  }
  const changes = (r: AuditRow) => {
    if (r.action !== 'update' || !r.old_data || !r.new_data) return []
    return Object.keys(r.new_data).filter(k => !SKIP.has(k) && JSON.stringify(r.new_data![k]) !== JSON.stringify(r.old_data![k]))
  }

  return (
    <>
      <h1>Nhật ký thay đổi</h1>
      <p className="sub" style={{ margin: 0 }}>Mọi lần thêm, sửa, xóa đều được ghi lại tự động. Không ai sửa hay xóa được nhật ký này.</p>
      <div className="row-actions">
        <select aria-label="Loại dữ liệu" value={table} onChange={e => setTable(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Tất cả loại</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Thao tác" value={action} onChange={e => setAction(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Mọi thao tác</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select aria-label="Người làm" value={actor} onChange={e => setActor(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Mọi người</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}</option>)}</select>
      </div>
      <div className="card"><div className="tw">
        {!rows.length ? <Empty>Chưa có thay đổi nào.</Empty> : (
          <table><tbody>{rows.map(r => {
            const ch = changes(r)
            return (
              <tr key={r.id}>
                <td className="sub" style={{ whiteSpace: 'nowrap' }}>{dateTime(r.at)}</td>
                <td><span className={'pill ' + ACTIONS[r.action][1]}>{ACTIONS[r.action][0]}</span> <b>{TABLES[r.table_name] || r.table_name}</b>
                  <div>{summary(r)}</div>
                  {ch.length > 0 && <div className="diff">{ch.map(k => (
                    <div key={k}>{FIELDS[k] || k}: <del>{show(k, r.old_data![k])}</del> → <ins>{show(k, r.new_data![k])}</ins></div>))}</div>}
                </td>
                <td className="sub">{r.actor ? who.get(r.actor) || 'người đã rời quán' : 'hệ thống'}</td>
              </tr>)
          })}</tbody></table>)}
      </div>
        {more && <div style={{ marginTop: 10 }}><button type="button" className="btn ghost sm" onClick={() => void load(true)}>Xem thêm</button></div>}
      </div>
    </>
  )
}
