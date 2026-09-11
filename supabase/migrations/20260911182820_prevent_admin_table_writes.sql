revoke insert, update, delete, truncate, references, trigger on table public.admins from authenticated;
revoke all privileges on table public.admins from anon;
grant select on table public.admins to authenticated;
