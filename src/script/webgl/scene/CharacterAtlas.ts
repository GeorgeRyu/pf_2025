import * as THREE from 'three';

// 数字 + 記号 + 大文字英字（I, O は 1, 0 と混同しやすいため除外）で計32文字
const CHAR_SET = '0123456789#%&*+=ABCDEFGHJKLMNPQR';
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const CELL_PX = 64;
const PADDING_RATIO = 0.14;

export type CharacterAtlas = {
    texture: THREE.CanvasTexture;
    cols: number;
    rows: number;
};

/**
 * モノスペースフォントの文字セットをグリッド状にCanvasへ描画し、
 * About セクションの文字密度アート表現用のグリフアトラステクスチャを生成する。
 */
export function createCharacterAtlas(): CharacterAtlas {
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
