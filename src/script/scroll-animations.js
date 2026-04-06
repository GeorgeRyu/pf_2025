import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';

// GSAPプラグインを登録
gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

export class ScrollAnimations {
    constructor() {
        this.isPc = 1023 < window.innerWidth;
        // this.distance = this.isPc ? 1400 : 1000;
        this.distance = window.innerHeight * 1.5;
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

        this.init();
    }

    init() {
        // Lenisインスタンスを取得
        this.setupLenisIntegration();
        this.setupScrollAnimations();
    }

    setupLenisIntegration() {
        // Lenisのスクロールイベントをリッスン
        window.addEventListener('lenis-scroll', (e) => {
            // ScrollTriggerの更新
            ScrollTrigger.update();
        });

        // Lenisインスタンスへの参照を取得
        setTimeout(() => {
            if (window.app && window.app.lenisSmoothScroll) {
                this.lenis = window.app.lenisSmoothScroll.lenis;
                
                // ScrollTriggerにLenisを統合
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

    setupScrollAnimations() {
        const eachArea = ['works-info', 'about-area', 'photos-area', 'playground-area', 'thx-area'],
            nameArea = document.querySelector('[data-name="name-area"]'),
            eachAreaTitles = ['Works', 'About', 'Photos', 'Playground', 'THX'];

        nameArea.textContent = eachAreaTitles[0];

        eachArea.forEach((area, index) => {
            const targetArea = document.querySelector(`[data-name="${area}"]`),
                areaItems = targetArea.querySelectorAll(`[data-name="kinetic-txt"]`),
                originalTexts = Array.from(areaItems).map(item => item.textContent),
                tlShowTxt = gsap.timeline({paused: true}),
                tlHideTxt = gsap.timeline({paused: true}),
                tlShowTxtSpTitle = gsap.timeline({paused: true}),
                mm = gsap.matchMedia();

            let dis = this.distance,
                pStart = '',
                pEnd = '',
                enterFunc = '',
                leaveFunc = '',
                enterBackFunc = '',
                leaveBackFunc = '',
                markers = false;

            if(index === 0) {
                pStart = `${dis} center`;
                pEnd = `${dis} center`;
                enterFunc = () => tlHideTxt.restart();
                leaveFunc = () => '';
                enterBackFunc = () => {
                    tlShowTxt.restart();
                    mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                };
                leaveBackFunc = '';
                // markers = false;

            }else {
                dis = (2 * index) * this.distance;
                
                areaItems.forEach(item => {
                    item.textContent = '';
                });

                if(index === 4) {
                    pStart = `${dis} center`;
                    pEnd = `${dis} center`;
                    enterFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    leaveFunc = () => '';
                    enterBackFunc = () => tlShowTxt.reverse();
                    leaveBackFunc = () => tlHideTxt.restart();;
                    // markers = false;
                    
                }else {
                    pStart = `${dis} center`;
                    pEnd = `${dis + this.distance} center`;
                    enterFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    leaveFunc = () => {
                        // tlShowTxt.reverse();
                        tlHideTxt.restart();
                    };
                    enterBackFunc = () => {
                        tlShowTxt.restart();
                        mm.add('(max-width: 1023px)', () => tlShowTxtSpTitle.restart());
                    };
                    leaveBackFunc = () => {
                        // tlShowTxt.reverse();
                        tlHideTxt.restart();
                    };
                    // markers = false;
                }
            }

            ScrollTrigger.create({
                trigger: document.querySelector('body'),
                start: pStart,
                end: pEnd,
                onEnter: enterFunc,
                onLeave: leaveFunc,
                onEnterBack: enterBackFunc,
                onLeaveBack: leaveBackFunc,
                markers,
            });

            tlShowTxt.to(areaItems, {
                duration: 0.65,
                scrambleText: {
                    text: (index) => originalTexts[index], // 各要素の元のテキストを使用
                    chars: this.chars,
                    revealDelay: 0.01,
                    speed: 0.01,
                    tweenLength: true
                },
                ease: "none",
                stagger: 0.035,
                onStart: () => {
                    if( targetArea.classList.contains('hidden') ) {
                        targetArea.classList.remove('hidden');
                        targetArea.classList.add('grid', 'z-10');
                    }
                },
            });

            tlHideTxt.to(areaItems, {
                duration: 0.65,
                scrambleText: {
                    text: (index) => '', // 各要素の元のテキストを使用
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
                    text: eachAreaTitles[index], // 各要素の元のテキストを使用
                    chars: this.chars,
                    revealDelay: 0.01,
                    speed: 0.01,
                    tweenLength: true
                },
                ease: "none",
            });
        });

        // this.worksInOut();
    }

    worksInOut() {
        const worksInfo = document.querySelector('[data-name="works-info"]');
        const worksInfoItems = gsap.utils.toArray('[data-name="kinetic-txt"]');
        const originalTexts = worksInfoItems.map(item => item.dataset.text);

        const tlShowTxt = gsap.timeline();
        
        tlShowTxt.to(worksInfoItems, {
            duration: 1,
            scrambleText: {
                text: (index) => originalTexts[index], // 各要素の元のテキストを使用
                chars: this.chars,
                revealDelay: 0.01,
                speed: 0.01
            },
            ease: "none",
            stagger: 0.03,
        });

        const startAnimation = () => tlShowTxt.play();
        const reverseAnimation = () => tlShowTxt.reverse();

        return {
            start: startAnimation,
            reverse: reverseAnimation
        };
    }


    
    // ランダムな文字列を取得
    getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    // アニメーションのクリーンアップ
    destroy() {
        ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    }
}

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.scrollAnimations) {
        window.scrollAnimations.destroy();
    }
});
