// هوک «ارسال پیامک» Supabase Auth: کد ورود (OTP) رو با فراز پیامک برای مشتری می‌فرسته.
// (کپی از حناگالری، بدون تغییر منطق)
//
// بعد از دیپلوی، آدرس https://<project-ref>.supabase.co/functions/v1/send-sms-hook رو در
// Authentication → Hooks → Send SMS Hook ثبت کن و کلیدی که Supabase می‌ده رو
// به‌عنوان Secret به اسم SEND_SMS_HOOK_SECRET بذار.
// Secrets لازم: SEND_SMS_HOOK_SECRET, FARAZSMS_API_KEY, FARAZSMS_LINE, FARAZSMS_OTP_PATTERN_CODE

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

function toLocalIranPhone(e164: string) {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('98')) return '0' + digits.slice(2);
  return e164;
}

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const secret = (Deno.env.get('SEND_SMS_HOOK_SECRET') || '').replace('v1,whsec_', '');
  try {
    // deno-lint-ignore no-explicit-any
    let user: any, sms: any;
    try {
      // deno-lint-ignore no-explicit-any
      ({ user, sms } = new Webhook(secret).verify(payload, headers) as any);
    } catch (verifyErr) {
      console.error('VERIFY_FAILED:', String(verifyErr));
      return res(401, { error: { http_code: 401, message: 'تایید امضا ناموفق' } });
    }
    const apiKey = Deno.env.get('FARAZSMS_API_KEY');
    const lineNumber = Deno.env.get('FARAZSMS_LINE') || '';
    const patternCode = Deno.env.get('FARAZSMS_OTP_PATTERN_CODE');
    if (!apiKey || !patternCode || !lineNumber) {
      console.error('MISSING_SECRETS');
      return res(500, { error: { http_code: 500, message: 'تنظیمات پیامک (Secrets) کامل نیست' } });
    }
    const r = await fetch('https://api.iranpayamak.com/ws/v1/sms/pattern', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: patternCode, attributes: { cod: sms.otp }, recipient: toLocalIranPhone(user.phone), line_number: lineNumber, number_format: 'english' }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      console.error('FARAZ_SEND_FAILED:', r.status, errBody);
      return res(500, { error: { http_code: r.status, message: 'ارسال پیامک ناموفق' } });
    }
    return res(200, {});
  } catch (error) {
    console.error('UNEXPECTED_ERROR:', String(error));
    return res(500, { error: { http_code: 500, message: 'خطای داخلی' } });
  }
});
