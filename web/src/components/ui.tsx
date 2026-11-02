import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { PayMethod } from '../lib/types'

export function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string; danger?: boolean }[]
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v}
          className={(value === o.v ? 'on' : '') + (o.danger ? ' debt' : '')} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

/** Nút cần bấm hai lần để xác nhận (không dùng hộp thoại confirm) */
export function ConfirmButton({ onConfirm, children, confirmText = 'Bấm lần nữa để xác nhận', className = 'btn danger sm', disabled }: {
  onConfirm: () => void | Promise<void>; children: ReactNode; confirmText?: string; className?: string; disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) }, [armed])
  return (
    <button type="button" className={className} disabled={disabled}
      onClick={e => { e.stopPropagation(); if (armed) { setArmed(false); void onConfirm() } else setArmed(true) }}>
      {armed ? confirmText : children}
    </button>
  )
}

export function PayPill({ paid, method }: { paid: boolean; method: PayMethod }) {
  if (!paid) return <span className="pill p-debt">Nợ</span>
  return method === 'bank' ? <span className="pill p-bank">CK</span> : <span className="pill p-cash">TM</span>
}

export function Tile({ k, v, s, kind }: { k: string; v: ReactNode; s?: ReactNode; kind?: 'main' | 'in' | 'out' }) {
  return <div className={'tile' + (kind ? ' ' + kind : '')}><div className="k">{k}</div><div className="v">{v}</div>{s != null && <div className="s">{s}</div>}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <table><tbody><tr><td className="empty">{children}</td></tr></tbody></table>
}

/** Lắng nghe thay đổi của các bảng trong quán, gọi lại onChange (máy khác ghi sổ là màn hình tự cập nhật) */
export function useLive(shopId: string | undefined, tables: string[], onChange: () => void) {
  const key = tables.join(',')
  useEffect(() => {
    if (!shopId) return
    let t: number | undefined
    const fire = () => { window.clearTimeout(t); t = window.setTimeout(onChange, 300) }
    const ch = supabase.channel(`live-${shopId}-${key}`)
    key.split(',').forEach(table =>
      ch.on('postgres_changes' as never, { event: '*', schema: 'public', table, filter: `shop_id=eq.${shopId}` } as never, fire))
    ch.subscribe()
    const onFocus = () => { if (document.visibilityState === 'visible') fire() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', onFocus); void supabase.removeChannel(ch) }
  }, [shopId, key, onChange])
}
