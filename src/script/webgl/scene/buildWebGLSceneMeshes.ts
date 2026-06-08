import * as THREE from 'three';
import type { AboutImageConfig } from '../types';
import { createRectangleMask } from './RectangleMask';
import { createWorksPlateMesh } from './WorksPlateMesh';

export type WebGLSceneMeshes = {
    rectangles: THREE.Mesh[];
    rectangleMaterials: THREE.MeshBasicMaterial[];
    groupRectangles: THREE.Group;
    worksPlate: THREE.Mesh;
    plateShaderMaterial: THREE.ShaderMaterial;
};

/**
 * 柱マスク + worksPlate（シェーダー付き）をまとめて構築する。
 */
export function buildWebGLSceneMeshes(aboutConfig: AboutImageConfig): WebGLSceneMeshes {
    const mask = createRectangleMask();
    const plate = createWorksPlateMesh(aboutConfig);

    return {
        rectangles: mask.rectangles,
        rectangleMaterials: mask.materials,
        groupRectangles: mask.group,
        worksPlate: plate.mesh,
        plateShaderMaterial: plate.material,
    };
}
