import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dm, kg, money, parseNum } from '../lib/format'
import type { StockAdj, StockLevel } from '../lib/types'
import { ConfirmButton, Empty, Tile, useLive } from '../components/ui'

export default function Stock() {
  const app = useApp()
  const { shop, day, productName } = app
  const [levels, setLevels] = useState<StockLevel[]>([])
  const [adj, setAdj] = useState<StockAdj[]>([])
  const [loading, setLoading] = useState(true)
  const [pick, setPick] = useState<StockLevel | null>(null)
  const [mode, setMode] = useState<'loss' | 'count'>('loss')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!shop) return
    try {
      const [l, a] = await Promise.all([
        must(supabase.rpc('stock_levels', { p_shop: shop.id, p_date: day })),
        must(supabase.from('stock_adjustments').select('*').eq('shop_id', shop.id).eq('date', day).order('created_at')),
      ])
      setLevels(l as StockLevel[]); setAdj(a as StockAdj[])
    } catch (e) { app.fail(e) } finally { setLoading(false) }
  }, [shop, day]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); void load() }, [load])
  useLive(shop?.id, ['sales', 'purchases', 'stock_adjustments'], load)

  const rows = useMemo(() => [...levels].sort((a, b) => Number(b.on_hand) * Number(b.avg_cost || 0) - Number(a.on_hand) * Number(a.avg_cost || 0)), [levels])
  const totals = useMemo(() => {
    let value = 0, neg = 0, inStock = 0
    levels.forEach(l => { const o = Number(l.on_hand); if (o > 0.05) { inStock++; value += o * Number(l.avg_cost || 0) } if (o < -0.05) neg++ })
    return { value, neg, inStock, loss: adj.filter(a => a.qty > 0).reduce((s, a) => s + Number(a.qty), 0) }
  }, [levels, adj])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!shop || !pick) return
    const v = parseNum(qty)
    if (!Number.isFinite(v) || v < 0) { app.toast('Nhập số kg'); return }
    let q = v, n = note.trim()
    if (mode === 'count') {
      q = Math.round((Number(pick.on_hand) - v) * 1000) / 1000
      n = (n ? n + ' · ' : '') + `kiểm kho còn ${kg(v)}kg`
      if (Math.abs(q) < 0.001) { app.toast('Khớp sổ sách, không cần điều chỉnh'); setPick(null); return }
    } else if (v === 0) { app.toast('Nhập số kg hao'); return }
    try {
      await must(supabase.from('stock_adjustments').insert({ shop_id: shop.id, date: day, product_id: pick.product_id, qty: q, reason: mode, note: n || null }))
      app.toast(q > 0 ? `Đã ghi hao ${kg(q)} kg` : `Đã ghi dư ${kg(-q)} kg`)
      setPick(null); setQty(''); setNote(''); await load()
    } catch (e) { app.fail(e) }
  }
  const del = async (id: string) => {
    try {
      const { data, error } = await supabase.from('stock_adjustments').delete().eq('id', id).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa'); await load()
    } catch (e) { app.fail(e) }
  }

  return (
    <>
      <div className="tiles">
        <Tile kind="main" k="Giá trị hàng tồn" v={money(totals.value)} s={`theo giá vốn, hết ngày ${dm(day)}`} />
        <Tile k="Món còn hàng" v={totals.inStock} />
        <Tile kind="out" k={`Hao hụt ${dm(day)}`} v={`${kg(totals.loss)} kg`} />
        <Tile k="Cần kiểm tra" v={totals.neg} s="món bán nhiều hơn nhập" />
      </div>
      <div className="card"><div className="tw">
        {!rows.length ? <Empty>{loading ? 'Đang tải…' : 'Chưa có hàng. Ghi phiếu nhập ở tab Nhập hàng.'}</Empty> : (
          <table>
            <thead><tr><th>Món</th><th className="r">Nhập</th><th className="r">Bán</th><th className="r">Hao</th><th className="r">Tồn kg</th><th className="r">Giá vốn</th><th className="r">Giá bán</th><th className="r">Lãi/kg</th></tr></thead>
            <tbody>{rows.map(l => {
              const o = Number(l.on_hand), c = l.avg_cost != null ? Number(l.avg_cost) : null, s = l.last_sell_price != null ? Number(l.last_sell_price) : null
              const m = c != null && s != null ? s - c : null
              return (
                <tr key={l.product_id} className={'click' + (pick?.product_id === l.product_id ? ' editing' : '')} onClick={() => { setPick(l); setQty(''); setNote('') }}>
                  <td><b>{cap(l.name)}</b></td><td className="r">{kg(l.in_qty)}</td><td className="r">{kg(l.out_qty)}</td>
                  <td className="r">{Number(l.adj_qty) ? kg(l.adj_qty) : ''}</td>
                  <td className="r">{o < -0.05 ? <span className="pill p-warn">{Number(l.in_qty) ? 'âm ' + kg(o) : 'chưa có nhập'}</span> : o > 0.05 ? <b>{kg(o)}</b> : <span className="sub">hết</span>}</td>
                  <td className="r">{c != null ? money(c) : '–'}</td><td className="r">{s != null ? money(s) : '–'}</td>
                  <td className="r">{m != null ? <span className={m >= 0 ? 'good' : 'bad'}>{money(m)}</span> : '–'}</td>
                </tr>)
            })}</tbody>
          </table>)}
        <p className="sub" style={{ margin: '10px 0 0' }}>Tồn = nhập − bán − hao hụt, tính đến hết ngày đang chọn. Giá vốn là giá nhập bình quân đã cộng cước. Bấm một dòng để ghi hao hụt hoặc kiểm kho.</p>
      </div></div>

      {pick && (
        <div className="card">
          <form className="entry" onSubmit={save} autoComplete="off">
            <div className="f c6"><b>{cap(pick.name)} <span className="sub">· sổ sách còn {kg(pick.on_hand)} kg</span></b></div>
            <div className="f c2"><label htmlFor="a_mode">Loại</label>
              <select id="a_mode" value={mode} onChange={e => setMode(e.target.value as 'loss' | 'count')}>
                <option value="loss">Hao hụt / chết (kg)</option><option value="count">Kiểm kho: tồn thực tế (kg)</option></select></div>
            <div className="f c2"><label htmlFor="a_qty">Số kg</label><input id="a_qty" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} autoFocus /></div>
            <div className="f c2"><label htmlFor="a_note">Ghi chú</label><input id="a_note" value={note} placeholder="ghẹ ngộp, sụt ký…" onChange={e => setNote(e.target.value)} /></div>
            <div className="c6 row-actions"><button className="btn" type="submit">Lưu</button><button type="button" className="btn ghost" onClick={() => setPick(null)}>Đóng</button></div>
          </form>
        </div>
      )}

      <h2>Hao hụt ngày {dm(day)}</h2>
      <div className="card"><div className="tw">
        {!adj.length ? <Empty>Không có hao hụt ngày này.</Empty> : (
          <table><thead><tr><th>Món</th><th className="r">Kg</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>{adj.map(a => (
              <tr key={a.id}><td>{cap(productName(a.product_id))}</td><td className="r">{Number(a.qty) > 0 ? 'hao ' + kg(a.qty) : 'dư ' + kg(-a.qty)}</td>
                <td>{a.note}</td><td><ConfirmButton onConfirm={() => del(a.id)} confirmText="Chắc chắn?">Xóa</ConfirmButton></td></tr>))}</tbody></table>)}
      </div></div>
    </>
  )
}
