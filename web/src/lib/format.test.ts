import { describe, expect, it } from 'vitest'
import { parseMoney, parseNum, short } from './format'
import { parseDateCell, parseSheets, suspiciousPrices } from './excel'

describe('đọc số', () => {
  it('kg kiểu Việt', () => { expect(parseNum('1,5')).toBe(1.5); expect(parseNum('0.45')).toBe(0.45) })
  it('tiền gõ tắt theo nghìn', () => { expect(parseMoney('270')).toBe(270000); expect(parseMoney('1.234.000')).toBe(1234000); expect(parseMoney('45000')).toBe(45000) })
  it('rút gọn', () => { expect(short(12_184_700)).toBe('12,2 tr'); expect(short(95000)).toBe('95k') })
})

describe('đọc ngày trong sổ', () => {
  it('các kiểu ghi', () => {
    expect(parseDateCell('30\\10', null, 2026)).toBe('2026-10-30')
    expect(parseDateCell('2 tháng 11', null, 2026)).toBe('2026-11-02')
    expect(parseDateCell('31/10 ', null, 2026)).toBe('2026-10-31')
  })
  it('Excel hiểu nhầm 1/11 thành 11 tháng 1', () => {
    expect(parseDateCell(new Date(2026, 0, 11), '2026-10-31', 2026)).toBe('2026-11-01')
  })
})

describe('đọc file sổ cũ', () => {
  it('file nguồn: ngày và mối hàng kéo xuống, tính giá từ thành tiền', () => {
    const r = parseSheets({ Sheet2: [
      ['ngày', 'tên hàng ', 'size', 'thành tiền', 'số lượng', 'cước xe + bãi', 'giá/kg', 'tên  nguồn'],
      ['30/10', 'ốc hương ', '140 con', 1350000, 10, 20000, '=D2/E2', 'hân vỏ'],
      [null, null, '100 con', 825000, 5, null, 165000, null],
    ] }, 2026)
    expect(r.purchases).toHaveLength(2)
    expect(r.purchases[0]).toMatchObject({ date: '2026-10-30', product: 'ốc hương', supplier: 'hân vỏ', unit_price: 135000, freight: 20000 })
    expect(r.purchases[1]).toMatchObject({ supplier: 'hân vỏ', unit_price: 165000 })
  })
  it('file đã bán: bỏ dòng tổng, khách lẻ', () => {
    const r = parseSheets({ Sheet2: [
      ['Ngày', 'tên hàng ', 'tên sản phẩm', 'số lượng', 'đơn giá', 'thành tiền', 'tiền chế biến', 'tiền ship'],
      ['31/10', 'mai lan', 'ốc hương', 1.5, 270000, null, null, null],
      [null, 'khach  ', 'sò lông', 1, 100000, null, 20000, 10000],
      ['Tổng 31/10/2026', null, null, null, null, 0, null, null],
    ] }, 2026)
    expect(r.sales).toHaveLength(2)
    expect(r.sales[1]).toMatchObject({ customer: '', processing_fee: 20000, shipping_fee: 10000 })
  })
  it('báo dòng nhập có giá/kg không khớp thành tiền', () => {
    const r = parseSheets({ S: [
      ['ngày', 'tên hàng', 'thành tiền', 'số lượng', 'giá/kg', 'tên nguồn'],
      ['30/10', 'lụa đỏ', 648000, 7.2, 900000, 'x'],
    ] }, 2026)
    expect(r.purchases[0].total_price).toBe(90000)
  })
  it('báo giá nghi gõ nhầm', () => {
    const rows = [95000, 110000, 110000, 950000].map(p => ({ product: 'sò lông', unit_price: p }))
    expect(suspiciousPrices(rows)).toEqual([{ product: 'sò lông', unit_price: 950000 }])
  })
})
