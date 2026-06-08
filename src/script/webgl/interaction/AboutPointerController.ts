import * as THREE from 'three';
import type { ActiveSection } from '../types';

export type AboutPointerDeps = {
    getWorksPlate: () => THREE.Mesh | undefined;
    getCamera: () => THREE.PerspectiveCamera;
    isPC: () => boolean;
    getActiveSection: () => ActiveSection;
    mouseUvTarget: THREE.Vector2;
};

/**
 * About セクション（PC）で worksPlate 上の UV をカーソル追従。
 */
export class AboutPointerController {
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointerNdc = new THREE.Vector2();

    constructor(private readonly deps: AboutPointerDeps) {}

    private onPointerMove = (e: PointerEvent) => {
        if (!this.deps.isPC() || this.deps.getActiveSection() !== 'about') return;

        const worksPlate = this.deps.getWorksPlate();
        if (!worksPlate) return;

        this.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointerNdc, this.deps.getCamera());
        const hits = this.raycaster.intersectObject(worksPlate, false);
        if (hits.length > 0 && hits[0].uv) {
            this.deps.mouseUvTarget.copy(hits[0].uv);
        }
    };

    attach() {
        window.addEventListener('pointermove', this.onPointerMove);
    }
}
