import type { PlateContentController } from '../content/PlateContentController';
import type { ActiveSection } from '../types';

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
