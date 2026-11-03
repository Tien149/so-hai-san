\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000a2','amt@a.vn','{}');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select public.create_shop('Amount test') as shop \gset
select public.ensure_product(:'shop','ốc hương') as p \gset
-- không gửi thành tiền: tự tính kg × giá
insert into sales (shop_id,date,product_id,qty,unit_price) values (:'shop','2026-11-03',:'p',1.5,270000) returning amount as auto_405000 \gset
select :auto_405000 = 405000 as auto_ok;
-- khách mua 100k: kg làm tròn 0,370 nhưng sổ ghi đúng 100k
insert into sales (shop_id,date,product_id,qty,unit_price,amount) values (:'shop','2026-11-03',:'p',0.370,270000,100000) returning id as s2 \gset
select revenue = 505000 as pnl_uses_amount from daily_pnl(:'shop','2026-11-03','2026-11-03');
select revenue = 505000 as product_pnl_ok from product_pnl(:'shop','2026-11-03','2026-11-03');
select sales_cash = 505000 as cash_flow_ok from cash_flow(:'shop','2026-11-03','2026-11-03');
-- sửa kg mà không gửi thành tiền mới: tính lại
update sales set qty = 1 where id = :'s2';
select amount = 270000 as recalculated from sales where id = :'s2';
-- sửa kg kèm thành tiền mới: giữ đúng số gửi
update sales set qty = 0.741, amount = 200000 where id = :'s2';
select amount = 200000 as kept from sales where id = :'s2';
