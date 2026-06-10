import * as THREE from 'three';
import gsap from 'gsap';
import photoVertexShader from '../shaders/photoVertex.glsl?raw';
import photoFragmentShader from '../shaders/photoFragment.glsl?raw';

const PLANE_WIDTH = 2;
const PILLAR_DEPTH = 1.1256;         // BoxGeometry の z 深さ = +Y 面の高さ方向
const PILLAR_TOP_LOCAL_Y = 35 / 2;  // +Y 面: BoxGeometry height=35 の半分
const WORLD_FRONT_OFFSET = 0.01;    // z-fighting 防止（world 単位）

/** cover UV の scale / offset を計算して返す */
function computeCoverUV(texture: THREE.Texture): { scale: THREE.Vector2; offset: THREE.Vector2 } {
    const img = texture.image as HTMLImageElement;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH) return { scale: new THREE.Vector2(1, 1), offset: new THREE.Vector2(0, 0) };

    const planeRatio = PLANE_WIDTH / PILLAR_DEPTH;
    const imgRatio = imgW / imgH;
    const scale = new THREE.Vector2(1, 1);
    const offset = new THREE.Vector2(0, 0);

    if (imgRatio > planeRatio) {
        const rep = planeRatio / imgRatio;
        scale.set(rep, 1);
        offset.set((1 - rep) / 2, 0);
    } else {
        const rep = imgRatio / planeRatio;
        scale.set(1, rep);
        offset.set(0, (1 - rep) / 2);
    }
    return { scale, offset };
}

function createPhotoMaterial(
    texture: THREE.Texture | null,
    uvScale: THREE.Vector2,
    uvOffset: THREE.Vector2
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            map: { value: texture },
            uvScale: { value: uvScale.clone() },
            uvOffset: { value: uvOffset.clone() },
            duotoneLight: { value: new THREE.Color(1, 1, 1) },
            duotoneDark: { value: new THREE.Color(0, 0, 0) },
            duotoneMix: { value: 1.0 },
            opacity: { value: 0.0 },
        },
        vertexShader: photoVertexShader,
        fragmentShader: photoFragmentShader,
        transparent: true,
        side: THREE.FrontSide,
        depthTest: true,
    });
}

export type PhotosPillarPlanesDeps = {
    rectangles: THREE.Mesh[];
    photoUrls: string[];
};

/**
 * 各柱（rectangle）の +Y 面に対応する PlaneGeometry。
 * ShaderMaterial で duotone 表示 + クリック時にオリジナルカラーへ遷移。
 * groupRectangles の child にはせず、独立した group に入れて Pass 3 で描画。
 */
export class PhotosPillarPlanes {
    readonly planes: THREE.Mesh[] = [];
    readonly group = new THREE.Group();
    private rectangles: THREE.Mesh[] = [];
    private fadeTween: gsap.core.Tween | null = null;
    private duotoneTweens: Map<THREE.Mesh, gsap.core.Tween> = new Map();

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

                        const { scale, offset } = computeCoverUV(texture);
                        const material = createPhotoMaterial(texture, scale, offset);
                        const plane = new THREE.Mesh(geometry, material);
                        plane.visible = false;
                        this.group.add(plane);
                        this.planes.push(plane);
                        resolve();
                    },
                    undefined,
                    () => {
                        const material = createPhotoMaterial(
                            null,
                            new THREE.Vector2(1, 1),
                            new THREE.Vector2(0, 0)
                        );
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

    /** テーマ変更時・ロード完了時に呼ぶ */
    setDuotoneColors(light: THREE.Color, dark: THREE.Color) {
        this.planes.forEach((p) => {
            const u = (p.material as THREE.ShaderMaterial).uniforms;
            (u.duotoneLight.value as THREE.Color).copy(light);
            (u.duotoneDark.value as THREE.Color).copy(dark);
        });
    }

    /** クリックズーム時: duotoneMix 1→0（オリジナルカラーへじわっと） */
    toOriginal(plane: THREE.Mesh) {
        const existing = this.duotoneTweens.get(plane);
        if (existing) existing.kill();
        const u = (plane.material as THREE.ShaderMaterial).uniforms;
        const tween = gsap.to(u.duotoneMix, {
            value: 0,
            duration: 1.0,
            ease: 'power2.out',
        });
        this.duotoneTweens.set(plane, tween);
    }

    /** ズーム解除時: duotoneMix 0→1（duotone に戻る） */
    toDuotone(plane: THREE.Mesh | null) {
        if (!plane) return;
        const existing = this.duotoneTweens.get(plane);
        if (existing) existing.kill();
        const u = (plane.material as THREE.ShaderMaterial).uniforms;
        const tween = gsap.to(u.duotoneMix, {
            value: 1,
            duration: 1.0,
            ease: 'power2.out',
        });
        this.duotoneTweens.set(plane, tween);
    }

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
            (p.material as THREE.ShaderMaterial).uniforms.opacity.value = 0;
        });

        const targets = this.planes.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity);
        this.fadeTween = gsap.to(targets, {
            value: 1,
            duration: 0.8,
            stagger: 0.08,
            ease: 'power2.out',
        });
    }

    hide() {
        if (this.fadeTween) this.fadeTween.kill();

        const targets = this.planes.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity);
        this.fadeTween = gsap.to(targets, {
            value: 0,
            duration: 0.6,
            ease: 'power2.in',
            onComplete: () => {
                this.planes.forEach((p) => { p.visible = false; });
            },
        });
    }
}
