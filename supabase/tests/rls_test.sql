\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','chu@a.vn','{"full_name":"Chủ A"}'),
 ('00000000-0000-0000-0000-00000000000b','chu@b.vn','{}'),('00000000-0000-0000-0000-00000000000c','thungan@a.vn','{}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_shop('Hải sản A') as shop_a \gset
select public.add_member(:'shop_a', 'thungan@a.vn', 'cashier');
select public.ensure_product(:'shop_a','  Ốc   Hương ') as p1 \gset
select public.ensure_product(:'shop_a','ốc hương') = :'p1' as same_product;
select public.ensure_partner(:'shop_a','supplier','hân vỏ') as sup \gset
select public.ensure_partner(:'shop_a','customer','mai lan') as cus \gset
insert into purchases (shop_id,date,product_id,supplier_id,qty,unit_price,freight) values (:'shop_a','2026-10-30',:'p1',:'sup',10,135000,20000);
insert into sales (shop_id,date,product_id,customer_id,qty,unit_price,processing_fee,paid) values (:'shop_a','2026-10-31',:'p1',:'cus',1.5,270000,20000,false);
insert into cash_entries (shop_id,date,direction,category,amount) values (:'shop_a','2026-10-31','out','đá lạnh',50000);
insert into stock_adjustments (shop_id,date,product_id,qty) values (:'shop_a','2026-10-31',:'p1',0.5);
select * from stock_levels(:'shop_a','2026-11-02');
select day,revenue,service,cogs,loss,other_out,purchases,net from daily_pnl(:'shop_a','2026-10-30','2026-10-31');
select * from cash_flow(:'shop_a','2026-10-30','2026-11-02');
-- thu ngân
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select count(*) as cashier_sees_sales from sales;
select count(*) as cashier_sees_audit from audit_log;
update sales set unit_price = 1 where shop_id = :'shop_a';  -- dòng của người khác: 0 rows
insert into sales (shop_id,date,product_id,qty,unit_price) values (:'shop_a','2026-11-02',:'p1',1,300000);
update sales set unit_price = 310000 where created_by = auth.uid();
-- chủ quán B không thấy gì của A
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.create_shop('Hải sản B') as shop_b \gset
select count(*) as b_sees_a_sales from sales where shop_id = :'shop_a';
select count(*) as b_sees_a_products from products where shop_id = :'shop_a';
\set ON_ERROR_STOP 0
insert into sales (shop_id,product_id,qty,unit_price) values (:'shop_a',:'p1',1,1);
select public.ensure_product(:'shop_b','x') as pb \gset
insert into sales (shop_id,product_id,qty,unit_price) values (:'shop_b',:'p1',1,1);
select * from daily_pnl(:'shop_a','2026-10-30','2026-10-31');
-- chủ A
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select settle_debt(:'shop_a', :'cus', 'customer', 'bank', '2026-11-01');
delete from audit_log;
update audit_log set actor = null;
delete from shop_members where user_id = auth.uid();
select table_name, action, actor is not null as has_actor, count(*) from audit_log group by 1,2,3 order by 1,2;
select new_data->>'unit_price' np, old_data->>'unit_price' op from audit_log where table_name='sales' and action='update' and old_data->>'paid'='true';
reset role;
\set ON_ERROR_STOP 1
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from shops where id = :'shop_a';
reset role;
select count(*) as left_rows from audit_log where shop_id = :'shop_a';
