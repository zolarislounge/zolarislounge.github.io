// Public and harmless: tells the page whether the visitor is connecting from inside Iran,
// so it can ask them to switch their VPN off before paying through an Iranian bank gateway.
// (کپی از پروژه‌ی حناگالری)
import { clientIp, isIranIp } from './iran.ts';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const iran = await isIranIp(clientIp(req));
  return new Response(JSON.stringify({ iran }), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
});
