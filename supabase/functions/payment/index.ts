// پرداخت آنلاین با زیبال — کپی از پروژه‌ی حناگالری، فقط دامنه‌ها و متن توضیح برای Zolaris عوض شده.
//
// start  : مشتریِ واردشده برای سفارش «در انتظار پرداخت» خودش یه تراکنش می‌سازه و به درگاه می‌ره.
// verify : بعد از برگشت از درگاه، سایت trackId رو می‌فرسته؛ سرور خودش از زیبال می‌پرسه و فقط اگه
//          زیبال تایید کرد و مبلغ دقیقاً همون مبلغ سفارش بود، سفارش «پرداخت‌شده» می‌شه.
// sweep  : هر چند دقیقه (pg_cron) پرداخت‌هایی رو که مشتری انجام داده ولی به سایت برنگشته پیدا و تایید می‌کنه.
//
// کد پذیرنده (ZIBAL_MERCHANT) فقط سمت سرور (Secrets) هست و هیچ‌وقت داخل کد سایت نمیاد.
// مبلغ همیشه از دیتابیس خونده می‌شه، نه از چیزی که مرورگر می‌فرسته.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientIp, isIranIp } from './iran.ts';

const ZIBAL = 'https://gateway.zibal.ir';
const PENDING = 'در انتظار پرداخت';
const PAID = 'پرداخت شده';
// اگه دامنه‌ی اختصاصی گرفتی (مثلاً https://zolaris.ir) اینجا اضافه‌ش کن
const ALLOWED_RETURN = ['https://zolaris.ir', 'https://www.zolaris.ir', 'https://zolarislounge.github.io', 'https://zolaris.netlify.app'];
const DEFAULT_RETURN = 'https://zolaris.ir/';
const SHOP_NAME = 'زولاریس';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function paymentMode(): Promise<string> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'payment').maybeSingle();
  return (data && data.value && data.value.mode) || 'off';
}
// orders the shop's admin placed in test mode go through Zibal's test gateway (no real money)
function merchantCode(sandbox: boolean): string | null {
  if (sandbox) return 'zibal';
  return (Deno.env.get('ZIBAL_MERCHANT') || '').trim() || null;
}
// Zibal only accepts whitelisted IPs and this function's IP changes on every run, so each call is
// handed to the database (fixed outgoing IP) via pg_net and we wait for its answer
async function zibal(path: string, body: Record<string, unknown>) {
  const { data: id, error } = await db.rpc('_zibal_send', { p_path: path, p_body: body });
  if (error || !id) { console.error('ZIBAL_SEND_FAILED', error && error.message); return {}; }
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 300));
    const { data: res } = await db.rpc('_zibal_result', { p_id: id });
    if (res && res.done) {
      if (res.status !== 200) { console.error('ZIBAL_HTTP', res.status, res.error); return {}; }
      try { return JSON.parse(res.content); } catch (_) { return {}; }
    }
  }
  console.error('ZIBAL_TIMEOUT', path);
  return {};
}

async function start(req: Request, body: Record<string, unknown>) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(token);
  if (!auth || !auth.user) return json({ error: 'login' }, 401);

  const code = String(body.trackingCode || '');
  if (!/^[0-9]{6}$/.test(code)) return json({ error: 'bad_request' }, 400);
  const { data: order } = await db.from('orders')
    .select('id, total, status, payment_status, customer_phone, created_at, tracking_code, pay_sandbox')
    .eq('tracking_code', code).eq('user_id', auth.user.id).maybeSingle();
  if (!order) return json({ error: 'not_found' }, 404);
  if (order.payment_status === 'paid' || order.payment_status === 'free') return json({ error: 'already_paid' });
  if (order.status !== PENDING) return json({ error: 'not_payable' });
  if (Date.now() - Date.parse(order.created_at) > 2 * 3600e3) return json({ error: 'not_payable' });

  if (!order.pay_sandbox && (await paymentMode()) !== 'live') return json({ error: 'disabled' });
  // Iranian bank gateways refuse foreign connections: with a VPN on the customer would land on a
  // dead payment page, so send them back to switch it off first (unknown = let them through)
  if ((await isIranIp(clientIp(req))) === false) return json({ error: 'vpn' }, 403);
  const merchant = merchantCode(order.pay_sandbox);
  if (!merchant) { console.error('ZIBAL_MERCHANT_MISSING'); return json({ error: 'not_configured' }, 500); }

  const { count } = await db.from('payment_attempts').select('track_id', { count: 'exact', head: true })
    .eq('order_id', order.id).gte('created_at', new Date(Date.now() - 10 * 60e3).toISOString());
  if ((count || 0) >= 6) return json({ error: 'too_many' }, 429);

  let base = DEFAULT_RETURN;
  try {
    const u = new URL(String(body.returnUrl || ''));
    if (ALLOWED_RETURN.includes(u.origin)) base = u.origin + u.pathname;
  } catch (_) { /* default */ }

  const amount = Number(order.total) * 10; // تومان → ریال
  const z = await zibal('/v1/request', {
    merchant,
    amount,
    callbackUrl: base + '?pay=1',
    orderId: `${code}-${Date.now().toString(36)}`,
    mobile: order.customer_phone || undefined,
    description: `سفارش ${code} ${SHOP_NAME}`,
  });
  if (z.result !== 100 || !z.trackId) {
    console.error('ZIBAL_REQUEST_FAILED', JSON.stringify(z));
    return json({ error: 'gateway', code: z.result ?? null }, 502);
  }
  const { error: insErr } = await db.from('payment_attempts').insert({ track_id: z.trackId, order_id: order.id, amount });
  if (insErr) { console.error('ATTEMPT_INSERT', insErr.message); return json({ error: 'internal' }, 500); }
  await db.from('orders').update({ payment_status: 'pending', pay_started_at: new Date().toISOString() })
    .eq('id', order.id).eq('status', PENDING);
  return json({ url: `${ZIBAL}/start/${z.trackId}` });
}

