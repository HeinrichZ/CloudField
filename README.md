# CloudField · 云微物理参数化交互式诊断工具

> ⚠️ **All Rights Reserved.** Source visible for inspection only.
> No license granted. Any use requires prior written permission.
> See [LICENSE-TERMS.md](./LICENSE-TERMS.md) for details.
>
> ⚠️ **保留所有权利。** 源码仅公开供查阅，不授予任何使用许可；任何使用均需事先获得书面授权。详见 [LICENSE-TERMS.md](./LICENSE-TERMS.md)。

> 一个**纯前端、离线运行**的云微物理参数化诊断与大涡模拟（ICON-LES / WRF）前处理沙盒：以可调参数系统性对应到经典单矩/双矩参数化方案（Kessler 1969、Khairoutdinov & Kogan 2000、Seifert & Beheng 2006 / ICON 2-moment、Koschmieder 能见度定律、多分散米氏散射），并内置 **ETH CLOUDLAB 过冷层云催化播云（WBF 冰化消云沟槽）** 三维/二维联动诊断与模式 Namelist 配置导出。
>
> **Copyright Tianyuan.J.Z© · 作者：Heinrich.Z & Tianyuan.J.Z**

---

## 1. 它解决什么

传统的云渲染 Demo 只展示“好看”。CloudField 把它变成一件**可信的参数化诊断与模式前处理工具**：

- **能见度 / 消光是物理可验证的**：`β = 3·LWC/(2·ρ_w·r_e)`（叠加多分散 Mie 有效方差 $\nu_{\text{eff}}$ 修正），`V = -ln(ε)/β`（ε=0.02）。仪表盘实时给出 β、LWC、r_e、N，并叠加“模型 vs 探空观测”对比。
- **多方案微物理并排诊断（Kessler / KK2000 / ICON-SB06）**：可一键切换 **Kessler 1969（单矩阈值型）**、**KK2000（双矩大涡模拟幂律型）** 与 **ICON-SB06（Seifert & Beheng 2006 双矩谱宽耦合型）**，并在高级面板同屏绘制不同云滴数浓度 $N_c$ 下的准稳态降水率响应曲线，直观诊断气溶胶增加抑制暖雨启动的 **Albrecht 第二间接效应**。
- **ETH CLOUDLAB 人工播云（WBF 冰化）三维/二维沙盒**：支持无人机点源播撒 AgI 碘化银（$-5^\circ\text{C}$ 阈值）或液态 $\text{CO}_2$ 干冰（$-0.5^\circ\text{C}$ 阈值），通过 **Wegener–Bergeron–Findeisen（WBF）** 水汽竞争机制消耗过冷水，在 3D WebGL2 体积云视口与 2D 水平剖面中实时雕刻顺风向高斯扩散**消云沟槽（Seeding Trench）**，并定量评估沟槽内能见度跃升与 CAT-I 跑道起降标准恢复情况。
- **ICON-LES / WRF 模式前处理与科研数据导出**：支持将浏览器内调好的微物理方案、滴谱形状参数 $\nu$、播云源项与环境探空一键导出为标准 Fortran Namelist（`.nml`）、结构化实验配置 YAML（`.yaml`）、57 层完整垂直廓线 CSV（`toProfileCSV`）及三方案响应曲线 CSV（`toSchemeCSV`）。
- **民航工作流**：METAR/SPECI/TAF 报文解析 → 参数映射；VIS / RVR / CMV 三模式切换（覆盖 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110 2024 第5版的核心条款）；中国民航机场表（WGS-84）；CAVOK / CAT-I…IIIC 预设。
- **环境可演进**：温度/湿度按 180 s 周期慢变（±5 °C / ∓10%），温度、气压、露点与 LCL 随演进变化；温度/气压视图沿射线逐段累积场色（保留垂直梯度），并可切换**等值带 / 等值线**（5 °C / 25 hPa 分档 + 抗锯齿等值线），俯视时也能看出云顶造成的水平差异。云体按 `WIND_SCALE=0.01`（10× 时间加速）平流，覆盖率/密度随生消相位增减，云层会明显平移、长出来/散掉。
- **实验可记录与回放**：所有参数变化、报文注入、快照构成时间轴，导出为可离线回放的会话 JSON。
- **可集成**：通过独立 Bridge Adapter（WebSocket + REST）接入多节点同步、BUFR/GRIB2 服务端预解码。

