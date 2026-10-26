# CloudField 方法学与物理规程说明

> 本文件对应软件内“说明”弹窗内容，作为可外发的开发文档。
> Copyright Tianyuan.J.Z© · 作者：Heinrich.Z & Tianyuan.J.Z

## 一、能见度与消光计算

- **消光系数**（单分散球滴近似）：`β = 3·LWC / (2·ρ_w·r_e)`，单位 m⁻¹。
  - LWC：液态水含量（kg/m³）；`ρ_w = 1000 kg/m³`；`r_e`：云滴有效半径（m）。
- **降雨与降雪下落粒子消光**（云顶至地面）：
  - 降雨消光（Marshall–Palmer 谱）：$\beta_{\text{rain}} = 0.21 \times 10^{-3} \cdot R^{0.75}\ \text{m}^{-1}$（$R$ 为地面雨强，单位 mm/h）；
  - 降雪消光（Sekhon–Srivastava 谱）：$\beta_{\text{snow}} = 1.25 \times 10^{-3} \cdot R^{0.82}\ \text{m}^{-1}$（$T \le 0^\circ\text{C}$ 时生效，相同水当量下降雪消光显著强于降雨）。
- **能见度**（Koschmieder 定律）：`V = -ln(ε)/β = ln(1/ε)/β`，对比阈值 `ε = 0.02`，即 `V ≈ 3.912/β`（单位 m）。
- **消光谱型**（Ångström）：`β(λ) = β(λ₀)·(λ₀/λ)^α`，`α≈0–2`；以 550nm 为基准。
- **密度场归一化**：`d = clamp(LWC / LWC_max, 0, 1) · noise`，`LWC_max = 1.2 g/m³`。
  云内 LWC 由归一化密度经验回推，用于驱动 β 与 V。

### 1.1 β 的单位换算链（两种写法）

`β = 3·LWC/(2·ρ_w·r_e)` 只在 LWC 取 kg/m³、r_e 取 m 时直接得到 m⁻¹。工程实现中 LWC 常用 g/m³、r_e 常用 µm，必须显式换算：

```
β [m⁻¹]  = 3 · LWC_kgm3 / (2 · ρ_w · r_e_m)
         = 3 · (LWC_gm3 / 1000) / (2 · 1000 · (r_e_um · 1e-6))
         = 1.5 · LWC_gm3 / r_e_um

β [km⁻¹] = 1000 · β [m⁻¹]
         = 1500 · LWC_gm3 / r_e_um
```

**数值核对**：`LWC = 0.3 g/m³`、`r_e = 8 µm` → `β = 1500×0.3/8 = 56.25 km⁻¹ = 0.05625 m⁻¹`。

**代码约定**：
- `js/atmosphere.js` 的 `betaFromLWC()` 返回 **km⁻¹**（系数 **1500**），供仪表盘与着色器使用；
- `js/physics.js` 的 `detailedAt()` 内部统一用 **m⁻¹**（系数 **1.5**），供 `visibilityFromExt()` 与光学厚度积分使用。
- 两者相差 1000，**不可互相替换**；换算关系为 `betaFromLWC() ≡ extinctionFromLWC()×1000`。

### 1.2 米氏与辐射查表

- **消光**：`js/mie.js` 用 van de Hulst 反常衍射近似 `Q_ext(ρ) = 2 − 4/ρ·sinρ + 4/ρ²·(1−cosρ)`（`ρ = 2x(n−1)`，`x = 2πr/λ`），在 `x∈[10⁻²,10³]` 对数网格上建表并插值；针对多分散 Gamma 粒径谱，`qextPolydisperse(x, veff)` 按有效方差 $\nu_{\text{eff}}$ 做 5 点高斯求积平滑反常衍射振荡，`β = 1.5·LWC/r_e · (Q_ext(x, \nu_{\text{eff}})/2)`。`x→∞` 时 `Q_ext→2`，回到几何光学。3D 着色器 `uLwcScale` 同步乘入该多分散 Mie 因子。
- **辐射**：`js/radiation.js` 用 Cahalan 保守散射反照率 `R₀ = τ/(τ + 4/(3(1−g)))` 加反射光子云顶趋肤深度饱和修正 $\tau_{\text{refl}} = \frac{\tau}{1 + \tau/45}$，确保 $\tau \to \infty$ 时厚云球面反照率收敛于物理渐近极限 $R_\infty > 0.80$ 而非归零；`Operators.irradiance()` 与 `cloudAlbedo()` 动态传入相态加权的 $\bar{\omega}_{\text{mix}}, \bar{g}_{\text{mix}}$。

