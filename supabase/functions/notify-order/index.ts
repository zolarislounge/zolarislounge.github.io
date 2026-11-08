// پیامک سفارش جدید: یکی به مالک فروشگاه، یکی تاییدیه به مشتری. (کپی از حناگالری، بدون تغییر منطق)
//
// امنیت: این تابع فقط «کد پیگیری» رو از سایت می‌گیره و بقیه‌ی اطلاعات (اسم، شماره، مبلغ) رو
// خودش از دیتابیس می‌خونه. پیامک فقط برای سفارشی فرستاده می‌شه که واقعاً ثبت شده (و اگه پرداخت
// آنلاین داره، پرداختش تایید شده)، کمتر از ۱۵ دقیقه از ثبت یا پرداختش گذشته و قبلاً براش پیامک نرفته.
// API Key پیامک فقط سمت سرور (Secrets) هست و هیچ‌وقت داخل کد سایت نمیاد.
//
// Secrets لازم برای Zolaris: FARAZSMS_API_KEY, OWNER_PHONE, FARAZSMS_LINE,
// FARAZSMS_PATTERN_CODE (پیامک به فروشنده), FARAZSMS_CUSTOMER_PATTERN_CODE (پیامک به مشتری، اختیاری)

import { createClient } from 'npm:@supabase/supabase-js@2';

function toLocalIranPhone(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('98')) return '0' + digits.slice(2);
  if (digits.startsWith('0')) return digits;
  return '0' + digits;
}

async function sendPattern(apiKey: string, patternCode: string, recipient: string, lineNumber: string, attributes: Record<string, string>) {
  const res = await fetch('https://api.iranpayamak.com/ws/v1/sms/pattern', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: patternCode, attributes, recipient, line_number: lineNumber, number_format: 'english' }),
  });
  const result = await res.json().catch(() => ({}));
  return { ok: res.ok, result };
}

const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const trackingCode = String(body.trackingCode || '');
    if (!/^[0-9]{6}$/.test(trackingCode)) {
      return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: corsHeaders });
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // claim the order atomically: only one call can flip sms_sent from false to true;
    // an order still waiting for its online payment gets no SMS yet
    const { data: order, error } = await db.from('orders')
      .update({ sms_sent: true })
      .eq('tracking_code', trackingCode)
      .eq('sms_sent', false)
      .neq('status', 'در انتظار پرداخت')
      .or(`created_at.gte.${since},paid_at.gte.${since}`)
      .select('customer_name, customer_phone, total, tracking_code')
      .maybeSingle();
    if (error || !order) return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: corsHeaders });

    const apiKey = Deno.env.get('FARAZSMS_API_KEY');
    // شماره‌های گیرنده از پنل مدیریت (تنظیمات ← پیامک سفارش)؛ اگه خالی بود، Secret قدیمی OWNER_PHONE
    const { data: ns } = await db.from('site_settings').select('value').eq('key', 'notify').maybeSingle();
    const panelPhones = Array.isArray(ns?.value?.phones) ? ns.value.phones.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
    const ownerPhone = panelPhones.length ? panelPhones.join(',') : Deno.env.get('OWNER_PHONE');
    const lineNumber = Deno.env.get('FARAZSMS_LINE') || '';
    const ownerPatternCode = Deno.env.get('FARAZSMS_PATTERN_CODE');
    const customerPatternCode = Deno.env.get('FARAZSMS_CUSTOMER_PATTERN_CODE');
    if (!apiKey || !ownerPhone || !ownerPatternCode || !lineNumber) {
      console.error('MISSING_SECRETS');
      return new Response(JSON.stringify({ error: 'sms not configured' }), { status: 500, headers: corsHeaders });
    }

    const ownerResults = [];
    for (const phone of ownerPhone.split(',').map(p => p.trim()).filter(Boolean)) {
      const r = await sendPattern(apiKey, ownerPatternCode, toLocalIranPhone(phone), lineNumber, {
        name: order.customer_name || '-',
        total: Number(order.total || 0).toLocaleString('en-US'),
      });
      ownerResults.push({ ok: r.ok });
    }
    console.log('OWNER_SMS_RESULT:', JSON.stringify(ownerResults));

    let customerOk = null;
    if (customerPatternCode && order.customer_phone) {
      const r = await sendPattern(apiKey, customerPatternCode, toLocalIranPhone(order.customer_phone), lineNumber, { code: order.tracking_code });
      customerOk = r.ok;
      console.log('CUSTOMER_SMS_RESULT:', JSON.stringify(r));
    }
    return new Response(JSON.stringify({ sent: true, owner: ownerResults, customer: customerOk }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('NOTIFY_ERROR:', String(err));
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: corsHeaders });
  }
});
