# CloudField · 云微物理参数化交互式诊断与民航气象仿真工具

> ⚠️ **All Rights Reserved.** Source visible for inspection only.
> No license granted. Any use requires prior written permission.
> See [LICENSE-TERMS.md](./LICENSE-TERMS.md) for details.
>
> ⚠️ **保留所有权利。** 源码仅公开供查阅，不授予任何使用许可；任何使用均需事先获得书面授权。详见 [LICENSE-TERMS.md](./LICENSE-TERMS.md)。

> 一个**纯前端、离线运行**的云微物理参数化诊断、复杂气象特情分析与大涡模拟（ICON-LES / WRF）前处理沙盒：以可调参数对应经典单矩/双矩微物理方案（Kessler 1969、Khairoutdinov & Kogan 2000、Seifert & Beheng 2006 / ICON 2-moment、Koschmieder 能见度定律、多分散米氏散射），内置 **ETH CLOUDLAB 过冷层云催化播云（WBF 冰化消云沟槽）** 三维/二维联动诊断、**民航复杂运行气象支持（METAR/SPECI/TAF、VIS/RVR/CMV、跑道风分解、高原 QNH/QFE、低温高度修正、飞机积冰指数）** 以及模式配置与科研数据导出。
>
> **Copyright Tianyuan.J.Z© · 作者：Heinrich.Z & Tianyuan.J.Z**

---

## 1. 功能概览

CloudField 将三维实时体积云渲染与云微物理参数化、遥感观测算子及民航运行气象规程结合在同一离线环境中：

