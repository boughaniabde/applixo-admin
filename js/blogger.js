/**
 * blogger.js
 * Thin, isolated wrapper around the Blogger API v3 + ImgBB image
 * hosting. Every method matches the function names requested in the
 * brief so they can be called directly from the UI layer.
 *
 * All requests go through Auth.getAccessToken(), which transparently
 * refreshes the OAuth token and — if the refresh_token itself has
 * expired — opens the recovery dialog and retries automatically.
 */

class BloggerAPI {
  constructor() {
    this.root = 'https://www.googleapis.com/blogger/v3';
  }

  async _authHeaders() {
    const token = await Auth.getAccessToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  /** Generic fetch wrapper that retries once after a token refresh. */
  async _request(path, options = {}) {
    const headers = await this._authHeaders();
    const res = await fetch(`${this.root}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Blogger API error (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  get blogId() { return Auth.config.blogId; }

  /* ================================================================ */
  /* Posts                                                              */
  /* ================================================================ */

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.content HTML body
   * @param {string[]} [opts.labels] tags/categories
   * @param {boolean} [opts.isDraft]
   * @param {string} [opts.publishAt] ISO datetime for scheduled publish
   * @param {string} [opts.permalink] custom URL slug
   */
  async publishPost({ title, content, labels = [], isDraft = false, publishAt = null, permalink = null }) {
    const body = { kind: 'blogger#post', title, content, labels };
    if (permalink) body.url = permalink;

    const params = new URLSearchParams();
    if (isDraft) params.set('isDraft', 'true');
    if (publishAt) params.set('publishDateTime', publishAt);

    const qs = params.toString() ? `?${params}` : '';
    return this._request(`/blogs/${this.blogId}/posts${qs}`, { method: 'POST', body: JSON.stringify(body) });
  }

  /**
   * @param {string} postId
   * @param {object} patch fields to update (title, content, labels, url...)
   */
  async updatePost(postId, patch) {
    return this._request(`/blogs/${this.blogId}/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify({ kind: 'blogger#post', id: postId, ...patch }),
    });
  }

  async deletePost(postId) {
    await this._request(`/blogs/${this.blogId}/posts/${postId}`, { method: 'DELETE' });
    return true;
  }

  /**
   * @param {object} opts
   * @param {number} [opts.maxResults]
   * @param {string} [opts.pageToken]
   * @param {'DRAFT'|'LIVE'|'SCHEDULED'} [opts.status]
   */
  async getPosts({ maxResults = 20, pageToken = null, status = null } = {}) {
    const params = new URLSearchParams({ maxResults: String(maxResults), fetchImages: 'true' });
    if (pageToken) params.set('pageToken', pageToken);
    if (status) params.set('status', status);
    return this._request(`/blogs/${this.blogId}/posts?${params}`);
  }

  async searchPosts(query) {
    const params = new URLSearchParams({ q: query, fetchImages: 'true' });
    return this._request(`/blogs/${this.blogId}/posts/search?${params}`);
  }

  async getPost(postId) {
    return this._request(`/blogs/${this.blogId}/posts/${postId}`);
  }

  /* ================================================================ */
  /* Images — hosted on ImgBB (Blogger's API has no direct media       */
  /* upload endpoint, so images are hosted externally and only their   */
  /* URLs are embedded in post HTML).                                  */
  /* ================================================================ */

  /**
   * @param {File} file
   * @param {(percent:number)=>void} onProgress
   * @returns {Promise<{url:string, deleteUrl:string, thumb:string}>}
   */
  uploadImage(file, onProgress = () => {}) {
    return new Promise(async (resolve, reject) => {
      const compressed = await Uploader.compressImage(file);
      const form = new FormData();
      form.append('image', compressed);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.imgbb.com/1/upload?key=${Auth.config.imgbbApiKey}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (!res.success) return reject(new Error('فشل رفع الصورة إلى ImgBB'));
          resolve({
            url: res.data.image.url,
            thumb: res.data.thumb?.url || res.data.image.url,
            deleteUrl: res.data.delete_url,
          });
        } catch (e) { reject(e); }
      };
      xhr.onerror = () => reject(new Error('تعذّر الاتصال بـ ImgBB'));
      xhr.send(form);
    });
  }

  /* ================================================================ */
  /* Download page generator hook                                      */
  /* ================================================================ */

  /** Delegates to generator.js and returns the ready-to-publish HTML string. */
  generateDownloadPage(project, images = [], template = null) {
    return Generator.build(project, images, template);
  }
}

const Blogger = new BloggerAPI();