---

## 2. 快速开始

```bash
# 方式 A：直接打开（离线，零依赖）
# 用浏览器打开 index.html 即可（推荐 Chrome/Edge，需支持 WebGL2）

# 方式 B：本地静态服务（避免个别浏览器对 file:// 的限制）
python3 -m http.server 8080
# 然后访问 http://127.0.0.1:8080/
```

无需联网、不上传任何数据。所有计算在浏览器本地完成。

> **界面语言与单位**：顶栏右侧的 `DE / EN / 中文` 切换界面语言（顺序即德→英→中）（**默认德文**），旁边的 `常用 / SI` 切换单位体系（hPa↔Pa、°C↔K、km↔m），两者都记忆在本地。详见第 6、7 节。

---

## 3. 目录结构

```
CloudField/
├── index.html              # 顶栏 + 三栏：控制面板 | 视口（含剖面高度轴） | 诊断面板（读数/公式/色标）
├── LICENSE-TERMS.md        # 授权条款（All Rights Reserved；仅公开供查阅，使用需书面许可）
├── README.md
├── 开发日志.md              # 开发历程 / 缺陷修复与验证记录
├── .gitignore
├── css/style.css           # 统一主题（teal 强调色 + orange 语义危险色）
├── js/
│   ├── i18n.js             # 三语层：中文/英文/德文（默认德文），顶栏分段切换 + data-i18n
│   ├── units.js            # 单位体系：常用(hPa/°C/km) ↔ SI(Pa/K/m)，只在显示层换算
│   ├── colormap.js         # 各物理量专属色标与归一化区间，同一份定义导出成 LUT 给着色器
│   ├── gl-utils.js         # 最小 WebGL 工具集
│   ├── camera.js           # 轨道相机（透视/顶/侧/前 视角）
│   ├── atmosphere.js       # 大气物理 + 微物理诊断模型（STATE / 公式 / 派生量 / 快照 / 风平流）
│   ├── clouds.js           # 体积云渲染器（早停 / 抖动+TAA / 空区间跳过 / 自适应 DPR / Worker）
│   ├── sliceaxis.js        # 可拖拽剖面高度轴，与 3D 云场水平切片亮线联动
│   ├── monitor.js          # 垂直廓线 / 水平切片 / 仪表卡 / 能见度仪表盘 / 曲线·场·热力图·泰勒图
│   ├── gui.js              # 分组控件：滑块 · 罗盘 · 快照 · 导出 · 高级诊断面板（10 分页）
│   ├── integration.js      # 集成四层：METAR/TAF · VIS-RVR-CMV · 机场表 · Bridge · 事件回放
│   ├── main.js             # 初始化、渲染主循环、顶栏状态、弹窗、分享链接恢复、Bridge 接线
│   ├── physics.js          # 详细消光分解 / 相态 / 气溶胶 / 水平能见度场 / 参数敏感性扫描
│   ├── mie.js              # 米氏（反常衍射）Q_ext 查表，修正几何光学消光
│   ├── radiation.js        # 双流 T/R 查表（辐照度、云反照率）
│   ├── spectrum.js         # Gamma / 对数正态 / 实测谱 → N、r_e、ν_eff、LWC
│   ├── phases.js           # 相态分档与预设（纯水/混合/卷云/降雪/对流）
│   ├── operators.js        # 观测算子：辐照度、反照率、卫星亮温、激光雷达、雷达 dBZ
│   ├── kessler.js          # Kessler 单柱 q_c/q_r 时间积分（自动转化 / 碰并 / 沉降 / 雨强）
│   ├── timeseries.js       # 时变预报：CSV 时序插值与演变曲线
│   ├── qc.js               # 探空 / METAR 质控（可信性、异常、缺测标记）
│   ├── validation.js       # 偏差 / MAE / RMSE / 相关 + 泰勒图
│   ├── export.js           # METAR / IWXXM / BUFR / GRIB 报文与推送
│   ├── batch.js            # 无 DOM 批量诊断（供 CLI / SDK 复用）
│   ├── recorder.js         # 场景录制与回放（状态快照时间轴）
│   ├── report.js           # 自包含 HTML 报告 / 截图标注 / 分享链接（URL 状态编码）
│   └── help.js             # 参数释义卡片 + 示例场景预设
├── tools/
│   ├── boot_test.js        # 伪 DOM/WebGL 桩完整执行 boot()（199 项断言）
│   ├── dom_smoke.js        # jsdom 加载真实 index.html 的启动冒烟（54 项断言）
│   ├── glsl_test.js        # GLSL ES 3.00 语法级解析校验（5 项，含负向对照）
│   ├── stability_test.js   # 长程渲染循环稳定性 + 功能逐项核对（34 项）
│   ├── occ_check.js        # occupancy 体素与运行时密度场一致性核对（定位跳步伪影）
│   ├── ray_debug.js        # 着色器 CPU 移植，量化跳步前后的画面偏差
│   └── cli.js              # Node 命令行批处理（vm 沙箱加载浏览器模块，导出 CSV/JSON）
├── sdk/
│   └── cloudfield_sdk.py   # Python SDK：封装 CLI 批处理
├── bridge-adapter/         # 独立 IPC 进程（Node，纯内置模块，见其 README）
│   ├── server.js
│   ├── schema.js
│   ├── airports_cn.js
│   ├── package.json
│   └── README.md
└── docs/
    ├── methodology.md      # 公式、参数化映射、已知限制、鸣谢
    ├── architecture.md     # Core/Worker + Renderer + Bridge 架构
    └── roadmap.md          # 能力路线图与实施分期
```

