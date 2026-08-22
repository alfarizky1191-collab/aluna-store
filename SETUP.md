# Setup Aluna Store Dinamis

Kode di branch ini tidak mengubah website aktif sampai pengujian selesai dan branch digabung ke `main`.

## Status Supabase

- Proyek: `aluna-store`
- Region: Singapore (`ap-southeast-1`)
- Schema, RLS, Storage, dan data awal sudah dipasang.
- Website sudah menggunakan modern publishable key, bukan `service_role`/secret key.

File `supabase/schema.sql` disimpan sebagai sumber schema dan pemulihan. Jangan menjalankannya ulang tanpa meninjau perubahan data lebih dahulu.

## 1. Buat satu akun admin

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

## 2. Pengujian sebelum merge

1. Login ke `/admin/`.
2. Tambah satu produk percobaan beserta foto.
3. Edit nama dan harga.
4. Sembunyikan lalu tampilkan kembali produk.
5. Uji Food dan Apps secara terpisah.
6. Pastikan pesan checkout membuka WhatsApp dengan harga terbaru.
7. Hapus produk percobaan.

Setelah semua berhasil, branch dapat digabung ke `main` agar GitHub Pages memperbarui `alunastore.my.id`.
