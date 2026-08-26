/** worksPlate に表示するコンテンツ種別 */
export type PlateContent =
    | { kind: 'video'; index: number }
    | { kind: 'playgroundVideo'; index: number }
    | { kind: 'noise' }
    | { kind: 'image'; key: string };

/** 現在アクティブなセクション */
export type ActiveSection =
    | 'loading'
    | 'works'
    | 'about'
    | 'photos'
    | 'playground'
    | 'thx';

export const ABOUT_IMAGE_URL = '/images/about/my-face.png';
export const ABOUT_IMAGE_KEY = 'about';

/** About 画像モード（シェーダー）の演出パラメータ */
export type AboutImageConfig = {
    baseReveal: number;
    noiseScale: number;
    noiseSpeed: number;
    mouseRadius: number;
    mouseSoftness: number;
    mousePcStrength: number;
    /** 文字密度アート表現の1セルあたりのプレートUVサイズ */
    charCellSize: number;
};

export const DEFAULT_ABOUT_IMAGE_CONFIG: AboutImageConfig = {
    baseReveal: 0.65,
    noiseScale: 2.0,
    noiseSpeed: 0.4,
    mouseRadius: 0.3,
    mouseSoftness: 1.75,
    mousePcStrength: 0.5,
    charCellSize: 0.02,
};