- **能见度与多相态消光计算**：基于 `β = 3·LWC/(2·ρ_w·r_e)`（叠加多分散 Mie 有效方差 $\nu_{\text{eff}}$ 修正与非球形冰晶习惯因子）及 Koschmieder 定律 `V = -ln(ε)/β`（ε=0.02）。同时计入边界层气溶胶消光与**云底以下降雨/降雪粒子下落消光**（Marshall–Palmer 雨滴谱与 Sekhon–Srivastava 雪谱经验关系），实时给出 β、LWC、$r_e$、$N_c$ 及垂直廓线对比。
- **三套微物理参数化并排对比与源汇收支拆解（Kessler / KK2000 / ICON-SB06）**：支持切换 **Kessler 1969（单矩阈值型）**、**KK2000（双矩大涡模拟幂律型）** 与 **ICON-SB06（Seifert & Beheng 2006 双矩谱宽耦合型）**，同屏绘制不同云滴数浓度 $N_c$ 下的准稳态降水率响应曲线，实时拆解**自动转化（$P_{\text{ac}}$）、碰并收集（$P_{\text{gr}}$）与 WBF 冰化（$P_{\text{wbf}}$）**贡献占比，并支持气溶胶-上升气流 CCN 活化耦合（Twomey 第一间接效应与 Albrecht 第二间接效应诊断）。
- **ETH CLOUDLAB 人工播云（WBF 冰化）三维/二维沙盒与靶区最佳播撒点反演**：支持点源播撒 AgI 碘化银（$-5^\circ\text{C}$ 阈值）或液态 $\text{CO}_2$（$-0.5^\circ\text{C}$ 阈值），按 Murphy & Koop (2005) 过冷水面与冰面饱和水汽压差 $\Delta e_{wi}(T)$ 驱动 **Wegener–Bergeron–Findeisen（WBF）** 水汽竞争过程，在 3D 视口与 2D 水平剖面中雕刻顺风向高斯扩散**消云沟槽（Seeding Trench）**；提供**跑道靶区最佳上风向播撒点自动反演（`optimalSeedingPoint`）**，定量给出沟槽内能见度增益、跑道 CAT-I 标准恢复情况及播云前后的**飞机积冰指数消减**。
- **热力学探空图解（气块抬升轨迹与 CAPE / CIN）及实测探空分段插值**：底部主导垂直廓线图叠加**被抬升气块干/湿绝热状态曲线 $T_p(z)$**，实时标出抬升凝结高度（LCL）、自由对流高度（LFC）、平衡高度（EL），并计算对流有效位能（CAPE）、对流抑制能量（CIN）与抬升指数（LI）；支持导入实测/自定义探空（`z, p, T, Td`），自动识别边界层逆温（Temperature Inversion）与地面负温、高空正温的**冻雨暖鼻层（Warm Nose）**，按实测折线分段插值温度、露点与气压廓线。
- **多通道遥感观测算子、机载 X 波段气象雷达（WXR）与辐射能量收支**：计算柱积分液水路径（LWP）、冰水路径（IWP）、总水路径（TWP）、地表向下短波辐照度、云球面反照率、耦合地表反照率的短波云辐射效应（$\text{CRE}_{\text{SW}}$）、Twomey 辐射强迫（$\Delta F_{\text{Twomey}}$）、$10.8\ \mu\text{m}$ 红外窗区卫星亮温、含双程 Beer–Lambert 衰减与退偏比的激光雷达后向散射；同时提供地面 S 波段天气雷达反射率（dBZ）与**机载 X 波段（9.3 GHz，ARINC 708 四色标准）前视气象雷达双程雨衰修正及 PAC 雨衰阴影告警**。
- **民航地面塔台、签派与机载进近运行支持**：
  - **METAR / SPECI / TAF 解析、质控与反演**：兼容国际标准（KT、Axxxx 英寸汞柱）与中国民航规范（MPS 米/秒风速、CAVOK、NSC/SKC、VVxxx 垂直能见度、近时天气与风切变组）；对低能见度大雾/霾报文自动反演贴地雾层与边界层气溶胶；支持将含 `BECMG` / `TEMPO` / `FM` 的多时段复杂 TAF 报文直接转化为时间序列并绘制能见度演变曲线。
  - **VIS / RVR / CMV、跑道三段式 RVR（TDZ / MID / END）与 ILS $3^\circ$ 下滑道斜程能见度（SVR）**：遵循 ICAO Doc 9365 与 EASA AMC NCO.OP.110，结合有效能见度/RVR 与最低 BKN/OVC 云底高（Ceiling）判定 `CAVOK / VMC / CAT-I / CAT-II / CAT-IIIA~C` 等级；沿 3.6 km 跑道轴线实时采样**接地区（TDZ）、中间段（MID）、停止端（END）三段式 RVR**；计算飞行员沿 **ILS $3^\circ$ 下滑道进近的斜程能见度（SVR）与决断高（DH 200 ft / 100 ft）目视参考建立判据**；支持跑道磁航向**顶风/顺风/正侧风分量分解与超限告警**。
  - **高原/高高原机场 QNH↔QFE、密度高度（DA）与严寒机场高度表修正**：内置中国民航机场表（WGS-84 坐标与海拔），自动识别一般高原（$\ge 1524\text{ m}$）与高高原机场（$\ge 2438\text{ m}$），实时换算修正海平面气压 QNH、场面气压 QFE、**计入高湿虚温修正的密度高度（Density Altitude，DA）与起飞滑跑距离增量**，并按 **ICAO Doc 8168 (PANS-OPS)** 计算严寒天气下决断高（DH/MDH）的低温气压高度表正修正量。
  - **飞机积冰（SLD）、颠簸耗散率（EDR）与低空风切变（LLWS）风险评估**：根据过冷水含量（SLWC）、温度效率窗（$0 \sim -38^\circ\text{C}$）与有效滴径 $r_e$ 计算飞机积冰严重度与 SLD 告警；根据对流强度、积雨云含水量与边界层切变输出国际民航标准**湍流涡旋耗散率 $\text{EDR}$（$\text{m}^{2/3}\text{s}^{-1}$）**与进近走廊 **$0\text{–}500\text{ m}$ 低空垂直风切变（$\text{kt/100ft}$）及微下击暴流告警**。
  - **低空经济（UAV / eVTOL / 播云无人机）适航与光电吊舱（EO/IR）透过率评估**：针对 $0\text{–}1000\text{ m AGL}$ 低空空域（`uavLowAltitudeAssessment`），综合评估无除冰碳纤维旋翼积冰指数、锂电池低温可用容量折减率（$\%$）、抗风与湍流边界、$1\text{ km}$ 斜距可见光（$550\text{ nm}$）与短波红外（$1550\text{ nm}$）光电吊舱大气透过率，输出 `GO / CAUTION / NO-GO` 适航放行状态与受限因子。
  - **高空巡航（FL260–FL400）飞机凝结尾迹（Contrail）与静力稳定度评估**：按 **ICAO / WMO Schmidt–Appleman 判据**（`cruiseContrailAssessment`）计算巡航高度层混合斜率 $G$（$\text{Pa/K}$）、凝结尾迹临界生成温度 $T_{\text{LM}}$、对冰相对湿度 $\text{RHi}$ 与冰过饱和区（ISSR）持续性卷云尾迹生成判据，同时输出巡航层位温 $\theta$ 与 Brunt–Väisälä 静力稳定度频率 $N_{\text{BV}}$。
