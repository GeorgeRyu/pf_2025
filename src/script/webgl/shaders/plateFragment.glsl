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

// ----- 画像モード（About: 外側デュオトーン揺れ + 円形カラーレンズ） -----
uniform float imageMode;
uniform float imageFromPrev; // 0=ベタから, 1=textureA（直前の動画など）から
uniform vec2  imageMouseUv;
uniform float imageLensRadius;
uniform float imageLensSoftness;
uniform float imageLensDistortion;
uniform float imageRgbShiftR;
uniform float imageRgbShiftG;
uniform float imageRgbShiftB;
uniform float imageWaveFrequency;
uniform float imageWaveStrength;
uniform float imageWaveSpeed;
uniform float imageRandomFrequency;
uniform float imageRandomStrength;
uniform float imageRandomSpeed;
uniform float imageDuotoneBalance;
uniform float imageLensActive; // 0=外側のみ, 1=円形レンズ

// ----- デュオトーン（テーマ色。動画以外でも uniforms は維持） -----
uniform vec3 duotoneLight;
uniform vec3 duotoneDark;

// ----- Playground 未開発枠: TVノイズ -----
uniform float staticNoiseMode; // 0=通常, 1=白黒スタティック

// ----- Playground: フォーカスバー内に動画を cover -----
uniform float barUvRemap; // 0=オフ, 1=バー局所UV
uniform vec2 barUvMin;
uniform vec2 barUvMax;

varying vec2 vUv;

vec2 pixelate(vec2 uv, float pixelSize) {
    if (pixelSize >= 200.0) return uv;
    if (pixelSize <= 1.0) return uv;
    return floor(uv * pixelSize) / pixelSize;
}

