import { ScrollAnimations } from "./scroll-animations.js";
import { LenisSmoothScroll } from "./lenis-smooth-scroll.js";
import { ProjectModal } from "./project-modal.js";
import { ColorTheme } from "./color-theme.js";
import { getAnchorScrollTop, initScrollDistanceResize } from "./scroll-distance.js";
import { ScrollSnap } from "./scroll-snap.js";
import Alpine from "alpinejs";

// PFApp関数をグローバルに定義（Alpine.jsの初期化前に実行）
window.PFApp = function() {
    return {
        isSoundMenuOpen: false,
        isColorThemeMenuOpen: false,
        isMenuOpen: false,
        isPhotoActive: false,
        isScrollCueTop: false,
        _overlayLocked: false,

        // 初期化時にlenisの参照を取得
        initLenis() {
            this.$nextTick(() => {
                if (window.app && window.app.lenisSmoothScroll) {
                    window.lenis = window.app.lenisSmoothScroll.lenis;
                    
                    // 明示的に状態変数を監視
                    this.$watch('isMenuOpen', () => this.controlLenis());
                    this.$watch('isSoundMenuOpen', () => this.controlLenis());
                }
            });
        },

        scrollToY(top) {
            if (window.app && window.app.lenisSmoothScroll) {
                window.lenis = window.app.lenisSmoothScroll.lenis;
                window.lenis.scrollTo(top, {
                    duration: 3.5,
                    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                    offset: 0,
                    lock: true,
                });
                window.app?.scrollSnap?.suppress(3.5);
            } else {
                window.scrollTo({
                    top,
                    behavior: 'smooth',
                });
            }
        },

        onFooterScrollCue() {
            if (!this.isScrollCueTop) return;
            this.scrollToY(0);
        },

        // lenisの制御メソッド
        controlLenis() {
            const overlayLock = this.isMenuOpen || this.isSoundMenuOpen;
            const scroller = window.app?.lenisSmoothScroll;
            if (!scroller) return;
            if (overlayLock && !this._overlayLocked) {
                this._overlayLocked = true;
                scroller.lock();
            } else if (!overlayLock && this._overlayLocked) {
                this._overlayLocked = false;
                scroller.unlock();
            }
        },

        anchorLink(target, isPcHeader = false) {
            !isPcHeader && (this.isMenuOpen = !this.isMenuOpen);

            if (window.app?.lenisSmoothScroll) {
                window.lenis = window.app.lenisSmoothScroll.lenis;
                if (!isPcHeader) window.lenis.start();
            }

            this.scrollToY(getAnchorScrollTop(target));
        }
    }
}

export class App {
    constructor() {
        this.body = document.querySelector('body');
        this.app();
    }

    app() {
        // グローバルにアクセス可能にする
        window.app = this;
        window.Alpine = Alpine;

        // PFApp関数が定義されていることを確認
        if (typeof window.PFApp === 'function') {
            // Alpine.jsを開始
            Alpine.start();
        } else {
            console.error('PFApp function is not defined');
        }

        // Lenisスムーススクロールを初期化
        this.lenisSmoothScroll = new LenisSmoothScroll();
        // リロード時は必ずページトップから開始
        this.lenisSmoothScroll.scrollTo(0, { immediate: true });
        this.colorTheme = new ColorTheme();
        this.projectModal = new ProjectModal();

        window.scrollAnimations = new ScrollAnimations();
        this.scrollSnap = new ScrollSnap();
        window.scrollSnap = this.scrollSnap;
        initScrollDistanceResize();
    }
}