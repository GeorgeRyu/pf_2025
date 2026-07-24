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
    getPhotoPlanesGroup?: () => THREE.Group | null;
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

    constructor(container: HTMLElement | null) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    }

    mount() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        if (this.container) {
            this.container.appendChild(this.renderer.domElement);
        }
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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

            if (deps.isPC() && deps.getActiveSection() === 'about') {
                const u = plateShaderMaterial.uniforms.imageMouseUv.value as THREE.Vector2;
                u.lerp(deps.getMouseUvTarget(), 0.18);
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
            this.renderDefaultStencil(worksPlate, groupRectangles, gl);
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
