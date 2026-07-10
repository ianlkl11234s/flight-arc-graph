// 靜態軌跡頂點 shader
// 支援 per-vertex color + per-vertex alpha（用於 ±12h 增量可見度控制）
// globeWorldPosition() 由 GLOBE_PROJECT_GLSL prepend 提供（貼球）
attribute vec3 color;
attribute float alpha;
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  vVertColor = color;
  float cull;
  vec3 world = globeWorldPosition(position, cull);
  vAlpha = alpha * cull;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
