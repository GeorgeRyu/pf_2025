import * as THREE from 'three';
import Stats from 'stats.js';
import { GUI } from 'lil-gui';

export type WebGLDebugDeps = {
    getGroupRectangles: () => THREE.Group;
    getRectangles: () => THREE.Mesh[];
    getWorksPlate: () => THREE.Mesh;
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

        document.addEventListener('scroll', () => {
            const g = deps.getGroupRectangles();
            console.log('groupRectangles pos:', g.position.x, g.position.y, g.position.z);
            console.log('groupRectangles rot:', g.rotation.x, g.rotation.y, g.rotation.z);
        });
    }
}
