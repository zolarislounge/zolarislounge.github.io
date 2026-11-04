// ریست رمز مشتری توسط مدیر — فقط سمت سرور. (کپی از حناگالری، بدون تغییر منطق)
// verify_jwt=true: فقط کاربر واردشده، و خود تابع هم چک می‌کنه که در جدول admins باشه.
// رمز واقعی هیچ کاربری دیده نمی‌شه؛ فقط یه رمز تصادفی جدید جایگزین می‌شه.

import { createClient } from 'npm:@supabase/supabase-js@2';

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let pass = '';
  for (const b of bytes) pass += chars[b % chars.length];
  return pass;
}

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
  const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user?.phone) {
      return new Response(JSON.stringify({ error: 'احراز هویت نامعتبره' }), { status: 401, headers: corsHeaders });
    }
    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: adminRow } = await adminClient.from('admins').select('phone, role, perms').eq('phone', callerData.user.phone).maybeSingle();
    // فقط مالک یا مدیری که دسترسی «مشتری‌ها» داره
    if (!adminRow || !(adminRow.role === 'owner' || (adminRow.perms || []).includes('customers'))) {
      return new Response(JSON.stringify({ error: 'این عملیات فقط برای مدیرهاست' }), { status: 403, headers: corsHeaders });
    }
    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: 'شناسه‌ی مشتری ارسال نشده' }), { status: 400, headers: corsHeaders });
    // امنیت: رمز حساب مدیرها (به‌خصوص مالک‌ها) از این مسیر عوض نمی‌شه؛ وگرنه مدیری با دسترسی «مشتری‌ها»
    // می‌تونست رمز مالک رو عوض کنه و با حساب او وارد بشه. رمز مدیرها فقط از بخش «مدیرها» و توسط مالک.
    const { data: target, error: tErr } = await adminClient.auth.admin.getUserById(String(userId));
    if (tErr || !target?.user) return new Response(JSON.stringify({ error: 'مشتری پیدا نشد' }), { status: 404, headers: corsHeaders });
    if (target.user.phone) {
      const { data: targetAdmin } = await adminClient.from('admins').select('phone').eq('phone', target.user.phone).maybeSingle();
      if (targetAdmin) {
        return new Response(JSON.stringify({ error: 'این حساب مربوط به یکی از مدیرهاست؛ رمزش فقط از بخش «مدیرها» توسط مالک عوض می‌شه' }), { status: 403, headers: corsHeaders });
      }
    }
    if (target.user.id === callerData.user.id) {
      return new Response(JSON.stringify({ error: 'رمز حساب خودت رو از این بخش نمی‌شه عوض کرد' }), { status: 403, headers: corsHeaders });
    }
    const newPassword = randomPassword();
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: corsHeaders });
    return new Response(JSON.stringify({ newPassword }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
