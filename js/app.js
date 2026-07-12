/**
 * app.js (LocalStorage Edition - Complete Fix)
 * Application entry point. Boots the UI, bypasses the lock screen,
 * wires navigation between views, and contains the view-specific
 * rendering logic (dashboard stats, posts list + search, wizard, projects, settings).
 */

const App = {
  state: {
    posts: [],
    nextPageToken: null,
    wizardStep: 1,
    wizardData: {},
  },

  async init() {
    try {
      if (typeof UI !== 'undefined' && UI.init) UI.init();
      
      this._bindNav();
      this._bindGlobalActions();

      // فحص وجود إعدادات سابقة في المتصفح
      const exists = (typeof Auth !== 'undefined' && Auth.isBootstrapped) ? Auth.isBootstrapped() : false;
      const screenEl = document.getElementById('lock-screen');
      
      if (exists) {
        if (screenEl) screenEl.classList.add('hidden');
        
        if (typeof Auth !== 'undefined' && Auth.unlock) {
          try { await Auth.unlock(''); } catch(e) { /* تجاوز أخطاء التشفير */ }
        }
        
        await this._boot();
      } else {
        if (screenEl) screenEl.classList.add('hidden');
        await this._runFirstTimeSetup();
      }
    } catch (globalErr) {
      console.error("خطأ أثناء تشغيل التطبيق:", globalErr);
      if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast("حدث خطأ أثناء التهيئة المباشرة", "error");
      }
    }
  },

  async _runFirstTimeSetup() {
    if (typeof UI === 'undefined' || !UI.openModal) {
      alert("مكتبة الواجهة UI.openModal غير معرّفة!");
      return;
    }

    UI.openModal({
      title: 'إعداد لوحة التحكم لأول مرة',
      body: `
        <p>أدخل بيانات الاتصال الأساسية لمدونتك. سيتم حفظ هذه البيانات محلياً في متصفحك فوراً.</p>
        <div class="field"><label>Blog ID</label><input type="text" id="s-blogId" placeholder="مثال: 1234567890"></div>
        <div class="field"><label>Google OAuth Client ID</label><input type="text" id="s-clientId"></div>
        <div class="field"><label>Google OAuth Client Secret</label><input type="password" id="s-clientSecret"></div>
        <div class="field"><label>Refresh Token (اختياري)</label><input type="password" id="s-refreshToken"></div>
        <div class="field"><label>ImgBB API Key (اختياري)</label><input type="password" id="s-imgbb"></div>
      `,
      actions: [{
        label: 'حفظ والدخول فوراً',
        cls: 'btn-primary',
        close: true,
        onClick: async () => {
          const secrets = {
            blogId: document.getElementById('s-blogId').value.trim() || '000000000',
            clientId: document.getElementById('s-clientId').value.trim() || 'demo-client-id',
            clientSecret: document.getElementById('s-clientSecret').value.trim() || 'demo-secret',
            refreshToken: document.getElementById('s-refreshToken').value.trim() || '',
            imgbbApiKey: document.getElementById('s-imgbb').value.trim() || '',
            geminiApiKey: '',
            githubToken: '',
            githubOwner: '',
            githubRepo: '',
            githubBranch: 'main',
          };

          if (typeof Auth !== 'undefined' && Auth.createConfig) {
            await Auth.createConfig(secrets, '');
            UI.toast('تم حفظ الإعدادات بنجاح في متصفحك!', 'success');
            await this._boot();
          } else {
            UI.toast('دالة Auth.createConfig غير موجودة!', 'error');
          }
        },
      }],
    });
  },

  async _boot() {
    if (typeof UI !== 'undefined' && UI.setConnectionStatus) UI.setConnectionStatus('warn');
    try {
      if (typeof Projects !== 'undefined' && Projects.load) {
        await Projects.load();
        this._renderProjectSwitch();
      }
      if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
        await Auth.getAccessToken();
      }
      if (typeof UI !== 'undefined' && UI.setConnectionStatus) UI.setConnectionStatus('ok');
    } catch (err) {
      if (err.message !== 'cancelled' && typeof UI !== 'undefined' && UI.toast) {
        UI.toast(err.message, 'error');
      }
    }
    this.navigate('dashboard');
  },

  _bindNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
      el.addEventListener('click', () => this.navigate(el.dataset.view));
    });
  },

  navigate(view) {
    document.querySelectorAll('.nav-item[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
    document.querySelector('.sidebar')?.classList.remove('open');

    const renderers = {
      dashboard: () => this.renderDashboard(),
      posts: () => this.renderPosts(),
      newpost: () => this.renderWizard(),
      projects: () => this.renderProjects(),
      settings: () => this.renderSettings(),
    };
    renderers[view]?.();
  },

  _bindGlobalActions() {
    document.getElementById('global-search')?.addEventListener('input', UI.debounce(async (e) => {
      const q = e.target.value.trim();
      if (!q) return this.renderPosts();
      try {
        const res = await Blogger.searchPosts(q);
        this._renderPostList(res.items || []);
      } catch (err) { UI.toast(err.message, 'error'); }
    }, 400));

    document.getElementById('lock-btn')?.addEventListener('click', () => {
      location.reload();
    });
  },

  /* ================================================================ */
  /* Dashboard                                                          */
  /* ================================================================ */

  async renderDashboard() {
    const el = document.getElementById('view-dashboard');
    if (!el) return;
    
    let c = {};
    if (typeof Auth !== 'undefined' && Auth.config) {
      c = Auth.config;
    } else {
      try {
        const localData = localStorage.getItem('blogger_control_config') || localStorage.getItem('b_config');
        if (localData) c = JSON.parse(localData);
      } catch(e) {}
    }

    el.innerHTML = `
      <div class="page-head"><div><h1>لوحة المعلومات</h1><p>نظرة عامة على مدونتك ومشاريعك</p></div></div>
      <div class="grid grid-4" id="dash-stats">${UI.skeletonRows(4, 96)}</div>
      
      <div class="panel glass" style="margin-top:18px; padding:20px;">
        <div class="panel-head" style="margin-bottom:15px;">
          <h3>⚙️ إدارة وتعديل كافة معطيات المحرك والمفاتيح</h3>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div class="field" style="margin:0;"><label style="font-size:12px;">Blog ID</label><input type="text" id="quick-blogId" value="${c.blogId || ''}" placeholder="معرف المدونة"></div>
            <div class="field" style="margin:0;"><label style="font-size:12px;">Gemini API Key</label><input type="password" id="quick-gemini" value="${c.geminiApiKey || ''}" placeholder="مفتاح جيرمي"></div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div class="field" style="margin:0;"><label style="font-size:12px;">Client ID</label><input type="text" id="quick-clientId" value="${c.clientId || ''}" placeholder="Google Client ID"></div>
            <div class="field" style="margin:0;"><label style="font-size:12px;">Client Secret</label><input type="password" id="quick-clientSecret" value="${c.clientSecret || ''}" placeholder="Google Client Secret"></div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div class="field" style="margin:0;"><label style="font-size:12px;">Refresh Token</label><input type="password" id="quick-refreshToken" value="${c.refreshToken || ''}" placeholder="OAuth2 Refresh Token"></div>
            <div class="field" style="margin:0;"><label style="font-size:12px;">ImgBB API Key</label><input type="password" id="quick-imgbb" value="${c.imgbbApiKey || ''}" placeholder="ImgBB API Key"></div>
          </div>
          <button type="button" class="btn btn-primary" id="save-quick-settings-btn" style="width: 100%; padding: 10px; margin-top: 5px; font-weight: bold;">💾 حفظ وتحديث المعطيات حياً</button>
        </div>
      </div>

      <div class="panel glass" style="margin-top:18px;">
        <div class="panel-head"><h3>أحدث المقالات</h3><button class="btn btn-sm btn-ghost" data-view="posts" onclick="App.navigate('posts')">عرض الكل</button></div>
        <div id="dash-recent">${UI.skeletonRows(4, 64)}</div>
      </div>`;

    document.getElementById('save-quick-settings-btn')?.addEventListener('click', async () => {
      const updatedSecrets = {
        blogId: document.getElementById('quick-blogId').value.trim(),
        clientId: document.getElementById('quick-clientId').value.trim(),
        clientSecret: document.getElementById('quick-clientSecret').value.trim(),
        refreshToken: document.getElementById('quick-refreshToken').value.trim(),
        imgbbApiKey: document.getElementById('quick-imgbb').value.trim(),
        geminiApiKey: document.getElementById('quick-gemini').value.trim(),
      };

      if (typeof Auth !== 'undefined') {
        if (!Auth.config) Auth.config = {};
        Object.assign(Auth.config, updatedSecrets);
      }

      try {
        UI.showLoading('جارِ حفظ وتثبيت البيانات...');
        
        if (typeof Auth !== 'undefined' && Auth.persistConfig) {
          await Auth.persistConfig();
        } else {
          localStorage.setItem('blogger_control_config', JSON.stringify(updatedSecrets));
        }

        UI.toast('تم تحديث كافة المعطيات وحفظ الجلسة بنجاح!', 'success');
        
        if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
          try { await Auth.getAccessToken(); } catch(e) {}
        }

        this.renderDashboard();
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally { UI.hideLoading(); }
    });

    try {
      const res = await Blogger.getPosts({ maxResults: 6 });
      const items = res.items || [];
      const live = items.filter((p) => p.status !== 'DRAFT').length;
      const projectsCount = (typeof Projects !== 'undefined' && Projects.list) ? Projects.list.length : 0;
      const hasToken = (typeof Auth !== 'undefined' && Auth.accessToken) ? 'متصل' : 'غير متصل';

      document.getElementById('dash-stats').innerHTML = `
        ${this._statCard('إجمالي المقالات', res.items ? (res.items.length + '+') : '0', '📄')}
        ${this._statCard('المشاريع', projectsCount, '🗂️')}
        ${this._statCard('المنشورة', live, '✅')}
        ${this._statCard('حالة الاتصال', hasToken, '🔌')}
      `;
      document.getElementById('dash-recent').innerHTML = items.map((p) => this._postRowHTML(p)).join('') || '<p class="muted">لا توجد مقالات بعد.</p>';
      this._bindPostRowActions(document.getElementById('dash-recent'));
    } catch (err) {
      const recentEl = document.getElementById('dash-recent');
      if(recentEl) recentEl.innerHTML = `<p class="muted">يرجى ملء معطيات الاتصال بالخلفية لفتح المزامنة التلقائية.</p>`;
    }
  },

  _statCard(label, value, glyph) {
    return `<div class="stat-card glass"><span class="glyph">${glyph}</span><span class="label">${label}</span><span class="value">${value}</span></div>`;
  },

  /* ================================================================ */
  /* Posts list + search                                                */
  /* ================================================================ */

  async renderPosts() {
    const el = document.getElementById('view-posts');
    if (!el) return;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>المقالات</h1><p>إدارة، تعديل، وحذف مقالات المدونة</p></div>
        <button class="btn btn-primary" onclick="App.navigate('newpost')">+ مقال جديد</button>
      </div>
      <div class="panel glass"><div id="posts-list">${UI.skeletonRows(6, 64)}</div>
      <div class="center mt-8"><button class="btn btn-ghost btn-sm hidden" id="load-more-btn">تحميل المزيد</button></div></div>`;

    try {
      const res = await Blogger.getPosts({ maxResults: 15 });
      this.state.posts = res.items || [];
      this.state.nextPageToken = res.nextPageToken || null;
      this._renderPostList(this.state.posts);
      const moreBtn = document.getElementById('load-more-btn');
      if (this.state.nextPageToken && moreBtn) {
        moreBtn.onclick = async () => {
          const more = await Blogger.getPosts({ maxResults: 15, pageToken: this.state.nextPageToken });
          this.state.posts = [...this.state.posts, ...(more.items || [])];
          this.state.nextPageToken = more.nextPageToken || null;
          this._renderPostList(this.state.posts);
          if (!this.state.nextPageToken) moreBtn.classList.add('hidden');
        };
      }
    } catch (err) {
      const listEl = document.getElementById('posts-list');
      if (listEl) listEl.innerHTML = `<p class="muted">${UI.escapeHTML(err.message)}</p>`;
    }
  },

  _renderPostList(items) {
    const list = document.getElementById('posts-list');
    if (!list) return;
    list.innerHTML = items.map((p) => this._postRowHTML(p)).join('') || '<p class="muted">لا توجد نتائج.</p>';
    this._bindPostRowActions(list);
  },

  _postRowHTML(post) {
    const statusTag = post.status === 'DRAFT' ? '<span class="tag draft">مسودة</span>'
      : post.status === 'SCHEDULED' ? '<span class="tag scheduled">مجدولة</span>'
      : '<span class="tag live">منشورة</span>';
    const thumb = post.images?.[0]?.url || '';
    return `
      <div class="post-row" data-id="${post.id}">
        ${thumb ? `<img class="thumb" src="${thumb}" loading="lazy">` : '<div class="thumb"></div>'}
        <div class="info"><b>${UI.escapeHTML(post.title || 'بدون عنوان')}</b><span>${UI.formatDate(post.published)}</span></div>
        ${statusTag}
        <div class="row-actions">
          <button class="icon-btn edit-btn" title="تعديل">✎</button>
          <button class="icon-btn del-btn" title="حذف">🗑</button>
        </div>
      </div>`;
  },

  _bindPostRowActions(container) {
    container.querySelectorAll('.post-row').forEach((row) => {
      const id = row.dataset.id;
      
      row.querySelector('.edit-btn')?.addEventListener('click', async (e) => { 
        e.stopPropagation(); 
        if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
          try { await Auth.getAccessToken(); } catch(err) { console.warn("حظر تهيئة التوكن:", err); }
        }
        this._openEditPost(id); 
      });

      row.querySelector('.del-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await UI.confirm({ title: 'حذف المقال', body: 'هل أنت متأكد من حذف هذا المقال؟ لا يمكن التراجع عن هذا الإجراء.' });
        if (!ok) return;
        try {
          UI.showLoading('جارِ الحذف...');
          if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
            try { await Auth.getAccessToken(); } catch(e) {}
          }
          await Blogger.deletePost(id);
          UI.toast('تم حذف المقال', 'success');
          row.remove();
        } catch (err) { 
          UI.toast(err.message || 'فشلت العملية، تأكد من الجلسة', 'error'); 
        } finally { UI.hideLoading(); }
      });
    });
  },

  async _openEditPost(id) {
    try {
      UI.showLoading('جارِ تحميل المقال وتأكيد الجلسة...');
      if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
        await Auth.getAccessToken();
      }
      const post = await Blogger.getPost(id);
      
      UI.openModal({
        title: 'تعديل المقال',
        body: `
          <div class="field"><label>العنوان</label><input type="text" id="e-title" value="${UI.escapeHTML(post.title)}"></div>
          <div class="field"><label>المحتوى (HTML)</label><textarea id="e-content" style="min-height:160px;">${UI.escapeHTML(post.content)}</textarea></div>
          <div class="field"><label>الوسوم (مفصولة بفواصل)</label><input type="text" id="e-labels" value="${(post.labels || []).join(', ')}"></div>
        `,
        actions: [
          { label: 'إلغاء', cls: 'btn-ghost' },
          {
            label: 'حفظ التغييرات', cls: 'btn-primary', close: true,
            onClick: async () => {
              try {
                UI.showLoading('جارِ الحفظ وتحديث التعديلات...');
                if (typeof Auth !== 'undefined' && Auth.getAccessToken) {
                  await Auth.getAccessToken();
                }

                await Blogger.updatePost(id, {
                  title: document.getElementById('e-title').value,
                  content: document.getElementById('e-content').value,
                  labels: document.getElementById('e-labels').value.split(',').map((s) => s.trim()).filter(Boolean),
                });
                
                UI.toast('تم تحديث المقال بنجاح', 'success');
                if (document.getElementById('view-posts').classList.contains('active')) {
                  this.renderPosts();
                } else {
                  this.renderDashboard();
                }
              } catch (err) { 
                UI.toast(err.message || 'خطأ أثناء الحفظ، تحقق من الجلسة', 'error'); 
              } finally { UI.hideLoading(); }
            },
          },
        ],
      });
    } catch (err) { 
      UI.toast(err.message || 'لا توجد جلسة مفتوحة أو انتهت صلاحية التوكن', 'error'); 
    } finally { UI.hideLoading(); }
  },

  /* ================================================================ */
  /* New-post wizard                                                    */
  /* ================================================================ */

  renderWizard() {
    this.state.wizardStep = 1;
    this.state.wizardData = { labels: [] };
    if (typeof Uploader !== 'undefined' && Uploader.reset) Uploader.reset();
    this._paintWizard();
  },

  _paintWizard() {
    const el = document.getElementById('view-newpost');
    if (!el) return;
    const s = this.state.wizardStep;
    el.innerHTML = `
      <div class="wizard">
        <div class="page-head"><div><h1>مقال جديد</h1><p id="wiz-step-indicator">الخطوة ${s} من 3</p></div></div>
        <div class="wizard-steps">
          ${[1, 2, 3].map((n) => `<div class="step ${n < s ? 'done' : n === s ? 'current' : ''}"><i></i></div>`).join('')}
        </div>
        <div class="panel glass" id="wizard-body"></div>
      </div>`;
    const body = document.getElementById('wizard-body');
    if (!body) return;
    if (s === 1) body.innerHTML = this._wizardStep1();
    if (s === 2) body.innerHTML = this._wizardStep2();
    if (s === 3) body.innerHTML = this._wizardStep3();
    this._bindWizardStep(s);
  },

  _wizardStep1() {
    const d = this.state.wizardData;
    return `
      <div class="field">
        <label>اسم التطبيق</label>
        <div style="display: flex; gap: 8px; width: 100%;">
          <input type="text" id="w-name" value="${d.name || ''}" placeholder="مثال: MT Manager" style="flex: 1;">
          <button type="button" class="btn btn-primary" id="w-gemini-btn" style="white-space: nowrap; font-weight: bold; background: #6366f1;">✨ إنشاء البيانات</button>
        </div>
      </div>
      <div class="field"><label>اسم المطور</label><input type="text" id="w-developer" value="${d.developer || ''}"></div>
      <div class="field"><label>الوصف</label><textarea id="w-description" rows="5">${d.description || ''}</textarea></div>
      <div class="field"><label>رابط الأيقونة</label><input type="url" id="w-icon" value="${d.icon || ''}" placeholder="https://..."></div>
      <div class="wizard-actions"><span></span><button class="btn btn-primary" id="w-next">التالي ←</button></div>`;
  },

  _wizardStep2() {
    const d = this.state.wizardData;
    return `
      <div class="field-row">
        <div class="field"><label>الإصدار</label><input type="text" id="w-version" value="${d.version || ''}"></div>
        <div class="field"><label>الحجم</label><input type="text" id="w-size" value="${d.size || ''}" placeholder="مثال: 24 MB"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>يتطلب أندرويد</label><input type="text" id="w-android" value="${d.android || ''}" placeholder="5.0+"></div>
        <div class="field"><label>آخر تحديث</label><input type="text" id="w-updatedAt" value="${d.updatedAt || ''}" placeholder="YYYY-MM-DD"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>عدد التحميلات</label><input type="text" id="w-downloads" value="${d.downloads || '10K+'}"></div>
        <div class="field"><label>الترخيص</label><input type="text" id="w-license" value="${d.license || 'مجاني'}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>رابط Google Play</label><input type="url" id="w-playStoreUrl" value="${d.playStoreUrl || ''}"></div>
        <div class="field"><label>رابط التحميل المباشر</label><input type="url" id="w-directUrl" value="${d.directUrl || ''}"></div>
      </div>
      <div class="field">
        <label>الرابط الدائم (Permalink)</label>
        <input type="text" id="w-permalink" value="${d.permalink || ''}" placeholder="my-app-download">
      </div>
      <div class="field">
        <label>التصنيفات / الوسوم</label>
        <div class="chip-select" id="w-labels-chips">
          ${['تطبيقات', 'ألعاب', 'أدوات', 'أندرويد', 'مجاني'].map((l) => `<span class="chip ${d.labels?.includes(l) ? 'active' : ''}" data-label="${l}">${l}</span>`).join('')}
        </div>
      </div>
      <div class="wizard-actions">
        <button class="btn btn-ghost" id="w-back">→ السابق</button>
        <button class="btn btn-primary" id="w-next">التالي ←</button>
      </div>`;
  },

  _wizardStep3() {
    return `
      <div class="dropzone" id="dropzone">
        <div style="font-size:28px;">📁</div>
        <p>اسحب الصور هنا أو اضغط للاختيار</p>
        <span class="muted" style="font-size:12px;">سيتم ضغط الصور تلقائياً قبل الرفع</span>
        <input type="file" id="file-input" accept="image/*" multiple class="hidden">
      </div>
      <div class="upload-grid" id="upload-grid"></div>
      <div class="field-row mt-8">
        <label class="gap-8" style="align-items:center;"><input type="checkbox" id="w-isDraft"> نشر كمسودة</label>
        <div class="field" style="margin:0;"><input type="text" id="w-publishAt" placeholder="جدولة: YYYY-MM-DDTHH:MM"></div>
      </div>
      <div class="wizard-actions">
        <button class="btn btn-ghost" id="w-back">→ السابق</button>
        <div class="gap-8">
          <button class="btn btn-ghost" id="w-generate">توليد صفحة التحميل</button>
          <button class="btn btn-primary" id="w-publish">نشر المقال</button>
        </div>
      </div>`;
  },

  _bindWizardStep(step) {
    if (step === 1) {
      document.getElementById('w-gemini-btn')?.addEventListener('click', async () => {
        const appName = document.getElementById('w-name').value.trim();
        let apiKey = '';
        
        // 1. محاولة جلب المفتاح بكافة الطرق الممكنة المخزنة في جهازك
        try {
          if (typeof Auth !== 'undefined' && Auth.config && Auth.config.geminiApiKey) {
            apiKey = Auth.config.geminiApiKey;
          }
          if (!apiKey) {
            const encryptedData = localStorage.getItem('blogger_control_config');
            if (encryptedData) {
              const parsed = JSON.parse(encryptedData);
              apiKey = parsed.geminiApiKey || '';
            }
          }
          if (!apiKey) {
            const fallback = JSON.parse(localStorage.getItem('b_config') || localStorage.getItem('app_secrets') || '{}');
            apiKey = fallback?.geminiApiKey || '';
          }
        } catch(e) { console.error(e); }

        // 2. التحقق من المدخلات والمفاتيح
        if (!appName) {
          UI.toast('يرجى إدخال اسم التطبيق أولاً!', 'error');
          return;
        }
        if (!apiKey) {
          UI.toast('خطأ: لم يتم العثور على مفتاح Gemini في الذاكرة المحلية!', 'error');
          return;
        }

        const btn = document.getElementById('w-gemini-btn');
        const originalText = btn.innerText;
        btn.innerText = '⏳ جاري الاتصال بـ Flash...';
        btn.disabled = true;

        try {
          // 3. الاتصال بموديل Flash الأحدث والمستقر
          const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `أنت مساعد وخبير سيو متخصص في تطبيقات أندرويد. قم باستخراج وإنشاء بيانات تطبيق "${appName}" بصيغة JSON كالتالي تماماً وبدون أي نصوص برمجية أخرى خارج القوسين: {"developer": "اسم المطور", "description": "وصف ومراجعة شاملة واحترافية جداً ومغرية للتحميل ومتوافقة تماماً مع شروط سيو جوجل للمقالات"، "version": "1.0", "size": "45MB", "android": "6.0+"}. اكتب الوصف باللغة العربية الفصحى.` }] }]
            })
          });

          // 4. فحص استجابة السيرفر بدقة
          if (!response.ok) {
            const errRes = await response.json().catch(() => ({}));
            const msg = errRes?.error?.message || `كود حالة السيرفر: ${response.status}`;
            throw new Error(`جوجل رفضت الطلب: ${msg}`);
          }

          const resData = await response.json();
          if (!resData.candidates || !resData.candidates[0]) {
            throw new Error('السيرفر لم يرجع أي بيانات (Candidates فارغة).');
          }

          let rawText = resData.candidates[0].content.parts[0].text;
          
          // تنظيف علامات القبس والنصوص الزائدة
          rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                           
          const cleanJson = JSON.parse(rawText);

          if (document.getElementById('w-developer')) document.getElementById('w-developer').value = cleanJson.developer || '';
          if (document.getElementById('w-description')) document.getElementById('w-description').value = cleanJson.description || '';
          
          this.state.wizardData.version = cleanJson.version || '1.0';
          this.state.wizardData.size = cleanJson.size || 'عبر الرابط';
          this.state.wizardData.android = cleanJson.android || '5.0+';
          this.state.wizardData.updatedAt = new Date().toISOString().split('T')[0];

          UI.toast('تم التوليد بنجاح عبر Gemini 1.5 Flash!', 'success');
        } catch (err) {
          console.error("خطأ التوليد الشامل:", err);
          // إظهار الخطأ الحقيقي صراحة لإلغاء الغموض
          UI.toast(`فشل التوليد الفعلي: ${err.message}`, 'error');
        } finally {
          btn.innerText = originalText;
          btn.disabled = false;
        }
      });
    }

    document.getElementById('w-next')?.addEventListener('click', () => this._collectStep(step, () => {
      this.state.wizardStep = step + 1;
      this._paintWizard();
    }));
    document.getElementById('w-back')?.addEventListener('click', () => {
      this._collectStep(step, () => {}, false);
      this.state.wizardStep = step - 1;
      this._paintWizard();
    });

    if (step === 2) {
      document.querySelectorAll('#w-labels-chips .chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          chip.classList.toggle('active');
          const label = chip.dataset.label;
          const d = this.state.wizardData;
          d.labels = d.labels || [];
          if (chip.classList.contains('active')) d.labels.push(label);
          else d.labels = d.labels.filter((l) => l !== label);
        });
      });
    }

    if (step === 3 && typeof Uploader !== 'undefined' && Uploader.init) {
      Uploader.init(document.getElementById('dropzone'), document.getElementById('upload-grid'), document.getElementById('file-input'));
      document.getElementById('w-generate')?.addEventListener('click', () => this._collectStep(3, () => this._previewGenerated()));
      document.getElementById('w-publish')?.addEventListener('click', () => this._collectStep(3, () => this._submitPost()));
    }
  },

  _collectStep(step, cb, validate = true) {
    const d = this.state.wizardData;
    
    if (step === 1) {
      d.name = document.getElementById('w-name').value.trim();
      d.developer = document.getElementById('w-developer').value.trim();
      d.description = document.getElementById('w-description').value.trim();
      d.icon = document.getElementById('w-icon').value.trim();
      
      if (validate && !d.name) {
        UI.toast('يرجى إدخال اسم التطبيق على الأقل!', 'error');
        return;
      }
    }
    if (step === 2) {
      d.version = document.getElementById('w-version').value.trim();
      d.size = document.getElementById('w-size').value.trim();
      d.android = document.getElementById('w-android').value.trim();
      d.updatedAt = document.getElementById('w-updatedAt').value.trim();
      d.downloads = document.getElementById('w-downloads').value.trim();
      d.license = document.getElementById('w-license').value.trim();
      d.playStoreUrl = document.getElementById('w-playStoreUrl').value.trim();
      d.directUrl = document.getElementById('w-directUrl').value.trim();
      d.permalink = document.getElementById('w-permalink').value.trim();
    }
    if (step === 3) {
      d.isDraft = document.getElementById('w-isDraft').checked;
      d.publishAt = document.getElementById('w-publishAt').value || null;
    }
    cb();
  },

  _previewGenerated() {
    if (typeof Generator === 'undefined' || typeof Uploader === 'undefined') return;
    const html = Generator.build(this.state.wizardData, Uploader.doneImages());
    UI.openModal({
      title: 'معاينة صفحة التحميل',
      body: `<textarea readonly style="width:100%;min-height:260px;font-family:monospace;font-size:11.5px;" dir="ltr">${UI.escapeHTML(html)}</textarea>`,
      actions: [
        { label: 'إغلاق', cls: 'btn-ghost' },
        { label: 'نسخ الكود', cls: 'btn-primary', close: false, onClick: () => { navigator.clipboard.writeText(html); UI.toast('تم نسخ كود الصفحة', 'success'); } },
      ],
    });
  },

  async _submitPost() {
    const d = this.state.wizardData;
    if (!d.name) { UI.toast('أكمل الخطوة الأولى أولاً', 'error'); return; }
    if (typeof Generator === 'undefined' || typeof Uploader === 'undefined') return;
    const html = Generator.build(d, Uploader.doneImages());
    try {
      UI.showLoading('جارِ نشر المقال...');
      await Blogger.publishPost({
        title: d.name,
        content: html,
        labels: d.labels || [],
        isDraft: !!d.isDraft,
        publishAt: d.publishAt,
        permalink: d.permalink || null,
      });
      UI.toast(d.isDraft ? 'تم حفظ المقال كمسودة' : 'تم نشر المقال بنجاح', 'success');
      this.navigate('posts');
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      UI.hideLoading();
    }
  },

  /* ================================================================ */
  /* Projects                                                           */
  /* ================================================================ */

  async renderProjects() {
    const el = document.getElementById('view-projects');
    if (!el) return;
    el.innerHTML = `
      <div class="page-head">
        <div><h1>المشاريع</h1><p>إدارة جميع تطبيقاتك من مكان واحد</p></div>
        <button class="btn btn-primary" id="add-project-btn">+ مشروع جديد</button>
      </div>
      <div class="grid grid-3" id="projects-grid"></div>`;
    document.getElementById('add-project-btn')?.addEventListener('click', () => this._projectModal());
    this._renderProjectsGrid();
  },

  _renderProjectsGrid() {
    const grid = document.getElementById('projects-grid');
    if (!grid || typeof Projects === 'undefined') return;
    grid.innerHTML = Projects.list.map((p) => `
      <div class="stat-card glass" data-id="${p.id}">
        <div class="gap-8" style="align-items:center;">
          ${p.icon ? `<img src="${p.icon}" style="width:38px;height:38px;border-radius:10px;object-fit:cover;">` : '<div class="ph" style="width:38px;height:38px;border-radius:10px;background:var(--glass-strong);"></div>'}
          <div><b>${UI.escapeHTML(p.name)}</b><div class="muted" style="font-size:11.5px;">${UI.escapeHTML(p.package || '')}</div></div>
        </div>
        <div class="gap-8 mt-8">
          <span class="tag ${p.status === 'active' ? 'live' : 'draft'}">${p.status}</span>
          <span class="tag">${p.blogId ? 'Blog مرتبط' : 'بدون Blog'}</span>
        </div>
        <div class="gap-8 mt-8">
          <button class="btn btn-sm btn-ghost switch-btn">تفعيل</button>
          <button class="btn btn-sm btn-ghost edit-btn">تعديل</button>
          <button class="btn btn-sm btn-danger del-btn">حذف</button>
        </div>
      </div>`).join('') || '<p class="muted">لا توجد مشاريع بعد.</p>';

    grid.querySelectorAll('[data-id]').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('.switch-btn')?.addEventListener('click', () => {
        Projects.setCurrent(id);
        this._renderProjectSwitch();
        UI.toast('تم تفعيل المشروع', 'success');
      });
      card.querySelector('.edit-btn')?.addEventListener('click', () => this._projectModal(Projects.find(id)));
      card.querySelector('.del-btn')?.addEventListener('click', async () => {
        const ok = await UI.confirm({ title: 'حذف المشروع', body: 'سيتم حذف المشروع نهائياً.' });
        if (!ok) return;
        try { await Projects.remove(id); this._renderProjectsGrid(); this._renderProjectSwitch(); UI.toast('تم الحذف', 'success'); }
        catch (err) { UI.toast(err.message, 'error'); }
      });
    });
  },

  _projectModal(project = null) {
    UI.openModal({
      title: project ? 'تعديل المشروع' : 'مشروع جديد',
      body: `
        <div class="field"><label>الاسم</label><input type="text" id="p-name" value="${project?.name || ''}"></div>
        <div class="field-row">
          <div class="field"><label>Package</label><input type="text" id="p-package" value="${project?.package || ''}"></div>
          <div class="field"><label>Blog ID</label><input type="text" id="p-blogId" value="${project?.blogId || ''}"></div>
        </div>
        <div class="field"><label>رابط الأيقونة</label><input type="url" id="p-icon" value="${project?.icon || ''}"></div>
        <div class="field"><label>الحالة</label>
          <select id="p-status"><option value="active" ${project?.status === 'active' ? 'selected' : ''}>نشط</option><option value="paused" ${project?.status === 'paused' ? 'selected' : ''}>متوقف</option></select>
        </div>`,
      actions: [
        { label: 'إلغاء', cls: 'btn-ghost' },
        {
          label: 'حفظ', cls: 'btn-primary', close: true,
          onClick: async () => {
            const data = {
              name: document.getElementById('p-name').value.trim(),
              package: document.getElementById('p-package').value.trim(),
              blogId: document.getElementById('p-blogId').value.trim(),
              icon: document.getElementById('p-icon').value.trim(),
              status: document.getElementById('p-status').value,
            };
            try {
              if (project) await Projects.update(project.id, data);
              else await Projects.create(data);
              this._renderProjectsGrid();
              this._renderProjectSwitch();
              UI.toast('تم الحفظ', 'success');
            } catch (err) { UI.toast(err.message, 'error'); }
          },
        },
      ],
    });
  },

  _renderProjectSwitch() {
    const el = document.getElementById('current-project');
    if (!el || typeof Projects === 'undefined') return;
    const p = Projects.current;
    el.innerHTML = p
      ? `${p.icon ? `<img src="${p.icon}">` : '<div class="ph"></div>'}<div class="meta"><b>${UI.escapeHTML(p.name)}</b><span>${p.status === 'active' ? 'نشط' : 'متوقف'}</span></div>`
      : `<div class="ph"></div><div class="meta"><b>لا يوجد مشروع</b><span>أضف مشروعاً</span></div>`;
  },

  /* ================================================================ */
  /* Settings                                                           */
  /* ================================================================ */

  renderSettings() {
    const el = document.getElementById('view-settings');
    if (!el) return;
    const c = (typeof Auth !== 'undefined' && Auth.config) ? Auth.config : {};
    el.innerHTML = `
      <div class="page-head"><div><h1>الإعدادات</h1><p>بيانات الاتصال — محفوظة داخل متصفحك</p></div></div>
      <div class="panel glass">
        <div class="settings-section">
          <h4>Blogger</h4>
          <div class="field"><label>Blog ID</label><input type="text" id="cfg-blogId" value="${c.blogId || ''}"></div>
        </div>
        <div class="settings-section">
          <h4>Google OAuth</h4>
          <div class="field"><label>Client ID</label><input type="text" id="cfg-clientId" value="${c.clientId || ''}"></div>
          <div class="field"><label>Client Secret</label><input type="password" id="cfg-clientSecret" value="${c.clientSecret || ''}"></div>
          <div class="field"><label>Refresh Token</label><input type="password" id="cfg-refreshToken" value="${c.refreshToken || ''}"></div>
        </div>
        <div class="settings-section">
          <h4>مفاتيح خارجية</h4>
          <div class="field"><label>ImgBB API Key</label><input type="password" id="cfg-imgbb" value="${c.imgbbApiKey || ''}"></div>
          <div class="field"><label>Gemini API Key</label><input type="password" id="cfg-gemini" value="${c.geminiApiKey || ''}"></div>
        </div>
        <button class="btn btn-primary" id="save-settings-btn">حفظ الإعدادات في المتصفح</button>
      </div>`;

    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
      if (typeof Auth === 'undefined' || !Auth.config) return;
      Object.assign(Auth.config, {
        blogId: document.getElementById('cfg-blogId').value.trim(),
        clientId: document.getElementById('cfg-clientId').value.trim(),
        clientSecret: document.getElementById('cfg-clientSecret').value.trim(),
        refreshToken: document.getElementById('cfg-refreshToken').value.trim(),
        imgbbApiKey: document.getElementById('cfg-imgbb').value.trim(),
        geminiApiKey: document.getElementById('cfg-gemini').value.trim(),
      });
      try {
        UI.showLoading('جارِ الحفظ...');
        await Auth.persistConfig();
        UI.toast('تم تحديث الإعدادات بنجاح', 'success');
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally { UI.hideLoading(); }
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
