import * as THREE from 'three';
import plateVertexShader from '../shaders/plateVertex.glsl?raw';
import plateFragmentShader from '../shaders/plateFragment.glsl?raw';
import type { AboutImageConfig } from '../types';

export const PLATE_SIZE = 38;

export type WebGLSceneMeshes = {
    rectangles: THREE.Mesh[];
    rectangleMaterials: THREE.MeshBasicMaterial[];
    groupRectangles: THREE.Group;
    worksPlate: THREE.Mesh;
    plateShaderMaterial: THREE.ShaderMaterial;
};

const RECTANGLE_COUNT = 7;
const BOX_SIZE = { x: 2, y: 35, z: 1.1256 };

function createRectangleMask(): {
    rectangles: THREE.Mesh[];
    materials: THREE.MeshBasicMaterial[];
    group: THREE.Group;
} {
    const geometry = new THREE.BoxGeometry(BOX_SIZE.x, BOX_SIZE.y, BOX_SIZE.z);
    const rectangles: THREE.Mesh[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];

    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide,
        });
        materials.push(material);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.z = (Math.PI / 12) * i;
        mesh.scale.z = 0.01;
        rectangles.push(mesh);
    }

    const group = new THREE.Group();
    group.add(...rectangles);

    return { rectangles, materials, group };
}

function createWorksPlateMesh(aboutConfig: AboutImageConfig): {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
} {
    const geometry = new THREE.PlaneGeometry(PLATE_SIZE, PLATE_SIZE);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            textureA: { value: null },
            textureB: { value: null },
            colorA: { value: new THREE.Color(0, 0, 0) },
            colorB: { value: new THREE.Color(0, 0, 0) },
            baseColor: { value: new THREE.Color(0, 0, 0) },
            progress: { value: 0.0 },
            useTexture: { value: 0.0 },
            fadeOutProgress: { value: 0.0 },
            time: { value: 0.0 },
            uvScaleA: { value: new THREE.Vector2(1, 1) },
            uvOffsetA: { value: new THREE.Vector2(0, 0) },
            uvScaleB: { value: new THREE.Vector2(1, 1) },
            uvOffsetB: { value: new THREE.Vector2(0, 0) },
            imageMode: { value: 0.0 },
            imageFromPrev: { value: 0.0 },
            imageMouseUv: { value: new THREE.Vector2(0.5, 0.5) },
            imageLensRadius: { value: aboutConfig.lensRadius },
            imageLensSoftness: { value: aboutConfig.lensSoftness },
            imageLensDistortion: { value: aboutConfig.lensDistortion },
            imageRgbShiftR: { value: aboutConfig.rgbShiftR },
            imageRgbShiftG: { value: aboutConfig.rgbShiftG },
            imageRgbShiftB: { value: aboutConfig.rgbShiftB },
            imageWaveFrequency: { value: aboutConfig.waveFrequency },
            imageWaveStrength: { value: aboutConfig.waveStrength },
            imageWaveSpeed: { value: aboutConfig.waveSpeed },
            imageRandomFrequency: { value: aboutConfig.randomFrequency },
            imageRandomStrength: { value: aboutConfig.randomStrength },
            imageRandomSpeed: { value: aboutConfig.randomSpeed },
            imagePointerEase: { value: aboutConfig.pointerEase },
            imageDuotoneBalance: { value: aboutConfig.duotoneBalance },
            imageLensActive: { value: 0.0 },
            duotoneLight: { value: new THREE.Color(1, 1, 1) },
            duotoneDark: { value: new THREE.Color(0, 0, 0) },
            staticNoiseMode: { value: 0.0 },
            barUvRemap: { value: 0.0 },
            barUvMin: { value: new THREE.Vector2(0, 0) },
            barUvMax: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: plateVertexShader,
        fragmentShader: plateFragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(1, 1, 1);
    mesh.rotation.set(0, 0, 0);

    return { mesh, material };
}

export function applyAboutImageUniforms(
    material: THREE.ShaderMaterial,
    config: AboutImageConfig,
) {
    const u = material.uniforms;
    u.imageLensRadius.value = config.lensRadius;
    u.imageLensSoftness.value = config.lensSoftness;
    u.imageLensDistortion.value = config.lensDistortion;
    u.imageRgbShiftR.value = config.rgbShiftR;
    u.imageRgbShiftG.value = config.rgbShiftG;
    u.imageRgbShiftB.value = config.rgbShiftB;
    u.imageWaveFrequency.value = config.waveFrequency;
    u.imageWaveStrength.value = config.waveStrength;
    u.imageWaveSpeed.value = config.waveSpeed;
    u.imageRandomFrequency.value = config.randomFrequency;
    u.imageRandomStrength.value = config.randomStrength;
    u.imageRandomSpeed.value = config.randomSpeed;
    u.imagePointerEase.value = config.pointerEase;
    u.imageDuotoneBalance.value = config.duotoneBalance;
}

/** 柱マスク + worksPlate（シェーダー付き）をまとめて構築する。 */
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
