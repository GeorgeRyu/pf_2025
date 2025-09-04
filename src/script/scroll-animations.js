import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import SplitText from 'gsap/SplitText';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';
import { log } from 'three/tsl';

// GSAPプラグインを登録
gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

export class ScrollAnimations {
    constructor() {
        this.isPc = 1023 < window.innerWidth;
        // this.distance = this.isPc ? 1400 : 1000;
        this.distance = window.innerHeight;
        this.chars = this.getRandomElement(["■.▪▌▐▬", "_ - .", "//_", "0123456789 -_"]);

        this.init();
    }

    init() {
        this.setupScrollAnimations();
    }

    setupScrollAnimations() {
        const eachArea = ['works-info', 'about-area', 'photos-area', 'playground-area'];
        // const eachArea = ['works-info'];

        
        eachArea.forEach((area, index) => {
            const targetArea = document.querySelector(`[data-name="${area}"]`),
                areaItems = targetArea.querySelectorAll(`[data-name="kinetic-txt"]`),
                originalTexts = Array.from(areaItems).map(item => item.textContent),
                tlShowTxt = gsap.timeline({paused: true}),
                tlHideTxt = gsap.timeline({paused: true});
            
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
                leaveFunc = '';
                enterBackFunc = () => tlShowTxt.restart();
                leaveBackFunc = '';
                markers = true;
                

            }else {

                // 1 = 2
                dis = (2 * index) * this.distance;
                
                areaItems.forEach(item => {
                    item.textContent = '';
                });

                if(index === 3) {
                    pStart = `${dis} center`;
                    pEnd = `${dis} center`;
                    enterFunc = () => tlShowTxt.restart();
                    leaveFunc = () => '';
                    enterBackFunc = () => tlShowTxt.reverse();
                    leaveBackFunc = () => '';
                    markers = true;
                    
                }else {
                    pStart = `${dis} center`;
                    pEnd = `${dis + this.distance} center`;
                    enterFunc = () => tlShowTxt.restart();
                    leaveFunc = () => tlShowTxt.reverse();
                    enterBackFunc = () => tlShowTxt.restart();
                    leaveBackFunc = () => tlShowTxt.reverse();
                    markers = true;
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
                    // console.log('onStart tlShowTxt');
                    if( targetArea.classList.contains('hidden') ) {
                        targetArea.classList.remove('hidden');
                        targetArea.classList.add('grid');
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
                // chars: "■▪▌▐▬-",
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
