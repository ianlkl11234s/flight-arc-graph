// 空域極光 vertex shader
attribute float heightRatio;   // 0 = 底部，1 = 頂部
attribute float categoryId;    // 0..4 對應 AIRSPACE_CATEGORIES 的 sortOrder index
attribute float edgeFactor;    // 頂邊權重（頂邊 1，側面 0）

varying float vHeightRatio;
varying float vCategoryId;
varying float vEdgeFactor;
varying vec2 vWorldXY;

uniform float uHeightScale;

void main() {
  // position.z 已是「實際高度對應的 Mercator z」，乘 heightScale 放大視覺高度
  vec3 pos = vec3(position.x, position.y, position.z * uHeightScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vHeightRatio = heightRatio;
  vCategoryId = categoryId;
  vEdgeFactor = edgeFactor;
  vWorldXY = position.xy;
}