- **典型教学与运行场景预设及模式数据导出**：内置 8 类典型预设场景（辐射雾 `fog`、层积云 `stratus`、晴空积云 `cumulus`、高空卷云 `cirrus`、过冷云催化 `cloudlab`、强对流积雨云 `cbstorm`、**冻雨暖鼻与严重积冰 `fzra`**、**高原高温高密 `plateau`**）；支持一键导出标准 METAR、IWXXM XML、BUFR/GRIB JSON、ICON-LES Fortran Namelist（`.nml`）、CLOUDLAB 实验配置（`.yaml`）、57 层完整垂直廓线 CSV（`toProfileCSV`）、三方案微物理响应曲线 CSV（`toSchemeCSV`）及自包含 HTML 诊断报告，并提供命令行批处理与 Python SDK。

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

> **界面语言与单位**：顶栏右侧的 `DE / EN / 中文` 切换界面语言（顺序即德→英→中，**默认德文**），旁边的 `常用 / SI` 切换单位体系（hPa↔Pa、°C↔K、km↔m），两者均保存在本地 `localStorage`。详见第 6、7 节。

---

## 3. 目录结构

```
CloudField/
├── index.html              # 顶栏 + 三栏：控制面板 | 视口（含剖面高度轴） | 诊断面板（读数/公式/色标）
├── LICENSE-TERMS.md        # 授权条款（All Rights Reserved；仅公开供查阅，使用需书面许可）
├── README.md
├── 开发日志.md              # 开发历程与版本更新记录
├── .gitignore
├── css/style.css           # 界面样式表（深色气象台主题）
├── js/
│   ├── i18n.js             # 三语层：中文/英文/德文（默认德文），顶栏分段切换 + data-i18n
│   ├── units.js            # 单位体系：常用(hPa/°C/km) ↔ SI(Pa/K/m)，显示层实时换算
│   ├── colormap.js         # 各物理量独立色标与归一化区间，导出 256×1 LUT 给着色器
│   ├── gl-utils.js         # WebGL2 基础工具集
│   ├── camera.js           # 轨道相机（透视/顶/侧/前 视角）
│   ├── atmosphere.js       # 大气热力与微物理核心模型（STATE / 探空分段插值 / WBF 水汽差 / 风平流）
│   ├── clouds.js           # WebGL2 体积云渲染器（早停 / 抖动+TAA / 空区间跳步 / 自适应 DPR / Worker）
│   ├── sliceaxis.js        # 可拖拽剖面高度轴，与 3D 云场水平切片亮线联动
│   ├── monitor.js          # 垂直廓线 / 水平切片 / 仪表卡 / 能见度仪表盘 / 曲线·场·热力图·泰勒图
│   ├── gui.js              # 控制面板与高级诊断弹窗（含 CLOUDLAB、时序、空间场、敏感性、质控等分页）
│   ├── integration.js      # 民航与系统集成：METAR/TAF · VIS-RVR-CMV · 跑道风 · 机场表(QFE/低温修正) · Bridge
│   ├── main.js             # 初始化、渲染主循环、顶栏状态、弹窗、分享链接恢复、Bridge 接线
│   ├── physics.js          # 详细消光分解 / 相态与冰晶习惯 / 降水消光 / 飞机积冰指数 / 空间统计 / 敏感性扫描
│   ├── mie.js              # 多分散米氏散射（反常衍射 + 5 点 Gauss-Hermite 求积）Q_ext 查表
│   ├── radiation.js        # 双流近似 T/R 查表（地表太阳辐照度、云球面反照率）
│   ├── spectrum.js         # Gamma / 对数正态 / 实测滴谱 → N、r_e、ν_eff、LWC 矩计算
│   ├── phases.js           # 相态分档与预设（纯水/混合/卷云/降雪/对流）
│   ├── operators.js        # 观测算子：LWP/IWP、CRE_SW、辐照度、反照率、卫星亮温、激光雷达、雷达 dBZ
│   ├── kessler.js          # 微物理演进与方案对比（Kessler / KK2000 / ICON-SB06 + WBF 冰化消耗）
│   ├── timeseries.js       # 时变预报：CSV / TAF 时序插值推进与能见度演变曲线
│   ├── qc.js               # 探空 / METAR 数据质控（兼容 MPS/KT、静力平衡与逆温检验）
│   ├── validation.js       # 偏差 / MAE / RMSE / 相关系数 + 泰勒图
│   ├── export.js           # METAR / IWXXM / BUFR / GRIB / Namelist / YAML / CSV 导出与推送
│   ├── batch.js            # 多站点批量诊断（供 CLI 与 Python SDK 调用）
│   ├── recorder.js         # 场景录制与回放（状态快照时间轴）
│   ├── report.js           # 自包含 HTML 诊断报告 / 截图标注 / 分享链接（URL 状态编码）
│   └── help.js             # 参数释义卡片 + 典型天气场景预设
├── tools/
│   └── cli.js              # Node 命令行批处理工具（支持导出 JSON / CSV / Namelist / YAML）
├── sdk/
│   └── cloudfield_sdk.py   # Python SDK：封装 CLI 批处理与多格式解析
├── bridge-adapter/         # 独立 IPC 服务端进程（Node，纯内置模块）
│   ├── server.js
│   ├── schema.js
│   ├── airports_cn.js
│   ├── package.json
│   └── README.md
└── docs/
    ├── methodology.md      # 物理公式、参数化映射、民航换算规程与方法学说明
    ├── architecture.md     # Core/Worker + Renderer + Bridge 系统架构
    └── roadmap.md          # 功能规划与演进记录
```

