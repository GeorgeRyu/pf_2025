import { ScrollAnimations } from "./scroll-animations.js";
import { LenisSmoothScroll } from "./lenis-smooth-scroll.js";
import Alpine from "alpinejs";

// PFApp関数をグローバルに定義（Alpine.jsの初期化前に実行）
window.PFApp = function() {
    return {
        isSoundMenuOpen: false,
        isColorThemeMenuOpen: false,
        isMenuOpen: false,

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

        // lenisの制御メソッド
        controlLenis() {
            if (window.lenis && typeof window.lenis.stop === 'function') {
                if (this.isMenuOpen || this.isSoundMenuOpen) {
                    window.lenis.stop();
                } else {
                    window.lenis.start();
                }
            }
        },

        anchorLink(target, isPcHeader = false) {
            const distanceH = isPcHeader ? window.innerHeight : window.innerHeight * 1.5;
            const distanceHeight = distanceH * 2 * (target - 1);

            !isPcHeader && (this.isMenuOpen = !this.isMenuOpen);
            
            if (window.app && window.app.lenisSmoothScroll) {
                window.lenis = window.app.lenisSmoothScroll.lenis;

                if( !isPcHeader ) {
                    window.lenis.start();
                }

                window.lenis.scrollTo(
                    distanceHeight,  // 数値として渡す
                    {
                        duration: 3.5,
                        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
                        offset: 0,
                    }
                );
            } else {
                // フォールバック: 通常のスクロール
                window.scrollTo({
                    top: distanceHeight,
                    behavior: 'smooth'
                });
            }
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
        
        new ScrollAnimations();
    }
}