## 二、云微物理参数化映射（多方案对比与 ETH CLOUDLAB 播云）

支持在三套经典参数化方案间实时切换与同屏对比（`STATE.micro.scheme`，实现于 `js/kessler.js`）：

1. **Kessler (1969) 单矩阈值方案（`kessler`）**
   - 自动转化率：`P_ac = k_1 · max(0, q_c − q_{c0})`
   - 碰并收集率：`P_gr = k_2 · q_c · q_r`
   - 特点：仅预报质量混合比 $q_c, q_r$，自动转化率与云滴数浓度 $N_c$ 无关（无法反映气溶胶增加抑制降水的 Albrecht 第二间接效应）。

2. **Khairoutdinov & Kogan (2000) 双矩大涡模拟方案（`kk2000`）**
   - 自动转化率：`P_ac = 1350 · q_c^{2.47} · N_c^{-1.79}`（$N_c$ 单位 $\text{cm}^{-3}$）
   - 碰并收集率：`P_gr = 67 · (q_c · q_r)^{1.15}`
   - 特点：无硬性阈值 $q_{c0}$，直接建立云滴数浓度 $N_c$ 对暖雨启动的幂律抑制（$N_c$ 越高，水汽被更多云滴平摊，单滴难以长到雨滴尺度，降水率显著下降）。

3. **Seifert & Beheng (2006) / ICON-LES 双矩谱宽耦合方案（`sb06`）**
   - 自动转化率：引入内禀时间尺度比 $\tau = \frac{q_r}{q_c + q_r} \in [10^{-6}, 0.99]$ 的普适加速函数 $\Phi_{au}(\tau) = 600 \cdot \tau^{0.68} (1 - \tau^{0.68})^3$，以及由半径有效方差 $\nu_{\text{eff}}$ 换算的质量分布形状参数 $\nu_m = \frac{1/\nu_{\text{eff}} - 5}{3} \in [0, 4]$，谱宽越宽自动转化越快。
   - 碰并收集率：`P_gr = k_{cc} · \rho · q_c · q_r · (\frac{\tau}{\tau + 5\times 10^{-4}})^4`。

4. **ETH CLOUDLAB 过冷层云催化播云（Wegener–Bergeron–Findeisen 两阶段冰化羽流）**
   - 物理机制：在过冷云层（$T(z) < 0^\circ\text{C}$ 硬性物理门控；暖云 $T \ge 0^\circ\text{C}$ 时冰晶融化、WBF 速率与消云量恒为 0）点源播撒人工冰核（`AgI` 碘化银成核阈值 $-5.0^\circ\text{C}$；液态 $\text{CO}_2$ 均质冻结阈值 $-0.5^\circ\text{C}$）。按 Murphy & Koop (2005) / Bolton 公式计算过冷水面与冰面饱和水汽压差 $\Delta e_{wi}(T) = e_{s,w}(T) - e_{s,i}(T)$ 及冰面过饱和度 $S_i(T) = (e_{s,w} - e_{s,i}) / e_{s,i}$（在 $-12.5^\circ\text{C}$ 达极大值 $\approx 0.268\text{ hPa}$），驱动 **WBF 水汽竞争过程**（`wbfRate` 与 `seedingPlumeAt`）。
   - 两阶段空间演变：`Atmosphere.seedingPlumeAt(x, y, z)` 区分近源端（$0\sim 2.5\text{ km}$，过冷水向新生柱状/板状冰晶转化，`iceBoost` 抬升冰相占比与激光雷达退偏色比，保留 $35\%$ 冰晶散射过渡）与中远端（$>2.5\text{ km}$，雪晶聚合沉降形成高能见度消云沟槽），并在 `Physics.seedingDiagnostics()` 中输出背景云与沟槽内的能见度增益倍数、$\Delta e_{wi}$、$S_i$ 及跑道 CAT-I（$\ge 550\text{ m}$）恢复判据。

