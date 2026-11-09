varying vec2 vUv;

uniform float uZoomActive;
uniform float uZoomT;
uniform float uZoomOut;
uniform float uMaxDelay;
uniform mat4 uStartMatrix;
uniform mat4 uEndMatrix;

float easeOutCubic(float t) {
	float a = 1.0 - t;
	return 1.0 - a * a * a;
}

void main() {
	vUv = uv;

	if (uZoomActive < 0.5) {
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		return;
	}

	// 画像左上 (0,1) が先行、右下 (1,0) が最後
	float d = (uv.x + (1.0 - uv.y)) * 0.5;
	float delay = d * uMaxDelay;
	float span = max(1.0 - uMaxDelay, 0.0001);
	float p = mix(uZoomT, 1.0 - uZoomT, uZoomOut);
	float tMotion = easeOutCubic(clamp((p - delay) / span, 0.0, 1.0));
	float tLocal = mix(tMotion, 1.0 - tMotion, uZoomOut);

	vec4 startPos = uStartMatrix * vec4(position, 1.0);
	vec4 endPos = uEndMatrix * vec4(position, 1.0);
	vec4 worldPos = mix(startPos, endPos, tLocal);
	gl_Position = projectionMatrix * viewMatrix * worldPos;
}
