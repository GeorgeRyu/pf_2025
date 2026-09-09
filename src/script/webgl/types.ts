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
    lensRadius: number;
    lensSoftness: number;
    lensDistortion: number;
    rgbShiftR: number;
    rgbShiftG: number;
    rgbShiftB: number;
    waveFrequency: number;
    waveStrength: number;
    waveSpeed: number;
    randomFrequency: number;
    randomStrength: number;
    randomSpeed: number;
    pointerEase: number;
    duotoneBalance: number;
};

export const DEFAULT_ABOUT_IMAGE_CONFIG: AboutImageConfig = {
    lensRadius: 0.24,
    lensSoftness: 0.93,
    lensDistortion: -1.02,
    rgbShiftR: -0.002,
    rgbShiftG: -0.013,
    rgbShiftB: 0,
    waveFrequency: 40,
    waveStrength: 0.042,
    waveSpeed: 1.19,
    randomFrequency: 8.5,
    randomStrength: 0.064,
    randomSpeed: 1.56,
    pointerEase: 0.06,
    duotoneBalance: 0.5,
};