async function notifyOrder(trackingCode: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingCode }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { console.error('NOTIFY_FAILED', String(e)); }
}

type Settled = { status: string; trackingCode?: string; refNumber?: string | null; total?: number; code?: number | null };

// ask Zibal about one transaction and record the answer; safe to call any number of times
async function settle(trackId: number, fromSweep = false): Promise<Settled> {
  const { data: att } = await db.from('payment_attempts').select('track_id, order_id, amount').eq('track_id', trackId).maybeSingle();
  if (!att) return { status: 'unknown' };
  const { data: order } = await db.from('orders')
    .select('id, status, payment_status, pay_ref_number, tracking_code, total, pay_sandbox')
    .eq('id', att.order_id).maybeSingle();
  if (!order) return { status: 'unknown' };
  const paid = (ref: string | null): Settled => ({ status: 'paid', trackingCode: order.tracking_code, refNumber: ref, total: order.total });

  if (order.payment_status === 'paid') return paid(order.pay_ref_number);
  // the order was cancelled (time ran out, replaced, or by the shop): don't capture the money,
  // Zibal returns an unverified payment to the customer by itself
  if (order.status !== PENDING) return { status: 'cancelled', trackingCode: order.tracking_code };

  // claim: one check at a time per order, and keeps the expiry job away while we talk to Zibal
  const recent = new Date(Date.now() - 10e3).toISOString();
  const { data: claimed } = await db.from('orders').update({ pay_checked_at: new Date().toISOString() })
    .eq('id', order.id).eq('status', PENDING)
    .or(`pay_checked_at.is.null,pay_checked_at.lt.${recent}`)
    .select('id').maybeSingle();
  if (!claimed) return { status: 'busy', trackingCode: order.tracking_code };

  const merchant = merchantCode(order.pay_sandbox);
  if (!merchant) return { status: 'error' };

  if (fromSweep) {
    // only verify when the customer has really paid (status 1 = verified, 2 = paid but not verified yet)
    const q = await zibal('/v1/inquiry', { merchant, trackId });
    await db.from('payment_attempts').update({ checked_at: new Date().toISOString(), result: q.status ?? q.result ?? null }).eq('track_id', trackId);
    if (!(q.result === 100 && (q.status === 1 || q.status === 2))) return { status: 'waiting' };
  }

  const z = await zibal('/v1/verify', { merchant, trackId });
  await db.from('payment_attempts').update({ checked_at: new Date().toISOString(), result: z.result ?? null }).eq('track_id', trackId);

  if (z.result === 100 || z.result === 201) {
    if (z.amount !== undefined && Number(z.amount) !== Number(att.amount)) {
      console.error('AMOUNT_MISMATCH', trackId, z.amount, att.amount);
      return { status: 'error', trackingCode: order.tracking_code };
    }
    const patch = {
      status: PAID, // the shop then confirms (تایید شده) or cancels it by hand
      payment_status: 'paid',
      pay_track_id: trackId,
      pay_ref_number: z.refNumber ? String(z.refNumber).slice(0, 64) : null,
      pay_card: z.cardNumber ? String(z.cardNumber).slice(0, 32) : null,
      paid_at: new Date().toISOString(), // Zibal's paidAt has no time zone, so use our own clock
      pay_amount: att.amount,
    };
    const { data: done } = await db.from('orders').update(patch).eq('id', order.id).eq('status', PENDING).select('id').maybeSingle();
    if (!done) {
      // cancelled in the few seconds we were talking to Zibal, but the money is taken: bring the order back
      console.error('LATE_PAYMENT', order.id);
      await db.from('orders').update({ ...patch, cancel_reason: null }).eq('id', order.id).eq('status', 'لغو شده');
    }
    await notifyOrder(order.tracking_code);
    return paid(patch.pay_ref_number);
  }

  if (!fromSweep) {
    await db.from('orders').update({ payment_status: 'failed' }).eq('id', order.id).eq('status', PENDING).eq('payment_status', 'pending');
  }
  return { status: 'failed', trackingCode: order.tracking_code, code: z.result ?? null };
}

async function sweep() {
  const now = Date.now();
  const { data: rows } = await db.from('payment_attempts')
    .select('track_id, orders!inner(status)')
    .eq('orders.status', PENDING)
    .lt('created_at', new Date(now - 5 * 60e3).toISOString())
    .gt('created_at', new Date(now - 90 * 60e3).toISOString())
    .or(`checked_at.is.null,checked_at.lt.${new Date(now - 4 * 60e3).toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(10);
  const out = [];
  for (const r of rows || []) out.push({ trackId: r.track_id, ...(await settle(Number(r.track_id), true)) });
  console.log('SWEEP', JSON.stringify(out.map(r => r.status)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (action === 'start') return await start(req, body);
    if (action === 'verify') {
      const trackId = Number(body.trackId);
      if (!Number.isSafeInteger(trackId) || trackId <= 0) return json({ error: 'bad_request' }, 400);
      return json(await settle(trackId));
    }
    if (action === 'sweep') {
      // the cron job calls us through pg_net, and our Zibal calls also go through pg_net: answer at once
      // and keep working in the background, otherwise the two would wait on each other
      const work = sweep().catch((e) => console.error('SWEEP_ERROR', String(e)));
      const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
      if (rt) rt.waitUntil(work); else await work;
      return json({ accepted: true });
    }
    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    console.error('PAYMENT_ERROR', String(err));
    return json({ error: 'internal' }, 500);
  }
});
