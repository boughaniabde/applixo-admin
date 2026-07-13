/**
 * uploader.js
 * Handles the wizard's "step 3" image experience: drag & drop intake,
 * client-side compression before upload, per-file progress bars,
 * retry/cancel, drag-to-reorder, and copy-link. Uploaded results are
 * kept in `this.items` so app.js / generator.js can read them back.
 */

class UploaderController {
  constructor() {
    this.items = []; // {id, file, status:'queued'|'uploading'|'done'|'error', progress, url, thumb}
    this.dragSrcId = null;
  }

  init(dropzoneEl, gridEl, fileInputEl) {
    this.dropzone = dropzoneEl;
    this.grid = gridEl;
    this.fileInput = fileInputEl;

    this.dropzone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.enqueue([...e.target.files]));

    ['dragenter', 'dragover'].forEach((evt) =>
      this.dropzone.addEventListener(evt, (e) => { e.preventDefault(); this.dropzone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((evt) =>
      this.dropzone.addEventListener(evt, (e) => { e.preventDefault(); this.dropzone.classList.remove('drag'); }));
    this.dropzone.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      this.enqueue(files);
    });
  }

  reset() {
    this.items = [];
    this.render();
  }

  enqueue(files) {
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const item = { id: crypto.randomUUID(), file, status: 'queued', progress: 0, url: null, thumb: null };
      this.items.push(item);
      this._upload(item);
    });
    this.render();
  }

  async _upload(item) {
    item.status = 'uploading';
    this.render();
    try {
      const result = await Blogger.uploadImage(item.file, (pct) => {
        item.progress = pct;
        this._updateBar(item.id, pct);
      });
      Object.assign(item, result, { status: 'done', progress: 100 });
    } catch (err) {
      item.status = 'error';
      UI.toast(`فشل رفع ${item.file.name}: ${err.message}`, 'error');
    }
    this.render();
  }

  retry(id) {
    const item = this.items.find((i) => i.id === id);
    if (item) this._upload(item);
  }

  cancel(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.render();
  }

  copyLink(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item?.url) return;
    navigator.clipboard.writeText(item.url);
    UI.toast('تم نسخ رابط الصورة', 'success');
  }

  reorder(fromId, toId) {
    const from = this.items.findIndex((i) => i.id === fromId);
    const to = this.items.findIndex((i) => i.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = this.items.splice(from, 1);
    this.items.splice(to, 0, moved);
    this.render();
  }

  doneImages() {
    return this.items.filter((i) => i.status === 'done');
  }

  _updateBar(id, pct) {
    const bar = this.grid?.querySelector(`[data-id="${id}"] .bar i`);
    if (bar) bar.style.width = `${pct}%`;
  }

  render() {
    if (!this.grid) return;
    this.grid.innerHTML = this.items.map((item) => this._itemHTML(item)).join('');
    this.grid.querySelectorAll('.upload-item').forEach((el) => {
      const id = el.dataset.id;
      el.draggable = true;
      el.addEventListener('dragstart', () => { this.dragSrcId = id; el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => { e.preventDefault(); this.reorder(this.dragSrcId, id); });
      el.querySelector('.rm')?.addEventListener('click', (e) => { e.stopPropagation(); this.cancel(id); });
      el.querySelector('.retry-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.retry(id); });
      el.querySelector('.copy-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.copyLink(id); });
    });
  }

  _itemHTML(item) {
    const previewSrc = item.thumb || URL.createObjectURL(item.file);
    const statusBadge = {
      queued: '<span class="tag">قيد الانتظار</span>',
      uploading: `<span class="tag scheduled">${item.progress}%</span>`,
      done: '<span class="tag live">تم</span>',
      error: '<span class="tag" style="color:var(--danger)">فشل</span>',
    }[item.status];

    return `
      <div class="upload-item" data-id="${item.id}">
        <img src="${previewSrc}" alt="" loading="lazy" />
        <div class="rm" title="إزالة">✕</div>
        <div style="position:absolute;top:6px;right:6px;">${statusBadge}</div>
        ${item.status === 'uploading' ? `<div class="bar"><i style="width:${item.progress}%"></i></div>` : ''}
        ${item.status === 'error' ? '<div style="position:absolute;bottom:6px;left:6px;right:30px;"><button class="btn btn-sm btn-ghost retry-btn" style="width:100%">إعادة المحاولة</button></div>' : ''}
        ${item.status === 'done' ? '<div style="position:absolute;bottom:6px;left:6px;right:6px;"><button class="btn btn-sm btn-ghost copy-btn" style="width:100%">نسخ الرابط</button></div>' : ''}
      </div>`;
  }

  /* ================================================================ */
  /* Client-side compression (canvas re-encode before upload)           */
  /* ================================================================ */

  /**
   * Downscales oversized images and re-encodes as JPEG to shrink
   * payload before hitting ImgBB. Falls back to the original file on
   * any error (e.g. unsupported format).
   */
  compressImage(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return resolve(file);
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = () => resolve(file);
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) return resolve(file);
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }
}

const Uploader = new UploaderController();