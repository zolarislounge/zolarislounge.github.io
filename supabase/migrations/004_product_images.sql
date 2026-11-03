-- چند عکس برای هر محصول. image_url همچنان عکس اصلی (اولین عکس) می‌مونه تا بقیه‌ی جاها (سبد خرید، پنل) بدون تغییر کار کنن.
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.products add constraint products_images_array
    check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12);
exception when duplicate_object then null;
end $$;

-- عکس‌های قبلی به لیست عکس‌ها منتقل می‌شن
update public.products set images = jsonb_build_array(image_url)
 where image_url is not null and images = '[]'::jsonb;