5. **气溶胶-云滴数浓度活化耦合（CCN Activation）与云辐射效应诊断**
   - 开启 `micro.ccnCoupled` 时，`Atmosphere.operativeDropConc()` 按 Twomey / Abdul-Razzak 关系将气溶胶消光 `aerosol.beta0` 与对流上升速度 $w$ 无副作用地诊断为活化云滴数浓度 $N_c$（不覆写用户滑块基准值 `STATE.micro.dropConc`）。
   - `Operators.compute()` 分离純云光学厚度 $\tau_{\text{cloud}}$ 与气溶胶光厚，诊断柱积分液水路径 $\text{LWP}$、冰水路径 $\text{IWP}$、总水路径 $\text{TWP}$（$\text{g m}^{-2}$），并基于双流地表多次反射耦合行星反照率 $\alpha_{\text{all}} = R_c + \frac{T_c^2 \alpha_s}{1 - R_c \alpha_s}$ 计算短波云辐射效应 $\text{CRE}_{\text{SW}}$ 与相对清洁大陆基线（$N_0 = 80\text{ cm}^{-3}$）的 Twomey 第一间接强迫 $\Delta F_{\text{Twomey}}$（$\text{W m}^{-2}$）。

| 参数 | 当前值 | 对应方案参数 / 物理含义 |
|---|---|---|
| 微物理方案 `scheme` | `kessler` / `kk2000` / `sb06` | 切换单矩阈值、KK2000 双矩幂律、ICON-SB06 双矩谱宽耦合 |
| 云滴有效半径 r_e | 8 µm（fixed 基准） | 消光尺度；`derived` 模式下由 N 与 LWC 反推，实测谱模式下取积分矩 |
| 云滴数浓度 N | 300 cm⁻³ | Twomey 第一间接效应（N↑→r_e↓→β↑）+ KK2000/SB06 Albrecht 第二间接效应（N↑→P_ac↓） |
| 谱有效方差 ν_eff | 0.10 | 控制多分散 Mie 消光、SB06 形状参数 $\nu$ 及雷达反射率 6 阶矩放大因子 |
| 自动转化系数 k1 / 阈值 qc0 | 1.0×10⁻³ s⁻¹ / 5.0×10⁻⁴ kg/kg | Kessler `P_ac = k1·(q_c − qc0)` |
| 碰并系数 k2 | 2.2 | Kessler `P_gr = k2·q_c·q_r` |
| 冰相占比 / Korolev 自适应 | 0 / `autoPhaseTemp` | 侧栏与相态面板统一联动；开启 Korolev 模式后按 $0^\circ\text{C} \sim -38^\circ\text{C}$ 温度自动分配冰水比 |
| 播云冰核浓度 INP | 80 L⁻¹ | ETH CLOUDLAB 点源播撒冰核浓度，驱动 WBF 冰化速率与消云沟槽能见度增益 |

> 说明：`qc0` 取 0.5 g/kg（5.0×10⁻⁴ kg/kg）。Kessler 类方案的临界云水含量通常取 0.5–1 g/kg；5 g/kg 高于典型云水含量，作为“阈值”不合理，故不采用。

## 三、由密度场派生的三个量（与着色器逐条对应）

云内密度 `d` 是渲染量，物理量由它派生。下面三条公式在 `js/atmosphere.js` 与 `js/clouds.js` 中各写一份，**改一处必须同步另一处**：

| 量 | 公式 | 单位 |
|---|---|---|
| 液态水含量 | `LWC = min(1,d) · LWC_MAX · (冰相 ×0.4)` | g/m³ |
| 消光系数 | `β = 3·LWC/(2·ρ_w·r_e) = 1500·LWC/r_e` | km⁻¹（LWC 取 g/m³、rₑ 取 µm） |
| 有效半径（诊断派生） | `r_e = (3·LWC/(4π·ρ_w·N))^(1/3)` | µm（N 取 cm⁻³） |

r_e 的单一来源由 `micro.reMode` 决定：`derived`（默认）用 `effRadiusFromLWC(LWC,N)`，闭合 N→r_e→β 的 Twomey 链；`fixed` 用滑块值。仪表盘并列显示两者，便于比较参数化假设。

