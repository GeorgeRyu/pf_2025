import * as THREE from 'three';
import gsap from 'gsap';
import { getProject, types, type IProject, type ISheet } from '@theatre/core';

export type TheatreBindTargets = {
    groupRectangles: THREE.Group;
    rectangles: THREE.Mesh[];
    worksPlate: THREE.Mesh;
};

/**
 * Theatre.js プロジェクト読込・オブジェクトバインド・ローディングアニメ。
 */
export class TheatreController {
    private theatreProject!: IProject;
    private theatreSheet!: ISheet;
    private sequenceLength = 20;

    getSheet(): ISheet {
        return this.theatreSheet;
    }

    getSequenceLength(): number {
        return this.sequenceLength;
    }

    async init(targets: TheatreBindTargets): Promise<void> {
        const isMobile = window.innerWidth <= 1023;
        const projectName = isMobile ? 'sevenLinesMotionSP' : 'sevenLinesMotionPC';
        let projectState = null;

        try {
            if (isMobile) {
                const spData = await import('../../../json/spAnimation.json');
                projectState = spData.default;
                console.log('📱 SP animation will be loaded (when available)');
            } else {
                const pcData = await import('../../../json/pcAnimation.json');
                projectState = pcData.default;
                console.log('💻 PC animation JSON loaded');
            }
        } catch (error) {
            console.error('❌ Failed to load animation JSON:', error);
        }

        if (projectState) {
            console.log('✅ Loading project with saved state');
            this.theatreProject = getProject(projectName, { state: projectState });
        } else {
            console.log('🆕 Creating new project (no saved state)');
            this.theatreProject = getProject(projectName);
        }

        const sheetName = projectState?.sheetsById
            ? Object.keys(projectState.sheetsById)[0]
            : 'sevenLinesMotion';

        console.log('📄 Sheet name:', sheetName);

        this.theatreSheet = this.theatreProject.sheet(sheetName);

        await this.theatreProject.ready;

        if (projectState?.sheetsById?.[sheetName]?.sequence?.length) {
            this.sequenceLength = projectState.sheetsById[sheetName].sequence.length;
        }
        console.log('📏 Sequence length:', this.sequenceLength);

        this.bindObject3D('groupRectangles', targets.groupRectangles);
        targets.rectangles.forEach((rect, i) => {
            this.bindObject3D(`rac${i + 1}`, rect);
        });
        this.bindObject3D('worksPlate', targets.worksPlate);

        console.log('✅ Theatre.js binding complete');
    }

    async playLoadingAnimation(): Promise<void> {
        const loadingEndPosition = this.sequenceLength * 0.2;
        console.log('🎬 Loading animation: 0 → ', loadingEndPosition);

        this.theatreSheet.sequence.position = 0;

        return new Promise<void>((resolve) => {
            const positionObj = { value: 0 };
            gsap.to(positionObj, {
                value: loadingEndPosition,
                duration: 5,
                onUpdate: () => {
                    this.theatreSheet.sequence.position = positionObj.value;
                },
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    private bindObject3D(name: string, obj: THREE.Object3D) {
        const tObj = this.theatreSheet.object(name, {
            position: types.compound({
                x: types.number(obj.position.x, { range: [-50, 50] }),
                y: types.number(obj.position.y, { range: [-50, 50] }),
                z: types.number(obj.position.z, { range: [-50, 50] }),
            }),
            rotation: types.compound({
                x: types.number(obj.rotation.x, { range: [-Math.PI * 2, Math.PI * 2] }),
                y: types.number(obj.rotation.y, { range: [-Math.PI * 2, Math.PI * 2] }),
                z: types.number(obj.rotation.z, { range: [-Math.PI * 2, Math.PI * 2] }),
            }),
            scale: types.compound({
                x: types.number(obj.scale.x, { range: [0, 5] }),
                y: types.number(obj.scale.y, { range: [0, 5] }),
                z: types.number(obj.scale.z, { range: [0, 5] }),
            }),
        });

        tObj.onValuesChange((v) => {
            obj.position.set(v.position.x, v.position.y, v.position.z);
            obj.rotation.set(v.rotation.x, v.rotation.y, v.rotation.z);
            obj.scale.set(v.scale.x, v.scale.y, v.scale.z);
        });
    }
}
