import Lenis from 'lenis';

export class LenisSmoothScroll {
    constructor() {
        this.lenis = null;
        this.init();
    }

    init() {
        // Lenisの初期化
        this.lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: false,
            touchMultiplier: 2,
            infinite: false,
        });

        // アニメーションループ
        this.raf = (time) => {
            this.lenis.raf(time);
            requestAnimationFrame(this.raf);
        };
        requestAnimationFrame(this.raf);

        // スクロールイベントのリスナー
        this.lenis.on('scroll', (e) => {
            // 必要に応じてカスタムイベントを発火
            window.dispatchEvent(new CustomEvent('lenis-scroll', { detail: e }));
        });

        // ウィンドウリサイズ時の処理
        window.addEventListener('resize', () => {
            this.lenis.resize();
        });

        // ページ離脱時のクリーンアップ
        window.addEventListener('beforeunload', () => {
            this.destroy();
        });
    }

    // スクロール位置を取得
    getScroll() {
        return this.lenis.scroll;
    }

    // 指定位置にスクロール
    scrollTo(target, options = {}) {
        this.lenis.scrollTo(target, options);
    }

    // スクロールを停止
    stop() {
        this.lenis.stop();
    }

    // スクロールを開始
    start() {
        this.lenis.start();
    }

    // インスタンスを破棄
    destroy() {
        if (this.lenis) {
            this.lenis.destroy();
            this.lenis = null;
        }
    }
}
