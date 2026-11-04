-- نقش‌ها و دسترسی‌های مدیرها
-- owner (مالک): همه‌ی دسترسی‌ها + مدیریت مدیرها. admin: فقط بخش‌هایی که در perms آمده.
-- بخش‌ها: dash (داشبورد و آمار)، orders، products، coupons، customers، reviews، settings (پرداخت و گزارش‌ها)
-- همه‌ی محدودیت‌ها سمت دیتابیس (RLS) اعمال می‌شن، نه فقط با پنهان کردن منو.

alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins add column if not exists perms text[] not null default '{}';
alter table public.admins add column if not exists name text;
alter table public.admins add column if not exists created_at timestamptz not null default now();
do $$ begin
  alter table public.admins add constraint admins_role_check check (role in ('owner', 'admin'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.admins add constraint admins_perms_check
    check (perms <@ array['dash','orders','products','coupons','customers','reviews','settings']::text[]);
exception when duplicate_object then null; end $$;

-- مالک‌های فروشگاه
update public.admins set role = 'owner' where phone in ('989121816762', '989128836441');

create or replace function public.has_perm(p text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from admins a
                  where a.phone = (auth.jwt() ->> 'phone')
                    and (a.role = 'owner' or p = any(a.perms)));
$$;
create or replace function public.is_owner()
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from admins a where a.phone = (auth.jwt() ->> 'phone') and a.role = 'owner');
$$;
revoke execute on function public.has_perm(text) from public;
revoke execute on function public.is_owner() from public;
grant execute on function public.has_perm(text) to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;

create or replace function public.admin_place_order(p_items jsonb, p_name text, p_phone text, p_address text, p_note text default null, p_pay text default 'card', p_source text default null, p_discount bigint default 0, p_sms boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare o record; attempt int := 0;
begin
  if not has_perm('orders') then raise exception 'HG_ADMIN'; end if;
  if coalesce(p_pay, '') not in ('card', 'cod', 'unpaid') then raise exception 'HG_ITEMS'; end if;
  perform set_config('hg.admin_order', '1', true);
  perform set_config('hg.admin_pay', p_pay, true);
  perform set_config('hg.admin_source', coalesce(left(btrim(p_source), 40), ''), true);
  perform set_config('hg.admin_discount', greatest(coalesce(p_discount, 0), 0)::text, true);
  perform set_config('hg.admin_sms', case when p_sms then '1' else '' end, true);
  loop
    begin
      insert into orders(items, customer_name, customer_phone, customer_address, customer_note, tracking_code)
        values (p_items, p_name, p_phone, p_address, p_note, (100000 + floor(random() * 900000))::int::text)
        returning tracking_code, total, discount_amount, status into o;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  perform set_config('hg.admin_order', '', true);
  perform set_config('hg.admin_pay', '', true);
  perform set_config('hg.admin_source', '', true);
  perform set_config('hg.admin_discount', '', true);
  perform set_config('hg.admin_sms', '', true);
  return jsonb_build_object('tracking_code', o.tracking_code, 'total', o.total, 'discount', o.discount_amount, 'status', o.status);
end $$;

create or replace function public.admin_analytics(p_days integer default 30)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare since timestamptz := case when coalesce(p_days, 0) > 0 then now() - make_interval(days => p_days) else '-infinity'::timestamptz end;
begin
  if not has_perm('dash') then raise exception 'HG_ADMIN'; end if;
  return jsonb_build_object(
    'totals', (select jsonb_build_object(
        'visits', (select count(distinct session) from site_events where kind = 'visit' and created_at >= since),
        'viewers', (select count(distinct session) from site_events where kind = 'view' and created_at >= since),
        'carts', (select count(distinct session) from site_events where kind = 'cart' and created_at >= since),
        'orders', (select count(*) from orders o where o.created_at >= since and o.status not in ('در انتظار پرداخت', 'لغو شده') and not o.pay_sandbox),
        'revenue', (select coalesce(sum(total), 0) from orders o where o.created_at >= since and o.status not in ('در انتظار پرداخت', 'لغو شده') and not o.pay_sandbox))),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', nullif(k, ''), 'visits', coalesce(v.n, 0), 'orders', coalesce(s.n, 0), 'revenue', coalesce(s.rev, 0))
                                          order by coalesce(s.rev, 0) desc, coalesce(v.n, 0) desc), '[]'::jsonb)
        from (select coalesce(source, '') k from site_events where kind = 'visit' and created_at >= since
              union select coalesce(source, '') from orders where created_at >= since) keys
        left join (select coalesce(source, '') k2, count(distinct session) n from site_events where kind = 'visit' and created_at >= since group by 1) v on v.k2 = keys.k
        left join (select coalesce(source, '') k3, count(*) n, sum(total) rev from orders o
                    where o.created_at >= since and o.status not in ('در انتظار پرداخت', 'لغو شده') and not o.pay_sandbox group by 1) s on s.k3 = keys.k),
    'products', (select coalesce(jsonb_agg(x order by x.views desc, x.sold desc), '[]'::jsonb) from (
        select p.id, p.name,
          (select count(distinct session) from site_events e where e.kind = 'view' and e.product_id = p.id and e.created_at >= since) views,
          (select count(distinct session) from site_events e where e.kind = 'cart' and e.product_id = p.id and e.created_at >= since) carts,
          coalesce((select sum((it ->> 'qty')::int) from orders o, jsonb_array_elements(o.items) it
                     where o.created_at >= since and o.status not in ('در انتظار پرداخت', 'لغو شده') and not o.pay_sandbox
                       and (it ->> 'id')::bigint = p.id), 0) sold
        from products p) x where x.views > 0 or x.carts > 0 or x.sold > 0)
  );
