/**
 * projects.js
 * Manages the multi-project registry described in the brief. Because
 * GitHub Pages cannot write to its own filesystem, "saving" a project
 * means committing an updated data/projects.json back to the repo via
 * GitHub.putFile() (see auth.js). A local in-memory cache keeps the
 * UI instant; every mutation re-commits the whole file (it's small).
 */

class ProjectsController {
  constructor() {
    this.list = [];
    this.currentId = localStorage.getItem('bc_current_project') || null;
  }

  async load() {
    let raw = null;
    try {
      raw = await GitHub.getFile('data/projects.json');
    } catch (err) {
      UI.toast('تعذّر تحميل المشاريع من GitHub، سيتم استخدام نسخة محلية.', 'error');
    }
    if (raw) {
      this.list = JSON.parse(raw);
    } else {
      const res = await fetch('data/projects.json', { cache: 'no-store' }).catch(() => null);
      this.list = res && res.ok ? await res.json() : [];
    }
    if (!this.currentId && this.list.length) this.currentId = this.list[0].id;
    return this.list;
  }

  get current() {
    return this.list.find((p) => p.id === this.currentId) || null;
  }

  setCurrent(id) {
    this.currentId = id;
    localStorage.setItem('bc_current_project', id);
  }

  find(id) {
    return this.list.find((p) => p.id === id);
  }

  async _persist(message) {
    await GitHub.putFile('data/projects.json', JSON.stringify(this.list, null, 2), message);
  }

  /** @param {object} data name,icon,package,blogId,template,labels,status */
  async create(data) {
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: data.name,
      icon: data.icon || '',
      package: data.package || '',
      blogId: data.blogId || '',
      template: data.template || 'default',
      labels: data.labels || [],
      status: data.status || 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.list.push(project);
    await this._persist(`feat: add project ${project.name}`);
    if (!this.currentId) this.setCurrent(project.id);
    return project;
  }

  async update(id, patch) {
    const project = this.find(id);
    if (!project) throw new Error('المشروع غير موجود');
    Object.assign(project, patch, { updatedAt: new Date().toISOString() });
    await this._persist(`chore: update project ${project.name}`);
    return project;
  }

  async remove(id) {
    const project = this.find(id);
    this.list = this.list.filter((p) => p.id !== id);
    await this._persist(`chore: remove project ${project?.name || id}`);
    if (this.currentId === id) this.setCurrent(this.list[0]?.id || null);
  }
}

const Projects = new ProjectsController();
