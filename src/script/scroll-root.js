/** SP だけ document を止め、#scroll-root をスクロールの正にする。 */

export const SP_SCROLL_MAX = 1023;

export function isSpScroll() {
    return window.innerWidth <= SP_SCROLL_MAX;
}

export function getScrollRoot() {
    return document.getElementById('scroll-root');
}

export function getScrollContent() {
    return document.getElementById('scroll-content');
}

/** ScrollTrigger の trigger。1400vh の実体。 */
export function getScrollTriggerEl() {
    return getScrollContent() ?? document.body;
}

/** SP は内側箱、PC は window（undefined = 既定）。 */
export function getScrollTriggerScroller() {
    return isSpScroll() ? (getScrollRoot() ?? undefined) : undefined;
}
