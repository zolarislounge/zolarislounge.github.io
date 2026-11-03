-- شماره‌ی پروفایل همیشه همون شماره‌ی تأییدشده‌ی حساب (از توکن ورود) باشه، نه چیزی که مشتری بفرسته.
-- فقط مدیر می‌تونه شماره‌ی پروفایل مشتری رو دستی عوض کنه.
create or replace function public._profiles_guard()
 returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin_phone(auth.jwt() ->> 'phone') then
    if tg_op = 'INSERT' then new.blocked := false; else new.blocked := old.blocked; end if;
    new.phone := public._normalize_ir_mobile(auth.jwt() ->> 'phone');
  end if;
  return new;
end $$;
