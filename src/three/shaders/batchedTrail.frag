// 批次光軌片段 shader
// 與原版 trail.frag 邏輯一致
uniform float uOpacity;

varying float vProgress;
varying vec3 vColor;

void main() {
  // 非線性衰減：前端明亮，尾端快速衰減
  float alpha = pow(vProgress, 2.0) * uOpacity;

  // 前端附近增加亮度（模擬發光核心）
  float glow = smoothstep(0.85, 1.0, vProgress) * 0.5;

  vec3 color = vColor + vec3(glow);

  gl_FragColor = vec4(color, alpha);
}
