/**
 * auth.js
 * ------------------------------------------------------------------
 * Handles everything related to secrets and identity:
 *
 *  1. AES-256-GCM encryption/decryption of `data/config.enc`
 *     (Blog ID, OAuth client id/secret, refresh token, ImgBB key,
 *     Gemini key, GitHub token) using a password the user types once
 *     per session. The password itself is never stored anywhere.
 *
 *  2. Google OAuth access-token retrieval via the refresh_token grant,
 *     plus the "Refresh Token expired" recovery dialog described in
 *     the brief (Generate OAuth Link -> paste Authorization Code ->
 *     silently mint a new refresh_token -> update config.enc -> retry
 *     the original request automatically).
 *
 *  3. A thin GitHub Contents API client. IMPORTANT: GitHub Pages is a
 *     100% static host — it cannot write files to disk. So the only
 *     way this dashboard can persist projects.json / config.enc back
 *     into your repo is by committing them through the GitHub REST
 *     API using a Personal Access Token (fine-grained, "Contents:
 *     read & write" only). That token is itself stored encrypted
 *     inside config.enc once you've bootstrapped it (see README).
 *
 * SECURITY NOTE (please read the README section too): anything that
 * runs in the browser can, in principle, be inspected by whoever has
 * the page open and the password. AES-256-GCM here protects the
 * secrets at rest in your git history / on disk, and behind a
 * password screen for casual access — it is NOT equivalent to a
 * server-side secret store. Use a scoped, low-privilege GitHub token
 * and Google OAuth client, and treat this dashboard as a personal
 * tool, not a multi-user admin panel.
 */

class AuthController {
  constructor() {
    this.config = null;         // decrypted secrets, memory-only
    this.password = null;       // memory-only, cleared on lock/reload
    this.accessToken = null;
    this.accessTokenExpiry = 0;
    this.configSha = null;      // GitHub blob sha of config.enc, for updates
  }

  /* ================================================================ */
  /* Crypto primitives                                                  */
  /* ================================================================ */