**温度/气压场视图**：沿射线**逐段累积**场色，权重 `w = 0.06/(1+0.05·t)` 随距离衰减，因此近处样本占主导、沿高度的连续梯度得以保留；云体样本（`d>0.02`）再按 `lightTransmittance` 额外加一层强调。`envCycle` 开启时地面温度按 180 s 周期 ±5 °C、RH ∓10%，温度/气压/露点/LCL 随之慢变。

**等值带 / 等值线**（默认开启，`STATE.fieldBand`）：俯视时环境场只随高度变化，任何“只按高度取值”的平滑着色必然整片同色——这是物理事实，不是渲染缺陷。因此额外提供一层地图式着色，取**代表高度**的场值：

| 情形 | 代表高度 `ry` | 说明 |
|---|---|---|
| 射线上有云（`d>0.02`） | 云顶高度 `hitY` | 随云顶起伏 → 产生水平差异 |
| 无云但透射率已降到 0.5 | 该处高度 `repY` | 可见深度 |
| 其余（晴空到底） | 地面 0 km | 暖端 |

按 `5 °C`（温度）/ `25 hPa`（气压）分档取带中心值着色，并用 `fwidth` 做屏幕空间抗锯齿的等值线；线色按底色亮度反转（暗底亮线、亮底暗线）。实测俯视下同一画面可比出 4 个以上温带（代表高度 0.75–4.5 km → 10.1 → −14.3 °C），云顶边界被等值线勾出。关闭该开关则退回纯累积的平滑着色。

> 曾尝试用“透射率加权平均”作分档依据，但距离权重衰减太慢，平均值恒为 −18 °C 左右（全图同档），已在实现中弃用并注明。

> 早期实现是“取第一个云样本就 `break`，再用单值覆盖整条射线”，无云像素全部取 `tempAt(uSliceAlt)` 同一个常数——画面顶部整片同色，表现为“温度和气压固定不变”。该做法已废弃。

**云体平流与生消**：`WIND_SCALE = 0.01` 把 m/s 换算为 km/s（物理值 0.001 的 10× 时间加速，沙盒演示用；改回 0.001 即物理实时）。3D 着色器与诊断侧 `sampleFields` 共用同一方向/尺度，覆盖率与密度再随 `life` 相位调制（约 ±15%，周期约 42 s），因此云层会明显平移、长出来/散掉。

**色标与归一化区间**（`js/colormap.js`，同一份定义导出成 LUT 给着色器）：

| 量 | 色标 | 区间 |
|---|---|---|
| LWC | 蓝→白→红（冷暖） | 0 – 1.5 g/m³ |
| β | viridis | 0 – 80 km⁻¹（常规场景覆盖） |
| rₑ | cividis | 2 – 25 µm |
| N | plasma | 0 – 1000 cm⁻³ |

> β 的 0–80 km⁻¹ 是**常规场景覆盖区间**，不是物理硬上限：`LWC_max = 1.2 g/m³`、`r_e = 8 µm` 时 β 可达 225 km⁻¹。超过 80 时着色会饱和（钳位到色标末端），此时应以数值读数为准。

**总云量口径**：`1 − Π(1 − 各层云量)`，各层随机重叠（相互独立）假设。既不是卫星反演的面积占比，也不是云光学厚度阈值统计，复现时需写清。

## 四、参照与方向

- **ETH CLOUDLAB / ICON-LES**：用大涡模拟（ICON-LES）复现播云实验，发现模拟冰晶增长比观测慢，做法是改参数化方案做敏感性试验——这正是 CloudField 能干的事。其重“慢而准”（Fortran，跑数小时到数天），本工具轻快（浏览器实时可调）。方向：把可调参数对应到具体参数化方案讲清楚，向“云微物理参数化的交互式诊断”靠拢。

## 五、集成架构

- 主线程只管渲染与 UI；所有外部通信走 **Bridge Adapter**（独立进程：WebSocket + REST）。
- 协议：JSON over WebSocket，三类消息——全量快照 `snapshot` / 增量 `delta` / 遥测 `telemetry`；delta 优先、固定步长、schema 版本化。
- 气象数据输入：METAR/SPECI/TAF（纯正则解析）、BUFR 探空与 GRIB2 网格场（服务端预解码）。

