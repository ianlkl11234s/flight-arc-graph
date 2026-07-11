// 光軌頂點 shader（批次版：所有光軌合併單一 buffer，顏色/不透明度為 per-vertex attribute）
// progress: 0.0 = 軌跡尾端（最早的點），1.0 = 軌跡前端（最新的點）
// globeWorldPosition() 由 GLOBE_PROJECT_GLSL prepend 提供（貼球）
attribute float progress;
attribute vec3 aEcef;
attribute vec3 aColor;
attribute float aOpacity;
varying float vProgress;
varying float vCull;
varying vec3 vColor;
varying float vOpacity;

void main() {
  vProgress = progress;
  vColor = aColor;
  vOpacity = aOpacity;
  float cull;
  vec3 world = globeWorldPosition(position, aEcef, cull);
  vCull = cull;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
