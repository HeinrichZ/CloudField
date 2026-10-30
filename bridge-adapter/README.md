# CloudField Bridge Adapter

> 独立的 IPC 进程，承载 CloudField 与外部系统（仿真引擎 / 气象数据源 / 多节点）之间的全部通信。
> **纯 Node 内置模块实现（http + crypto），无需 `npm install`。**
>
> Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich) · 作者：Heinrich.Z & Tianyuan.J.Z · All Rights Reserved（详见 [`../LICENSE-TERMS.md`](../LICENSE-TERMS.md)）

---

## 1. 为什么是独立进程

主线程只负责渲染与 UI；所有外部通信走 Bridge，避免把网络/协议耦合进浏览器内核。架构上分为：

- **CloudField Core**：Web Worker，计算密度粗网格（occupancy）。
- **Renderer**：主线程 WebGL 渲染。
- **Bridge Adapter**：本进程（WebSocket + REST + 气象解析 + 会话落盘）。

---

## 2. 运行

```bash
cd bridge-adapter
node server.js
# 可选：自定义端口
PORT=8787 node server.js
```

启动后打印：

- `REST  : http://127.0.0.1:8787`
- `WS    : ws://127.0.0.1:8787`

---

## 3. REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/airports` | 返回中国民航机场表（本仓库为校核子集，可补齐至 ~250） |
| GET | `/api/schema` | 返回参数 Schema（含路径、范围、单位，对应 `Atmosphere.STATE`） |
| POST | `/api/metar` | 服务端解析 METAR，返回解析结果与映射后的 scene |
| GET/POST | `/api/sessions` | 列出 / 保存实验会话（符合 `integration_plan` 第四部分 Schema） |
| GET | `/api/sessions/:id` | 取回单条会话 |

示例：

```bash
curl -X POST http://127.0.0.1:8787/api/metar \
  --data "METAR ZBAA 141050Z 24015G28KT 0800 +TSRA BR FEW012CB BKN020 12/M01 Q1003"
```

---

## 4. WebSocket 协议（Delta）

传输 JSON over WebSocket（RFC6455，本仓库手写最小实现，无 `ws` 依赖）。三类核心消息：

- **snapshot**：连接建立后首帧全量场景；`{type:'snapshot', schemaVersion, scene}`
- **delta**：增量变更，固定步长、schema 版本化；`{type:'delta', changes:{...}}`（支持点路径如 `wind.speed`、`visibility.value`）
- **telemetry**：遥测（当前能见度、fps、quality 等）

附加：`request_snapshot`（请求全量）、`metar_submit`（提交并可选 autoApply）、`ping/pong`（30s 心跳）、`playback`（回放控制）。

客户端示例（浏览器侧见 `js/integration.js` 的 `Bridge` 模块；Node 侧见本仓库测试片段）。

---

## 5. 气象数据解码

- **METAR/SPECI/TAF**：浏览器侧（`js/integration.js`，完整正则）与 Bridge 侧（`server.js`，服务端紧凑版）均实现，覆盖风/能见度/RVR/天气/云/温湿/气压/TREND。
- **BUFR（探空）**：生产路径应使用 `eccodes` / `bufrjs` 在服务端解码，再经 REST/WS 推送给客户端。本仓库提供解析**接口约定**与 CSV/JSON 探空导入（见 `js/atmosphere.js` 的 `validateAgainstRadiosonde`）。
- **GRIB2（网格场）**：同样服务端预解码为网格 JSON 后下发，避免浏览器直接解析二进制 GRIB2。

---

## 6. 文件

| 文件 | 职责 |
|---|---|
| `server.js` | HTTP REST + 手写 WebSocket + 遥测广播 + 会话落盘 |
| `schema.js` | 参数 Schema（映射到 `Atmosphere.STATE`） |
| `airports_cn.js` | 中国民航机场表（WGS-84，校核子集，可补齐至 ~250） |
| `package.json` | 零依赖，仅声明 `node>=16` 与启动脚本 |

---

*© Tianyuan.J.Z · 作者 Heinrich.Z & Tianyuan.J.Z*
