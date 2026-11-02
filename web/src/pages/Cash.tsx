import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, dm, kg, money, parseMoney } from '../lib/format'
import { purchaseAmount, saleTotal, type CashEntry, type CashFlow, type PartnerKind, type PayMethod, type Purchase, type Sale } from '../lib/types'
import { ConfirmButton, Empty, Seg, Tile, useLive } from '../components/ui'

const CATS = ['đá lạnh', 'bao bì, túi', 'điện nước', 'lương nhân viên', 'mặt bằng', 'xăng xe', 'trả tiền ship', 'gas', 'thu khác']

export default function Cash() {
  const app = useApp()
  const { shop, day, isManager, productName, partnerName } = app
  const [flow, setFlow] = useState<CashFlow | null>(null)
  const [drawer, setDrawer] = useState<number | null>(null)
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [debtS, setDebtS] = useState<Sale[]>([])
  const [debtP, setDebtP] = useState<Purchase[]>([])
  const [dir, setDir] = useState<'out' | 'in'>('out')
  const [pay, setPay] = useState<PayMethod>('cash')
  const [cat, setCat] = useState('')
  const [amt, setAmt] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!shop) return
    try {
      const [f, all, e, s, p] = await Promise.all([
        must(supabase.rpc('cash_flow', { p_shop: shop.id, p_from: day, p_to: day })),
        must(supabase.rpc('cash_flow', { p_shop: shop.id, p_from: '2000-01-01', p_to: day })),
        must(supabase.from('cash_entries').select('*').eq('shop_id', shop.id).eq('date', day).order('created_at')),
        must(supabase.from('sales').select('*').eq('shop_id', shop.id).eq('paid', false).order('date')),
        must(supabase.from('purchases').select('*').eq('shop_id', shop.id).eq('paid', false).order('date')),
      ])
      const F = (f as CashFlow[])[0] || null, A = (all as CashFlow[])[0]
      setFlow(F); setDrawer(A ? Number(shop.opening_cash) + Number(A.cash_in) - Number(A.cash_out) : null)
      setEntries(e as CashEntry[]); setDebtS(s as Sale[]); setDebtP(p as Purchase[])
    } catch (e) { app.fail(e) }
  }, [shop, day]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (location.hash === '#cong-no') setTimeout(() => document.getElementById('cong-no')?.scrollIntoView({ behavior: 'smooth' }), 400) }, [])
  useLive(shop?.id, ['sales', 'purchases', 'cash_entries'], load)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const a = parseMoney(amt)
    if (!shop) return
    if (!cat.trim()) { app.toast('Nhập khoản thu chi'); return }
    if (!(a > 0)) { app.toast('Nhập số tiền'); return }
    try {
      await must(supabase.from('cash_entries').insert({ shop_id: shop.id, date: day, direction: dir, category: cat.trim().toLowerCase(), amount: a, pay_method: pay, note: note.trim() || null }))
      app.toast(`Đã ghi ${dir === 'in' ? 'thu' : 'chi'} ${money(a)}`); setCat(''); setAmt(''); setNote(''); await load()
    } catch (e) { app.fail(e) }
  }
  const del = async (id: string) => {
    try {
      const { data, error } = await supabase.from('cash_entries').delete().eq('id', id).select()
      if (error) throw error
      if (!data?.length) throw new Error('Bạn không có quyền xóa dòng này')
      app.toast('Đã xóa'); await load()
    } catch (e) { app.fail(e) }
  }
  const settle = async (kind: PartnerKind, partner: string | null, method: PayMethod) => {
    if (!shop) return
    try {
      const n = await must(supabase.rpc('settle_debt', { p_shop: shop.id, p_partner: partner, p_kind: kind, p_method: method, p_date: day }))
      app.toast(`Đã ghi trả xong ${n} dòng, ngày ${dm(day)}`); await load()
    } catch (e) { app.fail(e) }
  }

  const groups = useMemo(() => {
    const g = <T extends { date: string }>(rows: T[], key: (r: T) => string | null, val: (r: T) => number) => {
      const m = new Map<string, { id: string | null; rows: T[]; sum: number }>()
      rows.forEach(r => { const k = key(r) || ''; const x = m.get(k) || { id: key(r), rows: [], sum: 0 }; x.rows.push(r); x.sum += val(r); m.set(k, x) })
      return [...m.values()].sort((a, b) => b.sum - a.sum)
    }
    return { c: g(debtS, s => s.customer_id, saleTotal), s: g(debtP, p => p.supplier_id, purchaseAmount) }
  }, [debtS, debtP])

  const F = flow
  const totalIn = F ? Number(F.sales_cash) + Number(F.sales_bank) + Number(F.debt_collected) + Number(F.other_in_cash) + Number(F.other_in_bank) : 0
  const totalOut = F ? Number(F.purchases_cash) + Number(F.purchases_bank) + Number(F.freight) + Number(F.debt_paid) + Number(F.other_out_cash) + Number(F.other_out_bank) : 0
  const line = (k: string, v: number) => v ? <><div>{k}</div><div className="r">{money(v)}</div></> : null

  return (
    <>
      <div className="tiles">
        <Tile kind="in" k={`Tiền vào ${dm(day)}`} v={money(totalIn)} />
        <Tile kind="out" k={`Tiền ra ${dm(day)}`} v={money(totalOut)} />
        <Tile kind="main" k="Chênh lệch trong ngày" v={money(totalIn - totalOut)} />
        <Tile k="Tiền mặt theo sổ" v={drawer == null ? '…' : money(drawer)} s={Number(shop?.opening_cash) ? 'gồm tiền ban đầu' : 'chưa nhập tiền ban đầu (Thêm → Cài đặt quán)'} />
      </div>
      <div className="grid2">
        <div className="card"><h2 style={{ margin: '0 0 8px' }}>Dòng tiền ngày {dm(day)}</h2>
          {F && <div className="cf">
            <div className="h">Tiền vào</div><div></div>
            {line('Bán hàng, tiền mặt', Number(F.sales_cash))}{line('Bán hàng, chuyển khoản', Number(F.sales_bank))}
            {line('Khách trả nợ', Number(F.debt_collected))}{line('Thu khác', Number(F.other_in_cash) + Number(F.other_in_bank))}
            <div className="tot">Tổng vào</div><div className="r tot good">{money(totalIn)}</div>
            <div className="h">Tiền ra</div><div></div>
            {line('Nhập hàng, tiền mặt', Number(F.purchases_cash))}{line('Nhập hàng, chuyển khoản', Number(F.purchases_bank))}
            {line('Cước xe + bãi', Number(F.freight))}{line('Trả nợ mối hàng', Number(F.debt_paid))}{line('Chi phí khác', Number(F.other_out_cash) + Number(F.other_out_bank))}
            <div className="tot">Tổng ra</div><div className="r tot bad">{money(totalOut)}</div>
            <div className="h">Theo ví</div><div></div>
            <div>Tiền mặt (vào − ra)</div><div className="r">{money(Number(F.cash_in) - Number(F.cash_out))}</div>
            <div>Tài khoản (vào − ra)</div><div className="r">{money(Number(F.bank_in) - Number(F.bank_out))}</div>
          </div>}
        </div>
        <div className="card"><h2 style={{ margin: '0 0 8px' }}>Ghi thu / chi khác</h2>
          <form className="entry" onSubmit={add} autoComplete="off">
            <div className="f c6"><Seg value={dir} onChange={setDir} options={[{ v: 'out', label: 'Chi ra' }, { v: 'in', label: 'Thu vào' }]} /></div>
            <div className="f c3"><label htmlFor="c_cat">Khoản</label><input id="c_cat" list="dl-cats" value={cat} placeholder="đá lạnh" onChange={e => setCat(e.target.value)} /></div>
            <div className="f c3"><label htmlFor="c_amt">Số tiền</label><input id="c_amt" inputMode="numeric" value={amt} placeholder="50" onChange={e => setAmt(e.target.value)} />
              <span className="hint">{parseMoney(amt) > 0 ? '= ' + money(parseMoney(amt)) : 'gõ 50 = 50.000đ'}</span></div>
            <div className="f c6"><Seg value={pay} onChange={setPay} options={[{ v: 'cash', label: 'Tiền mặt' }, { v: 'bank', label: 'Chuyển khoản' }]} /></div>
            <div className="f c6"><label htmlFor="c_note">Ghi chú</label><input id="c_note" value={note} onChange={e => setNote(e.target.value)} /></div>
            <div className="c6"><button className="btn" type="submit">Lưu</button></div>
          </form>
          <datalist id="dl-cats">{CATS.map(c => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div className="card"><div className="tw">
        {!entries.length ? <Empty>Chưa có khoản thu chi khác ngày này (đá, bao bì, điện nước, lương…).</Empty> : (
          <table><tbody>{entries.map(c => (
            <tr key={c.id}><td><b>{cap(c.category)}</b> {c.pay_method === 'bank' && <span className="pill p-bank">CK</span>}{c.note && <div className="sub">{c.note}</div>}</td>
              <td className={'r ' + (c.direction === 'in' ? 'good' : 'bad')}><b>{c.direction === 'in' ? '+' : '−'}{money(c.amount)}</b></td>
              <td style={{ width: 1 }}><ConfirmButton onConfirm={() => del(c.id)} confirmText="Chắc chắn?">Xóa</ConfirmButton></td></tr>))}</tbody></table>)}
      </div></div>

      <h2 id="cong-no">Công nợ</h2>
      {!isManager && <p className="note">Chỉ chủ quán hoặc quản lý được ghi trả nợ.</p>}
      <div className="grid2">
        {([['customer', 'Khách còn nợ quán', groups.c], ['supplier', 'Quán còn nợ mối hàng', groups.s]] as const).map(([kind, title, list]) => (
          <div className="card" key={kind}><b>{title}</b> <span className="sub">· tổng {money(list.reduce((a, x) => a + x.sum, 0))}</span>
            <div className="tw">{!list.length ? <Empty>Không có nợ.</Empty> : (
              <table><tbody>{list.map(g => (
                <tr key={g.id || 'none'}>
                  <td><b>{g.id ? cap(partnerName(g.id)) : '(chưa ghi tên)'}</b>
                    <div className="sub">{g.rows.map(r => `${dm(r.date)}: ${cap(productName(r.product_id))} ${kg(r.qty)}kg`).join(' · ')}</div></td>
                  <td className="r"><b>{money(g.sum)}</b>
                    {isManager && <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
                      <ConfirmButton className="btn ghost sm" confirmText="Xác nhận" onConfirm={() => settle(kind, g.id, 'cash')}>Trả TM</ConfirmButton>
                      <ConfirmButton className="btn ghost sm" confirmText="Xác nhận" onConfirm={() => settle(kind, g.id, 'bank')}>Trả CK</ConfirmButton>
                    </div>}</td>
                </tr>))}</tbody></table>)}</div>
          </div>))}
      </div>
    </>
  )
}
