import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dm, kg, money, parseMoney, parseNum, toThousand } from '../lib/format'
import { purchaseAmount, type PayMethod, type Purchase } from '../lib/types'
import { ConfirmButton, Empty, PayPill, Seg, Tile, useLive, MoneyInput } from '../components/ui'
import { Combo } from '../components/Combo'

type Pay = PayMethod | 'debt'
const blank = { product: '', supplier: '', size: '', qty: '', price: '', freight: '', note: '', pay: 'cash' as Pay }

export default function Purchases() {
  const app = useApp()
  const { shop, day, products, partners, productName, partnerName, session, isManager } = app
  const [rows, setRows] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState(blank)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { const v = e.target.value; setF(s => ({ ...s, [k]: v })) }
  const prodRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!shop) return
    try { setRows(await must(supabase.from('purchases').select('*').eq('shop_id', shop.id).eq('date', day).order('created_at')) as Purchase[]) }
    catch (e) { app.fail(e) } finally { setLoading(false) }
  }, [shop, day]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); void load() }, [load])
  useLive(shop?.id, ['purchases'], load)
  useEffect(() => { setEditId(null); setF(blank) }, [day])

  // gợi ý giá và mối hàng lần nhập trước
  const suggest = async (name: string) => {
    const p = products.find(x => x.name === name.trim().toLowerCase())
    if (!p || !shop) return
    const { data } = await supabase.from('purchases').select('unit_price, supplier_id').eq('shop_id', shop.id).eq('product_id', p.id)
      .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1)
    const last = data?.[0]
    if (last) setF(s => ({ ...s, price: s.price || toThousand(last.unit_price), supplier: s.supplier || partnerName(last.supplier_id) }))
  }

  const qty = parseNum(f.qty), price = parseMoney(f.price), freight = parseMoney(f.freight) || 0
  const amount = qty > 0 && price > 0 ? qty * price : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop) return
    if (!f.product.trim()) { app.toast('Nhập tên hàng'); return }
    if (!(qty > 0)) { app.toast('Nhập số kg'); return }
    if (!(price > 0)) { app.toast('Nhập giá nhập / kg'); return }
    setBusy(true)
    try {
      const product_id = await app.ensureProduct(f.product)
      const supplier_id = await app.ensurePartner('supplier', f.supplier)
      const rec = {
        product_id, supplier_id, qty, unit_price: price, freight, size: f.size.trim() || null, note: f.note.trim() || null,
        pay_method: (f.pay === 'debt' ? 'cash' : f.pay) as PayMethod, paid: f.pay !== 'debt',
      }
      if (editId) {
        const old = rows.find(r => r.id === editId)
        const { data, error } = await supabase.from('purchases').update({ ...rec, paid_at: old?.paid && rec.paid ? old.paid_at : null }).eq('id', editId).select()
        if (error) throw error
        if (!data?.length) throw new Error('Bạn không có quyền sửa dòng này')
        app.toast('Đã cập nhật')
      } else {
        await must(supabase.from('purchases').insert({ ...rec, shop_id: shop.id, date: day }))
        app.toast('Đã lưu phiếu nhập')
      }
      setF(s => ({ ...blank, supplier: editId ? '' : s.supplier }))
      setEditId(null); await load(); prodRef.current?.focus()
    } catch (e) { app.fail(e) } finally { setBusy(false) }
  }

  const edit = (b: Purchase) => {
    setEditId(b.id)
    setF({ product: productName(b.product_id), supplier: partnerName(b.supplier_id), size: b.size || '', qty: String(b.qty).replace('.', ','),
      price: toThousand(b.unit_price), freight: toThousand(b.freight), note: b.note || '', pay: b.paid ? b.pay_method : 'debt' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const remove = async () => {
    if (!editId) return
    try {
      const { data, error } = await supabase.from('purchases').delete().eq('id', editId).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa'); setEditId(null); setF(blank); await load()
    } catch (e) { app.fail(e) }
  }
  const editable = (b: Purchase) => isManager || (b.created_by === session?.user.id && new Date(b.created_at).toDateString() === new Date().toDateString())

  const sum = useMemo(() => {
    let amt = 0, fr = 0, debt = 0, q = 0
    rows.forEach(b => { amt += purchaseAmount(b); fr += Number(b.freight); q += Number(b.qty); if (!b.paid) debt += purchaseAmount(b) })
    return { amt, fr, debt, q }
  }, [rows])

  return (
    <>
      <div className="tiles">
        <Tile kind="main" k={`Tiền hàng nhập ${dm(day)}`} v={money(sum.amt)} s={`${kg(sum.q)} kg · ${rows.length} dòng`} />
        <Tile kind="out" k="Cước xe + bãi" v={money(sum.fr)} />
        <Tile k="Còn nợ mối" v={money(sum.debt)} />
        <Tile k="Tổng chi nhập" v={money(sum.amt + sum.fr)} />
      </div>
      <div className="card">
        <form className="entry" onSubmit={submit} autoComplete="off">
          <div className="f c3"><label htmlFor="b_prod">Tên hàng</label>
            <Combo id="b_prod" inputRef={prodRef} value={f.product} placeholder="ghẹ" newLabel="Hàng mới"
              options={products.map(p => ({ value: p.name }))} onChange={v => setF(s => ({ ...s, product: v }))}
              onPick={v => void suggest(v)} onBlur={v => void suggest(v)} /></div>
          <div className="f c3"><label htmlFor="b_src">Mối hàng</label>
            <Combo id="b_src" value={f.supplier} placeholder="vũ ghẹ" newLabel="Mối mới"
              options={partners.filter(p => p.kind === 'supplier').map(p => ({ value: p.name, hint: p.phone || undefined }))}
              onChange={v => setF(s => ({ ...s, supplier: v }))} /></div>
          <div className="f c2"><label htmlFor="b_size">Size</label><input id="b_size" value={f.size} placeholder="3-4 con" onChange={set('size')} /></div>
          <div className="f c2"><label htmlFor="b_qty">Số kg</label><input id="b_qty" inputMode="decimal" value={f.qty} onChange={set('qty')} /></div>
          <div className="f c2"><label htmlFor="b_price">Giá nhập / kg</label><MoneyInput id="b_price" value={f.price} placeholder="400" onChange={set('price')} />
            <span className="hint">{price > 0 ? `= ${money(price)}/kg` : 'gõ 400 = 400.000đ'}</span></div>
          <div className="f c2"><label htmlFor="b_fr">Cước xe + bãi</label><MoneyInput id="b_fr" value={f.freight} placeholder="0" onChange={set('freight')} />
            <span className="hint">gõ 60 = 60.000đ</span></div>
          <div className="f c2"><label>Thành tiền</label><div className="big">{money(amount)}</div></div>
          <div className="f c2"><label>Giá vốn / kg (gồm cước)</label><div className="big" style={{ fontSize: 16 }}>{qty > 0 && price > 0 ? money((amount + freight) / qty) : '–'}</div></div>
          <div className="f c6"><label>Thanh toán</label>
            <Seg value={f.pay} onChange={v => setF(s => ({ ...s, pay: v }))} options={[{ v: 'cash', label: 'Tiền mặt' }, { v: 'bank', label: 'Chuyển khoản' }, { v: 'debt', label: 'Nợ mối', danger: true }]} /></div>
          <div className="c6 row-actions">
            <button className="btn" type="submit" disabled={busy}>{editId ? 'Cập nhật' : 'Lưu phiếu nhập'}</button>
            {editId && <button type="button" className="btn ghost" onClick={() => { setEditId(null); setF(blank) }}>Hủy sửa</button>}
            {editId && <ConfirmButton className="btn danger" onConfirm={remove}>Xóa dòng này</ConfirmButton>}
          </div>
        </form>
      </div>
      <h2>Hàng nhập ngày {dm(day)}</h2>
      <div className="card"><div className="tw">
        {!rows.length ? <Empty>{loading ? 'Đang tải…' : 'Chưa nhập hàng ngày này.'}</Empty> : (
          <table>
            <thead><tr><th>Hàng</th><th>Mối</th><th className="r">Kg</th><th className="r">Giá/kg</th><th className="r">Cước</th><th className="r">Thành tiền</th><th></th></tr></thead>
            <tbody>{rows.map(b => (
              <tr key={b.id} className={(editable(b) ? 'click' : '') + (editId === b.id ? ' editing' : '')} onClick={() => editable(b) && edit(b)}>
                <td><b>{cap(productName(b.product_id))}</b>{b.size && <div className="sub">{b.size}</div>}</td>
                <td>{cap(partnerName(b.supplier_id))}</td><td className="r">{kg(b.qty)}</td><td className="r">{money(b.unit_price)}</td>
                <td className="r">{Number(b.freight) ? money(b.freight) : ''}</td><td className="r"><b>{money(purchaseAmount(b))}</b></td>
                <td><PayPill paid={b.paid} method={b.pay_method} /></td>
              </tr>))}</tbody>
            <tfoot><tr><td>{rows.length} dòng</td><td></td><td className="r">{kg(sum.q)}</td><td></td><td className="r">{money(sum.fr)}</td><td className="r">{money(sum.amt)}</td><td></td></tr></tfoot>
          </table>)}
      </div></div>
    </>
  )
}
