import gsap from 'gsap';
import type * as THREE from 'three';

const BAR_COUNT = 7;

/** PC Theatre sequence≈16 のダイヤモンド（中央が最長） */
const REST_X_PC = [-30.5, -26.5, -22.5, -18.5, -22.5, -26.5, -30.5];
/** SP Theatre sequence≈16 のダイヤモンド */
const REST_X_SP = [-22.0, -19.5, -17.0, -14.5, -17.0, -19.5, -22.0];

export type PlaygroundBarsControllerDeps = {
    getRectangles: () => THREE.Mesh[];
    isPC: () => boolean;
};

/**
 * Playground ホバー時に rac1–7 の position.x を距離ベースで tween し、
 * Theatre.tick 直後に上書き適用する。
 */
export class PlaygroundBarsController {
    private focusedIndex: number | null = null;
    private overrideActive = false;
    private lengths: number[] = REST_X_PC.slice();
    private tween: gsap.core.Tween | null = null;

    constructor(private readonly deps: PlaygroundBarsControllerDeps) {}

    getFocusedIndex(): number | null {
        return this.focusedIndex;
    }

    isOverrideActive(): boolean {
        return this.overrideActive;
    }

    /** Theatre.tick の直後・描画前に呼ぶ */
    applyOverrides() {
        if (!this.overrideActive) return;
        const rectangles = this.deps.getRectangles();
        for (let i = 0; i < BAR_COUNT; i++) {
            const mesh = rectangles[i];
            if (mesh) mesh.position.x = this.lengths[i];
        }
    }

    focus(index: number) {
        if (!this.overrideActive) {
            this.captureCurrentLengths();
        }
        this.focusedIndex = index;
        this.overrideActive = true;

        const rest = this.getRestX();
        const xShort = rest[0];
        const xLong = rest[3];
        const targets = rest.map((_, i) => {
            const weight = 1 - Math.abs(i - index) / (BAR_COUNT - 1);
            return xShort + (xLong - xShort) * weight;
        });
        this.tweenTo(targets);
    }

    /** ダイヤモンド形状へ戻し、完了後に Theatre 制御へ委譲 */
    clear() {
        if (!this.overrideActive && this.focusedIndex == null) return;
        // 描画分岐用の focusedIndex は復帰 tween 完了まで維持（プレート fade と同期）
        this.tweenTo(this.getRestX(), () => {
            this.focusedIndex = null;
            this.overrideActive = false;
        });
    }

    /** セクション離脱など即時リセット */
    resetImmediate() {
        this.tween?.kill();
        this.tween = null;
        this.focusedIndex = null;
        this.overrideActive = false;
        this.lengths = this.getRestX().slice();
    }

    private getRestX(): number[] {
        return this.deps.isPC() ? REST_X_PC : REST_X_SP;
    }

    private captureCurrentLengths() {
        const rectangles = this.deps.getRectangles();
        for (let i = 0; i < BAR_COUNT; i++) {
            const mesh = rectangles[i];
            this.lengths[i] = mesh ? mesh.position.x : this.getRestX()[i];
        }
    }

    private tweenTo(targets: number[], onComplete?: () => void) {
        this.tween?.kill();
        this.overrideActive = true;
        this.tween = gsap.to(this.lengths, {
            endArray: targets,
            duration: 0.55,
            ease: 'power2.out',
            onComplete: () => {
                this.tween = null;
                onComplete?.();
            },
        });
    }
}
