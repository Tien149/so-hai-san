import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cap } from '../lib/format'

export type ComboOption = { value: string; hint?: ReactNode }

/** Bỏ dấu để gõ "oc huong" vẫn ra "ốc hương" */
const foldChar = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
export const fold = (s: string) => [...String(s)].map(foldChar).join('').replace(/\s+/g, ' ').trim()

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const chars = [...text]
  const folded = chars.map(foldChar)
  if (folded.some(f => f.length !== 1)) return <>{text}</>
  const i = folded.join('').indexOf(q)
  if (i < 0) return <>{text}</>
  return <>{chars.slice(0, i).join('')}<mark>{chars.slice(i, i + q.length).join('')}</mark>{chars.slice(i + q.length).join('')}</>
}

/** Ô gõ có danh sách gợi ý (thay cho datalist mặc định của trình duyệt) */
export function Combo({ id, value, onChange, options, placeholder, inputRef, onPick, onBlur, newLabel, max = 60 }: {
  id?: string
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  placeholder?: string
  inputRef?: RefObject<HTMLInputElement | null>
  /** Gọi khi chọn một dòng trong danh sách */
  onPick?: (v: string) => void
  onBlur?: (v: string) => void
  /** Ví dụ "Món mới": hiện khi gõ tên chưa có trong danh sách */
  newLabel?: string
  max?: number
}) {
  const own = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? own
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const q = fold(value)

  const raw = value.trim().toLowerCase()
  const { shown, exact } = useMemo(() => {
    const seen = new Set<string>()
    const all = options.filter(o => { const k = fold(o.value); if (!k || seen.has(k)) return false; seen.add(k); return true })
    if (!q) return { shown: all.slice(0, max), exact: false }
    const starts: ComboOption[] = [], words: ComboOption[] = [], has: ComboOption[] = []
    let exact = false
    for (const o of all) {
      const k = fold(o.value)
      if (k === q) exact = true
      if (k.startsWith(q)) starts.push(o)
      else if (k.includes(' ' + q)) words.push(o)
      else if (k.includes(q)) has.push(o)
    }
    return { shown: [...starts, ...words, ...has].slice(0, max), exact }
  }, [options, q, max])

  // Chỉ còn đúng món đang gõ (đúng cả dấu) thì không cần mở danh sách
  const onlySelf = shown.length === 1 && shown[0].value.toLowerCase() === raw
  const showNew = !!newLabel && !!q && !exact
  const visible = open && !onlySelf && (shown.length > 0 || showNew)

  useEffect(() => { setHi(-1) }, [q])
  useEffect(() => {
    if (hi < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  const pick = (v: string) => { onChange(v); setOpen(false); setHi(-1); onPick?.(v) }

  return (
    <div className="combo">
      <input id={id} ref={ref} value={value} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={visible} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={visible && hi >= 0 ? `${listId}-${hi}` : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onBlur={e => {
          setOpen(false)
          // Gõ "ghe" mà danh sách có "ghẹ" thì tự sửa đúng tên, tránh tạo món trùng
          const typed = e.target.value, k = fold(typed)
          const same = k ? options.find(o => fold(o.value) === k) : undefined
          if (same && same.value !== typed.trim()) { onChange(same.value); onBlur?.(same.value) } else onBlur?.(typed)
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!visible) setOpen(true); else setHi(h => Math.min(h + 1, shown.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter' && visible && hi >= 0 && shown[hi]) { e.preventDefault(); pick(shown[hi].value) }
          else if (e.key === 'Escape' && visible) { e.preventDefault(); setOpen(false) }
        }} />
      <button type="button" className="combo-btn" tabIndex={-1} aria-label="Mở danh sách"
        onMouseDown={e => { e.preventDefault(); if (document.activeElement !== ref.current) ref.current?.focus(); else setOpen(o => !o) }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ transform: visible ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {visible && (
        <ul className="combo-list" role="listbox" id={listId} ref={listRef}>
          {shown.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={i === hi} className={i === hi ? 'on' : undefined}
              onMouseDown={e => { e.preventDefault(); pick(o.value) }} onMouseEnter={() => setHi(i)}>
              <span className="combo-name"><Highlight text={cap(o.value)} q={q} /></span>
              {o.hint != null && o.hint !== '' && <span className="combo-hint">{o.hint}</span>}
            </li>
          ))}
          {showNew && <li className="combo-new" aria-disabled="true">{newLabel}: <b>{cap(value.trim())}</b> · tự thêm khi lưu</li>}
        </ul>
      )}
    </div>
  )
}
