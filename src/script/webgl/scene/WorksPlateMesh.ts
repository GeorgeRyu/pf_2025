import * as THREE from 'three';
import plateVertexShader from '../shaders/plateVertex.glsl?raw';
import plateFragmentShader from '../shaders/plateFragment.glsl?raw';
import type { AboutImageConfig } from '../types';

const PLATE_SIZE = 38;

export type WorksPlateMesh = {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
};

export function createWorksPlateMesh(aboutConfig: AboutImageConfig): WorksPlateMesh {
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
            imageBaseReveal: { value: aboutConfig.baseReveal },
            imageNoiseScale: { value: aboutConfig.noiseScale },
            imageNoiseSpeed: { value: aboutConfig.noiseSpeed },
            imageMouseUv: { value: new THREE.Vector2(0.5, 0.5) },
            imageMouseStrength: { value: 0.0 },
            imageMouseRadius: { value: aboutConfig.mouseRadius },
            imageMouseSoftness: { value: aboutConfig.mouseSoftness },
            duotoneLight: { value: new THREE.Color(1, 1, 1) },
            duotoneDark: { value: new THREE.Color(0, 0, 0) },
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
    isPC: boolean
) {
    const u = material.uniforms;
    u.imageBaseReveal.value = config.baseReveal;
    u.imageNoiseScale.value = config.noiseScale;
    u.imageNoiseSpeed.value = config.noiseSpeed;
    u.imageMouseRadius.value = config.mouseRadius;
    u.imageMouseSoftness.value = config.mouseSoftness;
    u.imageMouseStrength.value = isPC ? config.mousePcStrength : 0.0;
}
