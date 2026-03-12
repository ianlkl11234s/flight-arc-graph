// 靜態軌跡頂點 shader
// 支援 per-vertex color + per-vertex alpha（用於 ±12h 增量可見度控制）
attribute vec3 color;
attribute float alpha;
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  vVertColor = color;
  vAlpha = alpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
