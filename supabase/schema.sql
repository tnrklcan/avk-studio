-- AVK Studio - Supabase kurulum (SQL Editor'e bir kez yapıştırıp Run'a basın)
-- Supabase > Authentication > Providers > Email: "Confirm email" KAPALI olmalı.

create table if not exists public.members (
  email text primary key,
  full_name text,
  active boolean not null default true,
  is_admin boolean not null default false,
  added_at timestamptz not null default now(),
  last_seen timestamptz,
  app_version text,
  platform text
);
alter table public.members enable row level security;

-- Kimse tabloyu doğrudan okuyup yazamaz; her şey aşağıdaki fonksiyonlardan geçer.
drop policy if exists "no direct access" on public.members;
create policy "no direct access" on public.members for all using (false);

-- Kayıt: e-posta üye listesinde değilse veya pasifse hesap açılamaz.
create or replace function public.guard_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members m where lower(m.email) = lower(new.email) and m.active) then
    raise exception 'Bu e-posta AI Video Kulübü üye listesinde yok.';
  end if;
  return new;
end $$;
drop trigger if exists guard_signup on auth.users;
create trigger guard_signup before insert on auth.users
  for each row execute function public.guard_signup();

-- Giriş sonrası: üyelik hala aktif mi? (kullanıcı kendi durumunu görür)
create or replace function public.my_status(p_version text default null, p_platform text default null)
returns json language plpgsql security definer set search_path = public as $$
declare m public.members; mail text := lower(auth.jwt() ->> 'email');
begin
  select * into m from public.members where lower(email) = mail;
  if not found or not m.active then
    return json_build_object('active', false, 'is_admin', false);
  end if;
  update public.members set last_seen = now(), app_version = p_version, platform = p_platform where email = m.email;
  return json_build_object('active', true, 'is_admin', m.is_admin, 'full_name', m.full_name);
end $$;

-- Yönetici kontrolü
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.members where lower(email) = lower(auth.jwt() ->> 'email') and active and is_admin);
$$;

-- Admin: CSV'den gelen listeyi içe aktar. Listede OLMAYAN (admin hariç) üyeler pasife alınır.
-- p_rows: [{"email":"a@b.com","name":"Ad Soyad"}, ...]
create or replace function public.admin_import(p_rows jsonb, p_deactivate_missing boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare added int := 0; reactivated int := 0; deactivated int := 0; r jsonb; mail text;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    mail := lower(trim(r ->> 'email'));
    continue when mail is null or mail = '' or position('@' in mail) = 0;
    if exists (select 1 from public.members where email = mail) then
      update public.members set active = true, full_name = coalesce(nullif(r ->> 'name',''), full_name)
        where email = mail and not active;
      if found then reactivated := reactivated + 1; end if;
    else
      insert into public.members(email, full_name) values (mail, nullif(r ->> 'name',''));
      added := added + 1;
    end if;
  end loop;
  if p_deactivate_missing then
    update public.members set active = false
      where active and not is_admin
        and email not in (select lower(trim(x ->> 'email')) from jsonb_array_elements(p_rows) x);
    get diagnostics deactivated = row_count;
  end if;
  return json_build_object('added', added, 'reactivated', reactivated, 'deactivated', deactivated);
end $$;

create or replace function public.admin_list()
returns setof public.members language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
  return query select * from public.members order by added_at desc;
end $$;

create or replace function public.admin_set_active(p_email text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
  update public.members set active = p_active where lower(email) = lower(p_email) and not is_admin;
end $$;

-- Uzaktan ayar tablosu: Flow/ChatGPT arayüzü değişince düğme tarifini güncelleme çıkarmadan buradan düzeltirsiniz.
create table if not exists public.remote_config (key text primary key, value jsonb not null, updated_at timestamptz default now());
alter table public.remote_config enable row level security;
drop policy if exists "read config" on public.remote_config;
create policy "read config" on public.remote_config for select to authenticated using (true);

create or replace function public.admin_set_config(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok'; end if;
  insert into public.remote_config(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

grant execute on function public.my_status(text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_import(jsonb, boolean) to authenticated;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_set_active(text, boolean) to authenticated;
grant execute on function public.admin_set_config(text, jsonb) to authenticated;

-- YÖNETİCİ: aivideokulubu@gmail.com
insert into public.members(email, full_name, is_admin) values ('aivideokulubu@gmail.com', 'AI Video Kulübü', true)
  on conflict (email) do update set is_admin = true, active = true;
