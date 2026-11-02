import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { addDays, cap, dm, kg, money, parseMoney, parseNum, short, toThousand } from '../lib/format'
import { saleAmount, saleTotal, type PayMethod, type Sale } from '../lib/types'
import { ConfirmButton, Empty, PayPill, Seg, Tile, useLive, MoneyInput } from '../components/ui'
import { Combo } from '../components/Combo'

type Pay = PayMethod | 'debt'
const blank = { product: '', customer: '', qty: '', price: '', cb: '', ship: '', size: '', note: '', pay: 'cash' as Pay, shipper: '' }

export default function Sales() {
  const app = useApp()
  const { shop, day, products, partners, shippers, productName, partnerName, shipperName, session, isManager } = app
  const [rows, setRows] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [recent, setRecent] = useState<{ product_id: string; unit_price: number }[]>([])
  const [f, setF] = useState(blank)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => { const v = e.target.value; setF(s => ({ ...s, [k]: v })) }
  const [billFor, setBillFor] = useState<string | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const prodRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!shop) return
    try {
      const [r, rec] = await Promise.all([
        must(supabase.from('sales').select('*').eq('shop_id', shop.id).eq('date', day).order('created_at')),
        must(supabase.from('sales').select('product_id, unit_price').eq('shop_id', shop.id)
          .gte('date', addDays(day, -30)).lte('date', day).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(1000)),
      ])
      setRows(r as Sale[]); setRecent(rec as typeof recent)
    } catch (e) { app.fail(e) } finally { setLoading(false) }
  }, [shop, day]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); void load() }, [load])
  useLive(shop?.id, ['sales'], load)
  useEffect(() => { setEditId(null); setF(blank) }, [day])

  const lastPrice = useMemo(() => {
    const m = new Map<string, number>()
    recent.forEach(r => { if (!m.has(r.product_id)) m.set(r.product_id, Number(r.unit_price)) })
    return m
  }, [recent])
  const top = useMemo(() => {
    const c = new Map<string, number>()
    recent.forEach(r => c.set(r.product_id, (c.get(r.product_id) || 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0])
  }, [recent])

  const productOpts = useMemo(() => {
    const rank = new Map(top.map((id, i) => [id, i]))
    return [...products]
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'vi'))
      .map(p => { const lp = lastPrice.get(p.id) || p.default_sell_price; return { value: p.name, hint: lp ? short(lp) : undefined } })
  }, [products, top, lastPrice])
  const customerOpts = useMemo(() => partners.filter(p => p.kind === 'customer')
    .sort((a, b) => a.name.localeCompare(b.name, 'vi')).map(p => ({ value: p.name, hint: p.phone || undefined })), [partners])
  const activeShippers = useMemo(() => shippers.filter(s => s.active || s.id === f.shipper), [shippers, f.shipper])
  const choose = (name: string) => {
    const p = products.find(x => x.name === name)
    const lp = p && (lastPrice.get(p.id) || p.default_sell_price)
    setF(s => ({ ...s, product: name, price: lp ? toThousand(lp) : s.price }))
    setTimeout(() => qtyRef.current?.focus())
  }

  const qty = parseNum(f.qty), price = parseMoney(f.price), cb = parseMoney(f.cb) || 0, ship = parseMoney(f.ship) || 0
  const total = qty > 0 && price > 0 ? qty * price + cb + ship : 0

  const pickProduct = (name: string) => {
    const p = products.find(x => x.name === name)
    const lp = p && (lastPrice.get(p.id) || p.default_sell_price)
    setF(s => ({ ...s, product: name, price: s.price || (lp ? toThousand(lp) : '') }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop) return
    if (!f.product.trim()) { app.toast('Nhập tên món'); prodRef.current?.focus(); return }
    if (!(qty > 0)) { app.toast('Nhập số kg, ví dụ 1,5'); qtyRef.current?.focus(); return }
    if (!(price > 0)) { app.toast('Nhập giá bán / kg'); return }
    setBusy(true)
    try {
      const product_id = await app.ensureProduct(f.product)
      const customer_id = await app.ensurePartner('customer', f.customer)
      const rec = {
        product_id, customer_id, qty, unit_price: price, processing_fee: cb, shipping_fee: ship,
        size: f.size.trim() || null, note: f.note.trim() || null,
        pay_method: (f.pay === 'debt' ? 'cash' : f.pay) as PayMethod, paid: f.pay !== 'debt',
        shipper_id: f.shipper || null,
      }
      if (editId) {
        const old = rows.find(r => r.id === editId)
        const keepPaidAt = old?.paid && rec.paid ? old.paid_at : null
        const { data, error } = await supabase.from('sales').update({ ...rec, paid_at: keepPaidAt }).eq('id', editId).select()
        if (error) throw error
        if (!data?.length) throw new Error('Bạn không có quyền sửa dòng này')
        app.toast('Đã cập nhật')
      } else {
        await must(supabase.from('sales').insert({ ...rec, shop_id: shop.id, date: day }))
        app.toast(`Đã lưu ${cap(f.product)} ${kg(qty)}kg`)
      }
      setF(s => ({ ...blank, customer: editId ? '' : s.customer, pay: editId ? 'cash' : s.pay, shipper: editId ? '' : s.shipper }))
      setEditId(null)
      await load()
      prodRef.current?.focus()
    } catch (e) { app.fail(e) } finally { setBusy(false) }
  }

  const edit = (s: Sale) => {
    setEditId(s.id)
    setF({
      product: productName(s.product_id), customer: partnerName(s.customer_id), qty: String(s.qty).replace('.', ','),
      price: toThousand(s.unit_price), cb: toThousand(s.processing_fee), ship: toThousand(s.shipping_fee),
      size: s.size || '', note: s.note || '', pay: s.paid ? s.pay_method : 'debt', shipper: s.shipper_id || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const remove = async () => {
    if (!editId) return
    try {
      const { data, error } = await supabase.from('sales').delete().eq('id', editId).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa'); setEditId(null); setF(blank); await load()
    } catch (e) { app.fail(e) }
  }
  const editable = (s: Sale) => isManager || (s.created_by === session?.user.id && new Date(s.created_at).toDateString() === new Date().toDateString())

  const sum = useMemo(() => {
    let rev = 0, svc = 0, cash = 0, bank = 0, debt = 0, q = 0
    rows.forEach(s => {
      const t = saleTotal(s); rev += saleAmount(s); svc += Number(s.processing_fee) + Number(s.shipping_fee); q += Number(s.qty)
      if (!s.paid) debt += t; else if (s.pay_method === 'bank') bank += t; else cash += t
    })
    return { rev, svc, cash, bank, debt, q }
  }, [rows])

  const bills = useMemo(() => {
    const g = new Map<string, Sale[]>()
    rows.forEach(s => { if (s.customer_id) g.set(s.customer_id, [...(g.get(s.customer_id) || []), s]) })
    return g
  }, [rows])
  const billText = useMemo(() => {
    const L = billFor ? bills.get(billFor) : null
    if (!L) return ''
    let t = 0, c = 0, sh = 0, debt = 0
    const lines = L.map(s => {
      t += saleAmount(s); c += Number(s.processing_fee); sh += Number(s.shipping_fee); if (!s.paid) debt += saleTotal(s)
      return `• ${cap(productName(s.product_id))}${s.size ? ` (${s.size})` : ''}: ${kg(s.qty)}kg x ${money(s.unit_price)} = ${money(saleAmount(s))}`
    })
    let out = `${(shop?.name || '').toUpperCase()}\nHóa đơn ngày ${dm(day)} - Khách: ${cap(partnerName(billFor))}\n\n${lines.join('\n')}`
    if (c) out += `\n• Tiền chế biến: ${money(c)}`
    if (sh) out += `\n• Tiền ship: ${money(sh)}`
    out += `\n\nTỔNG CỘNG: ${money(t + c + sh)}`
    if (debt) out += `\n(Còn nợ: ${money(debt)})`
    if (shop?.phone) out += `\nLH: ${shop.phone}`
    return out + '\nCảm ơn quý khách!'
  }, [billFor, bills, shop, day, productName, partnerName])
  const copyBill = async () => {
    try { await navigator.clipboard.writeText(billText); app.toast('Đã sao chép hóa đơn, dán vào Zalo để gửi') }
    catch { app.toast('Máy không cho sao chép, hãy giữ tay vào hóa đơn để chọn') }
  }

  return (
    <>
      <div className="tiles">
        <Tile kind="main" k={`Doanh thu ${dm(day)}`} v={money(sum.rev + sum.svc)} s={`${rows.length} dòng · ${kg(sum.q)} kg`} />
        <Tile kind="in" k="Tiền mặt" v={money(sum.cash)} />
        <Tile k="Chuyển khoản" v={money(sum.bank)} />
        <Tile kind="out" k="Khách ghi nợ" v={money(sum.debt)} />
      </div>

      <div className="card">
        <form className="entry" onSubmit={submit} autoComplete="off">
          {top.length > 0 && (
            <div className="f c6"><label>Món bán nhiều</label><div className="chips">
              {top.map(id => (
                <button type="button" key={id} className={'chip' + (f.product === productName(id) ? ' on' : '')}
                  onClick={() => { setF(s => ({ ...s, product: productName(id), price: toThousand(lastPrice.get(id)) })); qtyRef.current?.focus() }}>
                  {cap(productName(id))} <span className="sub">{short(lastPrice.get(id))}</span>
                </button>
              ))}
            </div></div>
          )}
          <div className="f c3"><label htmlFor="s_prod">Món</label>
            <Combo id="s_prod" inputRef={prodRef} value={f.product} placeholder="ốc hương" newLabel="Món mới" options={productOpts}
              onChange={v => setF(s => ({ ...s, product: v }))} onPick={choose} onBlur={v => pickProduct(v.trim().toLowerCase())} /></div>
          <div className="f c3"><label htmlFor="s_cust">Khách</label>
            <Combo id="s_cust" value={f.customer} placeholder="khách lẻ" newLabel="Khách mới" options={customerOpts}
              onChange={v => setF(s => ({ ...s, customer: v }))} onPick={() => setTimeout(() => qtyRef.current?.focus())} /></div>
          <div className="f c2"><label htmlFor="s_qty">Số kg</label>
            <input id="s_qty" ref={qtyRef} inputMode="decimal" value={f.qty} placeholder="1,5" onChange={set('qty')} /></div>
          <div className="f c2"><label htmlFor="s_price">Giá / kg</label>
            <MoneyInput id="s_price" value={f.price} placeholder="270" onChange={set('price')} />
            <span className="hint">{price > 0 ? `= ${money(price)}/kg` : 'gõ 270 = 270.000đ'}</span></div>
          <div className="f c2"><label>Thành tiền</label><div className="big">{money(total)}</div></div>
          <div className="f c2"><label htmlFor="s_cb">Chế biến</label>
            <MoneyInput id="s_cb" value={f.cb} placeholder="0" onChange={set('cb')} /></div>
          <div className="f c2"><label htmlFor="s_ship">Ship</label>
            <MoneyInput id="s_ship" value={f.ship} placeholder="0" onChange={set('ship')} /></div>
          <div className="f c2"><label htmlFor="s_size">Size / ghi chú</label>
            <input id="s_size" value={f.size} placeholder="70-80 con" onChange={set('size')} /></div>
          {(activeShippers.length > 0 || isManager) && (
            <div className="f c6"><label>Người giao</label><div className="chips">
              <button type="button" className={'chip' + (!f.shipper ? ' on' : '')} onClick={() => setF(s => ({ ...s, shipper: '' }))}>Khách tự lấy</button>
              {activeShippers.map(sh => (
                <button type="button" key={sh.id} className={'chip' + (f.shipper === sh.id ? ' on' : '')} onClick={() => setF(s => ({ ...s, shipper: s.shipper === sh.id ? '' : sh.id }))}>
                  {cap(sh.name)} <span className="sub">{sh.kind === 'staff' ? 'nhà' : sh.per_order_fee ? short(sh.per_order_fee) + '/đơn' : 'ngoài'}</span>
                </button>
              ))}
              {isManager && <Link className="chip add" to="/shipper">+ Thêm shipper</Link>}
            </div></div>
          )}
          <div className="f c6"><label>Thanh toán</label>
            <Seg value={f.pay} onChange={v => setF(s => ({ ...s, pay: v }))} options={[{ v: 'cash', label: 'Tiền mặt' }, { v: 'bank', label: 'Chuyển khoản' }, { v: 'debt', label: 'Ghi nợ', danger: true }]} /></div>
          <div className="c6 row-actions">
            <button className="btn" type="submit" disabled={busy}>{editId ? 'Cập nhật' : 'Lưu đơn bán'}</button>
            {editId && <button type="button" className="btn ghost" onClick={() => { setEditId(null); setF(blank) }}>Hủy sửa</button>}
            {editId && <ConfirmButton className="btn danger" onConfirm={remove}>Xóa dòng này</ConfirmButton>}
          </div>
        </form>
      </div>

      <h2>Đơn bán ngày {dm(day)}</h2>
      <div className="card"><div className="tw">
        {!rows.length ? <Empty>{loading ? 'Đang tải…' : 'Chưa có đơn bán. Chọn món, gõ số kg rồi bấm Lưu.'}</Empty> : (
          <table>
            <thead><tr><th>#</th><th>Món</th><th>Khách</th><th className="r">Kg</th><th className="r">Giá</th><th className="r">Thành tiền</th><th></th></tr></thead>
            <tbody>{rows.map((s, i) => {
              const extra = [s.processing_fee ? 'chế biến ' + short(s.processing_fee) : '', s.shipping_fee ? 'ship ' + short(s.shipping_fee) : '', s.shipper_id ? 'giao: ' + cap(shipperName(s.shipper_id)) : '', s.size].filter(Boolean).join(' · ')
              return (
                <tr key={s.id} className={(editable(s) ? 'click' : '') + (editId === s.id ? ' editing' : '')} onClick={() => editable(s) && edit(s)}>
                  <td className="sub">{i + 1}</td>
                  <td><b>{cap(productName(s.product_id))}</b>{extra && <div className="sub">{extra}</div>}</td>
                  <td>{s.customer_id ? cap(partnerName(s.customer_id)) : <span className="sub">lẻ</span>}</td>
                  <td className="r">{kg(s.qty)}</td><td className="r">{short(s.unit_price)}</td>
                  <td className="r"><b>{money(saleTotal(s))}</b></td><td><PayPill paid={s.paid} method={s.pay_method} /></td>
                </tr>)
            })}</tbody>
            <tfoot><tr><td></td><td>{rows.length} dòng</td><td></td><td className="r">{kg(sum.q)}</td><td></td><td className="r">{money(sum.rev + sum.svc)}</td><td></td></tr></tfoot>
          </table>
        )}
      </div></div>

      <h2>Hóa đơn gửi khách</h2>
      <div className="card stack">
        {bills.size ? <div className="chips">{[...bills.keys()].map(id => (
          <button type="button" key={id} className={'chip' + (billFor === id ? ' on' : '')} onClick={() => setBillFor(billFor === id ? null : id)}>
            {cap(partnerName(id))} · {short(bills.get(id)!.reduce((a, s) => a + saleTotal(s), 0))}
          </button>))}</div> : <span className="sub">Ghi tên khách khi bán để tạo hóa đơn gửi khách.</span>}
        {billText && <><pre className="bill">{billText}</pre><div><button type="button" className="btn sm" onClick={copyBill}>Sao chép để gửi Zalo</button></div></>}
      </div>

    </>
  )
}
