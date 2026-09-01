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

const CHAR_SET = '0123456789#%&*+=ABCDEFGHJKLMNPQR';
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const CELL_PX = 64;
const PADDING_RATIO = 0.14;

const RECTANGLE_COUNT = 7;
const BOX_SIZE = { x: 2, y: 35, z: 1.1256 };

function createCharacterAtlas(): { texture: THREE.CanvasTexture; cols: number; rows: number } {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLS * CELL_PX;
    canvas.height = ATLAS_ROWS * CELL_PX;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(CELL_PX * (1 - PADDING_RATIO * 2))}px ui-monospace, Menlo, Consolas, monospace`;

    const total = ATLAS_COLS * ATLAS_ROWS;
    for (let i = 0; i < total; i++) {
        const char = CHAR_SET[i % CHAR_SET.length];
        const col = i % ATLAS_COLS;
        const row = Math.floor(i / ATLAS_COLS);
        const x = col * CELL_PX + CELL_PX / 2;
        const y = row * CELL_PX + CELL_PX / 2;
        ctx.fillText(char, x, y);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    return { texture, cols: ATLAS_COLS, rows: ATLAS_ROWS };
}

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
    const charAtlas = createCharacterAtlas();

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
            charAtlas: { value: charAtlas.texture },
            charAtlasGrid: { value: new THREE.Vector2(charAtlas.cols, charAtlas.rows) },
            charCellSize: { value: aboutConfig.charCellSize },
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
    isPC: boolean,
) {
    const u = material.uniforms;
    u.imageBaseReveal.value = config.baseReveal;
    u.imageNoiseScale.value = config.noiseScale;
    u.imageNoiseSpeed.value = config.noiseSpeed;
    u.imageMouseRadius.value = config.mouseRadius;
    u.imageMouseSoftness.value = config.mouseSoftness;
    u.imageMouseStrength.value = isPC ? config.mousePcStrength : 0.0;
    u.charCellSize.value = config.charCellSize;
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