end $$;

-- ───── سیاست‌های دسترسی ─────
drop policy if exists "Admins can view logs" on public.admin_logs;
create policy "Admins can view logs" on public.admin_logs for select to public using (has_perm('settings'));

drop policy if exists "Admins read admin sessions" on public.admin_sessions;
create policy "Admins read admin sessions" on public.admin_sessions for select to public using (has_perm('settings'));

-- لیست مدیرها فقط برای مالک‌ها؛ هر مدیر ردیف خودش رو می‌بینه (برای دونستن دسترسی‌هاش)
drop policy if exists "Admins can view all admin phones" on public.admins;
create policy "Owners view all admins" on public.admins for select to public using (is_owner());

drop policy if exists "Admins manage coupons" on public.coupons;
create policy "Admins manage coupons" on public.coupons for all to public using (has_perm('coupons')) with check (has_perm('coupons'));

drop policy if exists "Admins can update orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Admins can delete orders" on public.orders;
create policy "Admins can view all orders" on public.orders for select to public using (has_perm('orders'));
create policy "Admins can update orders" on public.orders for update to public using (has_perm('orders'));
create policy "Admins can delete orders" on public.orders for delete to public using (has_perm('orders'));

drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can insert products" on public.products for insert to public with check (has_perm('products'));
create policy "Admins can update products" on public.products for update to public using (has_perm('products'));
create policy "Admins can delete products" on public.products for delete to public using (has_perm('products'));

drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles for select to public using (has_perm('customers'));
create policy "Admins can update profiles" on public.profiles for update to public using (has_perm('customers')) with check (has_perm('customers'));

drop policy if exists reviews_delete_admin on public.reviews;
drop policy if exists reviews_update_admin on public.reviews;
create policy reviews_delete_admin on public.reviews for delete to authenticated using (has_perm('reviews'));
create policy reviews_update_admin on public.reviews for update to authenticated using (has_perm('reviews')) with check (has_perm('reviews'));
-- مدیر نظرها، نظرهای تاییدنشده رو هم باید ببینه
drop policy if exists reviews_select_admin on public.reviews;
create policy reviews_select_admin on public.reviews for select to authenticated using (has_perm('reviews'));

drop policy if exists "Admins manage site settings" on public.site_settings;
create policy "Admins manage site settings" on public.site_settings for all to authenticated using (has_perm('settings')) with check (has_perm('settings'));

drop policy if exists "Admins can view stats" on public.site_stats;
create policy "Admins can view stats" on public.site_stats for select to public using (has_perm('dash'));

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'image' and public.has_perm('products'));
