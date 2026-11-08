-- دسته‌بندی‌های منوی سایت، قابل ویرایش از پنل (افزودن، تغییر نام، ترتیب، مخفی کردن، حذف)
-- شکل: {"list": [{"key": "knit", "label": "بافت و پلیور", "hidden": false}, ...]}
-- محصولات با ستون category (همون key) به دسته وصلن؛ category_label هنگام تغییر نام از پنل به‌روز می‌شه.
insert into public.site_settings (key, value) values ('categories', jsonb_build_object('list', jsonb_build_array(
  jsonb_build_object('key', 'knit', 'label', 'بافت و پلیور'),
  jsonb_build_object('key', 'coat', 'label', 'مانتو، کت و جلیقه'),
  jsonb_build_object('key', 'overcoat', 'label', 'پالتو'),
  jsonb_build_object('key', 'top', 'label', 'شومیز و تاپ'),
  jsonb_build_object('key', 'bottom', 'label', 'شلوار و دامن'),
  jsonb_build_object('key', 'tshirt', 'label', 'تیشرت'),
  jsonb_build_object('key', 'scarf', 'label', 'شال'),
  jsonb_build_object('key', 'bag', 'label', 'کیف'),
  jsonb_build_object('key', 'shoes', 'label', 'کفش'),
  jsonb_build_object('key', 'accessory', 'label', 'اکسسوری'),
  jsonb_build_object('key', 'bomberjacket', 'label', 'بامبرجکت')
))) on conflict (key) do nothing;

-- برچسب‌های قدیمی با «ك/ي» عربی یکدست می‌شن (دوبار نشون دادن یک دسته در منو)
update public.products set category_label = translate(category_label, 'كي', 'کی') where category_label ~ '[كي]';

-- مدیرهایی که دسترسی «محصولات» دارن، دسته‌ها رو هم مدیریت می‌کنن (بقیه‌ی تنظیمات همچنان فقط با دسترسی «تنظیمات»)
drop policy if exists "Product admins manage categories" on public.site_settings;
create policy "Product admins manage categories" on public.site_settings for all to authenticated
  using (key = 'categories' and has_perm('products')) with check (key = 'categories' and has_perm('products'));
