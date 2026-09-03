import * as THREE from "three";
import { mercatorToGlobe, type GlobeResolved } from "./shaders/globeProject";
import { getFrozenAnimTime } from "./animClock";

const MAX_INSTANCES = 8192;
const _g: GlobeResolved = { x: 0, y: 0, z: 0, cull: 1, dot: 1 };

/**
 * 呼吸／閃爍速度係數。原設計以 60fps 為基準（`this.time += 0.016` 每次 `updateAll`），
 * 2026-09-02 改用真實 wall-clock 秒數（`uTime`）驅動 GPU shader 後，使用者拍板「回到原始
 * 設計速度」= 1.0× wall-clock，故係數維持原本乘數不變，只是套用的時間基準換了。
 */
const PULSE_RATE = 2.0;
const BLINK_RATE = 1.2;
/** phase 的黃金角序列（弳度），讓 MAX_INSTANCES 個 instance 的相位分散但決定性可重現（見 T1-1） */
const GOLDEN_ANGLE_RAD = 2.399963229728653;

interface OrbLayer {
  mesh: THREE.InstancedMesh;
  baseOpacity: number;
  scaleRatio: number;
  /**
   * T3-4（2026-09-03）：快取 mesh.instanceMatrix.array 參考，讓 updateAll() 直接寫
   * column-major float，跳過每 instance 4 次 Object3D.updateMatrix()（quaternion 組合）
   * + Matrix4.toArray() 複製。陣列本身在 mesh 生命週期內不會被重新配置（InstancedMesh
   * 建構時一次配好 MAX_INSTANCES*16 大小，count 只是繪製筆數，不影響底層陣列），故快取
   * 參考安全。
   */
  matrixArray: Float32Array;
}

/** GLSL 浮點數字面量：確保整數值也帶小數點（`2` → `2.0`），避免部分驅動對整數字面量挑剔 */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/** 讀取 onBeforeCompile 存進 userData 的 uTime uniform 參考並寫入新值（沒有就跳過，如首幀編譯前） */
function setTimeUniform(mat: THREE.Material, value: number) {
  const ref = mat.userData["uTimeUniform"] as { value: number } | undefined;
  if (ref) ref.value = value;
}

/**
 * InstancedMesh 光球管理器
 * 4 個 InstancedMesh 取代每架飛機 5 個獨立 Mesh
 * draw calls: 從 N×5 降到 4
 *
 * T1-1（2026-09-02）：呼吸（pulse）／閃爍（blink）搬進 GPU shader（`uTime` uniform +
 * per-instance `aPhase` attribute），CPU 不再每幀重算/重傳 instanceMatrix、instanceColor。
 * instanceMatrix 只在「真的需要」時才重算重傳，見 updateAll() 的簽章比對設計。
 */
export class InstancedOrbs {
  private layers: OrbLayer[] = [];
  private blinkLayer!: OrbLayer;
  private geo: THREE.IcosahedronGeometry;
  private blinkGeo: THREE.IcosahedronGeometry;
  private count = 0;
  /** 活躍 instance 的位置（用於點擊拾取） */
  private positions = new Float32Array(MAX_INSTANCES * 3);
  /** 活躍 instance 對應的 flight id */
  private flightIds: string[] = [];

  private orbScale = 0.000005;
  /** Per-instance scale multiplier（fr24_id → multiplier）；null = 全 1.0 */
  private scaleMap: Map<string, number> | null = null;

  /** 貼球參數（由 FlightScene.setGlobe 傳入）；globeToMerc=null → 平面 mercator */
  private globeToMerc: THREE.Matrix4 | null = null;
  private globeTransition = 1;
  private globeCam: THREE.Vector3 | null = null;

  /**
   * instanceMatrix 重算的守門簽章。entries 本身的內容（座標）不參與簽章字串比對
   * （陣列 diff 是 O(n)，划不來）——改由呼叫端傳入的 `entriesUnchanged` 表示「entries
   * 內容（含座標）與上次呼叫是否保證相同」：
   * - FlightScene.update() 的「暫停/時間未動」快速路徑會重複傳同一份 `lastOrbEntries`，
   *   此時內容保證沒變（該路徑本來就是靠 currentTime + 航班集合簽章判斷未變才進入）
   *   → entriesUnchanged = true。
   * - 其餘（播放中、集合變動）一律視為可能變了 → entriesUnchanged = false，照常全量重算。
   * 除了 entries 內容，貼球/相機/縮放參數任一項變了也要重算，故仍需下面這個 metaSig
   * （count＋首尾 id 當 entries 集合的低成本 sanity check，其餘是非 entries 的輸入）。
   */
  private lastMatrixSig: string | null = null;
  /** scaleMap 是參考型別，換一顆新 Map（即使內容相同）也要視為變了，故獨立用 !== 比對 */
  private lastScaleMapRef: Map<string, number> | null | undefined = undefined;

