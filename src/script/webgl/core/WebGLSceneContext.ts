import * as THREE from 'three';
import type { ActiveSection } from '../types';

export type WebGLRenderLoopDeps = {
    getPlateShaderMaterial: () => THREE.ShaderMaterial;
    getWorksPlate: () => THREE.Mesh;
    getGroupRectangles: () => THREE.Group;
    getRectangles?: () => THREE.Mesh[];
    isPC: () => boolean;
    getActiveSection: () => ActiveSection;
    getMouseUvTarget: () => THREE.Vector2;
    getLensActiveTarget: () => number;
    getPhotoPlanesGroup?: () => THREE.Group | null;
    getPhotosPillarFading?: () => boolean;
    /** Playground ホバー中のフォーカスバー index。null なら通常描画 */
    getPlaygroundFocusedIndex?: () => number | null;
    onTick?: (time: number) => void;
    onFrameStart?: () => void;
    onFrameEnd?: () => void;
};

/**
 * Three.js シーン・レンダラー・ステンシル描画ループ。
 */
export class WebGLSceneContext {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene: THREE.Scene;
    readonly camera: THREE.PerspectiveCamera;

    private readonly container: HTMLElement | null;
    private lastFrameTime = 0;
    private rafId = 0;
    private viewWidth = 0;
    private viewHeight = 0;