---

## 4. 核心公式（可信度底座）

| 量     | 公式                                  | 说明                         |
| ----- | ----------------------------------- | -------------------------- |
| 消光系数  | `β = 3·LWC / (2·ρ_w·r_e)`           | 单分散球滴近似，单位 m⁻¹             |
| 米氏修正  | `β = 1.5·LWC/r_e · (Q_ext/2)`        | 反常衍射查表（`js/mie.js`）          |
| 辐射双流  | `T, R = f(τ, μ)`                     | Cahalan + 吸收修正查表（`js/radiation.js`） |
| Kessler | `dq_c/dt = −P_ac − P_gr + S`         | 单柱 q_c/q_r 积分（`js/kessler.js`） |
| 能见度   | `V = -ln(ε)/β`，ε=0.02               | Koschmieder 定律，`V≈3.912/β` |
| 消光谱型  | `β(λ)=β(λ₀)·(λ₀/λ)^α`               | Ångström，α≈0–2，基准 550nm    |
| 密度归一化 | `d = clamp(LWC/LWC_max,0,1)·noise`  | `LWC_max=1.2 g/m³`         |
| 露点→湿度 | `RH=100·exp[a·Td/(b+Td)−a·T/(b+T)]` | Magnus，a=17.27,b=237.7     |

详细推导与参数化映射见 [`docs/methodology.md`](docs/methodology.md)。

---

## 5. 集成接口（四层）

1. **气象数据输入**：METAR/SPECI/TAF 纯正则解析（ICAO Annex 3 + WMO FM15/16），解析结果一键映射到场景；BUFR/GRIB2 由 Bridge 服务端预解码。
2. **VIS/RVR/CMV**：三模式切换（ICAO Doc 9365 + EASA NCO.OP.110）；CMV 用于由 VIS 验证 RVR，并明确三种禁用场景；CAVOK / CAT-I…IIIC 预设。
3. **IPC**：WebSocket Delta 协议（snapshot / delta / telemetry，schema 版本化）+ REST API + 事件录制/回放。
4. **坐标系**：WGS-84、中国民航机场表（WGS-84）、海拔/大地高换算、米↔百英尺。

入口：界面右上“数据接口”按钮 → 五个标签页（METAR/TAF、VIS/RVR/CMV、机场表、Bridge、事件录制/回放）。

---

## 6. 界面语言（中文 / English / Deutsch）