---

## 4. 核心物理与运行公式

| 物理量 / 模块 | 公式与关系 | 说明 |
| --- | --- | --- |
| 云滴消光系数 | `β = 3·LWC / (2·ρ_w·r_e)` | 几何光学基准，单位 m⁻¹（`LWC` 取 g/m³、$r_e$ 取 µm 时系数为 1.5） |
| 多分散米氏修正 | `β = 1.5·LWC/r_e · (Q_ext(x, ν_eff)/2)` | 反常衍射近似 + 5 点 Gauss–Hermite 谱宽求积（`js/mie.js`） |
| 降雨/降雪消光 | $\beta_{\text{rain}} = 0.21\times 10^{-3} R^{0.75}$，$\beta_{\text{snow}} = 1.25\times 10^{-3} R^{0.82}$ | 云底至地面下落降水粒子消光（单位 m⁻¹，$R$ 为 mm/h） |
| 昼间气象能见度 | `V = -ln(ε)/β`，ε=0.02 | Koschmieder 定律，`V ≈ 3.912/β` |
| 微物理自动转化 | Kessler 阈值 / KK2000 幂律 / SB06 谱宽耦合 | 单矩与双矩暖雨自动转化及碰并收集（`js/kessler.js`） |
| WBF 水汽压差 | $\Delta e_{wi}(T) = e_{s,w}(T) - e_{s,i}(T)$ | Murphy & Koop (2005)，在 $-12.5^\circ\text{C}$ 达峰值 $\approx 0.268\text{ hPa}$ |
| 双流辐射与强迫 | $\alpha_{\text{all}} = R_c + \frac{T_c^2 \alpha_s}{1 - R_c \alpha_s}$，$\text{CRE}_{\text{SW}} = -S_0 \mu_0 (\alpha_{\text{all}} - \alpha_s)$ | 耦合地表反照率 $\alpha_s$ 的短波云辐射效应与 Twomey 强迫 |
| 场面气压换算 | $\text{QFE} = \text{QNH} \cdot \exp\left(-\frac{g \cdot h_{\text{elev}}}{R_d \cdot \bar{T}}\right)$ | 高原/高高原机场 QNH ↔ QFE 压高互逆换算 |
| 密度高度 (DA) | $\text{DA}_{\text{ft}} = \text{PA}_{\text{ft}} + 118.8 \cdot (T_v - T_{\text{ISA}})$ | 计入高湿虚温 $T_v$ 修正的高原/高温起飞性能高度 |
| 低温高度修正 | $\Delta H = H \cdot \frac{15 - T_0}{273.15 + T_0 - 0.5 L_0 (H + H_{\text{elev}})}$ | ICAO Doc 8168 (PANS-OPS) 严寒机场决断高正修正 |
| 下滑道斜程能见度 | $\text{SVR}(H) = \frac{3.912}{\frac{1}{L_{\text{slant}}} \int_0^{L_{\text{slant}}} \beta(s)\,\mathrm{d}s}$ | ILS $3^\circ$ 下滑道机头至接地区斜向路径积分能见度 |
| 对流有效位能 | $\text{CAPE} = \int_{z_{\text{LFC}}}^{z_{\text{EL}}} g \frac{T_p(z) - T_{\text{env}}(z)}{T_{\text{env},K}(z)}\,\mathrm{d}z$ | 气块干/湿绝热抬升正浮力垂直积分（$\text{J/kg}$） |
| 凝结尾迹临界温度 | $G = \frac{\text{EI}_{\text{H}_2\text{O}} c_p p}{\varepsilon Q (1-\eta)}$，$T_{\text{LM}} = -46.46 + 9.43\ln(G-0.053) + 0.72[\ln(G-0.053)]^2$ | Schmidt–Appleman 高空巡航尾迹生成与持续判据 |

