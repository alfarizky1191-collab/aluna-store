revoke all privileges on table public.admins from anon, authenticated;
grant select on table public.admins to authenticated;

revoke all privileges on table public.products, public.product_variants, public.product_options from anon, authenticated;
grant select on table public.products, public.product_variants, public.product_options to anon;
grant select, insert, update, delete on table public.products, public.product_variants, public.product_options to authenticated;

revoke execute on function private.set_updated_at() from public;
