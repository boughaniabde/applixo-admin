/**
 * store.js — localStorage edition
 * ------------------------------------------------------------------
 *   Templates  — data/templates/*.json, static read-only files
 *                shipped with the app (app vs game download-page
 *                wording). No write path needed, so a plain fetch()
 *                is enough — no GitHub involved.
 *   Drafts     — autosaved wizard progress, kept in localStorage
 *                under `bc_draft_<id>`.
 *   Backups    — a snapshot written automatically before overwriting
 *                or deleting a post/project, kept in localStorage
 *                under `bc_backup_<kind>_<id>_<timestamp>`.
 *
 * localStorage has a real size ceiling (~5-10MB depending on browser),
 * and backups accumulate over time with no external cleanup process
 * like git history has. So backups are pruned to the most recent 20 —
 * older ones are silently dropped. If you need backups to survive
 * longer than that, export them from the Projects page occasionally.
 */

class StoreController {
  constructor() {
    this.MAX_BACKUPS = 20;
  }

  /* ================================================================ */
  /* Templates                                                          */
  /* ================================================================ */

  async listTemplates() {
    const names = ['app-download.json', 'game-download.json'];
    const templates = [];
    for (const name of names) {
      try {
        const res = await fetch(`data/templates/${name}`, { cache: 'no-store' });
        if (res.ok) templates.push(await res.json());
      } catch { /* skip unreadable template */ }
    }
    return templates.length ? templates : [{ id: 'default', label: 'افتراضي', fields: {}, defaults: {} }];
  }

  /* ================================================================ */
  /* Drafts                                                             */
  /* ================================================================ */

  async saveDraft(id, data) {
    const payload = { id, updatedAt: new Date().toISOString(), data };
    localStorage.setItem(`bc_draft_${id}`, JSON.stringify(payload));
    return payload;
  }

  async listDrafts() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('bc_draft_')) continue;
      try { drafts.push(JSON.parse(localStorage.getItem(key))); } catch { /* skip corrupt entry */ }
    }
    return drafts.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  async deleteDraft(id) {
    localStorage.removeItem(`bc_draft_${id}`);
  }

  /* ================================================================ */
  /* Backups                                                            */
  /* ================================================================ */

  /**
   * @param {'post'|'project'} kind
   * @param {string} id the post or project id being changed
   * @param {object} previousState the full state before the change
   */
  snapshot(kind, id, previousState) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `bc_backup_${kind}_${id}_${stamp}`;
    try {
      localStorage.setItem(key, JSON.stringify({ kind, id, at: new Date().toISOString(), data: previousState }));
      this._pruneBackups();
    } catch (err) {
      // Best-effort — a full quota or serialization error should never block the actual save/delete.
      console.warn('Backup failed:', err.message);
    }
  }

  listBackups() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('bc_backup_')) continue;
      try { backups.push({ key, ...JSON.parse(localStorage.getItem(key)) }); } catch { /* skip corrupt entry */ }
    }
    return backups.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }

  readBackup(key) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  _pruneBackups() {
    const all = this.listBackups();
    if (all.length <= this.MAX_BACKUPS) return;
    all.slice(this.MAX_BACKUPS).forEach((b) => localStorage.removeItem(b.key));
  }
}

const Store = new StoreController();
