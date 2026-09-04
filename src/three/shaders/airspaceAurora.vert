// 空域極光 vertex shader
// globeWorldPosition() 由 GLOBE_PROJECT_GLSL prepend 提供（貼球）
attribute float heightRatio;   // 0 = 底部，1 = 頂部
attribute float categoryId;    // 0..4 對應 AIRSPACE_CATEGORIES 的 sortOrder index
attribute float edgeFactor;    // 頂邊權重（頂邊 1，側面 0）
attribute vec3 aDir;           // 地表單位外法線（ECEF 方向），CPU 預存；高度在此即時加

varying float vHeightRatio;
varying float vCategoryId;
varying float vEdgeFactor;
varying vec2 vWorldXY;
varying float vCull;

uniform float uHeightScale;

void main() {
  // position.z 已是「實際高度對應的 Mercator z」，乘 heightScale 放大視覺高度
  vec3 pos = vec3(position.x, position.y, position.z * uHeightScale);

  // 貼球 ECEF：aEcef = aDir · (GB_R + hEcef)，hEcef = mercZ · GB_EXTENT · cosLat
  // （等價 globeProject.ts 的 mercatorToEcef；aDir 為單位向量故 length(aDir.xz) = cosLat）
  // 不預存 aEcef 是因為 uHeightScale 是即時 slider，預存會讓每次拖動都要重建 buffer。
  float cosLat = length(aDir.xz);
  vec3 aEcef = aDir * (8192.0 * pos.z * cosLat + GB_R); // 8192 = GB_EXTENT

  float cull;
  vec3 world = globeWorldPosition(pos, aEcef, cull);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  vHeightRatio = heightRatio;
  vCategoryId = categoryId;
  vEdgeFactor = edgeFactor;
  vWorldXY = position.xy;
  vCull = cull;
}