  async _deriveKey(password, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  _bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  _b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async encryptObject(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._deriveKey(password, salt);
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return {
      v: 1,
      salt: this._bufToB64(salt),
      iv: this._bufToB64(iv),
      data: this._bufToB64(cipherBuf),
    };
  }

  async decryptObject(payload, password) {
    const salt = this._b64ToBuf(payload.salt);
    const iv = this._b64ToBuf(payload.iv);
    const key = await this._deriveKey(password, salt);
    const cipherBuf = this._b64ToBuf(payload.data);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  /* ================================================================ */
  /* Bootstrapping / unlocking config.enc                               */
  /* ================================================================ */

  /** True once a config.enc has been loaded & decrypted this session. */
  isUnlocked() {
    return !!this.config;
  }

  /**
   * Attempts to fetch data/config.enc and decrypt it with the given
   * password. Throws on wrong password / missing file.
   */
  async unlock(password) {
    const res = await fetch('data/config.enc', { cache: 'no-store' });
    if (!res.ok) throw new Error('لم يتم العثور على config.enc — أنشئ الإعدادات أولاً.');
    const payload = await res.json();
    const config = await this.decryptObject(payload, password); // throws if wrong password
    this.config = config;
    this.password = password;
    return config;
  }

  /**
   * First-run path: no config.enc exists yet. Encrypts the given
   * secrets object with a brand-new password chosen by the user and
   * tries to commit it via the GitHub API (needs a bootstrap token
   * pasted once). If no GitHub token is supplied yet, offers a
   * manual-download fallback instead (see README "أول تشغيل").
   */
  async createConfig(secrets, password) {
    const payload = await this.encryptObject(secrets, password);
    this.config = secrets;
    this.password = password;
    return payload; // caller decides: commit via GitHub, or downloadJSON()
  }

  /** Re-encrypts current in-memory config and pushes it to GitHub. */
  async persistConfig() {
    if (!this.config || !this.password) throw new Error('لا توجد جلسة مفتوحة.');
    const payload = await this.encryptObject(this.config, this.password);
    await GitHub.putFile(
      'data/config.enc',
      JSON.stringify(payload, null, 2),
      'chore: update config.enc via dashboard',
    );
  }

  lock() {
    this.config = null;
    this.password = null;
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ================================================================ */
  /* Google OAuth — access token + refresh-token recovery               */
  /* ================================================================ */

  get oauthScopes() {
    return 'https://www.googleapis.com/auth/blogger';
  }

  /** Builds the consent-screen URL for the "Generate OAuth Link" button. */
  buildAuthUrl() {
    const { clientId } = this.config;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob:auto', // out-of-band: shows the code on Google's page for copy/paste
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: this.oauthScopes,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Exchanges a fresh authorization code for a brand-new refresh_token. */
  async exchangeAuthCode(code) {
    const { clientId, clientSecret } = this.config;
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob:auto',
      grant_type: 'authorization_code',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || 'فشل تبادل رمز التفويض.');
    this.config.refreshToken = data.refresh_token || this.config.refreshToken;
    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
    await this.persistConfig();
    return data;
  }

  /**
   * Returns a valid access token, refreshing it if expired. On
   * invalid_grant / expired_refresh_token it opens the recovery
   * dialog and returns a promise that resolves once the user has
   * pasted a new authorization code and the retry succeeds.
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) return this.accessToken;

    const { clientId, clientSecret, refreshToken } = this.config;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    let res, data;
    try {
      res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      data = await res.json();
    } catch (networkErr) {
      UI.setConnectionStatus('err');
      throw networkErr;
    }

    if (!res.ok) {
      const code = data.error;
      if (code === 'invalid_grant') {
        UI.setConnectionStatus('err');
        return this._recoverExpiredToken();
      }
      throw new Error(data.error_description || code || 'فشل تجديد رمز الوصول.');
    }

    this.accessToken = data.access_token;
    this.accessTokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
    UI.setConnectionStatus('ok');
    return this.accessToken;
  }

  /** Shows the "Refresh Token expired" dialog described in the brief. */
  _recoverExpiredToken() {
    return new Promise((resolve, reject) => {
      const authUrl = this.buildAuthUrl();
      const modal = UI.openModal({
        title: 'انتهت صلاحية رمز التحديث (Refresh Token)',
        body: `
          <p>يبدو أن الاتصال بـ Blogger API قد انقطع. اضغط على الزر أدناه لفتح صفحة Google والحصول على رمز تفويض جديد، ثم الصقه هنا لإعادة الاتصال تلقائياً — بدون إعادة تحميل الصفحة.</p>
          <a href="${authUrl}" target="_blank" rel="noopener" class="btn btn-ghost" style="width:100%;margin-bottom:12px;">🔗 Generate OAuth Link</a>
          <div class="field"><label>Authorization Code</label><input type="text" id="oauth-code-input" placeholder="الصق الرمز هنا" /></div>
        `,
        actions: [
          { label: 'إلغاء', cls: 'btn-ghost', onClick: () => reject(new Error('cancelled')) },
          {
            label: 'إعادة الاتصال',
            cls: 'btn-primary',
            close: false,
            onClick: async () => {
              const input = document.getElementById('oauth-code-input');
              const code = input?.value.trim();
              if (!code) { UI.toast('أدخل رمز التفويض أولاً', 'error'); return; }
              try {
                UI.showLoading('جارِ إصدار رمز جديد...');
                await this.exchangeAuthCode(code);
                UI.setConnectionStatus('ok');
                UI.toast('تم تجديد الاتصال بنجاح', 'success');
                UI.closeModal();
                resolve(this.accessToken);
              } catch (err) {
                UI.toast(err.message, 'error');
              } finally {
                UI.hideLoading();
              }
            },
          },
        ],
      });
      modal.querySelector('#oauth-code-input')?.focus();
    });
  }
}

/**
 * Minimal GitHub Contents API client used to persist projects.json
 * and config.enc back into the repository that serves this GitHub
 * Pages site (since the site itself cannot write to disk).
 */
class GitHubClient {
  constructor() {
    this._shaCache = new Map();
  }

  get _base() {
    const { githubOwner, githubRepo } = Auth.config || {};
    return `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents`;
  }

  get _headers() {
    return {
      Authorization: `Bearer ${Auth.config.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async getFile(path) {
    const res = await fetch(`${this._base}/${path}?ref=${Auth.config.githubBranch || 'main'}`, { headers: this._headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub: تعذّرت قراءة ${path}`);
    const json = await res.json();
    this._shaCache.set(path, json.sha);
    const content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
    return content;
  }

  async putFile(path, content, message) {
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: Auth.config.githubBranch || 'main',
    };
    if (this._shaCache.has(path)) body.sha = this._shaCache.get(path);
    const res = await fetch(`${this._base}/${path}`, {
      method: 'PUT',
      headers: this._headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub: تعذّر حفظ ${path}`);
    }
    const json = await res.json();
    this._shaCache.set(path, json.content.sha);
    return json;
  }
}

const Auth = new AuthController();
const GitHub = new GitHubClient();
