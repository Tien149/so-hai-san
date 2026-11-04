import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dm, money, parseMoney, today, toThousand } from '../lib/format'
import { SHIPPER_KIND, type CashEntry, type Delivery, type PayMethod, type Shipper, type ShipperKind, type ShipperMonth } from '../lib/types'
import { ConfirmButton, Empty, MoneyInput, Seg, Tile, useLive } from '../components/ui'
import { Combo } from '../components/Combo'

const pad = (n: number) => String(n).padStart(2, '0')
const shiftMonth = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + k, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Tháng ${Number(m)}/${y}` }

const blankShipper = { name: '', phone: '', kind: 'outside' as ShipperKind, salary: '', fee: '' }

export default function Shippers() {
  const app = useApp()
  const { shop, day, isManager, shippers, partners, partnerName, shipperName, session } = app
  const [month, setMonth] = useState(day.slice(0, 7))
  const m0 = month + '-01', m1 = shiftMonth(month, 1) + '-01'
  const [rows, setRows] = useState<ShipperMonth[]>([])
  const [dels, setDels] = useState<Delivery[]>([])
  const [pays, setPays] = useState<CashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [payFor, setPayFor] = useState<string | null>(null)
  const [payAmt, setPayAmt] = useState('')
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [payNote, setPayNote] = useState('')
  const [sf, setSf] = useState(blankShipper)
  const [editShipper, setEditShipper] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [dv, setDv] = useState({ shipper: '', customer: '', fee: '' })

  const load = useCallback(async () => {
    if (!shop) return
    try {
      const [r, d, p] = await Promise.all([
        must(supabase.rpc('shipper_month', { p_shop: shop.id, p_month: m0 })),
        must(supabase.from('deliveries').select('*').eq('shop_id', shop.id).gte('date', m0).lt('date', m1).order('date', { ascending: false }).order('created_at', { ascending: false })),
        must(supabase.from('cash_entries').select('*').eq('shop_id', shop.id).not('shipper_id', 'is', null).eq('period', m0).order('date', { ascending: false })),
      ])
      setRows(r as ShipperMonth[]); setDels(d as Delivery[]); setPays(p as CashEntry[])
    } catch (e) { app.fail(e) } finally { setLoading(false) }
  }, [shop, m0, m1]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); void load() }, [load])
  useLive(shop?.id, ['deliveries', 'cash_entries', 'shippers', 'sales'], load)

  const sum = useMemo(() => rows.reduce((a, r) => ({
    due: a.due + Number(r.due) + Number(r.prev_debt), paid: a.paid + Number(r.paid),
    left: a.left + Math.max(Number(r.balance), 0), orders: a.orders + Number(r.orders),
  }), { due: 0, paid: 0, left: 0, orders: 0 }), [rows])

  // ---- trả tiền shipper
  const openPay = (r: ShipperMonth) => {
    setPayFor(r.shipper_id); setPayAmt(toThousand(Math.max(Number(r.balance), 0))); setPayMethod('cash'); setPayNote('')
  }
  const pay = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop || !payFor) return
    const a = parseMoney(payAmt)
    if (!(a > 0)) { app.toast('Nhập số tiền trả'); return }
    const sh = rows.find(r => r.shipper_id === payFor)
    try {
      await must(supabase.from('cash_entries').insert({
        shop_id: shop.id, date: today(), direction: 'out', category: sh?.kind === 'staff' ? 'lương shipper' : 'trả tiền ship',
        amount: a, pay_method: payMethod, shipper_id: payFor, period: m0,
        note: payNote.trim() || `${monthLabel(month).toLowerCase()} · ${cap(sh?.name || '')}`,
      }))
      app.toast(`Đã ghi trả ${cap(sh?.name || '')} ${money(a)}`); setPayFor(null); await load()
    } catch (e) { app.fail(e) }
  }
  const removePay = async (id: string) => {
    try {
      const { data, error } = await supabase.from('cash_entries').delete().eq('id', id).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa'); await load()
    } catch (e) { app.fail(e) }
  }

  // ---- thêm / sửa shipper
  const startEdit = (s: Shipper) => {
    setEditShipper(s.id); setShowForm(true)
    setSf({ name: s.name, phone: s.phone || '', kind: s.kind, salary: toThousand(s.monthly_salary), fee: toThousand(s.per_order_fee) })
  }
  const saveShipper = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop) return
    const name = sf.name.trim().replace(/\s+/g, ' ')
    if (!name) { app.toast('Nhập tên shipper'); return }
    const rec = {
      name, phone: sf.phone.trim() || null, kind: sf.kind,
      monthly_salary: sf.kind === 'staff' ? parseMoney(sf.salary) || 0 : 0, per_order_fee: parseMoney(sf.fee) || 0,
    }
    try {
      if (editShipper) await must(supabase.from('shippers').update(rec).eq('id', editShipper).select())
      else await must(supabase.from('shippers').insert({ ...rec, shop_id: shop.id }).select())
      app.toast(editShipper ? 'Đã cập nhật shipper' : `Đã thêm ${cap(name)}`)
      setSf(blankShipper); setEditShipper(null); setShowForm(false)
      await app.reloadCatalog(); await load()
    } catch (e) { app.fail(e) }
  }
  const toggleActive = async (s: Shipper) => {
    try {
      await must(supabase.from('shippers').update({ active: !s.active }).eq('id', s.id).select())
      app.toast(s.active ? `Đã ngưng ${cap(s.name)}` : `${cap(s.name)} làm lại`)
      await app.reloadCatalog(); await load()
    } catch (e) { app.fail(e) }
  }

  // ---- chuyến giao không qua bán hàng
  const activeShippers = shippers.filter(s => s.active)
  const addDelivery = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop) return
    const sh = shippers.find(s => s.id === dv.shipper)
    if (!sh) { app.toast('Chọn shipper'); return }
    try {
      const customer_id = await app.ensurePartner('customer', dv.customer)
      const fee = dv.fee.trim() ? parseMoney(dv.fee) || 0 : sh.per_order_fee
      await must(supabase.from('deliveries').insert({ shop_id: shop.id, date: day, shipper_id: sh.id, customer_id, fee }))
      app.toast(`Đã ghi chuyến giao ngày ${dm(day)}`); setDv({ shipper: dv.shipper, customer: '', fee: '' }); await load()
    } catch (e) { app.fail(e) }
  }
  const setFee = async (d: Delivery, raw: string) => {
    const fee = raw.trim() ? parseMoney(raw) : 0
    if (!Number.isFinite(fee) || fee === Number(d.fee)) return
    try {
      const { data, error } = await supabase.from('deliveries').update({ fee }).eq('id', d.id).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền sửa dòng này')
      app.toast('Đã sửa phí chuyến giao'); await load()
    } catch (e) { app.fail(e) }
  }
  const removeDelivery = async (id: string) => {
    try {
      const { data, error } = await supabase.from('deliveries').delete().eq('id', id).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa chuyến giao'); await load()
    } catch (e) { app.fail(e) }
  }
  const canEdit = (d: Delivery) => isManager || (d.created_by === session?.user.id && new Date(d.created_at).toDateString() === new Date().toDateString())
  const customerOpts = useMemo(() => partners.filter(p => p.kind === 'customer').map(p => ({ value: p.name, hint: p.phone || undefined })), [partners])

  return (
    <>
      <div className="row-actions month-nav">
        <button type="button" className="btn ghost sm" aria-label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <b>{monthLabel(month)}</b>
        <button type="button" className="btn ghost sm" aria-label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>

      <div className="tiles">
        <Tile kind="main" k="Phải trả shipper" v={money(sum.due)} s={`${sum.orders} chuyến giao`} />
        <Tile kind="in" k="Đã trả" v={money(sum.paid)} />
        <Tile kind="out" k="Còn phải trả" v={money(sum.left)} />
      </div>

      <h2>Shipper</h2>
      {!rows.length ? (
        <div className="card"><Empty>{loading ? 'Đang tải…' : isManager ? 'Chưa có shipper. Bấm "Thêm shipper" bên dưới.' : 'Chưa có shipper. Nhờ chủ quán thêm.'}</Empty></div>
      ) : (
        <div className="ship-grid">
          {rows.map(r => {
            const s = shippers.find(x => x.id === r.shipper_id)
            const left = Number(r.balance)
            return (
              <div className={'card stack ship' + (r.active ? '' : ' off')} key={r.shipper_id}>
                <div className="ship-head">
                  <div><b>{cap(r.name)}</b> <span className={'pill ' + (r.kind === 'staff' ? 'p-bank' : 'p-warn')}>{SHIPPER_KIND[r.kind]}</span>
                    {!r.active && <span className="pill p-debt">Đã ngưng</span>}
                    <div className="sub">{r.kind === 'staff' ? `Lương ${money(r.monthly_salary)}/tháng` : `${money(r.per_order_fee)}/đơn`}
                      {r.kind === 'staff' && Number(r.per_order_fee) > 0 && ` + ${money(r.per_order_fee)}/đơn`}{r.phone && ` · ${r.phone}`}</div></div>
                  {isManager && s && <button type="button" className="btn ghost sm" onClick={() => startEdit(s)}>Sửa</button>}
                </div>
                <div className="cf">
                  <div>Chuyến giao</div><div className="r">{r.orders}</div>
                  {r.kind === 'staff' && <><div>Lương tháng</div><div className="r">{money(r.salary)}</div></>}
                  {Number(r.fees) > 0 && <><div>Tiền theo đơn</div><div className="r">{money(r.fees)}</div></>}
                  {Number(r.prev_debt) > 0 && <><div>Nợ tháng trước</div><div className="r">{money(r.prev_debt)}</div></>}
                  <div>Đã trả</div><div className="r good">{money(r.paid)}</div>
                  <div className="tot">{left < 0 ? 'Trả dư' : 'Còn phải trả'}</div><div className={'r tot ' + (left > 0 ? 'bad' : '')}>{money(Math.abs(left))}</div>
                </div>
                {r.kind === 'staff' && Number(r.orders) > 0 && <div className="sub">Bình quân {money(Math.round((Number(r.salary) + Number(r.fees)) / Number(r.orders)))}/chuyến</div>}
                {payFor === r.shipper_id ? (
                  <form className="entry" onSubmit={pay} autoComplete="off">
                    <div className="f c3"><label htmlFor={`pa_${r.shipper_id}`}>Số tiền trả</label>
                      <MoneyInput id={`pa_${r.shipper_id}`} value={payAmt} onChange={e => setPayAmt(e.target.value)} autoFocus /></div>
                    <div className="f c3"><label htmlFor={`pn_${r.shipper_id}`}>Ghi chú</label>
                      <input id={`pn_${r.shipper_id}`} value={payNote} placeholder="ứng lương, trả đủ…" onChange={e => setPayNote(e.target.value)} /></div>
                    <div className="f c6"><Seg value={payMethod} onChange={setPayMethod} options={[{ v: 'cash', label: 'Tiền mặt' }, { v: 'bank', label: 'Chuyển khoản' }]} /></div>
                    <div className="c6 row-actions">
                      <button className="btn" type="submit">Ghi đã trả</button>
                      <button type="button" className="btn ghost" onClick={() => setPayFor(null)}>Hủy</button>
                    </div>
                  </form>
                ) : (
                  <div className="row-actions"><button type="button" className="btn sm" onClick={() => openPay(r)}>Trả tiền</button></div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isManager && (
        <div className="card stack">
          {!showForm ? (
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={() => { setShowForm(true); setEditShipper(null); setSf(blankShipper) }}>+ Thêm shipper</button>
              {shippers.filter(s => !s.active).map(s => (
                <button type="button" key={s.id} className="chip" onClick={() => void toggleActive(s)}>Cho {cap(s.name)} làm lại</button>
              ))}
            </div>
          ) : (
            <form className="entry" onSubmit={saveShipper} autoComplete="off">
              <div className="f c6"><h3 style={{ margin: 0 }}>{editShipper ? `Sửa ${cap(shipperName(editShipper))}` : 'Thêm shipper'}</h3></div>
              <div className="f c6"><Seg value={sf.kind} onChange={v => setSf(s => ({ ...s, kind: v }))}
                options={[{ v: 'staff', label: 'Shipper nhà · lương tháng' }, { v: 'outside', label: 'Shipper ngoài · theo đơn' }]} /></div>
              <div className="f c3"><label htmlFor="sh_name">Tên</label><input id="sh_name" value={sf.name} placeholder="Tuấn, Grab, Ahamove…" onChange={e => setSf(s => ({ ...s, name: e.target.value }))} autoFocus /></div>
              <div className="f c3"><label htmlFor="sh_phone">Số điện thoại</label><input id="sh_phone" inputMode="tel" value={sf.phone} onChange={e => setSf(s => ({ ...s, phone: e.target.value }))} /></div>
              {sf.kind === 'staff' && (
                <div className="f c3"><label htmlFor="sh_sal">Lương 1 tháng</label>
                  <MoneyInput id="sh_sal" value={sf.salary} placeholder="6.000.000" onChange={e => setSf(s => ({ ...s, salary: e.target.value }))} />
                  <span className="hint">{parseMoney(sf.salary) > 0 ? '= ' + money(parseMoney(sf.salary)) : ''}</span></div>
              )}
              <div className="f c3"><label htmlFor="sh_fee">{sf.kind === 'staff' ? 'Phụ cấp mỗi đơn (nếu có)' : 'Tiền trả mỗi đơn'}</label>
                <MoneyInput id="sh_fee" value={sf.fee} placeholder={sf.kind === 'staff' ? '0' : '25'} onChange={e => setSf(s => ({ ...s, fee: e.target.value }))} />
                <span className="hint">{parseMoney(sf.fee) > 0 ? '= ' + money(parseMoney(sf.fee)) + '/đơn' : 'gõ 25 = 25.000đ'}</span></div>
              <div className="c6 row-actions">
                <button className="btn" type="submit">{editShipper ? 'Lưu' : 'Thêm shipper'}</button>
                <button type="button" className="btn ghost" onClick={() => { setShowForm(false); setEditShipper(null) }}>Hủy</button>
                {editShipper && (() => { const s = shippers.find(x => x.id === editShipper); return s && (
                  <button type="button" className="btn ghost" onClick={() => { void toggleActive(s); setShowForm(false); setEditShipper(null) }}>{s.active ? 'Ngưng làm' : 'Cho làm lại'}</button>) })()}
              </div>
            </form>
          )}
        </div>
      )}

      <h2>Chuyến giao {monthLabel(month).toLowerCase()}</h2>
      <div className="card stack">
        <span className="sub">Bán hàng có chọn "Người giao" là tự ghi chuyến ở đây (các món cùng khách trong ngày tính 1 chuyến). Giao hàng không qua bán thì ghi tay bên dưới.</span>
        {activeShippers.length > 0 && (
          <form className="entry" onSubmit={addDelivery} autoComplete="off">
            <div className="f c6"><label>Shipper</label><div className="chips">
              {activeShippers.map(sh => (
                <button type="button" key={sh.id} className={'chip' + (dv.shipper === sh.id ? ' on' : '')} onClick={() => setDv(d => ({ ...d, shipper: sh.id }))}>{cap(sh.name)}</button>
              ))}
            </div></div>
            <div className="f c3"><label htmlFor="dv_cust">Giao cho khách</label>
              <Combo id="dv_cust" value={dv.customer} placeholder="khách lẻ" newLabel="Khách mới" options={customerOpts} onChange={v => setDv(d => ({ ...d, customer: v }))} /></div>
            <div className="f c3"><label htmlFor="dv_fee">Phí trả shipper</label>
              <MoneyInput id="dv_fee" value={dv.fee} placeholder={toThousand(shippers.find(s => s.id === dv.shipper)?.per_order_fee) || '0'} onChange={e => setDv(d => ({ ...d, fee: e.target.value }))} />
              <span className="hint">để trống = phí mặc định của shipper</span></div>
            <div className="c6"><button className="btn" type="submit">Ghi chuyến giao ngày {dm(day)}</button></div>
          </form>
        )}
        <div className="tw">
          {!dels.length ? <Empty>Chưa có chuyến giao trong tháng.</Empty> : (
            <table>
              <thead><tr><th>Ngày</th><th>Shipper</th><th>Khách</th><th className="r">Phí trả shipper</th><th></th></tr></thead>
              <tbody>{dels.map(d => (
                <tr key={d.id}>
                  <td>{dm(d.date)}</td><td>{cap(shipperName(d.shipper_id))}</td>
                  <td>{d.customer_id ? cap(partnerName(d.customer_id)) : <span className="sub">lẻ</span>}{!d.auto && <div className="sub">ghi tay</div>}</td>
                  <td className="r">{canEdit(d)
                    ? <MoneyInput aria-label="Phí trả shipper" className="fee-in" defaultValue={toThousand(d.fee) || '0'} key={d.fee} onBlur={e => void setFee(d, e.target.value)} />
                    : money(d.fee)}</td>
                  <td>{!d.auto && canEdit(d) && <ConfirmButton onConfirm={() => removeDelivery(d.id)}>Xóa</ConfirmButton>}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
      </div>

      <h2>Đã trả {monthLabel(month).toLowerCase()}</h2>
      <div className="card"><div className="tw">
        {!pays.length ? <Empty>Chưa trả khoản nào cho tháng này.</Empty> : (
          <table>
            <thead><tr><th>Ngày trả</th><th>Shipper</th><th>Ghi chú</th><th className="r">Số tiền</th><th></th></tr></thead>
            <tbody>{pays.map(p => (
              <tr key={p.id}>
                <td>{dm(p.date)}</td><td>{cap(shipperName(p.shipper_id))}</td><td className="sub">{p.note}</td>
                <td className="r"><b>{money(p.amount)}</b> <span className={'pill ' + (p.pay_method === 'bank' ? 'p-bank' : 'p-cash')}>{p.pay_method === 'bank' ? 'CK' : 'TM'}</span></td>
                <td><ConfirmButton onConfirm={() => removePay(p.id)}>Xóa</ConfirmButton></td>
              </tr>))}</tbody>
          </table>
        )}
      </div></div>
      <p className="sub">Tiền trả shipper được ghi vào Sổ tiền (khoản chi) nên báo cáo lời lỗ đã tính luôn.</p>
    </>
  )
}
