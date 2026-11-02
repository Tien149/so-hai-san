\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','s1@a.vn','{}'),('00000000-0000-0000-0000-0000000000c1','s2@a.vn','{}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.create_shop('Ship test') as shop \gset
select public.add_member(:'shop', 's2@a.vn', 'cashier');
select public.ensure_product(:'shop','ghẹ') as p \gset
select public.ensure_partner(:'shop','customer','nam') as nam \gset
select public.ensure_partner(:'shop','customer','lan') as lan \gset
insert into shippers (shop_id,name,kind,monthly_salary) values (:'shop','tuấn','staff',6000000) returning id as tuan \gset
insert into shippers (shop_id,name,kind,per_order_fee) values (:'shop','grab','outside',25000) returning id as grab \gset
-- nam: 2 món cùng chuyến grab; lan: 1 món grab; khách lẻ 1 món tuấn
insert into sales (shop_id,date,product_id,customer_id,qty,unit_price,shipper_id) values
 (:'shop','2026-11-02',:'p',:'nam',1,100000,:'grab'),(:'shop','2026-11-02',:'p',:'nam',2,100000,:'grab'),
 (:'shop','2026-11-02',:'p',:'lan',1,100000,:'grab'),(:'shop','2026-11-02',:'p',null,1,100000,:'tuan'),
 (:'shop','2026-10-20',:'p',:'lan',1,100000,:'grab');
select count(*) deliveries_should_be_4 from deliveries;
select sh.name, d.date, d.fee from deliveries d join shippers sh on sh.id=d.shipper_id order by d.date, sh.name;
insert into cash_entries (shop_id,date,direction,category,amount,shipper_id,period) values (:'shop','2026-11-02','out','Trả shipper',25000,:'grab','2026-11-01');
select name, orders, fees, salary, due, paid, prev_debt, balance from shipper_month(:'shop','2026-11-15');
-- đổi shipper của khách lan sang tuấn: chuyến grab của lan bị xóa
update sales set shipper_id = :'tuan' where customer_id = :'lan' and date = '2026-11-02';
select count(*) deliveries_should_be_4_again from deliveries;
-- xóa 1 món của nam: chuyến vẫn còn; xóa món còn lại: chuyến mất
delete from sales where customer_id = :'nam' and qty = 1;
select count(*) still_4 from deliveries;
delete from sales where customer_id = :'nam';
select count(*) now_3 from deliveries;
-- bỏ shipper
update sales set shipper_id = null where customer_id = :'lan' and date = '2026-11-02';
select count(*) now_2 from deliveries;
-- thu ngân: không sửa được lương shipper, nhưng bán có shipper được
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update shippers set monthly_salary = 1 where id = :'tuan';
select monthly_salary as salary_unchanged from shippers where id = :'tuan';
insert into sales (shop_id,date,product_id,customer_id,qty,unit_price,shipper_id) values (:'shop','2026-11-02',:'p',:'nam',1,100000,:'grab');
select count(*) cashier_delivery_ok from deliveries where created_by = auth.uid();
\set ON_ERROR_STOP 0
insert into shippers (shop_id,name) values (:'shop','x');
select table_name, action from audit_log order by id desc limit 3;