    constructor(container: HTMLElement | null) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
        this.scene = new THREE.Scene();
        const { width, height } = this.getViewportSize();
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    }

    /** CSS コンテナ基準。アドレスバー変動の innerHeight には追従しない。 */
    getViewportSize() {
        const width = this.container?.clientWidth || window.innerWidth;
        const height = this.container?.clientHeight || window.innerHeight;
        return { width: Math.max(1, width), height: Math.max(1, height) };
    }

    clientToNdc(clientX: number, clientY: number, target: THREE.Vector2) {
        const { width, height } = this.getViewportSize();
        target.set((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1);
    }

    mount() {
        this.applySize(true);
        this.renderer.setClearColor(0x000000, 0);
        if (this.container) {
            this.container.appendChild(this.renderer.domElement);
        }
    }

    resize() {
        this.applySize(false);
    }

    private applySize(force: boolean) {
        const { width, height } = this.getViewportSize();
        if (!force && width === this.viewWidth && height === this.viewHeight) return;

        this.viewWidth = width;
        this.viewHeight = height;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);
    }

    startRenderLoop(deps: WebGLRenderLoopDeps) {
        const loop = () => {
            this.rafId = requestAnimationFrame(loop);
            this.renderFrame(deps);
        };
        loop();
    }

    stopRenderLoop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
    }

    private renderFrame(deps: WebGLRenderLoopDeps) {
        deps.onTick?.(performance.now());
        deps.onFrameStart?.();

        const plateShaderMaterial = deps.getPlateShaderMaterial();
        if (plateShaderMaterial) {
            const now = performance.now() * 0.001;
            const dt = this.lastFrameTime > 0 ? Math.min(now - this.lastFrameTime, 0.1) : 0.016;
            this.lastFrameTime = now;

            plateShaderMaterial.uniforms.time.value += dt;

            const ease = Number(plateShaderMaterial.uniforms.imagePointerEase?.value ?? 0.1);
            const lensActive = plateShaderMaterial.uniforms.imageLensActive;
            if (lensActive) {
                const activeTarget =
                    deps.getActiveSection() === 'about' ? deps.getLensActiveTarget() : 0;
                lensActive.value = THREE.MathUtils.lerp(Number(lensActive.value), activeTarget, ease);
            }

            if (deps.getActiveSection() === 'about') {
                const u = plateShaderMaterial.uniforms.imageMouseUv.value as THREE.Vector2;
                u.lerp(deps.getMouseUvTarget(), ease);
            }
        }

        const worksPlate = deps.getWorksPlate();
        const groupRectangles = deps.getGroupRectangles();
        if (!worksPlate || !groupRectangles) return;

        const gl = this.renderer.getContext();
        const photoPlanesGroup = deps.getPhotoPlanesGroup?.() ?? null;
        const focusedIndex = deps.getPlaygroundFocusedIndex?.() ?? null;

        if (photoPlanesGroup) photoPlanesGroup.visible = false;

        this.renderer.autoClear = false;
        this.renderer.clear(true, true, true);

        if (focusedIndex != null && deps.getRectangles) {
            this.renderPlaygroundHover(
                deps,
                worksPlate,
                groupRectangles,
                focusedIndex,
                gl,
            );
        } else {
            const rectangles = deps.getRectangles?.() ?? [];
            const fading = deps.getPhotosPillarFading?.() ?? false;
            if (fading) {
                this.renderPhotosPillarFade(worksPlate, groupRectangles, rectangles, gl);
            } else {
                this.renderDefaultStencil(worksPlate, groupRectangles, gl);
            }
        }

        // Pass: photo planes のみ、stencil なし、depth クリアで depth 干渉防止
        if (photoPlanesGroup) {
            photoPlanesGroup.visible = true;
            worksPlate.visible = false;
            groupRectangles.visible = false;
            gl.disable(gl.STENCIL_TEST);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            this.renderer.render(this.scene, this.camera);
        }

        // リセット
        worksPlate.visible = true;
        groupRectangles.visible = true;
        const rectangles = deps.getRectangles?.() ?? [];
        rectangles.forEach((r) => { r.visible = true; });
        gl.disable(gl.STENCIL_TEST);
        this.renderer.autoClear = true;

        deps.onFrameEnd?.();
    }

    /** 通常: 全バーをステンシル → プレート */
    private renderDefaultStencil(
        worksPlate: THREE.Mesh,
        groupRectangles: THREE.Group,
        gl: WebGLRenderingContext | WebGL2RenderingContext,
    ) {
        gl.enable(gl.STENCIL_TEST);

        worksPlate.visible = false;
        groupRectangles.visible = true;
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        this.renderer.render(this.scene, this.camera);

        worksPlate.visible = true;
        groupRectangles.visible = false;
        gl.stencilFunc(gl.EQUAL, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Photos ズーム中: ステンシルせず、柱を accent ベタの半透明として描く。
     */
    private renderPhotosPillarFade(
        worksPlate: THREE.Mesh,
        groupRectangles: THREE.Group,
        rectangles: THREE.Mesh[],
        gl: WebGLRenderingContext | WebGL2RenderingContext,
    ) {
        gl.disable(gl.STENCIL_TEST);
        worksPlate.visible = false;
        groupRectangles.visible = true;
        rectangles.forEach((r) => {
            r.visible = (r.material as THREE.MeshBasicMaterial).opacity > 0.001;
        });
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Playground ホバー:
     * 1) 非フォーカスバーをベタ色で直接描画
     * 2) フォーカスバーのみステンシル
     * 3) プレート（動画/ノイズ）をステンシル内に描画
     */
    private renderPlaygroundHover(
        deps: WebGLRenderLoopDeps,
        worksPlate: THREE.Mesh,
        groupRectangles: THREE.Group,
        focusedIndex: number,
        gl: WebGLRenderingContext | WebGL2RenderingContext,
    ) {
        const rectangles = deps.getRectangles?.() ?? [];

        // Pass A: 非フォーカスバーをベタ色で描画
        worksPlate.visible = false;
        groupRectangles.visible = true;
        rectangles.forEach((r, i) => {
            r.visible = i !== focusedIndex;
        });
        gl.disable(gl.STENCIL_TEST);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);

        // Pass B: フォーカスバーをステンシルに書き込み
        gl.enable(gl.STENCIL_TEST);
        gl.clear(gl.STENCIL_BUFFER_BIT);
        rectangles.forEach((r, i) => {
            r.visible = i === focusedIndex;
        });
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        this.renderer.render(this.scene, this.camera);

        // Pass C: プレートをステンシル内に描画
        worksPlate.visible = true;
        groupRectangles.visible = false;
        rectangles.forEach((r) => { r.visible = false; });
        gl.stencilFunc(gl.EQUAL, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);
    }
}
