import { describe, expect, it } from 'vitest'
import { alreadyIn, saleKey } from './excel'

const s = (date: string, product: string, qty: number) => ({ date, product, customer: 'Chị Lan', qty, unit_price: 100000, processing_fee: 0, shipping_fee: 0 })

describe('alreadyIn', () => {
  it('chỉ bỏ qua đúng số dòng đã nạp, kể cả dòng giống hệt nhau', () => {
    const file = [s('2026-11-01', 'Ghẹ', 1), s('2026-11-01', 'Ghẹ', 1), s('2026-11-02', 'Tôm', 2), s('2026-11-03', 'Mực', 1)]
    const existing = [saleKey({ ...s('2026-11-01', ' ghẹ ', 1), customer: 'chị  lan' }), saleKey({ ...s('2026-11-02', 'tôm', 2), qty: '2.000' as unknown as number })]
    expect([...alreadyIn(file, existing, saleKey)]).toEqual([0, 2])
  })
})
