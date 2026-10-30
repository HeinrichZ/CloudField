<a id="top"></a>

# CloudField · 云微物理参数化交互式诊断与民航气象仿真工具
**Interactive Cloud Microphysics & Aviation Weather Simulation Sandbox · Interaktives Diagnose- und Simulationswerkzeug für Wolkenmikrophysik & Flugmeteorologie**

[![Physics, GLSL & Stability CI](https://github.com/HeinrichZ/CloudField/actions/workflows/ci.yml/badge.svg)](https://github.com/HeinrichZ/CloudField/actions/workflows/ci.yml)
[![License: All Rights Reserved](https://img.shields.io/badge/License-All_Rights_Reserved-c93c37)](./LICENSE-TERMS.md)
[![Docs: Methodology](https://img.shields.io/badge/Docs-Methodology-007ec6)](./docs/methodology.md)
[![Architecture: Worker + WebGL2 + Bridge](https://img.shields.io/badge/Architecture-Worker_%2B_WebGL2_%2B_Bridge-0e8a74)](./docs/architecture.md)
[![WebGL2: 100% Offline · Zero-Dep](https://img.shields.io/badge/WebGL2-100%25_Offline_%C2%B7_Zero--Dep-2ea44f)](./index.html)
[![i18n: DE · EN · 中文](https://img.shields.io/badge/i18n-DE_%C2%B7_EN_%C2%B7_%E4%B8%AD%E6%96%87-6f42c1)](./js/i18n.js)
[![CLI & SDK: Node · Python · MATLAB](https://img.shields.io/badge/CLI_%26_SDK-Node_%C2%B7_Python_%C2%B7_MATLAB-d97706)](./sdk/)

🌐 **语言导航 / Language / Sprache**：**[中文完整文档](#zh-cn)** · **[English Documentation](#en)** · **[Deutsche Dokumentation](#de)**

> ⚠️ **All Rights Reserved (EN).** Source visible for viewing and inspection only. No license granted; any use requires prior written permission. See [LICENSE-TERMS.md](./LICENSE-TERMS.md) for details.
>
> ⚠️ **Alle Rechte vorbehalten (DE).** Quellcode nur zur Einsichtnahme sichtbar. Keine Lizenz erteilt; jegliche Nutzung erfordert eine vorherige schriftliche Genehmigung. Details siehe [LICENSE-TERMS.md](./LICENSE-TERMS.md).
>
> ⚠️ **保留所有权利 (ZH)。** 源码仅公开供查阅，不授予任何使用许可；任何使用均需事先获得书面授权。详见 [LICENSE-TERMS.md](./LICENSE-TERMS.md)。

> **核心定位 (ZH)**：首个面向**民航低能见度气象研判**的浏览器端**云微物理交互仿真**工具（德 / 英 / 中三语本地化 · 纯前端 WebGL2 零依赖离线沙盒）。将三维实时体积云渲染、单矩/双矩微物理参数化（Kessler 1969 / KK2000 / ICON-SB06）、**ETH CLOUDLAB 过冷层云催化播云（WBF 冰化消云沟槽）**、**民航运行气象规程（METAR/SPECI/TAF、VIS/RVR/CMV/SVR、高原 QNH/QFE/DA、ICAO 低温修正与除防冰 HOT、签派放行简报）**以及 **ICON-LES / WRF / MATLAB / OpenFOAM / ANSYS Fluent / ParaView VTK** 科研工程导出融合于同一纯离线环境。
>
> **Core Positioning (EN)**: **CloudField** is the first browser-based **interactive cloud microphysics** and **aviation weather simulation** sandbox designed for low-visibility meteorological decision support, atmospheric physics education, and **Large-Eddy Simulation** (**ICON-LES** / **WRF**) pre-processing. Running 100% offline in WebGL2 with zero external dependencies and full **DE / EN / ZH** trilingual localization (default: German), it unifies 1-moment / 2-moment bulk microphysics (Kessler 1969, KK2000, Seifert & Beheng 2006), **glaciogenic cloud seeding** simulation (ETH CLOUDLAB Wegener–Bergeron–Findeisen trenching), **METAR / SPECI / TAF** inversion, runway **VIS / RVR / CMV** & ILS $3^\circ$ slant visual range (SVR), aircraft icing (SLD / ICAO Doc 9640 HOT), and ABL micrometeorology inflow export for MATLAB/Simulink, OpenFOAM, ANSYS Fluent/FENSAP-ICE, and ParaView VTK.
>
> **Kernpositionierung (DE)**: **CloudField** ist das erste browserbasierte, interaktive Diagnose- und Simulationswerkzeug für **Wolkenmikrophysik**, **glaziogene Wolkenimpfung** (ETH CLOUDLAB / Wegener–Bergeron–Findeisen-Prozess) und **Flugmeteorologie** bei geringer Sichtweite (METAR/SPECI/TAF, VIS/RVR/CMV/SVR, Vereisung & ICAO Doc 9640 Vorhaltezeit HOT, Flugdienstberatung sowie **ICON-LES** / **WRF** / CFD-Vorverarbeitung) — reines WebGL2-Frontend ohne externe Abhängigkeiten, 100 % offline lauffähig, vollständig dreisprachig (**Deutsch [Standard] / Englisch / Chinesisch**).
>
> **Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich) · 作者 / Authors / Autoren：Heinrich.Z & Tianyuan.J.Z · All Rights Reserved**

---

<a id="zh-cn"></a>

# 第一部分 · 中文完整文档 (中文)

## 1. 功能概览

CloudField 将三维实时体积云渲染与云微物理参数化、遥感观测算子及民航运行气象规程结合在同一离线环境中：

- **能见度与多相态消光计算**：基于 `β = 3·LWC/(2·ρ_w·r_e)`（叠加多分散 Mie 有效方差 $\nu_{\text{eff}}$ 修正与非球形冰晶习惯因子）及 Koschmieder 定律 `V = -ln(ε)/β`（ε=0.02）。同时计入边界层气溶胶消光与**云底以下降雨/降雪粒子下落消光**（Marshall–Palmer 雨滴谱与 Sekhon–Srivastava 雪谱经验关系），实时给出 β、LWC、$r_e$、$N_c$ 及垂直廓线对比。
- **三套微物理参数化并排对比、源汇收支拆解与降水耗云质量守恒反馈（Kessler / KK2000 / ICON-SB06）**：支持切换 **Kessler 1969（单矩阈值型）**、**KK2000（双矩大涡模拟幂律型）** 与 **ICON-SB06（Seifert & Beheng 2006 双矩谱宽耦合型）**，同屏绘制不同云滴数浓度 $N_c$ 下的准稳态降水率响应曲线，实时拆解**自动转化（$P_{\text{ac}}$）、碰并收集（$P_{\text{gr}}$）与 WBF 冰化（$P_{\text{wbf}}$）**贡献占比，支持**降水转化耗散三维/二维云场密度的质量守恒反馈（`washoutFeedback`）**及气溶胶-上升气流 CCN 活化耦合（Twomey 第一间接效应与 Albrecht 第二间接效应诊断）。
- **ETH CLOUDLAB 人工播云（WBF 冰化）三维/二维沙盒与靶区最佳播撒点反演**：支持点源播撒 AgI 碘化银（$-5^\circ\text{C}$ 阈值）或液态 $\text{CO}_2$（$-0.5^\circ\text{C}$ 阈值），按 Murphy & Koop (2005) 过冷水面与冰面饱和水汽压差 $\Delta e_{wi}(T)$ 驱动 **Wegener–Bergeron–Findeisen（WBF）** 水汽竞争过程，在 3D 视口与 2D 水平剖面中雕刻顺风向高斯扩散**消云沟槽（Seeding Trench）**；提供**跑道靶区最佳上风向播撒点自动反演（`optimalSeedingPoint`）**，定量给出沟槽内能见度增益、跑道 CAT-I 标准恢复情况及播云前后的**飞机积冰指数消减**。
- **双模式热力学探空图解（`T-z` 直角廓线 ↔ `Skew-T log-p` 斜温图）、守恒量诊断与 LCL 云底耦合**：底部主导垂直廓线画布支持一键切换 **`T-z` 直角廓线图** 与气象科研标准 **`Skew-T log-p` 斜温-对数压力图**（含 $45^\circ$ 倾斜等温线、干绝热线 $\theta$、CAPE 正浮力红区与 CIN 负浮力蓝区阴影、顶部 `LWC` 独立副坐标轴及湿球温度 $T_w(z)$ 曲线）；按 Bolton (1980) 精确公式输出位温 $\theta$、相当位温 $\theta_e$、饱和相当位温 $\theta_{es}$、湿球温度 $T_w$、湿球零度层（WBZ）、水汽混合比 $r_v$ 与位势不稳定判据 $\Delta\theta_e(0\to 3\text{km})$，采用**虚温 $T_v$ 浮力修正**计算真实气块抬升轨迹、CAPE、CIN 与 LI；支持开启 **LCL 热力学自动锚定对流云底（`thermoCoupledBase`）** 及导入实测探空（`z, p, T, Td`）分段插值识别逆温层与冻雨暖鼻层。
- **多通道遥感观测算子、机载 X 波段气象雷达（WXR）与辐射能量收支**：计算柱积分液水路径（LWP）、冰水路径（IWP）、总水路径（TWP）、地表向下短波辐照度、云球面反照率、耦合地表反照率的短波云辐射效应（$\text{CRE}_{\text{SW}}$）、Twomey 辐射强迫（$\Delta F_{\text{Twomey}}$）、$10.8\ \mu\text{m}$ 红外窗区卫星亮温、含双程 Beer–Lambert 衰减与退偏比的激光雷达后向散射；同时提供地面 S 波段天气雷达反射率（dBZ）与**机载 X 波段（9.3 GHz，ARINC 708 四色标准）前视气象雷达双程雨衰修正及 PAC 雨衰阴影告警**。
- **民航地面塔台、签派与机载进近运行支持**：
  - **METAR / SPECI / TAF 解析、质控与反演**：兼容国际标准（KT、Axxxx 英寸汞柱）与中国民航规范（MPS 米/秒风速、CAVOK、NSC/SKC、VVxxx 垂直能见度、近时天气与风切变组）；对低能见度大雾/霾报文自动反演贴地雾层与边界层气溶胶；支持将含 `BECMG` / `TEMPO` / `FM` 的多时段复杂 TAF 报文直接转化为时间序列并绘制能见度演变曲线。
  - **VIS / RVR / CMV、跑道三段式 RVR（TDZ / MID / END）与 ILS $3^\circ$ 下滑道斜程能见度（SVR）**：遵循 ICAO Doc 9365 与 EASA AMC NCO.OP.110，结合有效能见度/RVR 与最低 BKN/OVC 云底高（Ceiling）判定 `CAVOK / VMC / CAT-I / CAT-II / CAT-IIIA~C` 等级；沿 3.6 km 跑道轴线实时采样**接地区（TDZ）、中间段（MID）、停止端（END）三段式 RVR**；计算飞行员沿 **ILS $3^\circ$ 下滑道进近的斜程能见度（SVR）与决断高（DH 200 ft / 100 ft）目视参考建立判据**；支持跑道磁航向**顶风/顺风/正侧风分量分解与超限告警**。
  - **高原/高高原机场 QNH↔QFE、密度高度（DA）与严寒机场高度表修正**：内置中国民航机场表（WGS-84 坐标与海拔），自动识别一般高原（$\ge 1524\text{ m}$）与高高原机场（$\ge 2438\text{ m}$），实时换算修正海平面气压 QNH、场面气压 QFE、**计入高湿虚温修正的密度高度（Density Altitude，DA）与起飞滑跑距离增量**，并按 **ICAO Doc 8168 (PANS-OPS)** 计算严寒天气下决断高（DH/MDH）的低温气压高度表正修正量。
  - **飞机积冰（SLD）、地面除防冰液保持时间（ICAO Doc 9640 HOT）、颠簸耗散率（EDR）与低空风切变（LLWS）**：根据过冷水含量（SLWC）、温度效率窗（$0 \sim -38^\circ\text{C}$）与有效滴径 $r_e$ 计算飞机积冰严重度与 SLD 告警；按 **ICAO Doc 9640 / SAE ARP4737** 计算地面除防冰液（Type I / Type II / Type IV）在霜、冻雾、小/中雪、冻毛毛雨与轻度冻雨下的**保持时间窗口（Holdover Time，HOT，分钟）**；输出国际民航标准**湍流涡旋耗散率 $\text{EDR}$（$\text{m}^{2/3}\text{s}^{-1}$）**与进近走廊 **$0\text{–}500\text{ m}$ 低空垂直风切变（$\text{kt/100ft}$）及微下击暴流告警**。
  - **CCAR-121 / ICAO Annex 6 备降场最低标准与单屏签派放行简报（`签派放行总览`）**：支持按一套导航设施（云高 $+120\text{ m}$ / 能见度 $+1600\text{ m}$）与双套独立导航设施（云高 $+60\text{ m}$ / 能见度 $+800\text{ m}$）核算目的地/起飞备降场天气资质，并在「数据接口 → 签派放行总览」页生成汇总场压/密度高度、跑道风、三段 RVR、除防冰保持时间、备降场标准与高空危险天气的**单屏签派放行与塔台管制综合简报（`RELEASE / CAUTION / HOLD`）**。
  - **低空经济（UAV / eVTOL / 播云无人机）适航与光电吊舱（EO/IR）透过率评估**：针对 $0\text{–}1000\text{ m AGL}$ 低空空域（`uavLowAltitudeAssessment`），综合评估无除冰碳纤维旋翼积冰指数、锂电池低温可用容量折减率（$\%$）、抗风与湍流边界、$1\text{ km}$ 斜距可见光（$550\text{ nm}$）与短波红外（$1550\text{ nm}$）光电吊舱大气透过率，输出 `GO / CAUTION / NO-GO` 适航放行状态与受限因子。
  - **高空巡航（FL260–FL400）飞机凝结尾迹（Contrail）与静力稳定度评估**：按 **ICAO / WMO Schmidt–Appleman 判据**（`cruiseContrailAssessment`）计算巡航高度层混合斜率 $G$（$\text{Pa/K}$）、凝结尾迹临界生成温度 $T_{\text{LM}}$、对冰相对湿度 $\text{RHi}$ 与冰过饱和区（ISSR）持续性卷云尾迹生成判据，同时输出巡航层位温 $\theta$ 与 Brunt–Väisälä 静力稳定度频率 $N_{\text{BV}}$。
- **MATLAB / Simulink、主流 CFD 求解器与结冰软件原生兼容**：
  - **大气边界层（ABL）风廓线与 $k\text{–}\varepsilon$ 湍流入口剖面（`Atmosphere.windProfileAt`）**：生成随高度变化的 Hellmann 幂律风切变、北半球 Ekman 螺线风向顺转（$0 \to +20^\circ$）、速度分量 $(u, v, w)$、湍流动能 $\text{TKE } k(z)$（$\text{m}^2/\text{s}^2$）、湍流耗散率 $\varepsilon(z)$（$\text{m}^2/\text{s}^3$）、空气密度 $\rho(z)$、位温 $\theta(z)$ 与比湿 $q_v(z)$。
  - **FENSAP-ICE / NASA LEWICE 7-Bin Langmuir 多分档液滴谱与收集效率（`Physics.langmuirDropletSpectrum`）**：计算中值体积直径 $\text{MVD}$、Langmuir 7 档粒径权重、无量纲惯性参数 $K_0$、机翼/旋翼前缘驻点收集效率 $\beta_0$，以及基于 Messinger (1953) 热平衡的冻结分数 $f_{\text{freeze}}$ 与冰型（霜冰 `RIME` / 混合冰 `MIXED` / 明冰 `GLAZE`）。
  - **多生态工程与科研一键导出**：支持直接导出 **MATLAB / Simulink / Aerospace Blockset 原生工作区脚本（`.m`）**、**OpenFOAM 2.0 `ABLConditions` 边界层入口字典（`.foam`）**、**ANSYS Fluent S-Expression 边界廓线与 FENSAP-ICE 液滴谱（`.prof`）**、**ParaView / Tecplot / VisIt 三维结构化网格标量与风矢量场（`.vtk`）**、**ICON-LES / WRF Fortran Namelist（`.nml`）**、**CLOUDLAB 实验清单（`.yaml`）**、**57 层完整垂直廓线 CSV**，并同时提供 **Python SDK（`sdk/cloudfield_sdk.py`）** 与 **MATLAB / GNU Octave SDK（`sdk/cloudfield_sdk.m`）**。

---

## 2. 快速开始

```bash
# 方式 A：直接打开（离线，零依赖）
# 用浏览器打开 index.html 即可（推荐 Chrome/Edge，需支持 WebGL2）

# 方式 B：本地静态服务（避免个别浏览器对 file:// 的限制）
python3 -m http.server 8080
# 然后访问 http://127.0.0.1:8080/

# 可选：命令行批量诊断 / 物理与三语全链路回归校验（需本地安装 Node.js）
node tools/boot_test.js
node tools/cli.js --preset cloudlab --format yaml
```

无需联网、不上传任何数据。所有计算在浏览器本地完成。

> **界面语言与单位**：顶栏右侧的 `DE / EN / 中文` 切换界面语言（顺序即德→英→中，**默认德文**），旁边的 `常用 / SI` 切换单位体系（hPa↔Pa、°C↔K、km↔m），两者均保存在本地 `localStorage`。详见第 6、7 节。

---

## 3. 目录结构

```
CloudField/
├── index.html              # 顶栏 + 三栏：控制面板 | 视口（含剖面高度轴） | 诊断面板（读数/公式/色标）
├── LICENSE-TERMS.md        # 授权条款（All Rights Reserved；仅公开供查阅，使用需书面许可）
├── README.md               # 三语（中文 / English / Deutsch）项目说明文档
├── 开发日志.md              # 开发历程与版本更新记录
├── .gitignore
├── .github/workflows/
│   └── ci.yml              # GitHub Actions 自动化物理、GLSL 着色器与渲染稳定性回归工作流
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
│   ├── export.js           # METAR / IWXXM / BUFR / GRIB / MATLAB / OpenFOAM / Fluent / VTK / Namelist / YAML / CSV 导出
│   ├── batch.js            # 多站点批量诊断（供 CLI 与 Python / MATLAB SDK 调用）
│   ├── recorder.js         # 场景录制与回放（状态快照时间轴）
│   ├── report.js           # 自包含 HTML 诊断报告 / 截图标注 / 分享链接（URL 状态编码）
│   └── help.js             # 参数释义卡片 + 典型天气场景预设
├── tools/
│   ├── cli.js              # Node 命令行批处理与多生态科研/CFD 格式导出工具
│   ├── boot_test.js        # 全链路启动、微物理、民航规程与三语词典回归测试（253 项断言）
│   ├── glsl_test.js        # WebGL2 GLSL ES 3.00 四个着色器语法树与负向对照校验
│   ├── dom_smoke.js        # 真实 HTML DOM 启动与控件接线冒烟测试
│   ├── stability_test.js   # 多帧循环、Web Worker 体素流与 GPU 资源零泄漏稳定性测试
│   ├── occ_check.js        # 三维 Occupancy 膨胀体素与着色器分形密度场一致性核对
│   └── ray_debug.js        # 体积光线步进与空区间跳步诊断脚本
├── sdk/
│   ├── cloudfield_sdk.py   # Python SDK：封装 CLI 批处理与科研/CFD 多格式解析
│   └── cloudfield_sdk.m    # MATLAB / GNU Octave SDK：一键导入工作区结构体、1D 查找表、二维切片与批量计算
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
| 相当位温 (Bolton) | $\theta_e = \theta_d \exp\left[\left(\frac{3.376}{T_{\text{LCL}}} - 0.00254\right) r_v (1 + 0.81\times 10^{-3} r_v)\right]$ | 湿绝热过程守恒量；$\partial \theta_e / \partial z < 0$ 判别对流/位势不稳定 |
| 对流有效位能 | $\text{CAPE} = \int_{z_{\text{LFC}}}^{z_{\text{EL}}} g \frac{T_{v,p}(z) - T_{v,\text{env}}(z)}{T_{v,\text{env}}(z)}\,\mathrm{d}z$ | 计入水汽虚温 $T_v$ 浮力修正的气块抬升正浮力垂直积分（$\text{J/kg}$） |
| 凝结尾迹临界温度 | $G = \frac{\text{EI}_{\text{H}_2\text{O}} c_p p}{\varepsilon Q (1-\eta)}$，$T_{\text{LM}} = -46.46 + 9.43\ln(G-0.053) + 0.72[\ln(G-0.053)]^2$ | Schmidt–Appleman 高空巡航尾迹生成与持续判据 |

详细推导与参数化说明见 [`docs/methodology.md`](./docs/methodology.md)。

---

## 5. 民航与系统集成接口（四层架构）

1. **气象数据输入与时序转化**：支持 METAR / SPECI / TAF 解析（ICAO Annex 3 + WMO FM15/16 及中国民航 MPS 规范），解析结果可一键驱动三维场景（含低能见度大雾/垂直能见度自动成雾反演）；复杂 TAF 的 `BECMG` / `TEMPO` / `FM` 演变段可直接生成时间序列演变曲线。
2. **VIS / RVR / CMV 与跑道运行分析**：提供三模式切换（ICAO Doc 9365 + EASA NCO.OP.110）、CMV 禁用条款交互核查、CAVOK / CAT-I…IIIC 预设、与当前 3D 场景最差能见度/最低云底高的双向同步，以及跑道磁航向顶风、顺风、正侧风分量分解与超限提示。
3. **IPC 实时通信**：WebSocket Delta 协议（snapshot / delta / telemetry，schema 版本化）+ REST API + 事件录制与时间轴回放。
4. **机场数据库与高原/低温运行核算**：内置中国民航代表性机场表（WGS-84 经纬度与海拔），支持跨语言搜索、设为当前活动运行场站（联动 METAR 导出）、高原/高高原机场等级标识、QNH ↔ QFE 实时换算，以及严寒条件下决断高（DH）的 ICAO Doc 8168 低温修正。

入口：界面右上“数据接口”按钮 → 六个标签页（METAR/TAF、VIS/RVR/CMV、机场表、签派放行总览、Bridge、事件录制/回放）。

---

## 6. 界面语言（中文 / English / Deutsch）

- **默认语言：德文（Deutsch）**。
- 顶栏右侧 `DE / EN / 中文` 分段控件切换（第一德语、第二英语、第三中文，选择记忆于 `localStorage`）。
- 覆盖范围：控制面板、工具栏、HUD、底部监控、能见度仪表盘、高级诊断弹窗、说明弹窗，以及“数据接口”面板的全部界面文案；**ICAO 现在天气代码描述（23 个）与内置机场表（63 个）的机场名同样提供三语**，机场搜索支持跨语言命中（任输中文/英文/德文/ICAO/IATA）。
- 运行环境：需要支持 **WebGL2** 的浏览器（3D 视口）。若初始化或渲染失败，加载区会显示简洁的三语错误摘要，完整日志可查看浏览器控制台（F12）。

---

## 7. 读图设计：色标、数值回显、口径

**信息架构**

- 顶栏：品牌、运行状态（播放/暂停 + 时间流速 + 渲染质量 + FPS）、单位体系、语言。
- 右侧面板分三个 Tab：**读数**（当前值 + 历史曲线 + 对比快照）/ **公式**（每条公式下方附当前数值代入结果）/ **色标**（各物理量色标条与当前值指针）。
- 底部垂直廓线图作为主导读图窗口（画布 640×230，同时绘制温度 $T(z)$、露点 $T_d(z)$、液态水含量 $\text{LWC}(z)$ 与冰相分数 $f_{\text{ice}}(z)$，并可切换 `Skew-T log-p` 斜温图），实时读数收成 12 张紧凑仪表卡，模拟状态单独一栏。

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

本软件为**专有软件（proprietary）**，全部权利由作者保留。本仓库在 **GitHub 上仅用于版本管理与备份**，不构成对任何第三方的使用许可或公开授权。完整英文法律条款以 [`LICENSE-TERMS.md`](./LICENSE-TERMS.md) 为准。

**使用授权**：如需使用本软件，请联系作者获取书面授权。

- 作者邮箱：**zhangheinrich@foxmail.com**

**免费授权（学术与科研用途）**：在**德国、中国（含港澳台地区）、法国**的学术与科研用途，当项目/课题的**纵向经费低于 30,000 美元（USD 30,000）**时，经作者**书面授权后可免费使用**；使用时必须**引用本项目**，并作出**书面鸣谢**。

**其他用途**（商业与业务运营、经费达到或超过上述额度、或其他国家/地区）不在免费授权范围内，须与作者另行协商并获得书面授权。

**版权**：© 2026 Tianyuan.J.Z（Zhang Heinrich），保留所有权利。

补充说明（素材与署名）：

- 界面上的 © 标识为本项目的自有版权署名（顶栏品牌区、侧栏页脚）。
- 应用本体零外部资源：不引第三方字体（用系统字体栈）、不引图片/图标（界面里的 ☁ ✕ ▾ 等均为 Unicode 字符）、不引 CDN 脚本。
- 物理公式与参数化方案均为公开文献（Kessler 1969、Khairoutdinov & Kogan 2000、Seifert & Beheng 2006、Murphy & Koop 2005、Bolton 1980、Koschmieder、Ångström、ICAO Doc 9365、ICAO Doc 8168、ICAO Doc 9640、EASA NCO.OP.110），引用见 [`docs/methodology.md`](./docs/methodology.md)。

---

## 10. 离线声明

所有计算在本地浏览器完成，不采集、不上传任何数据。VIS/RVR/CMV 转换遵循 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110（2024 第5版）。

---

## 11. 系统配置要求（最低 / 建议）

CloudField 是**纯前端、离线、零外部资源**的单页应用，唯一的硬性要求是浏览器支持 **WebGL2**（着色器使用 `sampler3D`、`R16F` 可线性过滤纹理、GLSL ES 3.00）。

| 维度 | 最低配置（能跑、可读图） | 建议配置（流畅 60 FPS、高质量） |
| --- | --- | --- |
| **操作系统** | Windows 10 / macOS 10.15 / 主流 Linux 发行版 / Android 8+ / iOS 15+ | 同上，任一较新版本 |
| **浏览器** | 支持 WebGL2：Chrome / Edge 56+、Firefox 51+、Safari 15+（桌面）；Chrome Android 56+、Safari iOS 15+ | 上述浏览器的最新版 |
| **GPU** | 支持 WebGL2 的集成显卡（Intel HD 4000 及更新 / Iris、AMD Radeon、Apple M 系列、Mali/Adreno 带 WebGL2 驱动） | 独立或较新的集成显卡（GTX/RTX、Radeon RX、Apple M1 及以上），WebGL2 硬件加速良好 |
| **CPU** | 双核 2.0 GHz 以上（一核主线程、一核 occupancy Worker） | 四核 3.0 GHz 以上 |
| **内存** | 4 GB（与系统/浏览器共享） | 8 GB 以上 |
| **显示** | 1280×720（三栏布局可用但偏紧） | 1920×1080 或更高；高分屏（Retina/4K）经自适应 DPR（上限 1.5）支持 |
| **网络** | **无需联网**，完全离线；可直接 `file://` 打开 `index.html` 或用 `python3 -m http.server` 启动本地静态服务 | 同上 |

---

## 12. 参照与方向

- **ETH CLOUDLAB / ICON-LES**：用大涡模拟复现外场播云实验、对比不同微物理参数化方案并开展敏感性试验——本工具以浏览器端实时可调的交互式沙盒形式，服务于微物理教学、实验前处理与民航复杂低能见度气象研判。

---

## 13. 鸣谢

- 感谢 **MonikaSong G.C（南京）** 提供专业知识支持。
- 感谢 **Alvin Lv** 提供稳定性测试协助。
- 感谢 **Huaneng Yuan** 提供测试协助。

---
---

<a id="en"></a>

# Part II · English Documentation (English)

**[↑ Back to Top](#top)** · **[中文完整文档](#zh-cn)** · **[Deutsche Dokumentation](#de)**

## 1. Feature Overview

**CloudField** combines real-time 3D WebGL2 volumetric cloud rendering with bulk cloud microphysics parameterizations, remote-sensing forward operators, and civil aviation operational meteorology rules inside a single 100% offline browser environment:

- **Visibility & Multi-Phase Extinction Diagnostics**: Computes optical extinction via `β = 3·LWC/(2·ρ_w·r_e)` augmented with polydisperse Mie effective-variance ($\nu_{\text{eff}}$) quadrature (anomalous diffraction + 5-point Gauss–Hermite integration) and non-spherical ice-habit factors, yielding meteorological visibility via Koschmieder's law `V = -ln(ε)/β` ($\varepsilon = 0.02$). Incorporates boundary-layer aerosol extinction as well as **sub-cloud rain and snow precipitation extinction** (Marshall–Palmer raindrop and Sekhon–Srivastava snowflake relations).
- **Side-by-Side 1M/2M Microphysics Schemes, Process Budgets & Mass-Conserving Washout (`Kessler 1969` / `KK2000` / `ICON-SB06`)**: Switch interactively between **Kessler (1969, 1-moment threshold)**, **Khairoutdinov & Kogan (2000, 2-moment LES power-law)**, and **Seifert & Beheng (2006, ICON 2-moment spectral-width coupled)**. Plots quasi-steady rain rate $R$ against droplet concentration $N_c$, decomposes **autoconversion ($P_{\text{ac}}$), accretion ($P_{\text{gr}}$), and WBF glaciation ($P_{\text{wbf}}$)** budgets, supports **mass-conserving precipitation depletion feedback (`washoutFeedback`)** onto 3D/2D cloud density, and diagnoses aerosol–updraft CCN activation coupling (Twomey 1st and Albrecht 2nd indirect effects).
- **ETH CLOUDLAB Glaciogenic Cloud Seeding (WBF) Sandbox & Optimal Upwind Seeding Inversion**: Simulates point-source UAV seeding with silver iodide ($\text{AgI}$, $-5^\circ\text{C}$ threshold) or liquid $\text{CO}_2$ / dry ice ($-0.5^\circ\text{C}$ homogeneous freezing). Driven by the Murphy & Koop (2005) supercooled water–ice saturation vapor pressure deficit $\Delta e_{wi}(T)$, the **Wegener–Bergeron–Findeisen (WBF)** process carves a downwind Gaussian **seeding trench** across both the 3D volumetric viewport and 2D horizontal slice. Includes **automated optimal upwind seeding-point inversion (`optimalSeedingPoint`)** for runway target zones, quantifying visibility gain, CAT-I recovery, and aircraft icing mitigation.
- **Dual-Mode Thermodynamic Sounding (`T-z` Profile ↔ `Skew-T log-p` Diagram), Conserved Variables & LCL Cloud-Base Coupling**: Switch the primary profile canvas between Cartesian `T-z` profiles and full **`Skew-T log-p` diagrams** ($45^\circ$ skewed isotherms, dry adiabats $\theta$, CAPE positive-buoyancy red shading, CIN negative-buoyancy blue shading, dedicated top `LWC` axis, and wet-bulb temperature $T_w(z)$). Computes potential temperature $\theta$, Bolton (1980) equivalent potential temperature $\theta_e$, $\theta_{es}$, wet-bulb zero level (WBZ), mixing ratio $r_v$, convective instability $\Delta\theta_e(0\to 3\text{km})$, and **virtual-temperature ($T_v$) corrected CAPE, CIN, LFC, EL, and LI**. Supports **LCL-anchored convective cloud bases (`thermoCoupledBase`)** and custom radiosonde (`z, p, T, Td`) assimilation (including freezing-rain warm-nose inversions).
- **Multi-Channel Remote Sensing Operators, Airborne X-Band Weather Radar (WXR) & Radiative Energy Budget**: Forward-models Liquid/Ice/Total Water Path (LWP/IWP/TWP), surface downwelling shortwave irradiance, spherical cloud albedo, surface-coupled shortwave Cloud Radiative Effect ($\text{CRE}_{\text{SW}}$), Twomey radiative forcing ($\Delta F_{\text{Twomey}}$), $10.8\ \mu\text{m}$ IR window brightness temperature ($T_b$), two-way attenuated lidar backscatter & depolarization ratio, ground S-band weather radar reflectivity (dBZ), and **airborne X-band ($9.3\text{ GHz}$, ARINC 708 4-color) forward weather radar with two-way rain attenuation and Path Attenuation Compensation (PAC) shadow alerts**.
- **Civil Aviation Tower, Flight Dispatch & Approach Operations**:
  - **METAR / SPECI / TAF Parsing, QC & Scene Inversion**: Supports ICAO Annex 3, WMO FM15/16, and CAAC MPS conventions (`KT`/`MPS`, `CAVOK`, `VVxxx` vertical visibility, wind shear, and `BECMG`/`TEMPO`/`FM` TAF time-series visibility evolution).
  - **VIS / RVR / CMV, 3-Point Runway RVR (`TDZ / MID / END`) & ILS $3^\circ$ Slant Visual Range (`SVR`)**: Implements ICAO Doc 9365 and EASA AMC NCO.OP.110 (including CMV prohibition checks), classifies `CAVOK / VMC / CAT-I / CAT-II / CAT-IIIA–C`, samples 3-point RVR along a $3.6\text{ km}$ runway, integrates **ILS $3^\circ$ glideslope Slant Visual Range (SVR)** for visual contact verification at Decision Height (`DH 200 ft / 100 ft`), and decomposes headwind/tailwind/crosswind limits.
  - **High-Plateau `QNH ↔ QFE`, Density Altitude (`DA`) & Cold-Temperature Altimeter Correction**: Built-in WGS-84 airport database with automatic plateau ($\ge 1524\text{ m}$) and super-high-plateau ($\ge 2438\text{ m}$) classification, `QNH ↔ QFE` barometric conversion, humidity-corrected **Density Altitude (DA)** & takeoff ground-roll penalty, and **ICAO Doc 8168 (PANS-OPS)** low-temperature DH/MDH altimeter corrections.
  - **Aircraft Icing (`SLD`), De-/Anti-Icing Holdover Time (`ICAO Doc 9640 HOT`), Turbulence (`EDR`) & Low-Level Wind Shear (`LLWS`)**: Evaluates Supercooled Large Droplet (SLD) icing severity, **ICAO Doc 9640 / SAE ARP4737 Holdover Time (HOT)** windows for Type I / II / IV fluids, Eddy Dissipation Rate ($\text{EDR}$, $\text{m}^{2/3}\text{s}^{-1}$), and $0\text{–}500\text{ m}$ approach corridor vertical wind shear ($\text{kt/100ft}$).
  - **Alternate Minima (`CCAR-121 / ICAO Annex 6`) & Single-Screen Dispatch Briefing**: Synthesizes pressure/density altitude, runway wind, 3-point RVR, HOT, alternate minima, and upper-air hazards into an operational `RELEASE / CAUTION / HOLD` dispatch & ATC briefing.
  - **Low-Altitude UAV / eVTOL Airworthiness & High-Altitude Cruise Contrails**: Evaluates $0\text{–}1000\text{ m AGL}$ unheated rotor icing, Li-Po cold-weather capacity derating, wind/EDR limits, and $550\text{ nm}$ / $1550\text{ nm}$ EO/IR pod transmittance (`GO / CAUTION / NO-GO`), plus **FL260–FL400 ICAO/WMO Schmidt–Appleman contrail formation ($T_{\text{LM}}$), persistent ISSR cirrus, and Brunt–Väisälä static stability ($N_{\text{BV}}$)**.
- **Native Compatibility with MATLAB / Simulink, Mainstream CFD Solvers & Icing Codes**:
  - **ABL Wind & $k\text{–}\varepsilon$ Turbulence Inflow (`Atmosphere.windProfileAt`)**: Generates Hellmann power-law shear, Northern Hemisphere Ekman spiral veering, $(u, v, w)$, turbulent kinetic energy $k(z)$, dissipation rate $\varepsilon(z)$, density $\rho(z)$, $\theta(z)$, and specific humidity $q_v(z)$.
  - **FENSAP-ICE / NASA LEWICE 7-Bin Langmuir Droplet Spectrum (`Physics.langmuirDropletSpectrum`)**: Computes Median Volume Diameter ($\text{MVD}$), 7-bin Langmuir weights, modified inertia parameter $K_0$, stagnation collection efficiency $\beta_0$, and Messinger (1953) freezing fraction & ice regime (`RIME / MIXED / GLAZE`).
  - **One-Click Scientific & Engineering Export**: Exports **MATLAB / Simulink / Aerospace Blockset workspace scripts (`.m`)**, **OpenFOAM 2.0 `ABLConditions` dictionaries (`.foam`)**, **ANSYS Fluent S-Expression profiles & FENSAP-ICE spectra (`.prof`)**, **ParaView / Tecplot / VisIt 3D structured VTK grids (`.vtk`)**, **ICON-LES / WRF Fortran Namelists (`.nml`)**, **CLOUDLAB experiment manifests (`.yaml`)**, and **57-level profile CSVs**, backed by the **Node CLI (`tools/cli.js`)**, **Python SDK (`sdk/cloudfield_sdk.py`)**, and **MATLAB / GNU Octave SDK (`sdk/cloudfield_sdk.m`)**.

---

## 2. Quick Start & Automated Verification

```bash
# Option A: Open directly (100% offline, zero dependencies)
# Open index.html in any WebGL2-capable browser (Chrome / Edge / Firefox / Safari)

# Option B: Local static server (avoids strict file:// policies in certain browsers)
python3 -m http.server 8080
# Visit http://127.0.0.1:8080/

# Optional: Headless CLI batch diagnostics & automated regression suite (requires Node.js)
node tools/boot_test.js
node tools/occ_check.js
node tools/cli.js --preset cloudlab --format yaml
```

No internet connection is required and no data is ever collected or uploaded. Switch interface languages at the top-right segmented toggle (`DE / EN / 中文`, **default: Deutsch**) and unit systems via `Common / SI` (persisted in `localStorage`).

---

## 3. Core Physics & Operational Equations

| Quantity / Module | Equation / Relation | Notes & Reference |
| --- | --- | --- |
| Cloud Droplet Extinction | `β = 3·LWC / (2·ρ_w·r_e)` | Geometric-optics baseline in $\text{m}^{-1}$ (`1.5·LWC/r_e` for $\text{g/m}^3$ and $\mu\text{m}$) |
| Polydisperse Mie Correction | `β = 1.5·LWC/r_e · (Q_ext(x, ν_eff)/2)` | Van de Hulst anomalous diffraction + 5-point Gauss–Hermite quadrature (`js/mie.js`) |
| Rain / Snow Extinction | $\beta_{\text{rain}} = 0.21\times 10^{-3} R^{0.75}$, $\beta_{\text{snow}} = 1.25\times 10^{-3} R^{0.82}$ | Sub-cloud falling hydrometeor extinction in $\text{m}^{-1}$ ($R$ in $\text{mm/h}$) |
| Daytime Visibility | `V = -ln(ε)/β`, $\varepsilon = 0.02$ | Koschmieder's law (`V ≈ 3.912/β`) |
| Warm-Rain Autoconversion | Kessler threshold / KK2000 power-law / SB06 spectral | 1-moment & 2-moment autoconversion + accretion (`js/kessler.js`) |
| WBF Vapor Pressure Deficit | $\Delta e_{wi}(T) = e_{s,w}(T) - e_{s,i}(T)$ | Murphy & Koop (2005); peaks near $-12.5^\circ\text{C}$ ($\approx 0.268\text{ hPa}$) |
| Two-Stream Cloud Forcing | $\alpha_{\text{all}} = R_c + \frac{T_c^2 \alpha_s}{1 - R_c \alpha_s}$, $\text{CRE}_{\text{SW}} = -S_0 \mu_0 (\alpha_{\text{all}} - \alpha_s)$ | Surface-coupled shortwave Cloud Radiative Effect & Twomey forcing |
| Aerodrome QNH ↔ QFE | $\text{QFE} = \text{QNH} \cdot \exp\left(-\frac{g \cdot h_{\text{elev}}}{R_d \cdot \bar{T}}\right)$ | High-plateau aerodrome pressure conversion |
| Density Altitude (DA) | $\text{DA}_{\text{ft}} = \text{PA}_{\text{ft}} + 118.8 \cdot (T_v - T_{\text{ISA}})$ | Virtual-temperature ($T_v$) corrected takeoff performance altitude |
| Cold-Temp DH Correction | $\Delta H = H \cdot \frac{15 - T_0}{273.15 + T_0 - 0.5 L_0 (H + H_{\text{elev}})}$ | ICAO Doc 8168 (PANS-OPS) low-temperature altimeter positive correction |
| Glideslope Slant Vis (SVR) | $\text{SVR}(H) = \frac{3.912}{\frac{1}{L_{\text{slant}}} \int_0^{L_{\text{slant}}} \beta(s)\,\mathrm{d}s}$ | Path-integrated slant visibility along the ILS $3^\circ$ approach path |
| Equivalent Potential Temp. | $\theta_e = \theta_d \exp\left[\left(\frac{3.376}{T_{\text{LCL}}} - 0.00254\right) r_v (1 + 0.81\times 10^{-3} r_v)\right]$ | Bolton (1980) moist-adiabatic invariant; $\partial \theta_e / \partial z < 0$ flags convective instability |
| Virtual-Temp. CAPE | $\text{CAPE} = \int_{z_{\text{LFC}}}^{z_{\text{EL}}} g \frac{T_{v,p}(z) - T_{v,\text{env}}(z)}{T_{v,\text{env}}(z)}\,\mathrm{d}z$ | Buoyancy-integrated parcel convective available potential energy ($\text{J/kg}$) |
| Contrail Threshold ($T_{\text{LM}}$) | $G = \frac{\text{EI}_{\text{H}_2\text{O}} c_p p}{\varepsilon Q (1-\eta)}$, $T_{\text{LM}} = -46.46 + 9.43\ln(G-0.053) + 0.72[\ln(G-0.053)]^2$ | ICAO / WMO Schmidt–Appleman cruise contrail formation & ISSR persistence |

Full mathematical derivations and parameterization tables are documented in [`docs/methodology.md`](./docs/methodology.md) and system architecture in [`docs/architecture.md`](./docs/architecture.md).

---

## 4. Architecture, Renderer & System Requirements

- **Three-Tier Decoupled Architecture**:
  1. **CloudField Core (Web Worker)**: Computes the $16^3$ occupancy coarse grid with conservative $3\times 3\times 3$ neighborhood max-dilation (`R16F` 3D texture), preventing thin-stratus or cumulus-edge clipping during empty-space skipping.
  2. **WebGL2 Volumetric Ray-Marching Renderer (`js/clouds.js`)**: Continuous occupancy-interpolated step sizing, true segment-length optical depth integration, shared 5-octave trilinear fBm noise advected identically across GPU shaders and CPU spatial/point probes (`p - uWind * uTime`), solar shadow early-ray termination, and EMA frame-time adaptive DPR ($0.55\text{–}1.5$) with Temporal Anti-Aliasing (TAA).
  3. **Bridge Adapter (`bridge-adapter/server.js`)**: Optional standalone Node.js IPC daemon (built strictly on native Node `http` + `crypto` modules, zero `npm install`) providing REST endpoints (`/api/airports`, `/api/schema`, `/api/metar`, `/api/sessions`) and RFC6455 WebSocket `snapshot / delta / telemetry` synchronization.
- **System Requirements**: Any desktop or mobile OS with a **WebGL2-capable browser** (Chrome/Edge 56+, Firefox 51+, Safari 15+). Minimum: dual-core CPU, 4 GB RAM, integrated WebGL2 GPU ($1280\times 720$). Recommended for 60 FPS high quality: quad-core 3.0 GHz+ CPU, 8 GB+ RAM, dedicated or modern integrated GPU (GTX/RTX, Radeon RX, Apple Silicon M-series) at $1920\times 1080$ or Retina/4K.

---

## 5. License & Terms of Use (Proprietary · All Rights Reserved)

This software is **proprietary**; all rights are reserved by the copyright holder. This public GitHub repository is maintained **solely for version management, backup, and viewing/inspection** and does not constitute a public license or grant of rights. Full binding terms are set forth in [`LICENSE-TERMS.md`](./LICENSE-TERMS.md).

- **Requests for Written Permission**: Contact **zhangheinrich@foxmail.com** prior to any use beyond viewing (evaluation, academic citation, integration, modification, or commercial licensing).
- **Academic Use Grant (Germany, China, France)**: For academic and scientific research use in **Germany, China (including Hong Kong, Macao, and Taiwan), and France**, where the project's **vertical (public) funding is below USD 30,000**, the copyright holder may grant **free use upon explicit prior written authorization**, conditional on:
  1. **Citing this project** in the resulting work; and
  2. Providing **written acknowledgement** of the author.
- **Other Uses**: Any commercial or operational use, projects with funding at or above USD 30,000, or use in other countries/regions require a separate written agreement.
- **Copyright**: © 2026 **Tianyuan.J.Z (Zhang Heinrich)**. All Rights Reserved.

---

## 6. Offline Statement, Scientific Reference & Acknowledgements

- **100% Offline & Zero Telemetry**: All computations execute locally inside the browser with zero external fonts, CDN scripts, or data uploads.
- **Scientific Reference**: Inspired by **ETH Zürich CLOUDLAB** and **ICON-LES** cloud-seeding sensitivity experiments — complementing multi-hour Fortran LES runs with an interactive, real-time browser diagnostic sandbox for parameterization teaching, experiment pre-processing, and aviation low-visibility decision support.
- **Acknowledgements**:
  - **MonikaSong G.C (Nanjing)** for professional meteorological domain support.
  - **Alvin Lv** for stability-testing assistance.
  - **Huaneng Yuan** for testing assistance.

---
---

<a id="de"></a>

# Teil III · Deutsche Dokumentation (Deutsch)

**[↑ Nach oben](#top)** · **[中文完整文档](#zh-cn)** · **[English Documentation](#en)**

## 1. Funktionsübersicht

**CloudField** vereint volumetrisches Echtzeit-3D-Wolkenrendering (WebGL2) mit Bulk-Wolkenmikrophysik-Parametrisierungen, Fernerkundungs-Vorwärtsoperatoren und flugmeteorologischen Betriebsverfahren der Zivilluftfahrt in einer vollständig offline lauffähigen Browser-Umgebung (**Standardsprache der Benutzeroberfläche: Deutsch**):

- **Sichtweite & Mehrphasen-Extinktionsdiagnostik**: Berechnet den optischen Extinktionskoeffizienten über `β = 3·LWC/(2·ρ_w·r_e)` einschließlich polydisperser Mie-Korrektur über die effektive Varianz $\nu_{\text{eff}}$ (anomale Beugungsnäherung nach van de Hulst + 5-Punkt-Gauss–Hermite-Quadratur) sowie nichtsphärischer Eiskristall-Habitusfaktoren und bestimmt die meteorologische Sichtweite nach dem Koschmieder-Gesetz `V = -ln(ε)/β` ($\varepsilon = 0{,}02$). Berücksichtigt Grenzschicht-Aerosolextinktion sowie **Regen- und Schneefall-Extinktion unterhalb der Wolkenbasis** (Marshall–Palmer- bzw. Sekhon–Srivastava-Spektren).
- **Direktvergleich dreier Mikrophysik-Schemata, Prozessbudgets & massenerhaltende Auswaschung (`Kessler 1969` / `KK2000` / `ICON-SB06`)**: Interaktives Umschalten zwischen **Kessler (1969, 1-Moment-Schwellenwertschema)**, **Khairoutdinov & Kogan (2000, 2-Moment-LES-Potenzgesetz)** und **Seifert & Beheng (2006, ICON-2-Moment-Schema mit Spektralbreitenkopplung)**. Zeigt stationäre Niederschlagsraten $R$ in Abhängigkeit von der Tröpfchenanzahldichte $N_c$, zerlegt die Quell-/Senkenbudgets in **Autokonversion ($P_{\text{ac}}$), Akkretion ($P_{\text{gr}}$) und WBF-Vereisung ($P_{\text{wbf}}$)**, unterstützt **massenerhaltende Niederschlags-Auswasch-Rückkopplung (`washoutFeedback`)** auf das 3D-/2D-Wolkenfeld und diagnostiziert die CCN-Aktivierungskopplung (erster indirekter Twomey-Effekt und zweiter indirekter Albrecht-Effekt).
- **ETH CLOUDLAB Glaziogene Wolkenimpfung (WBF-Prozess) & Optimale Luv-Impfpunkt-Inversion**: Simuliert punktuelle UAV-Wolkenimpfung mit Silberjodid ($\text{AgI}$, Schwellentemperatur $-5^\circ\text{C}$) oder flüssigem $\text{CO}_2$ / Trockeneis ($-0{,}5^\circ\text{C}$ homogene Gefrierung). Angetrieben durch die Sättigungsdampfdruckdifferenz $\Delta e_{wi}(T)$ zwischen unterkühltem Wasser und Eis nach Murphy & Koop (2005) erzeugt der **Wegener–Bergeron–Findeisen-Prozess (WBF)** einen leeseitigen Gaußschen **Vereisungs- bzw. Auflösungsgraben (Seeding Trench)** synchron im 3D-Volumenfenster und im 2D-Horizontalschnitt. Enthält eine **automatische Rückrechnung des optimalen Luv-Impfpunkts (`optimalSeedingPoint`)** für Pisten-Zielzonen inkl. Sichtweitengewinn, CAT-I-Wiederherstellung und Vereisungsreduktion.
- **Duales Thermodynamik-Sondierungsdiagramm (`T-z`-Profil ↔ `Skew-T-log-p`-Diagramm), Erhaltungsgrößen & LCL-Wolkenbasiskopplung**: Umschaltbare Hauptprofil-Leinwand zwischen kartesischem `T-z`-Profil und meteorologischem **`Skew-T-log-p`-Diagramm** ($45^\circ$ geneigte Isothermen, Trockenadiabaten $\theta$, CAPE-Auftriebsflächen in Rot, CIN-Sperrschichtflächen in Blau, eigene obere `LWC`-Skala und Feuchtkugeltemperatur $T_w(z)$). Berechnet potentielle Temperatur $\theta$, äquivalentpotentielle Temperatur $\theta_e$ nach Bolton (1980), $\theta_{es}$, Feuchtkugel-Nullgradgrenze (WBZ), Mischungsverhältnis $r_v$, potentielle Instabilität $\Delta\theta_e(0\to 3\text{km})$ sowie **virtuelltemperaturkorrigierte ($T_v$) CAPE-, CIN-, LFC-, EL- und LI-Werte**. Unterstützt **LCL-gekoppelte Konvektionswolkenuntergrenzen (`thermoCoupledBase`)** sowie den Import realer Radiosondenaufstiege (`z, p, T, Td`) inkl. Erkennung von Inversionen und Gefrierregen-Warmnasen (`FZRA`).
- **Mehrkanal-Fernerkundungsoperatoren, Bord-X-Band-Wetterradar (`WXR`) & Strahlungsbilanz**: Berechnet Flüssigwasser-/Eiswasser-/Gesamtwasserpfad (LWP/IWP/TWP), kurzwellige Globalstrahlung am Boden, sphärische Wolkenalbedo, oberflächengekoppelten kurzwelligen Wolkenstrahlungseffekt ($\text{CRE}_{\text{SW}}$), Twomey-Strahlungsantrieb ($\Delta F_{\text{Twomey}}$), $10{,}8\text{-}\mu\text{m}$-Infrarot-Helligkeitstemperatur ($T_b$), Lidar-Rückstreuung mit Zweiwege-Beer–Lambert-Dämpfung und Depolarisationsverhältnis, bodengebundene S-Band-Radarreflektivität (dBZ) sowie ein **flugzeuggestütztes X-Band-Wetterradar ($9{,}3\text{ GHz}$, ARINC-708-Vierfarbstandard) mit Zweiwege-Regendämpfung und PAC-Abschattungswarnung**.
- **Flugmeteorologie für Tower, Flugdienstberatung (Dispatch) & Instrumentenanflug**:
  - **METAR / SPECI / TAF-Parser, Qualitätskontrolle (QC) & Szeneninversion**: Kompatibel mit ICAO Annex 3, WMO FM15/16 und CAAC-MPS-Konventionen (`KT`/`MPS`, `CAVOK`, Vertikalsicht `VVxxx`, Windscherung sowie mehrstufige `BECMG`/`TEMPO`/`FM`-TAF-Sichtweitenverläufe).
  - **VIS / RVR / CMV, Dreipunkt-Pisten-RVR (`TDZ / MID / END`) & ILS-$3^\circ$-Schrägsichtweite (`SVR`)**: Gemäß ICAO Doc 9365 und EASA AMC NCO.OP.110 (inkl. Prüfung der CMV-Ausschlusskriterien), Betriebsklassifikation `CAVOK / VMC / CAT-I / CAT-II / CAT-IIIA–C`, Echtzeit-Abtastung der Dreipunkt-RVR entlang einer $3{,}6\text{ km}$ langen Start- und Landebahn, Pfadintegration der **ILS-$3^\circ$-Schrägsichtweite (Slant Visual Range, SVR)** zur Prüfung der Sichtreferenz an der Entscheidungshöhe (`DH 200 ft / 100 ft`) sowie Gegen-/Rücken-/Seitenwindzerlegung.
  - **Hochplateau `QNH ↔ QFE`, Dichtehöhe (`DA`) & Tieftemperatur-Höhenmesserkorrektur**: Integrierte WGS-84-Flughafendatenbank mit Plateau- ($\ge 1524\text{ m}$) und Hochplateau-Klassifikation ($\ge 2438\text{ m}$), `QNH ↔ QFE`-Umrechnung, feuchtekorrigierter **Dichtehöhe (Density Altitude, DA)** samt Startrollstreckenzuschlag sowie **ICAO Doc 8168 (PANS-OPS)** Tieftemperaturkorrektur für DH/MDH.
  - **Flugzeugvereisung (`SLD`), Enteisungsvorhaltezeit (`ICAO Doc 9640 HOT`), Turbulenz (`EDR`) & bodennahe Windscherung (`LLWS`)**: Bewertung unterkühlter Großtropfen (SLD), **Vorhaltezeitfenster (Holdover Time, HOT)** für Typ-I/-II/-IV-Enteisungsflüssigkeiten gemäß **ICAO Doc 9640 / SAE ARP4737**, Wirbeldissipationsrate ($\text{EDR}$, $\text{m}^{2/3}\text{s}^{-1}$) und vertikale Windscherung im $0\text{–}500\text{-m}$-Anflugkorridor ($\text{kt/100ft}$).
  - **Ausweichflugplatz-Minima (`CCAR-121 / ICAO Annex 6`) & Ein-Bildschirm-Dispatch-Briefing**: Konsolidierte Freigabeübersicht (`RELEASE / CAUTION / HOLD`) für Flugdienstberater und Flugsicherung.
  - **Tiefflug-UAV / eVTOL-Flugtauglichkeit & Reiseflug-Kondensstreifen**: Bewertung von Rotorvereisung, Li-Po-Kältekapazitätsverlust, Wind-/Turbulenzgrenzen und optischer EO/IR-Transmission ($550\text{ nm}$ / $1550\text{ nm}$) im Höhenband $0\text{–}1000\text{ m AGL}$ (`GO / CAUTION / NO-GO`) sowie **Schmidt–Appleman-Kondensstreifenkriterium ($T_{\text{LM}}$), persistente ISSR-Zirren und Brunt–Väisälä-Stabilitätsfrequenz ($N_{\text{BV}}$) auf Reiseflughöhen (FL260–FL400)**.
- **Native Kompatibilität mit MATLAB / Simulink, CFD-Lösern & Vereisungscodes**:
  - **ABL-Windprofil & $k\text{–}\varepsilon$-Turbulenzeinströmung (`Atmosphere.windProfileAt`)**: Hellmann-Potenzgesetz, Ekman-Spirale, $(u, v, w)$, turbulente kinetische Energie $k(z)$, Dissipationsrate $\varepsilon(z)$, Luftdichte $\rho(z)$, $\theta(z)$ und spezifische Feuchte $q_v(z)$.
  - **FENSAP-ICE / NASA LEWICE 7-Klassen-Langmuir-Tropfenspektrum (`Physics.langmuirDropletSpectrum`)**: Medianer Volumendurchmesser ($\text{MVD}$), Langmuir-Gewichte, Trägheitsparameter $K_0$, Staupunkt-Auffangwirkungsgrad $\beta_0$ sowie Gefrieranteil und Eisregime (`RIME / MIXED / GLAZE`) nach Messinger (1953).
  - **Direktexport für Forschung & Ingenieurwesen**: Exportiert **MATLAB / Simulink / Aerospace Blockset Skripte (`.m`)**, **OpenFOAM 2.0 `ABLConditions` Randbedingungen (`.foam`)**, **ANSYS Fluent Profile & FENSAP-ICE Spektren (`.prof`)**, **ParaView / Tecplot / VisIt strukturierte 3D-VTK-Gitter (`.vtk`)**, **ICON-LES / WRF Fortran-Namelists (`.nml`)**, **CLOUDLAB Experiment-Manifeste (`.yaml`)** und **57-Schichten-Profil-CSVs**, ergänzt durch **Node-CLI (`tools/cli.js`)**, **Python-SDK (`sdk/cloudfield_sdk.py`)** und **MATLAB / GNU Octave SDK (`sdk/cloudfield_sdk.m`)**.

---

## 2. Schnellstart & Automatisierte Verifikation

```bash
# Variante A: Direkt öffnen (100 % offline, keine externen Abhängigkeiten)
# Einfach index.html in einem WebGL2-fähigen Browser öffnen (Chrome / Edge / Firefox / Safari)

# Variante B: Lokaler statischer HTTP-Server (umgeht etwaige file://-Einschränkungen)
python3 -m http.server 8080
# Anschließend http://127.0.0.1:8080/ aufrufen

# Optional: Kommandozeilen-Batchdiagnose & automatisierte Regressionstests (erfordert Node.js)
node tools/boot_test.js
node tools/occ_check.js
node tools/cli.js --preset cloudlab --format yaml
```

Es ist keine Internetverbindung erforderlich; es werden keinerlei Daten erhoben oder übertragen. Die Oberflächensprache wird oben rechts über `DE / EN / 中文` umgeschaltet (**Standard: Deutsch**), das Einheitensystem daneben über `Üblich / SI` (gespeichert in `localStorage`).

---

## 3. Zentrale Physikalische & Flugmeteorologische Gleichungen

| Größe / Modul | Gleichung / Beziehung | Erläuterung & Referenz |
| --- | --- | --- |
| Wolkentröpfchen-Extinktion | `β = 3·LWC / (2·ρ_w·r_e)` | Geometrisch-optische Basis in $\text{m}^{-1}$ (`1.5·LWC/r_e` für $\text{g/m}^3$ und $\mu\text{m}$) |
| Polydisperse Mie-Korrektur | `β = 1.5·LWC/r_e · (Q_ext(x, ν_eff)/2)` | Anomale Beugung nach van de Hulst + 5-Punkt-Gauss–Hermite-Quadratur (`js/mie.js`) |
| Regen- / Schnee-Extinktion | $\beta_{\text{rain}} = 0.21\times 10^{-3} R^{0.75}$, $\beta_{\text{snow}} = 1.25\times 10^{-3} R^{0.82}$ | Fallende Hydrometeore unterhalb der Wolkenbasis in $\text{m}^{-1}$ ($R$ in $\text{mm/h}$) |
| Meteorologische Sichtweite | `V = -ln(ε)/β`, $\varepsilon = 0{,}02$ | Koschmieder-Gesetz (`V ≈ 3.912/β`) |
| Warmregen-Autokonversion | Kessler-Schwelle / KK2000-Potenzgesetz / SB06-Spektral | 1-Moment- & 2-Moment-Autokonversion + Akkretion (`js/kessler.js`) |
| WBF-Dampfdruckdifferenz | $\Delta e_{wi}(T) = e_{s,w}(T) - e_{s,i}(T)$ | Murphy & Koop (2005); Maximum nahe $-12{,}5^\circ\text{C}$ ($\approx 0{,}268\text{ hPa}$) |
| Zweistrom-Strahlungsantrieb | $\alpha_{\text{all}} = R_c + \frac{T_c^2 \alpha_s}{1 - R_c \alpha_s}$, $\text{CRE}_{\text{SW}} = -S_0 \mu_0 (\alpha_{\text{all}} - \alpha_s)$ | Oberflächengekoppelter kurzwelliger Wolkenstrahlungseffekt & Twomey-Antrieb |
| Flugplatzdruck QNH ↔ QFE | $\text{QFE} = \text{QNH} \cdot \exp\left(-\frac{g \cdot h_{\text{elev}}}{R_d \cdot \bar{T}}\right)$ | Barometrische Druckumrechnung für Hochplateau-Flugplätze |
| Dichtehöhe (DA) | $\text{DA}_{\text{ft}} = \text{PA}_{\text{ft}} + 118.8 \cdot (T_v - T_{\text{ISA}})$ | Virtuelltemperaturkorrigierte ($T_v$) Startleistungs-Dichtehöhe |
| Tieftemperaturkorrektur | $\Delta H = H \cdot \frac{15 - T_0}{273.15 + T_0 - 0.5 L_0 (H + H_{\text{elev}})}$ | ICAO Doc 8168 (PANS-OPS) positive Höhenmesserkorrektur bei Kälte |
| Gleitpfad-Schrägsicht (SVR) | $\text{SVR}(H) = \frac{3.912}{\frac{1}{L_{\text{slant}}} \int_0^{L_{\text{slant}}} \beta(s)\,\mathrm{d}s}$ | Pfadintegrierte Schrägsichtweite entlang des ILS-$3^\circ$-Gleitpfads |
| Äquivalentpotentielle Temp. | $\theta_e = \theta_d \exp\left[\left(\frac{3.376}{T_{\text{LCL}}} - 0.00254\right) r_v (1 + 0.81\times 10^{-3} r_v)\right]$ | Feuchtadiabatische Erhaltungsgröße nach Bolton (1980) |
| Konvektive Energie (CAPE) | $\text{CAPE} = \int_{z_{\text{LFC}}}^{z_{\text{EL}}} g \frac{T_{v,p}(z) - T_{v,\text{env}}(z)}{T_{v,\text{env}}(z)}\,\mathrm{d}z$ | Virtuelltemperaturkorrigierte ($T_v$) Auftriebsintegration ($\text{J/kg}$) |
| Kondensstreifen-Schwelle | $G = \frac{\text{EI}_{\text{H}_2\text{O}} c_p p}{\varepsilon Q (1-\eta)}$, $T_{\text{LM}} = -46.46 + 9.43\ln(G-0.053) + 0.72[\ln(G-0.053)]^2$ | ICAO / WMO Schmidt–Appleman-Kriterium & ISSR-Persistenz |

Ausführliche Herleitungen und Parametrisierungstabellen finden sich in [`docs/methodology.md`](./docs/methodology.md), die Systemarchitektur in [`docs/architecture.md`](./docs/architecture.md).

---

## 4. Systemarchitektur, WebGL2-Renderer & Systemanforderungen

- **Dreischichtige Architektur**:
  1. **CloudField Core (Web Worker)**: Berechnet das grobe $16^3$-Occupancy-Gitter mit konservativer $3\times 3\times 3$-Nachbarschaftsdilatation (`R16F`-3D-Textur), sodass dünne Stratusränder beim Leerbereichssprung (Empty-Space Skipping) nicht abgeschnitten werden.
  2. **Volumetrischer WebGL2-Raymarching-Renderer (`js/clouds.js`)**: Kontinuierlicher Schrittweitenübergang, exakte optische Dickenintegration über die reale Segmentlänge, identisches 5-Oktaven-fBm-Rauschfeld mit Advektion (`p - uWind * uTime`) zwischen GPU-Shader und CPU-Diagnosemodulen, Schatten-Frühnebenabbruch sowie EMA-gesteuerte adaptive Auflösung ($0{,}55\text{–}1{,}5$ DPR) mit temporaler Kantenglättung (TAA).
  3. **Bridge Adapter (`bridge-adapter/server.js`)**: Optionaler eigenständiger Node.js-IPC-Prozess (ausschließlich mit Node-Bordmitteln `http` + `crypto`, ohne `npm install`) für REST-Schnittstellen (`/api/airports`, `/api/schema`, `/api/metar`, `/api/sessions`) und RFC6455-WebSocket-Synchronisation (`snapshot / delta / telemetry`).
- **Systemanforderungen**: Beliebiges Desktop- oder Mobilbetriebssystem mit **WebGL2-fähigem Browser** (Chrome/Edge 56+, Firefox 51+, Safari 15+). Minimum: Dual-Core-CPU, 4 GB RAM, integrierte WebGL2-GPU ($1280\times 720$). Empfohlen für flüssige 60 FPS: Quad-Core-CPU ab 3,0 GHz, ab 8 GB RAM, dedizierte oder aktuelle integrierte GPU (GTX/RTX, Radeon RX, Apple Silicon M-Serie) bei $1920\times 1080$ oder Retina/4K.

---

## 5. Lizenz- und Nutzungsbedingungen (Proprietär · Alle Rechte vorbehalten)

Diese Software ist **proprietär**; sämtliche Rechte verbleiben beim Urheberrechtsinhaber. Dieses öffentliche GitHub-Repository dient **ausschließlich der Versionsverwaltung, Sicherung und Einsichtnahme** und begründet keinerlei Nutzungslizenz oder öffentliche Genehmigung für Dritte. Maßgeblich ist der vollständige englische Lizenztext in [`LICENSE-TERMS.md`](./LICENSE-TERMS.md).

- **Schriftliche Nutzungsgenehmigung**: Für jegliche über die reine Ansicht hinausgehende Nutzung (Evaluierung, akademische Zitierung, Integration, Modifikation oder kommerzielle Lizenzierung) kontaktieren Sie bitte vorab schriftlich **zhangheinrich@foxmail.com**.
- **Kostenlose Nutzungsgenehmigung für Wissenschaft & Forschung (Deutschland, China, Frankreich)**: Für akademische und wissenschaftliche Forschungszwecke in **Deutschland, China (einschließlich Hongkong, Macau und Taiwan) und Frankreich**, bei denen die **vertikale (öffentliche) Projektförderung unter 30.000 USD (USD 30,000)** liegt, kann der Rechteinhaber **nach vorheriger ausdrücklicher schriftlicher Genehmigung eine kostenlose Nutzung** gewähren, unter der Bedingung:
  1. der **Zitierung dieses Projekts** in der resultierenden Arbeit sowie
  2. einer **schriftlichen Danksagung** an den Autor.
- **Sonstige Nutzungen**: Kommerzielle oder betriebliche Einsätze, Projekte mit einer Förderung ab 30.000 USD sowie Nutzungen in anderen Ländern/Regionen erfordern eine gesonderte schriftliche Vereinbarung.
- **Urheberrecht**: © 2026 **Tianyuan.J.Z (Zhang Heinrich)**. Alle Rechte vorbehalten (All Rights Reserved).

---

## 6. Offline-Erklärung, Wissenschaftliche Referenz & Danksagung

- **100 % Offline & Null Telemetrie**: Sämtliche Berechnungen erfolgen lokal im Browser ohne externe Schriftarten, CDN-Skripte oder Datenübertragungen.
- **Wissenschaftliche Referenz**: Inspiriert durch die **ETH Zürich CLOUDLAB**-Wolkenimpfexperimente und **ICON-LES**-Grobwirbelsimulationen — als echtzeitfähige, interaktive Browser-Diagnoseergänzung für Lehre, Sensitivitätsstudien, LES-Vorverarbeitung und flugmeteorologische Entscheidungsunterstützung bei geringer Sichtweite.
- **Danksagung**:
  - **MonikaSong G.C (Nanjing)** für die fachliche meteorologische Unterstützung.
  - **Alvin Lv** für die Unterstützung bei den Stabilitätstests.
  - **Huaneng Yuan** für die Unterstützung beim Testen.

---

*Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich) · 作者 / Authors / Autoren: Heinrich.Z & Tianyuan.J.Z · All Rights Reserved*