详细推导与参数化说明见 [`docs/methodology.md`](docs/methodology.md)。

---

## 5. 民航与系统集成接口（四层架构）

1. **气象数据输入与时序转化**：支持 METAR / SPECI / TAF 解析（ICAO Annex 3 + WMO FM15/16 及中国民航 MPS 规范），解析结果可一键驱动三维场景（含低能见度大雾/垂直能见度自动成雾反演）；复杂 TAF 的 `BECMG` / `TEMPO` / `FM` 演变段可直接生成时间序列演变曲线。
2. **VIS / RVR / CMV 与跑道运行分析**：提供三模式切换（ICAO Doc 9365 + EASA NCO.OP.110）、CMV 禁用条款交互核查、CAVOK / CAT-I…IIIC 预设、与当前 3D 场景最差能见度/最低云底高的双向同步，以及跑道磁航向顶风、顺风、正侧风分量分解与超限提示。
3. **IPC 实时通信**：WebSocket Delta 协议（snapshot / delta / telemetry，schema 版本化）+ REST API + 事件录制与时间轴回放。
4. **机场数据库与高原/低温运行核算**：内置中国民航代表性机场表（WGS-84 经纬度与海拔），支持跨语言搜索、设为当前活动运行场站（联动 METAR 导出）、高原/高高原机场等级标识、QNH ↔ QFE 实时换算，以及严寒条件下决断高（DH）的 ICAO Doc 8168 低温修正。

入口：界面右上“数据接口”按钮 → 五个标签页（METAR/TAF、VIS/RVR/CMV、机场表、Bridge、事件录制/回放）。

---

## 6. 界面语言（中文 / English / Deutsch）

- **默认语言：德文（Deutsch）**。
- 顶栏右侧 `DE / EN / 中文` 分段控件切换（第一德语、第二英语、第三中文，选择记忆于 `localStorage`）。
- 覆盖范围：控制面板、工具栏、HUD、底部监控、能见度仪表盘、高级诊断弹窗、说明弹窗，以及“数据接口”面板的全部界面文案；**ICAO 现在天气代码描述（23 个）与内置机场表（63 个）的机场名同样提供三语**，机场搜索支持跨语言命中（任输中文/英文/ICAO/IATA）。
- 运行环境：需要支持 **WebGL2** 的浏览器（3D 视口）。若初始化或渲染失败，加载区会显示简洁的三语错误摘要，完整日志可查看浏览器控制台（F12）。

---

## 7. 读图设计：色标、数值回显、口径

**信息架构**

- 顶栏：品牌、运行状态（播放/暂停 + 时间流速 + 渲染质量 + FPS）、单位体系、语言。
- 右侧面板分三个 Tab：**读数**（当前值 + 历史曲线 + 对比快照）/ **公式**（每条公式下方附当前数值代入结果）/ **色标**（各物理量色标条与当前值指针）。
- 底部垂直廓线图作为主导读图窗口（画布 640×230，同时绘制温度 $T(z)$、露点 $T_d(z)$、液态水含量 $\text{LWC}(z)$ 与冰相分数 $f_{\text{ice}}(z)$），实时读数收成 12 张紧凑仪表卡，模拟状态单独一栏。

**交互反馈**

- 每条滑块右侧均有实时数值回显（且上下限与步长随常用/SI 单位自动切换）。
- 风向采用**罗盘旋钮**：0–360° 周期量，同时给出来向指针、流向箭头与八方位名称。
- 视口右侧的**剖面高度轴**可拖拽（也可点击轨道跳转或滚轮微调），手柄高度对应水平切片高度，3D 云场内同步绘制琥珀色高亮切片边框；轴上另有只读橙色标记指示当前最低能见度所在高度。

**色标与口径**

