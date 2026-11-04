-- سایزها و رنگ‌های هر محصول برای نمایش در پنل و سایت
-- شکل: {"sizes": ["S","M"], "colors": [{"name": "سبز", "hex": "#6B7A3A"}]}
-- موجودی و قیمت هر ترکیب همچنان در ستون variants (مثلاً «M / سبز:2:1500000») نگه‌داری می‌شه
-- تا کنترل موجودی و قیمت سفارش‌ها سمت سرور بدون تغییر بمونه.
alter table public.products add column if not exists options jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.products add constraint products_options_object check (jsonb_typeof(options) = 'object');
exception when duplicate_object then null; end $$;
