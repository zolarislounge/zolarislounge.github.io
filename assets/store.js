// فروشگاه Zolaris — اتصال سایت به Supabase: محصولات، سبد خرید، ورود با موبایل، ثبت سفارش، پرداخت زیبال
'use strict';
(() => {
  // کلید publishable عمومیه؛ امنیت داده‌ها با RLS سمت سرور تأمین می‌شه
  const SB_URL = 'https://avwgfmdnwibtxurlnphw.supabase.co';
  const SB_KEY = 'sb_publishable_VOh9R0tdxf-3YFN9_y3J1Q_mf9kIXf2';
  const sb = window.supabase ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, storageKey: 'zl-auth' } }) : null;

  const CATS = ['همه محصولات', 'بافت و پلیور', 'مانتو، کت و جلیقه', 'پالتو', 'شومیز و تاپ', 'شلوار و دامن', 'تیشرت', 'شال', 'کیف', 'کفش', 'اکسسوری'];
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
  let products = [], live = false, cat = 0, query = '', sizes = new Set(), favOnly = false;
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
    const term = toEn(query.trim()).toLowerCase();
    let list = products.filter(p => (!cat || p.category_label === CATS[cat] || p.category === CATS[cat])
      && (!term || toEn(p.name + ' ' + (p.category_label || '')).toLowerCase().includes(term))
      && (!sizes.size || variants(p).some(v => sizes.has(v.name)))
      && (!favOnly || favs.has(p.id)));
    const s = $('#sort').value;
    if (s === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    if (s === 'cheap') list = [...list].sort((a, b) => priceOf(a) - priceOf(b));
    if (s === 'exp') list = [...list].sort((a, b) => priceOf(b) - priceOf(a));
    // ناموجودها آخر
    list = [...list].sort((a, b) => (!a.sample && !a.stock) - (!b.sample && !b.stock));
    $('#favBar').hidden = !favOnly;
    $('#grid').innerHTML = list.length ? list.map(p => {
      const out = !p.sample && !p.stock, vs = variants(p);
      return `<article class="card">
        <div class="media" data-view="${p.id}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : ''}
          ${p.sample ? '' : `<button class="fav${favs.has(p.id) ? ' on' : ''}" data-fav="${p.id}" aria-label="علاقه‌مندی">${heart}</button>`}
          ${out ? '<span class="badge out">ناموجود</span>' : onSale(p) ? '<span class="badge sale">حراج</span>' : p.is_new ? '<span class="badge">جدید</span>' : ''}</div>
        <h3 class="name" data-view="${p.id}">${esc(p.name)}</h3>
        <div class="cat">${esc(p.category_label || '')}</div>
        <div class="price">${priceHtml(p)}</div>
        ${p.sample ? '' : out ? '<button class="add out" disabled>ناموجود</button>'
          : vs.length ? `<button class="add" data-view="${p.id}">انتخاب سایز</button>` : `<button class="add" data-add="${p.id}">افزودن به سبد خرید</button>`}
      </article>`;
    }).join('') : `<p class="empty" style="grid-column:1/-1">${favOnly ? 'هنوز محصولی رو به علاقه‌مندی‌ها اضافه نکردی.' : term ? 'محصولی با این نام پیدا نشد.' : 'فعلاً محصولی در این دسته نیست.'}</p>`;
    reveal();
  }
  function reveal() {
    const cards = $$('.card:not(.in)');
    if (!('IntersectionObserver' in window)) return cards.forEach(c => c.classList.add('in'));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .05 });
    cards.forEach((c, i) => { c.style.transitionDelay = (i % 2) * .08 + 's'; io.observe(c); });
  }
  async function loadProducts() {
    if (!sb) { products = SAMPLE; render(); return; }
    try {
      const rows = await q(sb.from('products').select('*').order('created_at', { ascending: false }));
      live = rows.length > 0;
      products = live ? rows : SAMPLE;
    } catch (e) { console.error(e); products = SAMPLE; toast('بارگذاری محصولات انجام نشد؛ صفحه رو تازه کن', true); }
    // دسته‌هایی که در پنل تعریف شدن ولی در لیست ثابت نیستن هم به منو اضافه می‌شن
    for (const p of products) if (p.category_label && !CATS.includes(p.category_label)) CATS.push(p.category_label);
    drawCats(); drawSizes(); render(); renderCart();
  }
  function drawCats() {
    $('#menuList').innerHTML = ['صفحه اصلی', ...CATS, 'تماس با ما'].map((c, i) => `<a href="${i === CATS.length + 1 ? '#contact' : '#shop'}" data-cat="${i - 1}"${i - 1 === cat ? ' class="on"' : ''}>${esc(c)}<span>‹</span></a>`).join('');
    $('#fcat').innerHTML = CATS.map((c, i) => `<button data-fc="${i}"${i === cat ? ' class="on"' : ''}>${esc(c)}</button>`).join('');
  }
  function drawSizes() {
    const all = [...new Set(products.flatMap(p => variants(p).map(v => v.name)))];
    $('#fsizeWrap').hidden = !all.length;
    $('#fsize').innerHTML = all.map(s => `<button dir="auto" data-sz="${esc(s)}"${sizes.has(s) ? ' class="on"' : ''}>${esc(s)}</button>`).join('');
  }
  function setCat(i) {
    cat = i >= 0 && i < CATS.length ? i : 0; favOnly = false;
    $$('[data-fc]').forEach(b => b.classList.toggle('on', +b.dataset.fc === cat));
    $$('#menuList a').forEach(a => a.classList.toggle('on', +a.dataset.cat === cat));
    render();
  }

  // ───────── صفحه‌ی محصول ─────────
  async function openProduct(id) {
    const p = products.find(x => x.id === id); if (!p || p.sample) return;
    const vs = variants(p);
    let sel = vs.length === 1 && avail(p, vs[0].name) ? vs[0].name : null, qty = 1;
    const sh = $('#pv');
    const draw = () => {
      const max = avail(p, sel) - inCart(p.id, sel);
      sh.querySelector('.pv-body').innerHTML = `
        <div class="pv-img">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : ''}</div>
        <div class="pv-info">
          <div class="cat">${esc(p.category_label || '')}</div>
          <h2 class="pv-name">${esc(p.name)}</h2>
          <div class="pv-price">${sel ? (onSale(p) && !variants(p).find(v => v.name === sel)?.price ? `<s>${fa(p.price)}</s> ` : '') + toman(priceOf(p, sel)) : priceHtml(p)}</div>
          ${vs.length ? `<h5>سایز / مدل</h5><div class="chips" id="pvV">${vs.map(v => { const a = avail(p, v.name); return `<button data-v="${esc(v.name)}" class="${v.name === sel ? 'on' : ''}" ${a ? '' : 'disabled'} dir="auto">${esc(v.name)}${a ? '' : ' (ناموجود)'}</button>`; }).join('')}</div>` : ''}
          ${p.stock ? `<h5>تعداد</h5><div class="qty"><button data-q="1" aria-label="بیشتر">+</button><span>${fa(qty)}</span><button data-q="-1" aria-label="کمتر">−</button></div>
            ${sel || !vs.length ? (max <= 3 && max > 0 ? `<small class="warn">فقط ${fa(max)} عدد دیگه موجوده</small>` : max <= 0 ? '<small class="warn">همه‌ی موجودی این مورد در سبد شماست</small>' : '') : ''}` : ''}
          <button class="btn btn-m pv-add" id="pvAdd" ${!p.stock ? 'disabled' : ''}>${!p.stock ? 'ناموجود' : vs.length && !sel ? 'اول سایز رو انتخاب کن' : 'افزودن به سبد خرید'}</button>
          ${p.description ? `<div class="pv-desc">${esc(p.description)}</div>` : ''}
          <div class="pv-rev" id="pvRev"></div>
        </div>`;
      $$('#pvV button', sh).forEach(b => b.onclick = () => { sel = b.dataset.v; qty = 1; draw(); });
      $$('[data-q]', sh).forEach(b => b.onclick = () => { qty = Math.min(Math.max(1, qty + +b.dataset.q), Math.max(1, max)); draw(); });
      $('#pvAdd', sh).onclick = () => {
        if (vs.length && !sel) return toast('اول سایز رو انتخاب کن', true);
        if (addToCart(p.id, sel, qty)) closeAll();
      };
      loadReviews(p);
    };
    draw();
    open('pv');
    track('view', p.id);
  }
  async function loadReviews(p) {
    const box = $('#pvRev'); if (!box || !sb) return;
    let rows = [];
    try { rows = await q(sb.from('reviews').select('author_name,rating,comment,created_at').eq('product_id', p.id).eq('approved', true).order('created_at', { ascending: false }).limit(30)); } catch (e) { }
    if (!$('#pvRev')) return;
    const stars = n => '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>';
    box.innerHTML = `<h5>نظر مشتری‌ها${rows.length ? ' (' + fa(rows.length) + ')' : ''}</h5>
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

  // ───────── سبد خرید ─────────
  const saveCart = () => ls.set('zl-cart', cart);
  function addToCart(id, variant, qty = 1) {
    const p = products.find(x => x.id === id); if (!p || p.sample) return false;
    const max = avail(p, variant) - inCart(id, variant);
    if (max <= 0) { toast('بیشتر از این موجودی نداریم', true); return false; }
    qty = Math.min(qty, max);
    const ex = cart.find(i => i.id === id && i.variant === (variant || null));
    if (ex) ex.qty += qty; else cart.push({ id, variant: variant || null, qty });
    saveCart(); renderCart(); toast('به سبد خرید اضافه شد'); track('cart', id);
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
    const sub = lines.reduce((a, l) => a + priceOf(l.p, l.variant) * l.qty, 0);
    $('#cartBody').innerHTML = lines.length ? lines.map((l, k) => {
      const max = avail(l.p, l.variant);
      return `<div class="ci"><img src="${esc(l.p.image_url || '')}" alt=""><div><b>${esc(l.p.name)}</b>
        <small>${l.variant ? '<bdi>' + esc(l.variant) + '</bdi> · ' : ''}${toman(priceOf(l.p, l.variant))}</small>
        <div class="qty sm"><button data-cq="${k}" data-d="1" ${l.qty >= max ? 'disabled' : ''} aria-label="بیشتر">+</button><span>${fa(l.qty)}</span><button data-cq="${k}" data-d="-1" aria-label="کمتر">−</button></div>
        ${l.qty > max ? `<small class="warn">${max ? 'فقط ' + fa(max) + ' عدد موجوده' : 'ناموجود شده'}</small>` : ''}</div>
        <button data-rm="${k}">حذف</button></div>`;
    }).join('') + `<div class="ctot"><span>جمع سبد</span><b>${toman(sub)}</b></div>` : '<p class="empty">سبد خرید شما خالی است</p>';
    $('#checkoutBtn').disabled = !lines.length;
  }
  function count(id, n) { const el = $(id); el.textContent = fa(n); el.classList.toggle('on', n > 0); }

  // ───────── علاقه‌مندی‌ها ─────────
  async function toggleFav(id, btn) {
    const on = !favs.has(id);
    on ? favs.add(id) : favs.delete(id);
    ls.set('zl-favs', [...favs]); count('#favN', favs.size);
    if (btn) btn.classList.toggle('on', on);
    if (favOnly) render();
    if (user && sb) {
      const r = on ? sb.from('wishlists').insert({ user_id: user.id, product_id: id }) : sb.from('wishlists').delete().eq('user_id', user.id).eq('product_id', id);
      r.then(() => { }, () => { });
    }
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
    profile = null;
    if (user) {
      try { profile = await q(sb.from('profiles').select('*').eq('id', user.id).maybeSingle()); } catch (e) { }
      sb.from('profiles').upsert({ id: user.id, phone: profile?.phone || normPhone(user.phone), last_seen: new Date().toISOString() }).then(() => { }, () => { });
      syncFavs();
    }
    $('#acctBtn').classList.toggle('in', !!user);
  }
  let otpPhone = null;
  function drawAcct(note) {
    const b = $('#acctBody');
    if (!user) {
      b.innerHTML = `<form class="form" id="lgF">
        ${note ? `<p class="note">${esc(note)}</p>` : ''}
        <p class="muted">با شماره موبایل وارد شو؛ اگه حساب نداری، خودکار ساخته می‌شه.</p>
        <label>شماره موبایل<input class="fld ltr" id="lgP" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09xxxxxxxxx" value="${esc(otpPhone || '')}" ${otpPhone ? 'readonly' : ''} required></label>
        ${otpPhone ? `<label>کد پیامک‌شده<input class="fld ltr" id="lgC" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
          <button class="btn btn-m">ورود</button><button type="button" class="link" id="lgBack">تغییر شماره / ارسال دوباره</button>`
        : `<button class="btn btn-m">دریافت کد ورود</button><button type="button" class="link" id="lgPw">ورود با رمز عبور</button>
          <div id="lgPwBox" hidden><label>رمز عبور<input class="fld ltr" id="lgPass" type="password" autocomplete="current-password"></label><button type="button" class="btn btn-o" id="lgPwGo">ورود با رمز</button></div>`}
        <p class="err" id="lgE"></p></form>`;
      const err = t => { $('#lgE').textContent = t || ''; };
      $('#lgF').onsubmit = async e => {
        e.preventDefault(); err();
        const btn = e.submitter || $('#lgF .btn-m'); btn.disabled = true;
        try {
          if (!otpPhone) {
            const p = normPhone($('#lgP').value);
            if (!p) throw new Error('شماره موبایل رو درست وارد کن (مثل ۰۹۱۲۳۴۵۶۷۸۹)');
            const { error } = await sb.auth.signInWithOtp({ phone: intl(p) });
            if (error) throw error;
            otpPhone = p; drawAcct(note); $('#lgC').focus();
          } else {
            const { error } = await sb.auth.verifyOtp({ phone: intl(otpPhone), token: toEn($('#lgC').value).replace(/\D/g, ''), type: 'sms' });
            if (error) throw error;
            otpPhone = null; await onSignedIn();
          }
        } catch (ex) {
          const m = String(ex.message || ex);
          err(/expired|invalid/i.test(m) && otpPhone ? 'کد اشتباهه یا منقضی شده' : /rate|seconds|after/i.test(m) ? 'چند لحظه صبر کن و دوباره امتحان کن' : /sms|hook|send|provider/i.test(m) ? 'ارسال پیامک الان ممکن نیست؛ کمی بعد امتحان کن یا با رمز عبور وارد شو' : /شماره/.test(m) ? m : errText(ex));
        } finally { btn.disabled = false; }
      };
      if ($('#lgBack')) $('#lgBack').onclick = () => { otpPhone = null; drawAcct(note); };
      if ($('#lgPw')) $('#lgPw').onclick = () => { $('#lgPwBox').hidden = false; $('#lgPass').focus(); };
      if ($('#lgPwGo')) $('#lgPwGo').onclick = async e => {
        err(); const p = normPhone($('#lgP').value);
        if (!p) return err('شماره موبایل رو درست وارد کن');
        e.target.disabled = true;
        const { error } = await sb.auth.signInWithPassword({ phone: intl(p), password: $('#lgPass').value });
        e.target.disabled = false;
        if (error) return err(/Invalid login/i.test(error.message) ? 'شماره یا رمز اشتباهه' : errText(error));
        await onSignedIn();
      };
      return;
    }
    b.innerHTML = `<div class="form">
      <p class="hello">سلام${profile?.full_name ? ' ' + esc(profile.full_name) : ''} 👋<small class="ltr">${esc(faDigits(normPhone(user.phone) || ''))}</small></p>
      <h5>سفارش‌های من</h5><div id="myOrders" class="muted">در حال بارگذاری…</div>
      <details><summary>اطلاعات من</summary>
        <form id="pfF" class="form"><label>نام و نام خانوادگی<input class="fld" name="n" maxlength="100" value="${esc(profile?.full_name || '')}"></label>
        <label>آدرس<textarea class="fld" name="a" rows="3" maxlength="600">${esc(profile?.address || '')}</textarea></label>
        <button class="btn btn-o">ذخیره</button></form></details>
      <details><summary>تعیین رمز عبور</summary>
        <form id="pwF" class="form"><p class="muted">با رمز عبور، بدون پیامک هم می‌تونی وارد بشی.</p><label>رمز جدید (حداقل ۸ حرف)<input class="fld ltr" name="p" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn btn-o">ثبت رمز</button></form></details>
      <button class="link" id="lgOut">خروج از حساب</button></div>`;
    $('#pfF').onsubmit = async e => {
      e.preventDefault();
      try { await saveProfile(e.target.n.value.trim(), e.target.a.value.trim()); toast('ذخیره شد'); } catch (ex) { toast(errText(ex), true); }
    };
    $('#pwF').onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: e.target.p.value });
      if (error) return toast(/weak|short|least/i.test(error.message) ? 'رمز ضعیفه؛ طولانی‌ترش کن' : errText(error), true);
      e.target.reset(); toast('رمز عبور ثبت شد');
    };
    $('#lgOut').onclick = async () => { await sb.auth.signOut(); user = profile = null; $('#acctBtn').classList.remove('in'); drawAcct(); toast('از حساب خارج شدی'); };
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
      box.classList.remove('muted');
      box.innerHTML = rows.length ? rows.map(o => `<div class="mo">
        <div><b>کد ${esc(faDigits(o.tracking_code))}</b><span class="st ${ST_CLASS[o.status] || ''}">${esc(o.status)}</span></div>
        <small>${fdate(o.created_at)} · ${fa((o.items || []).reduce((a, i) => a + (+i.qty || 0), 0))} قلم · ${toman(o.total)}</small>
        ${o.post_tracking ? `<small>مرسوله: ${esc(o.post_carrier || '')} <span class="ltr">${esc(o.post_tracking)}</span></small>` : ''}
        ${o.status === 'در انتظار پرداخت' ? `<button class="btn btn-m sm" data-pay="${esc(o.tracking_code)}">پرداخت</button>` : ''}</div>`).join('')
        : '<p class="muted">هنوز سفارشی نداری.</p>';
    } catch (e) { box.textContent = 'بارگذاری نشد'; }
  }
  async function onSignedIn() {
    await loadUser();
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
  function closeAll() { $$('.drawer.on,.search.on,.sheet.on').forEach(d => d.classList.remove('on')); scrim.classList.remove('on'); document.body.style.overflow = ''; }
  function open(id) { closeAll(); $('#' + id).classList.add('on'); scrim.classList.add('on'); document.body.style.overflow = 'hidden'; }

  document.addEventListener('click', e => {
    const t = e.target;
    const o = t.closest('[data-open]');
    if (o) { if (o.dataset.open === 'acct') drawAcct(); open(o.dataset.open); return; }
    if (t.closest('[data-open-acct]')) { afterLogin = null; drawAcct(); open('acct'); return; }
    if (t.closest('[data-search]')) { closeAll(); $('#search').classList.add('on'); scrim.classList.add('on'); setTimeout(() => $('#search input').focus(), 300); return; }
    const pv = t.closest('[data-pay]'); if (pv) { pay(pv.dataset.pay); return; }
    const fv = t.closest('[data-fav]'); if (fv) { e.stopPropagation(); toggleFav(+fv.dataset.fav, fv); return; }
    const vw = t.closest('[data-view]'); if (vw) { openProduct(+vw.dataset.view); return; }
    const mc = t.closest('[data-cat]'); if (mc) { if (+mc.dataset.cat < CATS.length) setCat(+mc.dataset.cat); closeAll(); return; }
    const fc = t.closest('[data-fc]'); if (fc) { setCat(+fc.dataset.fc); return; }
    const sz = t.closest('[data-sz]'); if (sz) { const s = sz.dataset.sz; sizes.has(s) ? sizes.delete(s) : sizes.add(s); sz.classList.toggle('on'); render(); return; }
    if (t.closest('#fclear')) { sizes.clear(); drawSizes(); setCat(0); return; }
    if (t.closest('#favBtn')) { favOnly = !favOnly; render(); $('#shop').scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.closest('#favOff')) { favOnly = false; render(); return; }
    if (t.closest('[data-close]') || t === scrim) { closeAll(); return; }
    const a = t.closest('[data-add]');
    if (a) { if (addToCart(+a.dataset.add, null, 1)) { a.classList.add('done'); a.textContent = 'اضافه شد ✓'; setTimeout(() => { a.classList.remove('done'); a.textContent = 'افزودن به سبد خرید'; }, 1300); } return; }
    const cq = t.closest('[data-cq]');
    if (cq) { const l = cartLines()[+cq.dataset.cq]; const i = cart.find(x => x.id === l.id && x.variant === l.variant); i.qty += +cq.dataset.d; if (i.qty <= 0) cart.splice(cart.indexOf(i), 1); saveCart(); renderCart(); return; }
    const r = t.closest('[data-rm]');
    if (r) { const l = cartLines()[+r.dataset.rm]; cart = cart.filter(x => !(x.id === l.id && x.variant === l.variant)); saveCart(); renderCart(); return; }
    if (t.closest('#checkoutBtn')) { checkout(); }
  });
  document.addEventListener('keydown', e => e.key === 'Escape' && closeAll());
  $('#search input').addEventListener('input', e => { query = e.target.value; render(); });
  $('#search form').addEventListener('submit', e => { e.preventDefault(); closeAll(); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
  $('#sort').onchange = render;
  addEventListener('scroll', () => $('header').classList.toggle('scrolled', scrollY > 10), { passive: true });
  // سبد خرید بین تب‌ها هماهنگ می‌مونه
  addEventListener('storage', e => { if (e.key === 'zl-cart') { cart = ls.get('zl-cart', []); renderCart(); } });

  // ───────── شروع ─────────
  drawCats(); products = SAMPLE; render(); count('#favN', favs.size); renderCart();
  if (!sb) { toast('اتصال به فروشگاه برقرار نشد؛ صفحه رو تازه کن', true); return; }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { user = profile = null; $('#acctBtn').classList.remove('in'); } });
  Promise.all([loadProducts(), loadUser()]).then(handleReturn);
  track('visit');
})();
