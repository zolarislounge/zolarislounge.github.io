// حذف پس‌زمینه‌ی عکس محصول در مرورگر: مدل ISNet + تمیزکاری ماسک + چیدن روی زمینه‌ی سفید ۳:۴
// استفاده: const blob = await ZLRemoveBg(file, (stage, p) => …)  →  JPEG با پس‌زمینه‌ی سفید
'use strict';
(() => {
  const S = 1024;                       // ورودی ثابت مدل
  const BASE = document.currentScript.src;
  let worker = null, seq = 0;
  const jobs = new Map();

  function getWorker() {
    if (worker) return worker;
    // نسخه‌ی اسکریپت (‎?v=…‎) به worker هم داده می‌شه تا CDN نسخه‌ی قدیمی رو نده
    worker = new Worker(new URL('worker.js' + new URL(BASE).search, BASE), { type: 'module' });
    worker.onmessage = e => {
      const d = e.data;
      if (d.type === 'progress') { for (const j of jobs.values()) j.onProgress && j.onProgress(d.stage, d.p); return; }
      const j = jobs.get(d.id); if (!j) return;
      jobs.delete(d.id);
      d.type === 'done' ? j.resolve(d.mask) : j.reject(new Error(d.message));
    };
    worker.onerror = e => {
      for (const j of jobs.values()) j.reject(new Error(e.message || 'worker_failed'));
      jobs.clear(); worker = null;
    };
    return worker;
  }

  function runModel(input, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      jobs.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ id, input, size: S }, [input.buffer]);
    });
  }

  // فاصله‌ی هر پیکسلِ داخل ماسک تا نزدیک‌ترین پیکسل بیرون (چمفر ۸ همسایه، دو گذر)
  function distIn(inside) {
    const N = S * S, D = new Float32Array(N), BIG = 1e9, R2 = Math.SQRT2;
    for (let i = 0; i < N; i++) D[i] = inside[i] ? BIG : 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x; if (!D[i]) continue;
      let v = D[i];
      if (x > 0) v = Math.min(v, D[i - 1] + 1); else v = Math.min(v, 1);
      if (y > 0) {
        v = Math.min(v, D[i - S] + 1);
        if (x > 0) v = Math.min(v, D[i - S - 1] + R2);
        if (x < S - 1) v = Math.min(v, D[i - S + 1] + R2);
      } else v = Math.min(v, 1);
      D[i] = v;
    }
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const i = y * S + x; if (!D[i]) continue;
      let v = D[i];
      if (x < S - 1) v = Math.min(v, D[i + 1] + 1); else v = Math.min(v, 1);
      if (y < S - 1) {
        v = Math.min(v, D[i + S] + 1);
        if (x < S - 1) v = Math.min(v, D[i + S + 1] + R2);
        if (x > 0) v = Math.min(v, D[i + S - 1] + R2);
      } else v = Math.min(v, 1);
      D[i] = v;
    }
    return D;
  }
  // برچسب اجزای به‌هم‌پیوسته (۸ همسایه) → { lab, sizes, minY, maxV } ؛ maxV بیشترین مقدار val در هر جزء
  function label(b, val) {
    const N = S * S, lab = new Int32Array(N), stack = new Int32Array(N), sizes = [0], minY = [0], maxV = [0], sumY = [0];
    for (let i = 0; i < N; i++) {
      if (!b[i] || lab[i]) continue;
      const id = sizes.length; let sp = 0, cnt = 0, my = S, mv = 0, sy = 0;
      stack[sp++] = i; lab[i] = id;
      while (sp) {
        const p = stack[--sp]; cnt++;
        const x = p % S, y = (p / S) | 0;
        if (y < my) my = y; sy += y;
        if (val && val[p] > mv) mv = val[p];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const q = ny * S + nx;
          if (b[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
      sizes.push(cnt); minY.push(my); maxV.push(mv); sumY.push(sy / cnt);
    }
    return { lab, sizes, minY, maxV, cy: sumY };
  }

  // چوب‌لباسی، قلاب و دستگیره‌ی بالای لباس: مدل این‌ها رو جزو محصول می‌بینه چون به لباس چسبیدن.
  // ۱) «خط شروع لباس» = اولین ردیفی که از بالا پهنای واقعی داره (قلاب و دستگیره و کمان چوب‌لباسی باریکن)
  // ۲) بالای اون خط فقط بخش‌های ضخیمی که به بدنه‌ی لباس وصلن (مثل لبه‌ی گرد یقه) می‌مونن؛ بقیه حذف می‌شه.
  // پایین‌تر از اون خط هیچ پیکسلی دست نمی‌خوره، پس لبه‌های لباس خراب نمی‌شه.
  function dropHanger(b) {
    const N = S * S;
    let y0 = S, y1 = -1, x0 = S, x1 = -1;
    for (let i = 0; i < N; i++) if (b[i]) { const x = i % S, y = (i / S) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (y1 < 0) return 0;
    const h = y1 - y0 + 1, w = x1 - x0 + 1;
    // باز کردن مورفولوژیک: بخش‌های باریک‌تر از 2r (قلاب، کمان چوب‌لباسی) جدا می‌شن؛ بدنه = بزرگ‌ترین تکه‌ی ضخیم
    const r = Math.max(5, Math.round(Math.min(w, h) * 0.025));
    const D = distIn(b), notCore = new Uint8Array(N);
    for (let i = 0; i < N; i++) notCore[i] = D[i] > r ? 0 : 1;
    const Dc = distIn(notCore), opened = new Uint8Array(N);
    for (let i = 0; i < N; i++) opened[i] = b[i] && (!notCore[i] || Dc[i] <= r + 1) ? 1 : 0;
    const L = label(opened);
    let body = 0; for (let k = 1; k < L.sizes.length; k++) if (!body || L.sizes[k] > L.sizes[body]) body = k;
    if (!body) return 0;
    // خط شروع لباس: اولین ردیفی که بدنه از اونجا به بعد پهنای واقعی داره
    const cnt = new Int32Array(S);
    for (let i = 0; i < N; i++) if (L.lab[i] === body) cnt[(i / S) | 0]++;
    let maxC = 0; for (let y = 0; y < S; y++) if (cnt[y] > maxC) maxC = cnt[y];
    const thr = maxC * 0.15, RUN = 6;
    let yc = y0;
    for (let y = y0; y < S - RUN; y++) {
      let ok = true; for (let k = 0; k < RUN; k++) if (cnt[y + k] < thr) { ok = false; break; }
      if (ok) { yc = y; break; }
    }
    yc = Math.min(yc, Math.round(y0 + h * 0.4));
    if (yc <= y0) return 0;   // چیزی بالای لباس نیست
    // بالای خط فقط بخش‌های ضخیمِ وصل به بدنه می‌مونه (مثل گردی یقه)؛ پایین خط دست نمی‌خوره
    let removed = 0;
    const lim = yc * S;
    for (let i = 0; i < lim; i++) if (b[i] && !(opened[i] && L.lab[i] === body)) { b[i] = 0; removed++; }
    // ۳) دسته‌های چوب‌لباسی کنار یقه/روی شونه: تکه‌های باریکی که از «لبه‌ی بالای» بدنه بیرون زدن.
    // لبه‌ی بالای بدنه برای هر ستون حساب می‌شه؛ فقط چیزی که بالاتر از اون لبه‌ست حذف می‌شه، پس داخل لباس دست نمی‌خوره.
    const top = new Int32Array(S).fill(S);
    for (let i = 0; i < N; i++) if (L.lab[i] === body) { const x = i % S, y = (i / S) | 0; if (y < top[x]) top[x] = y; }
    const topLim = Math.round(y0 + h * 0.45), res = new Uint8Array(N), above = new Float32Array(N);
    for (let i = 0; i < topLim * S; i++) {
      if (!b[i] || (opened[i] && L.lab[i] === body)) continue;
      const x = i % S, y = (i / S) | 0;
      res[i] = 1; if (y < top[x]) above[i] = top[x] - y;
    }
    const R = label(res, above);
    const below = new Int32Array(R.sizes.length);
    for (let i = 0; i < N; i++) if (R.lab[i] && !above[i]) below[R.lab[i]]++;
    for (let i = 0; i < N; i++) {
      const k = R.lab[i]; if (!k) continue;
      if (R.maxV[k] > r * 0.6 && below[k] < R.sizes[k] * 0.4 && above[i] > 0) { b[i] = 0; removed++; }
    }
    return removed;
  }

  // ماسک خام مدل → آلفای تمیز: فقط شکل(های) اصلی، بدون سوراخ و لکه، با لبه‌ی نرم
  function cleanMask(m, opts = {}) {
    const N = S * S;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < N; i++) { const v = m[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const rng = mx - mn || 1;
    const a = new Float32Array(N);
    const b = new Uint8Array(N);
    for (let i = 0; i < N; i++) { a[i] = (m[i] - mn) / rng; b[i] = a[i] > 0.4 ? 1 : 0; }

    // اجزای به‌هم‌پیوسته (۸ همسایه)؛ تکه‌های خیلی کوچیک حذف می‌شن
    const lab = new Int32Array(N), stack = new Int32Array(N), sizes = [0];
    for (let i = 0; i < N; i++) {
      if (!b[i] || lab[i]) continue;
      const id = sizes.length; let sp = 0, cnt = 0;
      stack[sp++] = i; lab[i] = id;
      while (sp) {
        const p = stack[--sp]; cnt++;
        const x = p % S, y = (p / S) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const q = ny * S + nx;
          if (b[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
      sizes.push(cnt);
    }
    let max = 0;
    for (let k = 1; k < sizes.length; k++) if (sizes[k] > max) max = sizes[k];
    if (max < N * 0.01) throw new Error('no_object');
    for (let i = 0; i < N; i++) if (b[i] && sizes[lab[i]] < max * 0.1) b[i] = 0;
    let hangerPx = 0;
    if (opts.hanger) {
      hangerPx = dropHanger(b);
      // بعد از بریدن قلاب، فقط بزرگ‌ترین تکه بمونه
      if (hangerPx) {
        const L2 = label(b); let big = 0;
        for (let k = 1; k < L2.sizes.length; k++) if (!big || L2.sizes[k] > L2.sizes[big]) big = k;
        for (let i = 0; i < N; i++) if (b[i] && L2.sizes[L2.lab[i]] < L2.sizes[big] * 0.1) b[i] = 0;
      }
    }

    // پر کردن سوراخ‌ها: هر جای خالی که به لبه‌ی عکس راه نداره، جزو محصوله
    const out = new Uint8Array(N); let sp = 0;
    const seed = p => { if (!b[p] && !out[p]) { out[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < S; x++) { seed(x); seed((S - 1) * S + x); }
    for (let y = 0; y < S; y++) { seed(y * S); seed(y * S + S - 1); }
    while (sp) {
      const p = stack[--sp], x = p % S;
      if (x > 0) seed(p - 1);
      if (x < S - 1) seed(p + 1);
      if (p >= S) seed(p - S);
      if (p < N - S) seed(p + S);
    }

    // داخل شکل کاملاً مات، فقط لبه‌ها از ماسک نرم مدل
    let core = new Uint8Array(N);
    for (let i = 0; i < N; i++) core[i] = out[i] ? 0 : 1;
    const filled = core.slice();
    for (let it = 0; it < 3; it++) {
      const nx = new Uint8Array(N);
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        const i = y * S + x;
        nx[i] = core[i] & core[i - 1] & core[i + 1] & core[i - S] & core[i + S];
      }
      core = nx;
    }
    const al = new Float32Array(N);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let i = 0; i < N; i++) {
      al[i] = core[i] ? 1 : filled[i] ? Math.min(1, Math.max(0, (a[i] - 0.2) / 0.4)) : 0;
      if (filled[i]) { const x = i % S, y = (i / S) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    // نرم کردن لبه با یه تاری ۳×۳
    const px = new Uint8ClampedArray(N * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < S && ny < S) { s += al[ny * S + nx]; c++; }
      }
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = Math.round(s / c * 255);
    }
    return { px, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, hangerPx };
  }

  // ماسک مدل برای هر فایل نگه داشته می‌شه تا روشن/خاموش کردن «حذف آویز» دوباره مدل رو اجرا نکنه
  const masks = new WeakMap();
  // opts.hanger: حذف چوب‌لباسی/قلاب/دستگیره‌ی بالای لباس. نتیجه: Blob با .hanger (آیا چیزی حذف شد)
  async function removeBackground(file, onProgress = () => { }, opts = {}) {
    const bmp = await createImageBitmap(file);
    // ورودی مدل: ۱۰۲۴×۱۰۲۴، مقادیر (رنگ/۲۵۵ − ۰٫۵) به ترتیب کانال‌ها
    const c1 = new OffscreenCanvasOr(S, S), x1 = c1.getContext('2d');
    x1.drawImage(bmp, 0, 0, S, S);
    const d = x1.getImageData(0, 0, S, S).data, N = S * S;
    const input = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      input[i] = d[i * 4] / 255 - 0.5;
      input[N + i] = d[i * 4 + 1] / 255 - 0.5;
      input[2 * N + i] = d[i * 4 + 2] / 255 - 0.5;
    }
    let mask = masks.get(file);
    if (!mask) { mask = await runModel(input, onProgress); masks.set(file, mask); }
    onProgress('compose');
    const { px, box, hangerPx } = cleanMask(mask, opts);

    // عکس اصلی با آلفای ماسک (حداکثر ۲۴۰۰ پیکسل برای حافظه)
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
    const mc = new OffscreenCanvasOr(S, S); mc.getContext('2d').putImageData(new ImageData(px, S, S), 0, 0);
    const cut = new OffscreenCanvasOr(W, H), cx = cut.getContext('2d');
    cx.drawImage(bmp, 0, 0, W, H);
    cx.globalCompositeOperation = 'destination-in';
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(mc, 0, 0, W, H);

    // وسط زمینه‌ی سفید ۳:۴، با حاشیه
    const bx = box.x0 / S * W, by = box.y0 / S * H, bw = (box.x1 - box.x0) / S * W, bh = (box.y1 - box.y0) / S * H;
    const OH = Math.min(1600, Math.max(900, Math.round(Math.max(bh, bw * 4 / 3) / 0.86)));
    const OW = Math.round(OH * 3 / 4);
    const sc = Math.min(OW * 0.86 / bw, OH * 0.86 / bh);
    const outC = new OffscreenCanvasOr(OW, OH), ox = outC.getContext('2d');
    ox.fillStyle = '#fff'; ox.fillRect(0, 0, OW, OH);
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(cut, bx, by, bw, bh, (OW - bw * sc) / 2, (OH - bh * sc) / 2, bw * sc, bh * sc);
    bmp.close && bmp.close();
    const blob = await toBlob(outC, 'image/jpeg', 0.93);
    blob.hanger = hangerPx > S * S * 0.0005;
    return blob;
  }

  // OffscreenCanvas در سافاری‌های قدیمی نیست؛ اون‌جا از canvas معمولی استفاده می‌شه
  function OffscreenCanvasOr(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function toBlob(c, type, q) {
    if (c.convertToBlob) return c.convertToBlob({ type, quality: q });
    return new Promise(r => c.toBlob(r, type, q));
  }

  window.ZLRemoveBg = removeBackground;
})();
