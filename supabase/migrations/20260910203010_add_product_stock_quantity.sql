alter table public.products
add column stock_quantity integer
check (stock_quantity is null or stock_quantity >= 0);
