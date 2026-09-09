import * as THREE from 'three';
import Stats from 'stats.js';
import { GUI } from 'lil-gui';
import type { AboutImageConfig } from '../types';

export type WebGLDebugDeps = {
    getGroupRectangles: () => THREE.Group;
    getRectangles: () => THREE.Mesh[];
    getWorksPlate: () => THREE.Mesh;
    getAboutImageConfig?: () => AboutImageConfig;
    onAboutImageConfigChange?: (partial: Partial<AboutImageConfig>) => void;
};

/**
 * lil-gui / stats.js によるデバッグ UI。
 */
export class WebGLDebugPanel {
    readonly stats: Stats;
    readonly gui: GUI;

    constructor(private readonly deps: WebGLDebugDeps) {
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        this.gui = new GUI();
        const groupRectangles = deps.getGroupRectangles();
        const groupFolder = this.gui.addFolder('Group Rectangles');
        groupFolder.add(groupRectangles.position, 'x', -50, 50).name('Group Pos X');
        groupFolder.add(groupRectangles.position, 'y', -50, 50).name('Group Pos Y');
        groupFolder.add(groupRectangles.position, 'z', -50, 50).name('Group Pos Z');
        groupFolder.add(groupRectangles.rotation, 'x', -Math.PI, Math.PI).name('Group Rot X');
        groupFolder.add(groupRectangles.rotation, 'y', -Math.PI, Math.PI).name('Group Rot Y');
        groupFolder.add(groupRectangles.rotation, 'z', -Math.PI, Math.PI).name('Group Rot Z');
        groupFolder.add(groupRectangles.scale, 'x', 0, 5).name('Group Scale X');
        groupFolder.add(groupRectangles.scale, 'y', 0, 5).name('Group Scale Y');
        groupFolder.add(groupRectangles.scale, 'z', 0, 5).name('Group Scale Z');

        deps.getRectangles().forEach((rect, index) => {
            const rectFolder = this.gui.addFolder(`Rectangle ${index + 1}`).close();
            rectFolder.add(rect.position, 'x', -50, 50).name(`Rac${index + 1} Pos X`);
            rectFolder.add(rect.position, 'y', -50, 50).name(`Rac${index + 1} Pos Y`);
            rectFolder.add(rect.position, 'z', -50, 50).name(`Rac${index + 1} Pos Z`);
            rectFolder.add(rect.rotation, 'x', -Math.PI, Math.PI).name(`Rac${index + 1} Rot X`);
            rectFolder.add(rect.rotation, 'y', -Math.PI, Math.PI).name(`Rac${index + 1} Rot Y`);
            rectFolder.add(rect.rotation, 'z', -Math.PI, Math.PI).name(`Rac${index + 1} Rot Z`);
            rectFolder.add(rect.scale, 'x', 0, 5).name(`Rac${index + 1} Scale X`);
            rectFolder.add(rect.scale, 'y', 0, 5).name(`Rac${index + 1} Scale Y`);
            rectFolder.add(rect.scale, 'z', 0, 5).name(`Rac${index + 1} Scale Z`);
        });

        const worksPlate = deps.getWorksPlate();
        const worksPlateGroup = this.gui.addFolder('Works Plate').close();
        worksPlateGroup.add(worksPlate.position, 'x', -180, 180).name('Works Plate Pos X');
        worksPlateGroup.add(worksPlate.position, 'y', -50, 50).name('Works Plate Pos Y');
        worksPlateGroup.add(worksPlate.position, 'z', -50, 50).name('Works Plate Pos Z');

        this.setupAboutLensFolders(deps);
    }

    /** About 円形レンズのパラメータ。?debug=lil で調整する */
    private setupAboutLensFolders(deps: WebGLDebugDeps) {
        const aboutConfig = deps.getAboutImageConfig?.();
        if (!aboutConfig || !deps.onAboutImageConfigChange) return;

        const notify = () => deps.onAboutImageConfigChange!({ ...aboutConfig });

        const circleFolder = this.gui.addFolder('About Circle');
        circleFolder.add(aboutConfig, 'lensRadius', 0.05, 0.6, 0.01).name('Radius').onChange(notify);
        circleFolder.add(aboutConfig, 'lensSoftness', 0, 0.99, 0.01).name('Softness').onChange(notify);
        circleFolder.add(aboutConfig, 'lensDistortion', -5, 5, 0.01).name('Lens Distortion').onChange(notify);

        const rgbFolder = this.gui.addFolder('About RGB Shift').close();
        rgbFolder.add(aboutConfig, 'rgbShiftR', -0.05, 0.05, 0.001).name('Red Shift').onChange(notify);
        rgbFolder.add(aboutConfig, 'rgbShiftG', -0.05, 0.05, 0.001).name('Green Shift').onChange(notify);
        rgbFolder.add(aboutConfig, 'rgbShiftB', -0.05, 0.05, 0.001).name('Blue Shift').onChange(notify);

        const waveFolder = this.gui.addFolder('About Wave').close();
        waveFolder.add(aboutConfig, 'waveFrequency', 0, 200, 1).name('Wave Frequency').onChange(notify);
        waveFolder.add(aboutConfig, 'waveStrength', 0, 0.1, 0.001).name('Wave Strength').onChange(notify);
        waveFolder.add(aboutConfig, 'waveSpeed', 0, 5, 0.01).name('Wave Speed').onChange(notify);

        const randomFolder = this.gui.addFolder('About Random').close();
        randomFolder.add(aboutConfig, 'randomFrequency', 0.1, 20, 0.1).name('Random Frequency').onChange(notify);
        randomFolder.add(aboutConfig, 'randomStrength', 0, 0.1, 0.001).name('Random Strength').onChange(notify);
        randomFolder.add(aboutConfig, 'randomSpeed', 0, 5, 0.01).name('Random Speed').onChange(notify);

        const pointerFolder = this.gui.addFolder('About Pointer').close();
        pointerFolder.add(aboutConfig, 'pointerEase', 0.01, 0.4, 0.01).name('Ease').onChange(notify);

        const duotoneFolder = this.gui.addFolder('About Duotone');
        duotoneFolder.add(aboutConfig, 'duotoneBalance', 0, 1, 0.01).name('Balance').onChange(notify);
    }
}
