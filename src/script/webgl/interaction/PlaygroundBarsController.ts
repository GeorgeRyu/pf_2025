import gsap from 'gsap';
import * as THREE from 'three';
import { PLATE_SIZE } from '../scene/createSceneMeshes';

const _corner = new THREE.Vector3();
const _local = new THREE.Vector3();

/**
 * フォーカスバーのジオメトリ角を worksPlate ローカル UV に変換し、AABB を返す。
 */
export function computeBarUvBounds(
    bar: THREE.Mesh,
    plate: THREE.Mesh,
): { min: THREE.Vector2; max: THREE.Vector2 } | null {
    const geom = bar.geometry as THREE.BufferGeometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const bb = geom.boundingBox;
    if (!bb) return null;

    bar.updateWorldMatrix(true, false);
    plate.updateWorldMatrix(true, false);
    const invPlate = plate.matrixWorld.clone().invert();

    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;

    for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
            for (let iz = 0; iz < 2; iz++) {
                _corner.set(
                    ix ? bb.max.x : bb.min.x,
                    iy ? bb.max.y : bb.min.y,
                    iz ? bb.max.z : bb.min.z,
                );
                _corner.applyMatrix4(bar.matrixWorld);
                _local.copy(_corner).applyMatrix4(invPlate);

                const u = _local.x / PLATE_SIZE + 0.5;
                const v = _local.y / PLATE_SIZE + 0.5;
                minU = Math.min(minU, u);
                minV = Math.min(minV, v);
                maxU = Math.max(maxU, u);
                maxV = Math.max(maxV, v);
            }
        }
    }

    if (!Number.isFinite(minU) || maxU - minU < 1e-5 || maxV - minV < 1e-5) {
        return null;
    }

    return {
        min: new THREE.Vector2(minU, minV),
        max: new THREE.Vector2(maxU, maxV),
    };
}

/** object-fit: cover 用の UV scale/offset（destAspect = 表示先の幅/高さ） */
export function calcCoverUvTransform(
    contentAspect: number,
    destAspect: number,
): { scale: THREE.Vector2; offset: THREE.Vector2 } {
    if (contentAspect > destAspect) {
        const scale = destAspect / contentAspect;
        return {
            scale: new THREE.Vector2(scale, 1),
            offset: new THREE.Vector2((1 - scale) / 2, 0),
        };
    }
    const scale = contentAspect / destAspect;
    return {
        scale: new THREE.Vector2(1, scale),
        offset: new THREE.Vector2(0, (1 - scale) / 2),
    };
}

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
