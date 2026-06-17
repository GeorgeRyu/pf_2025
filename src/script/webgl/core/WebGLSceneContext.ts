import * as THREE from 'three';
import type { ActiveSection } from '../types';

export type WebGLRenderLoopDeps = {
    getPlateShaderMaterial: () => THREE.ShaderMaterial;
    getWorksPlate: () => THREE.Mesh;
    getGroupRectangles: () => THREE.Group;
    isPC: () => boolean;
    getActiveSection: () => ActiveSection;
    getMouseUvTarget: () => THREE.Vector2;
    getPhotoPlanesGroup?: () => THREE.Group | null;
    onTick?: (time: number) => void;
    onFrameStart?: () => void;
    onFrameEnd?: () => void;
};

/**
 * Three.js シーン・レンダラー・ステンシル3パス描画ループ。
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

        // Pass 1/2 から photo planes を除外（stencil buffer 汚染防止）
        if (photoPlanesGroup) photoPlanesGroup.visible = false;

        gl.enable(gl.STENCIL_TEST);

        this.renderer.autoClear = false;
        this.renderer.clear(true, true, true);

        // Pass 1: マスク（rectangles）をステンシルバッファに書き込む
        worksPlate.visible = false;
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        this.renderer.render(this.scene, this.camera);

        // Pass 2: worksPlate をステンシルテスト有効でレンダリング
        worksPlate.visible = true;
        groupRectangles.visible = false;
        gl.stencilFunc(gl.EQUAL, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);

        // Pass 3: photo planes のみ、stencil なし、depth クリアで depth 干渉防止
        if (photoPlanesGroup) {
            photoPlanesGroup.visible = true;
            worksPlate.visible = false;
            gl.disable(gl.STENCIL_TEST);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            this.renderer.render(this.scene, this.camera);
        }

        // リセット
        worksPlate.visible = true;
        groupRectangles.visible = true;
        gl.disable(gl.STENCIL_TEST);
        this.renderer.autoClear = true;

        deps.onFrameEnd?.();
    }
}
