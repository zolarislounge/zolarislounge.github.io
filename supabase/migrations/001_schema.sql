-- Zolaris Lounge — ساختار دیتابیس
-- کپی از ساختار پروژه‌ی حناگالری (۱۴۰۵/۰۸)، برای یک پروژه‌ی Supabase کاملاً جدا.
-- هیچ داده‌ای (محصول، سفارش، مشتری) کپی نشده؛ فقط ساختار.
-- کدهای خطای HG_* عمداً همون‌طور مونده تا کد پنل مدیریت و سایت حناگالری بدون تغییر کار کنه.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ───────────── جدول‌ها ─────────────
create sequence if not exists public.admin_sessions_id_seq;

create table if not exists public.admins (
  phone text not null primary key
);

create table if not exists public.admin_logs (
  id bigint generated always as identity primary key,
  admin_phone text not null,
  action text not null,
  details text,
  created_at timestamptz default now() not null
);

create table if not exists public.admin_sessions (
  id bigint default nextval('admin_sessions_id_seq'::regclass) primary key,
  phone text not null,
  started_at timestamptz default now() not null,
  ended_at timestamptz default now() not null
);

create table if not exists public.coupons (
  code text not null primary key,
  discount_type text not null check (discount_type = any (array['percent','fixed'])),
  discount_value numeric not null check (discount_value > 0),
  max_uses integer,
  used_count integer default 0 not null,
  expires_at timestamptz,
  active boolean default true not null,
  created_at timestamptz default now() not null,
  one_per_customer boolean default false not null
);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null,
  category_label text not null,
  price integer not null,
  stock integer default 0 not null,
  is_new boolean default false,
  image_url text,
  created_at timestamptz default now(),
  variants text,
  sale_price numeric,
  description text,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  items jsonb not null,
  total integer not null,
  customer_note text,
  status text default 'جدید',
  created_at timestamptz default now(),
  customer_name text,
  customer_phone text,
  customer_address text,
  user_id uuid references auth.users(id),
  tracking_code text,
  coupon_code text,
  discount_amount integer default 0 not null,
  reserved_items jsonb,
  sms_sent boolean default false not null,
  post_carrier text,
  post_tracking text,
  shipped_sms_at timestamptz,
  payment_status text default 'unpaid' not null,
  pay_track_id bigint,
  pay_ref_number text,
  pay_card text,
  paid_at timestamptz,
  pay_amount bigint,
  pay_started_at timestamptz,
  pay_checked_at timestamptz,
  cancel_reason text,
  pay_sandbox boolean default false not null,
  source text,
  manual_pay text,
  constraint orders_source_len check (source is null or char_length(source) <= 40),
  constraint orders_pay_text_len check (coalesce(length(pay_ref_number),0) <= 64 and coalesce(length(pay_card),0) <= 32 and coalesce(length(cancel_reason),0) <= 32),
  constraint orders_payment_status_check check (payment_status = any (array['unpaid','pending','paid','failed','free','offline'])),
  constraint orders_post_carrier_len check (post_carrier is null or char_length(post_carrier) <= 30),
  constraint orders_post_tracking_len check (post_tracking is null or char_length(post_tracking) <= 60)
);
create unique index if not exists orders_tracking_code_key on public.orders (tracking_code);
create index if not exists orders_unpaid_idx on public.orders (created_at) where status = 'در انتظار پرداخت';

create table if not exists public.payment_attempts (
  track_id bigint not null primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  amount bigint not null,
  created_at timestamptz default now() not null,
  checked_at timestamptz,
  result integer
);
create index if not exists payment_attempts_order_idx on public.payment_attempts (order_id);

