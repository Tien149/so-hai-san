// Đọc file Excel sổ tay cũ (mẫu "nguồn" và "đã bán") thành các dòng nhập/bán.
import { normName, parseNum } from './format'

export interface ImportedPurchase { date: string; product: string; supplier: string; size: string; qty: number; unit_price: number; freight: number
  /** giá tính từ cột thành tiền ÷ số lượng, khi lệch với cột giá/kg */
  total_price?: number }
export interface ImportedSale { date: string; product: string; customer: string; qty: number; unit_price: number; processing_fee: number; shipping_fee: number }
export interface ImportResult { purchases: ImportedPurchase[]; sales: ImportedSale[]; sheets: string[]; skipped: number }

type Cell = string | number | boolean | Date | null | undefined
const pad = (n: number) => String(n).padStart(2, '0')

/** Đọc ô ngày: "30/10", "30\10", "2 tháng 11", Date (kể cả Excel hiểu nhầm 1/11 thành 11/1) */
export function parseDateCell(v: Cell, prev: string | null, year: number): string | null {
  const mk = (d: number, m: number, y?: number) =>
    d >= 1 && d <= 31 && m >= 1 && m <= 12 ? `${y || year}-${pad(m)}-${pad(d)}` : null
  const nearest = (cands: (string | null)[]) => {
    const list = cands.filter(Boolean) as string[]
    if (!prev || list.length < 2) return list[0] || null
    return list.reduce((best, c) =>
      Math.abs(+new Date(c) - +new Date(prev)) < Math.abs(+new Date(best) - +new Date(prev)) ? c : best)
  }
  if (v instanceof Date) {
    return nearest([mk(v.getDate(), v.getMonth() + 1, v.getFullYear()), mk(v.getMonth() + 1, v.getDate(), v.getFullYear())])
  }
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Math.round((v - 25569) * 864e5))
    return parseDateCell(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), prev, year)
  }
  const s = String(v ?? '').replace(/\\/g, '/').trim()
  const m = s.match(/(\d{1,2})\s*tháng\s*(\d{1,2})(?:\D+(\d{4}))?/i) || s.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/)
  if (!m) return null
  const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : undefined
  return mk(Number(m[1]), Number(m[2]), y)
}

function findCols(header: Cell[], spec: Record<string, string[]>) {
  const h = header.map(c => normName(c))
  const out: Record<string, number> = {}
  for (const k in spec) out[k] = h.findIndex(x => spec[k].some(t => x.includes(t)))
  return out
}

/** rowsBySheet: mỗi sheet là mảng dòng (mảng ô), như XLSX.utils.sheet_to_json(ws, {header: 1}) */
export function parseSheets(rowsBySheet: Record<string, Cell[][]>, year: number): ImportResult {
  const res: ImportResult = { purchases: [], sales: [], sheets: [], skipped: 0 }
  for (const [name, rows] of Object.entries(rowsBySheet)) {
    const hi = rows.findIndex(r => r?.some(c => /ngày/i.test(String(c ?? ''))))
    if (hi < 0) continue
    const H = rows[hi]
    const text = H.map(c => String(c ?? '')).join('|')
    const isBuy = /nguồn|cước/i.test(text)
    const isSale = /đơn giá|sản phẩm/i.test(text)
    if (!isBuy && !isSale) continue
    let date: string | null = null
    let count = 0
    const body = rows.slice(hi + 1)
    if (isBuy) {
      const ix = findCols(H, { d: ['ngày'], p: ['tên hàng', 'loại hàng'], size: ['size'], tt: ['thành tiền'], qty: ['số lượng'], fr: ['cước'], g: ['giá/kg', 'giá nhập'], src: ['nguồn'] })
      let product = '', supplier = ''
      for (const r of body) {
        if (!r) continue
        const dv = r[ix.d]
        if (dv != null && String(dv).trim()) { if (/tổng/i.test(String(dv))) continue; date = parseDateCell(dv, date, year) || date }
        if (ix.p >= 0 && r[ix.p]) product = normName(r[ix.p])
        if (ix.src >= 0 && r[ix.src]) supplier = normName(r[ix.src])
        const qty = parseNum(r[ix.qty])
        if (!date || !product || !Number.isFinite(qty) || qty <= 0) { if (r.some(c => c != null && c !== '')) res.skipped++; continue }
        let price = ix.g >= 0 ? parseNum(r[ix.g]) : NaN
        const tt = ix.tt >= 0 ? parseNum(r[ix.tt]) : NaN
        if (!Number.isFinite(price) && Number.isFinite(tt)) price = Math.round(tt / qty)
        if (!Number.isFinite(price)) { res.skipped++; continue }
        let size = ix.size >= 0 && r[ix.size] != null ? String(r[ix.size]).trim() : ''
        if (normName(size) === product) size = ''
        const row: ImportedPurchase = { date, product, supplier, size, qty, unit_price: Math.round(price), freight: parseNum(r[ix.fr]) || 0 }
        if (Number.isFinite(tt) && tt > 0 && Math.abs(tt / qty - price) / price > 0.05) row.total_price = Math.round(tt / qty)
        res.purchases.push(row)
        count++
      }
    } else {
      const ix = findCols(H, { d: ['ngày'], c: ['tên hàng', 'khách'], p: ['sản phẩm'], qty: ['số lượng'], g: ['đơn giá'], cb: ['chế biến'], sh: ['ship'] })
      for (const r of body) {
        if (!r) continue
        const dv = r[ix.d]
        if (dv != null && String(dv).trim()) { if (/tổng/i.test(String(dv))) continue; date = parseDateCell(dv, date, year) || date }
        const product = ix.p >= 0 ? normName(r[ix.p]) : ''
        const qty = parseNum(r[ix.qty]), price = parseNum(r[ix.g])
        if (!date || !product || !(qty > 0) || !(price > 0)) { if (product) res.skipped++; continue }
        const cu = ix.c >= 0 ? normName(r[ix.c]) : ''
        res.sales.push({
          date, product, customer: /^kh[aá]ch$/.test(cu) ? '' : cu, qty, unit_price: Math.round(price),
          processing_fee: parseNum(r[ix.cb]) || 0, shipping_fee: parseNum(r[ix.sh]) || 0,
        })
        count++
      }
    }
    res.sheets.push(`${name}: ${isBuy ? 'nhập hàng' : 'bán hàng'}, ${count} dòng`)
  }
  return res
}

/** Phát hiện giá nghi gõ nhầm: lệch quá 4 lần so với giá trung vị cùng món */
export function suspiciousPrices<T extends { product: string; unit_price: number }>(rows: T[]): T[] {
  const by = new Map<string, number[]>()
  rows.forEach(r => { const a = by.get(r.product) || []; a.push(r.unit_price); by.set(r.product, a) })
  const med = new Map<string, number>()
  by.forEach((a, k) => { const s = [...a].sort((x, y) => x - y); med.set(k, s[Math.floor(s.length / 2)]) })
  return rows.filter(r => { const m = med.get(r.product)!; return by.get(r.product)!.length >= 3 && (r.unit_price > m * 4 || r.unit_price * 4 < m) })
}
