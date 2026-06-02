/**
 * スクロール区切りの共通基準。
 * 初期 innerHeight を固定し、モバイル URL バー変動によるアンカー/Trigger ズレを防ぐ。
 * 横幅が変わったときだけ innerHeight も再取得してリセットする。
 */

let fixedInnerHeight = window.innerHeight;
let fixedInnerWidth = window.innerWidth;
let scrollDistanceUnit = fixedInnerHeight * 1.5;

/** @type {Set<() => void>} */
const resetListeners = new Set();

export function getFixedInnerHeight() {
    return fixedInnerHeight;
}

export function getScrollDistanceUnit() {
    return scrollDistanceUnit;
}

/** ナビ anchorLink の target（1=Works, 2=About, …） */
export function getAnchorScrollTop(target) {
    return scrollDistanceUnit * 2 * (target - 1);
}

/**
 * 横幅変更時に innerHeight 基準を再取得する。
 * @returns {{ oldUnit: number, newUnit: number }}
 */
export function resetScrollDistance() {
    const oldUnit = scrollDistanceUnit;
    fixedInnerHeight = window.innerHeight;
    fixedInnerWidth = window.innerWidth;
    scrollDistanceUnit = fixedInnerHeight * 1.5;
    return { oldUnit, newUnit: scrollDistanceUnit };
}

export function onScrollDistanceReset(callback) {
    resetListeners.add(callback);
    return () => resetListeners.delete(callback);
}

let resizeTimer = null;

/** 横幅変更時のみ距離基準をリセットし、登録済みリスナーを呼ぶ */
export function initScrollDistanceResize() {
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth === fixedInnerWidth) return;

            const lenis = window.lenis ?? window.app?.lenisSmoothScroll?.lenis;
            const scrollY = lenis?.scroll ?? window.scrollY ?? 0;
            const { oldUnit, newUnit } = resetScrollDistance();
            const ratio = oldUnit > 0 ? newUnit / oldUnit : 1;

            resetListeners.forEach((fn) => fn());

            const nextScroll = scrollY * ratio;
            if (lenis) {
                lenis.scrollTo(nextScroll, { immediate: true });
            } else {
                window.scrollTo(0, nextScroll);
            }
        }, 150);
    });
}
