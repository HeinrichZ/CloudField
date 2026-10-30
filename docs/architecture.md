# CloudField 系统架构

> Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich) · 作者：Heinrich.Z & Tianyuan.J.Z · All Rights Reserved（详见 [`../LICENSE-TERMS.md`](../LICENSE-TERMS.md)）

## 总览

```
┌──────────────────────────────────────────────────────────────┐
│ 浏览器（CloudField 主程序，纯前端离线运行）                    │
│                                                                │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐  │
│  │ CloudField    │   │  Renderer      │   │  Integration    │  │
│  │ Core (Worker) │   │  (主线程 WebGL) │   │  (METAR/VIS/    │  │
│  │ 密度粗网格    │──▶│  体积云渲染     │   │   机场/Bridge/  │  │
│  │ occupancy     │   │  TAA/空跳      │   │   回放 UI)      │  │
│  └──────────────┘   └────────────────┘   └─────────────────┘  │
│         │                      │                    │         │
│         └──────────────────────┼────────────────────┘         │
│                        主循环 / STATE（Atmosphere）            │
└──────────────────────────────────────────────────────────────┘
            │  WebSocket (Delta / Snapshot / Telemetry)  ▲ REST JSON
            ▼                                            │
┌──────────────────────────────────────────────────────────────┐
│ Bridge Adapter（独立进程，Node，纯内置模块）                    │
│  · REST: /api/airports /schema /metar /sessions               │
│  · WS:   snapshot / delta / telemetry / ping-pong             │
│  · 气象解析（METAR/BUFR/GRIB2 预解码）、多节点同步、会话落盘    │
└──────────────────────────────────────────────────────────────┘
```

## 分层职责

1. **CloudField Core（Web Worker）**：计算密度粗网格（occupancy 3D 纹理），与渲染解耦，更新/渲染分离。由 `clouds.js` 内联 Blob Worker 实现，兼容 `file://`。
2. **Renderer（主线程）**：WebGL 体积云渲染。性能地基——
   - early ray termination（透射率 `<0.003` 早停）；
   - ray jitter + TAA（相机静止累积，移动即重置）；
   - 空区间跳过（occupancy 3D 纹理，密度低于阈值的大步长）；
   - 自适应 pixelRatio（`quality` 联动）；
   - 三趟渲染（scene → TAA blend → copy）。
3. **Integration（主线程 UI 层）**：四层集成界面（METAR/TAF、VIS-RVR-CMV、机场表、Bridge、事件录制/回放），详见 `js/integration.js`。
4. **i18n（横切层，主线程）**：`js/i18n.js` 集中管理三语（中文/英文/德文，默认德文）词典与 `I18N.t()`；静态文案用 `data-i18n` 标注，切换语言经 `I18N.onLangChange` 重建 GUI / Monitor 动态项 / Integration 面板。所有 UI 模块的可见文案均经 `t()` 取词。业务数据的三语映射（ICAO 现在天气代码描述 `WX_DESC`、机场名 `AP_NAMES`）位于 `js/integration.js`，解析/渲染期按当前语言取值，机场搜索跨语言命中；Bridge 注入的未知机场回退行内 `name`。语言入口在顶栏分段控件，不进参数面板。
5. **Units（横切层）**：`js/units.js` 管单位体系（常用 / SI）。物理计算内部固定用 °C / hPa / km / m·s⁻¹，**只在显示层换算**，STATE 里不会出现两套数；切换经 `Units.onChange` 触发控制面板与监控栏重建。
6. **CMap（横切层）**：`js/colormap.js` 定义每个物理量自己的色标与归一化区间，并导出 256×1 LUT 纹理给着色器——3D 云体、水平切片、图例色标条共用同一份定义，不会各画各的。
7. **SliceAxis（视口叠加）**：`js/sliceaxis.js` 可拖拽剖面高度轴，拖动手柄改写 `STATE.sliceAlt`，着色器据此在云场里画高亮水平线；轴上另有只读的最低能见度高度标记。
8. **Bridge Adapter（独立进程）**：所有外部通信的唯一出口/入口（WebSocket + REST + 气象解析 + 会话落盘）。

## 状态与数据流

- 唯一真相源：`Atmosphere.STATE`（全部可调、可序列化）。
- 参数变化 → `GUI` 通知 → `onChange` → 重置 TAA + 防抖重算 occupancy → 渲染。
- 外部 delta/snapshot → Bridge → `Integration.Bridge.applySnapshot/applyDelta` → 改写 STATE → 刷新 UI。

## 渲染性能开关（常量）

- `OCC_DIM=16, OCC_DOM=40, OCC_EPS=0.03`（occupancy 纹理维度/域/阈值）；
- 步进数与像素比由 `quality` 控制；TAA 累积帧上限保护。

## 空区间跳步的三条硬约束

密度粗网格只是加速结构，不能改变画面。相关约束见 README 第 8 节，要点：

- occ 出 worker 前先做一邻域膨胀，保证“判空”是保守结论；
- 步长随 occ 连续过渡，不做 `occ < ε` 一刀切；
- 光学厚度按样本实际代表的段长 `step` 结算，不能写死 `stepSize`。

## 可信度呈现

- 底部垂直廓线图为**主导读图窗口**（占宽最大），实时读数收成仪表卡，模拟状态单独一栏。
- 右侧“能见度诊断仪表盘”分三个 Tab：读数（β/LWC/rₑ/N + 历史曲线 + 快照叠加）/ 公式（每条公式附当前数值代入）/ 色标（各量色标条 + 当前值指针）。
- 聚合指标一律标注计算口径（如总云量 = 1 − Π(1 − 各层云量)，随机重叠假设）。
