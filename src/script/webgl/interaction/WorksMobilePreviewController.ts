import gsap from 'gsap';
import type { PlateContentController } from '../content/PlateContentController';

const INITIAL_DELAY = 3;
const INTERVAL = 5;
const REST_DELAY = 4;

export type WorksMobilePreviewDeps = {
    plateContent: PlateContentController;
    getMovieCount: () => number;
};

/**
 * SP の Works で、ベタ色のあとプロジェクト動画を一周ずつ順送りする。
 */
export class WorksMobilePreviewController {
    private running = false;
    private index = 0;
    private timer: gsap.core.Tween | null = null;

    constructor(private readonly deps: WorksMobilePreviewDeps) {}

    start() {
        if (this.running) return;
        const count = this.deps.getMovieCount();
        if (count <= 0) return;
        this.running = true;
        this.index = 0;
        this.schedule(INITIAL_DELAY, () => this.tick());
    }

    stop() {
        this.running = false;
        this.timer?.kill();
        this.timer = null;
    }

    private tick() {
        if (!this.running) return;
        const count = this.deps.getMovieCount();
        if (count <= 0) {
            this.stop();
            return;
        }
        if (this.index >= count) {
            this.deps.plateContent.clear({ duration: 1 });
            this.index = 0;
            this.schedule(REST_DELAY, () => this.tick());
            return;
        }
        this.deps.plateContent.show({ kind: 'video', index: this.index });
        this.index += 1;
        this.schedule(INTERVAL, () => this.tick());
    }

    private schedule(delay: number, fn: () => void) {
        this.timer?.kill();
        this.timer = gsap.delayedCall(delay, fn);
    }
}
