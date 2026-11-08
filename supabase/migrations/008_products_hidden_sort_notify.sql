-- ۱) مخفی کردن محصول بدون حذف + ترتیب دستی نمایش
alter table public.products add column if not exists hidden boolean not null default false;
alter table public.products add column if not exists sort_order integer;

-- محصول مخفی برای مشتری دیده نمی‌شه (مدیر محصولات همه رو می‌بینه)
drop policy if exists "Anyone can view products" on public.products;
create policy "Anyone can view products" on public.products for select to public
  using (not hidden or has_perm('products'));

-- سفارش محصول مخفی از سمت مشتری رد می‌شه (سفارش دستی مدیر مجازه)
CREATE OR REPLACE FUNCTION public._orders_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select id, name, price, sale_price, sale_starts_at, sale_ends_at, stock, variants into prod from products where id = pid and (v_admin or not hidden) for update;
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
end $function$;

-- ۲) حروف عربی «ك» و «ي» در اسم و توضیح محصولات → فارسی (جستجو با کیبورد فارسی پیداشون کنه)
update public.products set
  name = translate(name, 'كي', 'کی'),
  description = translate(description, 'كي', 'کی'),
  category_label = translate(category_label, 'كي', 'کی')
where name ~ '[كي]' or description ~ '[كي]' or category_label ~ '[كي]';

-- ۳) شماره‌های گیرنده‌ی پیامک سفارش جدید، قابل تنظیم از پنل (فقط مدیرهای «تنظیمات» می‌بینن)
insert into public.site_settings (key, value) values ('notify', '{"phones": []}'::jsonb) on conflict (key) do nothing;
drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings" on public.site_settings for select to public using (key <> 'notify');
