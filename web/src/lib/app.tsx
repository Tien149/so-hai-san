import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, must, errText } from './supabase'
import type { Membership, Partner, PartnerKind, Product, Role, Shipper, Shop } from './types'
import { normName, today } from './format'

interface AppCtx {
  session: Session | null
  ready: boolean
  memberships: Membership[]
  shop: Shop | null
  role: Role | null
  isManager: boolean
  setShopId: (id: string) => void
  reloadShops: () => Promise<void>
  products: Product[]
  partners: Partner[]
  shippers: Shipper[]
  shipperName: (id: string | null | undefined) => string
  reloadCatalog: () => Promise<void>
  ensureProduct: (name: string) => Promise<string>
  ensurePartner: (kind: PartnerKind, name: string) => Promise<string | null>
  productName: (id: string | null | undefined) => string
  partnerName: (id: string | null | undefined) => string
  day: string
  setDay: (d: string) => void
  toast: (msg: string) => void
  fail: (e: unknown) => void
}

const Ctx = createContext<AppCtx | null>(null)
export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

const LS_SHOP = 'qhs-shop'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [shopId, setShopIdState] = useState<string | null>(lsGet(LS_SHOP))
  const [products, setProducts] = useState<Product[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [shippers, setShippers] = useState<Shipper[]>([])
  const [day, setDay] = useState(today())
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600)
  }, [])
  const fail = useCallback((e: unknown) => { console.error(e); toast(errText(e)) }, [toast])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const reloadShops = useCallback(async () => {
    if (!session) { setMemberships([]); return }
    try {
      const rows = await must(supabase.from('shop_members')
        .select('shop_id, role, shops(id, name, phone, address, opening_cash)')
        .eq('user_id', session.user.id))
      setMemberships(rows as unknown as Membership[])
    } catch (e) { fail(e) } finally { setReady(true) }
  }, [session, fail])
  useEffect(() => { void reloadShops() }, [reloadShops])

  const current = memberships.find(m => m.shop_id === shopId) || memberships[0] || null
  const shop = current?.shops || null
  const role = current?.role || null

  const setShopId = useCallback((id: string) => { setShopIdState(id); lsSet(LS_SHOP, id) }, [])

  const reloadCatalog = useCallback(async () => {
    if (!shop) { setProducts([]); setPartners([]); setShippers([]); return }
    try {
      const [p, q, s] = await Promise.all([
        must(supabase.from('products').select('*').eq('shop_id', shop.id).order('name')),
        must(supabase.from('partners').select('*').eq('shop_id', shop.id).order('name')),
        must(supabase.from('shippers').select('*').eq('shop_id', shop.id).order('name')),
      ])
      setProducts(p as Product[]); setPartners(q as Partner[]); setShippers(s as Shipper[])
    } catch (e) { fail(e) }
  }, [shop, fail])
  useEffect(() => { void reloadCatalog() }, [reloadCatalog])

  const ensureProduct = useCallback(async (name: string) => {
    const n = normName(name)
    const hit = products.find(p => p.name === n)
    if (hit) return hit.id
    const id = await must(supabase.rpc('ensure_product', { p_shop: shop!.id, p_name: n })) as string
    void reloadCatalog()
    return id
  }, [products, shop, reloadCatalog])

  const ensurePartner = useCallback(async (kind: PartnerKind, name: string) => {
    const n = normName(name)
    if (!n) return null
    const hit = partners.find(p => p.kind === kind && p.name === n)
    if (hit) return hit.id
    const id = await must(supabase.rpc('ensure_partner', { p_shop: shop!.id, p_kind: kind, p_name: n })) as string
    void reloadCatalog()
    return id
  }, [partners, shop, reloadCatalog])

  const pMap = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products])
  const qMap = useMemo(() => new Map(partners.map(p => [p.id, p.name])), [partners])
  const sMap = useMemo(() => new Map(shippers.map(p => [p.id, p.name])), [shippers])

  const value: AppCtx = {
    session, ready, memberships, shop, role, isManager: role === 'owner' || role === 'manager',
    setShopId, reloadShops, products, partners, shippers, reloadCatalog,
    shipperName: id => (id && sMap.get(id)) || '', ensureProduct, ensurePartner,
    productName: id => (id && pMap.get(id)) || '',
    partnerName: id => (id && qMap.get(id)) || '',
    day, setDay, toast, fail,
  }
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  )
}
