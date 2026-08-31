import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';
import {
    getScrollDistanceUnit,
    onScrollDistanceReset,
} from './scroll-distance.js';

// GSAPプラグインを登録
gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

export class ScrollAnimations {
    constructor() {
        this.isPc = 1023 < window.innerWidth;
        this.distance = getScrollDistanceUnit();
        this.chars = this.getRandomElement(
            [
                "■.▪▌▐▬",
                "_ - .",
                "//_",
                "0123456789 -_",
                "▲△▼▽◇■□◯●★☆✦✧◆◇",
                "🔴🟡🟢🔵🟣🟤🟧🟨🟠🟦🟪🟥",
            ]
        );
        this.lenis = null;
        this.scrollTriggers = [];
        /** @type {Array<{ index: number, enterFunc: () => void, leaveFunc: () => void, enterBackFunc: () => void, leaveBackFunc: () => void, markers: boolean }>} */
        this.areaTriggerHandlers = [];

        this.init();
    }

    init() {
        this.setupLenisIntegration();
        this.buildAreaAnimations();
        this.attachScrollTriggers();
        onScrollDistanceReset(() => this.handleScrollDistanceReset());
    }

    handleScrollDistanceReset() {
        this.distance = getScrollDistanceUnit();
        this.attachScrollTriggers();
        ScrollTrigger.refresh();
    }

    setupLenisIntegration() {
        window.addEventListener('lenis-scroll', () => {
            ScrollTrigger.update();
        });

        setTimeout(() => {
            if (window.app && window.app.lenisSmoothScroll) {
                this.lenis = window.app.lenisSmoothScroll.lenis;

                const lenisInstance = this.lenis;
                ScrollTrigger.scrollerProxy(document.body, {
                    scrollTop(value) {
                        if (arguments.length) {
                            lenisInstance.scrollTo(value, { immediate: true });
                        }
                        return lenisInstance.scroll;
                    },
                    getBoundingClientRect() {
                        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
                    },
                    pinType: document.body.style.transform ? "transform" : "fixed"
                });
            }
        }, 100);
    }

    buildAreaAnimations() {
        const eachArea = ['works-info', 'about-area', 'photos-area', 'playground-area', 'thx-area'];
        const nameArea = document.querySelector('[data-name="name-area"]');
        const eachAreaTitles = ['Works', 'About', 'Photos', 'Playground', 'THX'];

        nameArea.textContent = eachAreaTitles[0];

        eachArea.forEach((area, index) => {
            const targetArea = document.querySelector(`[data-name="${area}"]`);
            const areaItems = targetArea.querySelectorAll(`[data-name="kinetic-txt"]`);
            const originalTexts = Array.from(areaItems).map(item => item.textContent);
            const tlShowTxt = gsap.timeline({ paused: true });
            const tlHideTxt = gsap.timeline({ paused: true });
            const tlShowTxtSpTitle = gsap.timeline({ paused: true });
            const mm = gsap.matchMedia();

            let enterFunc = () => {};
            let leaveFunc = () => {};
            let enterBackFunc = () => {};
            let leaveBackFunc = () => {};
            let markers = false;

            if (index === 0) {
                enterFunc = () => tlHideTxt.restart();
                enterBackFunc = () => {
                    tlShowTxt.restart();
                    mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                };
            } else {
                areaItems.forEach(item => {
                    item.textContent = '';
                });

                if (index === 4) {
                    enterFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    enterBackFunc = () => tlShowTxt.reverse();
                    leaveBackFunc = () => tlHideTxt.restart();
                } else {
                    enterFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    leaveFunc = () => tlHideTxt.restart();
                    enterBackFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    leaveBackFunc = () => tlHideTxt.restart();
                }
            }

            this.areaTriggerHandlers.push({
                index,
                enterFunc,
                leaveFunc,
                enterBackFunc,
                leaveBackFunc,
                markers,
            });

            tlShowTxt.to(areaItems, {
                duration: 0.65,
                scrambleText: {
                    text: (i) => originalTexts[i],
                    chars: this.chars,
                    revealDelay: 0.01,
                    speed: 0.01,
                    tweenLength: true
                },
                ease: "none",
                stagger: 0.035,
                onStart: () => {
                    if (targetArea.classList.contains('hidden')) {
                        targetArea.classList.remove('hidden');
                        targetArea.classList.add('grid', 'z-10');
                    }
                },
            });

            tlHideTxt.to(areaItems, {
                duration: 0.65,
                scrambleText: {
                    text: () => '',
                    chars: this.chars,
                    revealDelay: 0.01,
                    speed: 0.01,
                    tweenLength: true
                },
                ease: "none",
                stagger: {
                    amount: 0.035,
                    from: 'end',
                },
                onComplete: () => {
                    targetArea.classList.remove('grid', 'z-10');
                    targetArea.classList.add('hidden');
                },
            });

            tlShowTxtSpTitle.to(nameArea, {
                duration: 0.6,
                scrambleText: {
                    text: eachAreaTitles[index],
                    chars: this.chars,
                    revealDelay: 0.01,
                    speed: 0.01,
                    tweenLength: true
                },
                ease: "none",
            });
        });
    }

    attachScrollTriggers() {
        this.scrollTriggers.forEach((trigger) => trigger.kill());
        this.scrollTriggers = [];

        const body = document.querySelector('body');

        this.areaTriggerHandlers.forEach((handler) => {
            const { index, enterFunc, leaveFunc, enterBackFunc, leaveBackFunc, markers } = handler;

            let dis = this.distance;
            let pStart = '';
            let pEnd = '';

            if (index === 0) {
                pStart = `${dis} center`;
                pEnd = `${dis} center`;
            } else {
                dis = (2 * index) * this.distance;

                if (index === 4) {
                    pStart = `${dis} center`;
                    pEnd = `${dis} center`;
                } else {
                    pStart = `${dis} center`;
                    pEnd = `${dis + this.distance} center`;
                }
            }

            const trigger = ScrollTrigger.create({
                trigger: body,
                start: pStart,
                end: pEnd,
                onEnter: enterFunc,
                onLeave: leaveFunc,
                onEnterBack: enterBackFunc,
                onLeaveBack: leaveBackFunc,
                markers,
            });

            this.scrollTriggers.push(trigger);
        });
    }

    getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    destroy() {
        this.scrollTriggers.forEach((trigger) => trigger.kill());
        this.scrollTriggers = [];
    }
}

window.addEventListener('beforeunload', () => {
    if (window.scrollAnimations) {
        window.scrollAnimations.destroy();
    }
});
