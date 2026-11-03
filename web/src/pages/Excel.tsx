import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dm, dmy, kg, money, parseMoney, today, addDays } from '../lib/format'
import { parseSheets, suspiciousPrices, type ImportResult } from '../lib/excel'
import type { CashEntry, Purchase, Sale, StockAdj } from '../lib/types'
import { MoneyInput } from '../components/ui'

const CHUNK = 500

export default function Excel() {
  const app = useApp()
  const { shop, productName, partnerName } = app
  const [res, setRes] = useState<ImportResult | null>(null)
  const [fix, setFix] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(addDays(today(), -30))
  const [to, setTo] = useState(today())
  const [dup, setDup] = useState<{ sales: number; buys: number; days: string[] } | null>(null)

  // Kiểm tra các ngày trong file đã từng nhập từ Excel chưa, tránh nạp trùng
  const checkDup = async (r: ImportResult) => {
    setDup(null)
    if (!shop) return
    const days = (rows: { date: string }[]) => [...new Set(rows.map(x => x.date))]
    const count = async (t: string, d: string[]) => {
      if (!d.length) return []
      const rows = await must(supabase.from(t).select('date').eq('shop_id', shop.id).eq('note', 'nhập từ Excel').in('date', d).limit(5000)) as { date: string }[]
      return rows.map(x => x.date)
    }
    const [s, p] = await Promise.all([count('sales', days(r.sales)), count('purchases', days(r.purchases))])
    if (s.length || p.length) setDup({ sales: s.length, buys: p.length, days: [...new Set([...s, ...p])].sort() })
  }

  const read = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const sheets: Record<string, (string | number | Date | null)[][]> = {}
      wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) })
      const r = parseSheets(sheets, new Date().getFullYear()); setRes(r); setFix({}); void checkDup(r).catch(() => setDup(null))
    } catch { app.toast('Không đọc được file. Hãy chọn file .xlsx') }
  }

  const suspPurch = res ? suspiciousPrices(res.purchases) : []
  const flagged = res ? [
    ...suspiciousPrices(res.sales).map(r => ({ key: 's' + res.sales.indexOf(r), kind: 'Bán', r })),
    ...res.purchases.filter(r => r.total_price || suspPurch.includes(r)).map(r => ({ key: 'p' + res.purchases.indexOf(r), kind: 'Nhập', r })),
  ] : []

  const doImport = async () => {
    if (!shop || !res) return
    setBusy(true)
    try {
      const pid = new Map<string, string>(), cid = new Map<string, string | null>(), sid = new Map<string, string | null>()
      for (const n of new Set([...res.sales.map(s => s.product), ...res.purchases.map(p => p.product)])) pid.set(n, await app.ensureProduct(n))
      for (const n of new Set(res.sales.map(s => s.customer))) cid.set(n, await app.ensurePartner('customer', n))
      for (const n of new Set(res.purchases.map(p => p.supplier))) sid.set(n, await app.ensurePartner('supplier', n))
      const price = (key: string, v: number) => (fix[key] ? parseMoney(fix[key]) || v : v)
      const sales = res.sales.map((s, i) => ({ shop_id: shop.id, date: s.date, product_id: pid.get(s.product), customer_id: cid.get(s.customer) ?? null,
        qty: s.qty, unit_price: price('s' + i, s.unit_price), processing_fee: s.processing_fee, shipping_fee: s.shipping_fee, note: 'nhập từ Excel' }))
      const buys = res.purchases.map((p, i) => ({ shop_id: shop.id, date: p.date, product_id: pid.get(p.product), supplier_id: sid.get(p.supplier) ?? null,
        qty: p.qty, unit_price: price('p' + i, p.unit_price), freight: p.freight, size: p.size || null, note: 'nhập từ Excel' }))
      for (let i = 0; i < buys.length; i += CHUNK) await must(supabase.from('purchases').insert(buys.slice(i, i + CHUNK)))
      for (let i = 0; i < sales.length; i += CHUNK) await must(supabase.from('sales').insert(sales.slice(i, i + CHUNK)))
      app.toast(`Đã nhập ${sales.length} dòng bán, ${buys.length} dòng nhập`); setRes(null); setDup(null)
    } catch (e) { app.fail(e) } finally { setBusy(false) }
  }

  const doExport = async () => {
    if (!shop) return
    setBusy(true)
    try {
      const q = <T,>(t: string) => must(supabase.from(t).select('*').eq('shop_id', shop.id).gte('date', from).lte('date', to).order('date').order('created_at').limit(50000)) as Promise<T[]>
      const [s, p, c, a] = await Promise.all([q<Sale>('sales'), q<Purchase>('purchases'), q<CashEntry>('cash_entries'), q<StockAdj>('stock_adjustments')])
      const [pnl, costs] = await Promise.all([
        must(supabase.rpc('daily_pnl', { p_shop: shop.id, p_from: from, p_to: to })) as Promise<Record<string, number | string>[]>,
        must(supabase.rpc('product_costs', { p_shop: shop.id })) as Promise<{ product_id: string; avg_cost: number | null }[]>,
      ])
      const cost = new Map(costs.map(x => [x.product_id, Number(x.avg_cost) || 0]))
      const pay = (x: { paid: boolean; pay_method: string }) => !x.paid ? 'Nợ' : x.pay_method === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'
      const r2 = (n: number) => Math.round(n * 100) / 100
      // Gom theo ngày + tên hàng
      type Row = { buyKg: number; buy: number; sellKg: number; rev: number; lossKg: number }
      const blank = (): Row => ({ buyKg: 0, buy: 0, sellKg: 0, rev: 0, lossKg: 0 })
      const byDay = new Map<string, Map<string, Row>>(), byProd = new Map<string, Row>()
      const bump = (date: string, pid: string, f: (r: Row) => void) => {
        if (!byDay.has(date)) byDay.set(date, new Map())
        const d = byDay.get(date)!
        if (!d.has(pid)) d.set(pid, blank())
        if (!byProd.has(pid)) byProd.set(pid, blank())
        f(d.get(pid)!); f(byProd.get(pid)!)
      }
      s.forEach(x => bump(x.date, x.product_id, r => { r.sellKg += +x.qty; r.rev += +x.qty * +x.unit_price }))
      p.forEach(x => bump(x.date, x.product_id, r => { r.buyKg += +x.qty; r.buy += +x.qty * +x.unit_price + +x.freight }))
      a.forEach(x => bump(x.date, x.product_id, r => { r.lossKg += +x.qty }))
      const nameOf = (pid: string) => cap(productName(pid))
      const sortByName = (m: Map<string, Row>) => [...m.entries()].sort((x, y) => y[1].rev - x[1].rev || nameOf(x[0]).localeCompare(nameOf(y[0]), 'vi'))
      const soldList = (day: string) => sortByName(byDay.get(day) || new Map()).filter(([, r]) => r.sellKg).map(([pid, r]) => `${nameOf(pid)} ${kg(r.sellKg)}kg`).join(', ')
      const prodCols = (pid: string, r: Row) => {
        const cogs = Math.round(r.sellKg * (cost.get(pid) || 0))
        return [nameOf(pid), r2(r.buyKg), Math.round(r.buy), r2(r.sellKg), Math.round(r.rev), cogs, Math.round(r.rev) - cogs]
      }
      const wb = XLSX.utils.book_new()
      const add = (name: string, rows: (string | number | null)[][], wide: Record<number, number> = {}) => {
        const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: wide[i] || 14 })); XLSX.utils.book_append_sheet(wb, ws, name)
      }
      add('Tổng hợp ngày', [['Ngày', 'Tên hàng đã bán', 'Doanh thu', 'Chế biến + ship', 'Giá vốn', 'Hao hụt', 'Thu khác', 'Chi khác', 'Nhập hàng', 'Cước', 'Lãi ròng'],
        ...pnl.filter(d => Number(d.revenue) || Number(d.purchases) || Number(d.other_out)).map(d => [dmy(String(d.day)), soldList(String(d.day)), Math.round(+d.revenue), +d.service, Math.round(+d.cogs), Math.round(+d.loss), +d.other_in, +d.other_out, Math.round(+d.purchases), +d.freight, Math.round(+d.net)])],
        { 1: 50 })
      const head = ['Tên hàng', 'Kg nhập', 'Tiền nhập (gồm cước)', 'Kg bán', 'Doanh thu', 'Giá vốn', 'Lãi gộp']
      add('Theo ngày + tên hàng', [['Ngày', ...head],
        ...[...byDay.keys()].sort().flatMap(day => sortByName(byDay.get(day)!).filter(([, r]) => r.buyKg || r.sellKg).map(([pid, r]) => [dmy(day), ...prodCols(pid, r)]))],
        { 1: 22 })
      add('Tổng theo tên hàng', [[...head, 'Hao hụt kg'],
        ...sortByName(byProd).map(([pid, r]) => [...prodCols(pid, r), r2(r.lossKg)])],
        { 0: 22 })
      add('Bán hàng', [['Ngày', 'Khách', 'Tên hàng', 'Size', 'Số kg', 'Đơn giá', 'Thành tiền', 'Chế biến', 'Ship', 'Thanh toán', 'Ngày trả', 'Ghi chú'],
        ...s.map(x => [dmy(x.date), cap(partnerName(x.customer_id)), cap(productName(x.product_id)), x.size, +x.qty, +x.unit_price, Math.round(+x.qty * +x.unit_price), +x.processing_fee, +x.shipping_fee, pay(x), x.paid_at ? dmy(x.paid_at) : '', x.note])])
      add('Nhập hàng', [['Ngày', 'Tên hàng', 'Size', 'Số kg', 'Giá/kg', 'Thành tiền', 'Cước xe + bãi', 'Mối hàng', 'Thanh toán', 'Ngày trả', 'Ghi chú'],
        ...p.map(x => [dmy(x.date), cap(productName(x.product_id)), x.size, +x.qty, +x.unit_price, Math.round(+x.qty * +x.unit_price), +x.freight, cap(partnerName(x.supplier_id)), pay(x), x.paid_at ? dmy(x.paid_at) : '', x.note])])
      add('Thu chi khác', [['Ngày', 'Loại', 'Khoản', 'Số tiền', 'Hình thức', 'Ghi chú'],
        ...c.map(x => [dmy(x.date), x.direction === 'in' ? 'Thu' : 'Chi', cap(x.category), +x.amount, x.pay_method === 'bank' ? 'Chuyển khoản' : 'Tiền mặt', x.note])])
      add('Hao hụt', [['Ngày', 'Tên hàng', 'Kg', 'Ghi chú'], ...a.map(x => [dmy(x.date), cap(productName(x.product_id)), +x.qty, x.note])])
      XLSX.writeFile(wb, `so-hai-san-${from}-den-${to}.xlsx`)
    } catch (e) { app.fail(e) } finally { setBusy(false) }
  }

  return (
    <>
      <h1>Nhập / xuất Excel</h1>
      <div className="card stack">
        <b>Chuyển sổ Excel cũ vào app</b>
        <span className="sub">Nhận mẫu file nhập hàng (ngày, tên hàng, size, thành tiền, số lượng, cước xe + bãi, giá/kg, tên nguồn) và file bán hàng (ngày, tên khách, tên sản phẩm, số lượng, đơn giá, tiền chế biến, tiền ship). Ô trống được hiểu là giống dòng trên.</span>
        <input type="file" accept=".xlsx,.xls" aria-label="Chọn file Excel" onChange={e => e.target.files?.[0] && void read(e.target.files[0])} />
        {res && (
          <div className="stack">
            <div>Tìm thấy <b>{res.sales.length}</b> dòng bán và <b>{res.purchases.length}</b> dòng nhập
              {(() => { const d = [...new Set([...res.sales, ...res.purchases].map(x => x.date))].sort(); return d.length ? `, từ ${dm(d[0])} đến ${dm(d[d.length - 1])}` : '' })()}.
              {res.skipped > 0 && <span className="sub"> Bỏ qua {res.skipped} dòng thiếu số lượng hoặc giá.</span>}</div>
            <div className="sub">{res.sheets.join(' · ')}</div>
            {flagged.length > 0 && (
              <div className="note stack">
                <b>Các dòng giá lệch nhiều so với bình thường, có thể gõ nhầm. Sửa giá nếu cần (gõ theo nghìn):</b>
                {flagged.map(({ key, kind, r }) => (
                  <div key={key} className="row-actions">
                    <span style={{ flex: 1, minWidth: 180 }}>{kind} {dm(r.date)}: {cap(r.product)} {kg(r.qty)}kg × {money(r.unit_price)}
                      {'total_price' in r && r.total_price ? <span className="sub"> · cột thành tiền ÷ kg ra {money(r.total_price)}/kg, có thể sai giá hoặc sai số kg</span> : null}</span>
                    <MoneyInput aria-label="Giá đúng" placeholder="giá đúng" style={{ width: 120 }} value={fix[key] || ''} onChange={e => setFix({ ...fix, [key]: e.target.value })} />
                  </div>))}
              </div>)}
            {dup && (
              <div className="note stack">
                <b>File này có vẻ đã nhập rồi.</b>
                <span>Các ngày {dup.days.map(dm).join(', ')} đã có {dup.sales ? `${dup.sales} dòng bán` : ''}{dup.sales && dup.buys ? ' và ' : ''}{dup.buys ? `${dup.buys} dòng nhập` : ''} từ Excel. Nhập nữa thì số liệu sẽ bị cộng 2 lần. Chỉ bấm "Vẫn nhập" nếu đây là dòng mới thật.</span>
              </div>)}
            <div className="row-actions"><button type="button" className={dup ? 'btn danger' : 'btn'} disabled={busy || !(res.sales.length + res.purchases.length)} onClick={() => void doImport()}>{busy ? 'Đang nhập…' : dup ? 'Vẫn nhập' : 'Nhập vào sổ'}</button>
              <button type="button" className="btn ghost" onClick={() => { setRes(null); setDup(null) }}>Hủy</button></div>
            <p className="sub" style={{ margin: 0 }}>Các dòng cũ được tính là đã trả tiền mặt. Nếu khách còn nợ, mở ngày đó và sửa lại.</p>
          </div>)}
      </div>
      <div className="card stack">
        <b>Xuất sổ ra Excel</b>
        <div className="row-actions">
          <input type="date" aria-label="Từ ngày" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} /> đến
          <input type="date" aria-label="Đến ngày" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto' }} />
          <button type="button" className="btn" disabled={busy} onClick={() => void doExport()}>Tải file Excel</button>
        </div>
      </div>
    </>
  )
}
