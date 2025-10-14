import { SoundSetting } from "./sound-setting.js";
import { ScrollAnimations } from "./scroll-animations.js";
import { LenisSmoothScroll } from "./lenis-smooth-scroll.js";

export class App {
    constructor() {
        this.body = document.querySelector('body');
        this.app();
    }

    app() {
        // Lenisスムーススクロールを最初に初期化
        this.lenisSmoothScroll = new LenisSmoothScroll();
        
        // グローバルにアクセス可能にする
        window.app = this;
        
        new SoundSetting().soundNavToggle();
        new ScrollAnimations();
    }
}