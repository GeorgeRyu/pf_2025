import * as THREE from 'three';
import gsap from 'gsap';
import { getProject, types, createRafDriver, type IProject, type ISheet, type IRafDriver } from '@theatre/core';

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
    private rafDriver!: IRafDriver;

    getSheet(): ISheet {
        return this.theatreSheet;
    }

    getSequenceLength(): number {
        return this.sequenceLength;
    }

    /** レンダーループから毎フレーム呼ぶ。Studio なしで onValuesChange を発火させる。 */
    tick(time: number) {
        this.rafDriver?.tick(time);
    }

    async init(targets: TheatreBindTargets): Promise<void> {
        this.rafDriver = createRafDriver({ name: 'three-render-loop' });

        const isMobile = window.innerWidth <= 1023;
        const projectName = isMobile ? 'sevenLinesMotionSP' : 'sevenLinesMotionPC';
        let projectState = null;

        try {
            if (isMobile) {
                const spData = await import('../../../json/spAnimation.json');
                projectState = spData.default;
            } else {
                const pcData = await import('../../../json/pcAnimation.json');
                projectState = pcData.default;
            }
        } catch (error) {
            console.warn('Failed to load animation JSON:', error);
        }

        if (projectState) {
            this.theatreProject = getProject(projectName, { state: projectState });
        } else {
            this.theatreProject = getProject(projectName);
        }

        const sheetName = projectState?.sheetsById
            ? Object.keys(projectState.sheetsById)[0]
            : 'sevenLinesMotion';

        this.theatreSheet = this.theatreProject.sheet(sheetName);

        await this.theatreProject.ready;

        if (projectState?.sheetsById?.[sheetName]?.sequence?.length) {
            this.sequenceLength = projectState.sheetsById[sheetName].sequence.length;
        }

        this.bindObject3D('groupRectangles', targets.groupRectangles);
        targets.rectangles.forEach((rect, i) => {
            this.bindObject3D(`rac${i + 1}`, rect);
        });
        this.bindObject3D('worksPlate', targets.worksPlate);
    }

    async playLoadingAnimation(
        getVideoProgress: () => number,
        onNearComplete?: () => void,
    ): Promise<void> {
        const loadingFirstPosition = this.sequenceLength * 0.1;
        const loadingEndPosition = this.sequenceLength * 0.2;

        this.theatreSheet.sequence.position = 0;

        // Phase1: 最低1.2sは棒を見せる。動画進捗でまだらにしつつ、最大3sで打ち切る
        const minDuration = 1.2;
        const maxDuration = 3;
        const pauseBeforePhase2 = 0.3;
        const startTime = performance.now();

        const phase1aResult = await new Promise<'done' | 'timeout'>((resolve) => {
            const tick = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                const timeProgress = Math.min(elapsed / minDuration, 1);
                const videoProgress = Math.min(Math.max(getVideoProgress(), 0), 1);
                // キャッシュ時は time で伸びる。遅い回線は video に引っ張られつつ time*0.5 で下限
                const displayProgress = Math.min(
                    timeProgress,
                    Math.max(videoProgress, timeProgress * 0.5)
                );

                this.theatreSheet.sequence.position = loadingFirstPosition * displayProgress;

                if (videoProgress >= 1 && elapsed >= minDuration) {
                    gsap.ticker.remove(tick);
                    resolve('done');
                } else if (elapsed >= maxDuration) {
                    gsap.ticker.remove(tick);
                    resolve('timeout');
                }
            };
            gsap.ticker.add(tick);
        });

        // 未到達なら追いつき（timeout: 1s / 完了直後の微小不足: 0.3s）
        const current = this.theatreSheet.sequence.position;
        if (current < loadingFirstPosition - 0.001) {
            const catchUpDuration = phase1aResult === 'timeout' ? 1 : 0.3;
            await new Promise<void>((resolve) => {
                const currentPos = { value: current };
                gsap.to(currentPos, {
                    value: loadingFirstPosition,
                    duration: catchUpDuration,
                    ease: 'power2.out',
                    onUpdate: () => {
                        this.theatreSheet.sequence.position = currentPos.value;
                    },
                    onComplete: resolve,
                });
            });
        } else {
            this.theatreSheet.sequence.position = loadingFirstPosition;
        }

        // Phase1 完了後、一拍おいて Phase2 へ
        await new Promise<void>((resolve) => {
            gsap.delayedCall(pauseBeforePhase2, resolve);
        });

        // Phase 2: loadingFirstPosition → loadingEndPosition へ tween
        const phase2Duration = 4;
        const nearCompleteThreshold = (phase2Duration - 0.8) / phase2Duration;
        return new Promise<void>((resolve) => {
            const positionObj = { value: loadingFirstPosition };
            let nearCompleteTriggered = false;
            const tween = gsap.to(positionObj, {
                value: loadingEndPosition,
                duration: phase2Duration,
                ease: 'power2.out',
                onUpdate: () => {
                    this.theatreSheet.sequence.position = positionObj.value;
                    if (!nearCompleteTriggered && tween.progress() >= nearCompleteThreshold) {
                        nearCompleteTriggered = true;
                        onNearComplete?.();
                    }
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
        }, this.rafDriver);
    }
}
