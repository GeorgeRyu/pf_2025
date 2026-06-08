import * as THREE from 'three';
import gsap from 'gsap';

const PLANE_WIDTH = 2;
const PILLAR_DEPTH = 1.1256;         // BoxGeometry の z 深さ = +Y 面の高さ方向
const PILLAR_TOP_LOCAL_Y = 35 / 2;  // +Y 面: BoxGeometry height=35 の半分
const WORLD_FRONT_OFFSET = 0.01;    // z-fighting 防止（world 単位）

function applyCoverUV(texture: THREE.Texture) {
    const img = texture.image as HTMLImageElement;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH) return;
    const planeRatio = PLANE_WIDTH / PILLAR_DEPTH;
    const imgRatio = imgW / imgH;

    if (imgRatio > planeRatio) {
        // 画像が面より横長 → 高さをフィット、幅をクロップ
        const rep = planeRatio / imgRatio;
        texture.repeat.set(rep, 1);
        texture.offset.set((1 - rep) / 2, 0);
    } else {
        // 画像が面より縦長（または同比率） → 幅をフィット、高さをクロップ
        const rep = imgRatio / planeRatio;
        texture.repeat.set(1, rep);
        texture.offset.set(0, (1 - rep) / 2);
    }
}

export type PhotosPillarPlanesDeps = {
    rectangles: THREE.Mesh[];
    photoUrls: string[];
};

/**
 * 各柱（rectangle）の手前面に対応する PlaneGeometry。
 * groupRectangles の child にはせず、独立した group に入れて
 * ステンシルを外した Pass 3 で描画する。
 * 毎フレーム updateTransforms() で rectangle の world transform に追従。
 */
export class PhotosPillarPlanes {
    readonly planes: THREE.Mesh[] = [];
    /** シーンルートに add する独立グループ */
    readonly group = new THREE.Group();
    private rectangles: THREE.Mesh[] = [];
    private fadeTween: gsap.core.Tween | null = null;

    private readonly _worldPos = new THREE.Vector3();
    private readonly _worldQuat = new THREE.Quaternion();
    private readonly _worldNormal = new THREE.Vector3();
    private readonly _xRot = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), -Math.PI / 2
    );

    async loadAndAttach(deps: PhotosPillarPlanesDeps): Promise<void> {
        this.rectangles = deps.rectangles;
        const loader = new THREE.TextureLoader();
        const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PILLAR_DEPTH);

        const promises = deps.rectangles.map((_, i) => {
            const url = deps.photoUrls[i % deps.photoUrls.length];
            return new Promise<void>((resolve) => {
                loader.load(
                    url,
                    (texture) => {
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        applyCoverUV(texture);

                        const material = new THREE.MeshBasicMaterial({
                            map: texture,
                            transparent: true,
                            opacity: 0,
                            side: THREE.FrontSide,
                            depthTest: true,
                        });

                        const plane = new THREE.Mesh(geometry, material);
                        plane.visible = false;
                        this.group.add(plane);
                        this.planes.push(plane);
                        resolve();
                    },
                    undefined,
                    () => {
                        const material = new THREE.MeshBasicMaterial({
                            transparent: true,
                            opacity: 0,
                        });
                        const plane = new THREE.Mesh(geometry, material);
                        plane.visible = false;
                        this.group.add(plane);
                        this.planes.push(plane);
                        resolve();
                    }
                );
            });
        });

        await Promise.all(promises);
        this.updateTransforms();
    }

    /**
     * 毎フレーム呼び出す。各 rect の world transform に plane を追従させる。
     */
    updateTransforms() {
        this.planes.forEach((plane, i) => {
            const rect = this.rectangles[i];
            if (!rect) return;

            rect.updateMatrixWorld(true);

            // rect local (0, +17.5, 0) = +Y 面（上面）の world 座標
            rect.localToWorld(this._worldPos.set(0, PILLAR_TOP_LOCAL_Y, 0));

            // rect の world 法線（+Y 方向）でさらに少し前に出す
            this._worldNormal.set(0, 1, 0).applyQuaternion(
                rect.getWorldQuaternion(this._worldQuat)
            );
            plane.position.copy(
                this._worldPos.add(this._worldNormal.multiplyScalar(WORLD_FRONT_OFFSET))
            );

            // rect の world 回転 + Rx(-90°) で plane の +Z 法線を rect の +Y 方向に向ける
            rect.getWorldQuaternion(this._worldQuat);
            plane.quaternion.copy(this._worldQuat).multiply(this._xRot);
        });
    }

    show() {
        if (this.fadeTween) this.fadeTween.kill();

        this.planes.forEach((p) => {
            p.visible = true;
            (p.material as THREE.MeshBasicMaterial).opacity = 0;
        });

        const targets = this.planes.map((p) => (p.material as THREE.MeshBasicMaterial));
        this.fadeTween = gsap.to(targets, {
            opacity: 1,
            duration: 0.8,
            stagger: 0.08,
            ease: 'power2.out',
        });
    }

    hide() {
        if (this.fadeTween) this.fadeTween.kill();

        const targets = this.planes.map((p) => (p.material as THREE.MeshBasicMaterial));
        this.fadeTween = gsap.to(targets, {
            opacity: 0,
            duration: 0.6,
            ease: 'power2.in',
            onComplete: () => {
                this.planes.forEach((p) => { p.visible = false; });
            },
        });
    }
}
