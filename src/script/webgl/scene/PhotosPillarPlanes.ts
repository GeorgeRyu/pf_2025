import * as THREE from 'three';
import gsap from 'gsap';
import photoVertexShader from '../shaders/photoVertex.glsl?raw';
import photoFragmentShader from '../shaders/photoFragment.glsl?raw';

const PLANE_WIDTH = 2;
const PILLAR_DEPTH = 1.1256;         // BoxGeometry の z 深さ = +Y 面の高さ方向
const PILLAR_TOP_LOCAL_Y = 35 / 2;  // +Y 面: BoxGeometry height=35 の半分
const WORLD_FRONT_OFFSET = 0.01;    // z-fighting 防止（world 単位）
const ZOOM_IN_DURATION = 0.6;
const ZOOM_OUT_DURATION = 0.54;

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
    private othersTween: gsap.core.Timeline | null = null;
    private forwardTween: gsap.core.Timeline | null = null;
    private duotoneTweens: Map<THREE.Mesh, gsap.core.Tween> = new Map();
    private activePlane: THREE.Mesh | null = null;
    private pillarFading = false;

    private readonly _worldPos = new THREE.Vector3();
    private readonly _worldQuat = new THREE.Quaternion();
    private readonly _worldNormal = new THREE.Vector3();
    private readonly _lookDir = new THREE.Vector3();
    private readonly _forwardStartPos = new THREE.Vector3();
    private readonly _forwardStartQuat = new THREE.Quaternion();
    private readonly _forwardEndQuat = new THREE.Quaternion();
    private readonly _planeFace = new THREE.Vector3(0, 0, 1);
    private readonly _quatProxy = { t: 0 };
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
                        plane.userData.photoIndex = i % deps.photoUrls.length;
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
                        plane.userData.photoIndex = i % deps.photoUrls.length;
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
            duration: ZOOM_IN_DURATION,
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
            duration: ZOOM_IN_DURATION,
            ease: 'power2.out',
        });
        this.duotoneTweens.set(plane, tween);
    }

    updateTransforms() {
        this.planes.forEach((plane, i) => {
            if (plane === this.activePlane) return;
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

    /** Photos ズーム中: 柱をステンシルではなく半透明ベタで描く */
    isPillarFading(): boolean {
        return this.pillarFading;
    }
    bringForward(plane: THREE.Mesh, camera: THREE.PerspectiveCamera) {
        this.killForwardTween();
        this.activePlane = plane;

        plane.getWorldPosition(this._forwardStartPos);
        this._forwardStartQuat.copy(plane.quaternion);

        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = window.innerWidth / window.innerHeight;
        const dist = PLANE_WIDTH / (2 * Math.tan(fovRad / 2) * aspect);

        camera.getWorldDirection(this._lookDir);
        this._worldPos.copy(camera.position).addScaledVector(this._lookDir, dist);
        this._worldNormal.copy(this._lookDir).negate().normalize();
        this._forwardEndQuat.setFromUnitVectors(this._planeFace, this._worldNormal);

        this._quatProxy.t = 0;
        this.forwardTween = gsap.timeline();
        this.forwardTween.to(plane.position, {
            x: this._worldPos.x,
            y: this._worldPos.y,
            z: this._worldPos.z,
            duration: ZOOM_IN_DURATION,
            ease: 'power3.out',
        }, 0);
        this.forwardTween.to(this._quatProxy, {
            t: 1,
            duration: ZOOM_IN_DURATION,
            ease: 'power3.out',
            onUpdate: () => {
                plane.quaternion.copy(this._forwardStartQuat).slerp(this._forwardEndQuat, this._quatProxy.t);
            },
        }, 0);
    }

    /** 選択 Plane を柱上面へ戻す */
    restoreForward() {
        if (!this.activePlane) return;
        this.killForwardTween();

        const plane = this.activePlane;
        this._quatProxy.t = 0;
        const fromQuat = plane.quaternion.clone();

        this.forwardTween = gsap.timeline({
            onComplete: () => {
                this.activePlane = null;
                this.forwardTween = null;
            },
        });
        this.forwardTween.to(plane.position, {
            x: this._forwardStartPos.x,
            y: this._forwardStartPos.y,
            z: this._forwardStartPos.z,
            duration: ZOOM_OUT_DURATION,
            ease: 'power3.out',
        }, 0);
        this.forwardTween.to(this._quatProxy, {
            t: 1,
            duration: ZOOM_OUT_DURATION,
            ease: 'power3.out',
            onUpdate: () => {
                plane.quaternion.copy(fromQuat).slerp(this._forwardStartQuat, this._quatProxy.t);
            },
        }, 0);
    }

    /** 非選択写真と全柱ベタをその場でフェードアウト */
    hideOthers(active: THREE.Mesh) {
        this.killOthersTween();
        this.activePlane = active;
        this.pillarFading = true;
        this.setRacFadeMaterials(true);

        const others = this.planes.filter((p) => p !== active);
        this.othersTween = gsap.timeline({
            onComplete: () => {
                others.forEach((p) => { p.visible = false; });
            },
        });
        if (others.length > 0) {
            this.othersTween.to(
                others.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity),
                {
                    value: 0,
                    duration: ZOOM_IN_DURATION,
                    ease: 'power2.in',
                },
                0,
            );
        }
        this.othersTween.to(
            this.racMaterials(),
            {
                opacity: 0,
                duration: ZOOM_IN_DURATION,
                ease: 'power2.in',
            },
            0,
        );
    }

    /** 写真と柱ベタの不透明度を戻す */
    restoreOthers() {
        this.killOthersTween();
        this.planes.forEach((p) => { p.visible = true; });
        this.setRacFadeMaterials(true);

        this.othersTween = gsap.timeline({
            onComplete: () => {
                this.pillarFading = false;
                this.setRacFadeMaterials(false);
            },
        });
        this.othersTween.to(
            this.planes.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity),
            {
                value: 1,
                duration: ZOOM_OUT_DURATION,
                ease: 'power2.out',
            },
            0,
        );
        this.othersTween.to(
            this.racMaterials(),
            {
                opacity: 1,
                duration: ZOOM_OUT_DURATION,
                ease: 'power2.out',
            },
            0,
        );
    }

    private racMaterials(): THREE.MeshBasicMaterial[] {
        return this.rectangles.map((r) => r.material as THREE.MeshBasicMaterial);
    }

    private setRacFadeMaterials(fading: boolean) {
        this.racMaterials().forEach((m) => {
            m.transparent = fading;
            m.depthWrite = !fading;
            if (!fading) m.opacity = 1;
        });
    }

    private killOthersTween() {
        if (this.othersTween) {
            this.othersTween.kill();
            this.othersTween = null;
        }
    }

    private killForwardTween() {
        if (this.forwardTween) {
            this.forwardTween.kill();
            this.forwardTween = null;
        }
    }

    show() {
        this.killOthersTween();
        this.killForwardTween();
        if (this.fadeTween) this.fadeTween.kill();

        this.activePlane = null;
        this.pillarFading = false;
        this.setRacFadeMaterials(false);
        this.planes.forEach((p) => {
            p.visible = true;
            p.scale.set(1, 1, 1);
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
        this.killOthersTween();
        this.killForwardTween();
        if (this.fadeTween) this.fadeTween.kill();

        this.activePlane = null;
        this.pillarFading = false;
        this.setRacFadeMaterials(false);
        this.planes.forEach((p) => p.scale.set(1, 1, 1));

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