  constructor(scene: THREE.Scene, color: THREE.Color, blending: THREE.Blending) {
    // T3-3（2026-09-03）：光球在螢幕上通常只佔數到數十像素，additive 疊加下 20 面體
    // （細分 0 階，12 頂點/60 verts）與原本 2 階細分（540 verts）難以肉眼分辨；改用最低
    // 細分把每顆光球的頂點量從 1,860 壓到 240，換 8 倍 MAX_INSTANCES（1,024→8,192），
    // 修正 world 場景同時空中 >1,024 架時光球被靜默截斷（也選不到）的缺陷。
    // 每幀頂點預算幾乎不變：1,024×1,860 ≈ 1.9M → 8,192×240 ≈ 1.97M。
    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.blinkGeo = new THREE.IcosahedronGeometry(1, 0);

    // per-instance phase：決定性黃金角序列（取代舊的 Math.random，讓凍結／非凍結畫面一致，
    // 也是 T1-1 視覺回歸可用 maxDiff=0 驗收的前提）。值固定不變，只在建構時設一次。
    const phaseArray = new Float32Array(MAX_INSTANCES);
    for (let i = 0; i < MAX_INSTANCES; i++) {
      phaseArray[i] = (i * GOLDEN_ANGLE_RAD) % (Math.PI * 2);
    }
    this.geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phaseArray, 1));
    this.blinkGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phaseArray, 1));

    // Core (白色), Glow1 (主題色), Glow2 (主題色), Blink (紅色)
    // renderOrder：由下到上 glow2(0.1) → glow1(0.2) → core(0.3)，blink 固定畫最上層
    // （見下方 0.4）。數值選在 (0, 1) 區間見下方 for 迴圈內的完整解釋。
    const configs = [
      { scaleRatio: 0.5, opacity: 1.0, color: new THREE.Color(1, 1, 1), renderOrder: 0.3 },
      { scaleRatio: 1.0, opacity: 0.5, color: color.clone(), renderOrder: 0.2 },
      { scaleRatio: 2.0, opacity: 0.15, color: color.clone(), renderOrder: 0.1 },
    ];

    for (const cfg of configs) {
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending,
        depthWrite: false,
        // globe 地形會先寫進 depth buffer，光球與軌跡同樣只靠 ECEF cull 藏背面
        depthTest: false,
        side: THREE.DoubleSide,
      });
      // 呼吸：vertex shader 在套用 instanceMatrix 之前對 transformed 乘 pulse，
      // 等價於原本 CPU 把 pulse 乘進 Object3D.scale（純等向縮放，乘法可交換）。
      mat.onBeforeCompile = (shader) => {
        shader.uniforms["uTime"] = { value: 0 };
        shader.vertexShader =
          `attribute float aPhase;\nuniform float uTime;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
	float pulse = 1.0 + sin( uTime * ${glslFloat(PULSE_RATE)} + aPhase ) * 0.15;
	transformed *= pulse;`,
        );
        mat.userData["uTimeUniform"] = shader.uniforms["uTime"];
      };
      const mesh = new THREE.InstancedMesh(this.geo, mat, MAX_INSTANCES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      // column-major identity 已由 InstancedMesh 建構子對全部 MAX_INSTANCES 個 instance
      // 寫過一次（setMatrixAt(i, identity)），故非 scale/position 欄位（1-4,6-9,11,15）
      // 永遠維持 0/1，updateAll() 之後只需覆寫 0,5,10,12,13,14 這 6 個欄位。
      const matrixArray = mesh.instanceMatrix.array as Float32Array;
      // 4 層都是 transparent + depthTest:false，且共用同一組世界座標，只靠半徑不同。
      // three.js 對 transparent 物件是先比 renderOrder、平手才退回 Z-depth；這 4 個
      // InstancedMesh 的 boundingSphere 半徑各不同（含每個 instance 的局部半徑做
      // union），導致 Z-depth tie-break 不穩定 → 三層 orb 與 blink 的疊繪順序每次
      // compile/repaint 可能不同，只有在 light 主題（orb 用 NormalBlending，會真的
      // 互相覆蓋而非相加）才看得出來（additive 下順序基本不影響疊色結果，故 dark
      // 主題視覺回歸測不出來）。明確指定 renderOrder 讓順序固定：由下到上
      // glow2(0.1) → glow1(0.2) → core(0.3，白) → blink(0.4，紅)，讓白色核心與閃爍
      // 疊在三層 orb 的最上層。
      // 數值特別選在 (0, 1) 開區間，是為了同時對齊另外兩個既有的隱性順序關係
      // （這兩個舊碼都沒對 orb 設過 renderOrder，故舊行為＝預設值 0 對齊／互踩的結果，
      // 實測驗證見下）：
      // - 靜態軌跡桶（FlightScene 的 staticBuckets，未設 renderOrder，預設 0）：
      //   舊碼光球恰好也是預設 0，兩者同分再退回 Z-depth；新 renderOrder 若 ≤0 會把
      //   光球擠到桶的下面，light 主題下驗證會整片跳成「blocky」大範圍失真（已實測）。
      //   > 0 讓光球穩定疊在靜態桶之上，同時不再吃 Z-depth 的不穩定 tie-break。
      // - BatchedTrails 的動態光軌 mesh 明確設了 renderOrder=1（見 BatchedTrails.ts
      //   註解）：舊碼光球預設 0 < 1，故舊畫面固定是「動態光軌疊在光球之上」；
      //   新值一律 <1 維持這個關係，若 ≥1 會反過來把光球蓋到光軌上面（同樣實測
      //   驗證過會壞）。
      // 這組值是 2026-09-02 T1-1 視覺回歸（maxDiff=0 驗收）逐步排除法定出來的，
      // 之後若要再調 orb 的 renderOrder，務必連同這兩個既有關係一起測。
      mesh.renderOrder = cfg.renderOrder;
      scene.add(mesh);
      this.layers.push({ mesh, baseOpacity: cfg.opacity, scaleRatio: cfg.scaleRatio, matrixArray });
    }

    // Blink layer（紅色閃爍，較低 detail）
    const blinkMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.1, 0.1),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // 同上：globe 地形的 depth 會殺掉光球
    });
    // 閃爍：原本 CPU 算 blinkOpacity 後用 setColorAt 把「alpha 編進 RGB 強度」塞進
    // instanceColor（material.opacity 本身固定 0，實際可見度全靠 instanceColor 的 RGB
    // 強度）。這裡不再用 instanceColor 機制（不必每幀 setColorAt + 上傳），改在 vertex
    // shader 算出同一組 blink1/blink2/blinkOpacity 數值傳 varying，fragment 直接把它
    // 乘進 diffuseColor.rgb —— 數學上等價於「material.color × (o, o*0.1, o*0.1)」。
    blinkMat.onBeforeCompile = (shader) => {
      shader.uniforms["uTime"] = { value: 0 };
      shader.vertexShader =
        `attribute float aPhase;\nuniform float uTime;\nvarying float vBlink;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
	float cycle = mod( ( uTime + aPhase ) * ${glslFloat(BLINK_RATE)}, 1.0 );
	float blink1 = cycle < 0.1 ? 1.0 : 0.0;
	float blink2 = ( cycle > 0.15 && cycle < 0.25 ) ? 0.7 : 0.0;
	vBlink = max( blink1, blink2 );`,
      );
      shader.fragmentShader = `varying float vBlink;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec4 diffuseColor = vec4( diffuse, opacity );
	diffuseColor.rgb *= vec3( vBlink, vBlink * 0.1, vBlink * 0.1 );`,
      );
      blinkMat.userData["uTimeUniform"] = shader.uniforms["uTime"];
    };
    const blinkMesh = new THREE.InstancedMesh(this.blinkGeo, blinkMat, MAX_INSTANCES);
    blinkMesh.count = 0;
    blinkMesh.frustumCulled = false;
    blinkMesh.renderOrder = 0.4; // 三層 orb 中最上層：閃爍疊在三層 orb 之上（見上方 renderOrder 註解）
    scene.add(blinkMesh);
    const blinkMatrixArray = blinkMesh.instanceMatrix.array as Float32Array;
    this.blinkLayer = { mesh: blinkMesh, baseOpacity: 1.0, scaleRatio: 0.4, matrixArray: blinkMatrixArray };
  }

  /**
   * 批次更新所有活躍光球
   * @param entries - 活躍航班的 [id, x, y, z] 陣列
   * @param entriesUnchanged - true 表示 entries 內容（含座標）保證與上次呼叫相同
   *   （FlightScene.update() 的「暫停/時間未動」快速路徑重複傳同一份 lastOrbEntries 時給
   *   true；其餘一律 false）。搭配 globe/相機/縮放簽章決定是否要重算 instanceMatrix。
   */
  updateAll(
    entries: Array<{ id: string; x: number; y: number; z: number }>,
    entriesUnchanged: boolean,
  ) {
    this.count = Math.min(entries.length, MAX_INSTANCES);

    // uTime：DEV 視覺回歸凍結時用釘死的值（與改動前的凍結路徑等價），否則走 wall-clock 秒數。
    // 這是純 uniform 寫入（非 attribute buffer），不會觸發 bufferData/bufferSubData，
    // 故無論是否需要重算 instanceMatrix，每幀寫都是免費的。
    const frozen = getFrozenAnimTime();
    const t = frozen ?? performance.now() / 1000;
    for (const layer of this.layers) setTimeUniform(layer.mesh.material as THREE.Material, t);
    setTimeUniform(this.blinkLayer.mesh.material as THREE.Material, t);

    const cam = this.globeCam;
    const first = this.count > 0 ? entries[0]!.id : "";
    const last = this.count > 0 ? entries[this.count - 1]!.id : "";
    const metaSig =
      `${this.count}|${first}|${last}|${this.globeTransition}|${this.globeToMerc !== null}` +
      `|${cam ? cam.x : 0}|${cam ? cam.y : 0}|${cam ? cam.z : 0}|${this.orbScale}`;
    const scaleMapChanged = this.scaleMap !== this.lastScaleMapRef;
    const needsRecompute = !entriesUnchanged || metaSig !== this.lastMatrixSig || scaleMapChanged;

    if (!needsRecompute) return; // 暫停＋相機靜止：instance buffer 零上傳

    this.lastMatrixSig = metaSig;
    this.lastScaleMapRef = this.scaleMap;
    this.flightIds.length = this.count;

    for (let i = 0; i < this.count; i++) {
      const e = entries[i]!;
      this.flightIds[i] = e.id;

      // 貼球：mercator → globe（含背面 cull）；平面模式直接回傳 mercator
      mercatorToGlobe(e.x, e.y, e.z, this.globeToMerc, this.globeTransition, this.globeCam, _g);
      const gx = _g.x, gy = _g.y, gz = _g.z;
      // 光球比 1px 軌跡線大得多，沿用軌跡的窄剔除帶（-0.08~0.02）會在球緣「戳出」輪廓外
      // → 光球改用寬淡出帶：與相機夾角 >70°（dot<0.35）開始縮小、~85°（0.08）歸零
      const limbFade = _g.dot >= 0.35 ? 1 : Math.max(0, (_g.dot - 0.08) / 0.27);
      // 與 shader 的 mix(globeCull, 1.0, uTransition) 對齊：過渡帶接近平面時
      // 球面地平線剔除逐步失效，修 z5.9 附近遠處光球被錯誤藏掉的問題
      const globeCull = Math.min(_g.cull, limbFade);
      const cull = globeCull + (1 - globeCull) * this.globeTransition;
      // 存貼球後座標供點擊拾取（與渲染一致）
      this.positions[i * 3] = gx;
      this.positions[i * 3 + 1] = gy;
      this.positions[i * 3 + 2] = gz;

      // Per-instance multiplier（按機型等分類調整大小，未設定則 1.0）
      const mul = this.scaleMap?.get(e.id) ?? 1.0;

      // T3-4（2026-09-03）：四層原本各自用 Object3D（position.set + scale.set +
      // updateMatrix 做 quaternion→matrix 組合）再 setMatrixAt（Matrix4.toArray 複製
      // 16 個 float）。旋轉恆為單位四元數、四層位置相同，等價矩陣其實只有 6 個欄位
      // 會變（column-major：對角線 0,5,10 放 scale，12,13,14 放 position，其餘欄位
      // 因 InstancedMesh 建構時已全數初始化為 identity 而永遠是 0（非對角）或 1（[15]）
      // ——見 OrbLayer.matrixArray 欄位註解），故直接寫這 6 個欄位到快取的
      // instanceMatrix.array，略過 Object3D 與 Matrix4.toArray 兩層轉換。
      // 乘法順序刻意維持與舊碼相同的 orbScale*scaleRatio*mul*cull（不引入 base 這種
      // 共用中間值）：orb 三層的 scaleRatio（0.5/1.0/2.0）是 2 的冪，重新結合律不影響
      // rounding，但 blink 層 scaleRatio=0.4 不是 2 的冪，若中間值重新分組會有 1-ulp
      // 浮點捨入風險，故不省這個乘法。
      // Orb layers（cull：球體背面的光球縮到 0 隱藏；呼吸 pulse 已搬進 shader，這裡的
      // scale 只含靜態部分）
      const off = i * 16;
      for (const layer of this.layers) {
        const s = this.orbScale * layer.scaleRatio * mul * cull;
        const arr = layer.matrixArray;
        arr[off] = s;
        arr[off + 5] = s;
        arr[off + 10] = s;
        arr[off + 12] = gx;
        arr[off + 13] = gy;
        arr[off + 14] = gz;
      }

      // Blink layer（閃爍强度已搬進 shader，這裡的 scale 同樣不含動畫成分）
      const bs = this.orbScale * this.blinkLayer.scaleRatio * mul * cull;
      const barr = this.blinkLayer.matrixArray;
      barr[off] = bs;
      barr[off + 5] = bs;
      barr[off + 10] = bs;
      barr[off + 12] = gx;
      barr[off + 13] = gy;
      barr[off + 14] = gz;
    }

    // 更新 instance counts 和 matrix
    for (const layer of this.layers) {
      layer.mesh.count = this.count;
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
    this.blinkLayer.mesh.count = this.count;
    this.blinkLayer.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 設定光球大小（全域基準） */
  setScale(scale: number) {
    this.orbScale = scale;
  }

  /** 設定貼球參數（每幀由 FlightScene.setGlobe 傳入） */
  setGlobe(globeToMerc: THREE.Matrix4 | null, transition: number, cam: THREE.Vector3 | null) {
    this.globeToMerc = globeToMerc;
    this.globeTransition = transition;
    this.globeCam = cam;
  }

  /** 設定 per-instance scale multiplier；null = 還原為全 1.0 */
  setScaleMap(map: Map<string, number> | null) {
    this.scaleMap = map;
  }

  /** 切換主題 */
  setTheme(color: THREE.Color, blending: THREE.Blending) {
    for (let i = 0; i < this.layers.length; i++) {
      const mat = this.layers[i]!.mesh.material as THREE.MeshBasicMaterial;
      mat.blending = blending;
      if (i > 0) mat.color.copy(color);
      mat.needsUpdate = true;
    }
  }

  /**
   * 點擊拾取：螢幕座標 → 最近的 flightId
   */
  pickFlight(
    screenX: number, screenY: number,
    viewWidth: number, viewHeight: number,
    matrix: THREE.Matrix4,
  ): string | null {
    const threshold = 25;
    let closest: { id: string; dist: number } | null = null;
    const v = new THREE.Vector4();

    for (let i = 0; i < this.count; i++) {
      const ox = this.positions[i * 3]!;
      const oy = this.positions[i * 3 + 1]!;
      const oz = this.positions[i * 3 + 2]!;

      v.set(ox, oy, oz, 1.0).applyMatrix4(matrix);
      if (v.w <= 0) continue;

      const sx = ((v.x / v.w) * 0.5 + 0.5) * viewWidth;
      const sy = ((-v.y / v.w) * 0.5 + 0.5) * viewHeight;

      const dist = Math.hypot(sx - screenX, sy - screenY);
      if (dist < threshold && (!closest || dist < closest.dist)) {
        closest = { id: this.flightIds[i]!, dist };
      }
    }

    return closest?.id ?? null;
  }

  dispose() {
    for (const layer of this.layers) {
      (layer.mesh.material as THREE.Material).dispose();
      layer.mesh.dispose();
    }
    (this.blinkLayer.mesh.material as THREE.Material).dispose();
    this.blinkLayer.mesh.dispose();
    this.geo.dispose();
    this.blinkGeo.dispose();
  }
}
