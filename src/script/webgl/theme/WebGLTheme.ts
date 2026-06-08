import * as THREE from 'three';

const THEME_CHANGE_EVENT = 'pf:color-theme-change';

export function readCssVarColor(varName: string, fallbackHex: string): THREE.Color {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const value = raw || fallbackHex;
    try {
        return new THREE.Color(value);
    } catch {
        return new THREE.Color(fallbackHex);
    }
}

export type WebGLThemeTargets = {
    getRectangleMaterials: () => THREE.MeshBasicMaterial[];
    getPlateShaderMaterial: () => THREE.ShaderMaterial | undefined;
};

/**
 * CSS テーマ変数（--c-accent / --c-base）を柱マテリアルとプレートシェーダーへ反映。
 */
export class WebGLTheme {
    constructor(private readonly targets: WebGLThemeTargets) {}

    apply() {
        const accent = readCssVarColor('--c-accent', '#000000');
        const base = readCssVarColor('--c-base', '#ffffff');

        this.targets.getRectangleMaterials().forEach((m) => m.color.copy(accent));

        const plateShaderMaterial = this.targets.getPlateShaderMaterial();
        if (plateShaderMaterial?.uniforms?.baseColor) {
            const u = plateShaderMaterial.uniforms;
            (u.baseColor.value as THREE.Color).copy(accent);
            (u.duotoneLight.value as THREE.Color).copy(base);
            (u.duotoneDark.value as THREE.Color).copy(accent);
        }
    }

    attach() {
        window.addEventListener(THEME_CHANGE_EVENT, () => this.apply());
    }
}
