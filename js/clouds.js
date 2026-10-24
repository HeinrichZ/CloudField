/* clouds.js — CloudField 体积云渲染器
 * 性能地基：early ray termination / ray jitter + TAA / 空区间跳过(occupancy 3D纹理)
 *          / 自适应 pixelRatio / 密度粗网格由 Web Worker 计算
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 *
 * 关于空区间跳过的两个坑（踩过，别再踩）：
 *   1. occ 是 2.5 km 粗网格上的“体素内密度最大值”，子采样只有 2×2×2，
 *      而密度场的细节项最细约 0.1 km——粗网格必然漏判。实测 1309 个空体素里
 *      有 205 个其实藏着密度 0.5 的云。漏判体素被跳过时，光学厚度按 stepSize
 *      结算，只有应有值的 1/5，画面上就成了体素对齐的半透明矩形窗（见 tools/occ_check.js）。
 *      对策：occ 出 worker 前先做 1 邻域膨胀（max 滤波），宁可少跳也不抽掉云。
 *   2. 云体随 uWind*uTime 平移，但 occ 是在 t=0 的噪声空间里算的。
 *      直接按世界坐标采样会随时间漂移错配，所以下面统一换算到噪声空间再查 occ。
 */
(function (global) {
  'use strict';

  const MAX_LAYERS = 5;
  const OCC_DIM = 16;          // occupancy 分辨率（≥8）
  const OCC_DOM = 40;          // 水平域 ±20 km
  const OCC_EPS = 0.03;        // 空区间阈值

  const VERT = `#version 300 es
  void main(){
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  // ---------- 主光线步进着色器 ----------
  const FRAG = `#version 300 es
  precision highp float;
  out vec4 fragColor;

  uniform vec2  uResolution;
  uniform vec3  uCamPos, uCamRight, uCamUp, uCamFwd;
  uniform float uTanFov;
  uniform float uTime;
  uniform vec3  uSunDir;
  uniform vec2  uWind;
  uniform int   uViewMode;
  uniform float uShowSun, uShowGrid, uMaxAlt;
  uniform int   uSteps;
  uniform float uSurfaceTemp, uLapse, uSurfacePressure;
  // 温度/气压视图的等值带与等值线：bw 为带宽度（温度 °C、气压 hPa）
  uniform float uFieldBand, uBandT, uBandP;
  uniform vec2  uBaseTop[${MAX_LAYERS}];
  uniform vec2  uCovDen[${MAX_LAYERS}];
  uniform vec2  uScaleDet[${MAX_LAYERS}];
  uniform float uType[${MAX_LAYERS}];

  uniform highp sampler3D uOcc;   // ES 3.00 中 sampler3D 无默认精度，必须显式限定（严格驱动编译报错）
  uniform float uOccAvail;
  uniform float uOccDomX;
  uniform float uOccSkip;
  uniform float uJitter;

  // 剖面高度轴：穿过云体的一条高亮水平线
  uniform float uSliceAlt, uSliceOn;
  // 微物理属性着色叠加：色标由 CMap 导出成 256×1 LUT，与 2D 图例、水平切片共用一份定义
  uniform highp sampler2D uTintTex;
  uniform int   uTintField;       // 0 关闭 / 1 LWC / 2 β / 3 rₑ(派生)
  uniform float uTintAmt;
  uniform vec2  uTintRange;       // 归一化区间 [lo, hi]
  uniform float uLwcScale;        // LWC_MAX × 冰相折减
  uniform float uMicroRe;         // 有效半径 µm（β 用）
  uniform float uMicroN;          // 云滴数浓度 cm⁻³（派生 rₑ 用）
  uniform float uReMode;          // 1 = r_e 由 LWC 与 N 反推；0 = 用 uMicroRe
  // ETH CLOUDLAB 过冷水层云人工播云消散沟（WBF 冰化减消光）
  uniform float uSeedOn;
  uniform vec3  uSeedOrigin;      // (x0, alt, z0) km
  uniform vec2  uSeedDir;         // 顺风向单位向量 (ux, uz)
  uniform vec3  uSeedParams;      // (halfWidth, diffK, eff)

  float hash3(vec3 p){
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i+vec3(0,0,0)), hash3(i+vec3(1,0,0)), f.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){
    float a = 0.5, s = 0.0;
    for(int i=0;i<5;i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
  float smoothstep2(float a, float b, float x){
    float t = clamp((x-a)/(b-a), 0.0, 1.0);
    return t*t*(3.0-2.0*t);
  }

  float layerDensity(vec3 p, int i){
    float base = uBaseTop[i].x, top = uBaseTop[i].y;
    if(p.y < base || p.y > top) return 0.0;
    float h = (p.y - base) / max(0.001, top - base);
    float peak = 0.5, w = 1.0; float ty = uType[i];
    if(ty < 0.5){ peak = 0.75; w = 0.7; }
    else if(ty < 1.5){ peak = 0.5; w = 1.0; }
    else if(ty < 2.5){ peak = 0.4; w = 1.6; }
    else if(ty < 3.5){ peak = 0.32; w = 1.3; }
    else { peak = 0.4; w = 1.1; }
    float d2 = (h - peak) * 2.0;
    float vfall = exp(-d2 * d2 * w);
    float sc = uScaleDet[i].x, det = uScaleDet[i].y;
    vec3 np = vec3(p.x + uWind.x * uTime, p.y * 0.5 + uWind.y * uTime * 0.3, p.z + uWind.y * uTime) * sc;
    float n = fbm(np);
    n += det * (fbm(np * 3.1) - 0.5) * 0.6;
    n = clamp(n, 0.0, 1.0);
    float cov = smoothstep2(uCovDen[i].x - 0.09, uCovDen[i].x + 0.09, n);
    return cov * uCovDen[i].y * vfall;
  }
  float totalDensity(vec3 p){
    float d = 0.0;
    for(int i=0;i<${MAX_LAYERS};i++){ d += layerDensity(p, i); }
    if(uSeedOn > 0.5 && d > 0.0){
      float dz = abs(p.y - uSeedOrigin.y);
      if(dz < 0.95){
        vec2 dp = p.xz - uSeedOrigin.xz;
        float along = dot(dp, uSeedDir);
        float cross = -dp.x * uSeedDir.y + dp.y * uSeedDir.x;
        if(along > -1.0 && along < 32.0){
          float aRamp = (along < 0.0) ? exp(-along * along * 2.5) : 1.0;
          float fRamp = (along <= 0.0) ? 0.35 : (0.35 + 0.65 * (1.0 - exp(-along / 1.8)));
          float hw = max(0.4, uSeedParams.x + uSeedParams.y * sqrt(max(0.0, along)));
          float cW = exp(-(cross * cross) / (hw * hw));
          float vW = exp(-(dz * dz) / (0.55 * 0.55));
          float dep = clamp(uSeedParams.z * aRamp * fRamp * cW * vW, 0.0, 0.95);
          d *= (1.0 - dep);
        }
      }
    }
    return d;
  }
  float lightTransmittance(vec3 p){
    float d = 0.0; float ls = 0.7;
    for(int i=0;i<6;i++){
      vec3 sp = p + uSunDir * ls * (float(i) + 0.5);
      d += totalDensity(sp) * ls;
    }
    return exp(-d * 1.1);
  }
  vec3 jet(float t){
    t = clamp(t, 0.0, 1.0);
    float r = clamp(1.5 - abs(4.0*t - 3.0), 0.0, 1.0);
    float g = clamp(1.5 - abs(4.0*t - 2.0), 0.0, 1.0);
    float b = clamp(1.5 - abs(4.0*t - 1.0), 0.0, 1.0);
    return vec3(r, g, b);
  }
  // 云微物理派生量（单位见 colormap.js 的对应区间）
  float lwcAt(float d){ return clamp(d, 0.0, 1.0) * uLwcScale; }              // g/m³
  float betaAt(float lwc, float reUm){ return 1500.0 * lwc / max(0.5, reUm); } // km⁻¹
  float reAt(float lwc, float N){                                             // µm：由 LWC 与 N 反推
    float lwcKg = lwc / 1000.0;
    float Nm3 = max(1.0, N) * 1e6;
    return 1e6 * pow(max(1e-20, 3.0 * lwcKg / (4.0 * 3.14159265 * 1000.0 * Nm3)), 1.0 / 3.0);
  }
  vec3 tintOf(float q){
    float t = clamp((q - uTintRange.x) / max(1e-6, uTintRange.y - uTintRange.x), 0.0, 1.0);
    return texture(uTintTex, vec2(t, 0.5)).rgb;
  }
  vec3 tempColor(float T){ return jet((T + 70.0) / 110.0); }
  vec3 pressureColor(float P){ return jet((P - 100.0) / 900.0); }
  vec3 skyColor(vec3 rd){
    float h = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenith = vec3(0.16, 0.33, 0.62);
    vec3 horizon = vec3(0.60, 0.72, 0.86);
    vec3 c = mix(horizon, zenith, pow(h, 0.6));
    if(uShowSun > 0.5){
      float s = max(dot(rd, uSunDir), 0.0);
      c += vec3(1.0, 0.92, 0.7) * pow(s, 64.0) * 0.55;
    }
    return c;
  }
  vec3 groundColor(vec3 p){
    vec3 base = vec3(0.09, 0.13, 0.10);
    if(uShowGrid > 0.5){
      vec2 g = abs(fract(p.xz * 0.1) - 0.5);
      float line = smoothstep(0.46, 0.5, max(g.x, g.y));
      base = mix(base, vec3(0.24, 0.34, 0.44), line * 0.7);
    }
    return base;
  }
  float tempAt(float z){ return uSurfaceTemp - uLapse * z; }
  float pressAt(float z){
    float Tk0 = uSurfaceTemp + 273.15;
    float Tk  = tempAt(z) + 273.15;
    float lr = max(0.05, uLapse);
    float expo = 1000.0 * 9.80665 / (287.05 * lr);  // lr 为 K/km → Γ=lr/1000 K/m，须 ×1000
    return uSurfacePressure * pow(Tk / Tk0, expo);
  }
  // 世界坐标 -> occ 纹理坐标。occ 建在 t=0 的噪声空间里，云体则随 uWind*uTime 平移，
  // 所以查表前要先把点搬回噪声空间，否则云飘走后 occ 与实际密度错配。
  float sampleOcc(vec3 p){
    vec3 q = vec3(p.x + uWind.x*uTime, p.y + uWind.y*uTime*0.6, p.z + uWind.y*uTime);
    vec3 n = vec3((q.x + uOccDomX*0.5)/uOccDomX, q.y/uMaxAlt, (q.z + uOccDomX*0.5)/uOccDomX);
    if(any(lessThan(n, vec3(0.0))) || any(greaterThan(n, vec3(1.0)))) return 1.0;   // 域外一律按有云处理
    return texture(uOcc, n).r;
  }

  void main(){
    vec2 p = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
    vec3 rd = normalize(uCamFwd + (p.x * uCamRight + p.y * uCamUp) * uTanFov);
    vec3 ro = uCamPos;
    vec3 sky = skyColor(rd);

    float tEnter, tExit;
    if(abs(rd.y) < 1e-4){
      tEnter = 0.0;
      tExit = (ro.y >= 0.0 && ro.y <= uMaxAlt) ? 240.0 : 0.0;
    } else {
      float t0 = (0.0 - ro.y) / rd.y;
      float t1 = (uMaxAlt - ro.y) / rd.y;
      tEnter = max(0.0, min(t0, t1));
      tExit  = max(t0, t1);
    }
    if(tExit < 0.0) tExit = 0.0;
    float tGround = (rd.y < -1e-4) ? (-ro.y / rd.y) : -1.0;
    float farLimit = min(tExit, 240.0);
    bool hitGround = false;
    if(tGround > 0.0 && tGround < farLimit){ farLimit = tGround; hitGround = true; }

    // 剖面高度：解析求光线与 y=uSliceAlt 平面的交点，只画云场范围内的那一段
    float tSlice = -1.0;
    if(uSliceOn > 0.5 && abs(rd.y) > 1e-5){
      float ts = (uSliceAlt - ro.y) / rd.y;
      if(ts > tEnter && ts < farLimit){
        vec3 sp = ro + rd * ts;
        if(abs(sp.x) < uOccDomX*0.5 && abs(sp.z) < uOccDomX*0.5) tSlice = ts;
      }
    }

    float stepSize = (farLimit - tEnter) / float(uSteps);
    float t = tEnter + (0.5 + uJitter) * stepSize;   // ray jitter：打散起始位置消 banding
    float absorb = 1.6;
    float transmittance = 1.0;
    vec3 col = vec3(0.0);
    bool fieldMode = (uViewMode == 1 || uViewMode == 2);   // 温度/压力：沿射线累积标量场
    vec3 fieldCol = vec3(0.0);                             // 当前样本的场色
    // 场视图的“代表高度”：等值带/等值线取该处的场值。
    //   hitY = 沿视线第一个有效云样本的高度（云顶）——俯视时它随云顶起伏，是唯一能产生水平差异的量；
    //   repY = 透射率首次降到 0.5 的高度（无云或薄云时的可见深度）。
    // 早期用“透过率加权平均”代替，但距离权重衰减太慢，平均值几乎恒为 -18 °C（全图同档），已弃用。
    float hitY = -1.0, repY = -1.0;

    for(int i=0;i<512;i++){
      if(t > farLimit) break;
      if(transmittance < 0.003) break;               // early ray termination：T→0 直接跳出
      vec3 pos = ro + rd * t;
      float step = stepSize;
      if(uOccAvail > 0.5 && !fieldMode){              // 空区间跳过（场模式不能跳，否则场被挖空）
        // 步长随 occ 连续过渡，而不是 occ<eps 一刀切跳 2.5 km——
        // 硬阈值会把体素边界直接画成一条直线（就是那个方块的边）。
        float occ = sampleOcc(pos);
        step = mix(uOccSkip, stepSize, clamp(occ / ${OCC_EPS.toFixed(2)}, 0.0, 1.0));
      }
      float d = totalDensity(pos);
      // 温度/气压：逐段累积场色，权重随距离衰减（近处占比大），保留沿高度的连续梯度。
      // 早期版本在这里“取第一个云样本就 break，再用单值覆盖整条射线”，
      // 于是无云/远景像素全部取 tempAt(uSliceAlt) 同一个常数——画面顶部整片同色、看起来“固定不变”。
      if(fieldMode){
        // 记录代表高度（必须在改写 transmittance 之前读）
        if(hitY < 0.0 && d > 0.02) hitY = pos.y;
        if(repY < 0.0 && transmittance < 0.5) repY = pos.y;
        float fz = (uViewMode == 1) ? tempAt(pos.y) : pressAt(pos.y);
        fieldCol = (uViewMode == 1) ? tempColor(fz) : pressureColor(fz);
        float w = 0.06 / (1.0 + t * 0.05);
        col += transmittance * w * fieldCol;
        transmittance *= (1.0 - w);
        // 云体额外强调：让云顶高度差异在场视图里显出来，而不是整屏一片
        if(d > 0.02){
          float ltF = lightTransmittance(pos);
          float aC = (1.0 - exp(-d * step * 2.2)) * (0.45 + 0.45 * ltF);
          col += transmittance * aC * fieldCol;
          transmittance *= (1.0 - aC);
        }
      }
      if(!fieldMode && d > 0.01){
        // 样本代表它到下一个样本的那一段，段长就是 step（跳步时可达 2.5 km）。
        // 写死 stepSize 会让跳步区的光学厚度按 0.5 km 结算，云凭空薄掉五分之四。
        float od = d * step * absorb;
        float lt = lightTransmittance(pos);
        vec3 sc;
        if(uViewMode == 0){
          vec3 sunC = vec3(1.0, 0.96, 0.86);
          vec3 ambC = vec3(0.45, 0.52, 0.66);
          sc = ambC * 0.55 + sunC * lt;
          float darkBase = 1.0 - smoothstep(0.0, 2.0, pos.y);
          sc *= mix(0.55, 1.0, lt);
          sc = mix(sc * 0.7, sc, darkBase);
        } else if(uViewMode == 1){
          sc = tempColor(tempAt(pos.y)) * (0.5 + 0.5 * lt);
        } else if(uViewMode == 2){
          sc = pressureColor(pressAt(pos.y)) * (0.5 + 0.5 * lt);
        } else if(uViewMode == 3){
          sc = tintOf(lwcAt(d)) * (0.6 + 0.4 * lt);
        } else {
          sc = vec3(clamp(d, 0.0, 1.0));
        }

        // 微物理属性半透明叠加（放在视图配色之后——sc 在这里才刚有值）
        if(uTintField > 0){
          float lwcv = lwcAt(d);
          float reEff = (uReMode > 0.5) ? reAt(lwcv, uMicroN) : uMicroRe;
          float q = (uTintField == 1) ? lwcv
                  : (uTintField == 2) ? betaAt(lwcv, reEff)
                                      : reAt(lwcv, uMicroN);
          sc = mix(sc, tintOf(q), uTintAmt);
        }

        // 剖面高度：只画切片平面（±20 km 矩形）的边框，不整面高亮——
        // 俯视时整面高亮会把云体糊成一片黄，边框从任何角度看都是一条细线。
        if(tSlice > 0.0 && t <= tSlice && t + step >= tSlice){
          vec3 sp = ro + rd * tSlice;
          vec2 q = abs(sp.xz);
          if(max(q.x, q.y) > uOccDomX*0.5 - 0.35){
            float sa = 0.65;
            col += transmittance * sa * vec3(1.0, 0.86, 0.32);
            transmittance *= (1.0 - sa);
          }
        }

        float a = 1.0 - exp(-od);
        col += transmittance * a * sc;
        transmittance *= (1.0 - a);
      }
      t += step;
    }

    vec3 bg = hitGround ? groundColor(ro + rd * tGround) : sky;
    vec3 finalColor = col + transmittance * bg;

    // 温度/气压：等值带 + 等值线。
    // 俯视时环境场只随高度变化，任何“只按高度取值”的平滑着色必然整片同色；
    // 这里改用**代表高度**取样：有云取云顶（随云顶起伏 → 有水平差异），无云取透射率半衰点/地面，
    // 再按 5 °C / 25 hPa 分档并画等值线，云顶高低的边界就被勾出来了。
    if(fieldMode && uFieldBand > 0.5){
      float ry = (hitY >= 0.0) ? hitY : ((repY >= 0.0) ? repY : (hitGround ? 0.0 : 14.0));
      float fmean = (uViewMode == 1) ? tempAt(ry) : pressAt(ry);
      float bw = (uViewMode == 1) ? max(0.5, uBandT) : max(1.0, uBandP);
      float qv = floor(fmean / bw) * bw + 0.5 * bw;      // 取带中心值 → 平色分档
      vec3 bc = (uViewMode == 1) ? tempColor(qv) : pressureColor(qv);
      finalColor = mix(finalColor, bc, 0.82);
      // 等值线：到最近带边界的距离；fwidth 让线宽随屏幕导数自适应（远处不锯齿、近处不过粗）
      float gg = fmean / bw;
      float fd = abs(fract(gg + 0.5) - 0.5);
      float aa = max(fwidth(gg), 1e-5) * 0.85;
      float line = 1.0 - smoothstep(0.0, aa, fd);
      // 线色随底色亮度反转：暗底用亮线、亮底用暗线，两种极端色下都看得见
      float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      vec3 lineCol = (lum < 0.45) ? vec3(0.90, 0.94, 1.0) : vec3(0.03, 0.045, 0.075);
      finalColor = mix(finalColor, lineCol, line * 0.78);
    }
    finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.9));
    fragColor = vec4(finalColor, 1.0);
  }`;

  // ---------- 合成（TAA 累加）与拷贝 ----------
  const COMP_FRAG = `#version 300 es
  precision highp float;
  out vec4 o;
  uniform highp sampler2D uScene, uAccum;
  uniform float uBlend;
  uniform vec2 uResolution;
  void main(){
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 s = texture(uScene, uv).rgb;
    vec3 a = texture(uAccum, uv).rgb;
    o = vec4(mix(a, s, uBlend), 1.0);
  }`;
  const COPY_FRAG = `#version 300 es
  precision highp float;
  out vec4 o;
  uniform highp sampler2D uTex;
  uniform vec2 uResolution;
  void main(){
    vec2 uv = gl_FragCoord.xy / uResolution;
    o = vec4(texture(uTex, uv).rgb, 1.0);
  }`;

  // ---------- 密度粗网格 Worker 源码（内联，file:// 可用）----------
  const OCC_WORKER_SRC = `
  self.onmessage = function(e){
    var d = e.data; if(!d || d.type !== 'compute') return;
    var layers = d.layers;
    var dim = d.dim, domX = d.domX, maxAlt = d.maxAlt, subs = d.subs || 1;
    var data = new Float32Array(dim*dim*dim);
    var cx = domX/dim, cy = maxAlt/dim, cz = domX/dim;
    function hash3(x,y,z){ var px=x*0.3183099+0.1, py=y*0.3183099+0.1, pz=z*0.3183099+0.1;
      px=px-Math.floor(px); py=py-Math.floor(py); pz=pz-Math.floor(pz); px*=17; py*=17; pz*=17;
      var v=px*py*pz*(px+py+pz); return v-Math.floor(v); }
    function vnoise(x,y,z){ var ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
      var fx=x-ix, fy=y-iy, fz=z-iz; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy); fz=fz*fz*(3-2*fz);
      function h(a,b,c){ return hash3(a,b,c); }
      var c000=h(ix,iy,iz),c100=h(ix+1,iy,iz),c010=h(ix,iy+1,iz),c110=h(ix+1,iy+1,iz);
      var c001=h(ix,iy,iz+1),c101=h(ix+1,iy,iz+1),c011=h(ix,iy+1,iz+1),c111=h(ix+1,iy+1,iz+1);
      return ((c000*(1-fx)+c100*fx)*(1-fy)+(c010*(1-fx)+c110*fx)*fy)*(1-fz)
           + ((c001*(1-fx)+c101*fx)*(1-fy)+(c011*(1-fx)+c111*fx)*fy)*fz; }
    function fbm(x,y,z){ var a=0.5,s=0; for(var i=0;i<5;i++){ s+=a*vnoise(x,y,z); x*=2.03; y*=2.03; z*=2.03; a*=0.5; } return s; }
    function smoothstep(e0,e1,x){ var t=(x-e0)/(e1-e0); t=t<0?0:(t>1?1:t); return t*t*(3-2*t); }
    function layerDensity(px,py,pz,L){ var base=L.base, top=L.top; if(py<base||py>top) return 0;
      var h=(py-base)/Math.max(0.001,top-base); var peak=0.5,w=1.0,ty=L.type;
      if(ty<0.5){peak=0.75;w=0.7;} else if(ty<1.5){peak=0.5;w=1.0;} else if(ty<2.5){peak=0.4;w=1.6;} else if(ty<3.5){peak=0.32;w=1.3;} else {peak=0.4;w=1.1;}
      var d2=(h-peak)*2; var vfall=Math.exp(-d2*d2*w); var sc=L.scale, det=L.detail;
      var sx=px*sc, sy=(py*0.5)*sc, sz=pz*sc;
      var n=fbm(sx,sy,sz); n += det*(fbm(sx*3.1,sy*3.1,sz*3.1)-0.5)*0.6; n=n<0?0:(n>1?1:n);
      var cov=smoothstep(L.coverage-0.09, L.coverage+0.09, n);
      return cov*L.density*vfall; }
    function totalDensity(px,py,pz){ var dd=0; for(var k=0;k<layers.length;k++) dd+=layerDensity(px,py,pz,layers[k]); return dd; }
    for(var k=0;k<dim;k++){ var z=((k+0.5)/dim)*domX - domX/2;
      for(var j=0;j<dim;j++){ var y=((j+0.5)/dim)*maxAlt;
        for(var i=0;i<dim;i++){ var x=((i+0.5)/dim)*domX - domX/2;
          var mx=0;
          for(var a=0;a<subs;a++) for(var b=0;b<subs;b++) for(var c=0;c<subs;c++){
            var ox=((a+0.5)/subs-0.5)*cx, oy=((b+0.5)/subs-0.5)*cy, oz=((c+0.5)/subs-0.5)*cz;
            var val=totalDensity(x+ox,y+oy,z+oz); if(val>mx) mx=val; }
          data[(k*dim+j)*dim+i] = mx; } } }
    // 膨胀：每个体素取 3×3×3 邻域最大值。
    // subs=2 的子采样漏判率不低（实测 15.7% 的空体素其实有云），
    // 直接拿它当跳过依据会把云抽成方块；膨胀一圈后漏判归零，代价只是少跳一点。
    var out = new Float32Array(dim*dim*dim);
    for(var k2=0;k2<dim;k2++) for(var j2=0;j2<dim;j2++) for(var i2=0;i2<dim;i2++){
      var m=0;
      for(var dk=-1;dk<=1;dk++){ var kk=k2+dk; if(kk<0||kk>=dim) continue;
        for(var dj=-1;dj<=1;dj++){ var jj=j2+dj; if(jj<0||jj>=dim) continue;
          for(var di=-1;di<=1;di++){ var ii=i2+di; if(ii<0||ii>=dim) continue;
            var v=data[(kk*dim+jj)*dim+ii]; if(v>m) m=v; } } }
      out[(k2*dim+j2)*dim+i2] = m;
    }
    self.postMessage({type:'done', buf: out.buffer, dim: dim}, [out.buffer]);
  };`;

  // ----------------------- 渲染器类 -----------------------
  function CloudRenderer(canvas) {
    this.canvas = canvas;
    let gl;
    try { gl = GLU.getContext(canvas, { preserveDrawingBuffer: true }); }
    catch (e) { throw e; }
    this.gl = gl;

    this.tier = 1;           // 1=完整TAA/occ, 0=降级直渲
    try {
      this.prog = GLU.createProgram(gl, VERT, FRAG);
      this.progComp = GLU.createProgram(gl, VERT, COMP_FRAG);
      this.progCopy = GLU.createProgram(gl, VERT, COPY_FRAG);
      this.vao = GLU.createFullscreenVAO(gl);
    } catch (e) { this.tier = 0; throw e; }

    this.u = {};
    const names = ['uResolution','uCamPos','uCamRight','uCamUp','uCamFwd','uTanFov','uTime',
      'uSunDir','uWind','uViewMode','uShowSun','uShowGrid','uMaxAlt','uSteps',
      'uBaseTop','uCovDen','uScaleDet','uType','uSurfaceTemp','uLapse','uSurfacePressure',
      'uOcc','uOccAvail','uOccDomX','uOccSkip','uJitter',
      'uSliceAlt','uSliceOn','uTintTex','uTintField','uTintAmt','uTintRange',
      'uLwcScale','uMicroRe','uMicroN','uReMode','uFieldBand','uBandT','uBandP',
      'uSeedOn','uSeedOrigin','uSeedDir','uSeedParams'];
    for (const n of names) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.uComp = {
      uScene: gl.getUniformLocation(this.progComp, 'uScene'),
      uAccum: gl.getUniformLocation(this.progComp, 'uAccum'),
      uBlend: gl.getUniformLocation(this.progComp, 'uBlend'),
      uResolution: gl.getUniformLocation(this.progComp, 'uResolution'),
    };
    this.uCopy = {
      uTex: gl.getUniformLocation(this.progCopy, 'uTex'),
      uResolution: gl.getUniformLocation(this.progCopy, 'uResolution'),
    };

    this.bufBaseTop = new Float32Array(MAX_LAYERS * 2);
    this.bufCovDen = new Float32Array(MAX_LAYERS * 2);
    this.bufScaleDet = new Float32Array(MAX_LAYERS * 2);
    this.bufType = new Float32Array(MAX_LAYERS);

    // 目标帧缓冲（TAA）
    this.sceneTex = null; this.accTex = [null, null];
    this.fboScene = null; this.fboAcc = [null, null];
    this.accRead = 0; this.accWrite = 1;
    this.accReset = true; this.accumFrames = 0;

    // 自适应 pixelRatio
    this.basePr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pixelRatio = this.basePr * Math.min(1, Atmosphere.STATE.quality + 0.2);
    this._lastT = performance.now(); this._ema = 16; this._lastPrT = 0;

    // occupancy 3D 纹理 + Worker
    this.occTex = null; this.occAvail = 0.0;
    this.occSkip = OCC_DOM / OCC_DIM;
    this.worker = null;
    try {
      const blob = new Blob([OCC_WORKER_SRC], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'done') this.setOccupancy(ev.data.buf, ev.data.dim);
      };
      this.worker.onerror = () => { this.worker = null; };
    } catch (e) { this.worker = null; }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  CloudRenderer.VIEWS = { real: 0, temp: 1, pressure: 2, water: 3, coverage: 4 };

  CloudRenderer.prototype.setOccupancy = function (buf, dim) {
    const gl = this.gl;
    try {
      if (!this.occTex) this.occTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, this.occTex);
      // R16F 而非 R32F：WebGL2 核心只保证半浮点可线性过滤，R32F 需要 OES_texture_float_linear。
      // 决策场要平滑，NEAREST 会把体素边界直接画成硬边。
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, dim, dim, dim, 0, gl.RED, gl.FLOAT, new Float32Array(buf));
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      this.occAvail = 1.0; this.occDim = dim;
    } catch (e) { this.occAvail = 0.0; }
  };

  CloudRenderer.prototype.requestOccupancy = function () {
    if (!this.worker) return;
    const S = Atmosphere.STATE;
    const layers = Atmosphere.effectiveLayers().map(L => ({
      base: L.base, top: L.top, coverage: L.coverage, density: L.density,
      scale: L.scale, detail: L.detail, type: L.type,
    }));
    // 不传风：occ 建在噪声空间里，与 uTime 无关，云的平移在着色器采样时补偿。
    this.worker.postMessage({
      type: 'compute', layers,
      dim: OCC_DIM, domX: OCC_DOM, maxAlt: Atmosphere.MAX_ALT, subs: 2,
    });
  };

  CloudRenderer.prototype.resetAccum = function () { this.accReset = true; };

  CloudRenderer.prototype.exportImage = function (type) {
    try { return this.canvas.toDataURL(type || 'image/png'); }
    catch (e) { return null; }
  };

  CloudRenderer.prototype._ensureTargets = function (w, h) {
    const gl = this.gl;
    const make = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    };
    const a = make(), b = make(), c = make();
    if (this.fboScene) { gl.deleteFramebuffer(this.fboScene); gl.deleteTexture(this.sceneTex); }
    if (this.fboAcc[0]) { gl.deleteFramebuffer(this.fboAcc[0]); gl.deleteTexture(this.accTex[0]); }
    if (this.fboAcc[1]) { gl.deleteFramebuffer(this.fboAcc[1]); gl.deleteTexture(this.accTex[1]); }
    this.sceneTex = a.tex; this.fboScene = a.fbo;
    this.accTex = [b.tex, c.tex]; this.fboAcc = [b.fbo, c.fbo];
  };

  CloudRenderer.prototype.resize = function () {
    const gl = this.gl;
    const q = Atmosphere.STATE.quality;
    const pr = this.pixelRatio * (0.6 + 0.4 * q);
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * pr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * pr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      if (this.tier === 1) { this._ensureTargets(w, h); this.accReset = true; }
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  CloudRenderer.prototype._adaptPr = function () {
    const now = performance.now();
    const dt = now - this._lastT; this._lastT = now;
    if (dt > 0 && dt < 1000) this._ema = this._ema * 0.9 + dt * 0.1;
    // 死区 + 0.5 s 节流：避免帧时间在阈值附近抖动时 pixelRatio 反复升降，
    // 因为每次 resize 都会 accReset（TAA 重新累积），表现就是画面一直不够清晰。
    if (now - (this._lastPrT || 0) < 500) return;
    this._lastPrT = now;
    if (this._ema > 26) this.pixelRatio = Math.max(0.5, this.pixelRatio * 0.93);
    else if (this._ema < 11) this.pixelRatio = Math.min(this.basePr, this.pixelRatio * 1.05);
  };

  CloudRenderer.prototype.render = function (camera, timeSec) {
    const gl = this.gl, S = Atmosphere.STATE, u = this.u;
    this._adaptPr();
    this.resize();

    const layers = Atmosphere.effectiveLayers();
    this.bufBaseTop.fill(0); this.bufCovDen.fill(0); this.bufScaleDet.fill(0); this.bufType.fill(0);
    for (let i = 0; i < MAX_LAYERS; i++) {
      if (i < layers.length) {
        const L = layers[i];
        this.bufBaseTop[i * 2] = L.base; this.bufBaseTop[i * 2 + 1] = L.top;
        this.bufCovDen[i * 2] = L.coverage; this.bufCovDen[i * 2 + 1] = L.density;
        this.bufScaleDet[i * 2] = L.scale; this.bufScaleDet[i * 2 + 1] = L.detail;
        this.bufType[i] = L.type;
      }
    }
    const dir = (S.windDir + 180) * Math.PI / 180;
    const sp = S.windSpeed * (Atmosphere.WIND_SCALE || 0.01);
    const wx = Math.sin(dir) * sp, wz = Math.cos(dir) * sp;
    const se = S.sunElev * Math.PI / 180, sa = S.sunAz * Math.PI / 180;
    const sun = [Math.cos(se) * Math.sin(sa), Math.sin(se), Math.cos(se) * Math.cos(sa)];
    const viewMode = CloudRenderer.VIEWS[S.viewMode] || 0;
    const steps = Math.floor(36 + 64 * S.quality);
    this.jitter = Math.random();

    // ---- 直渲降级 ----
    if (this.tier === 0) {
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      this._setRayUniforms(gl, u, camera, timeSec, steps, viewMode, wx, wz, sun);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      return;
    }

    // ---- Pass1: 光线步进 -> sceneTex ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboScene);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    this._setRayUniforms(gl, u, camera, timeSec, steps, viewMode, wx, wz, sun);
    gl.activeTexture(gl.TEXTURE0);
    if (this.occTex) gl.bindTexture(gl.TEXTURE_3D, this.occTex); else gl.bindTexture(gl.TEXTURE_3D, this._empty3D(gl));
    gl.uniform1i(u.uOcc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // ---- Pass2: 合成 -> accumWrite ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboAcc[this.accWrite]);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.progComp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.uniform1i(this.uComp.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.accTex[this.accRead]); gl.uniform1i(this.uComp.uAccum, 1);
    gl.uniform1f(this.uComp.uBlend, this.accReset ? 1.0 : Math.max(0.34, 1 / (this.accumFrames + 1)));
    gl.uniform2f(this.uComp.uResolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);

    // ---- Pass3: 拷贝 -> 屏幕 ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.progCopy);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.accTex[this.accWrite]); gl.uniform1i(this.uCopy.uTex, 0);
    gl.uniform2f(this.uCopy.uResolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 交换并推进
    const t = this.accRead; this.accRead = this.accWrite; this.accWrite = t;
    if (this.accReset) { this.accReset = false; this.accumFrames = 1; } else this.accumFrames++;
  };

  CloudRenderer.prototype._empty3D = function (gl) {
    if (this._e3d) return this._e3d;
    this._e3d = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this._e3d);
    const one = new Float32Array([0]);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, 1, 1, 1, 0, gl.RED, gl.FLOAT, one);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return this._e3d;
  };

  CloudRenderer.prototype._setRayUniforms = function (gl, u, camera, timeSec, steps, viewMode, wx, wz, sun) {
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform3fv(u.uCamPos, camera.pos);
    gl.uniform3fv(u.uCamRight, camera.right);
    gl.uniform3fv(u.uCamUp, camera.up);
    gl.uniform3fv(u.uCamFwd, camera.fwd);
    gl.uniform1f(u.uTanFov, Math.tan(camera.fov * 0.5));
    gl.uniform1f(u.uTime, timeSec);
    gl.uniform3fv(u.uSunDir, sun);
    gl.uniform2f(u.uWind, wx, wz);
    gl.uniform1i(u.uViewMode, viewMode);
    gl.uniform1f(u.uShowSun, Atmosphere.STATE.showSun ? 1 : 0);
    gl.uniform1f(u.uShowGrid, Atmosphere.STATE.showGrid ? 1 : 0);
    gl.uniform1f(u.uMaxAlt, Atmosphere.MAX_ALT);
    gl.uniform1i(u.uSteps, steps);
    gl.uniform2fv(u.uBaseTop, this.bufBaseTop);
    gl.uniform2fv(u.uCovDen, this.bufCovDen);
    gl.uniform2fv(u.uScaleDet, this.bufScaleDet);
    gl.uniform1fv(u.uType, this.bufType);
    gl.uniform1f(u.uSurfaceTemp, Atmosphere.STATE.surfaceTemp + (Atmosphere.STATE.envT || 0));
    gl.uniform1f(u.uLapse, Atmosphere.STATE.lapseRate);
    gl.uniform1f(u.uSurfacePressure, Atmosphere.STATE.surfacePressure);
    // 温度/气压视图的等值带与等值线（带宽度：5 °C / 25 hPa）
    gl.uniform1f(u.uFieldBand, Atmosphere.STATE.fieldBand === false ? 0 : 1);
    gl.uniform1f(u.uBandT, 5.0);
    gl.uniform1f(u.uBandP, 25.0);
    gl.uniform1f(u.uOccAvail, this.occAvail);
    gl.uniform1f(u.uOccDomX, OCC_DOM);
    gl.uniform1f(u.uOccSkip, this.occSkip);
    gl.uniform1f(u.uJitter, this.jitter || 0);

    // 剖面高度线
    gl.uniform1f(u.uSliceAlt, Atmosphere.STATE.sliceAlt);
    gl.uniform1f(u.uSliceOn, Atmosphere.STATE.showSlice ? 1 : 0);

    // 微物理着色叠加：区间来自 CMap，与 2D 图例同源
    const S = Atmosphere.STATE;
    const field = S.tintField || 'off';
    const mapId = field === 'off' ? 'lwc' : field;
    const cm = global.CMap && global.CMap.CMAPS[mapId];
    const range = cm ? cm.range : [0, 1.5];
    gl.uniform1i(u.uTintField, field === 'off' ? 0 : (field === 'lwc' ? 1 : field === 'beta' ? 2 : 3));
    gl.uniform1f(u.uTintAmt, S.tintAmt == null ? 0.45 : S.tintAmt);
    gl.uniform2f(u.uTintRange, range[0], range[1]);
    const effIce = Atmosphere.iceFractionAt ? Atmosphere.iceFractionAt(S.sliceAlt) : S.micro.iceFrac;
    const veffNow = (global.Physics && global.Physics.currentVeff) ? global.Physics.currentVeff() : ((S.spectrum && S.spectrum.veff) || 0.10);
    const mieFac = (global.Mie && global.Mie.qextPolydisperse)
      ? (global.Mie.qextPolydisperse(2 * Math.PI * Math.max(0.5, S.micro.effRadiusUm || 8) / 0.55, veffNow) / 2.0)
      : 1.0;
    gl.uniform1f(u.uLwcScale, Atmosphere.LWC_MAX * (1 - 0.6 * effIce) * mieFac);
    gl.uniform1f(u.uMicroRe, S.micro.effRadiusUm);
    gl.uniform1f(u.uMicroN, S.micro.dropConc);
    gl.uniform1f(u.uReMode, S.micro.reMode === 'derived' ? 1 : 0);

    // ETH CLOUDLAB 人工播云下风向消散沟 uniform
    const sd = S.seeding || {};
    const goRad = ((S.windDir || 270) + 180) * Math.PI / 180;
    const inpSat = 1 - Math.exp(-Math.max(0, sd.inpConc || 80) / 35);
    const eff = Math.min(0.95, Math.max(0, (sd.glaciationEff != null ? sd.glaciationEff : 0.85) * inpSat));
    gl.uniform1f(u.uSeedOn, sd.on ? 1 : 0);
    gl.uniform3f(u.uSeedOrigin, sd.x0 != null ? sd.x0 : -8.0, sd.alt != null ? sd.alt : 1.1, sd.z0 != null ? sd.z0 : 0.0);
    gl.uniform2f(u.uSeedDir, Math.sin(goRad), Math.cos(goRad));
    gl.uniform3f(u.uSeedParams, sd.width || 2.2, sd.diffK || 0.30, eff);

    // 色标 LUT：先确保纹理存在，再按需刷新（顺序反了会绑到空纹理上）
    if (global.CMap) {
      if (!this._lutTex) this._makeLut(gl, mapId);
      else if (this._lutId !== mapId) { this._setLut(gl, mapId); this._lutId = mapId; }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._lutTex);
      gl.uniform1i(u.uTintTex, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
  };

  // 256×1 色标纹理；CMap 定义改了这里跟着变，3D 与 2D 图例不会各画各的
  CloudRenderer.prototype._makeLut = function (gl, id) {
    this._lutTex = gl.createTexture();
    this._setLut(gl, id);
    this._lutId = id;
    return this._lutTex;
  };
  CloudRenderer.prototype._setLut = function (gl, id) {
    const data = global.CMap.lut(id);
    gl.bindTexture(gl.TEXTURE_2D, this._lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  global.CloudRenderer = CloudRenderer;
})(window);
