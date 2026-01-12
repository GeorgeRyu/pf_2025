uniform sampler2D textureA;
uniform sampler2D textureB;
uniform vec3 colorA;
uniform vec3 colorB;
uniform float progress;
uniform float useTexture;
uniform float fadeOutProgress;
uniform vec2 uvScaleA;
uniform vec2 uvOffsetA;
uniform vec2 uvScaleB;
uniform vec2 uvOffsetB;
uniform float time;
varying vec2 vUv;

// ピクセレーション効果
vec2 pixelate(vec2 uv, float pixelSize) {
    if (pixelSize >= 200.0) return uv;  // 十分細かい場合はそのまま
    if (pixelSize <= 1.0) return uv;
    return floor(uv * pixelSize) / pixelSize;
}

void main() {
    // ========================================
    // フェードアウト時（mouseLeave）
    // 元の動画 → 小さなドット → 黒
    // ========================================
    if (fadeOutProgress > 0.0) {
        float t = fadeOutProgress;
        
        // ピクセルサイズ: 通常解像度(大きい値) → 粗いドット(小さい値)
        // t=0で256(細かい), t=1で4(粗い)
        float pixelSize = mix(256.0, 4.0, t * t);
        
        // ピクセレーションを適用
        vec2 pixelatedUV = pixelate(vUv, pixelSize);
        vec2 uv = pixelatedUV * uvScaleA + uvOffsetA;
        
        vec4 result = texture2D(textureA, uv);
        
        // 黒へフェード
        float fade = smoothstep(0.3, 1.0, t);
        result.rgb = mix(result.rgb, vec3(0.0), fade);
        
        gl_FragColor = result;
        return;
    }
    
    // ========================================
    // テクスチャを使用しない場合は黒
    // ========================================
    if (useTexture < 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // ========================================
    // トランジション時（mouseEnter / 動画切替）
    // 小さなドット → 元の動画
    // ========================================
    
    // ピクセルサイズ: 粗いドット(小さい値) → 通常解像度(大きい値)
    // progress=0で4(粗い), progress=1で256(細かい)
    float pixelSize = mix(4.0, 256.0, progress * progress);
    
    // ピクセレーションを適用
    vec2 pixelatedUV = pixelate(vUv, pixelSize);
    
    vec2 uvA = pixelatedUV * uvScaleA + uvOffsetA;
    vec2 uvB = pixelatedUV * uvScaleB + uvOffsetB;
    
    vec4 texA = texture2D(textureA, uvA);
    vec4 texB = texture2D(textureB, uvB);
    
    // クロスフェード
    float blend = smoothstep(0.0, 1.0, progress);
    vec4 result = mix(texA, texB, blend);
    
    gl_FragColor = result;
}

