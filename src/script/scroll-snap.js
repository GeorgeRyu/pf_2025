import {
    getFixedInnerHeight,
    getScrollDistanceUnit,
    getSectionSnapAnchors,
    onScrollDistanceReset,
} from './scroll-distance.js';

const IDLE_MS = 200;
const SNAP_DURATION = 1.2;
const FLICK_VELOCITY = 10;
const easeOutExpo = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

function deadzonePx() {
    return Math.max(24, getFixedInnerHeight() * 0.04);
}

/** この距離以内なら最寄りアンカーへ寄せる。長い区間の途中では発火しない */
function capturePx() {
    return Math.min(getScrollDistanceUnit() * 0.4, getFixedInnerHeight() * 0.75);
}

/**
 * スクロール停止後、主要セクション先頭へ寄せる。
 * フリックの行き過ぎ防止が目的で、区間内のゆっくり閲覧では動かさない。
 */
export class ScrollSnap {
    constructor() {
        this.lenis = null;
        this.idleTimer = null;
        this.isSnapping = false;
        this.suppressUntil = 0;
        this.direction = 1;
        this.peakVelocity = 0;
        this.onScroll = this.onScroll.bind(this);
        this.trySnap = this.trySnap.bind(this);

        this.unbindReset = onScrollDistanceReset(() => {
            this.clearIdle();
            this.peakVelocity = 0;
        });

        this.setupLenis();
    }

    /** ナビやリサイズなど、自前以外の scrollTo 中はスナップしない */
    suppress(durationSec = 3.5) {
        this.clearIdle();
        this.peakVelocity = 0;
        this.suppressUntil = performance.now() + durationSec * 1000 + 120;
    }

    destroy() {
        this.clearIdle();
        this.unbindReset?.();
        this.lenis?.off('scroll', this.onScroll);
    }

    setupLenis() {
        const tryBind = () => {
            const lenis = window.app?.lenisSmoothScroll?.lenis;
            if (!lenis) return false;
            this.lenis = lenis;
            this.lenis.on('scroll', this.onScroll);
            return true;
        };

        if (tryBind()) return;
        setTimeout(tryBind, 100);
        window.addEventListener('lenis-recreated', () => {
            this.lenis?.off('scroll', this.onScroll);
            tryBind();
        });
    }

    onScroll(e) {
        if (this.isSnapping || performance.now() < this.suppressUntil) return;

        const velocity = e.velocity ?? 0;
        if (velocity > 0.01) this.direction = 1;
        else if (velocity < -0.01) this.direction = -1;

        this.peakVelocity = Math.max(this.peakVelocity, Math.abs(velocity));

        this.clearIdle();
        this.idleTimer = setTimeout(this.trySnap, IDLE_MS);
    }

    trySnap() {
        this.idleTimer = null;
        if (!this.lenis || this.isSnapping) return;
        if (performance.now() < this.suppressUntil) return;

        const scroll = this.lenis.scroll;
        const anchors = getSectionSnapAnchors();
        const deadzone = deadzonePx();
        const capture = capturePx();
        const flicked = this.peakVelocity >= FLICK_VELOCITY;
        this.peakVelocity = 0;

        const nearest = this.nearestAnchor(anchors, scroll);
        if (nearest != null && Math.abs(nearest - scroll) <= deadzone) return;

        const flickCapture = capture * 1.5;
        const directed = this.directionalAnchor(anchors, scroll, deadzone);
        let target = null;
        if (flicked && directed != null && Math.abs(directed - scroll) <= flickCapture) {
            target = directed;
        } else if (nearest != null && Math.abs(nearest - scroll) <= capture) {
            target = nearest;
        }

        if (target == null || Math.abs(target - scroll) <= deadzone) return;

        this.isSnapping = true;
        this.lenis.scrollTo(target, {
            duration: SNAP_DURATION,
            easing: easeOutExpo,
            offset: 0,
            onComplete: () => {
                this.isSnapping = false;
            },
        });
        setTimeout(() => {
            this.isSnapping = false;
        }, (SNAP_DURATION + 0.3) * 1000);
    }

    nearestAnchor(anchors, scroll) {
        let best = null;
        let bestDist = Infinity;
        for (const a of anchors) {
            const dist = Math.abs(a - scroll);
            if (dist < bestDist) {
                bestDist = dist;
                best = a;
            }
        }
        return best;
    }

    directionalAnchor(anchors, scroll, deadzone) {
        if (this.direction >= 0) {
            return anchors.find((a) => a > scroll + deadzone) ?? null;
        }
        for (let i = anchors.length - 1; i >= 0; i--) {
            if (anchors[i] < scroll - deadzone) return anchors[i];
        }
        return null;
    }

    clearIdle() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}
