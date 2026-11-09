// فروشگاه Zolaris — اتصال سایت به Supabase: محصولات، سبد خرید، ورود با موبایل، ثبت سفارش، پرداخت زیبال
'use strict';
(() => {
  // کلید publishable عمومیه؛ امنیت داده‌ها با RLS سمت سرور تأمین می‌شه
  const SB_URL = 'https://avwgfmdnwibtxurlnphw.supabase.co';
  const SB_KEY = 'sb_publishable_VOh9R0tdxf-3YFN9_y3J1Q_mf9kIXf2';
  const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, storageKey: 'zl-auth' } }) : null;

  // دسته‌های منو از پنل مدیریت (site_settings → categories) میان؛ این فقط پیش‌فرض تا وقتی لود بشه
  let CATS = ['همه محصولات', 'بافت و پلیور', 'مانتو، کت و جلیقه', 'پالتو', 'شومیز و تاپ', 'شلوار و دامن', 'تیشرت', 'شال', 'کیف', 'کفش', 'اکسسوری'];
  let CKEYS = [null, 'knit', 'coat', 'overcoat', 'top', 'bottom', 'tshirt', 'scarf', 'bag', 'shoes', 'accessory'];
  // تا وقتی محصولی در پنل اضافه نشده، این نمونه‌ها فقط برای نمایش هستن (قابل خرید نیستن)
  const SAMPLE = [
    { id: -1, image_url: 'assets/products/knit-1-w.jpg', name: 'Argyle Grey', category_label: 'بافت و پلیور' },
    { id: -2, image_url: 'assets/products/knit-2-w.jpg', name: 'Ivory Lace', category_label: 'بافت و پلیور' },
    { id: -3, image_url: 'assets/products/knit-3-w.jpg', name: 'Argyle Olive', category_label: 'بافت و پلیور' },
    { id: -4, image_url: 'assets/products/knit-4-w.jpg', name: 'Argyle Pistachio', category_label: 'بافت و پلیور' },
    { id: -5, image_url: 'assets/products/knit-5-w.jpg', name: 'Argyle Bordeaux', category_label: 'بافت و پلیور' },
  ].map(p => ({ ...p, sample: true, price: 0, stock: 0 }));

  // ───────── ابزارها ─────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = n => Number(n || 0).toLocaleString('fa-IR');
  const toman = n => fa(n) + ' تومان';
  const faDigits = s => String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const toEn = s => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const fdate = d => d ? new Date(d).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) : '';
  function normPhone(p) {
    const d = toEn(p).replace(/\D/g, '');
    if (/^09\d{9}$/.test(d)) return d;
    if (/^9\d{9}$/.test(d)) return '0' + d;
    if (/^989\d{9}$/.test(d)) return '0' + d.slice(2);
    if (/^00989\d{9}$/.test(d)) return '0' + d.slice(4);
    return null;
  }
  const intl = p => '+98' + p.slice(1);
  const ls = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* حالت خصوصی */ } },
  };
  function toast(t, bad) {
    const el = $('#toast'); el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), bad ? 4000 : 2000);
  }
  const ERR = {
    HG_LOGIN: 'برای ثبت سفارش اول وارد حساب شو', HG_TOO_MANY: 'چند سفارش پشت هم ثبت کردی؛ چند دقیقه دیگه دوباره امتحان کن',
    HG_REQUIRED: 'نام و آدرس رو کامل وارد کن', HG_BAD_PHONE: 'شماره موبایل درست نیست', HG_BLOCKED: 'امکان ثبت سفارش برای این حساب وجود نداره؛ با پشتیبانی تماس بگیر',
    HG_ITEMS: 'سبد خرید معتبر نیست؛ صفحه رو تازه کن', HG_STOCK: 'موجودی کافی نیست', HG_GONE: 'این محصول دیگه موجود نیست',
    HG_COUPON_USED: 'قبلاً از این کد تخفیف استفاده کردی', HG_COUPON: 'کد تخفیف معتبر نیست یا تموم شده',
  };
  function errText(e) {
    const m = String(e?.message || e || '');
    for (const k in ERR) if (m.includes(k)) { const extra = m.split(k + ':')[1]; return ERR[k] + (extra ? ': ' + extra.trim() : ''); }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'اتصال برقرار نشد؛ اینترنت رو چک کن';
    return 'خطایی پیش اومد؛ دوباره امتحان کن';
  }
  async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

  // ───────── وضعیت ─────────
  // state: 'loading' تا جواب دیتابیس بیاد (اسکلت نمایش داده می‌شه)، 'ready' یا 'error'
  let products = [], live = false, state = 'loading', cat = 0, query = '', sizes = new Set(), colorsF = new Set(), favOnly = false;
  let cart = ls.get('zl-cart', []).filter(i => i && i.id > 0 && i.qty > 0);
  let favs = new Set(ls.get('zl-favs', []));
  let user = null, profile = null, payMode = 'off', afterLogin = null;

  // ───────── آمار بازدید (بدون اطلاعات شخصی) ─────────
  const sid = (() => { let s = ls.get('zl-sid'); if (!s || !/^[A-Za-z0-9]{16}$/.test(s)) { s = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join(''); ls.set('zl-sid', s); } return s; })();
  const source = (() => {
    const u = new URLSearchParams(location.search);
    let s = u.get('utm_source') || u.get('src') || u.get('ref');
    try { if (!s) s = sessionStorage.getItem('zl-src'); } catch (e) { }
    if (!s && document.referrer) {
      try { const h = new URL(document.referrer).hostname; if (h !== location.hostname) s = /instagram/.test(h) ? 'instagram' : /google/.test(h) ? 'google' : /t\.me|telegram/.test(h) ? 'telegram' : h.replace(/^www\./, ''); } catch (e) { }
    }
    s = s ? s.slice(0, 40) : null;
    try { if (s) sessionStorage.setItem('zl-src', s); } catch (e) { }
    return s;
  })();
  const track = (kind, pid) => sb && sb.rpc('track_event', { p_kind: kind, p_product: pid || null, p_source: source, p_session: sid }).then(() => { }, () => { });

  // ───────── قیمت و موجودی (همون منطق سرور) ─────────
  function variants(p) {
    if (!p.variants || !String(p.variants).trim()) return [];
    return String(p.variants).split(/[,،]/).map(x => x.trim()).filter(Boolean).map(x => {
      const [name, qty, price] = x.split(':').map(y => (y || '').trim());
      return { name, qty: qty === 'ناموجود' ? 0 : (/^\d+$/.test(qty || '') ? +qty : null), price: /^\d+(\.\d+)?$/.test(price || '') && +price > 0 ? +price : null };
    });
  }
  const onSale = p => p.sale_price > 0 && p.sale_price < p.price && (!p.sale_starts_at || new Date(p.sale_starts_at) <= Date.now()) && (!p.sale_ends_at || new Date(p.sale_ends_at) > Date.now());
  function priceOf(p, v) {
    const vp = v && variants(p).find(x => x.name === v)?.price;
    return Math.round(vp || (onSale(p) ? p.sale_price : p.price));
  }
  function avail(p, v) {
    let n = p.stock || 0;
    if (v) { const x = variants(p).find(y => y.name === v); if (!x) return 0; if (x.qty != null) n = Math.min(n, x.qty); }
    return Math.max(0, n);
  }
  // همه‌ی عکس‌های محصول (اولی = عکس اصلی)
  const imgsOf = p => (Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : [])).filter(Boolean);
  // توضیحات: پاراگراف با خط خالی، خط‌های «-» فهرست، «عنوان: مقدار» با عنوان پررنگ
  // جستجو: «ك/ي» عربی و فاصله‌ی مجازی با شکل فارسی یکی حساب می‌شن
  const norm = t => toEn(String(t || '')).replace(/ك/g, 'ک').replace(/[يى]/g, 'ی').replace(/\u200c/g, ' ').toLowerCase();
  // عکس کوچیک (حدود ۶۰۰px) برای کارت‌ها؛ پنل موقع آپلود کنار هر عکس می‌سازه (…/x.jpg → …/x.jpg.t.jpg).
  // اگه نبود (عکس‌های قدیمی‌تر)، خودِ عکس اصلی لود می‌شه.
  const thumbOf = u => /\/storage\/v1\/object\/public\/image\/products\/[^/?#]+\.(jpe?g|png|webp)$/i.test(u || '') ? u + '.t.jpg' : u;
  const thumbImg = (u, alt = '', extra = '') => { const t = thumbOf(u); return `<img src="${esc(t)}"${t !== u ? ` data-full="${esc(u)}" onerror="this.onerror=null;this.src=this.dataset.full"` : ''} alt="${esc(alt)}" loading="lazy"${extra}>`; };
  function descHtml(t) {
    return String(t || '').replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => {
      let html = '', list = [], para = [];
      const line = l => { const kv = l.match(/^([^:：]{1,24})[:：]\s*(.+)$/); return kv ? `<b>${esc(kv[1])}:</b> ${esc(kv[2])}` : esc(l); };
      const flushL = () => { if (list.length) { html += '<ul>' + list.map(x => `<li>${line(x)}</li>`).join('') + '</ul>'; list = []; } };
      const flushP = () => { if (para.length) { html += '<p>' + para.map(line).join('<br>') + '</p>'; para = []; } };
      for (const l of block.split('\n').map(x => x.trim()).filter(Boolean)) {
        const m = l.match(/^[-•*–]\s*(.+)$/);
        if (m) { flushP(); list.push(m[1]); } else { flushL(); para.push(l); }
      }
      flushP(); flushL();
      return html;
    }).join('');
  }
  // سایزها و رنگ‌های محصول؛ هر ترکیب در variants با نام «سایز / رنگ» ثبت شده
  const SEP = ' / ';
  function optsOf(p) {
    const o = p.options || {};
    const sz = Array.isArray(o.sizes) ? o.sizes : [], cl = Array.isArray(o.colors) ? o.colors.filter(c => c && c.name) : [];
    if (sz.length || cl.length) return { sizes: sz, colors: cl };
    const vs = variants(p);
    return vs.length ? { sizes: vs.map(v => v.name), colors: [] } : null;   // محصول‌های قدیمی: مدل‌ها = سایز
  }
  const combo = (o, sz, cl) => [o.sizes.length ? sz : null, o.colors.length ? cl : null].filter(Boolean).join(SEP);
  const colorHex = (p, variant) => { const o = optsOf(p); return o && variant ? o.colors.find(c => variant.split(SEP).includes(c.name))?.hex : null; };
  const inCart = (id, v) => cart.filter(i => i.id === id && (v == null || i.variant === v)).reduce((a, i) => a + i.qty, 0);

  // ───────── محصولات ─────────
  const heart = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-9.8A4 4 0 0 1 12 7.6a4 4 0 0 1 7 2.6C19 15.6 12 20 12 20z"/></svg>';
  function priceHtml(p) {
    if (p.sample) return '<span class="soon">به‌زودی</span>';
    const vs = variants(p).filter(v => v.price);
    const from = vs.length ? Math.min(priceOf(p), ...vs.map(v => v.price)) : null;
    if (onSale(p)) return `<s>${fa(p.price)}</s> ${toman(p.sale_price)}`;
    return (from != null && from < priceOf(p) ? 'از ' + toman(from) : toman(priceOf(p)));
  }
  function render() {
    if (state === 'loading') {
      $('#favBar').hidden = true;
      $('#grid').innerHTML = Array.from({ length: 4 }, () => '<article class="card sk in" aria-hidden="true"><div class="media"></div><i class="l1"></i><i class="l2"></i><i class="l3"></i></article>').join('');
      $('#grid').setAttribute('aria-busy', 'true');
      return;
    }
    $('#grid').removeAttribute('aria-busy');
    if (state === 'error') {
      $('#grid').innerHTML = '<div class="empty" style="grid-column:1/-1">بارگذاری محصولات انجام نشد.<br><button class="more" id="retryLoad" style="margin:14px auto 0">تلاش دوباره</button></div>';
      $('#retryLoad').onclick = () => { state = 'loading'; render(); loadProducts(); };
      return;
    }
    const term = norm(query.trim());
    let list = products.filter(p => (!cat || (CKEYS[cat] ? p.category === CKEYS[cat] : p.category_label === CATS[cat]))
      && (!term || norm(p.name + ' ' + (p.category_label || '')).includes(term))
      && (!sizes.size || (optsOf(p)?.sizes || []).some(z => sizes.has(z)))
      && (!colorsF.size || (optsOf(p)?.colors || []).some(c => colorsF.has(c.name)))
      && (!favOnly || favs.has(p.id)));
    const s = $('#sort').value;
    // «پیشنهادی»: ترتیبی که در پنل چیده شده؛ بقیه به ترتیب جدیدترین
    if (s === 'pick') list = [...list].sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9));
    if (s === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (s === 'cheap') list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    if (s === 'exp') list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
    // ناموجودها آخر
    list = [...list].sort((a, b) => (!a.sample && !a.stock) - (!b.sample && !b.stock));
    $('#favBar').hidden = !favOnly;
    $('#grid').innerHTML = list.length ? list.map(p => {
      const out = !p.sample && !p.stock, vs = variants(p);
      return `<article class="card">
        <div class="media" data-view="${p.id}">${p.image_url ? thumbImg(p.image_url, p.name) : ''}${imgsOf(p)[1] ? thumbImg(imgsOf(p)[1], '', ' class="alt"') : ''}
          ${p.sample ? '' : `<button class="fav${favs.has(p.id) ? ' on' : ''}" data-fav="${p.id}" aria-label="علاقه‌مندی">${heart}</button>`}
          ${out ? '<span class="badge out">ناموجود</span>' : onSale(p) ? '<span class="badge sale">حراج</span>' : p.is_new ? '<span class="badge">جدید</span>' : ''}</div>
        <h3 class="name" data-view="${p.id}" ${p.sample ? '' : 'role="button" tabindex="0"'}>${esc(p.name)}</h3>
        <div class="cat">${esc(p.category_label || '')}</div>
        ${(() => { const cs = optsOf(p)?.colors || []; return cs.length ? `<div class="dots" aria-label="${fa(cs.length)} رنگ">${cs.slice(0, 6).map(c => `<i style="background:${esc(c.hex || '#999')}" title="${esc(c.name)}"></i>`).join('')}${cs.length > 6 ? `<small>+${fa(cs.length - 6)}</small>` : ''}</div>` : ''; })()}
        <div class="price">${priceHtml(p)}</div>
        ${p.sample ? '' : out ? '<button class="add out" disabled>ناموجود</button>'
          : vs.length ? `<button class="add" data-view="${p.id}">انتخاب سایز</button>` : `<button class="add" data-add="${p.id}">افزودن به سبد خرید</button>`}
      </article>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1">${favOnly ? 'هنوز محصولی رو به علاقه‌مندی‌ها اضافه نکردی.' : term ? `محصولی با «${esc(query.trim())}» پیدا نشد.` : 'فعلاً محصولی در این دسته نیست.'}
      ${favOnly ? '' : `<div class="empty-go">${term ? '<span>یکی از این‌ها رو ببین:</span>' : ''}<button data-cat="0" data-q="0">همه‌ی محصولات</button>${CATS.slice(1).filter((c, i) => products.some(p => !p.sample && (CKEYS[i + 1] ? p.category === CKEYS[i + 1] : p.category_label === c))).slice(0, 5).map(c => `<button data-cat="${CATS.indexOf(c)}" data-q="0">${esc(c)}</button>`).join('')}</div>`}</div>`;
    reveal();
  }
  function reveal() {
    const cards = $$('.card:not(.in)');
    if (!('IntersectionObserver' in window)) return cards.forEach(c => c.classList.add('in'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .05 });
    cards.forEach((c, i) => { c.style.transitionDelay = (i % 2) * .08 + 's'; io.observe(c); });
  }
  let hiddenKeys = new Set();
  // اینترنت ایران گاهی اتصال به سرور (سنگاپور) رو کند یا قطع می‌کنه: آخرین لیست محصولات روی گوشی
  // نگه داشته می‌شه و فوراً نشون داده می‌شه، بعد بی‌صدا با نسخه‌ی تازه جایگزین می‌شه.
  const CACHE_KEY = 'zl-cache-v1';
  function applyData(rows, list) {
    if (list) {
      CATS = ['همه محصولات', ...list.filter(c => !c.hidden).map(c => c.label)];
      CKEYS = [null, ...list.filter(c => !c.hidden).map(c => c.key)];
      hiddenKeys = new Set(list.filter(c => c.hidden).map(c => c.key));
    }
    live = rows.length > 0;
    // نمونه‌ها فقط وقتی که دیتابیس واقعاً هیچ محصولی نداره
    // مدیرها محصولات مخفی رو هم از دیتابیس می‌گیرن؛ توی سایت نشون داده نمی‌شن
    products = live ? rows.filter(p => !p.hidden) : SAMPLE;
    state = 'ready';
    // محصولی که دسته‌اش در لیست پنل نیست (و مخفی هم نشده) گم نمی‌شه: دسته‌اش ته منو اضافه می‌شه
    for (const p of products) {
      if (!p.category_label || hiddenKeys.has(p.category)) continue;
      if (p.category ? !CKEYS.includes(p.category) : !CATS.includes(p.category_label)) { CATS.push(p.category_label); CKEYS.push(p.category || null); }
    }
    drawCats(); drawSizes(); render(); renderCart();
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  let fromCache = false;
  async function loadProducts(attempt = 0) {
    if (!sb) { state = 'error'; render(); return; }
    if (!attempt && state === 'loading') {
      const c = ls.get(CACHE_KEY);
      if (c && Array.isArray(c.rows) && c.rows.length) { fromCache = true; applyData(c.rows, c.list); }
    }
    try {
      // بار اول از درخواستی که از <head> شروع شده استفاده می‌شه؛ تلاش‌های بعدی از راه معمول
      const early = !attempt && window.__zlEarly; window.__zlEarly = null;
      const [rows, cs] = await withTimeout(early || Promise.all([
        q(sb.from('products').select('*').order('created_at', { ascending: false })),
        q(sb.from('site_settings').select('value').eq('key', 'categories').maybeSingle()).catch(() => null),
      ]), 15000);
      const list = Array.isArray(cs?.value?.list) ? cs.value.list : null;
      applyData(rows, list); fromCache = false;
      ls.set(CACHE_KEY, { t: Date.now(), rows: rows.filter(p => !p.hidden), list });
    } catch (e) {
      console.error(e);
      // یه بار دیگه خودکار امتحان می‌شه؛ اگه لیست ذخیره‌شده داریم، همون نمایش داده می‌مونه
      if (attempt < 2) { setTimeout(() => loadProducts(attempt + 1), 2500); return; }
      if (!live) { products = []; state = 'error'; render(); }
    }
  }
  function drawCats() {
    $('#menuList').innerHTML = ['صفحه اصلی', ...CATS, 'تماس با ما'].map((c, i) => `<a href="${i === CATS.length + 1 ? '#contact' : '#shop'}" data-cat="${i - 1}"${i - 1 === cat ? ' class="on"' : ''}>${esc(c)}<span>‹</span></a>`).join('');
    $('#fcat').innerHTML = CATS.map((c, i) => `<button data-fc="${i}"${i === cat ? ' class="on"' : ''}>${esc(c)}</button>`).join('');
  }
  function drawSizes() {
    const all = [...new Set(products.filter(p => !p.sample).flatMap(p => optsOf(p)?.sizes || []))];
    $('#fsizeWrap').hidden = !all.length;
    $('#fsize').innerHTML = all.map(s => `<button dir="auto" data-sz="${esc(s)}"${sizes.has(s) ? ' class="on"' : ''}>${esc(s)}</button>`).join('');
    const cols = new Map();
    products.filter(p => !p.sample).forEach(p => (optsOf(p)?.colors || []).forEach(c => cols.has(c.name) || cols.set(c.name, c.hex)));
    $('#fcolorWrap').hidden = !cols.size;
    $('#fcolor').innerHTML = [...cols].map(([n, h]) => `<button data-fcl="${esc(n)}"${colorsF.has(n) ? ' class="on"' : ''}><i style="background:${esc(h || '#999')}"></i>${esc(n)}</button>`).join('');
  }
  // اسکرول به ابتدای یه بخش، درست زیر هدر چسبون (قبلاً هدر بالای محصولات و نوار فیلتر رو می‌پوشوند)
  function scrollToEl(el) {
    if (!el) return;
    const head = $('header').getBoundingClientRect().height;
    const y = el.getBoundingClientRect().top + window.scrollY - head;
    window.scrollTo({ top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function setCat(i) {
    cat = i >= 0 && i < CATS.length ? i : 0; favOnly = false;
    $$('[data-fc]').forEach(b => b.classList.toggle('on', +b.dataset.fc === cat));
    $$('#menuList a').forEach(a => a.classList.toggle('on', +a.dataset.cat === cat));
    render();
  }

  // ───────── صفحه‌ی محصول ─────────
  // آدرس صفحه با محصول باز همراهه تا قابل اشتراک و برگشت باشه
  function setProductUrl(id) {
    const u = new URL(location.href);
    if (id) u.searchParams.set('p', id); else u.searchParams.delete('p');
    if (u.href !== location.href) history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  }
  async function shareProduct(p) {
    const url = `${location.origin}${location.pathname}?p=${p.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: p.name + ' | Zolaris Lounge', url }); return; }
      await navigator.clipboard.writeText(url); toast('لینک محصول کپی شد');
    } catch (e) { if (e && e.name !== 'AbortError') { prompt('لینک محصول:', url); } }
  }
  async function openProduct(id) {
    const p = products.find(x => x.id === id); if (!p || p.sample) return;
    setProductUrl(id);
    $('#pvShare').onclick = () => shareProduct(p);
    const vs = variants(p), o = optsOf(p);
    let sz = o && o.sizes.length === 1 ? o.sizes[0] : null, cl = o && o.colors.length === 1 ? o.colors[0].name : null, qty = 1;
    const curSel = () => !o || (o.sizes.length && !sz) || (o.colors.length && !cl) ? null : combo(o, sz, cl);
    let sel = curSel();
    const sizeOk = z => cl || !o.colors.length ? avail(p, combo(o, z, cl)) > 0 : o.colors.some(c => avail(p, combo(o, z, c.name)) > 0);
    const colorOk = c => sz || !o.sizes.length ? avail(p, combo(o, sz, c)) > 0 : o.sizes.some(z => avail(p, combo(o, z, c)) > 0);
    const missing = () => o ? [o.colors.length && !cl ? 'رنگ' : null, o.sizes.length && !sz ? 'سایز' : null].filter(Boolean).join(' و ') : '';
    const sh = $('#pv'), imgs = imgsOf(p);
    sh.querySelector('.pv-body').innerHTML = `
      <div class="pv-gal">
        <div class="pv-track" id="pvT">${imgs.map((u, k) => `<div class="pv-slide"><img src="${esc(u)}" alt="${esc(p.name)}" data-zoom="${k}" ${k ? 'loading="lazy"' : ''} draggable="false"></div>`).join('') || '<div class="pv-slide"></div>'}</div>
        ${imgs.length ? '<span class="pv-zh" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg></span>' : ''}
        ${imgs.length > 1 ? `<button class="pv-nav prev" data-nav="-1" aria-label="عکس قبلی">›</button><button class="pv-nav next" data-nav="1" aria-label="عکس بعدی">‹</button>
          <div class="pv-dots">${imgs.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>` : ''}
      </div>
      ${imgs.length > 1 ? `<div class="pv-thumbs">${imgs.map((u, k) => `<button data-th="${k}" class="${k ? '' : 'on'}" aria-label="عکس ${fa(k + 1)}">${thumbImg(u)}</button>`).join('')}</div>` : ''}
      <div class="pv-info"><div id="pvMain"></div>
        <ul class="pv-trust">
          <li>${IC.truck}<span>ارسال<br>هفته‌ای دو بار</span></li>
          <li>${IC.shield}<span>پرداخت<br>امن</span></li>
          <li>${IC.chat}<span>پشتیبانی<br>واتس‌اپ و بله</span></li></ul>
        ${p.description ? `<details class="pv-acc" open><summary>توضیحات محصول${IC.chev}</summary><div class="pv-desc">${descHtml(p.description)}</div></details>` : ''}
        <details class="pv-acc" id="pvRevAcc"><summary>نظر مشتری‌ها <span id="pvRevN"></span>${IC.chev}</summary><div class="pv-rev" id="pvRev"></div></details>
        <a class="pv-ask" href="https://wa.me/989121816762?text=${encodeURIComponent('سلام، درباره‌ی محصول «' + p.name + '» سوال داشتم.')}" target="_blank" rel="noopener">${IC.chat}<span>سوالی درباره‌ی این محصول داری؟ <b>در واتس‌اپ بپرس</b></span></a>
        ${(() => {
          // «شاید بپسندی»: اول همین دسته، بعد بقیه (موجودها جلوتر)
          const rel = products.filter(x => x.id !== p.id && !x.sample).sort((a, b) => (b.category === p.category) - (a.category === p.category) || (!a.stock) - (!b.stock)).slice(0, 8);
          return rel.length ? `<section class="pv-rel"><h4>شاید بپسندی</h4><div class="pv-rel-t">${rel.map(x => `<button class="pv-ri" data-view="${x.id}"><span class="pv-ri-im">${x.image_url ? thumbImg(x.image_url, x.name) : ''}${!x.stock ? '<em>ناموجود</em>' : ''}</span><b>${esc(x.name)}</b><span class="pv-ri-p">${priceHtml(x)}</span></button>`).join('')}</div></section>` : '';
        })()}
        <div class="pv-bar" id="pvBar"></div></div>`;
    const gtrack = $('#pvT', sh);
    // گالری راست‌به‌چپ: عکس اول سمت راست؛ scrollLeft در RTL منفیه
    const goSlide = k => { k = Math.max(0, Math.min(imgs.length - 1, k)); gtrack.scrollTo({ left: -k * gtrack.clientWidth, behavior: 'smooth' }); };
    const cur = () => Math.round(Math.abs(gtrack.scrollLeft) / Math.max(1, gtrack.clientWidth));
    gtrack.onscroll = () => { const k = cur(); $$('.pv-dots i', sh).forEach((d, n) => d.classList.toggle('on', n === k)); $$('.pv-thumbs button', sh).forEach((b, n) => b.classList.toggle('on', n === k)); };
    $$('[data-nav]', sh).forEach(b => b.onclick = () => goSlide(cur() + +b.dataset.nav));
    $$('[data-th]', sh).forEach(b => b.onclick = () => goSlide(+b.dataset.th));
    $$('[data-zoom]', sh).forEach(im => im.onclick = () => zoom.open(imgs, +im.dataset.zoom));
    let added = false, needPick = false;
    const draw = () => {
      const max = avail(p, sel) - inCart(p.id, sel);
      const vPrice = sel ? variants(p).find(v => v.name === sel)?.price : null;
      const unit = priceOf(p, sel), was = onSale(p) && !vPrice ? p.price : 0;
      const off = was ? Math.round((1 - unit / was) * 100) : 0;
      const stock = !p.stock ? ['out', 'ناموجود']
        : (sel || !vs.length) ? (max <= 0 ? ['low', 'همه‌ی موجودی این مورد در سبد شماست'] : max <= 3 ? ['low', `فقط ${fa(max)} عدد باقی مانده`] : ['ok', 'موجود و آماده‌ی ارسال'])
        : ['ok', 'موجود'];
      $('#pvMain', sh).innerHTML = `
          <div class="pv-meta"><span>${esc(p.category_label || '')}</span>${off ? `<b class="pv-off">${fa(off)}٪ تخفیف</b>` : p.is_new ? '<b class="pv-new">جدید</b>' : ''}</div>
          <h2 class="pv-name" dir="auto">${esc(p.name)}</h2>
          <div class="pv-price">${sel || !vs.some(v => v.price) ? `${was ? `<s>${toman(was)}</s>` : ''}<b>${toman(unit)}</b>` : priceHtml(p)}</div>
          <div class="pv-stock ${stock[0]}"><i></i>${stock[1]}</div>
          ${o ? `<div class="pv-opt ${needPick ? 'need' : ''}" id="pvOpt">
            ${needPick && missing() ? `<div class="pv-alert" role="alert">${IC.alert}<span><b>${missing()} رو انتخاب نکردی</b>برای افزودن به سبد، ${missing()} رو از گزینه‌های زیر انتخاب کن.</span></div>` : ''}
            ${o.colors.length ? `<div class="pv-grp">
              <div class="pv-opt-h"><span>رنگ</span><b class="${needPick && !cl ? 'miss' : ''}">${cl ? esc(cl) : needPick ? 'لطفاً رنگ رو انتخاب کن' : 'انتخاب کن'}</b></div>
              <div class="pv-cl" id="pvC">${o.colors.map(c => { const a = colorOk(c.name); return `<button data-c="${esc(c.name)}" class="${c.name === cl ? 'on' : ''}" ${a ? '' : 'disabled'} aria-pressed="${c.name === cl}" aria-label="${esc(c.name)}${a ? '' : ' (ناموجود)'}" title="${esc(c.name)}${a ? '' : ' — ناموجود'}"><i style="background:${esc(c.hex || '#999')}"></i></button>`; }).join('')}</div></div>` : ''}
            ${o.sizes.length ? `<div class="pv-grp">
              <div class="pv-opt-h"><span>سایز</span><b class="${needPick && !sz ? 'miss' : ''}">${sz ? `<bdi>${esc(sz)}</bdi>` : needPick ? 'لطفاً سایز رو انتخاب کن' : 'انتخاب کن'}</b></div>
              <div class="pv-sz" id="pvV">${o.sizes.map(z => { const a = sizeOk(z); return `<button data-v="${esc(z)}" class="${z === sz ? 'on' : ''}" ${a ? '' : 'disabled'} aria-pressed="${z === sz}" dir="auto">${esc(z)}${a ? '' : '<small>ناموجود</small>'}</button>`; }).join('')}</div></div>` : ''}
          </div>` : ''}
          ${p.stock ? `<div class="pv-qrow"><span>تعداد</span><div class="cl-q"><button data-q="1" ${qty >= Math.max(1, max) ? 'disabled' : ''} aria-label="بیشتر">+</button><span>${fa(qty)}</span><button data-q="-1" ${qty <= 1 ? 'disabled' : ''} aria-label="کمتر">−</button></div></div>` : ''}`;
      $('#pvBar', sh).innerHTML = `
          <div class="pv-bar-p"><small>${qty > 1 ? `${fa(qty)} عدد` : 'قیمت'}</small><b>${toman(unit * qty)}</b></div>
          <button class="lg-btn pv-add ${added ? 'done' : ''}" id="pvAdd" ${!p.stock ? 'disabled' : ''}>${!p.stock ? '<span>ناموجود</span>' : added ? `<span>به سبد اضافه شد</span>${IC.check}` : needPick && !sel ? `<span>اول ${missing() || 'سایز'} رو انتخاب کن</span>${IC.up}` : `<span>افزودن به سبد</span>${IC.bag}`}</button>`;
      $$('#pvV button', sh).forEach(b => b.onclick = () => { sz = b.dataset.v; if (cl && !colorOk(cl)) cl = null; qty = 1; sel = curSel(); needPick = needPick && !sel; draw(); });
      $$('#pvC button', sh).forEach(b => b.onclick = () => { cl = b.dataset.c; if (sz && !sizeOk(sz)) sz = null; qty = 1; sel = curSel(); needPick = needPick && !sel; draw(); });
      $$('[data-q]', sh).forEach(b => b.onclick = () => { qty = Math.min(Math.max(1, qty + +b.dataset.q), Math.max(1, max)); draw(); });
      $('#pvAdd', sh).onclick = () => {
        if (added) return;
        if (o && !sel) {
          needPick = true; draw();
          const o = $('#pvOpt', sh); o.scrollIntoView({ behavior: 'smooth', block: 'center' });
          o.classList.remove('shake'); void o.offsetWidth; o.classList.add('shake');
          try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) { }
          return;
        }
        if (!addToCart(p.id, sel, qty, true)) return;
        added = true; draw();
        // a short confirmation, then the cart opens so the customer sees it landed
        setTimeout(() => { if ($('#pv').classList.contains('on')) { renderCart(); open('cart'); } }, 850);
      };
    };
    loadReviews(p);
    draw();
    sh.scrollTop = 0;
    open('pv'); setProductUrl(id);
    track('view', p.id);
  }
  async function loadReviews(p) {
    const box = $('#pvRev'); if (!box || !sb) return;
    let rows = [];
    try { rows = await q(sb.from('reviews').select('author_name,rating,comment,created_at').eq('product_id', p.id).eq('approved', true).order('created_at', { ascending: false }).limit(30)); } catch (e) { }
    if (!$('#pvRev')) return;
    const stars = n => '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>';
    const rn = $('#pvRevN'); if (rn) rn.textContent = rows.length ? `(${fa(rows.length)})` : '';
    box.innerHTML = `
      ${rows.map(r => `<div class="rv"><div><b>${esc(r.author_name)}</b><span class="stars">${stars(r.rating)}</span></div><p>${esc(r.comment)}</p></div>`).join('') || '<p class="muted">هنوز نظری ثبت نشده.</p>'}
      ${user ? `<form id="rvF" class="rvf"><div class="rate" id="rvR">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="r" id="r${n}" value="${n}"><label for="r${n}" title="${fa(n)}">★</label>`).join('')}</div>
        <textarea class="fld" name="c" rows="3" maxlength="1000" placeholder="نظرت درباره‌ی این محصول…" required></textarea>
        <button class="btn btn-o">ثبت نظر</button><small class="muted">نظر بعد از تایید فروشگاه نمایش داده می‌شه.</small></form>`
        : '<button class="link" data-open-acct>برای نوشتن نظر وارد شو</button>'}`;
    const f = $('#rvF');
    if (f) f.onsubmit = async e => {
      e.preventDefault();
      const r = +(new FormData(f).get('r') || 0), c = f.c.value.trim();
      if (!r) return toast('امتیاز رو انتخاب کن', true);
      try {
        await q(sb.from('reviews').insert({ product_id: p.id, user_id: user.id, author_name: (profile?.full_name || 'مشتری').slice(0, 80), rating: r, comment: c }));
        f.outerHTML = '<p class="ok">ممنون! نظرت بعد از تایید نمایش داده می‌شه.</p>';
      } catch (ex) { toast(/duplicate|unique/i.test(ex.message) ? 'قبلاً برای این محصول نظر دادی' : errText(ex), true); }
    };
  }

  // ───────── بزرگ‌نمایی عکس (دو انگشت، دو بار ضربه، چرخ ماوس) ─────────
  const zoom = (() => {
    const el = $('#zv'), stage = $('.zv-stage', el), img = $('img', stage);
    let list = [], idx = 0, s = 1, tx = 0, ty = 0, g = null, lastTap = 0, lx = 0, ly = 0;
    const pts = new Map();
    const apply = anim => { img.style.transition = anim ? 'transform .28s cubic-bezier(.22,.8,.2,1)' : 'none'; img.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${s})`; };
    const box = () => {
      const r = stage.getBoundingClientRect(), nw = img.naturalWidth || 1, nh = img.naturalHeight || 1, k = Math.min(r.width / nw, r.height / nh);
      return { w: nw * k, h: nh * k, cx: r.left + r.width / 2, cy: r.top + r.height / 2, W: r.width, H: r.height };
    };
    const clamp = () => { const b = box(), mx = Math.max(0, (b.w * s - b.W) / 2), my = Math.max(0, (b.h * s - b.H) / 2); tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty)); };
    const zoomAt = (ns, px, py) => {
      const b = box(); ns = Math.min(5, Math.max(1, ns));
      const ux = (px - b.cx - tx) / s, uy = (py - b.cy - ty) / s;
      s = ns; tx = px - b.cx - ux * s; ty = py - b.cy - uy * s;
      if (s === 1) tx = ty = 0;
      clamp();
    };
    const show = k => {
      idx = (k + list.length) % list.length; s = 1; tx = ty = 0; apply(false); img.style.opacity = '1';
      img.src = list[idx];
      $('.zv-count', el).textContent = list.length > 1 ? `${fa(idx + 1)} / ${fa(list.length)}` : '';
      $$('.zv-nav', el).forEach(b => b.hidden = list.length < 2);
    };
    // رفتن به عکس بعدی/قبلی با حرکت نرم. جهت همه‌جا یکیه (مثل گالری صفحه‌ی محصول):
    // بعدی از سمت راست میاد (عکس فعلی به چپ می‌ره)، قبلی از سمت چپ.
    let busy = false;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = dir => {
      if (list.length < 2 || busy) return;
      if (reduced()) { show(idx + dir); return; }
      busy = true;
      const W = stage.clientWidth;
      s = 1; ty = 0; tx = dir * W;   // راست‌به‌چپ: بعدی از چپ میاد، فعلی به راست می‌ره
      img.style.transition = 'transform .2s cubic-bezier(.4,0,.6,1)';
      img.style.transform = `translate3d(${tx}px,0,0) scale(1)`;
      setTimeout(async () => {
        show(idx + dir);
        try { await Promise.race([img.decode(), new Promise(r => setTimeout(r, 350))]); } catch (e) { }
        tx = -dir * W * .35; apply(false); img.style.opacity = '0'; void img.offsetWidth;
        tx = 0;
        img.style.transition = 'transform .34s cubic-bezier(.23,1,.32,1),opacity .22s ease-out';
        img.style.transform = 'translate3d(0,0,0) scale(1)'; img.style.opacity = '1';
        setTimeout(() => { busy = false; }, 340);
      }, 190);
    };
    const open = (l, k) => { list = l; el.hidden = false; root.classList.add('zfull'); requestAnimationFrame(() => el.classList.add('on')); show(k || 0); history.pushState({ ...(history.state || {}), zlZoom: 1 }, ''); };
    const close = fromPop => { if (el.hidden) return; busy = false; el.classList.remove('on'); el.hidden = true; root.classList.remove('zfull'); pts.clear(); g = null; if (fromPop !== true && history.state?.zlZoom) { pendingBack++; history.back(); } };
    const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 }; };
    const startOne = (x, y) => { g = { type: s > 1 ? 'pan' : 'swipe', x0: x, y0: y, tx0: tx, ty0: ty, t: Date.now(), moved: false }; };
    stage.addEventListener('pointerdown', e => {
      if (busy) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const m = mid(), b = box(); g = { type: 'pinch', d0: m.d, s0: s, ux: (m.x - b.cx - tx) / s, uy: (m.y - b.cy - ty) / s }; }
      else if (pts.size === 1) startOne(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.type === 'pinch' && pts.size >= 2) {
        const m = mid(), b = box();
        s = Math.min(5, Math.max(1, g.s0 * m.d / g.d0));
        tx = m.x - b.cx - g.ux * s; ty = m.y - b.cy - g.uy * s; clamp(); apply(false);
        return;
      }
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true;
      if (g.type === 'pan') { tx = g.tx0 + dx; ty = g.ty0 + dy; clamp(); apply(false); }
      else if (g.type === 'swipe' && list.length > 1) { tx = dx; apply(false); }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!g) return;
      if (g.type === 'pinch') {
        if (s < 1.05) { s = 1; tx = ty = 0; apply(true); }
        if (pts.size === 1) { const [p0] = pts.values(); startOne(p0.x, p0.y); g.moved = true; } else g = null;
        return;
      }
      const dx = e.clientX - g.x0, now = Date.now();
      if (g.type === 'swipe' && g.moved) {
        // کشیدن به اندازه‌ی کافی، یا یه حرکت سریع کوتاه
        const fast = Math.abs(dx) > 24 && Math.abs(dx) / Math.max(1, now - g.t) > .35;
        if ((Math.abs(dx) > 60 || fast) && list.length > 1) go(dx > 0 ? 1 : -1); else { tx = 0; apply(true); }
      } else if (!g.moved && now - g.t < 300) {
        // دو بار ضربه: بزرگ‌نمایی روی همون نقطه / برگشت
        if (now - lastTap < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 40) {
          if (s > 1) { s = 1; tx = ty = 0; } else zoomAt(2.5, e.clientX, e.clientY);
          apply(true); lastTap = 0;
        } else { lastTap = now; lx = e.clientX; ly = e.clientY; }
      }
      g = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); apply(false); }, { passive: false });
    $('.zv-x', el).onclick = close;
    $('.zv-nav.prev', el).onclick = () => go(-1);
    $('.zv-nav.next', el).onclick = () => go(1);
    addEventListener('resize', () => { if (!el.hidden) { s = 1; tx = ty = 0; apply(false); } });
    document.addEventListener('keydown', e => {
      if (el.hidden) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      if (e.key === 'ArrowLeft') go(1);
      if (e.key === 'ArrowRight') go(-1);
    }, true);
    return { open, close };
  })();

  // ───────── سبد خرید ─────────
  const saveCart = () => ls.set('zl-cart', cart);
  function addToCart(id, variant, qty = 1, quiet = false) {
    const p = products.find(x => x.id === id); if (!p || p.sample) return false;
    const max = avail(p, variant) - inCart(id, variant);
    if (max <= 0) { toast('بیشتر از این موجودی نداریم', true); return false; }
    qty = Math.min(qty, max);
    const ex = cart.find(i => i.id === id && i.variant === (variant || null));
    if (ex) ex.qty += qty; else cart.push({ id, variant: variant || null, qty });
    saveCart(); renderCart(); if (!quiet) toast('به سبد خرید اضافه شد'); track('cart', id);
    return true;
  }
  function cartLines() {
    return cart.map(i => ({ ...i, p: products.find(x => x.id === i.id) })).filter(l => l.p && !l.p.sample);
  }
  function renderCart() {
    if (live) { const before = cart.length; cart = cart.filter(i => products.some(p => p.id === i.id)); if (cart.length !== before) saveCart(); }
    const lines = live ? cartLines() : [];
    const n = cart.reduce((a, i) => a + i.qty, 0);
    count('#cartN', n);
    const body = $('#cartBody'), foot = $('#cartFoot');
    $('#cartSub').textContent = lines.length ? `${fa(lines.reduce((a, l) => a + l.qty, 0))} قلم در سبد شما` : 'هنوز چیزی انتخاب نکردی';
    if (!lines.length) {
      const picks = products.filter(p => !p.sample && p.stock).slice(0, 4);
      body.innerHTML = `<div class="ce">
          <div class="ce-ic">${IC.bag}</div>
          <h4>سبد خرید شما خالی است</h4>
          <p>قطعه‌ی مورد علاقه‌ت رو پیدا کن و به سبد اضافه کن.</p>
          <button class="lg-btn sm" data-shop><span>مشاهده‌ی محصولات</span>${IC.arrow}</button>
        </div>
        ${picks.length ? `<section class="cs"><h5>شاید بپسندی</h5><div class="cs-row">${picks.map(p => `
          <button class="cs-i" data-view="${p.id}"><span class="cs-im">${p.image_url ? thumbImg(p.image_url) : ''}</span>
            <span class="cs-n">${esc(p.name)}</span><b>${toman(priceOf(p))}</b></button>`).join('')}</div></section>` : ''}`;
      foot.hidden = true; foot.innerHTML = '';
      return;
    }
    const sub = lines.reduce((a, l) => a + priceOf(l.p, l.variant) * l.qty, 0);
    const full = lines.reduce((a, l) => a + Math.max(priceOf(l.p, l.variant), (variants(l.p).find(v => v.name === l.variant)?.price) || l.p.price) * l.qty, 0);
    const saving = Math.max(0, full - sub);
    body.innerHTML = lines.map((l, k) => {
      const max = avail(l.p, l.variant), unit = priceOf(l.p, l.variant);
      const was = onSale(l.p) && !(variants(l.p).find(v => v.name === l.variant)?.price) ? l.p.price : 0;
      return `<article class="cl" style="animation-delay:${60 + k * 50}ms">
        <button class="cl-im" data-view="${l.p.id}" aria-label="${esc(l.p.name)}">${l.p.image_url ? thumbImg(l.p.image_url) : ''}</button>
        <div class="cl-b">
          <div class="cl-h"><b class="cl-n" dir="auto">${esc(l.p.name)}</b>
            <button class="cl-x" data-rm="${k}" aria-label="حذف ${esc(l.p.name)} از سبد">${IC.trash}</button></div>
          <div class="cl-m">${l.p.category_label ? `<span>${esc(l.p.category_label)}</span>` : ''}${l.variant ? `<span class="cl-v">${colorHex(l.p, l.variant) ? `<i style="background:${esc(colorHex(l.p, l.variant))}"></i>` : ''}<bdi>${esc(l.variant.split(SEP).join(' · '))}</bdi></span>` : ''}</div>
          <div class="cl-f">
            <div class="cl-q"><button data-cq="${k}" data-d="1" ${l.qty >= max ? 'disabled' : ''} aria-label="بیشتر">+</button><span>${fa(l.qty)}</span><button data-cq="${k}" data-d="-1" aria-label="${l.qty > 1 ? 'کمتر' : 'حذف'}">${l.qty > 1 ? '−' : IC.trash}</button></div>
            <div class="cl-p">${was ? `<s>${fa(was * l.qty)}</s>` : ''}<b>${toman(unit * l.qty)}</b></div>
          </div>
          ${l.qty > max ? `<small class="warn">${max ? 'فقط ' + fa(max) + ' عدد موجوده؛ تعداد رو کم کن' : 'این مورد ناموجود شده'}</small>` : l.qty >= max && max <= 3 ? `<small class="cl-low">آخرین موجودی</small>` : ''}
        </div></article>`;
    }).join('');
    foot.hidden = false;
    foot.innerHTML = `
      <div class="cf-row"><span>جمع سبد</span><b>${toman(sub)}</b></div>
      ${saving ? `<div class="cf-row cf-save"><span>سود شما از تخفیف</span><span>${toman(saving)}</span></div>` : ''}
      <p class="cf-note">کد تخفیف رو در مرحله‌ی بعد می‌تونی وارد کنی.</p>
      <button class="lg-btn" id="checkoutBtn"><span>ادامه و ثبت سفارش</span>${IC.arrow}</button>
      <button class="cf-back" data-close>ادامه‌ی خرید</button>`;
  }
  function count(id, n) {
    const el = $(id), up = n > (+el.dataset.n || 0);
    el.textContent = fa(n); el.classList.toggle('on', n > 0);
    // فقط وقتی عدد بیشتر شد (نه موقع بارگذاری اول) یه پرش کوچیک
    if (up && el.dataset.n != null) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    el.dataset.n = n;
  }

  // ───────── علاقه‌مندی‌ها ─────────
  async function toggleFav(id, btn) {
    const on = !favs.has(id);
    on ? favs.add(id) : favs.delete(id);
    ls.set('zl-favs', [...favs]); count('#favN', favs.size);
    if (btn) btn.classList.toggle('on', on);
    // همه‌ی قلب‌های همین محصول (کارت و صفحه‌ی محصول) هماهنگ می‌شن
    $$(`.card [data-fav="${id}"]`).forEach(b => b.classList.toggle('on', on));
    if ($('#favs').classList.contains('on')) renderFavs();
    if (user && sb) {
      const r = on ? sb.from('wishlists').insert({ user_id: user.id, product_id: id }) : sb.from('wishlists').delete().eq('user_id', user.id).eq('product_id', id);
      r.then(() => { }, () => { });
    }
  }
  // صفحه‌ی علاقه‌مندی‌ها
  function renderFavs() {
    const list = [...favs].map(id => products.find(p => p.id === id)).filter(p => p && !p.sample);
    $('#favSub').textContent = list.length ? `${fa(list.length)} محصول ذخیره‌شده` : 'فهرست دلخواه تو';
    const body = $('#favBody');
    if (!list.length) {
      body.innerHTML = `<div class="ce">
          <div class="ce-ic">${IC.heart}</div>
          <h4>هنوز چیزی به علاقه‌مندی‌ها اضافه نکردی</h4>
          <p>روی قلبِ هر محصولی که دوست داری بزن تا اینجا برات نگهش داریم.</p>
          <button class="lg-btn sm" data-shop><span>مشاهده‌ی محصولات</span>${IC.arrow}</button>
        </div>`;
      return;
    }
    body.innerHTML = `${!user ? `<button class="fv-login" data-open="acct">${IC.user}<span>وارد حسابت شو تا علاقه‌مندی‌هات روی همه‌ی دستگاه‌ها بمونه</span>${IC.arrow}</button>` : ''}
      <div class="fv-grid">${list.map((p, k) => {
        const out = !p.stock, o = optsOf(p), needPick = o && ((o.sizes.length > 1) || (o.colors.length > 1));
        const cs = o?.colors || [];
        return `<article class="fv" style="animation-delay:${60 + k * 45}ms">
          <div class="fv-im" data-view="${p.id}">${p.image_url ? thumbImg(p.image_url, p.name) : ''}
            <button class="fv-x" data-unfav="${p.id}" aria-label="حذف ${esc(p.name)} از علاقه‌مندی‌ها">${IC.heart}</button>
            ${out ? '<span class="badge out">ناموجود</span>' : onSale(p) ? '<span class="badge sale">حراج</span>' : ''}</div>
          <b class="fv-n" dir="auto" data-view="${p.id}">${esc(p.name)}</b>
          ${cs.length ? `<div class="dots">${cs.slice(0, 5).map(c => `<i style="background:${esc(c.hex || '#999')}" title="${esc(c.name)}"></i>`).join('')}</div>` : ''}
          <div class="fv-p">${priceHtml(p)}</div>
          ${out ? '<button class="fv-btn" disabled>ناموجود</button>'
            : needPick ? `<button class="fv-btn" data-view="${p.id}">انتخاب ${o.colors.length > 1 && o.sizes.length > 1 ? 'سایز و رنگ' : o.colors.length > 1 ? 'رنگ' : 'سایز'}</button>`
            : `<button class="fv-btn on" data-fadd="${p.id}">${IC.bag}<span>افزودن به سبد</span></button>`}
        </article>`;
      }).join('')}</div>`;
  }
  async function syncFavs() {
    if (!user || !sb) return;
    try {
      const rows = await q(sb.from('wishlists').select('product_id'));
      const remote = new Set(rows.map(r => r.product_id));
      const missing = [...favs].filter(id => id > 0 && !remote.has(id));
      if (missing.length) sb.from('wishlists').insert(missing.map(product_id => ({ user_id: user.id, product_id }))).then(() => { }, () => { });
      favs = new Set([...favs, ...remote]); ls.set('zl-favs', [...favs]); count('#favN', favs.size); render();
    } catch (e) { }
  }

  // ───────── حساب کاربری ─────────
  async function loadUser() {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    user = session?.user || null;
    profile = null; profileOk = false;
    if (user) {
      try { profile = await q(sb.from('profiles').select('*').eq('id', user.id).maybeSingle()); profileOk = true; } catch (e) { }
      sb.from('profiles').upsert({ id: user.id, phone: profile?.phone || normPhone(user.phone), last_seen: new Date().toISOString() }).then(() => { }, () => { });
      syncFavs();
    }
    $('#acctBtn').classList.toggle('in', !!user);
    syncLock();
    checkAdmin();
  }
  // مدیرها (هر نقشی) یه راه سریع به پنل می‌بینن: کارت بالای صفحه‌ی حساب و پایین منو.
  // دسترسی واقعی رو خود پنل و دیتابیس کنترل می‌کنن؛ این فقط نمایش لینکه.
  let isAdmin = false;
  function setAdmin(v) {
    isAdmin = !!v;
    $('#admMenu').hidden = !isAdmin;
    $('#acctBtn').classList.toggle('adm', isAdmin);
  }
  async function checkAdmin() {
    if (!user?.phone) return setAdmin(false);
    try { setAdmin(await q(sb.from('admins').select('phone').eq('phone', user.phone).maybeSingle())); } catch (e) { setAdmin(false); }
    if ($('#acct').classList.contains('on') && user) drawAcct();
  }
  // نام و نام خانوادگی اجباریه: تا وارد نشه، پنل حساب بسته نمی‌شه و بقیه‌ی بخش‌ها باز نمی‌شن
  let profileOk = false;
  const needsName = () => !!user && profileOk && !(profile?.full_name || '').trim();
  const syncLock = () => $('#acct').classList.toggle('locked', needsName());
  const NAME_RE = /^[\p{L}\p{M}\u200c' -]{2,}$/u;
  // ───────── حساب کاربری (طراحی لوکس) ─────────
  let otpPhone = null, otpPurpose = 'login', typedPhone = '', authTab = 'login', loginMode = 'pass', resendAt = 0, resendTimer = null;
  let su = { first: '', last: '', full: '' };   // اطلاعات فرم ثبت‌نام تا تأیید کد
  const IC = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="1.6"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-9.8A4 4 0 0 1 12 7.6a4 4 0 0 1 7 2.6C19 15.6 12 20 12 20z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" class="chev"><path d="m6 9 6 6 6-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.3"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.5h9.4L17.5 7M10.2 10.5v6M13.8 10.5v6"/></svg>',
  };
  const maskPhone = p => p ? `${p.slice(0, 4)} ••• ${p.slice(7)}` : '';
  function setHero(title, sub, initial) {
    $('#acctTitle').textContent = title;
    $('#acctSub').textContent = sub || '';
    const av = $('#acctAv'), logo = $('#acctLogo');
    av.hidden = !initial; logo.hidden = !!initial;
    if (initial) av.textContent = initial;
  }
  const stagger = root => $$('.rise', root).forEach((el, i) => { el.style.animationDelay = (60 + i * 55) + 'ms'; });
  function busy(btn, on, label) {
    btn.disabled = on; btn.classList.toggle('busy', on);
    if (label != null) btn.querySelector('span').textContent = label;
  }
  function tickResend() {
    const b = $('#lgResend'); if (!b) return clearInterval(resendTimer);
    const left = Math.ceil((resendAt - Date.now()) / 1000);
    b.disabled = left > 0;
    b.textContent = left > 0 ? `ارسال دوباره تا ${fa(left)} ثانیه` : 'ارسال دوباره‌ی کد';
  }
  // ارسال کد: ورود (فقط برای حساب‌های موجود) یا تأیید شماره‌ی ثبت‌نام
  async function sendOtp(p, purpose) {
    const { error } = purpose === 'signup'
      ? await sb.auth.resend({ type: 'sms', phone: intl(p) })
      : await sb.auth.signInWithOtp({ phone: intl(p), options: { shouldCreateUser: false } });
    if (error) throw error;
    resendAt = Date.now() + 60000;
  }
  const loginErr = (ex, otp) => {
    const m = String(ex.message || ex);
    return /expired|invalid/i.test(m) && otp ? 'کد اشتباهه یا منقضی شده'
      : /Invalid login/i.test(m) ? 'شماره یا رمز عبور اشتباهه'
      : /Signups not allowed|not allowed for otp|user not found/i.test(m) ? 'NOACCOUNT'
      : /already registered|already exists|already been registered/i.test(m) ? 'EXISTS'
      : /password.*(short|least|characters)|weak/i.test(m) ? 'رمز عبور باید حداقل ۶ کاراکتر باشه'
      : /rate|seconds|after/i.test(m) ? 'چند لحظه صبر کن و دوباره امتحان کن'
      : /sms|hook|send|provider/i.test(m) ? 'ارسال پیامک الان ممکن نیست؛ کمی بعد دوباره امتحان کن'
      : /شماره|نام|رمز|کد/.test(m) ? m : errText(ex);
  };

  function drawAcct(note) {
    const b = $('#acctBody');
    clearInterval(resendTimer);
    if (!user) {
      const otpStep = !!otpPhone;
      const signup = authTab === 'signup';
      if (otpStep) setHero('کد تأیید', otpPurpose === 'signup' ? 'آخرین قدم ساخت حساب' : 'یک قدم تا ورود به حساب');
      else if (signup) setHero('عضویت در Zolaris', 'ساخت حساب کاربری در کمتر از یک دقیقه');
      else setHero('خوش آمدید', 'به حساب کاربری‌ات وارد شو');
      const eye = '<button type="button" class="lg-eye" data-eye aria-label="نمایش رمز">' + IC.eye + '</button>';
      let form;
      if (otpStep) {
        form = `
          <p class="lg-lead rise">کد ۶ رقمی‌ای که به <b dir="ltr">${esc(faDigits(maskPhone(otpPhone)))}</b> پیامک شد رو وارد کن${otpPurpose === 'signup' ? ' تا شماره‌ت تأیید و حسابت ساخته بشه' : ''}.</p>
          <label class="lg-f rise"><span>کد تأیید</span><input id="lgC" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" placeholder="••••••" required></label>
          <button class="lg-btn rise" id="lgGo"><span>${otpPurpose === 'signup' ? 'تأیید و ساخت حساب' : 'تأیید و ورود'}</span>${IC.arrow}</button>
          <div class="lg-row rise"><button type="button" class="lg-link" id="lgBack">${IC.edit}ویرایش شماره</button><button type="button" class="lg-link" id="lgResend" disabled></button></div>`;
      } else if (signup) {
        form = `
          <div class="lg-2 rise">
            <label class="lg-f"><span>نام <em>*</em></span><div class="lg-in"><input id="suFirst" autocomplete="given-name" maxlength="40" value="${esc(su.first)}" required></div></label>
            <label class="lg-f"><span>نام خانوادگی <em>*</em></span><div class="lg-in"><input id="suLast" autocomplete="family-name" maxlength="50" value="${esc(su.last)}" required></div></label></div>
          <label class="lg-f rise"><span>شماره موبایل <em>*</em></span><div class="lg-in">${IC.phone}<input id="lgP" type="tel" inputmode="numeric" autocomplete="tel" placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" dir="ltr" value="${esc(typedPhone)}" required></div></label>
          <label class="lg-f rise"><span>رمز عبور <em>*</em></span><div class="lg-in">${IC.lock}<input id="lgPass" type="password" autocomplete="new-password" dir="ltr" placeholder="حداقل ۶ کاراکتر" required>${eye}</div></label>
          <button class="lg-btn rise" id="lgGo"><span>ثبت‌نام و دریافت کد تأیید</span>${IC.arrow}</button>
          <p class="lg-hint rise">برای تأیید شماره، یه کد پیامکی برات ارسال می‌شه.</p>`;
      } else {
        form = `
          <div class="lg-seg rise ${loginMode === 'otp' ? 'second' : ''}" role="tablist" aria-label="روش ورود"><i aria-hidden="true"></i>
            <button type="button" role="tab" data-m="pass" aria-selected="${loginMode === 'pass'}">ورود با رمز عبور</button>
            <button type="button" role="tab" data-m="otp" aria-selected="${loginMode === 'otp'}">رمز یک‌بار مصرف</button></div>
          <label class="lg-f rise"><span>شماره موبایل</span><div class="lg-in">${IC.phone}<input id="lgP" type="tel" inputmode="numeric" autocomplete="tel" placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" dir="ltr" value="${esc(typedPhone)}" required></div></label>
          ${loginMode === 'pass' ? `<label class="lg-f rise"><span>رمز عبور</span><div class="lg-in">${IC.lock}<input id="lgPass" type="password" autocomplete="current-password" dir="ltr" required>${eye}</div></label>
            <button type="button" class="lg-link lg-forgot rise" data-m="otp">رمز رو فراموش کردی؟ با رمز یک‌بار مصرف وارد شو</button>` : ''}
          <button class="lg-btn rise" id="lgGo"><span>${loginMode === 'otp' ? 'ارسال رمز یک‌بار مصرف' : 'ورود به حساب'}</span>${IC.arrow}</button>
          ${loginMode === 'otp' ? '<p class="lg-hint rise">یه کد ۶ رقمی به شماره‌ت پیامک می‌شه.</p>' : ''}`;
      }
      b.innerHTML = `<form class="lg" id="lgF" novalidate>
        ${otpStep ? '' : `<div class="lg-tabs rise ${signup ? 'second' : ''}" role="tablist"><i aria-hidden="true"></i>
          <button type="button" role="tab" data-t="login" aria-selected="${!signup}">ورود</button>
          <button type="button" role="tab" data-t="signup" aria-selected="${signup}">ثبت‌نام</button></div>`}
        ${note ? `<div class="lg-note rise">${IC.bag}<span>${esc(note)}</span></div>` : ''}
        ${form}
        <div class="err" id="lgE" role="alert"></div>
        ${signup && !otpStep ? `<ul class="lg-perks rise">
          <li>${IC.truck}<span><b>پیگیری سفارش‌ها</b>وضعیت و کد رهگیری مرسوله در یک نگاه</span></li>
          <li>${IC.heart}<span><b>علاقه‌مندی‌ها</b>روی همه‌ی دستگاه‌هات ذخیره می‌مونه</span></li>
          <li>${IC.bolt}<span><b>خرید سریع‌تر</b>نام و آدرست برای سفارش بعدی آماده‌ست</span></li></ul>` : ''}
        ${otpStep ? '' : `<p class="lg-switch rise">${signup ? 'قبلاً ثبت‌نام کردی؟ <button type="button" class="lg-link" data-t="login">وارد شو</button>' : 'حساب کاربری نداری؟ <button type="button" class="lg-link" data-t="signup">ثبت‌نام کن</button>'}</p>`}
        <p class="lg-safe rise">${IC.shield}اطلاعات شما نزد Zolaris محفوظ است</p>
      </form>`;
      stagger(b);
      const err = (t, html) => { const e = $('#lgE'); if (html) e.innerHTML = t; else e.textContent = t || ''; };
      const keep = () => {
        if ($('#lgP')) typedPhone = $('#lgP').value;
        if ($('#suFirst')) { su.first = $('#suFirst').value; su.last = $('#suLast').value; }
      };
      $$('[data-t]', b).forEach(x => x.onclick = () => { keep(); authTab = x.dataset.t; drawAcct(note); });
      $$('[data-m]', b).forEach(x => x.onclick = () => { keep(); loginMode = x.dataset.m; drawAcct(note); setTimeout(() => ($('#lgPass') || $('#lgP')).focus(), 50); });
      $$('[data-eye]', b).forEach(x => x.onclick = () => { const i = x.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; x.classList.toggle('on', i.type === 'text'); });
      if ($('#lgBack')) $('#lgBack').onclick = () => { typedPhone = otpPhone; otpPhone = null; drawAcct(note); };
      if ($('#lgResend')) {
        tickResend(); resendTimer = setInterval(tickResend, 1000);
        $('#lgResend').onclick = async () => {
          err();
          try { await sendOtp(otpPhone, otpPurpose); tickResend(); toast('کد دوباره ارسال شد'); } catch (ex) { err(loginErr(ex)); }
        };
      }
      const c = $('#lgC');
      if (c) c.oninput = () => { c.value = toEn(c.value).replace(/\D/g, '').slice(0, 6); if (c.value.length === 6) $('#lgF').requestSubmit(); };
      const noAccount = () => err('این شماره هنوز ثبت‌نام نکرده. <button type="button" class="lg-link" id="goSu">ثبت‌نام کن</button>', true);
      const exists = () => err('این شماره قبلاً ثبت‌نام کرده. <button type="button" class="lg-link" id="goLi">وارد شو</button>', true);
      $('#lgF').onsubmit = async e => {
        e.preventDefault(); err();
        $$('.lg-in.bad', b).forEach(x => x.classList.remove('bad'));
        const btn = $('#lgGo');
        if (btn.disabled) return;
        const label = btn.querySelector('span').textContent;
        const bad = (el, msg) => { el.closest('.lg-in').classList.add('bad'); el.focus(); throw new Error(msg); };
        busy(btn, true);
        try {
          if (otpStep) {
            const code = toEn($('#lgC').value).replace(/\D/g, '');
            if (code.length !== 6) throw new Error('کد ۶ رقمی رو کامل وارد کن');
            const { error } = await sb.auth.verifyOtp({ phone: intl(otpPhone), token: code, type: 'sms' });
            if (error) throw error;
            if (otpPurpose === 'signup' && su.full) { await loadUser(); try { await saveProfile(su.full, null); } catch (x) { } }
            otpPhone = null; typedPhone = ''; su = { first: '', last: '', full: '' };
            await onSignedIn();
            return;
          }
          if (signup) {
            const first = $('#suFirst').value.replace(/\s+/g, ' ').trim(), last = $('#suLast').value.replace(/\s+/g, ' ').trim();
            if (!NAME_RE.test(first)) bad($('#suFirst'), first ? 'نام فقط باید شامل حروف باشه' : 'نام رو وارد کن');
            if (!NAME_RE.test(last)) bad($('#suLast'), last ? 'نام خانوادگی فقط باید شامل حروف باشه' : 'نام خانوادگی رو وارد کن');
            const p = normPhone($('#lgP').value);
            if (!p) bad($('#lgP'), 'شماره موبایل رو درست وارد کن (مثل ۰۹۱۲۳۴۵۶۷۸۹)');
            const pw = $('#lgPass').value;
            if (pw.length < 6) bad($('#lgPass'), 'رمز عبور باید حداقل ۶ کاراکتر باشه');
            const { data, error } = await sb.auth.signUp({ phone: intl(p), password: pw, options: { data: { full_name: `${first} ${last}` } } });
            if (error) throw error;
            // شماره‌ای که قبلاً تأیید شده، دوباره ثبت‌نام نمی‌شه
            if (data?.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('already registered');
            su = { first, last, full: `${first} ${last}` };
            if (data?.session) { await loadUser(); try { await saveProfile(su.full, null); } catch (x) { } su = { first: '', last: '', full: '' }; typedPhone = ''; await onSignedIn(); return; }
            resendAt = Date.now() + 60000; otpPurpose = 'signup'; otpPhone = p; drawAcct(note);
            setTimeout(() => $('#lgC') && $('#lgC').focus(), 80);
            return;
          }
          const p = normPhone($('#lgP').value);
          if (!p) bad($('#lgP'), 'شماره موبایل رو درست وارد کن (مثل ۰۹۱۲۳۴۵۶۷۸۹)');
          if (loginMode === 'otp') {
            await sendOtp(p, 'login');
            otpPurpose = 'login'; otpPhone = p; drawAcct(note); setTimeout(() => $('#lgC') && $('#lgC').focus(), 80);
            return;
          }
          if (!$('#lgPass').value) bad($('#lgPass'), 'رمز عبور رو وارد کن');
          const { error } = await sb.auth.signInWithPassword({ phone: intl(p), password: $('#lgPass').value });
          if (error) throw error;
          typedPhone = ''; await onSignedIn();
        } catch (ex) {
          const m = loginErr(ex, otpStep);
          if (m === 'NOACCOUNT') noAccount(); else if (m === 'EXISTS') exists(); else err(m);
          const g1 = $('#goSu'), g2 = $('#goLi');
          if (g1) g1.onclick = () => { keep(); authTab = 'signup'; drawAcct(note); };
          if (g2) g2.onclick = () => { keep(); authTab = 'login'; loginMode = 'pass'; drawAcct(note); };
          if ($('#lgGo')) busy($('#lgGo'), false, label);
          if (otpStep && $('#lgC')) $('#lgC').select();
        }
      };
      return;
    }
    syncLock();
    if (needsName()) {
      setHero('یک قدم تا پایان', 'برای ادامه، نام و نام خانوادگیت رو وارد کن');
      b.innerHTML = `<form class="lg" id="nmF" novalidate>
        <div class="lg-steps rise"><span class="done">ورود</span><i></i><span class="on">تکمیل اطلاعات</span></div>
        <p class="lg-lead rise">این نام روی سفارش‌ها و برای ارسال مرسوله استفاده می‌شه.</p>
        <label class="lg-f rise"><span>نام <em>*</em></span><div class="lg-in">${IC.user}<input id="nmFirst" autocomplete="given-name" maxlength="40" required></div></label>
        <label class="lg-f rise"><span>نام خانوادگی <em>*</em></span><div class="lg-in">${IC.user}<input id="nmLast" autocomplete="family-name" maxlength="50" required></div></label>
        <p class="err" id="nmE" role="alert"></p>
        <button class="lg-btn rise" id="nmGo"><span>ذخیره و ادامه</span>${IC.arrow}</button>
        <button type="button" class="lg-link lg-out rise" id="nmOut">${IC.out}خروج از حساب</button>
      </form>`;
      stagger(b);
      setTimeout(() => { const f = $('#nmFirst'); if (f && !('ontouchstart' in window)) f.focus(); }, 300);
      $('#nmF').onsubmit = async e => {
        e.preventDefault();
        const first = $('#nmFirst').value.replace(/\s+/g, ' ').trim(), last = $('#nmLast').value.replace(/\s+/g, ' ').trim();
        const er = $('#nmE'); er.textContent = '';
        $$('#nmF .lg-in').forEach(x => x.classList.remove('bad'));
        const bad = (el, msg) => { el.closest('.lg-in').classList.add('bad'); el.focus(); er.textContent = msg; };
        if (!NAME_RE.test(first)) return bad($('#nmFirst'), first ? 'نام فقط باید شامل حروف باشه' : 'نام رو وارد کن');
        if (!NAME_RE.test(last)) return bad($('#nmLast'), last ? 'نام خانوادگی فقط باید شامل حروف باشه' : 'نام خانوادگی رو وارد کن');
        const btn = $('#nmGo'); busy(btn, true);
        try {
          await saveProfile(`${first} ${last}`, null);
          syncLock();
          toast(`خوش اومدی ${first}`);
          if (afterLogin) { const f = afterLogin; afterLogin = null; closeAll(); f(); } else drawAcct();
        } catch (ex) { er.textContent = errText(ex); busy(btn, false); }
      };
      $('#nmOut').onclick = async () => { await sb.auth.signOut(); user = profile = null; profileOk = false; afterLogin = null; syncLock(); $('#acctBtn').classList.remove('in'); setAdmin(false); drawAcct(); toast('از حساب خارج شدی'); };
      return;
    }
    const name = (profile?.full_name || '').trim();
    setHero(name ? `سلام، ${name}` : 'خوش برگشتی', faDigits(normPhone(user.phone) || ''), (name || 'Z').charAt(0).toUpperCase());
    b.innerHTML = `<div class="ac">
      ${isAdmin ? `<a class="ac-adm rise" href="admin.html">${IC.shield}<span>پنل مدیریت<small>سفارش‌ها، محصولات و تنظیمات فروشگاه</small></span>${IC.arrow}</a>` : ''}
      <section class="ac-sec rise"><h5>سفارش‌های من</h5><div id="myOrders"><div class="mo sk"></div><div class="mo sk"></div></div></section>
      <details class="ac-acc rise"><summary>${IC.user}<span>اطلاعات من<small>نام و آدرس برای ارسال سفارش</small></span>${IC.chev}</summary>
        <form id="pfF" class="ac-form"><label class="lg-f"><span>نام و نام خانوادگی</span><div class="lg-in"><input name="n" maxlength="100" autocomplete="name" required value="${esc(profile?.full_name || '')}"></div></label>
        <label class="lg-f"><span>آدرس کامل پستی</span><div class="lg-in"><textarea name="a" rows="3" maxlength="600" autocomplete="street-address">${esc(profile?.address || '')}</textarea></div></label>
        <button class="lg-btn sm"><span>ذخیره‌ی اطلاعات</span></button></form></details>
      <details class="ac-acc rise"><summary>${IC.lock}<span>رمز عبور<small>ورود سریع بدون نیاز به پیامک</small></span>${IC.chev}</summary>
        <form id="pwF" class="ac-form"><label class="lg-f"><span>رمز جدید (حداقل ۶ کاراکتر)</span><div class="lg-in"><input name="p" type="password" minlength="6" autocomplete="new-password" dir="ltr" required></div></label>
        <button class="lg-btn sm"><span>ثبت رمز عبور</span></button></form></details>
      <button class="ac-out rise" id="lgOut">${IC.out}خروج از حساب</button></div>`;
    stagger(b);
    $('#pfF').onsubmit = async e => {
      e.preventDefault();
      const nm0 = e.target.n.value.replace(/\s+/g, ' ').trim();
      if (!NAME_RE.test(nm0) || nm0.split(' ').length < 2) return toast('نام و نام خانوادگی رو کامل وارد کن', true);
      const btn = e.target.querySelector('.lg-btn'); busy(btn, true);
      try { await saveProfile(nm0, e.target.a.value.trim()); toast('ذخیره شد'); const nm = e.target.n.value.trim(); if (nm) setHero(`سلام، ${nm}`, faDigits(normPhone(user.phone) || ''), nm.charAt(0).toUpperCase()); } catch (ex) { toast(errText(ex), true); }
      busy(btn, false);
    };
    $('#pwF').onsubmit = async e => {
      e.preventDefault(); const btn = e.target.querySelector('.lg-btn'); busy(btn, true);
      const { error } = await sb.auth.updateUser({ password: e.target.p.value });
      busy(btn, false);
      if (error) return toast(/weak|short|least/i.test(error.message) ? 'رمز ضعیفه؛ طولانی‌ترش کن' : errText(error), true);
      e.target.reset(); toast('رمز عبور ثبت شد');
    };
    $('#lgOut').onclick = async () => { await sb.auth.signOut(); user = profile = null; profileOk = false; syncLock(); $('#acctBtn').classList.remove('in'); setAdmin(false); drawAcct(); toast('از حساب خارج شدی'); };
    loadMyOrders();
  }
  async function saveProfile(name, address) {
    const row = { id: user.id, phone: normPhone(user.phone), updated_at: new Date().toISOString() };
    if (name != null) row.full_name = name;
    if (address != null) row.address = address;
    await q(sb.from('profiles').upsert(row));
    profile = { ...(profile || {}), ...row };
  }
  const ST_CLASS = { 'جدید': 'new', 'در انتظار پرداخت': 'wait', 'پرداخت شده': 'paid', 'تایید شده': 'ok', 'ارسال شده': 'ship', 'تحویل داده شده': 'done', 'لغو شده': 'cancel' };
  async function loadMyOrders() {
    const box = $('#myOrders'); if (!box) return;
    try {
      const rows = await q(sb.from('orders').select('tracking_code,total,status,created_at,items,post_carrier,post_tracking,payment_status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30));
      box.innerHTML = rows.length ? rows.map(o => `<div class="mo">
        <div class="mo-t"><span class="mo-code">سفارش <b dir="ltr">${esc(faDigits(o.tracking_code))}</b></span><span class="st ${ST_CLASS[o.status] || ''}">${esc(o.status)}</span></div>
        <div class="mo-m"><span>${fdate(o.created_at)}</span><span>${fa((o.items || []).reduce((a, i) => a + (+i.qty || 0), 0))} قلم</span><b>${toman(o.total)}</b></div>
        ${o.post_tracking ? `<div class="mo-p">${IC.truck}<span>${esc(o.post_carrier || 'مرسوله')}: <b dir="ltr">${esc(o.post_tracking)}</b></span></div>` : ''}
        ${o.status === 'در انتظار پرداخت' ? `<button class="lg-btn sm" data-pay="${esc(o.tracking_code)}"><span>پرداخت سفارش</span></button>` : ''}</div>`).join('')
        : `<div class="mo-empty">${IC.bag}<p>هنوز سفارشی ثبت نکردی</p><button class="lg-link" data-close>شروع خرید</button></div>`;
    } catch (e) { box.innerHTML = '<p class="lg-hint">بارگذاری سفارش‌ها انجام نشد</p>'; }
  }
  async function onSignedIn() {
    await loadUser();
    if (needsName()) { drawAcct(); open('acct'); return; }
    if (afterLogin) { const f = afterLogin; afterLogin = null; f(); } else drawAcct();
    toast('خوش اومدی');
  }

  // ───────── ثبت سفارش ─────────
  async function loadPayMode() {
    if (!sb) return;
    try { const r = await q(sb.from('site_settings').select('value').eq('key', 'payment').maybeSingle()); payMode = r?.value?.mode || 'off'; } catch (e) { }
  }
  async function checkout() {
    const lines = cartLines();
    if (!lines.length) return;
    const bad = lines.find(l => l.qty > avail(l.p, l.variant));
    if (bad) { open('cart'); return toast(`موجودی «${bad.p.name}» کمتر از تعداد انتخابیه`, true); }
    if (!user) { afterLogin = checkout; drawAcct('برای ثبت سفارش اول وارد شو'); return open('acct'); }
    await loadPayMode();
    let coupon = null;
    const sub = lines.reduce((a, l) => a + priceOf(l.p, l.variant) * l.qty, 0);
    const disc = () => !coupon ? 0 : Math.min(sub, coupon.discount_type === 'percent' ? Math.round(sub * Math.min(coupon.discount_value, 100) / 100) : Math.round(coupon.discount_value));
    const online = payMode === 'live';
    const b = $('#coBody');
    b.innerHTML = `<form class="form" id="coF">
      <div class="sumbox">${lines.map(l => `<div><span><bdi>${esc(l.p.name)}${l.variant ? ' (' + esc(l.variant) + ')' : ''}</bdi> × ${fa(l.qty)}</span><span>${toman(priceOf(l.p, l.variant) * l.qty)}</span></div>`).join('')}
        <div id="coDisc" hidden class="ok"><span>تخفیف</span><span></span></div>
        <div class="tot"><span>مبلغ قابل پرداخت</span><b id="coTot">${toman(sub)}</b></div></div>
      <label>نام و نام خانوادگی گیرنده<input class="fld" name="n" maxlength="100" autocomplete="name" required value="${esc(profile?.full_name || '')}"></label>
      <label>شماره موبایل<input class="fld ltr" name="p" type="tel" inputmode="numeric" required value="${esc(normPhone(profile?.phone || user.phone) || '')}"></label>
      <label>آدرس کامل پستی (با کد پستی)<textarea class="fld" name="a" rows="3" maxlength="600" autocomplete="street-address" required>${esc(profile?.address || '')}</textarea></label>
      <label>توضیحات (اختیاری)<input class="fld" name="t" maxlength="600"></label>
      <div class="cpn"><input class="fld ltr" name="c" placeholder="کد تخفیف" autocomplete="off"><button type="button" class="btn btn-o" id="coC">اعمال</button></div>
      <p class="muted">${online ? 'بعد از ثبت، به درگاه امن زیبال می‌ری و پرداخت رو انجام می‌دی.' : 'بعد از ثبت سفارش، برای هماهنگی پرداخت (کارت‌به‌کارت) و ارسال باهات تماس می‌گیریم.'}</p>
      <button class="btn btn-m" id="coGo">${online ? 'ثبت و پرداخت آنلاین' : 'ثبت سفارش'}</button>
      <p class="err" id="coE"></p></form>`;
    const f = $('#coF');
    const drawTot = () => { const d = disc(); $('#coDisc').hidden = !d; $('#coDisc span:last-child').textContent = '− ' + toman(d); $('#coTot').textContent = toman(sub - d); };
    $('#coC').onclick = async () => {
      const code = toEn(f.c.value).trim().toUpperCase();
      if (!code) { coupon = null; drawTot(); return; }
      try {
        const r = (await q(sb.rpc('check_coupon', { p_code: code })))[0] || {};
        if (r.status !== 'ok') { coupon = null; drawTot(); return toast({ expired: 'این کد منقضی شده', used_up: 'ظرفیت این کد تموم شده', already_used: 'قبلاً از این کد استفاده کردی' }[r.status] || 'کد تخفیف معتبر نیست', true); }
        coupon = r; f.c.value = r.code; drawTot(); toast('کد تخفیف اعمال شد');
      } catch (e) { toast(errText(e), true); }
    };
    f.onsubmit = async e => {
      e.preventDefault();
      const err = $('#coE'); err.textContent = '';
      const phone = normPhone(f.p.value);
      if (!phone) { err.textContent = 'شماره موبایل درست نیست'; return; }
      const go = $('#coGo'); go.disabled = true; go.textContent = 'در حال ثبت…';
      try {
        const r = await q(sb.rpc('place_order', {
          p_items: lines.map(l => ({ id: l.id, qty: l.qty, variant: l.variant, name: l.p.name })),
          p_name: f.n.value.trim(), p_phone: phone, p_address: f.a.value.trim(), p_note: f.t.value.trim() || null,
          p_coupon: coupon ? coupon.code : (toEn(f.c.value).trim().toUpperCase() || null),
        }));
        cart = []; saveCart(); renderCart();
        saveProfile(profile?.full_name || f.n.value.trim(), f.a.value.trim()).catch(() => { });
        if (source) sb.rpc('set_order_source', { p_tracking: r.tracking_code, p_source: source }).then(() => { }, () => { });
        loadProducts();
        if (r.needs_payment) return pay(r.tracking_code, r.total);
        sb.functions.invoke('notify-order', { body: { trackingCode: r.tracking_code } }).then(() => { }, () => { });
        showResult('ok', 'سفارشت ثبت شد', `کد پیگیری: <b class="code">${esc(faDigits(r.tracking_code))}</b><br>مبلغ: ${toman(r.total)}<br><br>به‌زودی برای هماهنگی پرداخت و ارسال باهات تماس می‌گیریم. وضعیت سفارش رو از «حساب کاربری» ببین.`);
      } catch (ex) { err.textContent = errText(ex); go.disabled = false; go.textContent = online ? 'ثبت و پرداخت آنلاین' : 'ثبت سفارش'; }
    };
    open('co');
  }

  // ───────── پرداخت زیبال ─────────
  async function pay(code, total) {
    showResult('wait', 'در حال انتقال به درگاه…', 'چند لحظه صبر کن.');
    try {
      // درگاه‌های بانکی ایران اتصال خارجی رو قبول نمی‌کنن
      const g = await sb.functions.invoke('geo', { method: 'GET' }).catch(() => ({}));
      if (g?.data?.iran === false) return payFail(code, 'فیلترشکن روشنه', 'درگاه بانکی با فیلترشکن باز نمی‌شه. لطفاً فیلترشکن رو خاموش کن و دوباره «پرداخت» رو بزن. سفارشت تا یک ساعت برات نگه داشته می‌شه.');
      const { data, error } = await sb.functions.invoke('payment', { body: { action: 'start', trackingCode: code, returnUrl: location.origin + location.pathname } });
      const e = data?.error || (error && (await error.context?.json?.().catch(() => null))?.error) || (error ? 'internal' : null);
      if (data?.url) { ls.set('zl-pay', { code, at: Date.now() }); location.href = data.url; return; }
      const MSG = {
        vpn: 'درگاه بانکی با فیلترشکن باز نمی‌شه. لطفاً فیلترشکن رو خاموش کن و دوباره امتحان کن.', disabled: 'پرداخت آنلاین الان فعال نیست؛ برای پرداخت با ما تماس بگیر.',
        not_payable: 'مهلت پرداخت این سفارش تموم شده؛ لطفاً دوباره سفارش بده.', already_paid: 'این سفارش قبلاً پرداخت شده.', too_many: 'تلاش‌های زیادی برای پرداخت انجام شد؛ چند دقیقه بعد امتحان کن.',
        login: 'دوباره وارد حساب شو.', gateway: 'درگاه پرداخت جواب نداد؛ چند لحظه بعد دوباره امتحان کن.',
      };
      payFail(code, 'پرداخت شروع نشد', MSG[e] || 'مشکلی پیش اومد؛ چند لحظه بعد دوباره امتحان کن.');
    } catch (ex) { payFail(code, 'پرداخت شروع نشد', errText(ex)); }
  }
  function payFail(code, title, text) {
    showResult('bad', title, `${esc(text)}<br><br>کد سفارش: <b class="code">${esc(faDigits(code))}</b>`, `<button class="btn btn-m" data-pay="${esc(code)}">تلاش دوباره برای پرداخت</button>`);
  }
  async function handleReturn() {
    const u = new URLSearchParams(location.search);
    if (u.get('pay') !== '1' || !u.get('trackId')) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (!sb) return;
    showResult('wait', 'در حال بررسی پرداخت…', 'لطفاً صفحه رو نبند.');
    let r = {};
    for (let i = 0; i < 3; i++) {
      const { data } = await sb.functions.invoke('payment', { body: { action: 'verify', trackId: Number(toEn(u.get('trackId'))) } }).catch(() => ({}));
      r = data || {};
      if (r.status !== 'busy') break;
      await new Promise(res => setTimeout(res, 2500));
    }
    const code = r.trackingCode || ls.get('zl-pay', {}).code || '';
    if (r.status === 'paid') {
      ls.set('zl-pay', null);
      showResult('ok', 'پرداخت موفق بود 🎉', `کد پیگیری سفارش: <b class="code">${esc(faDigits(code))}</b>${r.refNumber ? `<br>شماره مرجع بانک: <span class="ltr">${esc(faDigits(r.refNumber))}</span>` : ''}${r.total ? '<br>مبلغ: ' + toman(r.total) : ''}<br><br>سفارشت ثبت شد و به‌زودی ارسال می‌شه.`);
    } else if (r.status === 'failed') {
      payFail(code, 'پرداخت انجام نشد', 'اگه پولی از حسابت کم شده، حداکثر تا ۷۲ ساعت خودکار برمی‌گرده.');
    } else if (r.status === 'cancelled') {
      showResult('bad', 'مهلت این سفارش تموم شده', `سفارش ${esc(faDigits(code))} لغو شده. اگه پولی کم شده، خودکار برمی‌گرده. لطفاً دوباره سفارش بده یا با ما تماس بگیر.`);
    } else {
      showResult('wait', 'پرداخت در حال بررسیه', `نتیجه تا چند دقیقه‌ی دیگه در «حساب کاربری ← سفارش‌های من» نمایش داده می‌شه.${code ? `<br>کد سفارش: <b class="code">${esc(faDigits(code))}</b>` : ''}`);
    }
  }
  function showResult(kind, title, html, actions = '') {
    const icon = { ok: '✓', bad: '!', wait: '…' }[kind];
    $('#resBody').innerHTML = `<div class="res ${kind}"><div class="ic">${icon}</div><h3>${esc(title)}</h3><p>${html}</p>${actions}${kind === 'wait' ? '' : '<button class="btn btn-o" data-close>بستن</button>'}</div>`;
    open('res');
  }

  // ───────── کشوها ─────────
  const scrim = $('#scrim');
  const root = document.documentElement;
  const isPhone = () => matchMedia('(max-width:599px)').matches;
  function setOvl(on, full) {
    root.classList.toggle('ovl', on);
    root.classList.toggle('full', !!(on && full));
    if (on) root.style.setProperty('--doc-h', Math.max(root.scrollHeight, document.body.scrollHeight, innerHeight) + 'px');
  }
  // قفل صفحه‌ی پشت پنل‌ها. overflow:hidden روی body در سافاری iOS جلوی اسکرول با انگشت رو نمی‌گیره؛
  // اسکرول پنل به صفحه‌ی پشت سرریز می‌کرد، نوارهای سافاری جمع/باز می‌شدن و پنل جابه‌جا می‌شد.
  // پس body ثابت می‌شه و بعد از بستن دقیقاً به همون نقطه‌ی اسکرول برمی‌گرده.
  let lockY = 0, scrollLocked = false;
  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true; lockY = window.scrollY;
    Object.assign(document.body.style, { position: 'fixed', top: `-${lockY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '', overflow: '' });
    window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  }
  const locked = () => $('#acct').classList.contains('locked') && $('#acct').classList.contains('on');
  // دکمه‌ی «برگشت» گوشی پنل باز رو می‌بنده، به‌جای اینکه از سایت بیرون بره
  let pendingBack = 0;
  const anyOpen = () => !!$('.drawer.on,.search.on,.sheet.on') || !$('#zv').hidden;
  const pushOvl = id => { if (history.state?.zlOvl) history.replaceState({ ...history.state, zlOvl: id }, ''); else history.pushState({ ...(history.state || {}), zlOvl: id }, ''); };
  const dropOvl = () => setTimeout(() => { if (!anyOpen() && history.state?.zlOvl) { pendingBack++; history.back(); } }, 0);
  addEventListener('popstate', () => {
    if (pendingBack) { pendingBack--; return; }
    if (!$('#zv').hidden) { zoom.close(true); return; }
    if (!anyOpen()) return;
    if (locked()) { history.pushState({ zlOvl: 'acct' }, ''); return; }
    closeAll(true);
  });
  function closeAll(fromPop) {
    if (new URLSearchParams(location.search).has('p')) setProductUrl(null);
    if (fromPop !== true && fromPop !== 'keep') dropOvl();
    if (locked()) { $$('.drawer.on,.search.on,.sheet.on').forEach(d => d !== $('#acct') && d.classList.remove('on')); setOvl(true, isPhone()); return; }
    setOvl(false);
    $$('.drawer.on,.search.on,.sheet.on').forEach(d => d.classList.remove('on')); scrim.classList.remove('on'); unlockScroll(); }
  function open(id) {
    if (needsName() && id !== 'acct' && id !== 'res') { drawAcct(); open('acct'); toast('اول نام و نام خانوادگیت رو وارد کن', true); return; }
    if (id === 'res') { $('#' + id).classList.add('on'); scrim.classList.add('on'); lockScroll(); setOvl(true, root.classList.contains('full')); pushOvl(id); return; }
    closeAll('keep');
    setOvl(true, (id === 'acct' || id === 'cart' || id === 'pv' || id === 'favs') && isPhone()); lockScroll(); $('#' + id).classList.add('on'); scrim.classList.add('on'); pushOvl(id); }

  document.addEventListener('click', e => {
    const t = e.target;
    const o = t.closest('[data-open]');
    if (o) { if (o.dataset.open === 'acct') drawAcct(); open(o.dataset.open); return; }
    if (t.closest('[data-open-acct]')) { afterLogin = null; drawAcct(); open('acct'); return; }
    if (t.closest('[data-search]')) { closeAll('keep'); setOvl(true); lockScroll(); $('#search').classList.add('on'); scrim.classList.add('on'); pushOvl('search'); setTimeout(() => $('#search input').focus(), 300); return; }
    const pv = t.closest('[data-pay]'); if (pv) { pay(pv.dataset.pay); return; }
    const fv = t.closest('[data-fav]'); if (fv) { e.stopPropagation(); toggleFav(+fv.dataset.fav, fv); return; }
    if (t.closest('#favBtn')) { renderFavs(); open('favs'); return; }
    const uf = t.closest('[data-unfav]');
    if (uf) {
      const card = uf.closest('.fv'), id = +uf.dataset.unfav;
      const done = () => { toggleFav(id); toast('از علاقه‌مندی‌ها حذف شد'); };
      if (card && !matchMedia('(prefers-reduced-motion: reduce)').matches) { card.classList.add('out'); setTimeout(done, 260); } else done();
      return;
    }
    const fa_ = t.closest('[data-fadd]');
    if (fa_) {
      const p = products.find(x => x.id === +fa_.dataset.fadd), o = p && optsOf(p);
      // محصولی که فقط یک سایز/رنگ داره، همون انتخاب می‌شه
      const v = o ? [o.sizes.length ? o.sizes[0] : null, o.colors.length ? o.colors[0].name : null].filter(Boolean).join(SEP) || null : null;
      if (p && addToCart(p.id, v, 1, true)) { fa_.classList.add('done'); fa_.innerHTML = `${IC.check}<span>به سبد اضافه شد</span>`; setTimeout(() => { if (fa_.isConnected) { fa_.classList.remove('done'); fa_.innerHTML = `${IC.bag}<span>افزودن به سبد</span>`; } }, 1600); }
      return;
    }
    const vw = t.closest('[data-view]'); if (vw) { openProduct(+vw.dataset.view); return; }
    const mc = t.closest('[data-cat]');
    if (mc) {
      e.preventDefault();
      const i = +mc.dataset.cat;
      // پیشنهادهای «پیدا نشد» جستجو رو هم پاک می‌کنن
      if (mc.dataset.q === '0') { query = ''; $('#search input').value = ''; }
      closeAll();
      if (i >= CATS.length) { scrollToEl($('#contact')); return; }
      setCat(i);
      if (i < 0) window.scrollTo({ top: 0, behavior: 'smooth' }); else scrollToEl($('#shop'));
      return;
    }
    const fc = t.closest('[data-fc]'); if (fc) { setCat(+fc.dataset.fc); return; }
    const sz = t.closest('[data-sz]'); if (sz) { const s = sz.dataset.sz; sizes.has(s) ? sizes.delete(s) : sizes.add(s); sz.classList.toggle('on'); render(); return; }
    const fcl = t.closest('[data-fcl]'); if (fcl) { const n = fcl.dataset.fcl; colorsF.has(n) ? colorsF.delete(n) : colorsF.add(n); fcl.classList.toggle('on'); render(); return; }
    if (t.closest('#fclear')) { sizes.clear(); colorsF.clear(); drawSizes(); setCat(0); return; }

    if (t.closest('#favOff')) { favOnly = false; render(); return; }
    if (t.closest('[data-shop]')) { closeAll(); setCat(0); $('#shop').scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.closest('#filter .dfoot [data-close]')) { closeAll(); scrollToEl($('#shop')); return; }
    if (t.closest('[data-close]') || t === scrim || t.id === 'acct') { closeAll(); return; }
    const a = t.closest('[data-add]');
    if (a) { if (addToCart(+a.dataset.add, null, 1)) { a.classList.add('done'); a.textContent = 'اضافه شد ✓'; setTimeout(() => { a.classList.remove('done'); a.textContent = 'افزودن به سبد خرید'; }, 1300); } return; }
    const cq = t.closest('[data-cq]');
    if (cq) { const l = cartLines()[+cq.dataset.cq]; const i = cart.find(x => x.id === l.id && x.variant === l.variant); i.qty += +cq.dataset.d; if (i.qty <= 0) cart.splice(cart.indexOf(i), 1); saveCart(); renderCart(); return; }
    const r = t.closest('[data-rm]');
    if (r) {
      const l = cartLines()[+r.dataset.rm], art = r.closest('.cl');
      const done = () => { cart = cart.filter(x => !(x.id === l.id && x.variant === l.variant)); saveCart(); renderCart(); };
      if (art && !matchMedia('(prefers-reduced-motion: reduce)').matches) { art.classList.add('out'); setTimeout(done, 280); } else done();
      return;
    }
    if (t.closest('#checkoutBtn')) { checkout(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') return closeAll();
    const v = e.target.closest && e.target.closest('[data-view][role="button"]');
    if (v && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openProduct(+v.dataset.view); }
  });
  $('#search input').addEventListener('input', e => { query = e.target.value; render(); });
  $('#search form').addEventListener('submit', e => { e.preventDefault(); closeAll(); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
  $('#sort').onchange = render;
  const ann = $('.announce');
  const onScroll = () => {
    if (scrollLocked) return;
    $('header').classList.toggle('scrolled', scrollY > 10);
    // top strip matches what's under Safari's address bar: the maroon announcement, then the white header
    document.documentElement.classList.toggle('at-top', !!ann && scrollY < ann.offsetHeight - 2);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // iOS 26: after the keyboard closes, fixed layers (WhatsApp button, bars) can stay where the keyboard top
  // was. A tiny scroll nudge once the field loses focus makes Safari put them back.
  document.addEventListener('focusout', e => {
    if (!e.target.matches || !e.target.matches('input,textarea,select')) return;
    setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input,textarea,select')) { const y = scrollY; window.scrollTo(0, y + 1); window.scrollTo(0, y); } }, 120);
  });
  // سبد خرید بین تب‌ها هماهنگ می‌مونه
  addEventListener('storage', e => { if (e.key === 'zl-cart') { cart = ls.get('zl-cart', []); renderCart(); } });

  // ───────── شروع ─────────
  drawCats(); render(); count('#favN', favs.size); renderCart();
  if (!sb) { toast('اتصال به فروشگاه برقرار نشد؛ صفحه رو تازه کن', true); return; }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { user = profile = null; $('#acctBtn').classList.remove('in'); setAdmin(false); } });
  Promise.all([loadProducts(), loadUser()]).then(() => {
    if (needsName()) { drawAcct(); open('acct'); }
    // لینک مستقیم محصول: zolaris.ir/?p=12
    const pid = +new URLSearchParams(location.search).get('p');
    if (pid && !needsName()) { if (products.some(x => x.id === pid)) openProduct(pid); else setProductUrl(null); }
    return handleReturn();
  });
  track('visit');
})();
