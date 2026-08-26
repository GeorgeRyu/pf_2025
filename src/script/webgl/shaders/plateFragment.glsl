uniform sampler2D textureA;
uniform sampler2D textureB;
uniform vec3 colorA;
uniform vec3 colorB;
uniform vec3 baseColor;
uniform float progress;
uniform float useTexture;
uniform float fadeOutProgress;
uniform vec2 uvScaleA;
uniform vec2 uvOffsetA;
uniform vec2 uvScaleB;
uniform vec2 uvOffsetB;
uniform float time;

// ----- 画像モード（About 等で使う、うっすら表示） -----
uniform float imageMode;           // 0=動画モード（既存）, 1=画像モード（うっすら + カーソル）
uniform float imageBaseReveal;     // 全体の基準可視率 (0..1)  ※モバイル基準
uniform float imageNoiseScale;     // ノイズ粒度
uniform float imageNoiseSpeed;     // ノイズ流れる速度
uniform vec2  imageMouseUv;        // カーソルの UV 位置 (0..1)
uniform float imageMouseStrength;  // PC=1, SP=0
uniform float imageMouseRadius;    // カーソルスポット半径 (UV単位)
uniform float imageMouseSoftness;  // スポット境界のなめらかさ (0..1)

// ----- デュオトーン（About 画像をテーマ2色基調に） -----
uniform vec3 duotoneLight;  // 明部（--c-base）
uniform vec3 duotoneDark;   // 暗部（--c-accent）

// ----- 文字密度アート（About: 写真を文字グリッドで表現） -----
uniform sampler2D charAtlas;   // 文字グリフのアトラステクスチャ
uniform vec2 charAtlasGrid;    // アトラスの列数・行数
uniform float charCellSize;    // 1文字セルのプレートUVサイズ

// ----- Playground 未開発枠: TVノイズ -----
uniform float staticNoiseMode; // 0=通常, 1=白黒スタティック

// ----- Playground: フォーカスバー内に動画を cover -----
uniform float barUvRemap; // 0=オフ, 1=バー局所UV
uniform vec2 barUvMin;
uniform vec2 barUvMax;

varying vec2 vUv;

// ピクセレーション効果
vec2 pixelate(vec2 uv, float pixelSize) {
    if (pixelSize >= 200.0) return uv;
    if (pixelSize <= 1.0) return uv;
    return floor(uv * pixelSize) / pixelSize;
}

// baseColor only: linear -> sRGB encode (gamma)
vec3 toSRGB(vec3 linearColor) {
    return pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
}

// 軽量 hash / value noise
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 画像モード用のリビールマスク
// noiseベース（全体うっすら）+ カーソルスポット（PCのみ）
float computeImageReveal(vec2 uv) {
    // ノイズベース: 1.5 layer に分けて自然なまだら感
    float n1 = vnoise(uv * imageNoiseScale + vec2(time * imageNoiseSpeed, time * imageNoiseSpeed * 0.7));
    float n2 = vnoise(uv * imageNoiseScale * 2.2 - vec2(time * imageNoiseSpeed * 0.6, 0.0));
    float n = mix(n1, n2, 0.35);
    float baseReveal = smoothstep(0.35, 0.85, n) * imageBaseReveal;

    // カーソルスポット
    float d = distance(uv, imageMouseUv);
    float spotEdge = max(imageMouseRadius, 1e-3);
    float spotInner = spotEdge * (1.0 - clamp(imageMouseSoftness, 0.0, 0.99));
    float spotReveal = smoothstep(spotEdge, spotInner, d) * imageMouseStrength;

    return clamp(baseReveal + spotReveal, 0.0, 1.0);
}

// 写真を文字グリッドで表現する。
// セル固定のハッシュで文字（グリフ）を1つ選び、その文字の見え方の濃さを
// 写真のそのセルの明るさで決める（文字の形自体は輝度で変えない）。
vec3 applyAsciiText(sampler2D tex, vec2 plateUv, vec2 uvScale, vec2 uvOffset) {
    float cellSize = max(charCellSize, 1e-4);
    vec2 cell = floor(plateUv / cellSize);
    vec2 localUv = fract(plateUv / cellSize);

    // セル中心でピクセレーションサンプリング（1セル = 1輝度値）
    vec2 photoUv = (cell + 0.5) * cellSize * uvScale + uvOffset;
    vec3 imgRgb = texture2D(tex, photoUv).rgb;
    float luma = dot(imgRgb, vec3(0.299, 0.587, 0.114));
    luma = smoothstep(0.06, 0.92, luma);

    // セル固定のハッシュで文字を1つ選ぶ（フレーム間で不変）
    float count = charAtlasGrid.x * charAtlasGrid.y;
    float charIndex = floor(hash21(cell) * count);
    vec2 charCell = vec2(mod(charIndex, charAtlasGrid.x), floor(charIndex / charAtlasGrid.x));
    vec2 charUv = (charCell + localUv) / charAtlasGrid;
    float glyphMask = texture2D(charAtlas, charUv).r;

    vec3 light = toSRGB(duotoneLight);
    vec3 dark = toSRGB(duotoneDark);
    return mix(dark, light, glyphMask * luma);
}

