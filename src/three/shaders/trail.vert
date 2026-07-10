// 光軌頂點 shader
// progress: 0.0 = 軌跡尾端（最早的點），1.0 = 軌跡前端（最新的點）
// globeWorldPosition() 由 GLOBE_PROJECT_GLSL prepend 提供（貼球）
attribute float progress;
varying float vProgress;
varying float vCull;

void main() {
  vProgress = progress;
  float cull;
  vec3 world = globeWorldPosition(position, cull);
  vCull = cull;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