create table if not exists public.profiles (
  id uuid not null primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  updated_at timestamptz default now(),
  last_seen timestamptz,
  blocked boolean default false not null
);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) <= 80),
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text not null check (char_length(comment) >= 1 and char_length(comment) <= 1000),
  approved boolean default false not null,
  created_at timestamptz default now() not null,
  constraint reviews_one_per_user unique (product_id, user_id)
);

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz default now() not null,
  day date default ((now() at time zone 'Asia/Tehran'))::date not null,
  kind text not null check (kind = any (array['visit','view','cart'])),
  product_id bigint,
  source text check (source is null or char_length(source) <= 40),
  session text not null check (char_length(session) >= 8 and char_length(session) <= 40)
);
create unique index if not exists site_events_dedup on public.site_events (session, kind, coalesce(product_id, 0::bigint), day);
create index if not exists site_events_created_idx on public.site_events (created_at);

create table if not exists public.site_settings (
  key text not null primary key,
  value jsonb default '{}'::jsonb not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.site_stats (
  id integer default 1 not null primary key,
  visits bigint default 0 not null
);

create table if not exists public.wishlists (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique (user_id, product_id)
);

create index if not exists admin_sessions_phone_end on public.admin_sessions (phone, ended_at desc);

-- ───────────── توابع ─────────────
create or replace function public.is_admin_phone(check_phone text)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select check_phone is not null
     and check_phone = (auth.jwt() ->> 'phone')
     and exists (select 1 from admins where phone = check_phone);
$$;

create or replace function public._normalize_ir_mobile(p text)
 returns text language sql immutable set search_path to 'public'
as $$
  select case
    when d ~ '^09[0-9]{9}$' then d
    when d ~ '^9[0-9]{9}$' then '0' || d
    when d ~ '^989[0-9]{9}$' then '0' || substr(d, 3)
    when d ~ '^00989[0-9]{9}$' then '0' || substr(d, 5)
    else null end
  from (select regexp_replace(translate(coalesce(p, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g') as d) x
$$;

create or replace function public._variant_adjust(p_variants text, p_name text, p_delta integer, out new_variants text, out applied integer)
 returns record language plpgsql immutable set search_path to 'public'
as $$
declare parts text[]; seg text[]; cur int; nv int; i int;
begin
  applied := 0; new_variants := p_variants;
  if p_variants is null or p_name is null or p_delta = 0 then return; end if;
  parts := regexp_split_to_array(p_variants, '[,،]');
  for i in 1..coalesce(array_length(parts, 1), 0) loop
    seg := string_to_array(btrim(parts[i]), ':');
    if coalesce(array_length(seg, 1), 0) >= 2 and btrim(seg[1]) = btrim(p_name) then
      if btrim(seg[2]) = 'ناموجود' then cur := 0;
      elsif btrim(seg[2]) ~ '^[0-9]+$' then cur := btrim(seg[2])::int;
      else cur := null; end if;
      if cur is not null then
        nv := greatest(cur + p_delta, 0);
        applied := nv - cur;
        seg[1] := btrim(seg[1]);
        seg[2] := nv::text;
        parts[i] := array_to_string(seg, ':');
        new_variants := array_to_string(parts, ',');
      end if;
      return; -- only the first matching variant
    end if;
  end loop;
end $$;

create or replace function public._order_reserve(p_items jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  it jsonb; pid bigint; q int; vname text; cur int; taken int; vars text; adj record;
  result jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return result; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    begin
      pid := (it->>'id')::bigint;
      q := (it->>'qty')::int;
    exception when others then continue;
    end;
    if pid is null or q is null or q <= 0 then continue; end if;
    q := least(q, 1000);
    vname := nullif(it->>'variant', '');
    select stock, variants into cur, vars from products where id = pid for update;
    if not found then continue; end if;
    taken := least(coalesce(cur, 0), q);
    select * into adj from _variant_adjust(vars, vname, -q);
    update products set stock = coalesce(cur, 0) - taken, variants = adj.new_variants where id = pid;
    result := result || jsonb_build_object('id', pid, 'variant', vname, 'stock', taken, 'vstock', -adj.applied);
  end loop;
  return result;
end $$;

create or replace function public._order_release(p_reserved jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare it jsonb; pid bigint; vars text; adj record;
begin
  if p_reserved is null or jsonb_typeof(p_reserved) <> 'array' then return; end if;
  for it in select * from jsonb_array_elements(p_reserved) loop
    pid := (it->>'id')::bigint;
    select variants into vars from products where id = pid for update;
    if not found then continue; end if;
    select * into adj from _variant_adjust(vars, nullif(it->>'variant', ''), coalesce((it->>'vstock')::int, 0));
    update products
      set stock = coalesce(stock, 0) + coalesce((it->>'stock')::int, 0),
          variants = adj.new_variants
      where id = pid;
  end loop;
end $$;

create or replace function public._expire_unpaid_orders()
 returns integer language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  perform set_config('hg.trusted', '1', true);
  update orders set status = 'لغو شده', cancel_reason = 'expired',
         payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
   where status = 'در انتظار پرداخت'
     and (pay_checked_at is null or pay_checked_at < now() - interval '2 minutes')
     and (   (pay_started_at is null and created_at < now() - interval '30 minutes')
          or pay_started_at < now() - interval '60 minutes'
          or created_at < now() - interval '3 hours');
  get diagnostics n = row_count;
  perform set_config('hg.trusted', '', true);
  return n;
end $$;

create or replace function public._orders_require_login()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'HG_LOGIN'; end if;
  -- an order the shop types in by hand (admin_place_order) is not a customer checking out
  if coalesce(current_setting('hg.admin_order', true), '') = '1' and coalesce(is_admin_phone(auth.jwt() ->> 'phone'), false) then return new; end if;
  select count(*) into n from orders where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if n >= 5 then raise exception 'HG_TOO_MANY'; end if;
  return new;
end $$;

create or replace function public._orders_coupon_once()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare v_code text := upper(btrim(coalesce(new.coupon_code, ''))); v_phone text := _normalize_ir_mobile(new.customer_phone);
begin
  if v_code = '' or not exists (select 1 from coupons where code = v_code and one_per_customer) then
    return new;
  end if;
  -- two orders from the same customer at the same moment must not both slip through
  perform pg_advisory_xact_lock(hashtext('coupon:' || v_code || ':' || coalesce(auth.uid()::text, v_phone, '')));
  if exists (
    select 1 from orders o
    where o.coupon_code = v_code and o.status is distinct from 'لغو شده'
      and (o.user_id = auth.uid() or (v_phone is not null and o.customer_phone = v_phone))
  ) then
    raise exception 'HG_COUPON_USED';
  end if;
  return new;
end $$;

create or replace function public._orders_validate()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  it jsonb; pid bigint; q int; vname text; prod record; e text; seg text[]; matched boolean;
  vprice numeric; vqty int; line_price bigint; subtotal bigint := 0; disc bigint := 0; c coupons%rowtype;
  need_p jsonb := '{}'::jsonb; need_v jsonb := '{}'::jsonb; key text; n int;
  new_items jsonb := '[]'::jsonb; v_phone text; v_uid uuid := auth.uid();
  v_admin boolean := coalesce(current_setting('hg.admin_order', true), '') = '1' and coalesce(is_admin_phone(auth.jwt() ->> 'phone'), false);
begin
  new.status := 'جدید';
  new.created_at := now();
  new.user_id := v_uid;                 -- never trust a client-sent owner
  new.sms_sent := false;
  new.manual_pay := null;
  new.customer_name := left(btrim(coalesce(new.customer_name, '')), 100);
  new.customer_address := left(btrim(coalesce(new.customer_address, '')), 600);
  new.customer_note := nullif(left(btrim(coalesce(new.customer_note, '')), 600), '');
  -- an order the shop types in from an Instagram DM may come without any customer details
  if v_admin then
    if new.customer_name = '' then new.customer_name := 'سفارش دایرکت'; end if;
    if new.customer_address = '' then new.customer_address := '—'; end if;
  end if;
  if new.customer_name = '' or new.customer_address = '' then
    raise exception 'HG_REQUIRED';
  end if;
  v_phone := _normalize_ir_mobile(new.customer_phone);
  if v_phone is null and not (v_admin and btrim(coalesce(new.customer_phone, '')) = '') then raise exception 'HG_BAD_PHONE'; end if;
  new.customer_phone := v_phone;
  if new.tracking_code is null or new.tracking_code !~ '^[0-9]{6}$' then
    new.tracking_code := (100000 + floor(random() * 900000))::int::text;
  end if;

  if not v_admin then
    if exists (select 1 from profiles p where p.blocked and (p.id = v_uid or _normalize_ir_mobile(p.phone) = v_phone)) then
      raise exception 'HG_BLOCKED';
    end if;
    select count(*) into n from orders o where o.customer_phone = v_phone and o.created_at > now() - interval '10 minutes' and o.cancel_reason is distinct from 'replaced';
    if n >= 3 then raise exception 'HG_TOO_MANY'; end if;
  end if;

  if new.items is null or jsonb_typeof(new.items) <> 'array'
     or jsonb_array_length(new.items) = 0 or jsonb_array_length(new.items) > 50 then
    raise exception 'HG_ITEMS';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    begin
      pid := (it->>'id')::bigint;
      q := (it->>'qty')::int;
    exception when others then raise exception 'HG_ITEMS';
    end;
    if pid is null or q is null or q < 1 or q > 100 then raise exception 'HG_ITEMS'; end if;
    vname := nullif(btrim(coalesce(it->>'variant', '')), '');
    select id, name, price, sale_price, sale_starts_at, sale_ends_at, stock, variants into prod from products where id = pid for update;
    if not found then raise exception 'HG_GONE:%', coalesce(it->>'name', ''); end if;

    vprice := null; vqty := null; matched := false;
    if prod.variants is not null and btrim(prod.variants) <> '' then
      for e in select btrim(x) from unnest(regexp_split_to_array(prod.variants, '[,،]')) x loop
        seg := string_to_array(e, ':');
        if e <> '' and btrim(seg[1]) = vname then
          matched := true;
          if coalesce(array_length(seg, 1), 0) >= 2 then
            if btrim(seg[2]) = 'ناموجود' then vqty := 0;
            elsif btrim(seg[2]) ~ '^[0-9]+$' then vqty := btrim(seg[2])::int; end if;
          end if;
          if coalesce(array_length(seg, 1), 0) >= 3 and btrim(seg[3]) ~ '^[0-9]+(\.[0-9]+)?$' and btrim(seg[3])::numeric > 0 then
            vprice := btrim(seg[3])::numeric;
          end if;
          exit;
        end if;
      end loop;
      if not matched then raise exception 'HG_ITEMS'; end if;
    else
      vname := null;
    end if;

    -- enough stock for everything in this order?
    key := pid::text;
    need_p := jsonb_set(need_p, array[key], to_jsonb(coalesce((need_p->>key)::int, 0) + q));
    if (need_p->>key)::int > coalesce(prod.stock, 0) then raise exception 'HG_STOCK:%', prod.name; end if;
    if vqty is not null then
      key := pid::text || '|' || vname;
      need_v := jsonb_set(need_v, array[key], to_jsonb(coalesce((need_v->>key)::int, 0) + q));
      if (need_v->>key)::int > vqty then raise exception 'HG_STOCK:%', prod.name || ' - ' || vname; end if;
    end if;

    line_price := round(coalesce(vprice,
      case when prod.sale_price is not null and prod.sale_price > 0 and prod.sale_price < prod.price and (prod.sale_starts_at is null or prod.sale_starts_at <= now()) and (prod.sale_ends_at is null or prod.sale_ends_at > now()) then prod.sale_price else prod.price end));
    subtotal := subtotal + line_price * q;
    new_items := new_items || jsonb_build_object('id', prod.id, 'name', prod.name, 'qty', q, 'price', line_price, 'variant', vname);
  end loop;

  if not v_admin and nullif(btrim(coalesce(new.coupon_code, '')), '') is not null then
    update coupons set used_count = used_count + 1
      where coupons.code = upper(btrim(new.coupon_code)) and active
        and (expires_at is null or expires_at > now())
        and (max_uses is null or used_count < max_uses)
      returning * into c;
    if not found then raise exception 'HG_COUPON'; end if;
    disc := case when c.discount_type = 'percent' then round(subtotal * least(c.discount_value, 100) / 100) else round(c.discount_value) end;
    disc := least(greatest(disc, 0), subtotal);
    new.coupon_code := c.code;
  else
    new.coupon_code := null;
  end if;

  new.items := new_items;
  new.discount_amount := disc;
  new.total := subtotal - disc;

  -- payment fields are only ever written by the server
  new.pay_track_id := null; new.pay_ref_number := null; new.pay_card := null; new.pay_amount := null;
  new.pay_started_at := null; new.pay_checked_at := null; new.cancel_reason := null; new.paid_at := null;
  new.payment_status := 'offline';
  new.pay_sandbox := false;

  if v_admin then
    -- typed in by the shop (Instagram DM, phone, in person): no gateway, the shop settles the money itself
    disc := least(greatest(coalesce(nullif(current_setting('hg.admin_discount', true), '')::bigint, 0), 0), subtotal);
    new.discount_amount := disc;
    new.total := subtotal - disc;
    new.manual_pay := coalesce(nullif(current_setting('hg.admin_pay', true), ''), 'card');
    new.source := nullif(current_setting('hg.admin_source', true), '');
    new.status := case when new.manual_pay = 'unpaid' then 'جدید' else 'تایید شده' end;
    if new.manual_pay = 'card' then new.paid_at := now(); end if;
    new.sms_sent := coalesce(current_setting('hg.admin_sms', true), '') <> '1';
    -- the customer sees it under «سفارش‌های من» if they have an account with this number
    new.user_id := case when v_phone is null then null else (select u.id from auth.users u where u.phone = '98' || substr(v_phone, 2) limit 1) end;
    return new;
  end if;

  -- payment mode: off = card-to-card, test = only the shop's admins pay through Zibal's test gateway, live = everyone
  select coalesce(s.value->>'mode', 'off') into key from site_settings s where s.key = 'payment';
  if key = 'test' and is_admin_phone(auth.jwt()->>'phone') then
    new.pay_sandbox := true;
  end if;
  if key = 'live' or new.pay_sandbox then
    if new.total > 0 then
      new.status := 'در انتظار پرداخت';
      new.payment_status := 'unpaid';
    else
      new.payment_status := 'free';
      new.paid_at := now();
    end if;
  end if;
  return new;
end $$;

create or replace function public._orders_stock_trigger()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    -- never trust a client-sent value
    new.reserved_items := case when new.status = 'لغو شده' then null else _order_reserve(new.items) end;
    return new;
  elsif tg_op = 'UPDATE' then
    new.reserved_items := old.reserved_items;
    if new.status = 'لغو شده' and old.status is distinct from 'لغو شده' then
      perform _order_release(old.reserved_items);
      new.reserved_items := null;
      if old.coupon_code is not null then
        update coupons set used_count = greatest(used_count - 1, 0) where code = old.coupon_code;
      end if;
    elsif old.status = 'لغو شده' and new.status is distinct from 'لغو شده' then
      if old.reserved_items is null then new.reserved_items := _order_reserve(new.items); end if;
      if old.coupon_code is not null then
        update coupons set used_count = used_count + 1 where code = old.coupon_code;
      end if;
    end if;
    return new;
  else -- DELETE: an order that never left the shop gives its stock and coupon use back
    if old.status in ('جدید', 'پرداخت شده', 'تایید شده', 'در انتظار پرداخت') then
      perform _order_release(old.reserved_items);
      if old.coupon_code is not null then
        update coupons set used_count = greatest(used_count - 1, 0) where code = old.coupon_code;
      end if;
    end if;
    return old;
  end if;
end $$;

create or replace function public._orders_payment_guard()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and coalesce(current_setting('hg.trusted', true), '') <> '1' then
    new.payment_status := old.payment_status; new.pay_track_id := old.pay_track_id;
    new.pay_ref_number := old.pay_ref_number; new.pay_card := old.pay_card; new.paid_at := old.paid_at;
    new.pay_amount := old.pay_amount; new.pay_started_at := old.pay_started_at; new.pay_checked_at := old.pay_checked_at; new.pay_sandbox := old.pay_sandbox;
    new.cancel_reason := case when new.status = 'لغو شده' and old.status is distinct from 'لغو شده' then 'admin'
                              when new.status = 'لغو شده' then old.cancel_reason end;
    -- the shop confirmed an unpaid order by hand (e.g. card-to-card)
    if old.status = 'در انتظار پرداخت' and new.status not in ('در انتظار پرداخت', 'لغو شده')
       and new.payment_status not in ('paid', 'free') then
      new.payment_status := 'offline';
    end if;
  end if;
  return new;
end $$;

create or replace function public._profiles_guard()
 returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_admin_phone(auth.jwt() ->> 'phone') then
    if tg_op = 'INSERT' then new.blocked := false; else new.blocked := old.blocked; end if;
  end if;
  return new;
end $$;

-- Zibal only accepts whitelisted IPs: calls go out from the database (fixed IP) through pg_net
create or replace function public._zibal_send(p_path text, p_body jsonb)
 returns bigint language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if p_path not in ('/v1/request', '/v1/verify', '/v1/inquiry') then raise exception 'bad path'; end if;
  return net.http_post(
    url := 'https://gateway.zibal.ir' || p_path,
    body := p_body,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000);
end $$;

create or replace function public._zibal_result(p_id bigint)
 returns jsonb language sql security definer set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object('done', true, 'status', r.status_code, 'content', r.content, 'error', r.error_msg, 'timed_out', r.timed_out)
       from net._http_response r where r.id = p_id),
    jsonb_build_object('done', false));
$$;

create or replace function public.place_order(p_items jsonb, p_name text, p_phone text, p_address text, p_note text default null, p_coupon text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare o record; attempt int := 0;
begin
  -- a new checkout replaces this customer's earlier unpaid ones (their stock and coupon go back first)
  perform set_config('hg.trusted', '1', true);
  update orders set status = 'لغو شده', cancel_reason = 'replaced',
         payment_status = case when payment_status = 'pending' then 'failed' else payment_status end
   where user_id = auth.uid() and status = 'در انتظار پرداخت';
  perform set_config('hg.trusted', '', true);
  loop
    begin
      insert into orders(items, customer_name, customer_phone, customer_address, customer_note, coupon_code, tracking_code)
        values (p_items, p_name, p_phone, p_address, p_note, p_coupon, (100000 + floor(random() * 900000))::int::text)
        returning tracking_code, total, discount_amount, items, status, payment_status into o;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt >= 5 then raise; end if;   -- tracking code collision: try another one
    end;
  end loop;
  return jsonb_build_object('tracking_code', o.tracking_code, 'total', o.total, 'discount', o.discount_amount, 'items', o.items,
                            'needs_payment', o.status = 'در انتظار پرداخت', 'payment_status', o.payment_status);
end $$;

create or replace function public.admin_place_order(p_items jsonb, p_name text, p_phone text, p_address text, p_note text default null, p_pay text default 'card', p_source text default null, p_discount bigint default 0, p_sms boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare o record; attempt int := 0;
begin
  if not coalesce(is_admin_phone(auth.jwt() ->> 'phone'), false) then raise exception 'HG_ADMIN'; end if;
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

create or replace function public.check_coupon(p_code text)
 returns table(code text, discount_type text, discount_value numeric, status text)
 language plpgsql stable security definer set search_path to 'public'
as $$
declare c coupons%rowtype;
begin
  select * into c from coupons where coupons.code = upper(btrim(coalesce(p_code, ''))) and active;
  if not found then return query select null::text, null::text, null::numeric, 'invalid'::text; return; end if;
  if c.expires_at is not null and c.expires_at <= now() then return query select null::text, null::text, null::numeric, 'expired'::text; return; end if;
  if c.max_uses is not null and c.used_count >= c.max_uses then return query select null::text, null::text, null::numeric, 'used_up'::text; return; end if;
  if c.one_per_customer and auth.uid() is not null and exists (
       select 1 from orders o where o.coupon_code = c.code and o.status is distinct from 'لغو شده' and o.user_id = auth.uid()) then
    return query select null::text, null::text, null::numeric, 'already_used'::text; return;
  end if;
  return query select c.code, c.discount_type, c.discount_value, 'ok'::text;
end $$;

create or replace function public.increment_coupon_usage(p_code text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare updated_rows integer;
begin
  update coupons set used_count = used_count + 1
  where code = p_code and active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or used_count < max_uses);
  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end $$;

create or replace function public.increment_visits()
 returns void language sql security definer set search_path to 'public'
as $$ update site_stats set visits = visits + 1 where id = 1; $$;

create or replace function public.set_order_source(p_tracking text, p_source text)
 returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update orders set source = nullif(left(btrim(coalesce(p_source, '')), 40), '')
   where tracking_code = p_tracking and user_id = auth.uid() and source is null
     and created_at > now() - interval '15 minutes';
end $$;

create or replace function public.track_event(p_kind text, p_product bigint default null, p_source text default null, p_session text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_src text := nullif(left(btrim(coalesce(p_source, '')), 40), '');
begin
  if p_kind not in ('visit', 'view', 'cart') then return; end if;
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{8,40}$' then return; end if;
  if p_kind = 'visit' then
    p_product := null;
  elsif p_product is null or not exists (select 1 from products where id = p_product) then
    return;
  end if;
  insert into site_events (kind, product_id, source, session) values (p_kind, p_product, v_src, p_session)
  on conflict do nothing;
end $$;

create or replace function public.admin_heartbeat()
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_phone text := auth.jwt() ->> 'phone'; v_id bigint;
begin
  if not coalesce(is_admin_phone(v_phone), false) then return; end if;
  select id into v_id from admin_sessions where phone = v_phone and ended_at > now() - interval '2 minutes' order by ended_at desc limit 1;
  if v_id is not null then
    update admin_sessions set ended_at = now() where id = v_id;
  else
    insert into admin_sessions(phone) values (v_phone);
  end if;
end $$;

create or replace function public.admin_analytics(p_days integer default 30)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare since timestamptz := case when coalesce(p_days, 0) > 0 then now() - make_interval(days => p_days) else '-infinity'::timestamptz end;
begin
  if not coalesce(is_admin_phone(auth.jwt() ->> 'phone'), false) then raise exception 'HG_ADMIN'; end if;
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

-- ───────────── تریگرها ─────────────
drop trigger if exists orders_0_login on public.orders;
create trigger orders_0_login before insert on public.orders for each row execute function _orders_require_login();
drop trigger if exists orders_1_coupon_once on public.orders;
create trigger orders_1_coupon_once before insert on public.orders for each row execute function _orders_coupon_once();
drop trigger if exists orders_a_validate on public.orders;
create trigger orders_a_validate before insert on public.orders for each row execute function _orders_validate();
drop trigger if exists orders_payguard on public.orders;
create trigger orders_payguard before update on public.orders for each row execute function _orders_payment_guard();
drop trigger if exists orders_stock on public.orders;
create trigger orders_stock before insert or delete or update on public.orders for each row execute function _orders_stock_trigger();
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles for each row execute function _profiles_guard();

-- ───────────── دسترسی به توابع ─────────────
-- Supabase به‌صورت پیش‌فرض اجرای هر تابع جدید رو به anon/authenticated می‌ده؛ اینجا همه بسته می‌شن
-- و فقط همون‌هایی که در حناگالری باز بودن دوباره باز می‌شن (مهم: _zibal_send و _expire_unpaid_orders بسته می‌مونن).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
grant execute on function public.is_admin_phone(text) to anon, authenticated;
grant execute on function public._normalize_ir_mobile(text) to anon, authenticated;
grant execute on function public._variant_adjust(text, text, integer) to anon, authenticated;
grant execute on function public._profiles_guard() to anon, authenticated;
grant execute on function public.increment_visits() to anon, authenticated;
grant execute on function public.check_coupon(text) to anon, authenticated;
grant execute on function public.track_event(text, bigint, text, text) to anon, authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, text) to authenticated;
grant execute on function public.set_order_source(text, text) to authenticated;
grant execute on function public.admin_analytics(integer) to authenticated;
grant execute on function public.admin_place_order(jsonb, text, text, text, text, text, text, bigint, boolean) to authenticated;
grant execute on function public.admin_heartbeat() to authenticated;

-- ───────────── RLS و سیاست‌های دسترسی ─────────────
alter table public.admins enable row level security;
alter table public.admin_logs enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.site_events enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_stats enable row level security;
alter table public.wishlists enable row level security;

create policy "Admins can insert logs" on public.admin_logs for insert to public with check (is_admin_phone(auth.jwt() ->> 'phone') and admin_phone = (auth.jwt() ->> 'phone'));
create policy "Admins can view logs" on public.admin_logs for select to public using (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Admins read admin sessions" on public.admin_sessions for select to public using (coalesce(is_admin_phone(auth.jwt() ->> 'phone'), false));
create policy "Admins can view all admin phones" on public.admins for select to public using (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Users can check their own admin status" on public.admins for select to public using (phone = (auth.jwt() ->> 'phone'));
create policy "Admins manage coupons" on public.coupons for all to public using (is_admin_phone(auth.jwt() ->> 'phone')) with check (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Admins can delete orders" on public.orders for delete to public using (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Admins can update orders" on public.orders for update to public using (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy "Admins can view all orders" on public.orders for select to public using (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy "Signed-in customers can place orders" on public.orders for insert to authenticated with check (auth.uid() is not null);
create policy "Customers see their own orders" on public.orders for select to public using (auth.uid() = user_id);
create policy "Admins can delete products" on public.products for delete to public using (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy "Admins can insert products" on public.products for insert to public with check (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy "Admins can update products" on public.products for update to public using (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy "Anyone can view products" on public.products for select to public using (true);
create policy "Admins can update profiles" on public.profiles for update to public using (is_admin_phone(auth.jwt() ->> 'phone')) with check (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Admins can view all profiles" on public.profiles for select to public using (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Users see their own profile" on public.profiles for select to public using (auth.uid() = id);
create policy "Users create their own profile" on public.profiles for insert to public with check (auth.uid() = id);
create policy "Users edit their own profile" on public.profiles for update to public using (auth.uid() = id);
create policy reviews_delete_admin on public.reviews for delete to authenticated using (exists (select 1 from admins a where a.phone = (auth.jwt() ->> 'phone')));
create policy reviews_insert_own on public.reviews for insert to authenticated with check (user_id = auth.uid() and approved = false);
create policy reviews_select_own on public.reviews for select to authenticated using (user_id = auth.uid());
create policy reviews_select_public on public.reviews for select to anon, authenticated using (approved = true);
create policy reviews_update_admin on public.reviews for update to authenticated using (exists (select 1 from admins a where a.phone = (auth.jwt() ->> 'phone'))) with check (exists (select 1 from admins a where a.phone = (auth.jwt() ->> 'phone')));
create policy "Admins manage site settings" on public.site_settings for all to authenticated using (is_admin_phone(auth.jwt() ->> 'phone')) with check (is_admin_phone(auth.jwt() ->> 'phone'));
create policy "Anyone can read site settings" on public.site_settings for select to public using (true);
create policy "Admins can view stats" on public.site_stats for select to public using (exists (select 1 from admins where admins.phone = (auth.jwt() ->> 'phone')));
create policy wishlists_own on public.wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── فضای عکس محصولات ─────────────
insert into storage.buckets (id, name, public) values ('image', 'image', true) on conflict (id) do nothing;
create policy "Admins upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'image' and exists (select 1 from public.admins a where a.phone = (auth.jwt() ->> 'phone')));

-- ───────────── مقادیر اولیه ─────────────
insert into public.site_stats (id, visits) values (1, 0) on conflict do nothing;
insert into public.site_settings (key, value) values ('payment', '{"mode":"off"}') on conflict do nothing;
-- شماره‌ی مدیر فروشگاه رو بعداً اینجا اضافه کن (فرمت Supabase: 98 + شماره بدون صفر)، مثلاً:
-- insert into public.admins (phone) values ('989121816762');
