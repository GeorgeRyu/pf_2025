import { SoundSetting } from "./sound-setting.js";
import { ScrollAnimations } from "./scroll-animations.js";
import { LenisSmoothScroll } from "./lenis-smooth-scroll.js";
import Alpine from "alpinejs";

// PFApp関数をグローバルに定義（Alpine.jsの初期化前に実行）
window.PFApp = function() {
    return {
        isSoundMenuOpen: false,
        isColorThemeMenuOpen: false,
        isMenuOpen: false,
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
        
        new SoundSetting().soundNavToggle();
        new ScrollAnimations();
    }
}