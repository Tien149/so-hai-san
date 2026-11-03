-- Thành tiền của đơn bán lưu riêng: khách mua theo tiền ("lấy 100k ốc") thì sổ ghi đúng 100k,
-- số kg chỉ để trừ kho. Đơn bán theo kg mà quán làm tròn tiền cũng sửa được thành tiền.
alter table public.sales add column amount bigint;
-- điền cho đơn cũ, không ghi nhật ký hàng loạt
set local session_replication_role = replica;
update public.sales set amount = round(qty * unit_price);
set local session_replication_role = origin;
alter table public.sales alter column amount set not null,
  add constraint sales_amount_nonneg check (amount >= 0);

-- Không gửi thành tiền thì tự tính = kg × giá. Sửa kg hoặc giá mà giữ nguyên thành tiền cũ thì tính lại.
create or replace function public.sales_fill_amount()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.amount is null
     or (tg_op = 'UPDATE' and new.amount = old.amount
         and (new.qty is distinct from old.qty or new.unit_price is distinct from old.unit_price)) then
    new.amount := round(new.qty * new.unit_price);
  end if;
  return new;
end $$;
revoke execute on function public.sales_fill_amount() from public, anon, authenticated;
create trigger sales_fill_amount before insert or update on public.sales
  for each row execute function public.sales_fill_amount();

create or replace function public.daily_pnl(p_shop uuid, p_from date, p_to date)
returns table (day date, revenue numeric, service numeric, cogs numeric, loss numeric,
               other_in numeric, other_out numeric, purchases numeric, freight numeric,
               orders bigint, qty numeric, net numeric)
language sql stable security invoker as $$
  with c as (select * from public.product_costs(p_shop, null)),
  d as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  s as (select s.date, sum(s.amount) rev, sum(s.processing_fee + s.shipping_fee) svc,
               sum(s.qty * coalesce(c.avg_cost, 0)) cogs, count(*) n, sum(s.qty) q
        from public.sales s left join c on c.product_id = s.product_id
        where s.shop_id = p_shop and s.date between p_from and p_to group by s.date),
  a as (select a.date, sum(a.qty * coalesce(c.avg_cost, 0)) loss
        from public.stock_adjustments a left join c on c.product_id = a.product_id
        where a.shop_id = p_shop and a.date between p_from and p_to group by a.date),
  e as (select date, sum(amount) filter (where direction = 'in') i, sum(amount) filter (where direction = 'out') o
        from public.cash_entries where shop_id = p_shop and date between p_from and p_to group by date),
  b as (select date, sum(qty * unit_price) amt, sum(freight) fr
        from public.purchases where shop_id = p_shop and date between p_from and p_to group by date)
  select d.day, coalesce(s.rev,0), coalesce(s.svc,0), coalesce(s.cogs,0), coalesce(a.loss,0),
         coalesce(e.i,0), coalesce(e.o,0), coalesce(b.amt,0), coalesce(b.fr,0), coalesce(s.n,0), coalesce(s.q,0),
         coalesce(s.rev,0) - coalesce(s.cogs,0) + coalesce(s.svc,0) + coalesce(e.i,0) - coalesce(a.loss,0) - coalesce(e.o,0)
  from d left join s on s.date = d.day left join a on a.date = d.day left join e on e.date = d.day left join b on b.date = d.day
  where public.is_member(p_shop)
  order by d.day
$$;

create or replace function public.product_pnl(p_shop uuid, p_from date, p_to date)
returns table (product_id uuid, name text, qty numeric, revenue numeric, cogs numeric, loss numeric, has_cost boolean)
language sql stable security invoker as $$
  with c as (select * from public.product_costs(p_shop, null)),
  s as (select product_id, sum(qty) q, sum(amount) rev from public.sales
        where shop_id = p_shop and date between p_from and p_to group by 1),
  a as (select product_id, sum(qty) q from public.stock_adjustments
        where shop_id = p_shop and date between p_from and p_to group by 1)
  select p.id, p.name, coalesce(s.q,0), coalesce(s.rev,0),
         coalesce(s.q,0) * coalesce(c.avg_cost,0), coalesce(a.q,0) * coalesce(c.avg_cost,0), c.avg_cost is not null
  from public.products p
  join (select product_id from s union select product_id from a) x on x.product_id = p.id
  left join s on s.product_id = p.id left join a on a.product_id = p.id left join c on c.product_id = p.id
  where p.shop_id = p_shop
  order by coalesce(s.rev,0) - coalesce(s.q,0) * coalesce(c.avg_cost,0) desc
$$;

create or replace function public.cash_flow(p_shop uuid, p_from date, p_to date)
returns table (sales_cash numeric, sales_bank numeric, debt_collected numeric, other_in_cash numeric, other_in_bank numeric,
               purchases_cash numeric, purchases_bank numeric, freight numeric, debt_paid numeric,
               other_out_cash numeric, other_out_bank numeric,
               cash_in numeric, cash_out numeric, bank_in numeric, bank_out numeric)
language sql stable security invoker as $$
  with s as (
    select coalesce(paid_at, date) pd, date, pay_method, amount + processing_fee + shipping_fee v
    from public.sales where shop_id = p_shop and paid and coalesce(paid_at, date) between p_from and p_to),
  b as (
    select coalesce(paid_at, date) pd, date, pay_method, qty*unit_price v
    from public.purchases where shop_id = p_shop and paid and coalesce(paid_at, date) between p_from and p_to),
  f as (select sum(freight) fr from public.purchases where shop_id = p_shop and date between p_from and p_to),
  e as (select direction, pay_method, sum(amount) v from public.cash_entries
        where shop_id = p_shop and date between p_from and p_to group by 1,2)
  select
    coalesce((select sum(v) from s where pd = date and pay_method = 'cash'),0),
    coalesce((select sum(v) from s where pd = date and pay_method = 'bank'),0),
    coalesce((select sum(v) from s where pd <> date),0),
    coalesce((select v from e where direction='in' and pay_method='cash'),0),
    coalesce((select v from e where direction='in' and pay_method='bank'),0),
    coalesce((select sum(v) from b where pd = date and pay_method = 'cash'),0),
    coalesce((select sum(v) from b where pd = date and pay_method = 'bank'),0),
    coalesce((select fr from f),0),
    coalesce((select sum(v) from b where pd <> date),0),
    coalesce((select v from e where direction='out' and pay_method='cash'),0),
    coalesce((select v from e where direction='out' and pay_method='bank'),0),
    coalesce((select sum(v) from s where pay_method='cash'),0) + coalesce((select v from e where direction='in' and pay_method='cash'),0),
    coalesce((select sum(v) from b where pay_method='cash'),0) + coalesce((select fr from f),0) + coalesce((select v from e where direction='out' and pay_method='cash'),0),
    coalesce((select sum(v) from s where pay_method='bank'),0) + coalesce((select v from e where direction='in' and pay_method='bank'),0),
    coalesce((select sum(v) from b where pay_method='bank'),0) + coalesce((select v from e where direction='out' and pay_method='bank'),0)
  where public.is_member(p_shop)
$$;

alter function public.daily_pnl(uuid, date, date) set search_path = public;
alter function public.product_pnl(uuid, date, date) set search_path = public;
alter function public.cash_flow(uuid, date, date) set search_path = public;
