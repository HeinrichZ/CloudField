/* i18n.js — CloudField 三语（中文 / 英文 / 德文）国际化层
 * 默认语言：德文（de）。提供菜单勾选切换，选择持久化到 localStorage。
 * 用法：
 *   I18N.t('key', {var})        // 取当前语言字符串，支持 {var} 插值
 *   I18N.setLang('en')          // 切换语言并触发全局刷新
 *   I18N.getLang()              // 当前语言代码
 *   I18N.onLangChange(fn)       // 订阅语言切换（各 UI 模块据此重建）
 *   I18N.apply(root)            // 将 data-i18n / data-i18n-attr 应用到 DOM
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  // 支持的语言（菜单顺序）
  const LANGS = [
    { code: 'zh', name: '中文' },
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
  ];
  const DEFAULT_LANG = 'de';          // 默认系统语言：德文
  const STORAGE_KEY = 'cloudfield.lang';

  // ---------------- 词典 ----------------
  // 每个键三语齐备；缺失时回退到默认语言，再回退到键本身。
  const DICT = {
    zh: {
      // 应用外壳
      'app.title': 'CloudField · 云微物理参数化交互式诊断工具 — © Tianyuan.J.Z',
      'app.subtitle': '云微物理参数化交互式诊断工具',
      'offline.banner': '🔒 离线运行：所有计算在本地浏览器完成，不采集、不上传任何数据',
      'footer.copy': '纯前端离线运行 · © Tianyuan.J.Z',
      'lang.title': '语言',
      'lang.zh': '中文', 'lang.en': 'English', 'lang.de': 'Deutsch',

      // HUD
      'hud.cameraAlt': '相机高度',

      // 视角按钮
      'view.persp': '透视', 'view.top': '顶视', 'view.side': '侧视', 'view.front': '前视',

      // 加载
      'loading.init': '正在初始化场景…',
      'loading.initFail': '初始化失败：{msg}',
      'loading.renderErr': '渲染错误：{msg}',
      'loading.consoleHint': '完整错误详情请打开浏览器控制台查看（按 F12 → Console）。',

      // 能见度仪表盘
      'dash.title': '能见度诊断仪表盘',
      'dash.collapse': '收起 ▾', 'dash.expand': '展开 ▸',

      // 底部监控
      'mon.profile': '大气垂直廓线',
      'mon.profile.note': '红=温度 / 蓝=露点 / 绿=饱和区',
      'mon.section': '水平切片',
      'mon.section.note': '切片高度可调 · 显示当前可视场',
      'mon.readouts': '实时气象读数',
      'mon.status': '模拟状态',

      // 弹窗标题
      'modal.validate': '探空验证（模型 vs 观测）',
      'modal.integration': '气象数据接口 · 集成',

      // 工具栏
      'tb.play': '播放/暂停模拟',
      'tb.resetView': '重置视角', 'tb.resetView.tip': '恢复默认相机',
      'tb.resetParams': '重置参数', 'tb.resetParams.tip': '恢复全部默认参数',
      'tb.snapshot': '保存快照', 'tb.snapshot.tip': '把当前最差能见度标记为对比实验点',
      'tb.export': '导出JSON', 'tb.export.tip': '导出当前参数（带版本号）',
      'tb.import': '导入JSON', 'tb.import.tip': '导入参数快照',
      'tb.validate': '探空验证', 'tb.validate.tip': '用探空样本验证能见度',
      'tb.integration': '数据接口', 'tb.integration.tip': 'METAR / VIS-RVR-CMV / 机场 / Bridge',
      'tb.docs': '说明', 'tb.docs.tip': '打开可信度说明文档',
      'btn.play': '▶ 播放模拟', 'btn.pause': '⏸ 暂停模拟',

      // 控制分组
      'grp.scene': '场景参数', 'grp.layers': '云层配置',
      'grp.sim': '模拟与演进', 'grp.advanced': '高级（直接改字段）', 'grp.const': '常量与阈值',
      'grp.view': '可视化与诊断',

      // 顶栏
      'unit.common': '常用', 'unit.si': 'SI',
      'tab.read': '读数', 'tab.formula': '公式', 'tab.scale': '色标',
      'ctrl.range': '有效范围',

      // 罗盘（风向）
      'compass.n': '北', 'compass.e': '东', 'compass.s': '南', 'compass.w': '西',
      'compass.ne': '东北', 'compass.se': '东南', 'compass.sw': '西南', 'compass.nw': '西北',
      'compass.from': '风自 {pt} 来',

      // 可视化与诊断
      'adv.tintField': '微物理着色叠加', 'adv.tintField.tip': '在真实云体上叠加一层半透明物理量着色（教学/诊断用）',
      'adv.tintAmt': '叠加不透明度', 'adv.tintAmt.tip': '0 = 纯真实云，1 = 纯物理量色',
      'adv.slice': '3D 剖面高度线', 'adv.slice.tip': '在云场中画出切片高度所在的高亮水平线',
      'tint.off': '关闭', 'tint.lwc': '云水 LWC', 'tint.beta': '消光 β', 'tint.re': '有效半径 rₑ',
      'cmap.lwc': '云水含量 LWC', 'cmap.beta': '消光系数 β', 'cmap.re': '有效半径 rₑ',
      'cmap.Nd': '滴数浓度 N', 'cmap.temp': '温度', 'cmap.pres': '气压', 'cmap.density': '云密度',
      'leg.normNote': '归一化区间 {lo}–{hi} {unit}，超出区间按端点截断',
      'mon.sliceMark': '切片',
      'sim.evolving': '云场正在随时间演化', 'sim.frozen': '已冻结（参数可改，画面不推进）',
      'dash.reDeriv': '（由 LWC,N 反推 {v} µm）',
      'dash.coverBasis': '口径：总云量 = 1 − Π(1 − 各层云量)，按各层随机重叠（相互独立）合成。不是卫星反演的面积占比，也不是云光学厚度阈值统计。',
      'dash.scaleBasis': '色标口径：每个物理量各有自己的色标与归一化区间，超出区间按端点截断；白色指针为当前值在区间中的位置。',
      'axis.title': '剖面高度',

      // 场景参数
      'p.surfTemp': '地面温度', 'p.surfTemp.tip': '近地面气温，决定整层温度廓线',
      'p.surfPres': '地面气压', 'p.surfPres.tip': '海平面订正前的地面气压',
      'p.surfRH': '地面相对湿度', 'p.surfRH.tip': '决定露点/凝结高度（LCL）',
      'p.lapse': '温度直减率', 'p.lapse.tip': '环境温度随高度递减率',
      'p.dewLapse': '露点直减率', 'p.dewLapse.tip': '露点随高度递减率',
      'p.dryLapse': '干绝热直减率', 'p.dryLapse.tip': 'LCL 计算用的干绝热直减率（默认 9.8 K/km，与环境直减率语义不同）',
      'p.envCycle': '环境日变化', 'p.envCycle.tip': '180 s 周期：地面温度 ±5 °C、相对湿度 ∓10%，使温度/气压/湿度在演进中变化',
      'p.windSpeed': '风速', 'p.windSpeed.tip': '风平流漂移速度',
      'p.windDir': '风向(来向)', 'p.windDir.tip': '风的来向（气象惯例）',
      'p.sunElev': '太阳高度角', 'p.sunElev.tip': '太阳高度，影响光照方向',
      'p.sunAz': '太阳方位角', 'p.sunAz.tip': '太阳方位，影响光照方向',

      // 云层控件
      'layer.top': '顶高', 'layer.top.tip': '云层上界高度（km）',
      'layer.base': '底高', 'layer.base.tip': '云层下界高度（km）',
      'layer.enable': '{name} · 启用',
      'layer.coverage': '覆盖度', 'layer.coverage.tip': '云量覆盖比例（0–1）',
      'layer.density': '厚度/密度', 'layer.density.tip': '不透明度/光学厚度系数',
      'layer.scale': '水平尺度', 'layer.scale.tip': '云块水平尺度（越大越蓬松）',
      'layer.detail': '细节', 'layer.detail.tip': '高频细节强度',

      // 模拟与演进
      'sim.autoLife': '自动生命周期（生消循环）', 'sim.autoLife.tip': '云体自动生消循环',
      'sim.lifePhase': '生命周期相位(手动)', 'sim.lifePhase.tip': '手动控制生消阶段',
      'sim.cape': '对流强度 CAPE', 'sim.cape.tip': '驱动积云/积雨云向上发展（=CAPE 代理）',
      'sim.speed': '时间流速', 'sim.speed.tip': '模拟时间推进倍率',

      // 高级
      'adv.viewMode': '视图模式', 'adv.viewMode.tip': '切换可视化场',
      'adv.band': '等值带/等值线', 'adv.band.tip': '温度/气压视图按 5 °C / 25 hPa 分档并画出等值线；俯视时也能看出云顶造成的空间差异',
      'adv.sliceAlt': '水平切片高度', 'adv.sliceAlt.tip': '水平切片所处高度',
      'adv.sun': '太阳光照', 'adv.sun.tip': '是否渲染太阳',
      'adv.grid': '地面网格标尺', 'adv.grid.tip': '是否显示地面 km 网格',
      'adv.quality': '渲染质量', 'adv.quality.tip': '影响步进数与像素比（性能↔画质）',

      // 常量与阈值
      'const.re': '云滴有效半径 r_e', 'const.re.tip': 'Kessler/散射谱型关键参数，决定消光与能见度',
      'const.reMode': 'r_e 由 N 与 LWC 反推', 'const.reMode.tip': '开启后闭合 Twomey 链（N↑→r_e↓→消光↑→能见度↓）；关闭则使用上面的 r_e 滑块值',
      'const.N': '云滴数浓度 N', 'const.N.tip': 'Twomey 效应：N↑→r_e↓→消光↑',
      'const.k1': '自动转化 k1', 'const.k1.tip': 'Kessler 自动转化系数（雨滴形成）',
      'const.qc0': '转化阈值 qc0', 'const.qc0.tip': 'Kessler 临界云水含量（kg/kg）',
      'const.k2': '碰并系数 k2', 'const.k2.tip': 'Kessler 碰并（accretion）系数',
      'const.ice': '冰相占比', 'const.ice.tip': '混合相/冰云分支占比（影响消光谱型）',

      // 视图模式选项
      'vm.real': '真实云', 'vm.temp': '温度场', 'vm.pressure': '气压场',
      'vm.water': '含水量', 'vm.coverage': '覆盖率',

      // 提示/错误
      'alert.importFail': '导入失败：{msg}',
      'alert.exportFail': '导出失败（请确认浏览器支持 {type}）',

      // 实时读数
      'ro.base': '云底高度', 'ro.top': '云顶高度', 'ro.lcl': 'LCL',
      'ro.zero': '0°C 层', 'ro.surfTemp': '地面温度', 'ro.surfPres': '地面气压',
      'ro.surfRH': '地面湿度', 'ro.maxLWC': '最大含水量', 'ro.cover': '总云量',
      'ro.precip': '降水概率', 'ro.convection': '对流强度', 'ro.wind': '风速/向',

      // 模拟状态
      'sim.run': '运行中', 'sim.pause': '已暂停',
      'sim.time': '模拟时间', 'sim.life': '生命周期',
      'sim.stage0': '初生', 'sim.stage1': '发展', 'sim.stage2': '旺盛', 'sim.stage3': '消散',
      'sim.convGain': '对流增益', 'sim.timeSpeed': '时间流速',

      // 图例
      'leg.temp': '温度', 'leg.pressure': '气压', 'leg.water': '含水量',

      // 能见度仪表盘读数
      'dash.worst': '最差能见度 · 云内 @ {alt} km',
      'dash.infinite': '∞ (晴空)',
      'dash.visFormula': '能见度 V = ln(1/ε) / β　(Koschmieder, ε=0.02)',
      'dash.densityFormula': '密度归一化：d = clamp(LWC/LWC_max,0,1)·noise，LWC_max={max} g/m³',
      'dash.beta': '消光 β', 'dash.lwc': '云水 LWC', 'dash.re': '有效半径 r_e', 'dash.N': '滴数浓度 N',
      'dash.rain': '雨强 R', 'dash.qr': '雨水 q_r', 'dash.temp': '温度 T', 'dash.dew': '露点 Td', 'dash.pres': '气压 P',
      'kes.on': 'Kessler 单柱预报（q_c/q_r）', 'kes.on.tip': '按层积分自动转化与碰并，输出雨强；不反馈 3D 渲染',
      'kes.reset': '重置 Kessler 状态', 'kes.reset.tip': '清空 q_c/q_r 与雨强',
      'dash.snapEmpty': '暂无对比快照（在“场景参数”中保存快照即可叠加）',
      'dash.formulaTitle': '采用公式（可写进方法章节）',
      'dash.fNote': '注：本工具用单分散球滴近似；r_e、N 对应于云微物理参数化的诊断输入。',

      // 说明弹窗（methodology）
      'doc.h1': '一、能见度与消光（可验证核心）',
      'doc.p1': '消光系数（单分散球滴近似）：β = 3·LWC / (2·ρ_w·r_e)，单位 m⁻¹。其中 LWC 为液态水含量（kg/m³），ρ_w=1000 kg/m³，r_e 为云滴有效半径（m）。',
      'doc.p2': '能见度（Koschmieder 定律）：V = -ln(ε)/β = ln(1/ε)/β，对比阈值 ε=0.02（即 V≈3.912/β）。',
      'doc.p3': '消光谱型（Ångström）：β(λ) = β(λ₀)·(λ₀/λ)^α，α≈0–2；本工具以 550nm 为基准。',
      'doc.p4': '密度场归一化：归一化密度 d = clamp(LWC / LWC_max, 0, 1) · noise，LWC_max={max} g/m³；云内 LWC 由归一化密度经验回推，用于驱动 β 与 V。',
      'doc.h2': '二、云微物理参数化映射（诊断叙事）',
      'doc.p5': '本工具的可调参数刻意对应到经典参数化方案的“哪些参数”，以便写进论文方法章节、做敏感性试验。当前默认方案：{scheme}',
      'doc.th.param': '参数', 'doc.th.value': '当前值', 'doc.th.mapsTo': '对应方案参数 / 物理含义',
      'doc.h3': '三、参照与方向',
      'doc.p6': 'ETH CLOUDLAB / ICON-LES：他们在用大涡模拟（ICON-LES）复现播云实验，发现模拟冰晶增长比观测慢，做法是改参数化方案参数做敏感性试验——这恰恰是本工具能干的事。其重“慢而准”（Fortran，跑数小时到数天），本工具轻快（浏览器实时可调）。方向：向“云微物理参数化的交互式诊断”靠拢，把可调参数对应到具体参数化方案讲清楚。',
      'doc.h4': '四、集成架构',
      'doc.p7': '主线程只管渲染与 UI；所有外部通信走 Bridge Adapter（独立进程：WebSocket + REST）。协议为“JSON over WebSocket，三类消息：全量快照 snapshot / 增量 delta / 遥测 telemetry”，delta 优先、固定步长、schema 版本化。气象数据输入接口支持 METAR/SPECI/TAF（纯正则解析）、BUFR 探空与 GRIB2 网格场（服务端预解码）。',
      'doc.h5': '五、离线声明',
      'doc.p8': '所有计算在本地浏览器完成，不采集、不上传任何数据。VIS/RVR/CMV 转换遵循 ICAO Doc 9365 与 EASA AMC 至 NCO.OP.110（2024 第5版）。',
      'doc.lic.h': '六、授权与使用条款',
      'doc.lic.p1': '本软件为专有软件（proprietary），全部权利由作者保留。本仓库在 GitHub 上仅用于版本管理与备份，不构成对任何第三方的使用许可或公开授权。',
      'doc.lic.p2': '使用授权：如需使用本软件，请联系作者获取书面授权（邮箱：{email}）。',
      'doc.lic.p3': '免费授权：德国、中国、法国的学术与科研用途，当其纵向经费低于 30,000 美元（USD 30,000）时，经作者书面授权后可免费使用；使用时必须引用本项目并作出书面鸣谢。',
      'doc.lic.p4': '其他用途（商业、经费达到或超过上述额度、或其他国家/地区）须与作者另行协商并获得书面授权。© Tianyuan.J.Z（Zhang Heinrich），保留所有权利。完整英文条款见仓库根目录 LICENSE-TERMS.md。',
      'doc.ack.h': '七、鸣谢',
      'doc.ack.p1': '感谢 MonikaSong G.C（南京）提供专业知识支持。',
      'doc.ack.p2': '感谢 Alvin Lv 提供稳定性测试协助。',
      'doc.ack.p3': '感谢 Huaneng Yuan 提供测试协助。',

      // 探空验证弹窗
      'val.intro': '内置一份代表性探空样本（示意，非实测）。模型能见度由当前云微物理参数推算；右侧为各高度“模型最差能见度”与“观测参考”的对比。真实数据请通过“数据接口”导入 BUFR。',
      'val.note': '注意：内置样本用于把计算值与观测值并排对照；要真正验证，请载入真实 radiosonde（University of Wyoming 等公开数据）并对比同高度能见度。',
      'val.th.z': '高度km', 'val.th.p': '气压hPa', 'val.th.T': 'T°C', 'val.th.Td': 'Td°C',
      'val.th.vis': '模型能见度', 'val.th.lwc': 'LWC g/m³', 'val.clear': '晴空',

      // 云类名称与高度带
      'cloud.ci.name': '卷云', 'cloud.ci.band': '高云 6–13km',
      'cloud.cs.name': '高积/高层云', 'cloud.cs.band': '中高云 4–8km',
      'cloud.sc.name': '层云/层积云', 'cloud.sc.band': '低云 0.2–2km',
      'cloud.cu.name': '积云', 'cloud.cu.band': '低—中云 0.5–4km',
      'cloud.cb.name': '积雨云', 'cloud.cb.band': '直展云 0.5–12km',

      // 解析输出前缀
      'out.windDir': '风向', 'out.windSpeed': '风速', 'out.surfaceTemp': '地面温度',
      'out.rh': '相对湿度', 'out.cavok': 'CAVOK（≥10km，无重要云/天气，未改动云层）',
      'out.weather': '天气：', 'out.sep': '；', 'out.fog': '⚠ 温度-露点差≤2°C，雾/低云高概率；本工具以 LWC 经验回推能见度。',
      'out.rvrNote': 'RVR（跑道视程）见 VIS/RVR/CMV 面板。', 'out.cloudBase': '云底',
      'wx.int.light': '轻度', 'wx.int.heavy': '强', 'wx.int.vicinity': '机场附近', 'wx.int.moderate': '中',

      // 数据接口面板
      'tab.metar': 'METAR / TAF', 'tab.vis': 'VIS / RVR / CMV',
      'tab.airport': '机场表', 'tab.bridge': 'Bridge', 'tab.replay': '事件录制/回放',
      'metar.note': '纯正则解析 METAR / SPECI / TAF（ICAO Annex 3 + WMO FM15/16），解析结果可一键映射到当前场景参数。',
      'metar.placeholder': '粘贴 METAR/SPECI/TAF 报文，如：ZBAA 231000Z 02003MPS 8000 -RA BKN020 12/09 Q1003 …',
      'metar.parse': '解析', 'metar.apply': '解析并应用到场景', 'metar.taf': '解析为 TAF 趋势',
      'metar.outHint': '（点击“解析”查看结果）',
      'metar.parseFail': '解析失败：{msg}', 'metar.applyFail': '应用失败：{msg}',
      'metar.applied': '已应用：', 'metar.notesTitle': 'ℹ 说明：',
      'vis.note': 'VIS / RVR / CMV 三模式（ICAO Doc 9365 + EASA NCO.OP.110）。CMV 用于由气象能见度验证 RVR，禁止在已有 RVR、起飞最低、RVR 下限<800m 时使用。',
      'vis.mode.vis': 'VIS 气象能见度', 'vis.mode.rvr': 'RVR 跑道视程', 'vis.mode.cmv': 'CMV 计算能见度',
      'vis.quick': '快捷：',
      'vis.preset.cavok': 'CAVOK（能见度≥10km，无重要云/天气）',
      'vis.preset.cat1': 'CAT-I 一类：RVR≥550m，DH≥200ft',
      'vis.preset.cat2': 'CAT-II 二类：RVR 300-550m，DH 100-200ft',
      'vis.preset.cat3a': 'CAT-IIIA：RVR 175-300m',
      'vis.preset.cat3b': 'CAT-IIIB：RVR 50-175m，无决断高度',
      'vis.preset.cat3c': 'CAT-IIIC：零能见度运行',
      'vis.label.visMain': '主导能见度 (m)', 'vis.label.visMin': '最低能见度 (m, 可选)',
      'vis.label.visMinDir': '最低能见度方向', 'vis.label.rwy': '跑道', 'vis.label.trend': '趋势',
      'vis.opt.up': '↑ 上升', 'vis.opt.down': '↓ 下降', 'vis.opt.flat': '○ 不变',
      'vis.label.ind': '超出范围指示', 'vis.opt.exact': '● 精确',
      'vis.opt.gt': '○ >上限(1500)', 'vis.opt.lt': '○ <下限(50)',
      'vis.label.cvis': '气象能见度 VIS (m)', 'vis.label.daynight': '昼夜',
      'vis.opt.day': '白天', 'vis.opt.night': '夜间', 'vis.label.light': '跑道灯光',
      'vis.opt.hi': 'HI 进近灯 + 跑道灯', 'vis.opt.other': '其他灯光', 'vis.opt.nolight': '无灯光',
      'vis.cmvNa': 'CMV 不适用', 'vis.forbidTitle': '⚠ 禁止使用 CMV：',
      'vis.calcVis': '主导能见度', 'vis.calcRvrRunway': '（跑道 ', 'vis.calcRvr': '近似气象能见度 ≈ ',
      'vis.dayShort': '昼', 'vis.nightShort': '夜', 'vis.validPrefix': '有效: ',
      'vis.reasonNoLight': '夜间无灯光，CMV 不适用', 'vis.reasonOverMax': '超过机场评估最大值 1500m，不作为有效值',
      'bridge.snap': 'Bridge 快照', 'bridge.delta': 'Bridge delta',
      'replay.sessionName': 'CloudField 实验会话', 'replay.statusMax': '，最大 t={max}ms',
      'vis.forbidRvr': '已有 RVR 直接观测报告', 'vis.forbidTakeoff': '计算起飞最低标准', 'vis.forbidRvrMin': 'RVR 最低标准低于 800m',
      'vis.rvrStandard': 'RVR 标准', 'airport.altInline': '海拔',
      'bridge.connected': '已连接', 'bridge.notConnected': '未连接（确认 Bridge 已启动）',
      'airport.note': 'WGS-84 中国民航机场表（代表性子集，完整 ~250 由 Bridge 提供）。支持 ICAO / IATA / 中文名检索与米↔百英尺换算。',
      'airport.placeholder': '输入 ICAO/IATA/名称，如 ZBAA 或 成都',
      'airport.search': '检索', 'airport.notFound': '未找到匹配机场',
      'airport.formula': '海拔换算：100ft = 30.48m。选中机场后将显示 WGS-84 经纬度与海拔。',
      'airport.wgsLat': 'WGS-84 纬度', 'airport.wgsLon': 'WGS-84 经度',
      'airport.elev': '海拔（椭球高近似）', 'airport.geoid': '大地高（EGM96 偏移占位）',
      'bridge.note': 'Bridge Adapter 为独立进程（WebSocket + REST），承载 METAR/BUFR/GRIB2 解码与多节点同步。主线程仅做渲染与 UI，密钥不内置。',
      'bridge.addr': 'WebSocket 地址', 'bridge.connect': '连接',
      'bridge.sim': '模拟推送（离线演示）', 'bridge.snapshot': '请求快照',
      'bridge.statusIdle': '状态：未连接',
      'bridge.statusConnecting': '状态：连接中…', 'bridge.statusFail': '状态：连接失败 {err}',
      'bridge.statusDone': '状态：{ok}', 'bridge.simDone': '已注入示例 snapshot + 一条 delta（风速→18KT、能见度→600m）。查看左侧场景与仪表盘变化。',
      'bridge.simStatus': '状态：模拟推送完成（离线）',
      'replay.note': '实验过程全记录：录制 snapshot / delta / METAR 事件，导出为可离线回放的 JSON（符合 integration_plan 第四部分 Schema）。',
      'replay.start': '● 开始录制', 'replay.stop': '■ 停止录制',
      'replay.export': '导出会话 JSON', 'replay.import': '导入会话',
      'replay.axis': '回放时间轴 (ms)', 'replay.status': '事件数：{n}',
      'replay.importFail': '导入失败：{msg}',

      // 高级诊断（路线图 #1–#14）
      'grp.adv': '高级诊断', 'adv.open': '高级诊断面板', 'adv.title': '高级诊断面板',
      'nav.spectrum': '粒子谱', 'nav.phases': '相态分档', 'nav.operators': '观测算子',
      'nav.timeseries': '时变预报', 'nav.spatial': '空间场', 'nav.sensitivity': '敏感性',
      'nav.qc': '数据质控', 'nav.export': '业务输出', 'nav.validation': '验证评估',
      'nav.recorder': '场景录制', 'nav.report': '报告分享', 'nav.help': '帮助教学', 'nav.scenarios': '示例场景',
      'spec.title': '粒子谱描述', 'spec.type': '谱型', 'spec.gamma': 'Gamma', 'spec.lognormal': '对数正态', 'spec.measured': '实测谱',
      'spec.re': '有效半径 rₑ', 'spec.N': '数浓度 N', 'spec.veff': '有效方差 ν_eff', 'spec.rg': '中值半径 r_g', 'spec.sigmaG': '几何标准差 σ_g',
      'spec.import': '导入实测谱', 'spec.moments': '谱矩',
      'phase.title': '相态分档与气溶胶', 'phase.water': '云滴(液态)', 'phase.ice': '冰晶', 'phase.snow': '雪', 'phase.graupel': '霰', 'phase.hail': '雹',
      'phase.preset': '相态预设', 'phase.pureWater': '纯液态', 'phase.mixedIce': '混合冰', 'phase.cirrus': '卷云', 'phase.snowy': '雪态', 'phase.convective': '对流',
      'phase.normalize': '归一化',
      'aerosol.title': '气溶胶背景', 'aerosol.on': '启用气溶胶', 'aerosol.beta0': '地面消光 β0', 'aerosol.scaleH': '标高',
      'op.title': '观测算子（多诊断量并行）', 'op.visibility': '能见度', 'op.extSplit': '散射/吸收分离', 'op.irradiance': '太阳/天空辐照度',
      'op.albedo': '云反照率', 'op.satellite': '卫星亮温', 'op.lidar': '激光雷达', 'op.radar': '气象雷达',
      'ts.title': '时变与预报对接', 'ts.import': '导入时序 CSV', 'ts.default': '示例日变化', 'ts.apply': '应用时刻', 'ts.play': '播放', 'ts.loop': '循环',
      'ts.visCurve': '能见度演变', 'ts.t0': '起始(h)', 'ts.t1': '结束(h)',
      'sp.title': '空间能见度场与统计', 'sp.compute': '计算', 'sp.coverage': '云量覆盖', 'sp.cloudTop': '云顶', 'sp.cloudBase': '云底',
      'sp.opticalDepth': '光学厚度', 'sp.meanExt': '平均消光', 'sp.alt': '高度',
      'sen.title': '敏感性分析', 'sen.paramA': '参数 A', 'sen.paramB': '参数 B', 'sen.min': '最小', 'sen.max': '最大',
      'sen.compute': '计算热力图', 'sen.metric': '指标', 'sen.vis': '能见度', 'sen.od': '光学厚度',
      'sen.hint': '选两个参数扫描其对指标的影响。带 * 的参数在扫描期间会自动切到生效状态（r_e → fixed 模式、气溶胶 → 开启），扫描结束后恢复。',
      'sen.cov': '覆盖率', 'sen.idle': '尚未计算。', 'sen.running': '计算中 {p}%',
      'sen.done': '完成：{lo} → {hi}（{n} 点，{ms} ms）',
      'sen.dead': '{axis} 轴无响应（该参数对本指标无影响）',
      'sen.flat': '≈ 常数：该组合对本指标无响应',
      'qc.title': '数据质控 QC', 'qc.import': '粘贴 METAR/探空', 'qc.run': '运行质控', 'qc.hint': '校验合理性/缺测/异常', 'qc.clear': '晴空',
      'qc.ok': '正常', 'qc.warn': '警告', 'qc.error': '错误', 'qc.missing': '缺测',
      'ex.title': '业务系统输出', 'ex.metar': '生成 METAR/AVMET', 'ex.iwxxm': '生成 IWXXM XML', 'ex.bufr': 'BUFR 字段', 'ex.grib': 'GRIB 字段',
      'ex.copy': '复制', 'ex.push': '推送到端点', 'ex.endpoint': '端点 URL',
      'val2.title': '验证与误差评估', 'val2.bias': '偏差 Bias', 'val2.rmse': '均方根误差 RMSE', 'val2.mae': '平均绝对误差 MAE', 'val2.corr': '相关系数 R',
      'val2.scatter': '散点图', 'val2.taylor': '泰勒图', 'val2.run': '计算验证',
      'rec.title': '场景录制与回放', 'rec.start': '开始录制', 'rec.stop': '停止', 'rec.play': '回放', 'rec.clear': '清空',
      'rec.export': '导出会话', 'rec.import': '导入会话', 'rec.count': '事件数：{n}',
      'rep.title': '报告与分享', 'rep.html': '导出 HTML 报告', 'rep.share': '生成分享链接', 'rep.annotate': '截图标注', 'rep.exportAnno': '导出标注图',
      'help.title': '参数释义与示例', 'help.desc': '物理含义与滑块影响', 'help.effect': '影响', 'help.scenario': '示例场景',
      'help.fog': '浓雾', 'help.stratus': '层云', 'help.cumulus': '积云', 'help.cirrus': '冰云',
    },

    en: {
      'app.title': 'CloudField · Interactive Diagnostic Tool for Cloud Microphysics Parameterization — © Tianyuan.J.Z',
      'app.subtitle': 'Interactive Diagnostic Tool for Cloud Microphysics Parameterization',
      'offline.banner': '🔒 Offline: all computation runs locally in your browser. No data is collected or uploaded.',
      'footer.copy': 'Pure front-end, offline · © Tianyuan.J.Z',
      'lang.title': 'Language',
      'lang.zh': '中文', 'lang.en': 'English', 'lang.de': 'Deutsch',

      'hud.cameraAlt': 'Camera altitude',

      'view.persp': 'Perspective', 'view.top': 'Top', 'view.side': 'Side', 'view.front': 'Front',

      'loading.init': 'Initializing scene…',
      'loading.initFail': 'Initialization failed: {msg}',
      'loading.renderErr': 'Render error: {msg}',
      'loading.consoleHint': 'Open the browser console (F12 → Console) for the full error details.',

      'dash.title': 'Visibility Diagnostic Dashboard',
      'dash.collapse': 'Collapse ▾', 'dash.expand': 'Expand ▸',

      'mon.profile': 'Atmospheric Vertical Profile',
      'mon.profile.note': 'red=temp / blue=dewpoint / green=saturation',
      'mon.section': 'Horizontal Slice',
      'mon.section.note': 'Slice altitude adjustable · shows current visible field',
      'mon.readouts': 'Real-time Meteorological Readings',
      'mon.status': 'Simulation Status',

      'modal.validate': 'Radiosonde Validation (Model vs Obs)',
      'modal.integration': 'Meteorological Data Interface · Integration',

      'tb.play': 'Play/Pause simulation',
      'tb.resetView': 'Reset View', 'tb.resetView.tip': 'Restore default camera',
      'tb.resetParams': 'Reset Parameters', 'tb.resetParams.tip': 'Restore all default parameters',
      'tb.snapshot': 'Save Snapshot', 'tb.snapshot.tip': 'Mark current worst visibility as a comparison point',
      'tb.export': 'Export JSON', 'tb.export.tip': 'Export current parameters (with version)',
      'tb.import': 'Import JSON', 'tb.import.tip': 'Import a parameter snapshot',
      'tb.validate': 'Radiosonde Validation', 'tb.validate.tip': 'Validate visibility with a radiosonde sample',
      'tb.integration': 'Data Interface', 'tb.integration.tip': 'METAR / VIS-RVR-CMV / Airport / Bridge',
      'tb.docs': 'Help', 'tb.docs.tip': 'Open credibility documentation',
      'btn.play': '▶ Play', 'btn.pause': '⏸ Pause',

      'grp.scene': 'Scene Parameters', 'grp.layers': 'Cloud Layers',
      'grp.sim': 'Simulation & Evolution', 'grp.advanced': 'Advanced (direct fields)', 'grp.const': 'Constants & Thresholds',
      'grp.view': 'Visualization & Diagnostics',

      // top bar
      'unit.common': 'Common', 'unit.si': 'SI',
      'tab.read': 'Readout', 'tab.formula': 'Formulas', 'tab.scale': 'Scales',
      'ctrl.range': 'Range',

      // compass (wind direction)
      'compass.n': 'N', 'compass.e': 'E', 'compass.s': 'S', 'compass.w': 'W',
      'compass.ne': 'NE', 'compass.se': 'SE', 'compass.sw': 'SW', 'compass.nw': 'NW',
      'compass.from': 'Wind from {pt}',

      // visualization & diagnostics
      'adv.tintField': 'Microphysics overlay', 'adv.tintField.tip': 'Overlay a translucent physical field on the realistic cloud',
      'adv.tintAmt': 'Overlay opacity', 'adv.tintAmt.tip': '0 = pure realistic cloud, 1 = pure physical field colour',
      'adv.slice': '3D slice line', 'adv.slice.tip': 'Draw the highlighted horizontal line at the slice altitude',
      'tint.off': 'Off', 'tint.lwc': 'Liquid water LWC', 'tint.beta': 'Extinction β', 'tint.re': 'Effective radius rₑ',
      'cmap.lwc': 'Liquid water content LWC', 'cmap.beta': 'Extinction β', 'cmap.re': 'Effective radius rₑ',
      'cmap.Nd': 'Drop concentration N', 'cmap.temp': 'Temperature', 'cmap.pres': 'Pressure', 'cmap.density': 'Cloud density',
      'leg.normNote': 'Normalized range {lo}–{hi} {unit}; values outside are clipped',
      'mon.sliceMark': 'slice',
      'sim.evolving': 'Cloud field is evolving', 'sim.frozen': 'Frozen (parameters editable, scene not advancing)',
      'dash.reDeriv': '(derived from LWC,N: {v} µm)',
      'dash.coverBasis': 'Basis: total cloud cover = 1 − Π(1 − layer coverage), assuming random (independent) overlap between layers. Not a satellite area fraction, not an optical-depth threshold statistic.',
      'dash.scaleBasis': 'Scale basis: each quantity has its own colour map and normalization range; values outside the range are clipped. The white pin marks the current value within the range.',
      'axis.title': 'Slice altitude',

      'p.surfTemp': 'Surface Temperature', 'p.surfTemp.tip': 'Near-surface air temperature; sets the whole-layer temperature profile',
      'p.surfPres': 'Surface Pressure', 'p.surfPres.tip': 'Surface pressure before sea-level reduction',
      'p.surfRH': 'Surface Relative Humidity', 'p.surfRH.tip': 'Determines dewpoint / condensation level (LCL)',
      'p.lapse': 'Temperature Lapse Rate', 'p.lapse.tip': 'Environmental temperature decrease with height',
      'p.dewLapse': 'Dewpoint Lapse Rate', 'p.dewLapse.tip': 'Dewpoint decrease with height',
      'p.dryLapse': 'Dry Adiabatic Lapse Rate', 'p.dryLapse.tip': 'Dry adiabatic lapse rate used for LCL (default 9.8 K/km; distinct from environmental lapse rate)',
      'p.envCycle': 'Diurnal Environment', 'p.envCycle.tip': '180 s cycle: surface temperature ±5 °C, RH ∓10%, so temperature/pressure/humidity evolve during the simulation',
      'p.windSpeed': 'Wind Speed', 'p.windSpeed.tip': 'Wind advection drift speed',
      'p.windDir': 'Wind Dir (from)', 'p.windDir.tip': 'Wind direction from which it blows (meteorological convention)',
      'p.sunElev': 'Solar Elevation', 'p.sunElev.tip': 'Solar elevation; affects lighting direction',
      'p.sunAz': 'Solar Azimuth', 'p.sunAz.tip': 'Solar azimuth; affects lighting direction',

      'layer.top': 'Top Height', 'layer.top.tip': 'Cloud layer upper boundary (km)',
      'layer.base': 'Base Height', 'layer.base.tip': 'Cloud layer lower boundary (km)',
      'layer.enable': '{name} · Enabled',
      'layer.coverage': 'Coverage', 'layer.coverage.tip': 'Cloud cover fraction (0–1)',
      'layer.density': 'Thickness/Density', 'layer.density.tip': 'Opacity / optical-thickness factor',
      'layer.scale': 'Horizontal Scale', 'layer.scale.tip': 'Horizontal scale of cloud lumps (larger = fluffier)',
      'layer.detail': 'Detail', 'layer.detail.tip': 'High-frequency detail strength',

      'sim.autoLife': 'Auto Lifecycle', 'sim.autoLife.tip': 'Automatic cloud life cycle',
      'sim.lifePhase': 'Lifecycle Phase (manual)', 'sim.lifePhase.tip': 'Manually control growth/decay stage',
      'sim.cape': 'Convection Intensity CAPE', 'sim.cape.tip': 'Drives cumulus/cumulonimbus updraft (=CAPE proxy)',
      'sim.speed': 'Time Speed', 'sim.speed.tip': 'Simulation time advance multiplier',

      'adv.viewMode': 'View Mode', 'adv.viewMode.tip': 'Switch visualized field',
      'adv.band': 'Iso-bands / contours', 'adv.band.tip': 'Band the temperature/pressure view (5 °C / 25 hPa) and draw contours; makes top-down differences from cloud top visible',
      'adv.sliceAlt': 'Slice Altitude', 'adv.sliceAlt.tip': 'Altitude of horizontal slice',
      'adv.sun': 'Sun Light', 'adv.sun.tip': 'Render the sun',
      'adv.grid': 'Ground Grid', 'adv.grid.tip': 'Show ground km grid',
      'adv.quality': 'Render Quality', 'adv.quality.tip': 'Affects step count & pixel ratio (performance ↔ quality)',

      'const.re': 'Effective Droplet Radius r_e', 'const.re.tip': 'Key parameter for Kessler / scattering spectrum; sets extinction & visibility',
      'const.reMode': 'Derive r_e from N & LWC', 'const.reMode.tip': 'When on, closes the Twomey chain (N↑→r_e↓→extinction↑→visibility↓); off uses the r_e slider above',
      'const.N': 'Droplet Number Concentration N', 'const.N.tip': 'Twomey effect: N↑→r_e↓→extinction↑',
      'const.k1': 'Autoconversion k1', 'const.k1.tip': 'Kessler autoconversion coefficient (raindrop formation)',
      'const.qc0': 'Conversion Threshold qc0', 'const.qc0.tip': 'Kessler critical cloud water content (kg/kg)',
      'const.k2': 'Accretion k2', 'const.k2.tip': 'Kessler accretion coefficient',
      'const.ice': 'Ice Fraction', 'const.ice.tip': 'Mixed-phase/ice cloud branch fraction (affects extinction spectrum)',

      'vm.real': 'Real Cloud', 'vm.temp': 'Temperature Field', 'vm.pressure': 'Pressure Field',
      'vm.water': 'Liquid Water', 'vm.coverage': 'Coverage',

      'alert.importFail': 'Import failed: {msg}',
      'alert.exportFail': 'Export failed (ensure browser supports {type})',

      'ro.base': 'Cloud Base', 'ro.top': 'Cloud Top', 'ro.lcl': 'LCL',
      'ro.zero': '0°C Level', 'ro.surfTemp': 'Surface Temp', 'ro.surfPres': 'Surface Pres',
      'ro.surfRH': 'Surface RH', 'ro.maxLWC': 'Max Liquid Water', 'ro.cover': 'Total Cloud',
      'ro.precip': 'Precip Prob', 'ro.convection': 'Convection', 'ro.wind': 'Wind Spd/Dir',

      'sim.run': 'Running', 'sim.pause': 'Paused',
      'sim.time': 'Sim Time', 'sim.life': 'Lifecycle',
      'sim.stage0': 'Embryonic', 'sim.stage1': 'Developing', 'sim.stage2': 'Mature', 'sim.stage3': 'Dissipating',
      'sim.convGain': 'Convection Gain', 'sim.timeSpeed': 'Time Speed',

      'leg.temp': 'Temperature', 'leg.pressure': 'Pressure', 'leg.water': 'Liquid Water',

      'dash.worst': 'Worst Visibility · in-cloud @ {alt} km',
      'dash.infinite': '∞ (clear)',
      'dash.visFormula': 'Visibility V = ln(1/ε) / β　(Koschmieder, ε=0.02)',
      'dash.densityFormula': 'Density normalization: d = clamp(LWC/LWC_max,0,1)·noise, LWC_max={max} g/m³',
      'dash.beta': 'Extinction β', 'dash.lwc': 'Cloud LWC', 'dash.re': 'Eff. Radius r_e', 'dash.N': 'Droplet N',
      'dash.rain': 'Rain rate R', 'dash.qr': 'Rain water q_r', 'dash.temp': 'Temperature T', 'dash.dew': 'Dewpoint Td', 'dash.pres': 'Pressure P',
      'kes.on': 'Kessler single-column forecast (q_c/q_r)', 'kes.on.tip': 'Integrates autoconversion & accretion per layer and outputs rain rate; does not feed 3D rendering',
      'kes.reset': 'Reset Kessler state', 'kes.reset.tip': 'Clear q_c/q_r and rain rate',
      'dash.snapEmpty': 'No comparison snapshots yet (save one in "Scene Parameters")',
      'dash.formulaTitle': 'Formulas Used (for methods section)',
      'dash.fNote': 'Note: single-scattering sphere approximation; r_e, N are diagnostic inputs to cloud microphysics parameterization.',

      'doc.h1': 'I. Visibility & Extinction (verifiable core)',
      'doc.p1': 'Extinction coefficient (monodisperse sphere approximation): β = 3·LWC / (2·ρ_w·r_e), unit m⁻¹. LWC is liquid water content (kg/m³), ρ_w=1000 kg/m³, r_e is effective droplet radius (m).',
      'doc.p2': 'Visibility (Koschmieder law): V = -ln(ε)/β = ln(1/ε)/β, contrast threshold ε=0.02 (i.e. V≈3.912/β).',
      'doc.p3': 'Extinction spectral shape (Ångström): β(λ) = β(λ₀)·(λ₀/λ)^α, α≈0–2; this tool uses 550nm as reference.',
      'doc.p4': 'Density-field normalization: normalized density d = clamp(LWC / LWC_max, 0, 1) · noise, LWC_max={max} g/m³; in-cloud LWC is empirically back-inferred from normalized density to drive β and V.',
      'doc.h2': 'II. Cloud Microphysics Parameterization Mapping (diagnostic narrative)',
      'doc.p5': 'This tool’s adjustable parameters are deliberately mapped to "which parameters" of classic parameterization schemes, so they can go into a paper’s methods section and sensitivity experiments. Current default scheme: {scheme}',
      'doc.th.param': 'Parameter', 'doc.th.value': 'Current Value', 'doc.th.mapsTo': 'Scheme Param / Physical Meaning',
      'doc.h3': 'III. References & Direction',
      'doc.p6': 'ETH CLOUDLAB / ICON-LES: they use large-eddy simulation (ICON-LES) to reproduce cloud-seeding experiments, finding simulated ice growth slower than observed; they do sensitivity experiments by changing parameterization parameters — exactly what this tool does. Theirs is "slow but accurate" (Fortran, runs hours to days); this tool is light and fast (real-time in browser). Direction: move toward "interactive diagnosis of cloud microphysics parameterization," making clear which tunable parameters map to which scheme.',
      'doc.h4': 'IV. Integration Architecture',
      'doc.p7': 'The main thread only handles rendering and UI; all external communication goes through the Bridge Adapter (separate process: WebSocket + REST). The protocol is "JSON over WebSocket, three message types: full snapshot / incremental delta / telemetry", delta-first, fixed step, schema versioned. The meteorological data input interface supports METAR/SPECI/TAF (pure regex parsing), BUFR soundings and GRIB2 grid fields (server-side pre-decoding).',
      'doc.h5': 'V. Offline Statement',
      'doc.p8': 'All computation is done in the local browser; no data is collected or uploaded. VIS/RVR/CMV conversion follows ICAO Doc 9365 and EASA AMC to NCO.OP.110 (2024, 5th ed.).',
      'doc.lic.h': 'VI. Licence & Terms of Use',
      'doc.lic.p1': 'This software is proprietary; all rights are reserved by the author. The GitHub repository is used solely for version control and backup and does not grant any licence or public authorisation to third parties.',
      'doc.lic.p2': 'Authorisation: to use this software, contact the author for written authorisation (email: {email}).',
      'doc.lic.p3': 'Free authorisation: for academic and research use in Germany, China and France, where the project’s competitive (vertical) funding is below USD 30,000, the software may be used free of charge after written authorisation, provided the project is cited and a written acknowledgement is made.',
      'doc.lic.p4': 'Other uses (commercial, funding at or above that threshold, or other countries/regions) require separate agreement and written authorisation. © Tianyuan.J.Z (Zhang Heinrich). All rights reserved. Full terms: LICENSE-TERMS.md in the repository root.',
      'doc.ack.h': 'VII. Acknowledgements',
      'doc.ack.p1': 'Acknowledgement: MonikaSong G.C (Nanjing) for professional domain support.',
      'doc.ack.p2': 'Alvin Lv for stability-testing assistance.',
      'doc.ack.p3': 'Huaneng Yuan for testing assistance.',

      'val.intro': 'A representative radiosonde sample is built in (illustrative, not measured). Model visibility is derived from current cloud microphysics parameters; on the right is the comparison of "model worst visibility" vs "observation reference" at each altitude. For real data, import BUFR via "Data Interface".',
      'val.note': 'Note: the built-in sample only puts computed and observed values side by side; for real validation, load actual radiosonde data (University of Wyoming etc.) and compare visibility at the same altitude.',
      'val.th.z': 'Alt km', 'val.th.p': 'Pres hPa', 'val.th.T': 'T°C', 'val.th.Td': 'Td°C',
      'val.th.vis': 'Model Vis', 'val.th.lwc': 'LWC g/m³', 'val.clear': 'Clear sky',

      'cloud.ci.name': 'Cirrus', 'cloud.ci.band': 'High cloud 6–13km',
      'cloud.cs.name': 'Altocumulus/Altostratus', 'cloud.cs.band': 'Mid-high cloud 4–8km',
      'cloud.sc.name': 'Stratus/Stratocumulus', 'cloud.sc.band': 'Low cloud 0.2–2km',
      'cloud.cu.name': 'Cumulus', 'cloud.cu.band': 'Low–mid cloud 0.5–4km',
      'cloud.cb.name': 'Cumulonimbus', 'cloud.cb.band': 'Vertical cloud 0.5–12km',

      'out.windDir': 'Wind dir', 'out.windSpeed': 'Wind speed', 'out.surfaceTemp': 'Surface temp',
      'out.rh': 'Rel. humidity', 'out.cavok': 'CAVOK (≥10km, no sig cloud/weather, layers unchanged)',
      'out.weather': 'Weather: ', 'out.sep': '; ', 'out.fog': '⚠ T-Td≤2°C, high prob. of fog/low cloud; tool back-infers visibility from LWC.',
      'out.rvrNote': 'RVR (runway visual range) see VIS/RVR/CMV panel.', 'out.cloudBase': 'cloud base',
      'wx.int.light': 'light', 'wx.int.heavy': 'heavy', 'wx.int.vicinity': 'in vicinity', 'wx.int.moderate': 'moderate',

      'tab.metar': 'METAR / TAF', 'tab.vis': 'VIS / RVR / CMV',
      'tab.airport': 'Airport Table', 'tab.bridge': 'Bridge', 'tab.replay': 'Event Recording/Replay',
      'metar.note': 'Pure regex parsing of METAR / SPECI / TAF (ICAO Annex 3 + WMO FM15/16); results can be mapped to current scene parameters with one click.',
      'metar.placeholder': 'Paste METAR/SPECI/TAF message, e.g.: ZBAA 231000Z 02003MPS 8000 -RA BKN020 12/09 Q1003 …',
      'metar.parse': 'Parse', 'metar.apply': 'Parse & Apply to Scene', 'metar.taf': 'Parse as TAF Trend',
      'metar.outHint': '(click "Parse" to see result)',
      'metar.parseFail': 'Parse failed: {msg}', 'metar.applyFail': 'Apply failed: {msg}',
      'metar.applied': 'Applied:', 'metar.notesTitle': 'ℹ Notes:',
      'vis.note': 'VIS / RVR / CMV three modes (ICAO Doc 9365 + EASA NCO.OP.110). CMV is used to verify RVR from meteorological visibility; prohibited when RVR already reported, for takeoff minima, or when RVR lower limit <800m.',
      'vis.mode.vis': 'VIS Met Visibility', 'vis.mode.rvr': 'RVR Runway Vis Range', 'vis.mode.cmv': 'CMV Computed Vis',
      'vis.quick': 'Quick: ',
      'vis.preset.cavok': 'CAVOK (vis≥10km, no sig cloud/weather)',
      'vis.preset.cat1': 'CAT-I: RVR≥550m, DH≥200ft',
      'vis.preset.cat2': 'CAT-II: RVR 300-550m, DH 100-200ft',
      'vis.preset.cat3a': 'CAT-IIIA: RVR 175-300m',
      'vis.preset.cat3b': 'CAT-IIIB: RVR 50-175m, no decision height',
      'vis.preset.cat3c': 'CAT-IIIC: zero-visibility ops',
      'vis.label.visMain': 'Prevailing Visibility (m)', 'vis.label.visMin': 'Min Visibility (m, opt)',
      'vis.label.visMinDir': 'Min Vis Direction', 'vis.label.rwy': 'Runway', 'vis.label.trend': 'Trend',
      'vis.opt.up': '↑ Rising', 'vis.opt.down': '↓ Falling', 'vis.opt.flat': '○ No change',
      'vis.label.ind': 'Out-of-range Indicator', 'vis.opt.exact': '● Exact',
      'vis.opt.gt': '○ >upper(1500)', 'vis.opt.lt': '○ <lower(50)',
      'vis.label.cvis': 'Met Visibility VIS (m)', 'vis.label.daynight': 'Day/Night',
      'vis.opt.day': 'Day', 'vis.opt.night': 'Night', 'vis.label.light': 'Runway Lights',
      'vis.opt.hi': 'HI approach + runway lights', 'vis.opt.other': 'Other lights', 'vis.opt.nolight': 'No lights',
      'vis.cmvNa': 'CMV N/A', 'vis.forbidTitle': '⚠ CMV use forbidden:',
      'vis.calcVis': 'Prevailing vis.', 'vis.calcRvrRunway': ' (runway ', 'vis.calcRvr': 'approx met vis ≈ ',
      'vis.dayShort': 'day', 'vis.nightShort': 'night', 'vis.validPrefix': 'valid: ',
      'vis.reasonNoLight': 'No lights at night, CMV N/A', 'vis.reasonOverMax': 'Exceeds airport assessment max 1500m, not used as valid',
      'bridge.snap': 'Bridge Snapshot', 'bridge.delta': 'Bridge Delta',
      'replay.sessionName': 'CloudField Experiment Session', 'replay.statusMax': ', max t={max}ms',
      'vis.forbidRvr': 'RVR already reported', 'vis.forbidTakeoff': 'Takeoff minima', 'vis.forbidRvrMin': 'RVR lower limit <800m',
      'vis.rvrStandard': 'RVR std', 'airport.altInline': 'elev',
      'bridge.connected': 'connected', 'bridge.notConnected': 'not connected (ensure Bridge is running)',
      'airport.note': 'WGS-84 China civil airport table (representative subset; full ~250 from Bridge). Supports ICAO / IATA / name search and meters↔hundred-feet conversion.',
      'airport.placeholder': 'Enter ICAO/IATA/name, e.g. ZBAA or Chengdu',
      'airport.search': 'Search', 'airport.notFound': 'No matching airport found',
      'airport.formula': 'Elevation conversion: 100ft = 30.48m. Selecting an airport shows WGS-84 lat/lon and elevation.',
      'airport.wgsLat': 'WGS-84 Latitude', 'airport.wgsLon': 'WGS-84 Longitude',
      'airport.elev': 'Elevation (ellipsoid approx.)', 'airport.geoid': 'Geoid height (EGM96 offset placeholder)',
      'bridge.note': 'Bridge Adapter is a separate process (WebSocket + REST), handling METAR/BUFR/GRIB2 decoding and multi-node sync. Main thread only renders & UI; key not embedded.',
      'bridge.addr': 'WebSocket Address', 'bridge.connect': 'Connect',
      'bridge.sim': 'Simulate Push (offline demo)', 'bridge.snapshot': 'Request Snapshot',
      'bridge.statusIdle': 'Status: disconnected',
      'bridge.statusConnecting': 'Status: connecting…', 'bridge.statusFail': 'Status: connection failed {err}',
      'bridge.statusDone': 'Status: {ok}', 'bridge.simDone': 'Injected a sample snapshot + one delta (wind→18KT, visibility→600m). See left scene & dashboard changes.',
      'bridge.simStatus': 'Status: simulated push complete (offline)',
      'replay.note': 'Full record of the experiment: records snapshot / delta / METAR events, exports to replayable JSON offline (matches integration_plan part 4 Schema).',
      'replay.start': '● Start Recording', 'replay.stop': '■ Stop Recording',
      'replay.export': 'Export Session JSON', 'replay.import': 'Import Session',
      'replay.axis': 'Replay Timeline (ms)', 'replay.status': 'Events: {n}',
      'replay.importFail': 'Import failed: {msg}',

      // Advanced diagnostics (roadmap #1–#14)
      'grp.adv': 'Advanced diagnostics', 'adv.open': 'Advanced diagnostics panel', 'adv.title': 'Advanced diagnostics panel',
      'nav.spectrum': 'Spectrum', 'nav.phases': 'Phases', 'nav.operators': 'Operators',
      'nav.timeseries': 'Time series', 'nav.spatial': 'Spatial field', 'nav.sensitivity': 'Sensitivity',
      'nav.qc': 'QC', 'nav.export': 'Operational output', 'nav.validation': 'Validation',
      'nav.recorder': 'Recorder', 'nav.report': 'Report', 'nav.help': 'Help', 'nav.scenarios': 'Scenarios',
      'spec.title': 'Particle spectrum', 'spec.type': 'Spectrum type', 'spec.gamma': 'Gamma', 'spec.lognormal': 'Lognormal', 'spec.measured': 'Measured',
      'spec.re': 'Effective radius rₑ', 'spec.N': 'Number conc. N', 'spec.veff': 'Eff. variance ν_eff', 'spec.rg': 'Median radius r_g', 'spec.sigmaG': 'Geo. std σ_g',
      'spec.import': 'Import measured', 'spec.moments': 'Spectral moments',
      'phase.title': 'Phases & aerosol', 'phase.water': 'Cloud droplets', 'phase.ice': 'Ice crystals', 'phase.snow': 'Snow', 'phase.graupel': 'Graupel', 'phase.hail': 'Hail',
      'phase.preset': 'Phase preset', 'phase.pureWater': 'Pure liquid', 'phase.mixedIce': 'Mixed ice', 'phase.cirrus': 'Cirrus', 'phase.snowy': 'Snowy', 'phase.convective': 'Convective',
      'phase.normalize': 'Normalize',
      'aerosol.title': 'Aerosol background', 'aerosol.on': 'Enable aerosol', 'aerosol.beta0': 'Surface extinction β0', 'aerosol.scaleH': 'Scale height',
      'op.title': 'Observation operators', 'op.visibility': 'Visibility', 'op.extSplit': 'Sca/Abs split', 'op.irradiance': 'Solar/sky irradiance',
      'op.albedo': 'Cloud albedo', 'op.satellite': 'Satellite Tb', 'op.lidar': 'Lidar', 'op.radar': 'Radar',
      'ts.title': 'Time series & forecast', 'ts.import': 'Import time-series CSV', 'ts.default': 'Sample diurnal', 'ts.apply': 'Apply time', 'ts.play': 'Play', 'ts.loop': 'Loop',
      'ts.visCurve': 'Visibility evolution', 'ts.t0': 'Start(h)', 'ts.t1': 'End(h)',
      'sp.title': 'Spatial visibility & stats', 'sp.compute': 'Compute', 'sp.coverage': 'Cloud cover', 'sp.cloudTop': 'Cloud top', 'sp.cloudBase': 'Cloud base',
      'sp.opticalDepth': 'Optical depth', 'sp.meanExt': 'Mean extinction', 'sp.alt': 'Altitude',
      'sen.title': 'Sensitivity analysis', 'sen.paramA': 'Param A', 'sen.paramB': 'Param B', 'sen.min': 'Min', 'sen.max': 'Max',
      'sen.compute': 'Compute heatmap', 'sen.metric': 'Metric', 'sen.vis': 'Visibility', 'sen.od': 'Optical depth',
      'sen.hint': 'Sweep two parameters against the selected metric. Parameters marked * are switched on for the sweep (r_e → fixed mode, aerosol → on) and restored afterwards.',
      'sen.cov': 'coverage', 'sen.idle': 'Not computed yet.', 'sen.running': 'Computing {p}%',
      'sen.done': 'Done: {lo} → {hi} ({n} points, {ms} ms)',
      'sen.dead': 'Axis {axis} does not respond (this parameter has no effect on the metric)',
      'sen.flat': '≈ constant: no response for this combination',
      'qc.title': 'Data quality control', 'qc.import': 'Paste METAR/sounding', 'qc.run': 'Run QC', 'qc.hint': 'Check plausibility/missing/anomaly', 'qc.clear': 'Clear',
      'qc.ok': 'OK', 'qc.warn': 'Warning', 'qc.error': 'Error', 'qc.missing': 'Missing',
      'ex.title': 'Operational output', 'ex.metar': 'METAR/AVMET', 'ex.iwxxm': 'IWXXM XML', 'ex.bufr': 'BUFR fields', 'ex.grib': 'GRIB fields',
      'ex.copy': 'Copy', 'ex.push': 'Push to endpoint', 'ex.endpoint': 'Endpoint URL',
      'val2.title': 'Validation & error metrics', 'val2.bias': 'Bias', 'val2.rmse': 'RMSE', 'val2.mae': 'MAE', 'val2.corr': 'Correlation R',
      'val2.scatter': 'Scatter', 'val2.taylor': 'Taylor diagram', 'val2.run': 'Compute validation',
      'rec.title': 'Record & replay', 'rec.start': 'Start', 'rec.stop': 'Stop', 'rec.play': 'Replay', 'rec.clear': 'Clear',
      'rec.export': 'Export session', 'rec.import': 'Import session', 'rec.count': 'Events: {n}',
      'rep.title': 'Report & share', 'rep.html': 'Export HTML report', 'rep.share': 'Share link', 'rep.annotate': 'Annotate', 'rep.exportAnno': 'Export annotated',
      'help.title': 'Parameter guide & examples', 'help.desc': 'Meaning & effect', 'help.effect': 'Effect', 'help.scenario': 'Example scenarios',
      'help.fog': 'Dense fog', 'help.stratus': 'Stratus', 'help.cumulus': 'Cumulus', 'help.cirrus': 'Cirrus',
    },

    de: {
      'app.title': 'CloudField · Interaktives Diagnosewerkzeug für Wolkenmikrophysik-Parametrisierung — © Tianyuan.J.Z',
      'app.subtitle': 'Interaktives Diagnosewerkzeug für Wolkenmikrophysik-Parametrisierung',
      'offline.banner': '🔒 Offline: Alle Berechnungen laufen lokal im Browser. Es werden keine Daten gesammelt oder hochgeladen.',
      'footer.copy': 'Reines Frontend, offline · © Tianyuan.J.Z',
      'lang.title': 'Sprache',
      'lang.zh': '中文', 'lang.en': 'English', 'lang.de': 'Deutsch',

      'hud.cameraAlt': 'Kamerahöhe',

      'view.persp': 'Perspektive', 'view.top': 'Draufsicht', 'view.side': 'Seitenansicht', 'view.front': 'Frontansicht',

      'loading.init': 'Szene wird initialisiert…',
      'loading.initFail': 'Initialisierung fehlgeschlagen: {msg}',
      'loading.renderErr': 'Renderfehler: {msg}',
      'loading.consoleHint': 'Öffnen Sie die Browser-Konsole (F12 → Konsole) für die vollständige Fehlerausgabe.',

      'dash.title': 'Sichtweiten-Diagnose-Dashboard',
      'dash.collapse': 'Einklappen ▾', 'dash.expand': 'Ausklappen ▸',

      'mon.profile': 'Vertikales Atmosphärenprofil',
      'mon.profile.note': 'rot=Temp. / blau=Taupunkt / grün=Sättigung',
      'mon.section': 'Horizontalschnitt',
      'mon.section.note': 'Schnitthöhe einstellbar · zeigt aktuelles Sichtfeld',
      'mon.readouts': 'Echtzeit-Meteorologische Werte',
      'mon.status': 'Simulationsstatus',

      'modal.validate': 'Radiosonden-Validierung (Modell vs. Beob.)',
      'modal.integration': 'Meteorologische Datenschnittstelle · Integration',

      'tb.play': 'Simulation abspielen/pausieren',
      'tb.resetView': 'Ansicht zurücksetzen', 'tb.resetView.tip': 'Standardkamera wiederherstellen',
      'tb.resetParams': 'Parameter zurücksetzen', 'tb.resetParams.tip': 'Alle Standardparameter wiederherstellen',
      'tb.snapshot': 'Snapshot speichern', 'tb.snapshot.tip': 'Aktuelle schlechteste Sicht als Vergleichspunkt markieren',
      'tb.export': 'JSON exportieren', 'tb.export.tip': 'Aktuelle Parameter exportieren (mit Version)',
      'tb.import': 'JSON importieren', 'tb.import.tip': 'Parameterschnappschuss importieren',
      'tb.validate': 'Radiosonden-Validierung', 'tb.validate.tip': 'Sichtweite mit Radiosonden-Stichprobe validieren',
      'tb.integration': 'Datenschnittstelle', 'tb.integration.tip': 'METAR / VIS-RVR-CMV / Flughafen / Bridge',
      'tb.docs': 'Hilfe', 'tb.docs.tip': 'Glaubwürdigkeits-Dokumentation öffnen',
      'btn.play': '▶ Abspielen', 'btn.pause': '⏸ Pausieren',

      'grp.scene': 'Szenenparameter', 'grp.layers': 'Wolkenschichten',
      'grp.sim': 'Simulation & Entwicklung', 'grp.advanced': 'Erweitert (direkte Felder)', 'grp.const': 'Konstanten & Schwellen',
      'grp.view': 'Visualisierung & Diagnose',

      // Kopfleiste
      'unit.common': 'Üblich', 'unit.si': 'SI',
      'tab.read': 'Werte', 'tab.formula': 'Formeln', 'tab.scale': 'Farbskalen',
      'ctrl.range': 'Bereich',

      // Kompass (Windrichtung)
      'compass.n': 'N', 'compass.e': 'O', 'compass.s': 'S', 'compass.w': 'W',
      'compass.ne': 'NO', 'compass.se': 'SO', 'compass.sw': 'SW', 'compass.nw': 'NW',
      'compass.from': 'Wind aus {pt}',

      // Visualisierung & Diagnose
      'adv.tintField': 'Mikrophysik-Überlagerung', 'adv.tintField.tip': 'Halbtransparente physikalische Färbung über der realistischen Wolke',
      'adv.tintAmt': 'Deckkraft', 'adv.tintAmt.tip': '0 = nur reale Wolke, 1 = nur physikalisches Feld',
      'adv.slice': '3D-Schnittlinie', 'adv.slice.tip': 'Helle Horizontale auf der Schnitthöhe im Wolkenfeld',
      'tint.off': 'Aus', 'tint.lwc': 'Wolkenwasser LWC', 'tint.beta': 'Extinktion β', 'tint.re': 'Effektiver Radius rₑ',
      'cmap.lwc': 'Flüssigwassergehalt LWC', 'cmap.beta': 'Extinktionskoeffizient β', 'cmap.re': 'Effektiver Radius rₑ',
      'cmap.Nd': 'Tropfenzahlkonzentration N', 'cmap.temp': 'Temperatur', 'cmap.pres': 'Druck', 'cmap.density': 'Wolkendichte',
      'leg.normNote': 'Normierter Bereich {lo}–{hi} {unit}; Werte außerhalb werden begrenzt',
      'mon.sliceMark': 'Schnitt',
      'sim.evolving': 'Wolkenfeld entwickelt sich', 'sim.frozen': 'Eingefroren (Parameter änderbar, Szene läuft nicht)',
      'dash.reDeriv': '(aus LWC,N abgeleitet: {v} µm)',
      'dash.coverBasis': 'Definition: Gesamtbewölkung = 1 − Π(1 − Schichtbedeckung), bei zufälliger (unabhängiger) Überlappung der Schichten. Kein Satelliten-Flächenanteil, keine Optische-Dicke-Statistik.',
      'dash.scaleBasis': 'Skalendefinition: jede Größe hat eigene Farbskala und normierten Bereich; Werte außerhalb werden begrenzt. Der weiße Zeiger markiert den aktuellen Wert im Bereich.',
      'axis.title': 'Schnitthöhe',

      'p.surfTemp': 'Bodentemperatur', 'p.surfTemp.tip': 'Bodennahe Lufttemperatur; bestimmt das Temperaturprofil der ganzen Schicht',
      'p.surfPres': 'Bodendruck', 'p.surfPres.tip': 'Bodendruck vor Höhenreduktion',
      'p.surfRH': 'Boden-relative Feuchte', 'p.surfRH.tip': 'Bestimmt Taupunkt / Kondensationsniveau (LCL)',
      'p.lapse': 'Temperaturgradient', 'p.lapse.tip': 'Temperaturabnahme mit der Höhe',
      'p.dewLapse': 'Taupunktgradient', 'p.dewLapse.tip': 'Taupunktabnahme mit der Höhe',
      'p.dryLapse': 'Trockenadiabatischer Gradient', 'p.dryLapse.tip': 'Trockenadiabatischer Gradient für LCL (Standard 9,8 K/km; vom Umgebungsgradienten zu unterscheiden)',
      'p.envCycle': 'Tagesgang der Umgebung', 'p.envCycle.tip': '180-s-Zyklus: Bodentemperatur ±5 °C, RH ∓10 %, damit Temperatur/Druck/Feuchte während der Simulation variieren',
      'p.windSpeed': 'Windgeschwindigkeit', 'p.windSpeed.tip': 'Wind-Advektionsgeschwindigkeit',
      'p.windDir': 'Windrichtung (von)', 'p.windDir.tip': 'Windrichtung, aus der er weht (meteorologische Konvention)',
      'p.sunElev': 'Sonnenhöhe', 'p.sunElev.tip': 'Sonnenhöhe; beeinflusst die Lichtrichtung',
      'p.sunAz': 'Sonnenazimut', 'p.sunAz.tip': 'Sonnenazimut; beeinflusst die Lichtrichtung',

      'layer.top': 'Oberkante', 'layer.top.tip': 'Obergrenze der Wolkenlage (km)',
      'layer.base': 'Unterkante', 'layer.base.tip': 'Untergrenze der Wolkenlage (km)',
      'layer.enable': '{name} · Aktiv',
      'layer.coverage': 'Bedeckung', 'layer.coverage.tip': 'Wolkenbedeckungsanteil (0–1)',
      'layer.density': 'Dicke/Dichte', 'layer.density.tip': 'Undurchsichtigkeit / optische Dicke',
      'layer.scale': 'Horizontale Skala', 'layer.scale.tip': 'Horizontale Wolken-Skalierung (größer = flauschiger)',
      'layer.detail': 'Detail', 'layer.detail.tip': 'Hochfrequente Detailstärke',

      'sim.autoLife': 'Automatischer Lebenszyklus', 'sim.autoLife.tip': 'Automatischer Wolken-Lebenszyklus',
      'sim.lifePhase': 'Lebenszyklus-Phase (manuell)', 'sim.lifePhase.tip': 'Wachstums-/Zerfallsstadium manuell steuern',
      'sim.cape': 'Konvektionsintensität CAPE', 'sim.cape.tip': 'Treibt Cumulus/Cumulonimbus-Aufwind (=CAPE-Proxy)',
      'sim.speed': 'Zeitgeschwindigkeit', 'sim.speed.tip': 'Simulationszeit-Vorfaktor',

      'adv.viewMode': 'Ansichtsmodus', 'adv.viewMode.tip': 'Visualisiertes Feld umschalten',
      'adv.band': 'Isolinienbänder', 'adv.band.tip': 'Temperatur-/Druckansicht in Bänder (5 °C / 25 hPa) teilen und Isolinien zeichnen; macht Unterschiede in der Draufsicht sichtbar',
      'adv.sliceAlt': 'Schnitthöhe', 'adv.sliceAlt.tip': 'Höhe des Horizontalschnitts',
      'adv.sun': 'Sonnenlicht', 'adv.sun.tip': 'Sonne rendern',
      'adv.grid': 'Bodenraster', 'adv.grid.tip': 'Boden-km-Raster anzeigen',
      'adv.quality': 'Renderqualität', 'adv.quality.tip': 'Beeinflusst Schrittzahl & Pixelverhältnis (Leistung ↔ Qualität)',

      'const.re': 'Effektiver Tröpfchenradius r_e', 'const.re.tip': 'Schlüsselparameter für Kessler / Streuspektrum; bestimmt Extinktion & Sichtweite',
      'const.reMode': 'r_e aus N & LWC ableiten', 'const.reMode.tip': 'Ein: schließt die Twomey-Kette (N↑→r_e↓→Extinktion↑→Sichtweite↓); Aus: nutzt den r_e-Regler',
      'const.N': 'Tröpfchenzahlkonzentration N', 'const.N.tip': 'Twomey-Effekt: N↑→r_e↓→Extinktion↑',
      'const.k1': 'Autokonversion k1', 'const.k1.tip': 'Kessler-Autokonversionskoeffizient (Regentropfenbildung)',
      'const.qc0': 'Konversionsschwelle qc0', 'const.qc0.tip': 'Kessler kritischer Wolkenwassergehalt (kg/kg)',
      'const.k2': 'Akkretion k2', 'const.k2.tip': 'Kessler-Akkretionskoeffizient',
      'const.ice': 'Eisanteil', 'const.ice.tip': 'Anteil der Mischphasen-/Eiswolken (beeinflusst Extinktionsspektrum)',

      'vm.real': 'Echte Wolke', 'vm.temp': 'Temperaturfeld', 'vm.pressure': 'Druckfeld',
      'vm.water': 'Flüssigwassergehalt', 'vm.coverage': 'Bedeckung',

      'alert.importFail': 'Import fehlgeschlagen: {msg}',
      'alert.exportFail': 'Export fehlgeschlagen (Browser unterstützt {type}?)',

      'ro.base': 'Wolkenuntergrenze', 'ro.top': 'Wolkenobergrenze', 'ro.lcl': 'LCL',
      'ro.zero': '0°C-Niveau', 'ro.surfTemp': 'Bodentemp.', 'ro.surfPres': 'Bodendruck',
      'ro.surfRH': 'Bodenfeuchte', 'ro.maxLWC': 'Max. Flüssigwasser', 'ro.cover': 'Gesamtbedeckung',
      'ro.precip': 'Niederschlagswahrsch.', 'ro.convection': 'Konvektion', 'ro.wind': 'Wind Geschr./Richt.',

      'sim.run': 'Läuft', 'sim.pause': 'Pausiert',
      'sim.time': 'Sim-Zeit', 'sim.life': 'Lebenszyklus',
      'sim.stage0': 'Keimung', 'sim.stage1': 'Entwicklung', 'sim.stage2': 'Reife', 'sim.stage3': 'Auflösung',
      'sim.convGain': 'Konvektionsgewinn', 'sim.timeSpeed': 'Zeitgeschwindigkeit',

      'leg.temp': 'Temperatur', 'leg.pressure': 'Druck', 'leg.water': 'Flüssigwasser',

      'dash.worst': 'Schlechteste Sicht · in Wolke @ {alt} km',
      'dash.infinite': '∞ (klarer Himmel)',
      'dash.visFormula': 'Sichtweite V = ln(1/ε) / β　(Koschmieder, ε=0.02)',
      'dash.densityFormula': 'Dichte-Normalisierung: d = clamp(LWC/LWC_max,0,1)·noise, LWC_max={max} g/m³',
      'dash.beta': 'Extinktion β', 'dash.lwc': 'Wolken-LWC', 'dash.re': 'Eff. Radius r_e', 'dash.N': 'Tröpfchenzahl N',
      'dash.rain': 'Regenrate R', 'dash.qr': 'Regenwasser q_r', 'dash.temp': 'Temperatur T', 'dash.dew': 'Taupunkt Td', 'dash.pres': 'Druck P',
      'kes.on': 'Kessler-Einzelsäulen-Prognose (q_c/q_r)', 'kes.on.tip': 'Integriert Autokonversion & Akkretion je Schicht und liefert die Regenrate; kein Feedback an das 3D-Rendering',
      'kes.reset': 'Kessler-Zustand zurücksetzen', 'kes.reset.tip': 'q_c/q_r und Regenrate löschen',
      'dash.snapEmpty': 'Keine Vergleichs-Snapshots (in „Szenenparameter“ speichern)',
      'dash.formulaTitle': 'Verwendete Formeln (für Methodik)',
      'dash.fNote': 'Hinweis: Einzelstreu-Kugel-Näherung; r_e, N sind diagnostische Eingaben der Wolkenmikrophysik-Parametrisierung.',

      'doc.h1': 'I. Sichtweite & Extinktion (verifizierbarer Kern)',
      'doc.p1': 'Extinktionskoeffizient (Einzelstreu-Kugel-Näherung): β = 3·LWC / (2·ρ_w·r_e), Einheit m⁻¹. LWC ist Flüssigwassergehalt (kg/m³), ρ_w=1000 kg/m³, r_e ist effektiver Tröpfchenradius (m).',
      'doc.p2': 'Sichtweite (Koschmieder-Gesetz): V = -ln(ε)/β = ln(1/ε)/β, Kontrastschwelle ε=0.02 (d.h. V≈3.912/β).',
      'doc.p3': 'Extinktionsspektrum (Ångström): β(λ) = β(λ₀)·(λ₀/λ)^α, α≈0–2; dieses Werkzeug nutzt 550nm als Referenz.',
      'doc.p4': 'Dichtefeld-Normalisierung: normalisierte Dichte d = clamp(LWC / LWC_max, 0, 1) · noise, LWC_max={max} g/m³; Wolken-LWC wird aus der normalisierten Dichte empirisch zurückgerechnet, um β und V zu treiben.',
      'doc.h2': 'II. Wolkenmikrophysik-Parametrisierungs-Mapping (diagnostische Erzählung)',
      'doc.p5': 'Die einstellbaren Parameter dieses Werkzeugs sind bewusst auf „welche Parameter“ klassischer Parametrisierungsschemata abgebildet, damit sie in den Methodenteil einer Arbeit und Sensitivitätstests passen. Aktuelles Standardschema: {scheme}',
      'doc.th.param': 'Parameter', 'doc.th.value': 'Aktuell', 'doc.th.mapsTo': 'Schema-Param / Phys. Bedeutung',
      'doc.h3': 'III. Referenzen & Richtung',
      'doc.p6': 'ETH CLOUDLAB / ICON-LES: Sie nutzen Grobwirbel-Simulation (ICON-LES), um Wolkenimpf-Experimente zu reproduzieren, und stellen fest, dass das simulierte Eiswachstum langsamer ist als beobachtet; sie führen Sensitivitätstests durch, indem sie Parametrisierungsparameter ändern — genau das kann dieses Werkzeug. Ihres ist „langsam, aber genau“ (Fortran, läuft Stunden bis Tage); dieses Werkzeug ist leicht und schnell (Echtzeit im Browser). Richtung: Hinwendung zur „interaktiven Diagnose der Wolkenmikrophysik-Parametrisierung", wobei klar dargelegt wird, welche einstellbaren Parameter zu welchem Schema gehören.',
      'doc.h4': 'IV. Integrationsarchitektur',
      'doc.p7': 'Der Hauptthread übernimmt nur Rendering und UI; die gesamte externe Kommunikation läuft über den Bridge Adapter (eigener Prozess: WebSocket + REST). Das Protokoll lautet „JSON über WebSocket, drei Nachrichtentypen: vollständiger Snapshot / inkrementelles Delta / Telemetrie", Delta zuerst, fester Schritt, schema-versioniert. Die meteorologische Dateneingabeschnittstelle unterstützt METAR/SPECI/TAF (reine Regex-Parsing), BUFR-Sonden und GRIB2-Rasterfelder (serverseitig vor-decodiert).',
      'doc.h5': 'V. Offline-Erklärung',
      'doc.p8': 'Alle Berechnungen erfolgen lokal im Browser; es werden keine Daten gesammelt oder hochgeladen. VIS/RVR/CMV-Umrechnung folgt ICAO Doc 9365 und EASA AMC zu NCO.OP.110 (2024, 5. Aufl.).',
      'doc.lic.h': 'VI. Lizenz- und Nutzungsbedingungen',
      'doc.lic.p1': 'Diese Software ist proprietär; alle Rechte liegen beim Autor. Das GitHub-Repository dient ausschließlich der Versionsverwaltung und Sicherung und begründet keine Lizenz oder öffentliche Genehmigung für Dritte.',
      'doc.lic.p2': 'Nutzungsgenehmigung: Für die Nutzung kontaktieren Sie den Autor bitte für eine schriftliche Genehmigung (E-Mail: {email}).',
      'doc.lic.p3': 'Kostenlose Genehmigung: Für akademische und wissenschaftliche Nutzung in Deutschland, China und Frankreich bei einer vertikalen (Drittmittel-)Förderung unter 30.000 USD darf die Software nach schriftlicher Genehmigung kostenlos genutzt werden, sofern das Projekt zitiert und eine schriftliche Danksagung erfolgt.',
      'doc.lic.p4': 'Andere Nutzungen (kommerziell, Förderung ab diesem Betrag oder andere Länder/Regionen) bedürfen einer gesonderten Vereinbarung und schriftlichen Genehmigung. © Tianyuan.J.Z (Zhang Heinrich). Alle Rechte vorbehalten. Vollständige Bedingungen: LICENSE-TERMS.md im Wurzelverzeichnis.',
      'doc.ack.h': 'VII. Danksagung',
      'doc.ack.p1': 'Danksagung: MonikaSong G.C (Nanjing) für fachliche Unterstützung.',
      'doc.ack.p2': 'Alvin Lv für Unterstützung bei der Stabilitätsprüfung.',
      'doc.ack.p3': 'Huaneng Yuan für Unterstützung beim Testen.',

      'val.intro': 'Eine repräsentative Radiosonden-Stichprobe ist eingebaut (illustrativ, nicht gemessen). Die Modell-Sichtweite wird aus den aktuellen Wolkenmikrophysik-Parametern abgeleitet; rechts steht der Vergleich von „Modell-Schlechtstsichtweite“ mit „Beobachtungsreferenz“ je Höhe. Echte Daten bitte über „Datenschnittstelle“ als BUFR importieren.',
      'val.note': 'Hinweis: Die eingebaute Stichprobe stellt nur Berechnung und Beobachtung nebeneinander; für eine echte Validierung laden Sie tatsächliche Radiosondendaten (University of Wyoming u. a.) und vergleichen die Sichtweite auf gleicher Höhe.',
      'val.th.z': 'Höhe km', 'val.th.p': 'Druck hPa', 'val.th.T': 'T°C', 'val.th.Td': 'Td°C',
      'val.th.vis': 'Modell-Sicht', 'val.th.lwc': 'LWC g/m³', 'val.clear': 'Klarer Himmel',

      'cloud.ci.name': 'Zirrus', 'cloud.ci.band': 'Hohe Wolke 6–13km',
      'cloud.cs.name': 'Altocumulus/Altostratus', 'cloud.cs.band': 'Mittelhohe Wolke 4–8km',
      'cloud.sc.name': 'Stratus/Stratocumulus', 'cloud.sc.band': 'Tiefe Wolke 0.2–2km',
      'cloud.cu.name': 'Cumulus', 'cloud.cu.band': 'Tiefe–mittlere Wolke 0.5–4km',
      'cloud.cb.name': 'Cumulonimbus', 'cloud.cb.band': 'Vertikale Wolke 0.5–12km',

      'out.windDir': 'Windrichtung', 'out.windSpeed': 'Windgeschw.', 'out.surfaceTemp': 'Bodentemp.',
      'out.rh': 'Rel. Feuchte', 'out.cavok': 'CAVOK (≥10km, keine nennenswerte Wolke/Wetter, Wolken unverändert)',
      'out.weather': 'Wetter: ', 'out.sep': '; ', 'out.fog': '⚠ T-Td≤2°C, hohe Wahrscheinlichkeit für Nebel/tiefe Wolke; Werkzeug rechnet Sicht aus LWC zurück.',
      'out.rvrNote': 'RVR (Pisten-Sichtweite) siehe VIS/RVR/CMV-Panel.', 'out.cloudBase': 'Wolkenuntergrenze',
      'wx.int.light': 'leicht', 'wx.int.heavy': 'stark', 'wx.int.vicinity': 'Flughafennähe', 'wx.int.moderate': 'mäßig',

      'tab.metar': 'METAR / TAF', 'tab.vis': 'VIS / RVR / CMV',
      'tab.airport': 'Flughafentabelle', 'tab.bridge': 'Bridge', 'tab.replay': 'Ereignis-Aufzeichnung/Wiedergabe',
      'metar.note': 'Reine Regex-Parsing von METAR / SPECI / TAF (ICAO Annex 3 + WMO FM15/16); Ergebnisse lassen sich mit einem Klick auf die aktuellen Szenenparameter abbilden.',
      'metar.placeholder': 'METAR/SPECI/TAF-Nachricht einfügen, z. B.: ZBAA 231000Z 02003MPS 8000 -RA BKN020 12/09 Q1003 …',
      'metar.parse': 'Parsen', 'metar.apply': 'Parsen & auf Szene anwenden', 'metar.taf': 'Als TAF-Trend parsen',
      'metar.outHint': '(„Parsen“ klicken für Ergebnis)',
      'metar.parseFail': 'Parsen fehlgeschlagen: {msg}', 'metar.applyFail': 'Anwenden fehlgeschlagen: {msg}',
      'metar.applied': 'Angewendet:', 'metar.notesTitle': 'ℹ Hinweise:',
      'vis.note': 'VIS / RVR / CMV drei Modi (ICAO Doc 9365 + EASA NCO.OP.110). CMV dient zum Verifizieren von RVR aus der meteorologischen Sichtweite; verboten bei bereits gemeldetem RVR, Startmindestwerten oder RVR-Untergrenze <800m.',
      'vis.mode.vis': 'VIS Met-Sichtweite', 'vis.mode.rvr': 'RVR Pisten-Sichtweite', 'vis.mode.cmv': 'CMV berechnete Sicht',
      'vis.quick': 'Schnell: ',
      'vis.preset.cavok': 'CAVOK (Sicht≥10km, keine nennenswerte Wolke/Wetter)',
      'vis.preset.cat1': 'CAT-I: RVR≥550m, DH≥200ft',
      'vis.preset.cat2': 'CAT-II: RVR 300-550m, DH 100-200ft',
      'vis.preset.cat3a': 'CAT-IIIA: RVR 175-300m',
      'vis.preset.cat3b': 'CAT-IIIB: RVR 50-175m, keine Entscheidungshöhe',
      'vis.preset.cat3c': 'CAT-IIIC: Null-Sicht-Betrieb',
      'vis.label.visMain': 'Vorherrschende Sichtweite (m)', 'vis.label.visMin': 'Mindestsichtweite (m, opt)',
      'vis.label.visMinDir': 'Mindestsicht-Richtung', 'vis.label.rwy': 'Piste', 'vis.label.trend': 'Trend',
      'vis.opt.up': '↑ Steigend', 'vis.opt.down': '↓ Fallend', 'vis.opt.flat': '○ Unverändert',
      'vis.label.ind': 'Außerhalb-Bereich-Anzeige', 'vis.opt.exact': '● Genau',
      'vis.opt.gt': '○ >Obergrenze(1500)', 'vis.opt.lt': '○ <Untergrenze(50)',
      'vis.label.cvis': 'Met-Sichtweite VIS (m)', 'vis.label.daynight': 'Tag/Nacht',
      'vis.opt.day': 'Tag', 'vis.opt.night': 'Nacht', 'vis.label.light': 'Pistenbeleuchtung',
      'vis.opt.hi': 'HI-Anfluglichter + Pistenlichter', 'vis.opt.other': 'Andere Lichter', 'vis.opt.nolight': 'Keine Lichter',
      'vis.cmvNa': 'CMV n. a.', 'vis.forbidTitle': '⚠ CMV-Verwendung verboten:',
      'vis.calcVis': 'Vorherrschende Sicht', 'vis.calcRvrRunway': ' (Piste ', 'vis.calcRvr': 'ca. Met-Sicht ≈ ',
      'vis.dayShort': 'Tag', 'vis.nightShort': 'Nacht', 'vis.validPrefix': 'gültig: ',
      'vis.reasonNoLight': 'Nachts keine Lichter, CMV n. a.', 'vis.reasonOverMax': 'Überschreitet Flughafen-Max 1500m, nicht als gültig gewertet',
      'bridge.snap': 'Bridge-Snapshot', 'bridge.delta': 'Bridge-Delta',
      'replay.sessionName': 'CloudField-Experimentsitzung', 'replay.statusMax': ', max t={max}ms',
      'vis.forbidRvr': 'RVR bereits gemeldet', 'vis.forbidTakeoff': 'Startmindestwerte', 'vis.forbidRvrMin': 'RVR-Untergrenze <800m',
      'vis.rvrStandard': 'RVR-Standard', 'airport.altInline': 'Höhe',
      'bridge.connected': 'verbunden', 'bridge.notConnected': 'nicht verbunden (Bridge läuft?)',
      'airport.note': 'WGS-84-Tabelle chinesischer Verkehrsflughäfen (repräsentative Teilmenge; vollständige ~250 über Bridge). Unterstützt ICAO / IATA / Namenssuche sowie Meter↔Hundert-Fuß-Umrechnung.',
      'airport.placeholder': 'ICAO/IATA/Name eingeben, z. B. ZBAA oder Chengdu',
      'airport.search': 'Suchen', 'airport.notFound': 'Kein passender Flughafen gefunden',
      'airport.formula': 'Höhenumrechnung: 100ft = 30,48m. Nach Auswahl eines Flughafens werden WGS-84-Breite/-Länge und Höhe angezeigt.',
      'airport.wgsLat': 'WGS-84 Breite', 'airport.wgsLon': 'WGS-84 Länge',
      'airport.elev': 'Höhe (Ellipsoid-Näherung)', 'airport.geoid': 'Geoidhöhe (EGM96-Versatz-Platzhalter)',
      'bridge.note': 'Bridge Adapter ist ein eigener Prozess (WebSocket + REST) und übernimmt METAR/BUFR/GRIB2-Decodierung sowie Multi-Node-Sync. Hauptthread rendert nur & UI; Schlüssel nicht eingebettet.',
      'bridge.addr': 'WebSocket-Adresse', 'bridge.connect': 'Verbinden',
      'bridge.sim': 'Push simulieren (Offline-Demo)', 'bridge.snapshot': 'Snapshot anfordern',
      'bridge.statusIdle': 'Status: getrennt',
      'bridge.statusConnecting': 'Status: verbinde…', 'bridge.statusFail': 'Status: Verbindung fehlgeschlagen {err}',
      'bridge.statusDone': 'Status: {ok}', 'bridge.simDone': 'Beispiel-Snapshot + ein Delta injiziert (Wind→18KT, Sichtweite→600m). Siehe linke Szene & Dashboard.',
      'bridge.simStatus': 'Status: simulierter Push abgeschlossen (offline)',
      'replay.note': 'Vollständige Aufzeichnung des Experiments: snapshot / delta / METAR-Ereignisse, Export als offline abspielbares JSON (entspricht integration_plan Teil 4 Schema).',
      'replay.start': '● Aufzeichnung starten', 'replay.stop': '■ Aufzeichnung stoppen',
      'replay.export': 'Sitzung als JSON exportieren', 'replay.import': 'Sitzung importieren',
      'replay.axis': 'Wiedergabe-Zeitachse (ms)', 'replay.status': 'Ereignisse: {n}',
      'replay.importFail': 'Import fehlgeschlagen: {msg}',

      // Erweiterte Diagnostik (Roadmap #1–#14)
      'grp.adv': 'Erweiterte Diagnostik', 'adv.open': 'Erweiterte Diagnostik', 'adv.title': 'Erweiterte Diagnostik',
      'nav.spectrum': 'Spektrum', 'nav.phases': 'Phasen', 'nav.operators': 'Operatoren',
      'nav.timeseries': 'Zeitreihe', 'nav.spatial': 'Raumfeld', 'nav.sensitivity': 'Sensitivität',
      'nav.qc': 'QC', 'nav.export': 'Betriebsausgabe', 'nav.validation': 'Validierung',
      'nav.recorder': 'Aufnahme', 'nav.report': 'Bericht', 'nav.help': 'Hilfe', 'nav.scenarios': 'Szenarien',
      'spec.title': 'Teilchenspektrum', 'spec.type': 'Spektrumtyp', 'spec.gamma': 'Gamma', 'spec.lognormal': 'Lognormal', 'spec.measured': 'Gemessen',
      'spec.re': 'Effektiver Radius rₑ', 'spec.N': 'Zahldichte N', 'spec.veff': 'Eff. Varianz ν_eff', 'spec.rg': 'Medianradius r_g', 'spec.sigmaG': 'Geo. Std σ_g',
      'spec.import': 'Gemessen importieren', 'spec.moments': 'Spektralmomente',
      'phase.title': 'Phasen & Aerosol', 'phase.water': 'Wolkenwasser', 'phase.ice': 'Eiskristalle', 'phase.snow': 'Schnee', 'phase.graupel': 'Graupel', 'phase.hail': 'Hagel',
      'phase.preset': 'Phasenvoreinstellung', 'phase.pureWater': 'Reine Flüssigkeit', 'phase.mixedIce': 'Gemischtes Eis', 'phase.cirrus': 'Zirrus', 'phase.snowy': 'Schneeartig', 'phase.convective': 'Konvektiv',
      'phase.normalize': 'Normalisieren',
      'aerosol.title': 'Aerosolhintergrund', 'aerosol.on': 'Aerosol aktiv', 'aerosol.beta0': 'Bodenextinktion β0', 'aerosol.scaleH': 'Skalenhöhe',
      'op.title': 'Beobachtungsoperatoren', 'op.visibility': 'Sichtweite', 'op.extSplit': 'Streu/Abs Trennung', 'op.irradiance': 'Sonnen/Himmels-Einstrahlung',
      'op.albedo': 'Wolkenalbedo', 'op.satellite': 'Satelliten-Tb', 'op.lidar': 'Lidar', 'op.radar': 'Radar',
      'ts.title': 'Zeitreihe & Prognose', 'ts.import': 'Zeitreihe CSV importieren', 'ts.default': 'Beispiel Tagesgang', 'ts.apply': 'Zeit anwenden', 'ts.play': 'Abspielen', 'ts.loop': 'Schleife',
      'ts.visCurve': 'Sichtverlauf', 'ts.t0': 'Start(h)', 'ts.t1': 'End(h)',
      'sp.title': 'Raumfeld & Statistik', 'sp.compute': 'Berechnen', 'sp.coverage': 'Bedeckung', 'sp.cloudTop': 'Wolkenobergrenze', 'sp.cloudBase': 'Wolkenuntergrenze',
      'sp.opticalDepth': 'Optische Dicke', 'sp.meanExt': 'Mittlere Extinktion', 'sp.alt': 'Höhe',
      'sen.title': 'Sensitivitätsanalyse', 'sen.paramA': 'Parameter A', 'sen.paramB': 'Parameter B', 'sen.min': 'Min', 'sen.max': 'Max',
      'sen.compute': 'Heatmap berechnen', 'sen.metric': 'Metrik', 'sen.vis': 'Sicht', 'sen.od': 'Optische Dicke',
      'sen.hint': 'Zwei Parameter gegen die gewählte Metrik abtasten. Mit * markierte Parameter werden für den Scan aktiviert (r_e → fester Modus, Aerosol → ein) und danach zurückgesetzt.',
      'sen.cov': 'Bedeckung', 'sen.idle': 'Noch nicht berechnet.', 'sen.running': 'Berechnung {p} %',
      'sen.done': 'Fertig: {lo} → {hi} ({n} Punkte, {ms} ms)',
      'sen.dead': 'Achse {axis} reagiert nicht (Parameter ohne Wirkung auf die Metrik)',
      'sen.flat': '≈ konstant: keine Reaktion für diese Kombination',
      'qc.title': 'Datenqualitätskontrolle', 'qc.import': 'METAR/Sounding einfügen', 'qc.run': 'QC ausführen', 'qc.hint': 'Plausibilität/Fehlend/Anomalie', 'qc.clear': 'Klar',
      'qc.ok': 'OK', 'qc.warn': 'Warnung', 'qc.error': 'Fehler', 'qc.missing': 'Fehlend',
      'ex.title': 'Betriebsausgabe', 'ex.metar': 'METAR/AVMET', 'ex.iwxxm': 'IWXXM XML', 'ex.bufr': 'BUFR Felder', 'ex.grib': 'GRIB Felder',
      'ex.copy': 'Kopieren', 'ex.push': 'An Endpunkt senden', 'ex.endpoint': 'Endpunkt-URL',
      'val2.title': 'Validierung & Fehlermetrik', 'val2.bias': 'Bias', 'val2.rmse': 'RMSE', 'val2.mae': 'MAE', 'val2.corr': 'Korrelation R',
      'val2.scatter': 'Streudiagramm', 'val2.taylor': 'Taylor-Diagramm', 'val2.run': 'Validierung berechnen',
      'rec.title': 'Aufnahme & Wiedergabe', 'rec.start': 'Start', 'rec.stop': 'Stop', 'rec.play': 'Wiedergabe', 'rec.clear': 'Leeren',
      'rec.export': 'Sitzung exportieren', 'rec.import': 'Sitzung importieren', 'rec.count': 'Ereignisse: {n}',
      'rep.title': 'Bericht & Teilen', 'rep.html': 'HTML-Bericht', 'rep.share': 'Link teilen', 'rep.annotate': 'Anmerken', 'rep.exportAnno': 'Annotiert exportieren',
      'help.title': 'Parameterhilfe & Beispiele', 'help.desc': 'Bedeutung & Wirkung', 'help.effect': 'Wirkung', 'help.scenario': 'Beispielszenarien',
      'help.fog': 'Dichter Nebel', 'help.stratus': 'Stratus', 'help.cumulus': 'Cumulus', 'help.cirrus': 'Zirrus',
    },
  };

  // ---------------- 运行时状态 ----------------
  let lang = DEFAULT_LANG;
  const listeners = [];

  function readStored() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && DICT[v]) return v;
    } catch (e) { /* localStorage 不可用（如 file:// 受限）时静默回退 */ }
    return DEFAULT_LANG;
  }
  lang = readStored();

  function t(key, vars) {
    const table = DICT[lang] || DICT[DEFAULT_LANG];
    let s = table[key];
    if (s == null) s = (DICT[DEFAULT_LANG] && DICT[DEFAULT_LANG][key] != null) ? DICT[DEFAULT_LANG][key] : key;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  function getLang() { return lang; }
  function getLangs() { return LANGS.slice(); }

  function apply(root) {
    const el = root || document;
    el.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      const attr = node.getAttribute('data-i18n-attr');
      const val = t(key);
      if (attr) node.setAttribute(attr, val);
      else if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit' || node.type === 'reset')) node.value = val;
      else node.textContent = val;
    });
  }

  function setLang(next) {
    if (!DICT[next]) return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    const htmlLang = next === 'zh' ? 'zh-CN' : (next === 'de' ? 'de' : 'en');
    document.documentElement.lang = htmlLang;
    apply(document);
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { console.error('[i18n] listener error', e); }
    }
  }

  function onLangChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  // 初始化：设置 <html lang> 并应用一次静态文案
  function bootstrap() {
    const htmlLang = lang === 'zh' ? 'zh-CN' : (lang === 'de' ? 'de' : 'en');
    document.documentElement.lang = htmlLang;
    apply(document);
  }

  global.I18N = {
    t, setLang, getLang, getLangs, apply, onLangChange, bootstrap,
    DEFAULT_LANG, LANGS,
  };
})(window);