## 六、离线声明

所有计算在本地浏览器完成，不采集、不上传任何数据。VIS/RVR/CMV 转换遵循 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110（2024 第5版）。

## 七、VIS / RVR / CMV 转换与跑道风分解（民航工作流）

- **K 系数表**（CMV = VIS_met × K；夜间无灯光不适用）：

| 跑道灯光 | 白天 | 夜间 |
|---|---|---|
| HI 进近灯 + 跑道灯 | ×1.5 | ×2.0 |
| 其他灯光 | ×1.0 | ×1.5 |
| 无灯光 | ×1.0 | 不适用 |

- **禁止使用 CMV 的三种情况**：① 已有 RVR 直接观测报告；② 计算起飞最低标准；③ RVR 最低标准低于 800m。
- **运行类别预设与场景联动**：CAVOK / VMC / CAT-I(≥550m, Ceiling≥60m) / CAT-II(300–550m, Ceiling≥30m) / CAT-IIIA(175–300m) / CAT-IIIB(50–175m) / CAT-IIIC(0m)，支持与当前三维场景最差能见度及最低 BKN/OVC 云底高双向同步。
- **跑道三段式 RVR（TDZ / MID / END）监测**：沿 3.6 km 标准跑道轴线分别采样接地区（TDZ，$-1.5\text{ km}$）、中间段（MID，$0\text{ km}$）与停止端（END，$+1.5\text{ km}$）三组 RVR，支持局部平流雾或人工消雾作业下的非均匀跑道放行评估。
- **ILS $3^\circ$ 进近下滑道斜程能见度（SVR）与决断高（DH）目视判定**：沿 $3^\circ$ 下滑道从机头至接地区积分斜向路径消光 $\bar{\beta}_{\text{slant}}$，计算斜程能见度 $\text{SVR}$ 与斜程 RVR，评估飞行员在决断高（CAT-I DH=60m / CAT-II DH=30m）能否建立目视参考，识别辐射浅雾假象（高空看清地面、进近入雾失明）与低碎云陷阱。
- **跑道风分量分解与超限告警**：按跑道识别码（如 `27L` → 磁航向 $270^\circ$）分解顶风（Headwind）、顺风（Tailwind）与正侧风（Crosswind），当顺风 $>10\text{ kt}$ 或阵风侧风 $>20\text{ kt}$ 时触发超限提示。
- **机载 X 波段气象雷达（WXR）、飞机积冰（SLD）、湍流耗散率（EDR）与低空风切变（LLWS）**：
  - 机载 X 波段（9.3 GHz，ARINC 708 四色规范）计入双程雨衰 $k_{\text{X}} = 0.014 R^{1.15}\ \text{dB/km}$ 与 PAC 强回波后方雨衰阴影告警；
  - 在 $0 \sim -38^\circ\text{C}$ 过冷温区耦合过冷水含量（SLWC）、温度收集效率与过冷大水滴（$r_e > 12\ \mu\text{m}$）碰撞放大因子，评估积冰严重度（`NONE / LIGHT / MODERATE / SEVERE`）及人工播云冰化后的积冰消减幅度；
  - 输出国际民航标准湍流涡旋耗散率 $\text{EDR}$（$\text{m}^{2/3}\text{s}^{-1}$）与 $0\text{–}500\text{ m}$ 低空垂直风切变（$\text{kt/100ft}$）。
