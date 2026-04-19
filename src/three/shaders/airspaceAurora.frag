// 空域極光 fragment shader — 垂直漸層 + shimmer + 頂邊發光
precision highp float;

varying float vHeightRatio;
varying float vCategoryId;
varying float vEdgeFactor;
varying vec2 vWorldXY;

uniform vec3 uColors[6];
uniform float uEnabled[6];    // 0 = 隱藏 / 1 = 顯示（小於 0.5 會 discard）
uniform float uOpacity;
uniform float uEdgeGlow;
uniform float uTime;
uniform float uIsDark;        // 1.0 = dark theme，0.0 = light theme

// 取出對應分類色與啟用旗標（WebGL1 uniform 陣列只能用常數索引）
void pickCategory(in float id, out vec3 col, out float enabled) {
  int idx = int(id + 0.5);
  col = uColors[0]; enabled = uEnabled[0];
  if (idx == 1) { col = uColors[1]; enabled = uEnabled[1]; }
  else if (idx == 2) { col = uColors[2]; enabled = uEnabled[2]; }
  else if (idx == 3) { col = uColors[3]; enabled = uEnabled[3]; }
  else if (idx == 4) { col = uColors[4]; enabled = uEnabled[4]; }
  else if (idx == 5) { col = uColors[5]; enabled = uEnabled[5]; }
}

// 簡易 2D hash / noise（不用 textures）
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec3 baseColor;
  float enabled;
  pickCategory(vCategoryId, baseColor, enabled);
  if (enabled < 0.5) discard;

  // 頂部偏極光色（青藍紫）
  vec3 topTint = mix(baseColor, vec3(0.45, 0.75, 1.0), 0.55);
  vec3 gradient = mix(baseColor * 1.15, topTint, vHeightRatio);

  // 垂直 alpha 漸層：底部實、頂部稀釋
  float alpha = mix(0.9, 0.18, pow(vHeightRatio, 0.75));

  // 基於世界座標的 shimmer（極光波動）
  float n = hash21(vWorldXY * 4800.0 + vec2(0.0, uTime * 0.3));
  float shimmer = (n - 0.5) * 0.18;
  alpha = clamp(alpha + shimmer, 0.0, 1.0);

  // 頂邊發光（edgeFactor 只有頂邊 ring 的頂點為 1）
  float edge = vEdgeFactor * uEdgeGlow;
  vec3 col = gradient + edge * mix(baseColor, vec3(1.0), 0.4);

  // Light theme：降亮 + 降透明，避免刺眼
  float isLight = 1.0 - uIsDark;
  col = mix(col, col * 0.55, isLight);
  alpha = alpha * mix(1.0, 0.55, isLight);

  gl_FragColor = vec4(col, alpha * uOpacity);
}
