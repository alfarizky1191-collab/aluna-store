# Setup Aluna Store Dinamis

Kode di branch ini tidak mengubah website aktif sampai konfigurasi selesai dan branch digabung ke `main`.

## 1. Buat proyek Supabase

1. Buat satu proyek khusus Aluna Store.
2. Buka **SQL Editor**.
3. Salin dan jalankan seluruh isi `supabase/schema.sql`.

Schema tersebut membuat tabel produk, varian, pilihan, bucket gambar, data produk lama, serta aturan Row Level Security (RLS).

## 2. Buat satu akun admin

1. Buka **Authentication → Users → Add user**.
2. Buat user dengan email dan password admin.
3. Jalankan SQL berikut dengan email yang sama:

```sql
insert into public.admins (user_id)
select id from auth.users
where email = 'ganti-dengan-email-admin'
on conflict (user_id) do nothing;
```

Setelah akun berhasil dibuat, matikan pendaftaran publik pada pengaturan Authentication karena aplikasi ini hanya menggunakan satu admin.

## 3. Hubungkan website

Ambil **Project URL** dan **Publishable key** dari pengaturan API Supabase, lalu isi:

```js
// assets/js/config.js
export const SUPABASE_URL = "https://PROJECT.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "PUBLISHABLE_KEY";
```

Publishable key memang digunakan di browser. Keamanan tetap dijaga oleh RLS. Jangan pernah memasukkan `service_role` key ke repository atau JavaScript website.

## 4. Pengujian sebelum merge

1. Login ke `/admin/`.
2. Tambah satu produk percobaan beserta foto.
3. Edit nama dan harga.
4. Sembunyikan lalu tampilkan kembali produk.
5. Uji Food dan Apps secara terpisah.
6. Pastikan pesan checkout membuka WhatsApp dengan harga terbaru.
7. Hapus produk percobaan.

Setelah semua berhasil, branch dapat digabung ke `main` agar GitHub Pages memperbarui `alunastore.my.id`.
