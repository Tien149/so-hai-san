export type Role = 'owner' | 'manager' | 'cashier'
export type PayMethod = 'cash' | 'bank'
export type PartnerKind = 'supplier' | 'customer'

export interface Shop { id: string; name: string; phone: string | null; address: string | null; opening_cash: number }
export interface Membership { shop_id: string; role: Role; shops: Shop }
export interface Product { id: string; name: string; unit: string; default_sell_price: number | null; active: boolean }
export interface Partner { id: string; kind: PartnerKind; name: string; phone: string | null; address: string | null; note: string | null }

interface RowMeta { id: string; shop_id: string; date: string; created_by: string; created_at: string; updated_at: string; note: string | null }
export interface Sale extends RowMeta {
  product_id: string; customer_id: string | null; size: string | null; qty: number; unit_price: number
  processing_fee: number; shipping_fee: number; pay_method: PayMethod; paid: boolean; paid_at: string | null
}
export interface Purchase extends RowMeta {
  product_id: string; supplier_id: string | null; size: string | null; qty: number; unit_price: number
  freight: number; pay_method: PayMethod; paid: boolean; paid_at: string | null
}
export interface CashEntry extends RowMeta { direction: 'in' | 'out'; category: string; amount: number; pay_method: PayMethod }
export interface StockAdj extends RowMeta { product_id: string; qty: number; reason: 'loss' | 'count' }

export interface StockLevel {
  product_id: string; name: string; in_qty: number; out_qty: number; adj_qty: number; on_hand: number
  avg_cost: number | null; last_sell_price: number | null; last_buy_price: number | null
}
export interface DailyPnl {
  day: string; revenue: number; service: number; cogs: number; loss: number; other_in: number; other_out: number
  purchases: number; freight: number; orders: number; qty: number; net: number
}
export interface ProductPnl { product_id: string; name: string; qty: number; revenue: number; cogs: number; loss: number; has_cost: boolean }
export interface CashFlow {
  sales_cash: number; sales_bank: number; debt_collected: number; other_in_cash: number; other_in_bank: number
  purchases_cash: number; purchases_bank: number; freight: number; debt_paid: number; other_out_cash: number; other_out_bank: number
  cash_in: number; cash_out: number; bank_in: number; bank_out: number
}
export interface AuditRow {
  id: number; table_name: string; row_id: string; action: 'insert' | 'update' | 'delete'; actor: string | null; at: string
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null
}
export interface Member { user_id: string; role: Role; display_name: string | null; email: string; created_at: string }

export const saleAmount = (s: Pick<Sale, 'qty' | 'unit_price'>) => Number(s.qty) * Number(s.unit_price)
export const saleTotal = (s: Pick<Sale, 'qty' | 'unit_price' | 'processing_fee' | 'shipping_fee'>) =>
  saleAmount(s) + Number(s.processing_fee) + Number(s.shipping_fee)
export const purchaseAmount = (p: Pick<Purchase, 'qty' | 'unit_price'>) => Number(p.qty) * Number(p.unit_price)

export const ROLE_LABEL: Record<Role, string> = { owner: 'Chủ quán', manager: 'Quản lý', cashier: 'Thu ngân' }
