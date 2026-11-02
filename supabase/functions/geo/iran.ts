// Is this connection coming from inside Iran? Iranian bank gateways (Shaparak) refuse foreign
// connections, so a customer with a VPN switched on cannot pay. The check uses the public list of
// address blocks registered to Iran (ipdeny.com, fetched by this function and kept for 12 hours);
// the visitor's address itself never leaves this function.
// (کپی از پروژه‌ی حناگالری)
const LISTS = [
  'https://www.ipdeny.com/ipblocks/data/aggregated/ir-aggregated.zone',
  'https://www.ipdeny.com/ipv6/ipaddresses/aggregated/ir-aggregated.zone',
];
let v4: [number, number][] | null = null;
let v6: [bigint, bigint][] | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;

function ip4(s: string): number | null {
  const p = s.trim().split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function ip6(s: string): bigint | null {
  s = s.trim().toLowerCase();
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail];
  if (parts.length !== 8) return null;
  let v = 0n;
  for (const x of parts) {
    const n = parseInt(x || '0', 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
    v = (v << 16n) + BigInt(n);
  }
  return v;
}
async function load() {
  const [a, b] = await Promise.all(LISTS.map((u) =>
    fetch(u, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))));
  const n4: [number, number][] = [];
  for (const line of a.split('\n')) {
    const [ip, bits] = line.trim().split('/');
    const start = ip4(ip || ''), m = Number(bits);
    if (start === null || !(m >= 0 && m <= 32)) continue;
    n4.push([start, start + 2 ** (32 - m) - 1]);
  }
  const n6: [bigint, bigint][] = [];
  for (const line of b.split('\n')) {
    const [ip, bits] = line.trim().split('/');
    const start = ip6(ip || ''), m = Number(bits);
    if (start === null || !(m >= 0 && m <= 128)) continue;
    n6.push([start, start + (1n << BigInt(128 - m)) - 1n]);
  }
  if (n4.length < 100) throw new Error('list too short');
  v4 = n4; v6 = n6; loadedAt = Date.now();
}
export function clientIp(req: Request): string {
  return (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
}
// true = Iran, false = abroad (VPN on), null = could not tell (never block on this)
export async function isIranIp(ip: string): Promise<boolean | null> {
  if (!ip) return null;
  if (!v4 || Date.now() - loadedAt > 12 * 3600e3) {
    try { loading = loading || load(); await loading; } catch (e) { console.error('IR_LIST', String(e)); } finally { loading = null; }
  }
  if (!v4) return null;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  if (ip.includes('.')) {
    const n = ip4(ip);
    if (n === null) return null;
    return v4.some(([s, e]) => n >= s && n <= e);
  }
  const n = ip6(ip);
  if (n === null || !v6) return null;
  return v6.some(([s, e]) => n >= s && n <= e);
}