- 四个微物理量各有独立色标与归一化区间：

  | 量             | 色标（冷暖/感知均匀）   | 归一化区间        |
  | -------------- | ----------------------- | ----------------- |
  | 云水 LWC       | 蓝 → 白 → 红（冷暖）    | 0 – 1.5 g/m³      |
  | 消光 β         | viridis                 | 0 – 80 km⁻¹       |
  | 有效半径 rₑ    | cividis                 | 2 – 25 µm         |
  | 滴数浓度 N     | plasma                  | 0 – 1000 cm⁻³     |

  色标定义在 `js/colormap.js`，同一份定义导出为 256×1 LUT 纹理交给着色器，3D 云体、水平切片、图例色标条三处颜色严格一致。
- 3D 云体可叠加**半透明微物理着色**（LWC / β / 派生 $r_e$ / 滴数浓度 $N$），不透明度可调。
- **总云量口径**：`1 − Π(1 − 各层云量)`，按各层随机重叠（相互独立）合成。

**单位体系**

- `常用`：°C / hPa / km / m·s⁻¹；`SI`：K / Pa / m / m·s⁻¹。物理计算内部统一使用 °C、hPa、km，在显示层做无损换算。

---

## 8. 体积云渲染器：空区间跳步与多尺度噪声

为了在浏览器内兼顾实时帧率与三维微物理保真度，WebGL2 体积云渲染器（`js/clouds.js`）采用了以下设计：

1. **保守邻域膨胀的 Occupancy 粗网格**：Web Worker 计算 16³ 粗网格后执行 3×3×3 邻域最大值膨胀，并上传为 `R16F` 线性过滤三维纹理，避免薄云或碎积云边缘在空区间跳步时被误判截断。
2. **连续过渡步长与真实段长光学厚度结算**：光线步进长随 occupancy 连续插值过渡，光学厚度按当前步的实际几何段长 `d · step · absorb` 积分，消除体素网格边界伪影。
3. **三维 GPU 与二维 CPU 同源分形噪声**：三维片元着色器、Occupancy Worker 与 CPU 诊断模块（`js/atmosphere.js`）共用同一套三线性插值值噪声与 5 阶分形布朗运动（fBm），并按统一的顺风向上游回溯 `p - uWind * uTime` 平流，确保三维视口、二维水平剖面与单点探针读数同源。
4. **向阳阴影早停与自适应分辨率**：向阳次级光线超出云顶或累积光学厚度超过 3.2 时提前终止；渲染分辨率根据帧耗时 EMA 在 0.55–1.5 DPR 之间平滑调节（带防抖死区，保护 TAA 时域抗锯齿累积帧）。

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
- 物理公式与参数化方案均为公开文献（Kessler 1969、Khairoutdinov & Kogan 2000、Seifert & Beheng 2006、Murphy & Koop 2005、Koschmieder、Ångström、ICAO Doc 9365、ICAO Doc 8168、EASA NCO.OP.110），引用见 `docs/methodology.md`。

---

## 10. 离线声明

所有计算在本地浏览器完成，不采集、不上传任何数据。VIS/RVR/CMV 转换遵循 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110（2024 第5版）。

---

## 11. 系统配置要求（最低 / 建议）

CloudField 是**纯前端、离线、零外部资源**的单页应用，唯一的硬性要求是浏览器支持 **WebGL2**（着色器使用 `sampler3D`、R16F 可线性过滤纹理、GLSL ES 3.00）。

**技术特性**

- 渲染：WebGL2 片元着色器体积光线步进（ray-marching），步数 `= 36 + 64×质量`（默认质量 0.8 → 约 87 步）；**自适应 devicePixelRatio（上限 1.5）**，并按帧时间 EMA 自动调节渲染分辨率。
- 计算：occupancy 粗网格（16³ + 3×3×3 膨胀）在 **Web Worker** 中计算，主线程负责物理诊断与 UI。
- 显存：occupancy 纹理约 16 KB；TAA/累积为 3 张 RGBA8 目标，随画布分辨率线性增长（1080p×1.5dpr ≈ 31 MB）。

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

---

## 12. 参照与方向

- **ETH CLOUDLAB / ICON-LES**：用大涡模拟复现外场播云实验、对比不同微物理参数化方案并开展敏感性试验——本工具以浏览器端实时可调的交互式沙盒形式，服务于微物理教学、实验前处理与民航复杂低能见度气象研判。

---

## 13. 鸣谢

感谢 **MonikaSong G.C（南京）** 提供专业知识支持。

感谢 **Alvin Lv** 提供稳定性测试协助。

感谢 **Huaneng Yuan** 提供测试协助。

---

*© Tianyuan.J.Z · 作者 Heinrich.Z & Tianyuan.J.Z*
