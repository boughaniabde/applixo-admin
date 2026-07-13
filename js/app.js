/**
 * generator.js
 * Builds the standalone "app download page" HTML that gets pasted
 * into a Blogger post's HTML view. Self-contained, dark-mode aware,
 * includes SEO/OG/Twitter/Schema.org tags, an APKPure-style layout
 * (icon, spec grid, gallery, countdown-gated download buttons), and
 * a deterministic download-method selector (Play only / Play +
 * external / external only) — the buttons that get emitted are
 * decided HERE at generation time from real data, never guessed at
 * runtime from placeholder strings, so there's no "did the template
 * engine forget to replace this?" failure mode in the published page.
 *
 * Direct-link conversion (Google Drive / GitHub share links -> real
 * direct-download URLs) happens in app.js via Generator.toDirectLink()
 * BEFORE this file ever runs — see that function's doc comment for
 * exactly what it can and can't do (MediaFire is explicitly NOT
 * supported and never silently "looks like" it is).
 *
 * The download counter is a local, per-browser nudge (localStorage),
 * not real cross-visitor analytics — Blogger posts are static HTML
 * with no backend to count from.
 */

const Generator = {
  /* ================================================================ */
  /* Direct-link conversion — pure string/regex, no network request     */
  /* ================================================================ */

  /**
   * Converts a pasted share link into a direct-download URL where
   * that's actually possible, and returns metadata about what it did
   * so the wizard can show an honest inline hint.
   *
   * Supported:
   *  - Google Drive "file/d/ID/view" links -> uc?export=download&id=ID
   *    (works for small files; Google interposes a virus-scan warning
   *    page for large files that this cannot bypass — no client-side
   *    fix exists for that, it's Google's server behavior).
   *  - GitHub "blob" links -> raw.githubusercontent.com equivalent.
   *  - GitHub Releases asset links are already direct — passed through.
   *
   * NOT supported (returned unchanged, flagged):
   *  - MediaFire and anything else. MediaFire deliberately renders its
   *    real download link via JavaScript specifically to block this
   *    kind of automated extraction, and your browser can't read a
   *    MediaFire page's contents cross-origin to work around that —
   *    there is no honest client-side fix here.
   *
   * @param {string} url
   * @returns {{url:string, source:'drive'|'github-blob'|'github-release'|'other', converted:boolean, warning:string|null}}
   */
  toDirectLink(url) {
    const raw = (url || '').trim();
    if (!raw) return { url: '', source: 'other', converted: false, warning: null };

    const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return {
        url: `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`,
        source: 'drive',
        converted: true,
        warning: 'قد تظهر صفحة تحذير من Google للملفات الكبيرة — لا يوجد حل من طرف المتصفح لتجاوزها.',
      };
    }

    const ghBlobMatch = raw.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
    if (ghBlobMatch) {
      const [, owner, repo, branch, path] = ghBlobMatch;
      return {
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
        source: 'github-blob',
        converted: true,
        warning: null,
      };
    }

    if (raw.includes('github.com') && raw.includes('/releases/download/')) {
      return { url: raw, source: 'github-release', converted: false, warning: null };
    }

    if (raw.includes('mediafire.com')) {
      return {
        url: raw,
        source: 'other',
        converted: false,
        warning: 'روابط MediaFire لا يمكن تحويلها لرابط مباشر من المتصفح — ستبقى كما هي، وقد يمر الزائر بصفحة MediaFire الوسيطة.',
      };
    }

    return { url: raw, source: 'other', converted: false, warning: null };
  },

  /* ================================================================ */
  /* Page build                                                         */
  /* ================================================================ */

  /**
   * @param {object} project wizard data — name, developer, description,
   *   icon, version, size, android, updatedAt, downloads, license,
   *   playStoreUrl, directUrl (already converted via toDirectLink),
   *   extraField, downloadMethod: 'play'|'play_external'|'external'
   * @param {Array} images uploaded gallery images
   * @param {object|null} template a parsed data/templates/*.json object
   */
  build(project, images = [], template = null) {
    const {
      name = 'اسم التطبيق', developer = 'المطور', description = '', icon = '',
      version = '1.0.0', size = '—', android = '5.0+', updatedAt = '',
      downloads = '10K+', license = 'مجاني', playStoreUrl = '', directUrl = '',
      extraField = '', downloadMethod = 'play_external',
    } = project;

    const labels = {
      developerLabel: template?.fields?.developerLabel || 'المطور',
      downloadsLabel: template?.fields?.downloadsLabel || 'التحميلات',
      extraFieldLabel: template?.fields?.extraFieldLabel || null,
    };

    const gallery = images.map((img) => img.url).filter(Boolean);
    const safeName = UI.escapeHTML(name);
    const safeDev = UI.escapeHTML(developer);
    const safeDesc = UI.escapeHTML(description).slice(0, 600);
    const today = new Date().toISOString().slice(0, 10);
    const idSlug = (project.id || name).toString().replace(/[^a-z0-9]/gi, '');

    // Decided HERE, deterministically, from real data — not guessed at
    // runtime in the published page.
    const showPlay = (downloadMethod === 'play' || downloadMethod === 'play_external') && !!playStoreUrl;
    const showDirect = (downloadMethod === 'external' || downloadMethod === 'play_external') && !!directUrl;

    const specCells = [
      ['📦', 'الحجم', size],
      ['🧩', 'الإصدار', version],
      ['🤖', 'التوافق', android],
      ['🕒', 'آخر تحديث', updatedAt || today],
      ['🔑', 'الترخيص', license],
      ['⬇️', UI.escapeHTML(labels.downloadsLabel), downloads],
    ];
    if (labels.extraFieldLabel && extraField) specCells.push(['🏷️', UI.escapeHTML(labels.extraFieldLabel), UI.escapeHTML(extraField)]);

    const buttonsHtml = [
      showDirect ? `<a href="${directUrl}" target="_blank" rel="noopener" class="bc2-btn bc2-btn-direct" id="bc2-direct-dl">⬇ تحميل مباشر</a>` : '',
      showPlay ? `<a href="${playStoreUrl}" target="_blank" rel="noopener" class="bc2-btn bc2-btn-play">▶ Google Play</a>` : '',
    ].filter(Boolean).join('');

    const rawHtml = `<!-- ⚠️ BLOGGER: افتح المقال، ثم من محرر الأدوات اختر "HTML" (وليس "Compose") قبل اللصق، وإلا سيتم كسر التصميم تلقائياً -->
<meta name="description" content="${safeDesc}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${directUrl || playStoreUrl || '#'}">
<meta property="og:type" content="website">
<meta property="og:title" content="تحميل ${safeName} — ${safeDev}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:image" content="${icon}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="تحميل ${safeName}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${icon}">
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
  "author": { "@type": "Organization", "name": "${safeDev}" },
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
</script>

<div class="bc2-wrap" id="bc2-${idSlug}" data-mode="dark" dir="rtl">
  <style>
    #bc2-${idSlug}{--bg:#0E1424;--card:#151d33;--ink:#F5F7FC;--ink2:#9AA4C0;--accent:#6D5EF5;--accent2:#22D3B0;font-family:'Tahoma','Segoe UI',sans-serif;background:var(--bg);color:var(--ink);padding:26px 18px;border-radius:22px;max-width:820px;width:100%;margin:0 auto;box-sizing:border-box;overflow:hidden;}
    #bc2-${idSlug}[data-mode="light"]{--bg:#F3F5FA;--card:#ffffff;--ink:#171B2C;--ink2:#5B6478;}
    #bc2-${idSlug} *{box-sizing:border-box;}
    #bc2-${idSlug} img{max-width:none;}
    .bc2-top{display:flex;align-items:center;gap:14px;margin-bottom:16px;width:100%;}
    .bc2-top img{width:74px;height:74px;border-radius:18px;object-fit:cover;background:var(--card);flex:none;}
    .bc2-top .bc2-meta{min-width:0;flex:1;}
    .bc2-top h2{margin:0 0 4px;font-size:19px;}
    .bc2-top p{margin:0;color:var(--ink2);font-size:12.5px;}
    .bc2-mode-btn{flex:none;width:40px;height:36px;border-radius:11px;background:var(--card);border:none;color:var(--ink);cursor:pointer;font-size:14px;white-space:nowrap;}
    .bc2-specs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;}
    .bc2-cell{background:var(--card);border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:10px;}
    .bc2-cell b{display:block;font-size:13px;}
    .bc2-cell span{font-size:10.5px;color:var(--ink2);}
    .bc2-h{font-size:14px;font-weight:700;margin:20px 0 10px;padding-bottom:7px;border-bottom:1px solid rgba(154,164,192,.25);}
    .bc2-desc{font-size:13px;line-height:1.85;color:var(--ink2);}
    .bc2-gallery{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding-bottom:4px;width:100%;-webkit-overflow-scrolling:touch;}
    .bc2-gallery img{height:150px;width:auto;border-radius:13px;flex:none;}
    .bc2-dl-zone{background:var(--card);border-radius:16px;padding:26px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:18px;min-height:120px;}
    .bc2-timer{width:64px;height:64px;position:relative;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;}
    .bc2-timer svg{width:64px;height:64px;transform:rotate(-90deg);position:absolute;inset:0;}
    .bc2-timer circle{fill:none;stroke-width:5;}
    .bc2-timer .bc2-track{stroke:rgba(154,164,192,.25);}
    .bc2-timer .bc2-fill{stroke:var(--accent);stroke-linecap:round;stroke-dasharray:176;stroke-dashoffset:176;transition:stroke-dashoffset 1s linear;}
    .bc2-btns{display:none;width:100%;flex-direction:column;gap:10px;max-width:420px;}
    .bc2-btn{display:block;width:100%;text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px;text-decoration:none;color:#fff;}
    .bc2-btn-direct{background:linear-gradient(135deg,var(--accent),#8B7CFB);}
    .bc2-btn-play{background:#000;}
    .bc2-counter{text-align:center;font-size:11.5px;color:var(--ink2);margin-top:10px;}
    .bc2-counter b{color:var(--accent2);}
    @media(max-width:520px){.bc2-specs{grid-template-columns:1fr;}}
  </style>

  <div class="bc2-top">
    <img src="${icon}" alt="${safeName}" loading="lazy">
    <div class="bc2-meta">
      <h2>${safeName}</h2>
      <p>${UI.escapeHTML(labels.developerLabel)}: ${safeDev}</p>
    </div>
    <button class="bc2-mode-btn" onclick="var w=this.closest('.bc2-wrap');w.dataset.mode=w.dataset.mode==='light'?'dark':'light';">🌓</button>
  </div>

  <div class="bc2-specs">
    ${specCells.map(([icn, label, value]) => `<div class="bc2-cell"><span style="font-size:18px;">${icn}</span><div><b>${value}</b><span>${label}</span></div></div>`).join('')}
  </div>

  ${safeDesc ? `<div class="bc2-h">📝 نبذة عن ${safeName}</div><div class="bc2-desc">${safeDesc}</div>` : ''}

  ${gallery.length ? `<div class="bc2-h">🖼️ لقطات الشاشة</div><div class="bc2-gallery">${gallery.map((src) => `<img src="${src}" loading="lazy" alt="${safeName} screenshot">`).join('')}</div>` : ''}

  <div class="bc2-dl-zone" id="bc2-zone-${idSlug}">
    <div class="bc2-timer" id="bc2-timer-${idSlug}">
      <svg viewBox="0 0 64 64"><circle class="bc2-track" cx="32" cy="32" r="28"></circle><circle class="bc2-fill" id="bc2-fill-${idSlug}" cx="32" cy="32" r="28"></circle></svg>
      <span id="bc2-count-${idSlug}">8</span>
    </div>
    <div class="bc2-btns" id="bc2-btns-${idSlug}">${buttonsHtml}</div>
    <div class="bc2-counter">${UI.escapeHTML(labels.downloadsLabel)}: <b id="bc2-dlcount-${idSlug}">${downloads}</b></div>
  </div>

  <script>
  (function(){
    var root = document.getElementById('bc2-${idSlug}');
    var zone = document.getElementById('bc2-zone-${idSlug}');
    var timerEl = document.getElementById('bc2-timer-${idSlug}');
    var fillEl = document.getElementById('bc2-fill-${idSlug}');
    var countEl = document.getElementById('bc2-count-${idSlug}');
    var btnsEl = document.getElementById('bc2-btns-${idSlug}');
    var directBtn = document.getElementById('bc2-direct-dl');
    var dlCountEl = document.getElementById('bc2-dlcount-${idSlug}');
    var seconds = 8;
    var startedCountdown = false;

    function startCountdown(){
      if (startedCountdown) return;
      startedCountdown = true;
      var remaining = seconds;
      var interval = setInterval(function(){
        remaining--;
        if (countEl) countEl.textContent = remaining;
        if (fillEl) fillEl.style.strokeDashoffset = 176 - (176 / seconds) * (seconds - remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          if (timerEl) timerEl.style.display = 'none';
          if (btnsEl) btnsEl.style.display = 'flex';
        }
      }, 1000);
    }

    if ('IntersectionObserver' in window && zone) {
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){ if (entry.isIntersecting) { startCountdown(); observer.unobserve(zone); } });
      }, { threshold: 0.3 });
      observer.observe(zone);
    } else {
      startCountdown();
    }

    if (directBtn) {
      directBtn.addEventListener('click', function(){
        try {
          var key = 'bc_dl_count_${idSlug}';
          var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
          localStorage.setItem(key, n);
          if (dlCountEl) dlCountEl.textContent = '${downloads}'.replace(/[0-9.]+/, function(m){ return (parseFloat(m) + (n / 1000)).toFixed(1); });
        } catch(e) {}
      });
    }
  })();
  </script>
</div>`;

    // Collapse to a single line. Blogger's "Compose" editor treats bare
    // newlines in pasted content as line breaks and injects <br> tags
    // into the middle of your markup, which breaks flex/grid layouts.
    // Removing our own newlines up front makes that failure mode far
    // less likely — but you must still paste in "HTML" view, not
    // "Compose" view, for any of this to render correctly.
    return this._minify(rawHtml);
  },

  _minify(html) {
    return html.replace(/\n\s*/g, ' ').replace(/>\s+</g, '><').trim();
  },
};
