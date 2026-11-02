import { useState } from 'react'
import { useApp } from '../lib/app'
import { supabase, must } from '../lib/supabase'
import { cap, parseMoney, toThousand, money } from '../lib/format'
import type { PartnerKind } from '../lib/types'
import { Empty } from '../components/ui'

export default function Catalog() {
  const app = useApp()
  const { products, partners, isManager, reloadCatalog } = app
  const [tab, setTab] = useState<'products' | PartnerKind>('products')

  const save = async (table: 'products' | 'partners', id: string, patch: Record<string, unknown>) => {
    try { await must(supabase.from(table).update(patch).eq('id', id)); app.toast('Đã lưu'); await reloadCatalog() }
    catch (e) { app.fail(e) }
  }
  const list = partners.filter(p => p.kind === tab)

  return (
    <>
      <h1>Danh mục</h1>
      <div className="chips">
        <button type="button" className={'chip' + (tab === 'products' ? ' on' : '')} onClick={() => setTab('products')}>Món hàng ({products.length})</button>
        <button type="button" className={'chip' + (tab === 'supplier' ? ' on' : '')} onClick={() => setTab('supplier')}>Mối hàng ({partners.filter(p => p.kind === 'supplier').length})</button>
        <button type="button" className={'chip' + (tab === 'customer' ? ' on' : '')} onClick={() => setTab('customer')}>Khách ({partners.filter(p => p.kind === 'customer').length})</button>
      </div>
      {!isManager && <p className="note">Chỉ chủ quán hoặc quản lý được sửa danh mục.</p>}
      <div className="card"><div className="tw">
        {tab === 'products' ? (!products.length ? <Empty>Món hàng tự thêm khi bạn ghi bán hoặc nhập.</Empty> : (
          <table><thead><tr><th>Món</th><th>Giá bán mặc định (nghìn)</th><th>Đang bán</th></tr></thead>
            <tbody>{products.map(p => (
              <tr key={p.id}>
                <td><input aria-label="Tên món" defaultValue={p.name} disabled={!isManager} onBlur={e => { const v = e.target.value.trim().toLowerCase(); if (v && v !== p.name) void save('products', p.id, { name: v }) }} /></td>
                <td><input aria-label="Giá bán mặc định" inputMode="numeric" defaultValue={toThousand(p.default_sell_price)} disabled={!isManager} placeholder="—"
                  onBlur={e => { const v = e.target.value.trim() ? parseMoney(e.target.value) : null; if (v !== p.default_sell_price && (v == null || v > 0)) void save('products', p.id, { default_sell_price: v }) }} />
                  {p.default_sell_price ? <span className="hint">{money(p.default_sell_price)}</span> : null}</td>
                <td><input type="checkbox" aria-label="Đang bán" checked={p.active} disabled={!isManager} onChange={e => void save('products', p.id, { active: e.target.checked })} style={{ width: 22, height: 22 }} /></td>
              </tr>))}</tbody></table>)) : (!list.length ? <Empty>Tên {tab === 'supplier' ? 'mối hàng' : 'khách'} tự thêm khi bạn ghi sổ.</Empty> : (
          <table><thead><tr><th>Tên</th><th>Số điện thoại</th><th>Địa chỉ / ghi chú</th></tr></thead>
            <tbody>{list.map(p => (
              <tr key={p.id}>
                <td><b>{cap(p.name)}</b></td>
                <td><input aria-label="Số điện thoại" inputMode="tel" defaultValue={p.phone || ''} disabled={!isManager} onBlur={e => { if (e.target.value.trim() !== (p.phone || '')) void save('partners', p.id, { phone: e.target.value.trim() || null }) }} /></td>
                <td><input aria-label="Địa chỉ" defaultValue={p.address || ''} disabled={!isManager} onBlur={e => { if (e.target.value.trim() !== (p.address || '')) void save('partners', p.id, { address: e.target.value.trim() || null }) }} /></td>
              </tr>))}</tbody></table>))}
      </div></div>
    </>
  )
}
