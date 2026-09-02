// 靜態軌跡頂點 shader
// 支援 per-vertex color + per-vertex alpha（用於 ±12h 增量可見度控制）
// globeWorldPosition() 由 GLOBE_PROJECT_GLSL prepend 提供（貼球）
//
// T2-1：progressive 模式的「已飛過才顯示」改在這裡算（原本 CPU 每模擬秒
// 全頂點掃描 timestamps 重算 alpha 再整條/整桶重傳，見 FlightScene 的
// updateProgressiveVisibility）。alpha attribute 保留給 ±12h 時間窗用
// （CPU 端 updateStaticVisibility 仍照舊、逐 flight range 寫 alpha）；
// progressive 是另一個獨立的乘法因子，兩者相乘＝AND（時間窗過濾 × 已飛過才顯示）。
// uProgressive=0（full 模式）時 mix() 恆為 1，等同不套用。
attribute vec3 color;
attribute float alpha;
attribute vec3 aEcef;
attribute float aTRel;
uniform float uTime;         // 目前模擬時間（相對 staticTimeBase 的秒數，同 aTRel 基準）
uniform float uProgressive;  // 1 = progressive 模式（套用 aTRel<=uTime 才顯示）、0 = full（全顯示）
varying vec3 vVertColor;
varying float vAlpha;

void main() {
  vVertColor = color;
  float cull;
  vec3 world = globeWorldPosition(position, aEcef, cull);
  // step(aTRel, uTime) = uTime>=aTRel ? 1.0 : 0.0，對齊原 CPU 邏輯的 ts[i] <= relTime（含等於）
  float progress = mix(1.0, step(aTRel, uTime), uProgressive);
  vAlpha = alpha * cull * progress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
