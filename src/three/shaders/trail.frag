// 光軌片段 shader（批次版：顏色/不透明度來自 varying，數學與單條版完全一致）
// 從尾端（透明）到前端（明亮）的漸層效果
varying float vProgress;
varying float vCull;
varying vec3 vColor;
varying float vOpacity;

void main() {
  // 非線性衰減：前端明亮，尾端快速衰減（vCull = 球體背面淡出）
  float alpha = pow(vProgress, 2.0) * vOpacity * vCull;

  // 前端附近增加亮度（模擬發光核心）
  float glow = smoothstep(0.85, 1.0, vProgress) * 0.5;

  vec3 color = vColor + vec3(glow);

  gl_FragColor = vec4(color, alpha);
}
