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
export const GB_R = GB_EXTENT / (2 * Math.PI); // GLOBE_RADIUS ≈ 1303.797

export const GLOBE_PROJECT_GLSL = /* glsl */ `
uniform mat4 uGlobeToMerc;   // Mapbox projectionToMercatorMatrix（ECEF → mercator world）
uniform float uTransition;   // projectionToMercatorTransition：0=球體、1=平面 mercator
uniform vec3 uCameraEcef;    // 相機位置（ECEF），背面剔除用

const float GB_R = 8192.0 / (2.0 * 3.141592653589793); // GLOBE_RADIUS ≈ 1303.797

// mercPos: 平面 mercator 座標（uTransition>=1 時直接回傳，保留原行為）
// aEcef: CPU 預存的 ECEF 球面座標（含高度徑向偏移），取代每幀 exp/atan/sin/cos 反推
// 回傳貼球世界座標；out cull = 背面淡出係數(0..1，球體背面→0)
vec3 globeWorldPosition(vec3 mercPos, vec3 aEcef, out float cull) {
  cull = 1.0;
  if (uTransition >= 1.0) return mercPos; // mercator（拉近）：跳過所有球面運算，零額外成本
  vec3 globeMerc = (uGlobeToMerc * vec4(aEcef, 1.0)).xyz;

  // 背面剔除（ECEF 真球面空間，fable 源碼+數值驗證正確）：地表法線 vs 指向相機。
  // dir 為單位外法線；aEcef = dir·GB_R·(1+h/GB_R) 是 dir 的正純量倍，normalize 還原。
  // 材質為 depthTest:false（globe depth 會誤遮貼球線），故背面完全靠這個 cull 藏。
  // uCameraEcef = inverse(uGlobeToMerc)·camMerc（CPU 端算，見 FlightScene.setGlobe）。
  vec3 dir = normalize(aEcef);
  vec3 ecefSurf = dir * GB_R;
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

/**
 * mercatorToEcef：把 mercator 座標 (mx,my,mz) 反推成 ECEF 球面座標（含高度徑向偏移），
 * 寫入 out[offset..offset+2]。數學與 GLSL globeWorldPosition / mercatorToGlobe 的 ECEF
 * 一致，供靜態/動態軌跡在 CPU 端一次性預存 aEcef，shader 便不再每幀做 exp/atan/sin/cos。
 */
export function mercatorToEcef(
  mx: number,
  my: number,
  mz: number,
  out: Float32Array | number[],
  offset = 0,
): void {
  const lngRad = (mx - 0.5) * 2 * Math.PI;
  const latRad = 2 * Math.atan(Math.exp(Math.PI * (1 - 2 * my))) - Math.PI / 2;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const hEcef = mz * GB_EXTENT * cosLat;
  const k = GB_R * (1 + hEcef / GB_R);
  out[offset] = cosLat * Math.sin(lngRad) * k;
  out[offset + 1] = -sinLat * k;
  out[offset + 2] = cosLat * Math.cos(lngRad) * k;
}
