-- Aluna Store: database, RLS, Storage, dan data awal.
-- Jalankan seluruh file ini sekali dari Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('food', 'apps')),
  name text not null check (char_length(name) between 1 and 100),
  description text check (description is null or char_length(description) <= 300),
  image_url text,
  base_price integer not null default 0 check (base_price >= 0),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price integer not null check (price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  group_name text not null check (char_length(group_name) between 1 and 50),
  name text not null check (char_length(name) between 1 and 80),
  price_adjustment integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists products_category_active_sort_idx on public.products(category, is_active, sort_order);
create index if not exists product_variants_product_sort_idx on public.product_variants(product_id, sort_order);
create index if not exists product_options_product_sort_idx on public.product_options(product_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admins enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_options enable row level security;

drop policy if exists "Admin reads own access" on public.admins;
create policy "Admin reads own access" on public.admins
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Public reads active products" on public.products;
create policy "Public reads active products" on public.products
for select to anon, authenticated
using (is_active or public.is_admin());

drop policy if exists "Admin inserts products" on public.products;
create policy "Admin inserts products" on public.products
for insert to authenticated
with check (public.is_admin());

drop policy if exists "Admin updates products" on public.products;
create policy "Admin updates products" on public.products
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin deletes products" on public.products;
create policy "Admin deletes products" on public.products
for delete to authenticated
using (public.is_admin());

drop policy if exists "Public reads active variants" on public.product_variants;
create policy "Public reads active variants" on public.product_variants
for select to anon, authenticated
using (
  public.is_admin() or (
    is_active and exists (
      select 1 from public.products
      where products.id = product_variants.product_id and products.is_active
    )
  )
);

drop policy if exists "Admin inserts variants" on public.product_variants;
create policy "Admin inserts variants" on public.product_variants
for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin updates variants" on public.product_variants;
create policy "Admin updates variants" on public.product_variants
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin deletes variants" on public.product_variants;
create policy "Admin deletes variants" on public.product_variants
for delete to authenticated using (public.is_admin());

drop policy if exists "Public reads active options" on public.product_options;
create policy "Public reads active options" on public.product_options
for select to anon, authenticated
using (
  public.is_admin() or (
    is_active and exists (
      select 1 from public.products
      where products.id = product_options.product_id and products.is_active
    )
  )
);

drop policy if exists "Admin inserts options" on public.product_options;
create policy "Admin inserts options" on public.product_options
for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin updates options" on public.product_options;
create policy "Admin updates options" on public.product_options
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin deletes options" on public.product_options;
create policy "Admin deletes options" on public.product_options
for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads product images" on storage.objects;
create policy "Public reads product images" on storage.objects
for select to public using (bucket_id = 'product-images');

drop policy if exists "Admin uploads product images" on storage.objects;
create policy "Admin uploads product images" on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admin updates product images" on storage.objects;
create policy "Admin updates product images" on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admin deletes product images" on storage.objects;
create policy "Admin deletes product images" on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and public.is_admin());

-- Data awal dari website lama. ON CONFLICT DO NOTHING agar perubahan admin tidak tertimpa.
insert into public.products (id, category, name, image_url, base_price, is_featured, sort_order)
values
  ('00000000-0000-4000-8000-000000000001','food','Batagor','https://i.imgur.com/JiFateR.jpeg',5000,true,1),
  ('00000000-0000-4000-8000-000000000002','food','Mie Level','https://i.imgur.com/u6FXtL7.jpeg',8000,true,2),
  ('00000000-0000-4000-8000-000000000003','food','Cilok','https://i.imgur.com/xvHP2rG.jpeg',5000,false,3),
  ('00000000-0000-4000-8000-000000000004','food','Es Potong Milo (full)','https://i.imgur.com/3ilf7yY.jpeg',4000,false,4),
  ('00000000-0000-4000-8000-000000000005','food','Es Potong Milo (half)','https://i.imgur.com/3ilf7yY.jpeg',2000,false,5),
  ('00000000-0000-4000-8000-000000000006','food','Es Potong Real Good (full)','https://i.imgur.com/3ilf7yY.jpeg',2000,false,6),
  ('00000000-0000-4000-8000-000000000007','food','Es Potong Real Good (1/2)','https://i.imgur.com/3ilf7yY.jpeg',1000,false,7),
  ('00000000-0000-4000-8000-000000000008','food','Suki Bakar','https://i.imgur.com/LPkTB2B.jpeg',5000,false,8),
  ('00000000-0000-4000-8000-000000000009','food','Sosis Bakar','https://i.imgur.com/ZxwgE0.jpeg',5000,false,9),
  ('00000000-0000-4000-8000-000000000010','food','Jasuke','https://i.imgur.com/OGNZogQ.jpeg',5000,false,10),
  ('10000000-0000-4000-8000-000000000001','apps','Netflix','https://upload.wikimedia.org/wikipedia/commons/7/75/Netflix_icon.svg',35000,false,1),
  ('10000000-0000-4000-8000-000000000002','apps','Spotify','https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg',29000,false,2),
  ('10000000-0000-4000-8000-000000000003','apps','ChatGPT Plus Sharing','https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',10000,false,3),
  ('10000000-0000-4000-8000-000000000004','apps','Canva','https://upload.wikimedia.org/wikipedia/commons/0/08/Canva_icon_2021.svg',3000,false,4),
  ('10000000-0000-4000-8000-000000000005','apps','YouTube','https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg',5000,false,5),
  ('10000000-0000-4000-8000-000000000006','apps','CapCut','https://upload.wikimedia.org/wikipedia/commons/6/64/CapCut_Logo.png',20000,false,6),
  ('10000000-0000-4000-8000-000000000007','apps','Grammarly','https://upload.wikimedia.org/wikipedia/commons/0/0c/Grammarly_logo.svg',13000,false,7),
  ('10000000-0000-4000-8000-000000000008','apps','iQIYI','https://upload.wikimedia.org/wikipedia/commons/6/6a/IQIYI_logo.svg',10000,false,8),
  ('10000000-0000-4000-8000-000000000009','apps','WeTV','https://upload.wikimedia.org/wikipedia/commons/2/2e/Tencent_Video_logo.svg',15000,false,9),
  ('10000000-0000-4000-8000-000000000010','apps','Amazon Prime','https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png',10000,false,10),
  ('10000000-0000-4000-8000-000000000011','apps','VSCO','https://upload.wikimedia.org/wikipedia/commons/3/3c/VSCO_Logo.png',20000,false,11),
  ('10000000-0000-4000-8000-000000000012','apps','Lightroom','https://upload.wikimedia.org/wikipedia/commons/4/4d/Adobe_Photoshop_Lightroom_CC_logo.svg',15000,false,12),
  ('10000000-0000-4000-8000-000000000013','apps','PicsArt','https://upload.wikimedia.org/wikipedia/commons/4/49/PicsArt_Logo.svg',10000,false,13),
  ('10000000-0000-4000-8000-000000000014','apps','Wattpad','https://upload.wikimedia.org/wikipedia/commons/8/82/Wattpad_logo.png',15000,false,14),
  ('10000000-0000-4000-8000-000000000015','apps','Telegram','https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',175000,false,15),
  ('10000000-0000-4000-8000-000000000016','apps','LokLok','https://upload.wikimedia.org/wikipedia/commons/3/3a/Popcorn.png',25000,false,16),
  ('10000000-0000-4000-8000-000000000017','apps','Youku','https://upload.wikimedia.org/wikipedia/commons/3/3c/Youku_logo.png',15000,false,17),
  ('10000000-0000-4000-8000-000000000018','apps','Bstation','https://upload.wikimedia.org/wikipedia/commons/1/12/Bilibili_logo.svg',15000,false,18),
  ('10000000-0000-4000-8000-000000000019','apps','GetContact','https://upload.wikimedia.org/wikipedia/commons/0/02/Phone_icon.png',15000,false,19)
on conflict (id) do nothing;

insert into public.product_options (id, product_id, group_name, name, sort_order)
values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Tipe','Kuah',1),
  ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Tipe','Kering',2),
  ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Level','Level 0',1),
  ('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','Level','Level 1/2',2),
  ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','Level','Level 1',3),
  ('20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000002','Level','Level 2',4),
  ('20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000002','Level','Level 3',5),
  ('20000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000006','Rasa','Coklat',1),
  ('20000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000006','Rasa','Strawberry',2),
  ('20000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000006','Rasa','Blueberry',3),
  ('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000006','Rasa','Guava',4),
  ('20000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000006','Rasa','Blackcurrant',5),
  ('20000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000007','Rasa','Coklat',1),
  ('20000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000007','Rasa','Strawberry',2),
  ('20000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000007','Rasa','Blueberry',3),
  ('20000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000007','Rasa','Guava',4),
  ('20000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000007','Rasa','Blackcurrant',5)
on conflict (id) do nothing;

insert into public.product_variants (id, product_id, name, price, sort_order)
values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Sharing',35000,1),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Semi Private',45000,2),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Famplan',29000,1),
  ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Indplan',41000,2),
  ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003','Fulgar',20000,1),
  ('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003','Nogar',10000,2),
  ('30000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000004','1 Bulan',3000,1),
  ('30000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000004','3 Bulan',10000,2),
  ('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000004','1 Tahun',15000,3),
  ('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000005','1 Bulan',5000,1),
  ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000005','3 Bulan',10000,2),
  ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000006','Sharing',20000,1),
  ('30000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000007','1 Bulan',13000,1),
  ('30000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000007','3 Bulan',24000,2),
  ('30000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000008','Sharing',10000,1),
  ('30000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000008','Private',35000,2),
  ('30000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000008','1 Tahun',25000,3),
  ('30000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000009','Sharing',15000,1),
  ('30000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000009','Private',35000,2),
  ('30000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000010','Sharing',10000,1),
  ('30000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000010','Private',30000,2),
  ('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000011','1 Tahun',20000,1),
  ('30000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000012','1 Tahun',15000,1),
  ('30000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000013','Sharing',10000,1),
  ('30000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000013','Private',15000,2),
  ('30000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000014','Sharing',15000,1),
  ('30000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000015','3 Bulan',175000,1),
  ('30000000-0000-4000-8000-000000000028','10000000-0000-4000-8000-000000000016','Sharing',25000,1),
  ('30000000-0000-4000-8000-000000000029','10000000-0000-4000-8000-000000000017','1 Bulan',15000,1),
  ('30000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000017','3 Bulan',24000,2),
  ('30000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000017','1 Tahun',30000,3),
  ('30000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000018','1 Bulan',15000,1),
  ('30000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000018','1 Tahun',25000,2),
  ('30000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000019','1 Bulan',15000,1)
on conflict (id) do nothing;

-- Setelah membuat satu user di Authentication > Users, jadikan user itu admin:
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'EMAIL_ADMIN_KAMU'
-- on conflict (user_id) do nothing;
