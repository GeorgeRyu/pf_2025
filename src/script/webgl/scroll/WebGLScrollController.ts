import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import type { ISheet } from '@theatre/core';
import { getScrollDistanceUnit, onScrollDistanceReset } from '../../scroll-distance.js';
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
        const body = document.querySelector('body');
        const sequenceLength = this.deps.getSequenceLength();
        const theatreSheet = this.deps.getTheatreSheet();

        const sections = [
            { start: 0.2, end: 0.4, scrollStart: distanceHeight * 0.5, scrollEnd: distanceHeight * 2 },
            { start: 0.4, end: 0.6, scrollStart: distanceHeight * 2.5, scrollEnd: distanceHeight * 4 },
            { start: 0.6, end: 0.8, scrollStart: distanceHeight * 4.5, scrollEnd: distanceHeight * 6 },
            { start: 0.8, end: 1.0, scrollStart: distanceHeight * 6.5, scrollEnd: distanceHeight * 8 },
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

        const aboutZoneStart = sections[0].scrollEnd;
        const aboutZoneEnd = sections[1].scrollStart;
        const aboutTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${aboutZoneStart} center`,
            end: `${aboutZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterAboutZone(),
            onEnterBack: () => this.enterAboutZone(),
            onLeave: () => this.leaveAboutZone('forward'),
            onLeaveBack: () => this.leaveAboutZone('backward'),
        });
        this.scrollTriggers.push(aboutTrigger);

        // Photos ゾーン: sections[1] 〜 sections[2].scrollStart
        // const photosZoneStart = sections[1].scrollStart;
        const photosZoneStart = sections[1].scrollEnd;
        const photosZoneEnd = sections[2].scrollStart;
        const photosTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${photosZoneStart} 10%`,
            end: `${photosZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterPhotosZoneFromForward(),
            onEnterBack: () => this.enterPhotosZoneFromForward(),
            onLeave: () => this.leavePhotosZone('forward'),
            onLeaveBack: () => this.leavePhotosZone('backward'),
        });
        this.scrollTriggers.push(photosTrigger);

        // Playground ゾーン: sections[2].scrollStart 〜 sections[3].scrollEnd
        const playgroundZoneStart = sections[2].scrollStart;
        const playgroundZoneEnd = sections[3].scrollEnd;
        const playgroundTrigger = ScrollTrigger.create({
            trigger: body,
            start: `${playgroundZoneStart} top`,
            end: `${playgroundZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterPlaygroundZone(),
            onEnterBack: () => this.enterPlaygroundZone(),
            onLeave: () => this.leavePlaygroundZone('forward'),
            onLeaveBack: () => this.leavePlaygroundZone('backward'),
        });
        this.scrollTriggers.push(playgroundTrigger);
    }

    private enterAboutZone() {
        if (this.activeSection === 'about') return;
        this.activeSection = 'about';
        this.deps.plateContent.show(
            { kind: 'image', key: ABOUT_IMAGE_KEY },
            { duration: 1.8, ease: 'power3.out' }
        );
    }

    private leaveAboutZone(direction: 'forward' | 'backward') {
        if (this.activeSection !== 'about') return;
        this.activeSection = 'works';
        this.deps.plateContent.clear({ duration: 1.2 });
    }

    private enterPhotosZoneFromForward() {
        if (this.activeSection === 'photos') return;
        this.activeSection = 'photos';
        this.deps.onPhotosEnter?.();
    }

    private leavePhotosZone(direction: 'forward' | 'backward') {
        if (this.activeSection !== 'photos') return;
        this.activeSection = direction === 'backward' ? 'about' : 'playground';
        this.deps.onPhotosLeave?.();
    }

    private enterPlaygroundZone() {
        if (this.activeSection === 'playground') return;
        this.activeSection = 'playground';
    }

    private leavePlaygroundZone(direction: 'forward' | 'backward') {
        if (this.activeSection !== 'playground') return;
        this.activeSection = direction === 'backward' ? 'photos' : 'thx';
        this.deps.onPlaygroundLeave?.();
    }
}
