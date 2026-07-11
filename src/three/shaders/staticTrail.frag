// 靜態軌跡片段 shader
// uOpacity: 全域不透明度（slider 控制）
// uWidth:   sub-pixel 線寬因子（Width slider；WebGL lineWidth 固定 1px，
//           故用降低 alpha 模擬更細/更銳利的線。本體乘 w、glow 乘 w²）
// vAlpha:   per-vertex alpha（±12h 可見度控制）
uniform float uOpacity;
uniform float uWidth;
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  float finalAlpha = vAlpha * uOpacity * uWidth;
  if (finalAlpha < 0.001) discard;
  gl_FragColor = vec4(vVertColor, finalAlpha);
}