- **默认语言：德文（Deutsch）**。
- 顶栏右侧 `DE / EN / 中文` 分段控件切换（第一德语、第二英语、第三中文）（互斥，选择记忆于 `localStorage`）。语言入口不进参数面板——它属于“外壳”，不该和物理量滑块混在一起。
- 覆盖范围：控制面板、工具栏、HUD、底部监控、能见度仪表盘、探空验证与说明弹窗、以及“数据接口”面板（METAR/TAF、VIS/RVR/CMV、机场表、Bridge、事件录制/回放）的全部界面文案；**ICAO 现在天气代码描述（23 个）与内置机场表（63 个）的机场名同样三语**，机场搜索支持跨语言命中（任输中文/英文/ICAO/IATA）；技术代码与航站代码（METAR、RVR、CMV、CAVOK、CAT-x、ICAO 等）保持通用。
- 实现：`js/i18n.js` 集中管理三语词典与 `I18N.t()`；静态文案用 `data-i18n` 标注，切换时经 `I18N.onLangChange` 重建各面板。天气/机场数据的三语映射位于 `js/integration.js`（`WX_DESC` / `AP_NAMES`），解析与渲染期按当前语言取值。
- 运行环境：需要支持 **WebGL2** 的浏览器（3D 视口）。若初始化或渲染失败，加载区会显示简洁的三语错误摘要，完整错误（含着色器编译日志）请查看浏览器控制台（F12）。

---

## 7. 读图设计：色标、数值回显、口径

这一层决定“数据能不能被读懂”，改动集中在这几处：

**信息架构**

- 顶栏：品牌、运行状态（播放/暂停 + 时间流速 + 渲染质量 + FPS）、单位体系、语言。
- 右侧面板分三个 Tab：**读数**（当前值 + 历史曲线 + 对比快照）/ **公式**（每条公式下面跟一行当前数值的代入结果）/ **色标**（各量色标条）。
- 底部垂直廓线图作为主导读图窗口（占宽最大、画布 640×230），实时读数收成 12 张紧凑仪表卡，模拟状态单独一栏。

**交互反馈**

- 每条滑块右侧都有实时数值回显（拖动时可见精确值）。
- 风向用**罗盘旋钮**：0–360° 天然是周期量，线性滑块会在 359°→0° 处产生认知断层；旋钮同时给出来向指针、流向箭头与八方位名称。太阳方位角不是周期循环量，仍用滑块。
- 视口右侧的**剖面高度轴**可拖拽（也可点轨道跳转、滚轮微调），手柄高度 = 水平切片高度，3D 云场里同步画一条琥珀色高亮水平线穿过云体（仅画 ±20 km 云场范围内的一段）；轴上另有只读的橙色标记 = 当前最低能见度所在高度——原来那个孤零零的“202 m”。
- 顶栏常驻“运行中 1.0× / 已暂停”状态提示，配合时间流速与渲染质量读数。

**色标与口径**

- 四个物理量各有自己的色标与归一化区间，不再共用一套 jet：

  | 量             | 色标（冷暖/感知均匀）   | 归一化区间        |
  | -------------- | ----------------------- | ----------------- |
  | 云水 LWC       | 蓝 → 白 → 红（冷暖）    | 0 – 1.5 g/m³      |
  | 消光 β         | viridis                 | 0 – 80 km⁻¹       |
  | 有效半径 rₑ    | cividis                 | 2 – 25 µm         |
  | 滴数浓度 N     | plasma                  | 0 – 1000 cm⁻³     |

  色标定义在 `js/colormap.js`，同一份定义导出成 256×1 LUT 纹理交给着色器，因此 3D 云体、水平切片、图例色标条三处颜色必然一致。
- 3D 云体可叠加**半透明微物理着色**（LWC / β / 派生 rₑ），不透明度可调；叠加层与真实光照并存，不改判定只加信息。
- 派生量口径与着色器逐条对应（改一处要同步另一处）：`LWC = min(1,d)·LWC_MAX·(冰相×0.4)`、`β = 1.5·LWC/rₑ·1000`、`rₑ = (3·LWC/(4π·ρ_w·N))^(1/3)`。
- **总云量口径**：`1 − Π(1 − 各层云量)`，按各层随机重叠（相互独立）合成；不是卫星反演的面积占比，也不是云光学厚度阈值统计。这条说明直接写在公式 Tab 底部，避免复现时对不上。

**单位体系**

- `常用`：°C / hPa / km / m·s⁻¹；`SI`：K / Pa / m / m·s⁻¹。物理计算内部一律用 °C、hPa、km，只在显示层换算，状态里不会出现两套数。
- 注意 1 hPa = 1 mbar，数值恒等，切换只改标签口径。

**回归测试**

