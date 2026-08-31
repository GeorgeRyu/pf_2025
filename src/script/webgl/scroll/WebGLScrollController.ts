import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import type { ISheet } from '@theatre/core';
import { getScrollDistanceUnit, getSectionZoneBoundaries, onScrollDistanceReset } from '../../scroll-distance.js';
import type { PlateContentController } from '../content/PlateContentController';
import { ABOUT_IMAGE_KEY, type ActiveSection } from '../types';

gsap.registerPlugin(ScrollTrigger);

export type WebGLScrollControllerDeps = {
    getTheatreSheet: () => ISheet;
    getSequenceLength: () => number;
    plateContent: PlateContentController;
    onPhotosEnter?: () => void;
    onPhotosLeave?: () => void;
    onPlaygroundLeave?: () => void;
};

/**
 * WebGL 用 ScrollTrigger: Theatre シーケンス同期 + About ゾーン切替。
 */
export class WebGLScrollController {
    private scrollTriggers: ScrollTrigger[] = [];
    private activeSection: ActiveSection = 'loading';
    /** ゾーンごとの表示済みフラグ。副作用の重複実行防止は activeSection ではなくこちらで行う */
    private aboutVisible = false;
    private photosVisible = false;
    private unregisterResize: (() => void) | null = null;

    constructor(private readonly deps: WebGLScrollControllerDeps) {}

    getActiveSection(): ActiveSection {
        return this.activeSection;
    }

    setActiveSection(section: ActiveSection) {
        this.activeSection = section;
    }

    /** 初回セットアップ（scroll-distance リセットにも登録） */
    attach() {
        this.attachScrollTriggers();
        this.unregisterResize = onScrollDistanceReset(() => this.rebuild());
    }

    rebuild() {
        this.clearScrollTriggers();
        this.attachScrollTriggers();
        ScrollTrigger.refresh();
    }

    destroy() {
        this.unregisterResize?.();
        this.unregisterResize = null;
        this.clearScrollTriggers();
    }

    private clearScrollTriggers() {
        this.scrollTriggers.forEach((trigger) => trigger.kill());
        this.scrollTriggers = [];
    }

    private attachScrollTriggers() {
        const distanceHeight = getScrollDistanceUnit();
        const zones = getSectionZoneBoundaries();
        const body = document.querySelector('body');
        const sequenceLength = this.deps.getSequenceLength();
        const theatreSheet = this.deps.getTheatreSheet();

        const sections = [
            { start: 0.2, end: 0.4, scrollStart: distanceHeight * 0.5, scrollEnd: zones.about },
            { start: 0.4, end: 0.6, scrollStart: zones.about + distanceHeight * 0.5, scrollEnd: zones.photos },
            { start: 0.6, end: 0.8, scrollStart: zones.playground, scrollEnd: distanceHeight * 6 },
            { start: 0.8, end: 1.0, scrollStart: distanceHeight * 6.5, scrollEnd: zones.thx },
        ];

        sections.forEach((section) => {
            const trigger = ScrollTrigger.create({
                trigger: body,
                start: `${section.scrollStart} top`,
                end: `${section.scrollEnd} top`,
                scrub: 1.5,
                markers: false,
                onUpdate: (self) => {
                    const progress = self.progress;
                    const theatreStart = section.start * sequenceLength;
                    const theatreEnd = section.end * sequenceLength;
                    const theatrePosition = theatreStart + (theatreEnd - theatreStart) * progress;

                    theatreSheet.sequence.position = theatrePosition;
                },
            });
            this.scrollTriggers.push(trigger);
        });

        const aboutZoneStart = zones.about;
        const aboutZoneEnd = zones.about + distanceHeight * 0.5;
        const aboutTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${aboutZoneStart} center`,
            end: `${aboutZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterAboutZone(),
            onEnterBack: () => this.enterAboutZone(),
            onLeave: () => this.leaveAboutZone(),
            onLeaveBack: () => this.leaveAboutZone(),
        });
        this.scrollTriggers.push(aboutTrigger);

        const photosZoneStart = zones.photos;
        const photosZoneEnd = zones.playground;
        const photosTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${photosZoneStart} 10%`,
            end: `${photosZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterPhotosZoneFromForward(),
            onEnterBack: () => this.enterPhotosZoneFromForward(),
            onLeave: () => this.leavePhotosZone(),
            onLeaveBack: () => this.leavePhotosZone(),
        });
        this.scrollTriggers.push(photosTrigger);

        const playgroundZoneStart = zones.playground;
        const playgroundZoneEnd = zones.thx;
        const playgroundTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${playgroundZoneStart} top`,
            end: `${playgroundZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterPlaygroundZone(),
            onEnterBack: () => this.enterPlaygroundZone(),
            onLeave: () => this.leavePlaygroundZone(),
            onLeaveBack: () => this.leavePlaygroundZone(),
        });
        this.scrollTriggers.push(playgroundTrigger);
    }

    private enterAboutZone() {
        this.activeSection = 'about';
        if (this.aboutVisible) return;
        this.aboutVisible = true;
        this.deps.plateContent.show(
            { kind: 'image', key: ABOUT_IMAGE_KEY },
            { duration: 1.8, ease: 'power3.out' }
        );
    }

    private leaveAboutZone() {
        this.activeSection = 'works';
        if (!this.aboutVisible) return;
        this.aboutVisible = false;
        this.deps.plateContent.clear({ duration: 1.2 });
    }

    private enterPhotosZoneFromForward() {
        this.activeSection = 'photos';
        if (this.photosVisible) return;
        this.photosVisible = true;
        this.deps.onPhotosEnter?.();
    }

    private leavePhotosZone() {
        this.activeSection = 'works';
        if (!this.photosVisible) return;
        this.photosVisible = false;
        this.deps.onPhotosLeave?.();
    }

    private enterPlaygroundZone() {
        this.activeSection = 'playground';
    }

    private leavePlaygroundZone() {
        this.activeSection = 'works';
        this.deps.onPlaygroundLeave?.();
    }
}
