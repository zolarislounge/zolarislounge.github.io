# بک‌اند Zolaris (Supabase) — کپی ساختار حناگالری

- `migrations/001_schema.sql` — جدول‌ها، توابع، تریگرها، RLS، فضای عکس (بدون هیچ داده‌ای از حناگالری)
- `migrations/002_cron.sql` — لغو خودکار سفارش‌های پرداخت‌نشده + بررسی پرداخت‌های جامونده (`<PROJECT_REF>` رو عوض کن)
- `functions/` — payment (زیبال)، geo (تشخیص فیلترشکن)، notify-order (پیامک سفارش)، send-sms-hook (کد ورود)، admin-reset-customer-password

## Secrets لازم (فقط در داشبورد Supabase وارد شوند، هرگز در کد یا چت)
| Secret | برای |
|---|---|
| ZIBAL_MERCHANT | کد پذیرنده‌ی زیبالِ خود Zolaris |
| FARAZSMS_API_KEY, FARAZSMS_LINE | پنل پیامک |
| FARAZSMS_OTP_PATTERN_CODE | پترن کد ورود |
| FARAZSMS_PATTERN_CODE, FARAZSMS_CUSTOMER_PATTERN_CODE | پترن پیامک سفارش (فروشنده / مشتری) |
| OWNER_PHONE | شماره‌ی فروشنده برای پیامک سفارش |
| SEND_SMS_HOOK_SECRET | از Authentication → Hooks |

## نکته‌ی زیبال
زیبال فقط از IPهای ثبت‌شده درخواست قبول می‌کنه؛ تماس‌ها از دیتابیس (pg_net) می‌رن. IP خروجی دیتابیسِ
پروژه‌ی Zolaris با حناگالری فرق داره و باید در پنل زیبالِ Zolaris ثبت بشه.
