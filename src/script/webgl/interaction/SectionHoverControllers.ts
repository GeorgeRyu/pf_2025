import type { PlateContentController } from '../content/PlateContentController';
import type { ActiveSection } from '../types';
import type { PlaygroundBarsController } from './PlaygroundBarsController';

export type WorksHoverDeps = {
    plateContent: PlateContentController;
    getActiveSection: () => ActiveSection;
};

/**
 * Works セクションのプロジェクトリンク hover/focus でプレート動画を表示。
 */
export class WorksHoverController {
    constructor(private readonly deps: WorksHoverDeps) {}

    attach() {
        const worksInfo = document.querySelector('[data-name="works-info"]');
        if (!worksInfo) return;

        let items = worksInfo.querySelectorAll('.js-project-modal-btn');
        if (!items || items.length === 0) {
            items = worksInfo.querySelectorAll('.project-link');
        }

        items.forEach((el, idx) => {
            const show = () => {
                if (this.deps.getActiveSection() !== 'works') return;
                this.deps.plateContent.show({ kind: 'video', index: idx });
            };
            const clear = () => {
                if (this.deps.getActiveSection() !== 'works') return;
                this.deps.plateContent.clear();
            };
            el.addEventListener('mouseenter', show);
            el.addEventListener('mouseleave', clear);
            el.addEventListener('focus', show);
            el.addEventListener('blur', clear);
        });
    }
}

/** index 0,1 → playground video / それ以外 → ベタ色（未開発） */
const PLAYGROUND_VIDEO_COUNT = 2;

export type PlaygroundHoverDeps = {
    plateContent: PlateContentController;
    bars: PlaygroundBarsController;
    getActiveSection: () => ActiveSection;
};

function isPlaygroundLink(node: EventTarget | null): boolean {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest('.js-playground-link'));
}

/**
 * Playground リンク hover/focus でバー長さ + プレート動画（未開発はベタ）を連動。
 */
export class PlaygroundHoverController {
    constructor(private readonly deps: PlaygroundHoverDeps) {}

    attach() {
        const area = document.querySelector('[data-name="playground-area"]');
        if (!area) return;

        const items = area.querySelectorAll<HTMLElement>('.js-playground-link');
        items.forEach((el) => {
            const raw = el.getAttribute('data-playground-index');
            const index = raw != null ? Number(raw) : NaN;
            if (!Number.isFinite(index)) return;

            const show = () => {
                if (this.deps.getActiveSection() !== 'playground') return;
                this.deps.bars.focus(index);
                if (index < PLAYGROUND_VIDEO_COUNT) {
                    this.deps.plateContent.show({ kind: 'playgroundVideo', index });
                } else {
                    // 未開発枠: 動画/ノイズは出さずベタ色のまま（長さアニメのみ）
                    this.deps.plateContent.clear({ duration: 0.4 });
                }
            };

            /** 別リンクへ移動中は clear しない（leave→enter レース防止） */
            const clear = (e: MouseEvent | FocusEvent) => {
                if (this.deps.getActiveSection() !== 'playground') return;
                const related = 'relatedTarget' in e ? e.relatedTarget : null;
                if (related && area.contains(related as Node) && isPlaygroundLink(related)) {
                    return;
                }
                this.deps.bars.clear();
                this.deps.plateContent.clear({ duration: 0.6 });
            };

            el.addEventListener('mouseenter', show);
            el.addEventListener('mouseleave', clear);
            el.addEventListener('focus', show);
            el.addEventListener('blur', clear);
        });
    }

    /** セクション離脱時 */
    reset() {
        this.deps.bars.resetImmediate();
        this.deps.plateContent.clear({ duration: 0.4 });
    }
}
