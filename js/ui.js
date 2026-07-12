/**
 * ui.js
 * Presentation-layer helpers shared across the whole dashboard:
 * toasts, modal dialogs, the loading overlay, theme switching,
 * the mobile sidebar toggle, and small generic utilities
 * (escapeHTML, debounce, formatBytes...).
 *
 * Everything here is intentionally framework-free and side-effect
 * light: other modules import the `UI` singleton and call its methods.
 */

class UIController {
  constructor() {
    this.toastStack = null;
    this.overlay = null;
    this.modalBackdrop = null;
  }

  /** Wires DOM references once index.html has been parsed. */
  init() {
    this.toastStack = document.getElementById('toast-stack');
    this.overlay = document.getElementById('loading-overlay');
    this.modalBackdrop = document.getElementById('modal-backdrop');

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('bc_theme') || 'dark';
    this.applyTheme(savedTheme);
    themeBtn?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      this.applyTheme(current === 'light' ? 'dark' : 'light');
    });

    // Mobile sidebar toggle
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // Close modal on backdrop click
    this.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bc_theme', theme);
  }

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration ms
   */
  toast(message, type = 'info', duration = 3800) {
    if (!this.toastStack) return;
    const el = document.createElement('div');
    el.className = `toast ${type} glass`;
    el.innerHTML = `<span class="dot"></span><span>${this.escapeHTML(message)}</span>`;
    this.toastStack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'all .25s ease';
      setTimeout(() => el.remove(), 260);
    }, duration);
  }

  /* ---------------------------------------------------------------- */
  /* Loading overlay                                                   */
  /* ---------------------------------------------------------------- */

  showLoading(message = 'جارِ التحميل...') {
    if (!this.overlay) return;
    this.overlay.querySelector('.loading-text').textContent = message;
    this.overlay.classList.add('show');
  }

  hideLoading() {
    this.overlay?.classList.remove('show');
  }

  /* ---------------------------------------------------------------- */
  /* Modal dialogs                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Renders an ad-hoc modal.
   * @param {{title:string, body:string, actions:Array<{label:string,cls:string,onClick:Function,close?:boolean}>}} opts
   */
  openModal({ title, body, actions = [] }) {
    if (!this.modalBackdrop) return;
    const modal = this.modalBackdrop.querySelector('.modal');
    modal.innerHTML = `
      <h3>${this.escapeHTML(title)}</h3>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"></div>
    `;
    const actionsEl = modal.querySelector('.modal-actions');
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.cls || 'btn-ghost'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        a.onClick?.();
        if (a.close !== false) this.closeModal();
      });
      actionsEl.appendChild(btn);
    });
    this.modalBackdrop.classList.add('open');
    return modal;
  }

  closeModal() {
    this.modalBackdrop?.classList.remove('open');
  }

  /** Convenience wrapper for a yes/no confirmation before destructive actions. */
  confirm({ title, body, confirmLabel = 'تأكيد', danger = true }) {
    return new Promise((resolve) => {
      this.openModal({
        title,
        body: `<p>${body}</p>`,
        actions: [
          { label: 'إلغاء', cls: 'btn-ghost', onClick: () => resolve(false) },
          { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) },
        ],
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Skeleton loading                                                   */
  /* ---------------------------------------------------------------- */

  skeletonRows(count = 4, height = 64) {
    return Array.from({ length: count })
      .map(() => `<div class="skeleton" style="height:${height}px;border-radius:14px;margin-bottom:10px;"></div>`)
      .join('');
  }

  /* ---------------------------------------------------------------- */
  /* Generic utils                                                     */
  /* ---------------------------------------------------------------- */

  escapeHTML(str = '') {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  formatBytes(bytes = 0) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  setConnectionStatus(state) {
    // state: 'ok' | 'warn' | 'err'
    const orb = document.getElementById('conn-orb');
    if (!orb) return;
    orb.classList.remove('ok', 'warn', 'err');
    orb.classList.add(state);
    orb.title = {
      ok: 'متصل بـ Blogger API',
      warn: 'يحاول الاتصال...',
      err: 'غير متصل — يتطلب إعادة تفويض',
    }[state] || '';
  }
}

const UI = new UIController();
