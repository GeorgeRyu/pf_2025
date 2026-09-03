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
const RECEDE_DISTANCE_SP = 0.5;
const RECEDE_DISTANCE_PC = 0.25;

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
    private readonly _recede = { z: 0 };
    private _otherRestWorld: THREE.Vector3[] = [];
    private _otherRestLocal: THREE.Vector3[] = [];

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
    private readonly _xRotInv = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), Math.PI / 2
    );
    private readonly _parentWorldQuat = new THREE.Quaternion();
    private readonly _rectLocalPos = new THREE.Vector3();
    private readonly _rectLocalQuat = new THREE.Quaternion();
    private readonly _topOffset = new THREE.Vector3();

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

    /**
     * Theatre.tick 直後に呼ぶ。
     * ズーム中の柱を写真の後ろへ追従させ、他の柱は開始位置から lookDir * recede だけ下げる。
     */
    applyActiveRectOverride() {
        const plane = this.activePlane;
        if (plane) {
            const activeIndex = this.planes.indexOf(plane);
            const rect = this.rectangles[activeIndex];
            const parent = rect?.parent;
            if (rect && parent) {
                parent.updateMatrixWorld(true);

                this._worldQuat.copy(plane.quaternion).multiply(this._xRotInv);
                parent.getWorldQuaternion(this._parentWorldQuat);
                this._rectLocalQuat.copy(this._parentWorldQuat).invert().multiply(this._worldQuat);

                this._worldNormal.set(0, 1, 0).applyQuaternion(this._worldQuat);
                this._worldPos.copy(plane.position).addScaledVector(this._worldNormal, -WORLD_FRONT_OFFSET);
                parent.worldToLocal(this._rectLocalPos.copy(this._worldPos));
                this._topOffset.set(0, PILLAR_TOP_LOCAL_Y * rect.scale.y, 0).applyQuaternion(this._rectLocalQuat);

                rect.position.copy(this._rectLocalPos).sub(this._topOffset);
                rect.quaternion.copy(this._rectLocalQuat);
            }
        }

        if (this._otherRestWorld.length === 0) return;
        const recede = this._recede.z;
        const activeIndex = plane ? this.planes.indexOf(plane) : -1;
        this.rectangles.forEach((other, i) => {
            if (i === activeIndex) return;
            const restWorld = this._otherRestWorld[i];
            const otherParent = other.parent;
            if (!restWorld || !otherParent) return;
            otherParent.updateMatrixWorld(true);
            this._worldPos.copy(restWorld).addScaledVector(this._lookDir, recede);
            otherParent.worldToLocal(this._rectLocalPos.copy(this._worldPos));
            other.position.copy(this._rectLocalPos);
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

    /** 非選択写真と、アクティブ以外の柱ベタを奥へ下げながらフェードアウト */
    hideOthers(active: THREE.Mesh) {
        this.killOthersTween();
        this.activePlane = active;
        this.pillarFading = true;
        const activeIndex = this.planes.indexOf(active);
        this.setRacFadeMaterials(true, activeIndex);
        this.captureOtherRest();

        const others = this.planes.filter((p) => p !== active);
        const otherMats = this.otherRacMaterials(activeIndex);
        this.othersTween = gsap.timeline({
            onComplete: () => {
                others.forEach((p) => { p.visible = false; });
            },
        });
        this.othersTween.to(this._recede, {
            z: window.innerWidth <= 1023 ? RECEDE_DISTANCE_SP : RECEDE_DISTANCE_PC,
            duration: ZOOM_IN_DURATION,
            ease: 'power3.out',
        }, 0);
        if (others.length > 0) {
            this.othersTween.to(
                others.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity),
                {
                    value: 0,
                    duration: ZOOM_IN_DURATION,
                    ease: 'power3.out',
                },
                0,
            );
        }
        if (otherMats.length > 0) {
            this.othersTween.to(
                otherMats,
                {
                    opacity: 0,
                    duration: ZOOM_IN_DURATION,
                    ease: 'power3.out',
                },
                0,
            );
        }
    }

    /** 写真と柱ベタの不透明度・奥行きを戻す */
    restoreOthers() {
        this.killOthersTween();
        this.planes.forEach((p) => { p.visible = true; });
        const activeIndex = this.activePlane ? this.planes.indexOf(this.activePlane) : -1;
        this.setRacFadeMaterials(true, activeIndex);

        const otherMats = this.otherRacMaterials(activeIndex);
        this.othersTween = gsap.timeline({
            onComplete: () => {
                this.pillarFading = false;
                this.setRacFadeMaterials(false);
                this.restoreOtherRest();
            },
        });
        this.othersTween.to(this._recede, {
            z: 0,
            duration: ZOOM_OUT_DURATION,
            ease: 'power3.out',
        }, 0);
        this.othersTween.to(
            this.planes.map((p) => (p.material as THREE.ShaderMaterial).uniforms.opacity),
            {
                value: 1,
                duration: ZOOM_OUT_DURATION,
                ease: 'power2.out',
            },
            0,
        );
        if (otherMats.length > 0) {
            this.othersTween.to(
                otherMats,
                {
                    opacity: 1,
                    duration: ZOOM_OUT_DURATION,
                    ease: 'power2.out',
                },
                0,
            );
        }
    }

    private captureOtherRest() {
        this.rectangles.forEach((r) => r.updateMatrixWorld(true));
        this._otherRestWorld = this.rectangles.map((r) => r.getWorldPosition(new THREE.Vector3()));
        this._otherRestLocal = this.rectangles.map((r) => r.position.clone());
    }

    private restoreOtherRest() {
        this.rectangles.forEach((r, i) => {
            const local = this._otherRestLocal[i];
            if (local) r.position.copy(local);
        });
        this._otherRestWorld = [];
        this._otherRestLocal = [];
        this._recede.z = 0;
    }

    private otherRacMaterials(activeIndex: number): THREE.MeshBasicMaterial[] {
        return this.rectangles
            .filter((_, i) => i !== activeIndex)
            .map((r) => r.material as THREE.MeshBasicMaterial);
    }

    private setRacFadeMaterials(fading: boolean, activeIndex = -1) {
        this.rectangles.forEach((r, i) => {
            const m = r.material as THREE.MeshBasicMaterial;
            const keepSolid = !fading || i === activeIndex;
            m.transparent = !keepSolid;
            m.depthWrite = keepSolid;
            if (keepSolid) m.opacity = 1;
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
        this.restoreOtherRest();
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
        this.restoreOtherRest();
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