- **低空经济（UAV / eVTOL / 播云无人机）适航与光电吊舱（EO/IR）透过率评估**：针对 $0\text{–}1000\text{ m AGL}$ 低空作业走廊，计算无除冰碳纤维旋翼积冰风险（敏感度为运输机机翼的 $2.2$ 倍）、锂电池低温可用容量折减率（$<15^\circ\text{C}$ 线性衰减，$-10^\circ\text{C}$ 约折减 $40\%$）、$1\text{ km}$ 斜距可见光（$550\text{ nm}$）与短波红外（$1550\text{ nm}$）Beer–Lambert 透过率，综合给出 `GO / CAUTION / NO-GO` 适航判据。
- **高空巡航（FL260–FL400）Schmidt–Appleman 飞机凝结尾迹（Contrail）与静力稳定度判据**：按航空煤油（Jet-A1，$\text{EI}_{\text{H}_2\text{O}}=1.25\ \text{kg/kg}$，$Q=43.2\ \text{MJ/kg}$，推进效率 $\eta=0.35$）计算排气混合斜率 $G = \frac{\text{EI}_{\text{H}_2\text{O}} c_p p}{\varepsilon Q (1-\eta)}$（$\text{Pa/K}$）与 Schumann (1996) 临界温度 $T_{\text{LM}}$；当环境温度 $T_{\text{amb}} \le T_{\text{LM}}$ 且环境对冰相对湿度 $\text{RHi} \ge 100\%$ 时判定形成持续性人造卷云尾迹（Persistent Contrail Cirrus），同时输出巡航层位温 $\theta$ 与 Brunt–Väisälä 频率 $N_{\text{BV}} = \sqrt{\frac{g}{\theta}\frac{\partial \theta}{\partial z}}$。
- **MATLAB / Simulink 与主流 CFD / 结冰求解器（OpenFOAM / ANSYS Fluent / FENSAP-ICE / ParaView VTK）接口**：
  - **边界层风切变与 $k\text{–}\varepsilon$ 湍流廓线（`Atmosphere.windProfileAt`）**：结合 Hellmann 边界层幂律切变（$\alpha=0.16$）、北半球 Ekman 螺线顺转角 $\Delta\phi(z) = 20^\circ(1 - e^{-z/0.65\text{km}})$、摩擦速度 $u_*$ 与混合长 $l_m(z) = \frac{\kappa z}{1 + \kappa z/45}$，给出三维风矢量 $(u, v, w)$、湍流动能 $k(z)$、湍流耗散率 $\varepsilon(z) = C_\mu^{3/4} k^{3/2} / l_m$、位温 $\theta(z)$、比湿 $q_v(z)$ 与云水混合比 $q_c(z)$。
  - **FENSAP-ICE / NASA LEWICE 7-Bin Langmuir 液滴谱与前缘收集效率（`Physics.langmuirDropletSpectrum`）**：由有效半径 $r_e$ 与谱有效方差 $\nu_{\text{eff}}$ 计算中值体积直径 $\text{MVD} = 2 r_e (1 + 1.15\nu_{\text{eff}})$、Langmuir-D 7 档液滴分布（权重 $0.03, 0.08, 0.15, 0.48, 0.15, 0.08, 0.03$）、修正惯性参数 $K_0$、前缘驻点收集效率 $\beta_0 = \frac{1.40(K_0 - 1/8)^{0.84}}{1 + 1.40(K_0 - 1/8)^{0.84}}$ 及 Messinger (1953) 冻结分数 $f_{\text{freeze}}$。
  - **原生格式导出**：提供 MATLAB `.m` 工作区结构体脚本（`toMATLABScript`）与 `sdk/cloudfield_sdk.m`、OpenFOAM `ABLConditions` 入口字典（`toOpenFOAM`）、ANSYS Fluent `.prof` 边界廓线（`toFluentProfile`）及 ParaView / Tecplot 三维结构化网格 `.vtk`（`toVTK3D`）。

## 八、坐标系、机场表、高原 QFE/QNH、密度高度（DA）与低温高度表修正

