/**
 * auth.js (LocalStorage Edition - Passwordless Fix)
 * ------------------------------------------------------------------
 * Handles everything related to secrets and identity:
 * Fixed to allow blank passwords for absolute passwordless local auto-boot.
 */

class AuthController {
  constructor() {
    this.config = null;         // decrypted secrets, memory-only
    this.password = "";         // default to empty string for passwordless bypass
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  /* ================================================================ */
  /* Crypto primitives                                                */
  /* ================================================================ */

  async _deriveKey(password, saltBytes) {
    const enc = new TextEncoder();
    // Use fallback string if password is empty to prevent crypto failures
    const pwdString = password || "boughani_default_salt_secure_bypass_key";
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pwdString), 'PBKDF2', false, ['deriveKey']);
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
  /* LocalStorage Bootstrapping & Unlocking                           */
  /* ================================================================ */

  isUnlocked() {
    return !!this.config;
  }

  isBootstrapped() {
    return !!localStorage.getItem('blogger_control_config');
  }

  async unlock(password) {
    const encryptedData = localStorage.getItem('blogger_control_config');
    if (!encryptedData) throw new Error('لم يتم العثور على أي إعدادات مخزنة — أنشئ الإعدادات أولاً.');
    
    const payload = JSON.parse(encryptedData);
    // Try decrypting with given password or fallback empty string
    const targetPassword = typeof password === 'string' ? password : "";
    const config = await this.decryptObject(payload, targetPassword);
    this.config = config;
    this.password = targetPassword;
    return config;
  }

  async createConfig(secrets, password) {
    const targetPassword = typeof password === 'string' ? password : "";
    const payload = await this.encryptObject(secrets, targetPassword);
    localStorage.setItem('blogger_control_config', JSON.stringify(payload));
    this.config = secrets;
    this.password = targetPassword;
    return payload;
  }

  /** FIXED: Removed the strict check that crashed on empty string password */
  async persistConfig() {
    if (!this.config) throw new Error('لا توجد جلسة مفتوحة للبيانات.');
    const targetPassword = typeof this.password === 'string' ? this.password : "";
    const payload = await this.encryptObject(this.config, targetPassword);
    localStorage.setItem('blogger_control_config', JSON.stringify(payload));
  }

  lock() {
    this.config = null;
    this.password = "";
    this.accessToken = null;
    this.accessTokenExpiry = 0;
  }

  /* ================================================================ */
  /* Google OAuth — access token + refresh-token recovery             */
  /* ================================================================ */

  get oauthScopes() {
    return 'https://www.googleapis.com/auth/blogger';
  }

  buildAuthUrl() {
    const { clientId } = this.config;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob:auto',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: this.oauthScopes,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

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

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) return this.accessToken;

    if (!this.config) {
      // Auto restore config from localStorage if available to bypass session dropouts
      const rawData = localStorage.getItem('blogger_control_config');
      if (rawData) {
        try { await this.unlock(""); } catch(e) { throw new Error('لم يتم تهيئة الجلسة بشكل صحيح.'); }
      } else {
        throw new Error('لم يتم العثور على إعدادات اتصال نشطة.');
      }
    }

    const { clientId, clientSecret, refreshToken } = this.config;
    if (!refreshToken) return this._recoverExpiredToken();

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

  _recoverExpiredToken() {
    return new Promise((resolve, reject) => {
      const authUrl = this.buildAuthUrl();
      const modal = UI.openModal({
        title: 'ربط الحساب بـ Blogger API',
        body: `
          <p>تحتاج اللوحة إلى ربطها بحساب Google الخاص بمدونتك. اضغط على الرابط أدناه للحصول على رمز التفويض، ثم الصقه هنا لتفعيل الاتصال.</p>
          <a href="${authUrl}" target="_blank" rel="noopener" class="btn btn-ghost" style="width:100%;margin-bottom:12px;display:block;text-align:center;">🔗 Generate OAuth Link</a>
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
      const inputEl = document.getElementById('oauth-code-input');
      if (inputEl) inputEl.focus();
    });
  }
}

const Auth = new AuthController();