vec3 toSRGB(vec3 linearColor) {
    return pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// <www.shadertoy.com/view/XsX3zB> by Nikita Miropolskiy
vec3 random3(vec3 c) {
    float j = 4096.0 * sin(dot(c, vec3(17.0, 59.4, 15.0)));
    vec3 r;
    r.z = fract(512.0 * j);
    j *= 0.125;
    r.x = fract(512.0 * j);
    j *= 0.125;
    r.y = fract(512.0 * j);
    return r - 0.5;
}

float getCCLensScale(float distortion, float radius2) {
    if (distortion >= 0.0) {
        return 1.0 + distortion * radius2;
    }
    return 1.0 / (1.0 - distortion * radius2);
}

vec2 getCCLensUv(vec2 uv, vec2 resolution, float distortion) {
    vec2 centeredUv = uv - 0.5;
    vec2 aspectScale = vec2(resolution.x / resolution.y, 1.0);
    vec2 centeredPosition = centeredUv * aspectScale;

    float radius2 = dot(centeredPosition, centeredPosition);
    float lensScale = getCCLensScale(distortion, radius2);

    vec2 distortedPosition = centeredPosition * lensScale;
    vec2 distortedCenteredUv = distortedPosition / aspectScale;
    vec2 distortedUv = distortedCenteredUv + 0.5;
    vec2 distortionOffset = distortedUv - uv;

    return uv - distortionOffset;
}

vec2 toPhotoUv(vec2 plateUv, vec2 uvScale, vec2 uvOffset) {
    return plateUv * uvScale + uvOffset;
}

vec3 applyDuotone(vec3 rgb) {
    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    luma = smoothstep(0.06, 0.92, luma);
    luma = clamp(luma + (imageDuotoneBalance - 0.5) * 2.0, 0.0, 1.0);
    return mix(toSRGB(duotoneDark), toSRGB(duotoneLight), luma);
}

vec3 sampleAboutOutside(sampler2D tex, vec2 plateUv, vec2 uvScale, vec2 uvOffset) {
    vec2 photoUv = toPhotoUv(plateUv, uvScale, uvOffset);
    float wave = sin(photoUv.y * imageWaveFrequency + time * imageWaveSpeed) * imageWaveStrength;
    photoUv.y += wave;
    photoUv += random3(vec3(photoUv * imageRandomFrequency, time * imageRandomSpeed)).x * imageRandomStrength;
    vec3 rgb = texture2D(tex, photoUv).rgb;
    return applyDuotone(rgb);
}

vec3 sampleAboutColorLens(sampler2D tex, vec2 plateUv, vec2 uvScale, vec2 uvOffset) {
    vec2 fromCenter = plateUv - imageMouseUv;
    float radius = max(imageLensRadius, 1e-4);
    vec2 localUv = fromCenter / (radius * 2.0) + 0.5;
    vec2 distortedLocal = getCCLensUv(localUv, vec2(1.0), imageLensDistortion);
    vec2 plateOffset = (distortedLocal - localUv) * radius * 2.0;
    vec2 colorUv = toPhotoUv(plateUv + plateOffset, uvScale, uvOffset);

    vec2 rgbShiftDirection = (localUv - 0.5) * 2.0;
    float r = texture2D(tex, colorUv + rgbShiftDirection * imageRgbShiftR).r;
    float g = texture2D(tex, colorUv + rgbShiftDirection * imageRgbShiftG).g;
    float b = texture2D(tex, colorUv + rgbShiftDirection * imageRgbShiftB).b;
    return vec3(r, g, b);
}

float circularLensMask(vec2 plateUv) {
    float radius = max(imageLensRadius, 1e-4);
    float softness = clamp(imageLensSoftness, 0.0, 0.99);
    float d = distance(plateUv, imageMouseUv);
    float inner = radius * (1.0 - softness);
    return smoothstep(radius, inner, d);
}

vec3 applyAboutLens(sampler2D tex, vec2 plateUv, vec2 uvScale, vec2 uvOffset) {
    vec3 outside = sampleAboutOutside(tex, plateUv, uvScale, uvOffset);
    vec3 inside = sampleAboutColorLens(tex, plateUv, uvScale, uvOffset);
    float mask = circularLensMask(plateUv) * clamp(imageLensActive, 0.0, 1.0);
    return mix(outside, inside, mask);
}

vec2 toBarLocalUv(vec2 uv) {
    if (barUvRemap < 0.5) return uv;
    vec2 span = max(barUvMax - barUvMin, vec2(1e-4));
    return clamp((uv - barUvMin) / span, 0.0, 1.0);
}

void main() {
    if (staticNoiseMode > 0.5) {
        if (fadeOutProgress > 0.0) {
            float n = hash21(floor(vUv * 180.0) + fract(time * 60.0));
            vec3 noiseRgb = vec3(n);
            vec3 base = toSRGB(baseColor);
            float fade = smoothstep(0.2, 1.0, fadeOutProgress);
            gl_FragColor = vec4(mix(noiseRgb, base, fade), 1.0);
            return;
        }

        float n = hash21(floor(vUv * 180.0) + fract(time * 60.0));
        float pixelSize = mix(24.0, 180.0, progress * progress);
        vec2 cell = floor(vUv * pixelSize);
        float n2 = hash21(cell + fract(time * 47.0));
        float mixN = mix(n2, n, smoothstep(0.0, 1.0, progress));
        gl_FragColor = vec4(vec3(mixN), 1.0);
        return;
    }

    if (fadeOutProgress > 0.0) {
        float t = fadeOutProgress;

        if (imageMode > 0.5) {
            float appear = 1.0 - smoothstep(0.0, 0.7, t);
            vec3 base = toSRGB(baseColor);
            vec3 photo = applyAboutLens(textureA, vUv, uvScaleA, uvOffsetA);
            gl_FragColor = vec4(mix(base, photo, appear), 1.0);
            return;
        }

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

    if (useTexture < 0.5) {
        gl_FragColor = vec4(toSRGB(baseColor), 1.0);
        return;
    }

    if (imageMode > 0.5) {
        float appear = smoothstep(0.0, 1.0, progress);
        vec3 photo = applyAboutLens(textureB, vUv, uvScaleB, uvOffsetB);
        vec3 fromColor = toSRGB(baseColor);
        if (imageFromPrev > 0.5) {
            vec2 localUv = toBarLocalUv(vUv);
            vec2 uvA = localUv * uvScaleA + uvOffsetA;
            fromColor = texture2D(textureA, uvA).rgb;
        }
        gl_FragColor = vec4(mix(fromColor, photo, appear), 1.0);
        return;
    }

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
