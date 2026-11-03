import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { addDays, cap, dm, dmy, dow, kg, money, short, today } from '../lib/format'
import type { CashFlow, DailyPnl, ProductPnl } from '../lib/types'
import { Empty, Tile, useLive } from '../components/ui'

type Range = '7' | '30' | 'month' | 'lastmonth' | 'custom'
const N = (x: unknown) => Number(x) || 0

function rangeOf(r: Range, from: string, to: string): [string, string] {
  const t = today()
  if (r === '7') return [addDays(t, -6), t]
  if (r === '30') return [addDays(t, -29), t]
  if (r === 'month') return [t.slice(0, 8) + '01', t]
  if (r === 'lastmonth') {
    const first = t.slice(0, 8) + '01', lastEnd = addDays(first, -1)
    return [lastEnd.slice(0, 8) + '01', lastEnd]
  }
  return [from, to]
}

export default function Dashboard() {
  const app = useApp()
  const { shop, partnerName, setDay } = app
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>('7')
  const [cFrom, setCFrom] = useState(addDays(today(), -6))
  const [cTo, setCTo] = useState(today())
  const [from, to] = rangeOf(range, cFrom, cTo)
  const [days, setDays] = useState<DailyPnl[]>([])
  const [prods, setProds] = useState<ProductPnl[]>([])
  const [flow, setFlow] = useState<CashFlow | null>(null)
  const [cust, setCust] = useState<[string, number, number][]>([])
  const [sup, setSup] = useState<[string, number, number][]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!shop || from > to) return
    try {
      const [d, p, f, s, b] = await Promise.all([
        must(supabase.rpc('daily_pnl', { p_shop: shop.id, p_from: from, p_to: to })),
        must(supabase.rpc('product_pnl', { p_shop: shop.id, p_from: from, p_to: to })),
        must(supabase.rpc('cash_flow', { p_shop: shop.id, p_from: from, p_to: to })),
        must(supabase.from('sales').select('customer_id, qty, unit_price, amount, processing_fee, shipping_fee').eq('shop_id', shop.id).gte('date', from).lte('date', to).not('customer_id', 'is', null).limit(10000)),
        must(supabase.from('purchases').select('supplier_id, qty, unit_price, freight').eq('shop_id', shop.id).gte('date', from).lte('date', to).limit(10000)),
      ])
      setDays(d as DailyPnl[]); setProds(p as ProductPnl[]); setFlow((f as CashFlow[])[0] || null)
      const agg = (rows: Record<string, unknown>[], key: string, val: (r: Record<string, unknown>) => number) => {
        const m = new Map<string, [number, number]>()
        rows.forEach(r => { const k = String(r[key] ?? ''); const x = m.get(k) || [0, 0]; x[0] += val(r); x[1]++; m.set(k, x) })
        return [...m.entries()].map(([k, v]) => [k, v[0], v[1]] as [string, number, number]).sort((a, b) => b[1] - a[1])
      }
      setCust(agg(s as Record<string, unknown>[], 'customer_id', r => N(r.amount) + N(r.processing_fee) + N(r.shipping_fee)).slice(0, 15))
      setSup(agg(b as Record<string, unknown>[], 'supplier_id', r => N(r.qty) * N(r.unit_price) + N(r.freight)))
    } catch (e) { app.fail(e) } finally { setLoading(false) }
  }, [shop, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); void load() }, [load])
  useLive(shop?.id, ['sales', 'purchases', 'cash_entries', 'stock_adjustments'], load)

  const t = useMemo(() => {
    const s = { revenue: 0, service: 0, cogs: 0, loss: 0, other_in: 0, other_out: 0, purchases: 0, freight: 0, orders: 0, net: 0 }
    days.forEach(d => (Object.keys(s) as (keyof typeof s)[]).forEach(k => { s[k] += N(d[k]) }))
    return s
  }, [days])
  const cashIn = flow ? N(flow.cash_in) + N(flow.bank_in) : 0
  const cashOut = flow ? N(flow.cash_out) + N(flow.bank_out) : 0
  const gross = t.revenue - t.cogs
  const noCost = prods.filter(p => !p.has_cost && N(p.revenue) > 0)
  const chart = days.map(d => ({ name: dm(d.day), 'Doanh thu': N(d.revenue) + N(d.service), 'Nhập hàng': N(d.purchases) + N(d.freight), 'Lãi ròng': N(d.net) }))
  const best = [...days].sort((a, b) => N(b.net) - N(a.net))[0]

  return (
    <>
      <div className="chips">
        {([['7', '7 ngày'], ['30', '30 ngày'], ['month', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['custom', 'Tự chọn']] as const).map(([v, l]) => (
          <button key={v} type="button" className={'chip' + (range === v ? ' on' : '')} onClick={() => setRange(v)}>{l}</button>))}
      </div>
      {range === 'custom' && <div className="row-actions">
        <input type="date" aria-label="Từ ngày" value={cFrom} onChange={e => setCFrom(e.target.value)} style={{ width: 'auto' }} />
        <span>đến</span><input type="date" aria-label="Đến ngày" value={cTo} onChange={e => setCTo(e.target.value)} style={{ width: 'auto' }} />
      </div>}
      <div className="sub">Từ {dmy(from)} đến {dmy(to)}{loading ? ' · đang tải…' : ''}</div>

      <div className="tiles">
        <Tile kind="main" k="Lãi ròng ước tính" v={money(t.net)} s={t.revenue ? `${Math.round(t.net / (t.revenue + t.service) * 100)}% doanh thu` : ''} />
        <Tile k="Doanh thu" v={money(t.revenue + t.service)} s={`${t.orders} dòng bán · chế biến/ship ${short(t.service)}`} />
        <Tile k="Giá vốn hàng bán" v={money(t.cogs)} s={`lãi gộp ${short(gross)}${t.revenue ? ` (${Math.round(gross / t.revenue * 100)}%)` : ''}`} />
        <Tile kind="out" k="Hao hụt + chi phí" v={money(t.loss + t.other_out)} s={`hao ${short(t.loss)} · chi ${short(t.other_out)}`} />
        <Tile kind="in" k="Tiền thực vào" v={money(cashIn)} />
        <Tile kind="out" k="Tiền thực ra" v={money(cashOut)} s={`nhập hàng + cước ${short(t.purchases + t.freight)}`} />
      </div>

      <div className="card">
        <b>Doanh thu, nhập hàng và lãi theo ngày</b>
        {best && N(best.net) > 0 && <div className="sub">Ngày lãi nhiều nhất: {dow(best.day)} {dm(best.day)}, {money(best.net)}</div>}
        <div style={{ width: '100%', height: 260, marginTop: 8 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis tickFormatter={v => short(v as number)} tick={{ fill: 'var(--muted)', fontSize: 11 }} width={48} />
              <Tooltip formatter={v => money(v as number)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Doanh thu" fill="var(--sea)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Nhập hàng" fill="var(--coral)" radius={[3, 3, 0, 0]} />
              <Line dataKey="Lãi ròng" stroke="var(--good)" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card"><b>Lời lỗ theo món</b><div className="tw">
        {!prods.length ? <Empty>Chưa có bán hàng trong khoảng này.</Empty> : (
          <table><thead><tr><th>Món</th><th className="r">Kg bán</th><th className="r">Doanh thu</th><th className="r">Giá vốn</th><th className="r">Hao</th><th className="r">Lãi</th><th className="r">%</th></tr></thead>
            <tbody>{prods.map(p => {
              const g = N(p.revenue) - N(p.cogs) - N(p.loss)
              return (<tr key={p.product_id}>
                <td><b>{cap(p.name)}</b>{!p.has_cost && N(p.revenue) > 0 && <> <span className="pill p-warn">chưa có giá vốn</span></>}</td>
                <td className="r">{kg(p.qty)}</td><td className="r">{short(p.revenue)}</td><td className="r">{short(p.cogs)}</td>
                <td className="r">{N(p.loss) ? short(p.loss) : ''}</td>
                <td className="r"><b className={g >= 0 ? 'good' : 'bad'}>{short(g)}</b></td>
                <td className="r">{N(p.revenue) && p.has_cost ? Math.round(g / N(p.revenue) * 100) + '%' : ''}</td></tr>)
            })}</tbody></table>)}
        {noCost.length > 0 && <p className="note" style={{ marginTop: 10 }}>{noCost.map(p => cap(p.name)).join(', ')} chưa có phiếu nhập nên giá vốn tạm tính 0đ, lãi đang cao hơn thực tế.</p>}
      </div></div>

      <div className="grid2">
        <div className="card"><b>Khách mua nhiều</b><div className="tw">{!cust.length ? <Empty>Chưa ghi tên khách.</Empty> :
          <table><tbody>{cust.map(([id, v, n]) => <tr key={id}><td>{cap(partnerName(id))}</td><td className="r sub">{n} lần</td><td className="r"><b>{money(v)}</b></td></tr>)}</tbody></table>}</div></div>
        <div className="card"><b>Tiền nhập theo mối hàng</b><div className="tw">{!sup.length ? <Empty>Chưa có nhập hàng.</Empty> :
          <table><tbody>{sup.map(([id, v, n]) => <tr key={id || 'x'}><td>{id ? cap(partnerName(id)) : '(chưa ghi mối)'}</td><td className="r sub">{n} lần</td><td className="r"><b>{money(v)}</b></td></tr>)}</tbody></table>}</div></div>
      </div>

      <div className="card"><b>Từng ngày</b> <span className="sub">· bấm để mở sổ ngày đó</span><div className="tw">
        <table><thead><tr><th>Ngày</th><th className="r">Doanh thu</th><th className="r">Giá vốn</th><th className="r">Nhập hàng</th><th className="r">Chi khác</th><th className="r">Lãi ròng</th></tr></thead>
          <tbody>{days.filter(d => N(d.revenue) || N(d.purchases) || N(d.other_out)).reverse().map(d => (
            <tr key={d.day} className="click" onClick={() => { setDay(d.day); navigate('/') }}>
              <td><b>{dow(d.day)} {dm(d.day)}</b></td><td className="r">{short(N(d.revenue) + N(d.service))}</td><td className="r">{short(d.cogs)}</td>
              <td className="r">{short(N(d.purchases) + N(d.freight))}</td><td className="r">{short(d.other_out)}</td>
              <td className="r"><b className={N(d.net) >= 0 ? 'good' : 'bad'}>{short(d.net)}</b></td></tr>))}</tbody></table>
      </div></div>
      <p className="sub">Lãi ròng = doanh thu − giá vốn (giá nhập bình quân gồm cước) + chế biến/ship + thu khác − hao hụt − chi phí khác. Tiền nhập hàng không trừ thẳng vào lãi vì hàng còn tồn trong kho.</p>
    </>
  )
}
