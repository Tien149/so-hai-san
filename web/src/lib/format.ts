// Định dạng và đọc số theo thói quen ở chợ: "270" nghĩa là 270.000đ, "1,5" là 1.5 kg

const nf = new Intl.NumberFormat('vi-VN')

export const money = (n: number | null | undefined) => nf.format(Math.round(Number(n) || 0)) + 'đ'
export const plain = (n: number | null | undefined) => nf.format(Math.round(Number(n) || 0))

export function short(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0)
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' tỷ'
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' tr'
  if (a >= 1e3) return Math.round(v / 1e3) + 'k'
  return String(v)
}

export const kg = (n: number | null | undefined) =>
  (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })

/** Đọc số người dùng gõ: "1,5" → 1.5, "1.234.000" → 1234000 */
export function parseNum(input: unknown): number {
  if (input == null) return NaN
  if (typeof input === 'number') return input
  let s = String(input).trim().replace(/\s/g, '')
  if (!s) return NaN
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  else if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Đọc tiền: số dưới 1000 hiểu là nghìn đồng ("270" → 270000) */
export function parseMoney(input: unknown): number {
  const n = parseNum(input)
  if (!Number.isFinite(n)) return NaN
  return n > 0 && n < 1000 ? Math.round(n * 1000) : Math.round(n)
}

/** Hiển thị tiền ở ô nhập, có chấm hàng nghìn: 270000 → "270.000" */
export const toThousand = (n: number | null | undefined) => (n ? groupDigits(String(Math.round(n))) : '')

/** Giữ lại chữ số và chấm phân cách hàng nghìn: "270000" → "270.000" */
export function groupDigits(input: string): string {
  const d = String(input).replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export const normName = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
export const cap = (s: unknown) => String(s ?? '').replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => isoDate(new Date())
export function addDays(iso: string, k: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + k)
  return isoDate(d)
}
export const dm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
export const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
export const dow = (iso: string) => DOW[new Date(iso + 'T12:00:00').getDay()]
export const dateTime = (ts: string) => {
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
