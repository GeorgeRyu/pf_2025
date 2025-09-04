import { SoundSetting } from "./sound-setting.js";
import { ScrollAnimations } from "./scroll-animations.js";

export class App {
    constructor() {
        this.body = document.querySelector('body');
        this.app();
    }

    app() {
        new SoundSetting().soundNavToggle();
        new ScrollAnimations();
    }
}