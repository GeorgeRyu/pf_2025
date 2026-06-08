import * as THREE from 'three';
import gsap from 'gsap';
import type { AboutImageConfig } from '../types';

type GsapMatchMedia = ReturnType<typeof gsap.matchMedia>;

export type WebGLSceneLayoutTargets = {
    camera: THREE.PerspectiveCamera;
    groupRectangles: THREE.Group;
    worksPlate: THREE.Mesh;
    plateShaderMaterial: THREE.ShaderMaterial;
    aboutConfig: AboutImageConfig;
    setIsPC: (isPC: boolean) => void;
};

/**
 * PC/SP ごとのカメラ・柱グループ・worksPlate 初期配置。
 */
export function bindWebGLSceneLayout(mm: GsapMatchMedia, targets: WebGLSceneLayoutTargets) {
    mm.add('(max-width: 1023px)', () => {
        targets.camera.position.z = 18;
        targets.groupRectangles.position.set(-9, -3.5, -15);
        targets.worksPlate.position.set(-9, -3.5, -16);
        targets.setIsPC(false);
        targets.plateShaderMaterial.uniforms.imageMouseStrength.value = 0.0;
    });

    mm.add('(min-width: 1024px)', () => {
        targets.camera.position.z = 5;
        targets.groupRectangles.position.set(-17, -6, -15);
        targets.worksPlate.position.set(-18, -4.5, -19);
        targets.setIsPC(true);
        targets.plateShaderMaterial.uniforms.imageMouseStrength.value =
            targets.aboutConfig.mousePcStrength;
    });
}
