-- Siết quyền theo khuyến nghị bảo mật của Supabase
-- 1. Cố định search_path cho mọi hàm
alter function public.touch_updated_at() set search_path = public;
alter function public.audit_immutable() set search_path = public;
alter function public.settle_debt(uuid, uuid, public.partner_kind, public.pay_method, date) set search_path = public;
alter function public.ensure_product(uuid, text) set search_path = public;
alter function public.ensure_partner(uuid, public.partner_kind, text) set search_path = public;
alter function public.daily_pnl(uuid, date, date) set search_path = public;
alter function public.product_pnl(uuid, date, date) set search_path = public;
alter function public.cash_flow(uuid, date, date) set search_path = public;
alter function public.stock_levels(uuid, date) set search_path = public;
alter function public.product_costs(uuid, date) set search_path = public;

-- 2. Hàm trigger: không ai gọi trực tiếp được
revoke execute on function public.write_audit(), public.check_same_shop(), public.keep_one_owner(),
  public.touch_updated_at(), public.audit_immutable() from public, anon, authenticated;

-- 3. Hàm phân quyền dùng trong RLS: chỉ người đã đăng nhập
revoke execute on function public.is_member(uuid), public.is_manager(uuid), public.is_owner(uuid),
  public.member_role_of(uuid), public.can_modify(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.is_member(uuid), public.is_manager(uuid), public.is_owner(uuid),
  public.member_role_of(uuid), public.can_modify(uuid, uuid, timestamptz) to authenticated;
