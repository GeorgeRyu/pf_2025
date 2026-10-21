export class ProjectModal {
  constructor() {
    this.modalContainer = document.querySelector('[data-name="modal-container"]');
    this.openButtons = Array.from(document.querySelectorAll('.js-project-modal-btn'));

    if (!this.modalContainer) return;

    this.articles = Array.from(this.modalContainer.querySelectorAll('article[data-name]'));
    this.articleBySlug = new Map(
      this.articles
        .map((a) => [a.dataset.name, a])
        .filter(([slug]) => typeof slug === 'string' && slug.length > 0),
    );
    this.slugs = Array.from(this.articleBySlug.keys());

    this.currentSlug = null;
    this.isOpen = false;
    this.isScrollLocked = false;

    // handlers
    this.onWheelCapture = this.onWheelCapture.bind(this);
    this.onKeyDownCapture = this.onKeyDownCapture.bind(this);
    this.onTouchMoveCapture = this.onTouchMoveCapture.bind(this);

    this.bind();
  }

  bind() {
    // open
    this.openButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const slug = btn.dataset.projectSlug;
        if (!slug) return;
        this.open(slug);
      });
    });

    // close / prev-next (event delegation)
    this.modalContainer.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const closeBtn = target.closest('[data-name="btn-close"]');
      if (closeBtn) {
        e.preventDefault();
        this.close();
        return;
      }

      const prevNextLink = target.closest('.prev-next a');
      if (prevNextLink) {
        e.preventDefault();
        const article = prevNextLink.closest('article[data-name]');
        if (!article) return;
        const links = Array.from(article.querySelectorAll('.prev-next a'));
        const idx = links.indexOf(prevNextLink);
        if (idx === -1) return;

        const direction = idx === 0 ? 'prev' : 'next';
        this.openSibling(direction);
      }
    });
  }

  open(slug) {
    const target = this.getArticle(slug);
    if (!target) return;

    // 初回オープン時のみスクロールロック（開いたままの切替でロック状態を上書きしない）
    if (!this.isOpen) {
      this.lockPageScroll();
      this.isOpen = true;
    }

    this.setVisible(this.modalContainer, true);
    this.hideAllArticles();
    this.setVisible(target, true);
    this.activateArticleVideos(target);
    this.resetArticleScroll(target);
    this.focusArticle(target);

    this.currentSlug = slug;
    this.syncWorksLinkActive(slug);
    this.updatePrevNext(target);
  }

  close() {
    if (!this.isOpen) return;
    this.hideAllArticles();
    this.setVisible(this.modalContainer, false);
    this.currentSlug = null;
    this.isOpen = false;
    this.syncWorksLinkActive(null);
    this.unlockPageScroll();
  }

  openSibling(direction) {
    if (!this.currentSlug) return;

    const currentIndex = this.slugs.indexOf(this.currentSlug);
    if (currentIndex === -1) return;

    const nextIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= this.slugs.length) return;

    const nextSlug = this.slugs[nextIndex];
    this.open(nextSlug);
  }

  updatePrevNext(articleEl) {
    const slug = articleEl.dataset.name;
    const index = this.slugs.indexOf(slug);
    if (index === -1) return;

    const prevSlug = index > 0 ? this.slugs[index - 1] : null;
    const nextSlug = index < this.slugs.length - 1 ? this.slugs[index + 1] : null;

    const links = Array.from(articleEl.querySelectorAll('.prev-next a'));
    const prevLink = links[0] || null;
    const nextLink = links[1] || null;

    this.setNavLinkState(prevLink, !!prevSlug);
    this.setNavLinkState(nextLink, !!nextSlug);
  }

  setNavLinkState(linkEl, enabled) {
    if (!linkEl) return;
    linkEl.setAttribute('aria-disabled', enabled ? 'false' : 'true');

    if (enabled) {
      linkEl.classList.remove('opacity-40', 'pointer-events-none');
    } else {
      linkEl.classList.add('opacity-40', 'pointer-events-none');
    }
  }

  syncWorksLinkActive(slug) {
    this.openButtons.forEach((btn) => {
      const isActive = Boolean(slug) && btn.dataset.projectSlug === slug;
      btn.classList.toggle('is-active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  getArticle(slug) {
    return this.articleBySlug.get(slug) || null;
  }

  getCurrentArticle() {
    return this.currentSlug ? this.getArticle(this.currentSlug) : null;
  }

  hideAllArticles() {
    this.articles.forEach((a) => {
      this.deactivateArticleVideos(a);
      this.setVisible(a, false);
    });
  }

  /** 開いている案件だけ src を載せて再生。他はデコーダを解放する */
  activateArticleVideos(articleEl) {
    articleEl.querySelectorAll('video[data-src]').forEach((video) => {
      const url = video.dataset.src;
      if (!url) return;
      if (video.getAttribute('src') !== url) {
        video.src = url;
      }
      video.play().catch(() => {});
    });
  }

  deactivateArticleVideos(articleEl) {
    articleEl.querySelectorAll('video').forEach((video) => {
      video.pause();
      if (!video.getAttribute('src')) return;
      video.removeAttribute('src');
      video.load();
    });
  }

  setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('block', visible);
  }

  resetArticleScroll(articleEl) {
    // hidden → block の直後だと反映されないことがあるので rAF で確実に先頭へ
    requestAnimationFrame(() => {
      articleEl.scrollTop = 0;
    });
  }

  focusArticle(articleEl) {
    // キーボード操作（Space/PageDown等）の対象をモーダル内に寄せる
    if (!articleEl.hasAttribute('tabindex')) {
      articleEl.setAttribute('tabindex', '-1');
    }
    requestAnimationFrame(() => {
      try {
        articleEl.focus({ preventScroll: true });
      } catch {
        articleEl.focus();
      }
    });
  }

  lockPageScroll() {
    if (this.isScrollLocked) return;
    window.app?.lenisSmoothScroll?.lock();
    window.app?.lenisSmoothScroll?.releaseVirtualScroll();

    // PC: wheel を確実にモーダル記事へ流す（Lenisに奪われないよう capture + preventDefault）
    window.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false });
    window.addEventListener('keydown', this.onKeyDownCapture, { capture: true });
    // Mobile: touch はモーダル領域だけ監視して、記事外タッチで背景へ伝播しないようにする
    this.modalContainer.addEventListener('touchmove', this.onTouchMoveCapture, { capture: true, passive: false });
    this.isScrollLocked = true;
  }

  unlockPageScroll() {
    if (!this.isScrollLocked) return;

    window.removeEventListener('wheel', this.onWheelCapture, true);
    window.removeEventListener('keydown', this.onKeyDownCapture, true);
    this.modalContainer.removeEventListener('touchmove', this.onTouchMoveCapture, true);

    window.app?.lenisSmoothScroll?.restoreVirtualScroll();
    window.app?.lenisSmoothScroll?.unlock();
    this.isScrollLocked = false;
  }

  onWheelCapture(e) {
    if (!this.isOpen) return;
    const article = this.getCurrentArticle();
    if (!article) {
      e.preventDefault();
      return;
    }

    const target = e.target;
    const isInside = target instanceof Node && article.contains(target);
    if (!isInside) {
      // 背景にホイールが流れるのをブロック
      e.preventDefault();
      return;
    }

    const delta = this.normalizeWheelDelta(e);
    article.scrollTop += delta;
    e.preventDefault();
  }

  normalizeWheelDelta(e) {
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16; // lines → px
    if (e.deltaMode === 2) delta *= window.innerHeight; // pages → px
    return delta;
  }

  onKeyDownCapture(e) {
    if (!this.isOpen) return;

    // 入力中は邪魔しない
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
    ) {
      return;
    }

    const article = this.getCurrentArticle();
    if (!article) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }

    const pageStep = Math.max(120, Math.floor(article.clientHeight * 0.9));
    const lineStep = 48;

    const key = e.key;
    const scrollDeltaByKey = {
      ArrowDown: lineStep,
      ArrowUp: -lineStep,
      PageDown: pageStep,
      PageUp: -pageStep,
      ' ': e.shiftKey ? -pageStep : pageStep,
    };

    if (key in scrollDeltaByKey) {
      article.scrollTop += scrollDeltaByKey[key];
      e.preventDefault();
      return;
    }

    if (key === 'Home') {
      article.scrollTop = 0;
      e.preventDefault();
      return;
    }
    if (key === 'End') {
      article.scrollTop = article.scrollHeight;
      e.preventDefault();
    }
  }

  onTouchMoveCapture(e) {
    if (!this.isOpen) return;
    const article = this.getCurrentArticle();
    if (!article) {
      e.preventDefault();
      return;
    }
    const target = e.target;
    const isInside = target instanceof Node && article.contains(target);
    if (!isInside) {
      e.preventDefault();
      return;
    }
  }
}

