// رفتار مشترک دو نسخه‌ی طراحی Zolaris
// محصولات: عکس‌ها واقعی‌اند؛ نام‌ها پیشنهادی و قیمت‌ها جای‌خالی هستند.
window.ZP = [
  { id: 1, img: 'assets/products/knit-1.jpg', name: 'بافت آرگایل طوسی و قهوه‌ای', lat: 'Argyle Grey', sizes: ['Free'] },
  { id: 2, img: 'assets/products/knit-2.jpg', name: 'بافت توری شیری', lat: 'Ivory Lace', sizes: ['Free'] },
  { id: 3, img: 'assets/products/knit-3.jpg', name: 'بافت آرگایل سبز زیتونی', lat: 'Argyle Olive', sizes: ['Free'] },
  { id: 4, img: 'assets/products/knit-4.jpg', name: 'بافت آرگایل قهوه‌ای و پسته‌ای', lat: 'Argyle Pistachio', sizes: ['Free'] },
  { id: 5, img: 'assets/products/knit-5.jpg', name: 'بافت کراپ آرگایل طوسی و زرشکی', lat: 'Argyle Bordeaux', sizes: ['Free'] },
];

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = n => n.toLocaleString('fa-IR');
  const cart = [], favs = new Set();

  // drawers
  const scrim = $('#scrim');
  const closeAll = () => { $$('.drawer.on').forEach(d => d.classList.remove('on')); scrim && scrim.classList.remove('on'); document.body.style.overflow = ''; };
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) { closeAll(); $('#' + o.dataset.open).classList.add('on'); scrim.classList.add('on'); document.body.style.overflow = 'hidden'; }
    if (e.target.closest('[data-close]') || e.target === scrim || e.target.closest('.drawer a[href^="#"]')) closeAll();

    const f = e.target.closest('[data-fav]');
    if (f) { const id = +f.dataset.fav; favs.has(id) ? favs.delete(id) : favs.add(id); f.classList.toggle('on'); badge('#favN', favs.size); }

    const a = e.target.closest('[data-add]');
    if (a) { const p = ZP.find(x => x.id == a.dataset.add); cart.push(p); renderCart(); toast('به سبد خرید اضافه شد'); a.classList.add('done'); setTimeout(() => a.classList.remove('done'), 1200); }

    const r = e.target.closest('[data-rm]');
    if (r) { cart.splice(+r.dataset.rm, 1); renderCart(); }
  });
  document.addEventListener('keydown', e => e.key === 'Escape' && closeAll());

  function badge(sel, n) { const b = $(sel); if (b) { b.dataset.n = n; b.textContent = fa(n); } }
  function renderCart() {
    badge('#cartN', cart.length);
    const body = $('#cartBody'); if (!body) return;
    body.innerHTML = cart.length ? cart.map((p, i) => `
      <div class="ci"><img src="${p.img}" alt=""><div><b>${p.name}</b><small>[قیمت] تومان</small></div><button data-rm="${i}">حذف</button></div>`).join('')
      : '<p class="empty">سبد خرید شما خالی است</p>';
  }
  function toast(t) { const el = $('#toast'); if (!el) return; el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800); }
  renderCart();

  // header on scroll
  const hdr = $('header');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // page-specific rendering (defined by each page before this script)
  if (typeof window.ZRender === 'function') window.ZRender(ZP);

  // reveal on scroll
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = $$('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); }
  else {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(el => io.observe(el));
  }
  requestAnimationFrame(() => document.body.classList.add('ready'));
})();
