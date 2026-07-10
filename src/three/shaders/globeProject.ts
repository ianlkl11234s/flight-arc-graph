import * as THREE from "three";

/**
 * 貼球投影共用工具：把平面 Web Mercator 座標（x,y=經緯、z=高度）轉成貼合 Mapbox
 * globe 的世界座標，並依 Mapbox 的 transition 係數在球體↔平面之間過渡。
 *
 * - GLSL 版（GLOBE_PROJECT_GLSL）：prepend 到各 vertex shader，提供 globeWorldPosition()。
 * - JS 版（mercatorToGlobe）：給非 shader 的路徑（InstancedOrbs 用 instance matrix，CPU 端算）。
 *   兩者數學必須保持一致。
 *
 * 高度徑向公式 hEcef = mercZ · EXTENT · cosLat，等價 Mapbox 源碼 globeMetersToEcef /
 * raster shader 的 GLOBE_UPSCALE（= GLOBE_RADIUS / earthRadius）。
 *
 * 背面剔除在 ECEF 真球面空間做（相機位置由 inverse(globeToMerc)·camMerc 轉回 ECEF），
 * 因為 mercator 空間下球體是扭曲的、法線方位對不上，直接點積會誤判整片。
 */

const GB_EXTENT = 8192;
const GB_R = GB_EXTENT / (2 * Math.PI); // GLOBE_RADIUS ≈ 1303.797

export const GLOBE_PROJECT_GLSL = /* glsl */ `
uniform mat4 uGlobeToMerc;   // Mapbox projectionToMercatorMatrix（ECEF → mercator world）
uniform float uTransition;   // projectionToMercatorTransition：0=球體、1=平面 mercator
uniform vec3 uCameraEcef;    // 相機位置（ECEF），背面剔除用

const float GB_PI = 3.141592653589793;
const float GB_EXTENT = 8192.0;
const float GB_R = GB_EXTENT / (2.0 * GB_PI);

// mercPos: x=(lng+180)/360, y=mercatorY(lat), z=高度(mercator z)
// 回傳貼球世界座標；out cull = 背面淡出係數(0..1，球體背面→0)
vec3 globeWorldPosition(vec3 mercPos, out float cull) {
  cull = 1.0;
  if (uTransition >= 1.0) return mercPos; // mercator（拉近）：跳過所有球面運算，零額外成本
  float lngRad = (mercPos.x - 0.5) * 2.0 * GB_PI;
  float latRad = 2.0 * atan(exp(GB_PI * (1.0 - 2.0 * mercPos.y))) - GB_PI * 0.5;
  float cosLat = cos(latRad);
  float sinLat = sin(latRad);
  vec3 dir = vec3(cosLat * sin(lngRad), -sinLat, cosLat * cos(lngRad)); // 單位球面外法線
  vec3 ecefSurf = dir * GB_R;
  float hEcef = mercPos.z * GB_EXTENT * cosLat;    // 高度 → 徑向偏移
  vec3 ecef = ecefSurf * (1.0 + hEcef / GB_R);
  vec3 globeMerc = (uGlobeToMerc * vec4(ecef, 1.0)).xyz;

  // 背面剔除（ECEF 真球面空間，fable 源碼+數值驗證正確）：地表法線 vs 指向相機。
  // 材質為 depthTest:false（globe depth 會誤遮貼球線），故背面完全靠這個 cull 藏。
  // uCameraEcef = inverse(uGlobeToMerc)·camMerc（CPU 端算，見 FlightScene.setGlobe）。
  vec3 toCam = normalize(uCameraEcef - ecefSurf);
  float globeCull = smoothstep(-0.08, 0.02, dot(dir, toCam)); // d=0 即真地平線
  cull = mix(globeCull, 1.0, uTransition);

  return mix(globeMerc, mercPos, uTransition);
}
`;

const _v = new THREE.Vector4();

export interface GlobeResolved {
  x: number;
  y: number;
  z: number;
  cull: number;
}

/**
 * mercatorToGlobe：GLSL globeWorldPosition 的 JS 版（給 InstancedOrbs CPU 端）。
 * globeToMerc = null 或 transition≥1 時直接回傳 mercator。
 * cameraEcef = 相機的 ECEF 座標（由 FlightScene 用 inverse(globeToMerc)·camMerc 算好）。
 */
export function mercatorToGlobe(
  mx: number,
  my: number,
  mz: number,
  globeToMerc: THREE.Matrix4 | null,
  transition: number,
  cameraEcef: THREE.Vector3 | null,
  out: GlobeResolved,
): void {
  if (!globeToMerc || transition >= 1) {
    out.x = mx;
    out.y = my;
    out.z = mz;
    out.cull = 1;
    return;
  }
  const lngRad = (mx - 0.5) * 2 * Math.PI;
  const latRad = 2 * Math.atan(Math.exp(Math.PI * (1 - 2 * my))) - Math.PI / 2;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const dx = cosLat * Math.sin(lngRad);
  const dy = -sinLat;
  const dz = cosLat * Math.cos(lngRad);
  const hEcef = mz * GB_EXTENT * cosLat;
  const k = GB_R * (1 + hEcef / GB_R);
  _v.set(dx * k, dy * k, dz * k, 1).applyMatrix4(globeToMerc);
  const gx = _v.x, gy = _v.y, gz = _v.z;

  // 背面剔除（ECEF 空間）：dir 為單位法線，直接點積指向相機的方向
  let cull = 1;
  if (cameraEcef) {
    const sx = dx * GB_R, sy = dy * GB_R, sz = dz * GB_R;
    const tx = cameraEcef.x - sx, ty = cameraEcef.y - sy, tz = cameraEcef.z - sz;
    const tl = Math.hypot(tx, ty, tz) || 1;
    const d = (dx * tx + dy * ty + dz * tz) / tl;
    cull = Math.max(0, Math.min(1, (d + 0.08) / 0.1)); // smoothstep(-0.08,0.02) 的線性近似
  }
  out.x = gx + (mx - gx) * transition;
  out.y = gy + (my - gy) * transition;
  out.z = gz + (mz - gz) * transition;
  out.cull = cull;
}
