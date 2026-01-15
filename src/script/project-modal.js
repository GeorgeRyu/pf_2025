export class ProjectModal {
  constructor() {
    this.modalContainer = document.querySelector('[data-name="modal-container"]');
    this.openButtons = Array.from(document.querySelectorAll('.js-project-modal-btn'));

    if (!this.modalContainer) return;

    this.articles = Array.from(this.modalContainer.querySelectorAll('article[data-name]'));
    this.slugs = this.articles
      .map((a) => a.dataset.name)
      .filter((v) => typeof v === 'string' && v.length > 0);

    this.currentSlug = null;
    this.isOpen = false;
    this.isScrollLocked = false;

    // scroll lock state
    this.pageScrollY = 0;
    this.prevBodyPosition = '';
    this.prevBodyTop = '';
    this.prevBodyLeft = '';
    this.prevBodyRight = '';
    this.prevBodyWidth = '';
    this.prevHtmlOverflow = '';
    this.prevBodyOverflow = '';

    // handlers
    this.onWheelCapture = this.onWheelCapture.bind(this);
    this.onKeyDownCapture = this.onKeyDownCapture.bind(this);
    this.onTouchStartCapture = this.onTouchStartCapture.bind(this);
    this.onTouchMoveCapture = this.onTouchMoveCapture.bind(this);
    this.lastTouchY = 0;

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

    this.showModalContainer();
    this.hideAllArticles();
    this.showArticle(target);
    this.resetArticleScroll(target);
    this.focusArticle(target);

    this.currentSlug = slug;
    this.updatePrevNext(target);
  }

  close() {
    if (!this.isOpen) return;
    this.hideAllArticles();
    this.hideModalContainer();
    this.currentSlug = null;
    this.isOpen = false;
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

  getArticle(slug) {
    // CSS.escape が無い環境もあるのでフォールバック
    const safe = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(slug) : slug;
    return this.modalContainer.querySelector(`article[data-name="${safe}"]`);
  }

  getCurrentArticle() {
    if (!this.currentSlug) return null;
    return this.getArticle(this.currentSlug);
  }

  showModalContainer() {
    this.modalContainer.classList.remove('hidden');
    this.modalContainer.classList.add('block');
  }

  hideModalContainer() {
    this.modalContainer.classList.remove('block');
    this.modalContainer.classList.add('hidden');
  }

  hideAllArticles() {
    this.articles.forEach((a) => {
      a.classList.remove('block');
      a.classList.add('hidden');
    });
  }

  showArticle(articleEl) {
    articleEl.classList.remove('hidden');
    articleEl.classList.add('block');
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
    // Lenis があれば停止（ページ側を動かさない）
    if (window.lenis && typeof window.lenis.stop === 'function') {
      window.lenis.stop();
    }

    // 位置固定でページスクロールを完全に止める（iOS含む）
    this.pageScrollY = window.scrollY || 0;
    this.prevBodyPosition = document.body.style.position;
    this.prevBodyTop = document.body.style.top;
    this.prevBodyLeft = document.body.style.left;
    this.prevBodyRight = document.body.style.right;
    this.prevBodyWidth = document.body.style.width;
    this.prevHtmlOverflow = document.documentElement.style.overflow;
    this.prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.pageScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    // PC: wheel を確実にモーダル記事へ流す（Lenisに奪われないよう capture + preventDefault）
    window.addEventListener('wheel', this.onWheelCapture, { capture: true, passive: false });
    window.addEventListener('keydown', this.onKeyDownCapture, { capture: true });
    // Mobile: touch はモーダル領域だけ監視して、記事外タッチで背景へ伝播しないようにする
    this.modalContainer.addEventListener('touchstart', this.onTouchStartCapture, { capture: true, passive: true });
    this.modalContainer.addEventListener('touchmove', this.onTouchMoveCapture, { capture: true, passive: false });
    this.isScrollLocked = true;
  }

  unlockPageScroll() {
    if (!this.isScrollLocked) return;
    window.removeEventListener('wheel', this.onWheelCapture, true);
    window.removeEventListener('keydown', this.onKeyDownCapture, true);
    this.modalContainer.removeEventListener('touchstart', this.onTouchStartCapture, true);
    this.modalContainer.removeEventListener('touchmove', this.onTouchMoveCapture, true);

    // body styles restore
    document.documentElement.style.overflow = this.prevHtmlOverflow;
    document.body.style.overflow = this.prevBodyOverflow;
    document.body.style.position = this.prevBodyPosition;
    document.body.style.top = this.prevBodyTop;
    document.body.style.left = this.prevBodyLeft;
    document.body.style.right = this.prevBodyRight;
    document.body.style.width = this.prevBodyWidth;

    // スクロール位置を戻す
    window.scrollTo(0, this.pageScrollY);

    // Lenis があれば再開
    if (window.lenis && typeof window.lenis.start === 'function') {
      window.lenis.start();
    }

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

    let handled = true;
    switch (e.key) {
      case ' ':
        article.scrollTop += e.shiftKey ? -pageStep : pageStep;
        break;
      case 'PageDown':
        article.scrollTop += pageStep;
        break;
      case 'PageUp':
        article.scrollTop -= pageStep;
        break;
      case 'ArrowDown':
        article.scrollTop += lineStep;
        break;
      case 'ArrowUp':
        article.scrollTop -= lineStep;
        break;
      case 'Home':
        article.scrollTop = 0;
        break;
      case 'End':
        article.scrollTop = article.scrollHeight;
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
    }
  }

  onTouchStartCapture(e) {
    if (!this.isOpen) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    this.lastTouchY = t.clientY;
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
    // NOTE:
    // iOS Safari では、祖先要素の touchmove で preventDefault が絡むと
    // overflow: scroll のネイティブスクロールが開始できなくなることがある。
    // そのため「記事内」は一切ブロックせず、記事外だけブロックする。
  }
}

