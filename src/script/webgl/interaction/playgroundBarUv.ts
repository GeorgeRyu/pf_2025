import * as THREE from 'three';
import { PLATE_SIZE } from '../scene/WorksPlateMesh';

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