- WGS-84 经纬度；海拔为场压面近似，EGM96 大地水准面偏移由 `Coord.geoidOffset` 占位（可由 Bridge 提供网格）。
- 米 ↔ 百英尺：`1×100ft = 30.48 m`。
- **高原与高高原机场 QNH ↔ QFE 换算**：按机场标高 $h_{\text{elev}}$ 与地面温度 $T_0$ 执行压高互逆换算 $\text{QFE} = \text{QNH} \cdot \exp\left(-\frac{g \cdot h_{\text{elev}}}{R_d \cdot \bar{T}}\right)$，并自动标注一般高原机场（$\ge 1524\text{ m}$）与高高原机场（$\ge 2438\text{ m}$）。
- **密度高度（Density Altitude，DA）与虚温修正**：计算气压高度 $\text{PA}_{\text{ft}}$ 与水汽虚温 $T_v$，按 $\text{DA}_{\text{ft}} = \text{PA}_{\text{ft}} + 118.8 \cdot (T_v - T_{\text{ISA}})$ 输出密度高度、相对空气密度比 $\sigma = \rho/\rho_0$ 及起飞滑跑距离增量百分比。
- **ICAO Doc 8168 (PANS-OPS) 低温气压高度表修正**：当机场地面温度低于标准大气（ISA）时，计算决断高（DH/MDH）的低温高度正修正量 $\Delta H = H \cdot \frac{15 - T_0}{273.15 + T_0 - 0.5 L_0 (H + H_{\text{elev}})}$。
- 中国民航机场表为校核子集（63 个），完整 ~250 由 Bridge 经 `/api/airports` 提供，`loadAirportTable` 可注入。

## 九、已知限制

当前模型的物理近似与工程边界如下：

1. **微物理演进为单柱 0D + 解析平流羽流**：Kessler / KK2000 / ICON-SB06 降水预报按云层各取一个 0D 控制体，ETH CLOUDLAB 播云消散沟槽采用顺风向高斯平流扩散解析式，非三维欧拉网格 Navier–Stokes 大涡求解器。
2. **米氏为反常衍射 + 5 点谱宽求积近似**：`Q_ext` 查表结合有效方差 $\nu_{\text{eff}}$ 5 点高斯求积平滑，非完整 BHMIE 逐阶 Legendre 级数。
3. **辐射为双流查表**：Cahalan 反照率 + 吸收修正，非逐波长、多流辐射传输。
4. **相态质量消光为相对效率因子**：`PHASE_EXT` 为经验因子，非非球形冰晶（六棱柱/枝状晶）T-Matrix 散射查表。
5. **雷达/激光/卫星为经验算子**：dBZ 已引入 Gamma 谱 6 阶矩谱宽放大因子，但仍属瑞利散射近似，未含米氏衰减与真实传感器响应函数。
6. **β 色标上限为常规覆盖**：0–80 km⁻¹，高 LWC 时会饱和，以数值读数为准。
7. **LCL 为解析近似**：`z_LCL = (T−Td)/Γ_d`，未含夹卷与潜热细节。
8. **云场为程序化**：密度由噪声 + 风平流 + 生命周期调制 + WBF 播云消散沟叠加，不是三维动力预报场；平流采用 `WIND_SCALE=0.01` 的 10× 时间加速（沙盒演示），温度/气压是环境场（可用 `envCycle` 做 180 s 慢变）。其视图有两种着色：纯累积（保留垂直梯度）与**等值带/等值线**（按代表高度分档，俯视可辨云顶高低）；两者都是“高度→场值”的映射，晴空同高度区域仍必然同色。

**敏感性热力图的可用性约束**（否则会出现“整张图只有条纹/单色”的假象）：被扫参数必须在当前状态下参与计算，因此

- `micro.effRadiusUm` 在 `derived` 模式下由 `operativeRe()` 忽略 → 扫描期间临时切 `reMode='fixed'`，结束后回滚；
- `aerosol.*` 在 `on=false` 时恒为 0 → 扫描期间临时开启；
- `seeding.inpConc` 在 `seeding.on=false` 时不生效 → 扫描期间临时开启播云并取羽流轴线代表点；
- `spectrum.veff` 通过多分散 Mie 求积与雷达 6 阶矩参与消光与雷达算子；
- 采样时间取**当前仿真时间**（写死 `t=0` 会让 `windSpeed` 永远无效）；
- 覆盖类参数必须**逐点重取** `effectiveLayers()`（在循环外取一次会冻结覆盖率）；
- 配色按本次网格值域归一化（跨度 >20 倍时取对数），否则能见度 100–160 m 的差异只占绝对色带 4%，看起来是同色。

上述项如需进入业务或论文级使用，应作为独立里程碑实现，而不是在现有近似上继续叠加。

## 十、鸣谢

感谢 **MonikaSong G.C（南京）** 提供专业知识支持。

感谢 **Alvin Lv** 提供稳定性测试协助。

感谢 **Huaneng Yuan** 提供测试协助。