- `node tools/boot_test.js`：伪 DOM/WebGL 桩完整执行 `boot()`，覆盖启动、语言/单位切换、天气与机场三语、词典一致性、色标、派生量、口径与着色器精度（199 项断言）。
- `node tools/dom_smoke.js`：jsdom 加载真实 `index.html`，验证顶栏、Tab、仪表卡、罗盘、高度轴的真实 DOM 接线（54 项断言）。需 `NODE_PATH` 指向含 jsdom 的目录。
- `node tools/glsl_test.js`：GLSL ES 3.00 语法级解析（含负向对照，5 项）。
- `node tools/stability_test.js`：长程渲染循环稳定性 + 功能逐项核对（34 项）。在 jsdom 下驱动 **1000 帧**真实渲染主循环，期间随机扰动温度/风/质量/图层/视图/播放态、周期切换语言与单位、刷新 occupancy，验证零异常、循环存活、occupancy 持续上传、FPS 计算、加载层不回弹、GPU 对象不泄漏、堆内存不失控；并执行确定性功能核对（5 种视图模式 / 4 种微物理叠加 / 剖面高度线 / 风场映射 / 快照导出 / 三个弹窗 / 滑块回显 / 视角按钮）。occupancy 计算经内联 Worker 源码在进程内实跑，故密度场被如实计算。需 `NODE_PATH` 指向含 jsdom 的目录。

---

## 8. 渲染器：空区间跳步的坑与修法

`tools/occ_check.js` 曾量化出一个实打实的渲染 bug：occupancy（16³ 粗网格）判定为“空”的 1309 个体素里，有 **205 个其实藏着密度 0.5 的云**。被误判的体素会以 2.5 km 粗步跳过，而光学厚度仍按 0.5 km 结算，云凭空薄掉五分之四；判定边界又与体素对齐，画面上就成了一个**体素网格状的半透明矩形窗**（视口中央那个“方块”）。

根因与修法：

1. **子采样太粗**：worker 用 `subs=2`（8 个采样点，间距 1.25 km）去刻画最细约 0.1 km 的密度细节，必然漏判。修法是在 occ 出 worker 前做**一邻域膨胀**（3×3×3 max 滤波）——宁可少跳也不抽掉云。实测误判 205 → **0**，空体素从 1309 降到 512，计算 60 ms。
2. **步长一刀切**：`occ < 0.03` 就跳 2.5 km，把体素边界直接画成硬边。改成随 occ **连续过渡**。
3. **光学厚度结算错**：跳步时样本实际代表的段长是 `step` 而不是 `stepSize`，改用 `d·step·absorb`。
4. **occ 与云体错位**：occ 建在 t=0 的噪声空间，云体随 `uWind·uTime` 平移，直接按世界坐标采样会随时间漂移错配。采样前统一换算到噪声空间。
5. **决策场量化**：occ 纹理改 R16F + LINEAR（WebGL2 核心只保证半浮点可线性过滤，R32F 需扩展），去掉体素台阶。
6. **生命期推进**：积云/积雨云云顶随生命周期变化，occ 每 2 s 刷新一次。

`tools/ray_debug.js` 把主着色器移植到 CPU，用截图同款相机（高度 134 km 俯瞰）量化：修复前偏差集中在 x[172..302] y[97..206] 的矩形区块、最大 65/255；修复后最大降到 14，矩形消解只剩采样位置的固有噪声。

---

## 9. 授权与使用条款

本软件为**专有软件（proprietary）**，全部权利由作者保留。本仓库在 **GitHub 上仅用于版本管理与备份**，不构成对任何第三方的使用许可或公开授权。

**使用授权**：如需使用本软件，请联系作者获取书面授权。

- 作者邮箱：**zhangheinrich@foxmail.com**

**免费授权（学术与科研用途）**：在**德国、中国、法国**的学术与科研用途，当项目/课题的**纵向经费低于 30,000 美元（USD 30,000）**时，经作者**书面授权后可免费使用**；使用时必须**引用本项目**，并作出**书面鸣谢**。

**其他用途**（商业与业务运营、经费达到或超过上述额度、或其他国家/地区）不在免费授权范围内，须与作者另行协商并获得书面授权。

**版权**：© Tianyuan.J.Z（Zhang Heinrich），保留所有权利。

补充说明（素材与署名）：

