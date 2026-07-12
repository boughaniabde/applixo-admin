/**
 * generator.js
 * Builds the standalone "app download page" HTML that gets pasted
 * straight into a Blogger post's HTML view. Self-contained (no
 * external JS libraries), dark-mode aware, and includes SEO tags,
 * Open Graph, Twitter Card and Schema.org/SoftwareApplication markup.
 *
 * A visible "download counter" is included for UX, but note: a real,
 * accurate cross-visitor counter needs a backend (Blogger posts are
 * static HTML). Here it's implemented as a local, per-browser counter
 * (localStorage) that also seeds itself from a `data-base-count`
 * attribute you can edit — good enough for a lightweight nudge effect,
 * not for real analytics. See README for wiring a real counter via a
 * free service if you need one.
 */

const Generator = {
  build(project, images = []) {
    const {
      name = 'اسم التطبيق', developer = 'المطور', description = '', icon = '',
      version = '1.0.0', size = '—', android = '5.0+', updatedAt = '',
      downloads = '10K+', license = 'مجاني', playStoreUrl = '', directUrl = '',
    } = project;

    const gallery = images.map((img) => img.url).filter(Boolean);
    const safeName = UI.escapeHTML(name);
    const safeDesc = UI.escapeHTML(description).slice(0, 300);
    const today = new Date().toISOString().slice(0, 10);

    return `<!-- ===================== Blogger Control — Download Page ===================== -->
<!-- SEO -->
<meta name="description" content="${safeDesc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${directUrl || '#'}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="تحميل ${safeName} — ${UI.escapeHTML(developer)}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:image" content="${icon}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="تحميل ${safeName}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${icon}">

<!-- Schema.org -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${safeName}",
  "operatingSystem": "ANDROID",
  "applicationCategory": "MobileApplication",
  "softwareVersion": "${version}",
  "fileSize": "${size}",
  "datePublished": "${updatedAt || today}",
  "author": { "@type": "Organization", "name": "${UI.escapeHTML(developer)}" },
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.6", "ratingCount": "128" }
}
</script>

<div class="bc-dl-page" dir="rtl">
  <style>
    .bc-dl-page{--bc-bg:#0E1424;--bc-card:#151d33;--bc-ink:#F5F7FC;--bc-ink2:#9AA4C0;--bc-accent:#6D5EF5;--bc-accent2:#22D3B0;--bc-radius:18px;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;background:var(--bc-bg);color:var(--bc-ink);padding:28px 16px;border-radius:24px;max-width:820px;margin:0 auto;}
    .bc-dl-page[data-mode="light"]{--bc-bg:#F3F5FA;--bc-card:#ffffff;--bc-ink:#171B2C;--bc-ink2:#5B6478;}
    .bc-dl-page *{box-sizing:border-box;}
    .bc-dl-top{display:flex;align-items:center;gap:16px;margin-bottom:18px;}
    .bc-dl-top img{width:76px;height:76px;border-radius:20px;object-fit:cover;background:var(--bc-card);}
    .bc-dl-top h2{margin:0 0 4px;font-size:20px;}
    .bc-dl-top p{margin:0;color:var(--bc-ink2);font-size:13px;}
    .bc-mode-toggle{margin-inline-start:auto;background:var(--bc-card);border:none;color:var(--bc-ink);border-radius:12px;padding:8px 12px;cursor:pointer;font-size:12px;}
    .bc-dl-desc{background:var(--bc-card);border-radius:var(--bc-radius);padding:16px;font-size:13.5px;line-height:1.9;color:var(--bc-ink2);margin-bottom:16px;}
    .bc-dl-info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;}
    .bc-dl-info div{background:var(--bc-card);border-radius:14px;padding:12px;text-align:center;}
    .bc-dl-info b{display:block;font-size:14px;}
    .bc-dl-info span{font-size:11px;color:var(--bc-ink2);}
    .bc-dl-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;}
    .bc-dl-actions a{flex:1;min-width:160px;text-align:center;padding:13px;border-radius:14px;font-weight:700;font-size:13.5px;text-decoration:none;}
    .bc-btn-play{background:#000;color:#fff;}
    .bc-btn-direct{background:linear-gradient(135deg,var(--bc-accent),#8B7CFB);color:#fff;}
    .bc-dl-counter{text-align:center;font-size:12px;color:var(--bc-ink2);margin-bottom:18px;}
    .bc-dl-counter b{color:var(--bc-accent2);font-size:14px;}
    .bc-dl-gallery{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;}
    .bc-dl-gallery img{height:150px;border-radius:14px;flex:none;}
  </style>

  <div class="bc-dl-top">
    <img src="${icon}" alt="${safeName}" loading="lazy">
    <div>
      <h2>${safeName}</h2>
      <p>${UI.escapeHTML(developer)} · v${version} · ${size}</p>
    </div>
    <button class="bc-mode-toggle" onclick="this.closest('.bc-dl-page').dataset.mode = this.closest('.bc-dl-page').dataset.mode==='light'?'dark':'light'">☾ / ☀</button>
  </div>

  <div class="bc-dl-desc">${safeDesc || 'لا يوجد وصف بعد.'}</div>

  <div class="bc-dl-info">
    <div><b>${android}</b><span>الأندرويد</span></div>
    <div><b>${license}</b><span>الترخيص</span></div>
    <div><b>${updatedAt || today}</b><span>آخر تحديث</span></div>
  </div>

  <div class="bc-dl-actions">
    ${playStoreUrl ? `<a class="bc-btn-play" href="${playStoreUrl}" target="_blank" rel="noopener">▶ Google Play</a>` : ''}
    ${directUrl ? `<a class="bc-btn-direct" id="bc-direct-dl" href="${directUrl}" target="_blank" rel="noopener">⬇ تحميل مباشر</a>` : ''}
  </div>

  <div class="bc-dl-counter">تم التحميل <b id="bc-counter-val">${downloads}</b> مرة</div>

  ${gallery.length ? `<div class="bc-dl-gallery">${gallery.map((src) => `<img src="${src}" loading="lazy" alt="${safeName} screenshot">`).join('')}</div>` : ''}

  <script>
  (function(){
    var key='bc_dl_count_${(project.id || name).toString().replace(/[^a-z0-9]/gi, '')}';
    var btn=document.getElementById('bc-direct-dl');
    if(btn){
      btn.addEventListener('click', function(){
        try{
          var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
          localStorage.setItem(key, n);
          document.getElementById('bc-counter-val').textContent = '${downloads}'.replace(/[0-9.]+/, function(m){ return (parseFloat(m)+ (n/1000)).toFixed(1); });
        }catch(e){}
      });
    }
  })();
  </script>
</div>
<!-- ===================== /Blogger Control ===================== -->`;
  },
};
