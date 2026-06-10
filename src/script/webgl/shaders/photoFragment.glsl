uniform sampler2D map;
uniform vec2  uvScale;       // cover UV scale（texture.repeat 相当）
uniform vec2  uvOffset;      // cover UV offset
uniform vec3  duotoneLight;  // 明部（--c-base）
uniform vec3  duotoneDark;   // 暗部（--c-accent）
uniform float duotoneMix;    // 1.0=duotone, 0.0=オリジナル
uniform float opacity;

varying vec2 vUv;

vec3 toSRGB(vec3 c) {
    return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

vec3 applyDuotone(vec3 rgb) {
    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    luma = smoothstep(0.06, 0.92, luma);
    return mix(toSRGB(duotoneDark), toSRGB(duotoneLight), luma);
}

void main() {
    vec2 uv = vUv * uvScale + uvOffset;
    vec4 img = texture2D(map, uv);
    vec3 duotoned = applyDuotone(img.rgb);
    vec3 col = mix(img.rgb, duotoned, duotoneMix);
    gl_FragColor = vec4(col, img.a * opacity);
}
