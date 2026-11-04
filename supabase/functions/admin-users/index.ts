// مدیریت مدیرهای پنل — فقط برای مالک‌ها (role = 'owner').
// list   : لیست مدیرها با آخرین ورود
// save   : افزودن یا ویرایش مدیر (نام، دسترسی‌ها، و در صورت نیاز ساخت حساب / تغییر رمز)
// remove : حذف دسترسی مدیر (حساب کاربری‌اش به‌عنوان مشتری باقی می‌مونه)
// verify_jwt=true؛ خود تابع هم نقش «مالک» رو از جدول admins چک می‌کنه.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PERMS = ['dash', 'orders', 'products', 'coupons', 'customers', 'reviews', 'settings'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// هر شکلی از شماره‌ی ایرانی ← 98912xxxxxxx (همون شکلی که Supabase Auth ذخیره می‌کنه)
function normPhone(p: unknown): string | null {
  const d = String(p ?? '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return '98' + d.slice(1);
  if (/^9\d{9}$/.test(d)) return '98' + d;
  if (/^989\d{9}$/.test(d)) return d;
  if (/^00989\d{9}$/.test(d)) return d.slice(2);
  return null;
}

async function allUsers() {
  const out: { id: string; phone?: string; last_sign_in_at?: string | null }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const caller = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user?.phone) return json({ error: 'login' }, 401);
    const { data: me } = await db.from('admins').select('role').eq('phone', user.phone).maybeSingle();
    if (me?.role !== 'owner') return json({ error: 'owner_only' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const log = (a: string, details: string) =>
      db.from('admin_logs').insert({ admin_phone: user.phone, action: a, details: details.slice(0, 500) }).then(() => {});

    if (action === 'list') {
      const [{ data: rows, error }, users] = await Promise.all([
        db.from('admins').select('phone, role, perms, name, created_at').order('created_at'),
        allUsers(),
      ]);
      if (error) throw error;
      const byPhone = new Map(users.filter((u) => u.phone).map((u) => [u.phone!, u]));
      return json({
        me: user.phone,
        admins: (rows || []).map((r) => ({
          ...r,
          has_account: byPhone.has(r.phone),
          last_sign_in_at: byPhone.get(r.phone)?.last_sign_in_at ?? null,
        })),
      });
    }

    if (action === 'save') {
      const phone = normPhone(body.phone);
      if (!phone) return json({ error: 'bad_phone' }, 400);
      const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
      const perms = Array.isArray(body.perms) ? [...new Set(body.perms.filter((p: unknown) => PERMS.includes(String(p))))] : [];
      const password = body.password ? String(body.password) : '';
      if (password && password.length < 6) return json({ error: 'short_password' }, 400);

      const { data: existing } = await db.from('admins').select('role').eq('phone', phone).maybeSingle();
      // مالک‌ها همیشه دسترسی کامل دارن؛ فقط اسمشون قابل تغییره
      if (existing?.role === 'owner') {
        if (password) return json({ error: 'owner_password' }, 400);
        await db.from('admins').update({ name }).eq('phone', phone);
        await log('admin_edit', `${phone} (مالک): نام`);
        return json({ ok: true });
      }

      const users = await allUsers();
      const u = users.find((x) => x.phone === phone);
      if (!u) {
        if (!password) return json({ error: 'need_password' }, 400);
        const { error } = await db.auth.admin.createUser({ phone, password, phone_confirm: true, user_metadata: name ? { full_name: name } : {} });
        if (error) return json({ error: 'create_failed', message: error.message }, 400);
      } else if (password) {
        const { error } = await db.auth.admin.updateUserById(u.id, { password });
        if (error) return json({ error: 'password_failed', message: error.message }, 400);
      }
      const { error: upErr } = await db.from('admins').upsert({ phone, name, perms, role: 'admin' }, { onConflict: 'phone' });
      if (upErr) throw upErr;
      await log(existing ? 'admin_edit' : 'admin_add', `${phone}: ${perms.join('، ') || 'بدون دسترسی'}`);
      return json({ ok: true, created: !u });
    }

    if (action === 'remove') {
      const phone = normPhone(body.phone);
      if (!phone) return json({ error: 'bad_phone' }, 400);
      const { data: row } = await db.from('admins').select('role').eq('phone', phone).maybeSingle();
      if (!row) return json({ error: 'not_found' }, 404);
      if (row.role === 'owner') return json({ error: 'owner_locked' }, 400);
      const { error } = await db.from('admins').delete().eq('phone', phone);
      if (error) throw error;
      await log('admin_remove', phone);
      return json({ ok: true });
    }

    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    console.error('ADMIN_USERS', String(err));
    return json({ error: 'internal' }, 500);
  }
});
