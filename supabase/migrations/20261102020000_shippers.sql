-- Shipper: shipper nhà (lương tháng) và shipper ngoài (tính theo đơn)
create type public.shipper_kind as enum ('staff', 'outside');

create table public.shippers (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  phone          text,
  kind           public.shipper_kind not null default 'outside',
  monthly_salary bigint not null default 0 check (monthly_salary >= 0),
  per_order_fee  bigint not null default 0 check (per_order_fee >= 0),
  active         boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index shippers_shop_name on public.shippers (shop_id, lower(name));

-- Mỗi chuyến giao hàng. auto = tạo tự động từ đơn bán (gom các món cùng khách, cùng ngày, cùng shipper)
create table public.deliveries (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  date        date not null default current_date,
  shipper_id  uuid not null references public.shippers(id),
  customer_id uuid references public.partners(id),
  fee         bigint not null default 0 check (fee >= 0),
  auto        boolean not null default false,
  note        text,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.deliveries (shop_id, date);
create index on public.deliveries (shop_id, shipper_id, date);

alter table public.sales
  add column shipper_id  uuid references public.shippers(id),
  add column delivery_id uuid references public.deliveries(id) on delete set null;
create index on public.sales (delivery_id) where delivery_id is not null;

-- Khoản trả shipper ghi vào sổ thu chi; period = tháng được trả (ngày 1 của tháng)
alter table public.cash_entries
  add column shipper_id uuid references public.shippers(id),
  add column period     date check (period is null or extract(day from period) = 1);
create index on public.cash_entries (shop_id, shipper_id, period) where shipper_id is not null;

-- Kiểm tra mọi khóa ngoại cùng một quán (chỉ kiểm cột có trong bảng)
create or replace function public.check_same_shop()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  v uuid;
begin
  if r ? 'product_id' then
    select shop_id into v from public.products where id = (r->>'product_id')::uuid;
    if v is distinct from new.shop_id then raise exception 'Sản phẩm không thuộc quán này'; end if;
  end if;
  if r->>'supplier_id' is not null then
    select shop_id into v from public.partners where id = (r->>'supplier_id')::uuid and kind = 'supplier';
    if v is distinct from new.shop_id then raise exception 'Mối hàng không thuộc quán này'; end if;
  end if;
  if r->>'customer_id' is not null then
    select shop_id into v from public.partners where id = (r->>'customer_id')::uuid and kind = 'customer';
    if v is distinct from new.shop_id then raise exception 'Khách hàng không thuộc quán này'; end if;
  end if;
  if r->>'shipper_id' is not null then
    select shop_id into v from public.shippers where id = (r->>'shipper_id')::uuid;
    if v is distinct from new.shop_id then raise exception 'Shipper không thuộc quán này'; end if;
  end if;
  return new;
end $$;

-- Đơn bán có shipper: tự gắn vào chuyến giao (cùng ngày, cùng khách, cùng shipper thì chung 1 chuyến)
create or replace function public.sales_link_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.shipper_id is null then
    new.delivery_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.delivery_id is not null and new.delivery_id is not distinct from old.delivery_id
     and new.shipper_id = old.shipper_id and new.date = old.date
     and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;
  if new.customer_id is not null then
    select id into v from public.deliveries
     where shop_id = new.shop_id and date = new.date and shipper_id = new.shipper_id
       and customer_id = new.customer_id and auto
     order by created_at limit 1;
  end if;
  if v is null then
    insert into public.deliveries (shop_id, date, shipper_id, customer_id, fee, auto, created_by)
    select new.shop_id, new.date, new.shipper_id, new.customer_id, s.per_order_fee, true, coalesce(auth.uid(), new.created_by)
      from public.shippers s where s.id = new.shipper_id
    returning id into v;
  end if;
  new.delivery_id := v;
  return new;
end $$;

-- Bỏ chuyến giao tự động khi không còn món nào thuộc chuyến đó
create or replace function public.sales_cleanup_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.delivery_id is not null and (tg_op = 'DELETE' or new.delivery_id is distinct from old.delivery_id) then
    delete from public.deliveries d
     where d.id = old.delivery_id and d.auto
       and not exists (select 1 from public.sales s where s.delivery_id = d.id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger sales_link_delivery before insert or update on public.sales
  for each row execute function public.sales_link_delivery();
create trigger sales_cleanup_delivery after update or delete on public.sales
  for each row execute function public.sales_cleanup_delivery();

create trigger shippers_touch before update on public.shippers for each row execute function public.touch_updated_at();
create trigger deliveries_touch before update on public.deliveries for each row execute function public.touch_updated_at();
create trigger deliveries_same_shop before insert or update on public.deliveries for each row execute function public.check_same_shop();
create trigger cash_entries_same_shop before insert or update on public.cash_entries for each row execute function public.check_same_shop();
create trigger shippers_audit after insert or update or delete on public.shippers for each row execute function public.write_audit();
create trigger deliveries_audit after insert or update or delete on public.deliveries for each row execute function public.write_audit();

alter table public.shippers enable row level security;
alter table public.deliveries enable row level security;
-- shipper: mọi người xem (để chọn khi bán); chủ/quản lý thêm, sửa, xóa
create policy shippers_select on public.shippers for select using (public.is_member(shop_id));
create policy shippers_insert on public.shippers for insert with check (public.is_manager(shop_id));
create policy shippers_update on public.shippers for update using (public.is_manager(shop_id)) with check (public.is_manager(shop_id));
create policy shippers_delete on public.shippers for delete using (public.is_manager(shop_id));
-- chuyến giao: như đơn bán
create policy deliveries_select on public.deliveries for select using (public.is_member(shop_id));
create policy deliveries_insert on public.deliveries for insert with check (public.is_member(shop_id) and created_by = auth.uid());
create policy deliveries_update on public.deliveries for update using (public.can_modify(shop_id, created_by, created_at)) with check (public.is_member(shop_id));
create policy deliveries_delete on public.deliveries for delete using (public.can_modify(shop_id, created_by, created_at));

grant select, insert, update, delete on public.shippers, public.deliveries to authenticated;

-- Tổng hợp tiền shipper theo tháng
create or replace function public.shipper_month(p_shop uuid, p_month date)
returns table (shipper_id uuid, name text, phone text, kind public.shipper_kind, active boolean,
               monthly_salary bigint, per_order_fee bigint,
               orders bigint, fees numeric, salary numeric, due numeric, paid numeric, prev_debt numeric, balance numeric)
language sql stable security invoker set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date m0, (date_trunc('month', p_month) + interval '1 month')::date m1),
  d as (select dl.shipper_id, count(*) n, sum(dl.fee) f from public.deliveries dl, m
        where dl.shop_id = p_shop and dl.date >= m.m0 and dl.date < m.m1 group by 1),
  pay as (select c.shipper_id, sum(c.amount) v from public.cash_entries c, m
          where c.shop_id = p_shop and c.shipper_id is not null and coalesce(c.period, date_trunc('month', c.date)::date) = m.m0 group by 1),
  -- shipper ngoài: tiền đơn tháng trước chưa trả hết
  pf as (select dl.shipper_id, sum(dl.fee) f from public.deliveries dl, m
         where dl.shop_id = p_shop and dl.date < m.m0 group by 1),
  pp as (select c.shipper_id, sum(c.amount) v from public.cash_entries c, m
         where c.shop_id = p_shop and c.shipper_id is not null and coalesce(c.period, date_trunc('month', c.date)::date) < m.m0 group by 1),
  x as (
    select s.*, coalesce(d.n, 0) n, coalesce(d.f, 0) f,
           case when s.kind = 'staff' then s.monthly_salary else 0 end sal,
           coalesce(pay.v, 0) pv,
           case when s.kind = 'outside' then greatest(coalesce(pf.f, 0) - coalesce(pp.v, 0), 0) else 0 end prev
    from public.shippers s
    left join d on d.shipper_id = s.id left join pay on pay.shipper_id = s.id
    left join pf on pf.shipper_id = s.id left join pp on pp.shipper_id = s.id
    where s.shop_id = p_shop and public.is_member(p_shop)
  )
  select id, name, phone, kind, active, monthly_salary, per_order_fee,
         n, f, sal, sal + f, pv, prev, sal + f + prev - pv
  from x
  where active or n > 0 or pv > 0 or prev > 0
  order by kind, lower(name)
$$;

revoke execute on function public.shipper_month(uuid, date) from public, anon;
grant execute on function public.shipper_month(uuid, date) to authenticated;
revoke execute on function public.sales_link_delivery(), public.sales_cleanup_delivery() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shippers, public.deliveries;
  end if;
end $$;
