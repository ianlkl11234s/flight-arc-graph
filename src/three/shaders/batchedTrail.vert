// 批次光軌頂點 shader
// progress: 0.0 = 軌跡尾端，1.0 = 軌跡前端
// colorIndex: 指向 uniform 調色盤的索引
attribute float progress;
attribute float colorIndex;

uniform vec3 uColors[5];

varying float vProgress;
varying vec3 vColor;

void main() {
  vProgress = progress;
  int idx = int(colorIndex);
  // GLSL ES 1.0 不支援動態索引 uniform array，用分支
  if (idx == 0) vColor = uColors[0];
  else if (idx == 1) vColor = uColors[1];
  else if (idx == 2) vColor = uColors[2];
  else if (idx == 3) vColor = uColors[3];
  else vColor = uColors[4];

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
