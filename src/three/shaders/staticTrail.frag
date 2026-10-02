// 靜態軌跡片段 shader
// uOpacity: 全域不透明度（slider 控制）
// uWidth:   sub-pixel 線寬因子（Width slider；WebGL lineWidth 固定 1px，
//           故用降低 alpha 模擬更細/更銳利的線。本體乘 w、glow 乘 w²）
// uGlowW:   glow 併單 pass 用的寬度項（= glowHidden ? 0 : 0.3·w）；
//           a2 = a1·uGlowW = vAlpha·uOpacity·w·(0.3·w) = 原 glow pass 的 alpha，
//           取代原本第二個 glow-only material/mesh（T0-1）
// uAdditive: 1 = additive blending（dark theme，兩次繪製等價 a1+a2）；
//            0 = normal blending（light theme，用 a1+a2−a1·a2 近似合成，誤差 ≤3/255）
// vAlpha:   per-vertex alpha（vert shader 算好：±12h 視窗 alpha × 背面剔除 cull × progressive 已飛過因子）
//           起降染色組合內互飛的 alpha attribute 為 3（FlightScene INTERNAL_STATIC_ALPHA）：
//           vAlpha > 1 時本體透明度 = max(原值, min(原值×3, 0.5))；高度模式 alpha ≤ 1，不進此分支
uniform float uOpacity;
uniform float uWidth;
uniform float uGlowW;
uniform float uAdditive;
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  float a1 = vAlpha * uOpacity * uWidth;
  if (vAlpha > 1.0) {
    float base = a1 / 3.0;
    a1 = max(base, min(a1, 0.5));
  }
  float a2 = a1 * uGlowW;
  float finalAlpha = mix(a1 + a2 - a1 * a2, a1 + a2, uAdditive);
  if (finalAlpha < 0.001) discard;
  gl_FragColor = vec4(vVertColor, finalAlpha);
}
