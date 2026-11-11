// اطلاعیه‌ی بالای سایت: ساخت متن، رنگ، اندازه، لینک و انیمیشن — مشترک بین سایت و پیش‌نمایش پنل مدیریت
// تنظیمات (site_settings → announce): { enabled, text, bg, fg, size: ''|sm|lg, link, anim: none|rotate|marquee|shine|pulse, speed: slow|''|fast }
'use strict';
(() => {
  const css = `
.announce.ann-sm{font-size:11.5px;padding:10px 16px}
.announce.ann-lg{font-size:14px;padding:16px 16px;font-weight:500}
.announce a.ann-all{display:block;white-space:normal;color:inherit;text-decoration:none}
/* چرخشی: هر بار یک خط، با محو و بالا آمدن */
.ann-rot{display:grid}
.ann-rot > span{grid-area:1/1;opacity:0;transform:translateY(10px);transition:opacity .5s cubic-bezier(.23,1,.32,1),transform .5s cubic-bezier(.23,1,.32,1);pointer-events:none}
.ann-rot > span.on{opacity:1;transform:none;pointer-events:auto}
.ann-rot > span.out{opacity:0;transform:translateY(-10px)}
/* متن متحرک (راست‌به‌چپ: از همون اول دیده می‌شه و به سمت راست حرکت می‌کنه؛ دو نسخه پشت هم برای حلقه‌ی بی‌وقفه) */
.announce.ann-mq{padding-left:0;padding-right:0;overflow:hidden}
.ann-mq-w{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.ann-mq-t{display:flex;width:max-content;direction:rtl;animation:ann-mq var(--ann-dur,20s) linear infinite}
.ann-mq-t > span{white-space:nowrap;padding:0 28px}
.ann-mq-t i{font-style:normal;opacity:.55;margin:0 16px}
.ann-mq-w:active .ann-mq-t{animation-play-state:paused}
@keyframes ann-mq{from{transform:translateX(0)}to{transform:translateX(50%)}}
/* درخشش: یک نوار نور روی متن رد می‌شه */
.ann-sh{background:linear-gradient(100deg,var(--ann-fg) 0%,var(--ann-fg) 40%,var(--ann-hi) 50%,var(--ann-fg) 60%,var(--ann-fg) 100%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ann-sh var(--ann-dur,3.5s) linear infinite}
.ann-sh a{color:inherit}
@keyframes ann-sh{from{background-position:100% 0}to{background-position:-50% 0}}
/* تپش: چند ثانیه یک بار کمی بزرگ و روشن می‌شه */
.ann-pl{display:inline-block;animation:ann-pl var(--ann-dur,3s) cubic-bezier(.23,1,.32,1) infinite}
@keyframes ann-pl{0%,70%,100%{transform:none}80%{transform:scale(1.045)}}
@media (prefers-reduced-motion:reduce){.ann-mq-t,.ann-sh,.ann-pl{animation:none}.ann-mq-t{width:auto;flex-direction:column;align-items:center}.ann-mq-t > span{white-space:normal}.ann-mq-t > span + span{display:none}.ann-sh{color:var(--ann-fg)}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toEn = s => String(s ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const faD = s => String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  // شماره موبایل → لینک تماس
  const line = (l, links) => { const e = esc(l); return links ? e.replace(/(?:\+?98|0|۰)?[9۹][0-9۰-۹]{9}(?![0-9۰-۹])/g, m => { const en = toEn(m).replace(/^\+?98/, '0').replace(/^9/, '09'); return `<a href="tel:${en}" dir="ltr">${faD(en)}</a>`; }) : e; };
  const okc = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : null;
  // رنگ روشن‌تر برای نوار درخشش (با متن تیره، سفید؛ با متن روشن، یه طلایی گرم)
  const hi = fg => { const h = fg.replace('#', ''); const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6); const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return (r * .3 + g * .59 + b * .11) > 160 ? '#E9C98F' : '#FFFFFF'; };
  const SPEED = { slow: 1.5, '': 1, fast: .6 };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(el, v) {
    clearInterval(el._annT); el._annT = null;
    const lines = String(v.text || '').split('\n').map(x => x.trim()).filter(Boolean);
    const bg = okc(v.bg) || '#3D0D0B', fg = okc(v.fg) || '#F3E6E3';
    el.style.background = bg; el.style.color = fg;
    el.style.setProperty('--ann-fg', fg); el.style.setProperty('--ann-hi', hi(fg));
    const link = /^https?:\/\//i.test(v.link || '') ? v.link : null;
    const anim = ['rotate', 'marquee', 'shine', 'pulse'].includes(v.anim) ? v.anim : 'none';
    const k = SPEED[v.speed || ''] ?? 1;
    const L = lines.map(l => line(l, !link));
    let html;
    el.className = 'announce' + (v.size === 'sm' || v.size === 'lg' ? ' ann-' + v.size : '') + (anim === 'marquee' ? ' ann-mq' : '');
    if (!L.length) html = '';
    else if (anim === 'rotate' && L.length > 1 && !reduced()) html = `<div class="ann-rot">${L.map((x, i) => `<span class="${i ? '' : 'on'}">${x}</span>`).join('')}</div>`;
    else if (anim === 'marquee') { const one = L.join('<i>✦</i>'); html = `<div class="ann-mq-w"><div class="ann-mq-t"><span>${one}</span><span aria-hidden="true">${one}</span></div></div>`; }
    else if (anim === 'shine') html = `<span class="ann-sh" style="--ann-dur:${(3.5 * k).toFixed(2)}s">${L.join('<br>')}</span>`;
    else if (anim === 'pulse') html = `<span class="ann-pl" style="--ann-dur:${(3 * k).toFixed(2)}s">${L.join('<br>')}</span>`;
    else html = L.join('<br>');
    el.innerHTML = link ? `<a class="ann-all" href="${esc(link)}"${link.startsWith(location.origin) ? '' : ' target="_blank" rel="noopener"'}>${html}</a>` : html;
    if (anim === 'marquee') {
      // سرعت ثابت (پیکسل بر ثانیه) فارغ از طول متن
      const t = el.querySelector('.ann-mq-t');
      requestAnimationFrame(() => { const w = t.scrollWidth / 2 || 600; t.style.setProperty('--ann-dur', (w / (55 / k)).toFixed(1) + 's'); });
    }
    if (anim === 'rotate' && L.length > 1 && !reduced()) {
      const spans = [...el.querySelectorAll('.ann-rot > span')]; let i = 0;
      el._annT = setInterval(() => {
        if (!el.isConnected) return clearInterval(el._annT);
        spans[i].classList.remove('on'); spans[i].classList.add('out');
        const prev = spans[i]; setTimeout(() => prev.classList.remove('out'), 600);
        i = (i + 1) % spans.length; spans[i].classList.add('on');
      }, 3500 * k);
    }
    return { bg, lines };
  }
  window.ZLAnn = { render };
})();