// プレート全体 UV → フォーカスバー内ローカル UV（0..1）
vec2 toBarLocalUv(vec2 uv) {
    if (barUvRemap < 0.5) return uv;
    vec2 span = max(barUvMax - barUvMin, vec2(1e-4));
    return clamp((uv - barUvMin) / span, 0.0, 1.0);
}

void main() {
    // ========================================
    // Playground TVノイズ（ホバー中の未開発枠）
    // ========================================
    if (staticNoiseMode > 0.5) {
        // フェードアウト中はベタ色へ
        if (fadeOutProgress > 0.0) {
            float n = hash21(floor(vUv * 180.0) + fract(time * 60.0));
            vec3 noiseRgb = vec3(n);
            vec3 base = toSRGB(baseColor);
            float fade = smoothstep(0.2, 1.0, fadeOutProgress);
            gl_FragColor = vec4(mix(noiseRgb, base, fade), 1.0);
            return;
        }

        float n = hash21(floor(vUv * 180.0) + fract(time * 60.0));
        // progress で粗ドット → フルノイズ
        float pixelSize = mix(24.0, 180.0, progress * progress);
        vec2 cell = floor(vUv * pixelSize);
        float n2 = hash21(cell + fract(time * 47.0));
        float mixN = mix(n2, n, smoothstep(0.0, 1.0, progress));
        gl_FragColor = vec4(vec3(mixN), 1.0);
        return;
    }

    // ========================================
    // フェードアウト時（mouseLeave / セクション離脱）
    // ========================================
    if (fadeOutProgress > 0.0) {
        float t = fadeOutProgress;

        // --- 画像モードの fadeOut: リビールを 0 に縮める ---
        if (imageMode > 0.5) {
            float reveal = computeImageReveal(vUv);
            reveal *= (1.0 - smoothstep(0.0, 0.7, t));
            vec3 base = toSRGB(baseColor);
            vec3 duotoned = applyAsciiText(textureA, vUv, uvScaleA, uvOffsetA);
            gl_FragColor = vec4(mix(base, duotoned, reveal), 1.0);
            return;
        }

        // --- 動画モードの fadeOut（既存: ピクセレーション → baseColor） ---
        float pixelSize = mix(256.0, 4.0, t * t);
        vec2 localUv = toBarLocalUv(vUv);
        vec2 pixelatedUV = pixelate(localUv, pixelSize);
        vec2 uv = pixelatedUV * uvScaleA + uvOffsetA;
        vec4 result = texture2D(textureA, uv);
        float fade = smoothstep(0.3, 1.0, t);
        result.rgb = mix(result.rgb, toSRGB(baseColor), fade);
        gl_FragColor = result;
        return;
    }

    // ========================================
    // テクスチャを使用しない場合は baseColor
    // ========================================
    if (useTexture < 0.5) {
        gl_FragColor = vec4(toSRGB(baseColor), 1.0);
        return;
    }

    // ========================================
    // 画像モード（About）: うっすら + カーソルスポット
    // ピクセレーションは使わず、ノイズで自然にリビール
    // ========================================
    if (imageMode > 0.5) {
        float reveal = computeImageReveal(vUv);
        // 立ち上がりに合わせて 0→max にイージング
        reveal *= smoothstep(0.0, 1.0, progress);

        vec3 base = toSRGB(baseColor);
        vec3 duotoned = applyAsciiText(textureB, vUv, uvScaleB, uvOffsetB);
        gl_FragColor = vec4(mix(base, duotoned, reveal), 1.0);
        return;
    }

    // ========================================
    // 動画モード（既存）: 粗いドット → 元の動画
    // ========================================
    float pixelSize = mix(4.0, 256.0, progress * progress);
    vec2 localUv = toBarLocalUv(vUv);
    vec2 pixelatedUV = pixelate(localUv, pixelSize);

    vec2 uvA = pixelatedUV * uvScaleA + uvOffsetA;
    vec2 uvB = pixelatedUV * uvScaleB + uvOffsetB;

    vec4 texA = texture2D(textureA, uvA);
    vec4 texB = texture2D(textureB, uvB);

    float blend = smoothstep(0.0, 1.0, progress);
    vec4 result = mix(texA, texB, blend);

    gl_FragColor = result;
}
