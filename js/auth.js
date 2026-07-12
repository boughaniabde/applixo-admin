/**
 * auth.js — localStorage edition
 * ------------------------------------------------------------------
 * Handles:
 *
 *  1. Reading/writing the app's secrets (Blog ID, OAuth client id/
 *     secret, refresh token, ImgBB key, Gemini key) to a single
 *     localStorage key on THIS browser/device only.
 *
 *  2. Google OAuth access-token retrieval via the refresh_token grant,
 *     plus the "Refresh Token expired" recovery dialog: Generate
 *     OAuth Link -> paste Authorization Code -> mint a new
 *     refresh_token -> save it -> retry the original request
 *     automatically, without reloading the page.
 *
 * SECURITY NOTE — read this before relying on it:
 * There is NO encryption and NO password here. Secrets are stored as
 * plain JSON in this browser's localStorage. That is an intentional,
 * honest simplification — an earlier version of this file encrypted
 * the same data with AES-256-GCM, but derived the key from an empty
 * password, which protected against nothing while looking like it
 * protected something. This version doesn't pretend: the only thing
 * keeping these secrets safe is that they never leave your own
 * browser profile on your own device. Anyone with access to this
 * browser (or to devtools while the page is open) can read every key
 * in plain text. Don't use a shared/public computer for this, and
 * don't expect this to survive clearing browser data — it will wipe
 * your config along with it.
 */

class AuthController {
  constructor() {
    this.STORAGE_KEY = 'bc_config'; // the ONE source of truth — do not add more keys
    this.config = null;
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  /* ================================================================ */
  /* Bootstrapping                                                      */
  /* ================================================================ */

  /** True once secrets exist in localStorage (first-run setup has happened). */
  isBootstrapped() {
    return !!localStorage.getItem(this.STORAGE_KEY);
  }

  isUnlocked() {
    return !!this.config;
  }

  /** Loads config from localStorage into memory. There is no password gate. */
  async unlock() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) throw new Error('لا توجد إعدادات محفوظة بعد — أكمل الإعداد أولاً.');
    this.config = JSON.parse(raw);
    return this.config;
  }

  /**
   * First-run path: saves the given secrets object as-is. Required
   * fields are validated by the caller (app.js) BEFORE calling this —
   * this method does not invent placeholder/demo values for missing
   * fields, since silently saving fake credentials just turns a clear
   * "please fill this in" moment into a confusing API failure later.
   */
  async createConfig(secrets) {
    this.config = { ...secrets };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
    return this.config;
  }

  /** Persists whatever is currently in `this.config` (call after mutating it). */
  async persistConfig() {
    if (!this.config) throw new Error('لا توجد إعدادات محمّلة في الذاكرة.');
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
  }

  /** Clears secrets from memory only — localStorage keeps them until you reset explicitly. */
  lock() {
    this.config = null;
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  /** Wipes everything, including localStorage — irreversible. */
  resetAll() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.lock();
  }

  /* ================================================================ */
  /* Google OAuth — access token + refresh-token recovery               */
  /* ================================================================ */

  /**
   * IMPORTANT — read before wiring this up:
   * This flow sends `client_secret` from the browser to Google's token
   * endpoint. That is only safe because Google's own OAuth docs treat
   * the secret for "Desktop app" (installed application) credentials
   * as a non-confidential identifier, not an auth factor — Google
   * knows installed/native apps can't keep it hidden, so it doesn't
   * rely on it for security the way it would for a confidential
   * "Web application" client. Practical rule for this project:
   *   - OAuth client type in Google Cloud Console MUST be "Desktop app".
   *   - NEVER paste credentials from a "Web application" client here —
   *     those secrets are meant to stay server-side, and this app has
   *     no server. Using one here would be a genuine credential leak,
   *     not a documented exception.
   */
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
    if (!this.config?.clientId || !this.config?.refreshToken) {
      throw new Error('أكمل بيانات Google OAuth (Client ID / Refresh Token) من الإعدادات أولاً.');
    }

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

const Auth = new AuthController();
