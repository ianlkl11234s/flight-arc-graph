// 靜態軌跡片段 shader
// uOpacity: 全域不透明度（slider 控制）
// vAlpha: per-vertex alpha（±12h 可見度控制）
uniform float uOpacity;
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  float finalAlpha = vAlpha * uOpacity;
  if (finalAlpha < 0.001) discard;
  gl_FragColor = vec4(vVertColor, finalAlpha);
}