- 界面上的 © 标识为本项目的自有版权署名（顶栏品牌区、侧栏页脚）。
- 全站零外部资源：不引第三方字体（用系统字体栈）、不引图片/图标（界面里的 ☁ ✕ ▾ 等均为 Unicode 字符）、不引 CDN 脚本。
- 物理公式与参数化方案均为公开文献（Kessler 1969、Koschmieder、Ångström、ICAO Doc 9365、EASA NCO.OP.110），引用见 `docs/methodology.md`。

---

## 10. 离线声明

所有计算在本地浏览器完成，不采集、不上传任何数据。VIS/RVR/CMV 转换遵循 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110（2024 第5版）。

---

## 11. 系统配置要求（最低 / 建议）

CloudField 是**纯前端、离线、零外部资源**的单页应用，唯一的硬性要求是浏览器支持 **WebGL2**（着色器用到 `sampler3D`、R16F 可线性过滤纹理、GLSL ES 3.00）。其余均为“跑得顺不顺”的软性条件。

**技术画像（决定配置）**

- 渲染：WebGL2 片元着色器体积光线步进（ray-marching），步数 `= 36 + 64×质量`（默认质量 0.8 → 约 87 步）；**自适应 devicePixelRatio（上限 1.5）**，并按帧时间 EMA 自动降/升渲染分辨率（帧时 >24 ms 降、<13 ms 升），弱机自动降分辨率而非掉帧。
- 计算：occupancy 粗网格（16³ + 3×3×3 膨胀）在 **Web Worker** 中计算，主线程只做物理与 UI；不依赖 GPU 通用计算（无 WebGPU）。
- 显存：occupancy 纹理约 16 KB（可忽略）；TAA/累积为 3 张 RGBA8 目标，随画布分辨率线性增长（1080p×1.5dpr ≈ 31 MB，4K 受 DPR 上限约束）。
- 内存：DOM/JS 占用 modest（实测 ~95 MB 且平稳，见 `tools/stability_test.js`）。

| 维度 | 最低配置（能跑、可读图） | 建议配置（流畅 60 FPS、高质量） |
| --- | --- | --- |
| **操作系统** | Windows 10 / macOS 10.15 / 主流 Linux 发行版 / Android 8+ / iOS 15+ | 同上，任一较新版本 |
| **浏览器** | 支持 WebGL2：Chrome / Edge 56+、Firefox 51+、Safari 15+（桌面）；Chrome Android 56+、Safari iOS 15+ | 上述浏览器的最新版 |
| **GPU** | 支持 WebGL2 的集成显卡（Intel HD 4000 及更新 / Iris、AMD Radeon、Apple M 系列、Mali/Adreno 带 WebGL2 驱动） | 独立或较新的集成显卡（GTX/RTX、Radeon RX、Apple M1 及以上），WebGL2 硬件加速良好 |
| **CPU** | 双核 2.0 GHz 以上（一核主线程、一核 occupancy Worker） | 四核 3.0 GHz 以上 |
| **内存** | 4 GB（与系统/浏览器共享） | 8 GB 以上 |
| **显示** | 1280×720（三栏布局可用但偏紧） | 1920×1080 或更高；高分屏（Retina/4K）经自适应 DPR（上限 1.5）支持 |
| **存储** | 可忽略（应用本身数 MB；偏好存 localStorage） | 同上 |
| **网络** | **无需联网**，完全离线；可直接 `file://` 打开 `index.html`（无需服务器）。若个别浏览器对 `file://` 有限制，用 `python3 -m http.server` 起本地静态服务即可 | 同上 |

> 说明：WebGL2 是**唯一硬门槛**——若浏览器/设备不支持，加载区会显示简洁三语错误摘要（含着色器编译日志提示，见第 6 节）。软件本身不强依赖任何外网资源、不采集不上传数据（见第 10 节）。

---

## 12. 参照与方向

- **ETH CLOUDLAB / ICON-LES**：用大涡模拟复现播云实验、改参数化方案做敏感性试验——本工具的“慢而准（Fortran）”对照面的“快而轻（浏览器）”正可作为交互式前处理/教学沙盒。
- 方向：继续把可调参数系统性地对应到参数化方案，强化“云微物理参数化的交互式诊断”定位。

---

## 13. 鸣谢

感谢 **MonikaSong G.C（南京）** 提供专业知识支持。

感谢 **Alvin Lv** 提供稳定性测试协助。

感谢 **Huaneng Yuan** 提供测试协助。

---

*© Tianyuan.J.Z · 作者 Heinrich.Z & Tianyuan.J.Z*
