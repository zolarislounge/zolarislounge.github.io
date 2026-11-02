-- کارهای زمان‌بندی‌شده (کپی از حناگالری). بعد از ساخت پروژه، <PROJECT_REF> رو با شناسه‌ی پروژه‌ی Zolaris عوض کن.

-- هر ۵ دقیقه: سفارش‌هایی که پرداخت نشدن و وقتشون تموم شده لغو می‌شن و موجودی برمی‌گرده
select cron.schedule('zl-expire-unpaid', '*/5 * * * *', $$select public._expire_unpaid_orders()$$);

-- هر ۵ دقیقه: پرداخت‌هایی که مشتری انجام داده ولی به سایت برنگشته، از زیبال پرسیده و تایید می‌شن
select cron.schedule('zl-payment-sweep', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payment',
    body := '{"action":"sweep"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.orders where status = 'در انتظار پرداخت' and payment_status in ('pending', 'failed'))
$$);
