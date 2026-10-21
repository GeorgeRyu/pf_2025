import Lenis from 'lenis';
import { getScrollContent, getScrollRoot, isSpScroll } from './scroll-root.js';

const easeOutExpo = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

export class LenisSmoothScroll {
    constructor() {
        this.lenis = null;
        this.rafId = 0;
        this.usingSpWrapper = false;
        this.lockCount = 0;
        this.savedScroll = 0;
        this.virtualScrollReleased = false;
        this.init();
    }

    init() {
        this.mountLenis();
        this.raf = (time) => {
            this.lenis?.raf(time);
            this.rafId = requestAnimationFrame(this.raf);
        };
        requestAnimationFrame(this.raf);

        window.addEventListener('resize', () => {
            this.lenis?.resize();
        });

        window.addEventListener('beforeunload', () => {
            this.destroy();
        });
    }

    mountLenis() {
        this.usingSpWrapper = isSpScroll();
        const options = {
            duration: 1.2,
            easing: easeOutExpo,
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: false,
            touchMultiplier: 2,
            infinite: false,
        };

        if (this.usingSpWrapper) {
            const wrapper = getScrollRoot();
            const content = getScrollContent();
            if (wrapper && content) {
                options.wrapper = wrapper;
                options.content = content;
                options.eventsTarget = window;
            }
        }

        this.lenis = new Lenis(options);
        this.lenis.on('scroll', (e) => {
            window.dispatchEvent(new CustomEvent('lenis-scroll', { detail: e }));
        });
        window.lenis = this.lenis;
    }

    recreateIfNeeded() {
        const wantSp = isSpScroll();
        if (wantSp === this.usingSpWrapper) {
            this.lenis?.resize();
            return;
        }

        const y = this.lenis?.scroll ?? 0;
        const wasReleased = this.virtualScrollReleased;
        this.virtualScrollReleased = false;
        if (this.lenis) {
            this.lenis.destroy();
            this.lenis = null;
        }
        this.mountLenis();
        if (wasReleased && this.usingSpWrapper) {
            this.releaseVirtualScroll();
        }
        this.lenis.scrollTo(y, { immediate: true });
        window.dispatchEvent(new CustomEvent('lenis-recreated'));
    }

    getScroll() {
        return this.lenis?.scroll ?? 0;
    }

    scrollTo(target, options = {}) {
        this.lenis?.scrollTo(target, options);
    }

    stop() {
        this.lenis?.stop();
    }

    start() {
        this.lenis?.start();
    }

    /** SP モーダル中だけ。window の VirtualScroll を外し、記事のネイティブ overflow を生かす。 */
    releaseVirtualScroll() {
        if (!this.usingSpWrapper || this.virtualScrollReleased) return;
        const vs = this.lenis?.virtualScroll;
        if (!vs) return;
        vs.destroy();
        this.virtualScrollReleased = true;
    }

    restoreVirtualScroll() {
        if (!this.virtualScrollReleased) return;
        this.virtualScrollReleased = false;
        if (!this.usingSpWrapper || !this.lenis) return;

        const VirtualScroll = this.lenis.virtualScroll?.constructor;
        if (typeof VirtualScroll !== 'function') return;

        const { eventsTarget, touchMultiplier, wheelMultiplier } = this.lenis.options;
        const vs = new VirtualScroll(eventsTarget, { touchMultiplier, wheelMultiplier });
        vs.on('scroll', this.lenis.onVirtualScroll);
        this.lenis.virtualScroll = vs;
    }

    /** モーダル / メニュー / Photos。PC は Lenis.stop だけ。SP は内側箱の overflow も止める。 */
    lock() {
        if (!this.lenis) return;
        if (this.lockCount === 0) {
            this.savedScroll = this.lenis.scroll;
            this.lenis.stop();
            if (this.usingSpWrapper) {
                const root = getScrollRoot();
                if (root) root.style.overflow = 'hidden';
            }
        }
        this.lockCount += 1;
    }

    unlock() {
        if (this.lockCount === 0) return;
        this.lockCount -= 1;
        if (this.lockCount > 0) return;

        if (this.usingSpWrapper) {
            const root = getScrollRoot();
            if (root) root.style.overflow = '';
        }

        this.lenis?.start();
        this.lenis?.scrollTo(this.savedScroll, { immediate: true });
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.virtualScrollReleased = false;
        if (this.lenis) {
            this.lenis.destroy();
            this.lenis = null;
        }
    }
}
