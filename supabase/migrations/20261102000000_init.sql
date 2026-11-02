-- =====================================================================
-- Quản lý quán hải sản: lược đồ nhiều quán (multi-tenant)
-- Mỗi bảng nghiệp vụ có shop_id; Row Level Security tách dữ liệu từng quán.
-- Mọi thay đổi trên bảng nghiệp vụ được ghi vào audit_log (không sửa/xóa được).
-- Tiền: bigint (đồng). Khối lượng: numeric(12,3) (kg).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- kiểu dữ liệu ----------
create type public.member_role as enum ('owner', 'manager', 'cashier');
create type public.partner_kind as enum ('supplier', 'customer');
create type public.pay_method as enum ('cash', 'bank');
create type public.cash_direction as enum ('in', 'out');

-- ---------- quán & thành viên ----------
create table public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  address     text,
  opening_cash bigint not null default 0,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.shop_members (
  shop_id      uuid not null references public.shops(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.member_role not null default 'cashier',
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index on public.shop_members (user_id);

-- ---------- danh mục ----------
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  unit               text not null default 'kg',
  default_sell_price bigint check (default_sell_price is null or default_sell_price >= 0),
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create unique index products_shop_name_uq on public.products (shop_id, lower(name));

create table public.partners (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  kind       public.partner_kind not null,
  name       text not null check (length(trim(name)) > 0),
  phone      text,
  address    text,
  note       text,
  created_at timestamptz not null default now()
);
create unique index partners_shop_kind_name_uq on public.partners (shop_id, kind, lower(name));

-- ---------- nghiệp vụ ----------
create table public.purchases (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  date        date not null default current_date,
  product_id  uuid not null references public.products(id),
  supplier_id uuid references public.partners(id),
  size        text,
  qty         numeric(12,3) not null check (qty > 0),
  unit_price  bigint not null check (unit_price >= 0),
  freight     bigint not null default 0 check (freight >= 0),
  pay_method  public.pay_method not null default 'cash',
  paid        boolean not null default true,
  paid_at     date,
  note        text,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.purchases (shop_id, date);
create index on public.purchases (shop_id, product_id);

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  date           date not null default current_date,
  product_id     uuid not null references public.products(id),
  customer_id    uuid references public.partners(id),
  size           text,
  qty            numeric(12,3) not null check (qty > 0),
  unit_price     bigint not null check (unit_price >= 0),
  processing_fee bigint not null default 0 check (processing_fee >= 0),
  shipping_fee   bigint not null default 0 check (shipping_fee >= 0),
  pay_method     public.pay_method not null default 'cash',
  paid           boolean not null default true,
  paid_at        date,
  note           text,
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.sales (shop_id, date);
create index on public.sales (shop_id, product_id);
create index on public.sales (shop_id, customer_id) where not paid;

create table public.cash_entries (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  date        date not null default current_date,
  direction   public.cash_direction not null,
  category    text not null,
  amount      bigint not null check (amount > 0),
  pay_method  public.pay_method not null default 'cash',
  note        text,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.cash_entries (shop_id, date);

-- qty > 0: hao hụt; qty < 0: kiểm kho thấy dư
create table public.stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  date        date not null default current_date,
  product_id  uuid not null references public.products(id),
  qty         numeric(12,3) not null check (qty <> 0),
  reason      text not null default 'loss' check (reason in ('loss', 'count')),
  note        text,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.stock_adjustments (shop_id, date);

-- ---------- nhật ký truy vết ----------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  actor      uuid,
  at         timestamptz not null default now(),
  old_data   jsonb,
  new_data   jsonb
);
create index on public.audit_log (shop_id, at desc);
create index on public.audit_log (shop_id, table_name, row_id);

-- =====================================================================
-- Hàm phân quyền
-- =====================================================================
create or replace function public.member_role_of(p_shop uuid)
returns public.member_role
language sql stable security definer set search_path = public
as $$
  select role from public.shop_members where shop_id = p_shop and user_id = auth.uid()
$$;

create or replace function public.is_member(p_shop uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.shop_members where shop_id = p_shop and user_id = auth.uid()) $$;

create or replace function public.is_manager(p_shop uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.member_role_of(p_shop) in ('owner','manager'), false) $$;

create or replace function public.is_owner(p_shop uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.member_role_of(p_shop) = 'owner', false) $$;

-- Thu ngân chỉ sửa/xóa dòng do chính mình tạo trong ngày hôm nay
create or replace function public.can_modify(p_shop uuid, p_created_by uuid, p_created_at timestamptz)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_manager(p_shop)
      or (public.is_member(p_shop) and p_created_by = auth.uid()
          and (p_created_at at time zone 'Asia/Ho_Chi_Minh')::date = (now() at time zone 'Asia/Ho_Chi_Minh')::date)
$$;

-- =====================================================================
-- Trigger: updated_at, kiểm tra cùng quán, ghi nhật ký
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- không cho đổi quán hoặc người tạo
  new.shop_id := old.shop_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

create or replace function public.check_same_shop()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  v uuid;
begin
  select shop_id into v from public.products where id = (r->>'product_id')::uuid;
  if v is distinct from new.shop_id then raise exception 'Sản phẩm không thuộc quán này'; end if;
  if r->>'supplier_id' is not null then
    select shop_id into v from public.partners where id = (r->>'supplier_id')::uuid and kind = 'supplier';
    if v is distinct from new.shop_id then raise exception 'Mối hàng không thuộc quán này'; end if;
  end if;
  if r->>'customer_id' is not null then
    select shop_id into v from public.partners where id = (r->>'customer_id')::uuid and kind = 'customer';
    if v is distinct from new.shop_id then raise exception 'Khách hàng không thuộc quán này'; end if;
  end if;
  return new;
end $$;

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_shop uuid;
  v_id text;
begin
  if tg_table_name = 'shops' then
    v_shop := (v_row->>'id')::uuid; v_id := v_row->>'id';
  elsif tg_table_name = 'shop_members' then
    v_shop := (v_row->>'shop_id')::uuid; v_id := v_row->>'user_id';
  else
    v_shop := (v_row->>'shop_id')::uuid; v_id := v_row->>'id';
  end if;
  -- quán đang bị xóa: không ghi nhật ký cho các dòng con (cascade)
  if tg_op = 'DELETE' and not exists (select 1 from public.shops where id = v_shop) then
    return old;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then return new; end if;
  insert into public.audit_log (shop_id, table_name, row_id, action, actor, old_data, new_data)
  values (v_shop, tg_table_name, v_id, lower(tg_op), auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['purchases','sales','cash_entries','stock_adjustments'] loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
  foreach t in array array['purchases','sales','stock_adjustments'] loop
    execute format('create trigger %1$s_same_shop before insert or update on public.%1$s for each row execute function public.check_same_shop()', t);
  end loop;
  foreach t in array array['purchases','sales','cash_entries','stock_adjustments','products','partners','shop_members'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.write_audit()', t);
  end loop;
  execute 'create trigger shops_audit after update on public.shops for each row execute function public.write_audit()';
end $$;

-- Nhật ký chỉ được thêm bởi trigger, không ai sửa/xóa
create or replace function public.audit_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.shops where id = old.shop_id) then
    return old; -- cho phép xóa theo cascade khi quán bị xóa
  end if;
  raise exception 'Nhật ký không thể sửa hoặc xóa';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.audit_immutable();

-- Không cho xóa/hạ quyền chủ quán cuối cùng
create or replace function public.keep_one_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.shops where id = old.shop_id) then return coalesce(new, old); end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (select 1 from public.shop_members
                   where shop_id = old.shop_id and role = 'owner' and user_id <> old.user_id) then
      raise exception 'Quán phải còn ít nhất một chủ quán';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger shop_members_keep_owner before update or delete on public.shop_members
  for each row execute function public.keep_one_owner();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.products enable row level security;
alter table public.partners enable row level security;
alter table public.purchases enable row level security;
alter table public.sales enable row level security;
alter table public.cash_entries enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.audit_log enable row level security;

create policy shops_select on public.shops for select using (public.is_member(id));
create policy shops_update on public.shops for update using (public.is_owner(id)) with check (public.is_owner(id));
-- tạo quán qua hàm create_shop(); xóa quán chỉ chủ quán
create policy shops_delete on public.shops for delete using (public.is_owner(id));

create policy members_select on public.shop_members for select using (public.is_member(shop_id));
create policy members_insert on public.shop_members for insert with check (public.is_owner(shop_id));
create policy members_update on public.shop_members for update using (public.is_owner(shop_id)) with check (public.is_owner(shop_id));
create policy members_delete on public.shop_members for delete using (public.is_owner(shop_id) or user_id = auth.uid());

-- danh mục: mọi thành viên xem và thêm; quản lý trở lên sửa/xóa
do $$
declare t text;
begin
  foreach t in array array['products','partners'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(shop_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_member(shop_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_manager(shop_id)) with check (public.is_manager(shop_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_manager(shop_id))', t);
  end loop;
  foreach t in array array['purchases','sales','cash_entries','stock_adjustments'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(shop_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_member(shop_id) and created_by = auth.uid())', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.can_modify(shop_id, created_by, created_at)) with check (public.is_member(shop_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.can_modify(shop_id, created_by, created_at))', t);
  end loop;
end $$;

-- thu ngân không thấy nhật ký; chủ và quản lý xem được
create policy audit_select on public.audit_log for select using (public.is_manager(shop_id));

-- =====================================================================
-- Hàm nghiệp vụ (RPC)
-- =====================================================================

-- Tạo quán mới, người tạo thành chủ quán
create or replace function public.create_shop(p_name text, p_phone text default null, p_address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Cần đăng nhập'; end if;
  insert into public.shops (name, phone, address, created_by) values (trim(p_name), p_phone, p_address, v_uid) returning id into v_id;
  insert into public.shop_members (shop_id, user_id, role, display_name)
    values (v_id, v_uid, 'owner', (select coalesce(raw_user_meta_data->>'full_name', email) from auth.users where id = v_uid));
  return v_id;
end $$;

-- Chủ quán thêm nhân viên bằng email (nhân viên phải đăng ký tài khoản trước)
create or replace function public.add_member(p_shop uuid, p_email text, p_role public.member_role default 'cashier')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  if not public.is_owner(p_shop) then raise exception 'Chỉ chủ quán được thêm nhân viên'; end if;
  select id, coalesce(raw_user_meta_data->>'full_name', email) into v_user, v_name
    from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'Chưa có tài khoản với email %. Nhờ nhân viên đăng ký trước.', p_email; end if;
  insert into public.shop_members (shop_id, user_id, role, display_name) values (p_shop, v_user, p_role, v_name)
    on conflict (shop_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

-- Danh sách thành viên kèm email (chỉ người trong quán)
create or replace function public.list_members(p_shop uuid)
returns table (user_id uuid, role public.member_role, display_name text, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.display_name, u.email::text, m.created_at
  from public.shop_members m join auth.users u on u.id = m.user_id
  where m.shop_id = p_shop and public.is_member(p_shop)
  order by m.role, m.created_at
$$;

-- Giá vốn bình quân gia quyền (gồm cước) theo sản phẩm, tính đến ngày p_to
create or replace function public.product_costs(p_shop uuid, p_to date default null)
returns table (product_id uuid, avg_cost numeric)
language sql stable security invoker as $$
  select product_id, sum(qty * unit_price + freight) / nullif(sum(qty), 0)
  from public.purchases
  where shop_id = p_shop and (p_to is null or date <= p_to)
  group by product_id
$$;

-- Tồn kho đến hết ngày p_date
create or replace function public.stock_levels(p_shop uuid, p_date date default current_date)
returns table (product_id uuid, name text, in_qty numeric, out_qty numeric, adj_qty numeric, on_hand numeric,
               avg_cost numeric, last_sell_price bigint, last_buy_price bigint)
language sql stable security invoker as $$
  with b as (select product_id, sum(qty) q from public.purchases where shop_id = p_shop and date <= p_date group by 1),
       s as (select product_id, sum(qty) q from public.sales where shop_id = p_shop and date <= p_date group by 1),
       a as (select product_id, sum(qty) q from public.stock_adjustments where shop_id = p_shop and date <= p_date group by 1),
       c as (select * from public.product_costs(p_shop, null)),
       ls as (select distinct on (product_id) product_id, unit_price from public.sales where shop_id = p_shop order by product_id, date desc, created_at desc),
       lb as (select distinct on (product_id) product_id, unit_price from public.purchases where shop_id = p_shop order by product_id, date desc, created_at desc)
  select p.id, p.name, coalesce(b.q,0), coalesce(s.q,0), coalesce(a.q,0),
         coalesce(b.q,0) - coalesce(s.q,0) - coalesce(a.q,0),
         c.avg_cost, ls.unit_price, lb.unit_price
  from public.products p
  left join b on b.product_id = p.id left join s on s.product_id = p.id left join a on a.product_id = p.id
  left join c on c.product_id = p.id left join ls on ls.product_id = p.id left join lb on lb.product_id = p.id
  where p.shop_id = p_shop and (b.q is not null or s.q is not null or a.q is not null or p.active)
  order by p.name
$$;

-- Lãi lỗ theo ngày (dồn tích): doanh thu tại ngày bán, giá vốn bình quân
create or replace function public.daily_pnl(p_shop uuid, p_from date, p_to date)
returns table (day date, revenue numeric, service numeric, cogs numeric, loss numeric,
               other_in numeric, other_out numeric, purchases numeric, freight numeric,
               orders bigint, qty numeric, net numeric)
language sql stable security invoker as $$
  with c as (select * from public.product_costs(p_shop, null)),
  d as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  s as (select s.date, sum(s.qty * s.unit_price) rev, sum(s.processing_fee + s.shipping_fee) svc,
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

-- Lãi theo sản phẩm trong khoảng ngày
create or replace function public.product_pnl(p_shop uuid, p_from date, p_to date)
returns table (product_id uuid, name text, qty numeric, revenue numeric, cogs numeric, loss numeric, has_cost boolean)
language sql stable security invoker as $$
  with c as (select * from public.product_costs(p_shop, null)),
  s as (select product_id, sum(qty) q, sum(qty*unit_price) rev from public.sales
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

-- Dòng tiền thực (tiền vào/ra theo ngày trả tiền)
create or replace function public.cash_flow(p_shop uuid, p_from date, p_to date)
returns table (sales_cash numeric, sales_bank numeric, debt_collected numeric, other_in_cash numeric, other_in_bank numeric,
               purchases_cash numeric, purchases_bank numeric, freight numeric, debt_paid numeric,
               other_out_cash numeric, other_out_bank numeric,
               cash_in numeric, cash_out numeric, bank_in numeric, bank_out numeric)
language sql stable security invoker as $$
  with s as (
    select coalesce(paid_at, date) pd, date, pay_method, qty*unit_price + processing_fee + shipping_fee v
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

-- Tất toán công nợ của một khách hoặc một mối hàng
create or replace function public.settle_debt(p_shop uuid, p_partner uuid, p_kind public.partner_kind,
                                              p_method public.pay_method, p_date date default current_date)
returns integer language plpgsql security invoker as $$
declare n integer;
begin
  if not public.is_manager(p_shop) then raise exception 'Chỉ chủ quán hoặc quản lý được tất toán công nợ'; end if;
  if p_kind = 'customer' then
    update public.sales set paid = true, paid_at = p_date, pay_method = p_method
      where shop_id = p_shop and customer_id is not distinct from p_partner and not paid;
  else
    update public.purchases set paid = true, paid_at = p_date, pay_method = p_method
      where shop_id = p_shop and supplier_id is not distinct from p_partner and not paid;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- Tìm hoặc tạo sản phẩm / đối tác theo tên (dùng cho ô nhập nhanh và nhập Excel)
create or replace function public.ensure_product(p_shop uuid, p_name text)
returns uuid language plpgsql security invoker as $$
declare v uuid; n text := lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
begin
  if not public.is_member(p_shop) then raise exception 'Không có quyền'; end if;
  select id into v from public.products where shop_id = p_shop and lower(name) = n;
  if v is null then
    insert into public.products (shop_id, name) values (p_shop, n)
      on conflict (shop_id, lower(name)) do nothing returning id into v;
    if v is null then select id into v from public.products where shop_id = p_shop and lower(name) = n; end if;
  end if;
  return v;
end $$;

create or replace function public.ensure_partner(p_shop uuid, p_kind public.partner_kind, p_name text)
returns uuid language plpgsql security invoker as $$
declare v uuid; n text := lower(regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g'));
begin
  if n = '' then return null; end if;
  if not public.is_member(p_shop) then raise exception 'Không có quyền'; end if;
  select id into v from public.partners where shop_id = p_shop and kind = p_kind and lower(name) = n;
  if v is null then
    insert into public.partners (shop_id, kind, name) values (p_shop, p_kind, n)
      on conflict (shop_id, kind, lower(name)) do nothing returning id into v;
    if v is null then select id into v from public.partners where shop_id = p_shop and kind = p_kind and lower(name) = n; end if;
  end if;
  return v;
end $$;

-- Quyền thực thi
revoke all on function public.create_shop, public.add_member, public.list_members, public.settle_debt,
  public.ensure_product, public.ensure_partner, public.daily_pnl, public.product_pnl, public.cash_flow,
  public.stock_levels, public.product_costs from public;
grant execute on function public.create_shop, public.add_member, public.list_members, public.settle_debt,
  public.ensure_product, public.ensure_partner, public.daily_pnl, public.product_pnl, public.cash_flow,
  public.stock_levels, public.product_costs to authenticated;

grant select, insert, update, delete on public.shops, public.shop_members, public.products, public.partners,
  public.purchases, public.sales, public.cash_entries, public.stock_adjustments to authenticated;
grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.audit_log from authenticated, anon;
