/* integration.js — CloudField 气象数据接口与系统集成（四层架构）
 *
 * Layer 1  气象数据输入：METAR / SPECI / TAF 纯正则解析 → 参数映射
 *           （ICAO Annex 3 + WMO FM 15 / FM 16）；GRIB2 / BUFR 由 Bridge 服务端预解码
 * Layer 2  民航能见度工作流：VIS / RVR / CMV 三模式切换
 *           （ICAO Doc 9365 + EASA AMC 至 NCO.OP.110，2024 第5版）
 * Layer 3  IPC 接口：WebSocket Delta 协议（snapshot / delta / telemetry）+ REST + 事件录制回放
 * Layer 4  坐标系：WGS-84、中国民航机场表、海拔/大地高换算、米 ↔ 百英尺
 *
 * 全部为纯前端离线运行；与外部系统的通信仅经由独立 Bridge Adapter 进程。
 * 所有用户可见文案经 I18N.t() 取三语（中文/英文/德文，默认德文）。
 *
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright Tianyuan.J.Z©
 */
(function (global) {
  'use strict';

  const A = global.Atmosphere;          // 物理模型（提供 STATE / 换算函数）
  const I18N = global.I18N;             // 三语层（默认德文）
  const SCHEMA = '1.0';                 // Bridge 协议 schema 版本
  const SESSION_ID = 'cf-' + Date.now().toString(36);

  // =====================================================================
  // 模块级状态
  // =====================================================================
  const state = {
    ws: null,                 // WebSocket 实例
    wsUrl: 'ws://127.0.0.1:8787',
    connected: false,
    lastSnapshot: null,       // 最近一次全量快照（用于 initBridge 密钥协商的影子）
    recorder: {               // 事件录制器
      active: false,
      baseTime: 0,
      events: [],
    },
    airportTable: [],         // 机场表（可经 loadAirportTable 扩展）
  };

  // =====================================================================
  // Layer 1 — METAR / SPECI / TAF 解析器
  // =====================================================================
  const Metar = (function () {
    // 单位换算
    function windSpeedToMPS(speed, unit) {
      if (unit === 'KT') return speed * 0.514444;
      if (unit === 'KMH') return speed * 0.277778;
      return speed; // MPS
    }
    function signed(v) { // 报文中的 M05 → -5
      if (typeof v !== 'string') return v;
      return v[0] === 'M' ? -parseInt(v.slice(1), 10) : parseInt(v, 10);
    }
    function dewpointToRH(T, Td) { // Magnus 公式反推相对湿度（由温度与露点）
      // RH = 100 · exp[ a·Td/(b+Td) − a·T/(b+T) ]，a=17.27, b=237.7（°C）
      const a = 17.27, b = 237.7;
      const rh = Math.exp((a * Td) / (b + Td) - (a * T) / (b + T));
      return Math.min(100, Math.max(0, rh * 100));
    }

    // 云量 → okta → 覆盖度(0-1)
    const CLOUD_AMOUNT = {
      FEW: { okta: 1.5, cov: 0.15 }, SCT: { okta: 3.5, cov: 0.35 },
      BKN: { okta: 6, cov: 0.65 }, OVC: { okta: 8, cov: 0.9 },
      NSC: { okta: 0, cov: 0 }, SKC: { okta: 0, cov: 0 }, CLR: { okta: 0, cov: 0 },
    };
    const CLOUD_TYPE_TO_LAYER = {
      CI: 'ci', CS: 'cs', CC: 'cs', AC: 'cs', AS: 'cs', NS: 'sc',
      SC: 'sc', ST: 'sc', CU: 'cu', TCU: 'cu', CB: 'cb',
    };

    // 现在天气代码 → 三语描述（ICAO 现在天气代码；解析时按当前语言取值，缺失回退默认德文再回退代码本身）
    const WX_DESC = {
      zh: {
        BR: '轻雾（能见度≥1000m）', FG: '雾（能见度<1000m）', FU: '烟', VA: '火山灰',
        DU: '浮尘', SA: '沙', HZ: '霾', DZ: '毛毛雨', RA: '雨', SN: '雪', SG: '雪粒',
        IC: '冰晶', PL: '冰丸', GR: '冰雹', GS: '软雹', TS: '雷暴', SH: '阵性降水',
        FZ: '冻结（冻雨/冻雾）', PO: '尘卷风', SQ: '飑', FC: '漏斗云', SS: '沙暴', DS: '尘暴',
      },
      en: {
        BR: 'Mist (vis ≥ 1000 m)', FG: 'Fog (vis < 1000 m)', FU: 'Smoke', VA: 'Volcanic ash',
        DU: 'Widespread dust', SA: 'Sand', HZ: 'Haze', DZ: 'Drizzle', RA: 'Rain', SN: 'Snow', SG: 'Snow grains',
        IC: 'Ice crystals', PL: 'Ice pellets', GR: 'Hail', GS: 'Small hail', TS: 'Thunderstorm', SH: 'Showers',
        FZ: 'Freezing', PO: 'Dust/sand whirls', SQ: 'Squall', FC: 'Funnel cloud', SS: 'Sandstorm', DS: 'Duststorm',
      },
      de: {
        BR: 'leichter Dunst (Sicht ≥ 1000 m)', FG: 'Nebel (Sicht < 1000 m)', FU: 'Rauch', VA: 'Vulkanasche',
        DU: 'verbreiteter Staub', SA: 'Sand', HZ: 'Dunst', DZ: 'Sprühregen', RA: 'Regen', SN: 'Schnee', SG: 'Schneegriesel',
        IC: 'Eiskristalle', PL: 'Eiskörner', GR: 'Hagel', GS: 'Kleinhagel', TS: 'Gewitter', SH: 'Schauer',
        FZ: 'vereist (frierend)', PO: 'Staub-/Sandhose', SQ: 'Sturmbö', FC: 'Trichterwolke', SS: 'Sandsturm', DS: 'Staubsturm',
      },
    };
    function wxDesc(code) {
      const m = WX_DESC[I18N.getLang()] || WX_DESC[I18N.DEFAULT_LANG] || WX_DESC.zh;
      return m[code] || code;
    }
    function weatherDesc(codes) { return (codes || []).map(wxDesc).join('+'); }

    function parse(raw) {
      if (!raw) throw new Error('空报文');
      let s = raw.trim().replace(/=$/, '').replace(/\s+/g, ' ').toUpperCase();
      const tokens = s.split(' ');
      const out = {
        type: 'METAR', station: null, time: null, auto: false,
        wind: null, visibility: null, cavok: false, rvr: [],
        weather: [], clouds: [], temperature: null, dewpoint: null,
        relativeHumidity: null, fogCondition: false, qnh: null,
        trend: null, raw: raw.trim(),
      };

      let i = 0;
      // 类型
      if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') { out.type = tokens[i]; i++; }
      if (tokens[i] === 'NIL') throw new Error('报文不可用 (METAR NIL)');
      // 站台
      out.station = tokens[i++];
      // 时间 DDHHMMZ
      const tm = tokens[i].match(/^(\d{2})(\d{2})(\d{2})Z$/);
      if (tm) { out.time = `${tm[1]}日 ${tm[2]}:${tm[3]}Z`; i++; }
      // AUTO
      if (tokens[i] === 'AUTO') { out.auto = true; i++; }
      // 风
      const windRe = /^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/;
      let m = tokens[i].match(windRe);
      if (m) {
        const speed = parseInt(m[2], 10);
        const unit = m[5];
        out.wind = {
          direction: m[1] === 'VRB' ? 'VRB' : parseInt(m[1], 10),
          speed, speedMPS: windSpeedToMPS(speed, unit), unit,
          gust: m[4] ? parseInt(m[4], 10) : null,
          gustMPS: m[4] ? windSpeedToMPS(parseInt(m[4], 10), unit) : null,
        };
        i++;
        const vRe = /^(\d{3})V(\d{3})$/;
        if (tokens[i] && vRe.test(tokens[i])) { out.wind.varFrom = +tokens[i].split('V')[0]; out.wind.varTo = +tokens[i].split('V')[1]; i++; }
      }
      // 能见度 / CAVOK
      if (tokens[i] === 'CAVOK') { out.cavok = true; out.visibility = 10000; i++; }
      else {
        const visRe = /^(\d{4})$/;
        if (tokens[i] && visRe.test(tokens[i])) {
          const v = tokens[i] === '9999' ? 9999 : parseInt(tokens[i], 10);
          out.visibility = v; i++;
          // 多方向能见度 2000NE
          const dirRe = /^(\d{4})(NE|SE|NW|SW|N|E|S|W)$/;
          if (tokens[i] && dirRe.test(tokens[i])) {
            const dm = tokens[i].match(dirRe);
            out.visibilityMin = parseInt(dm[1], 10); out.visibilityMinDir = dm[2]; i++;
          }
        }
      }
      // RVR（可能多个）
      const rvrRe = /^R(\d{2}[LCR]?)\/([PM]?)(\d{4})([UDN]?)$/;
      while (tokens[i] && rvrRe.test(tokens[i])) {
        const rm = tokens[i].match(rvrRe);
        out.rvr.push({
          runway: rm[1], value: parseInt(rm[3], 10),
          indicator: rm[2] === 'P' ? 'greater_than' : rm[2] === 'M' ? 'less_than' : 'exact',
          trend: rm[4] || 'N',
        });
        i++;
      }
      // 现在天气
      const wxRe = /^(-|\+|VC)?(TS|SH|FZ|RA|DZ|SN|SG|IC|GR|GS|PL|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+$/;
      while (tokens[i] && wxRe.test(tokens[i])) {
        const w = tokens[i];
        const intensity = w[0] === '-' ? I18N.t('wx.int.light') : w[0] === '+' ? I18N.t('wx.int.heavy') : (w.startsWith('VC') ? I18N.t('wx.int.vicinity') : I18N.t('wx.int.moderate'));
        const codes = w.replace(/^(?:-|\+|VC)/, '').match(/TS|SH|FZ|RA|DZ|SN|SG|IC|GR|GS|PL|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS/g) || [];
        out.weather.push({ intensity, codes, desc: weatherDesc(codes) });
        i++;
      }
      // 垂直能见度 VVxxx
      if (tokens[i] && /^VV(\d{3})$/.test(tokens[i])) { out.verticalVisibilityFt = parseInt(tokens[i].slice(2), 10) * 100; i++; }
      // 云组
      const cloudRe = /^(NSC|NCD|SKC|CLR|FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|CI|CS|CC|AC|AS|NS|SC|CU|ST)?$/;
      while (tokens[i] && cloudRe.test(tokens[i])) {
        const cm = tokens[i].match(cloudRe);
        const amt = cm[1], hFt = parseInt(cm[2], 10) * 100;
        out.clouds.push({
          amount: amt, okta: (CLOUD_AMOUNT[amt] || { okta: 0 }).okta,
          coverage: (CLOUD_AMOUNT[amt] || { cov: 0 }).cov,
          heightFt: hFt, heightM: Math.round(hFt * 0.3048),
          type: cm[3] || null, layer: cm[3] ? (CLOUD_TYPE_TO_LAYER[cm[3]] || 'sc') : 'sc',
        });
        i++;
      }
      // 温度/露点
      if (tokens[i] && /^(M?\d{2})\/(M?\d{2})$/.test(tokens[i])) {
        const tm2 = tokens[i].split('/');
        out.temperature = signed(tm2[0]); out.dewpoint = signed(tm2[1]);
        out.relativeHumidity = dewpointToRH(out.temperature, out.dewpoint);
        out.fogCondition = (out.temperature - out.dewpoint) <= 2;
        i++;
      }
      // 气压 QNH
      if (tokens[i] && /^Q(\d{4})$/.test(tokens[i])) { out.qnh = parseInt(tokens[i].slice(1), 10); i++; }
      // TREND（BECMG/TEMPO/NOSIG 到报文结束或 TX/TN）
      if (tokens[i] && /^(BECMG|TEMPO|NOSIG)/.test(tokens[i])) {
        out.trend = tokens.slice(i).join(' ');
      }
      return out;
    }

    // 将解析结果映射到 CloudField 的 Atmosphere.STATE（尽量映射；并记录无法映射项）
    function toScene(report) {
      const S = A.STATE;
      const notes = [], applied = [];
      // 风
      if (report.wind && report.wind.direction !== 'VRB') { S.windDir = report.wind.direction; applied.push(I18N.t('out.windDir') + ' ' + report.wind.direction + '°'); }
      if (report.wind) { S.windSpeed = +report.wind.speedMPS.toFixed(1); applied.push(I18N.t('out.windSpeed') + ' ' + S.windSpeed.toFixed(1) + ' m/s'); }
      // 气压
      if (report.qnh) { S.surfacePressure = report.qnh; applied.push('QNH ' + report.qnh + ' hPa'); }
      // 温/湿
      if (report.temperature != null) { S.surfaceTemp = report.temperature; applied.push(I18N.t('out.surfaceTemp') + ' ' + report.temperature + '°C'); }
      if (report.relativeHumidity != null) { S.surfaceRH = Math.round(report.relativeHumidity); applied.push(I18N.t('out.rh') + ' ' + S.surfaceRH + '%'); }
      // 云组 → 5 个固定层
      if (!report.cavok && report.clouds.length) {
        const reset = ['ci', 'cs', 'sc', 'cu', 'cb'];
        reset.forEach(k => { S.layers[k].on = false; });
        report.clouds.forEach(c => {
          const L = S.layers[c.layer];
          L.on = true;
          const baseKm = Math.max(0.05, c.heightM / 1000);
          L.base = +baseKm.toFixed(2);
          // 厚度按云型估算
          const thick = c.type === 'CB' ? 6 : c.type === 'TCU' ? 3 : c.type === 'CI' || c.type === 'CS' ? 3 : 1.2;
          L.top = +(baseKm + thick).toFixed(2);
          L.coverage = c.coverage;
          applied.push(`${c.amount} ${c.type || ''} ${I18N.t('out.cloudBase')} ${(baseKm).toFixed(2)}km`);
        });
      } else if (report.cavok) {
        applied.push(I18N.t('out.cavok'));
      }
      // 天气提示
      if (report.weather.length) notes.push(I18N.t('out.weather') + report.weather.map(w => w.intensity + w.desc).join(I18N.t('out.sep')));
      if (report.fogCondition) notes.push(I18N.t('out.fog'));
      if (report.rvr.length) notes.push(I18N.t('out.rvrNote'));
      return { applied, notes };
    }

    // 简易 TAF 解析：抽取有效时段(DDHH/DDHH)与趋势段（BECMG/TEMPO）
    function parseTAF(raw) {
      const s = raw.trim().replace(/\s+/g, ' ').toUpperCase();
      const tokens = s.split(' ');
      const out = { type: 'TAF', station: tokens[1] || null, validFrom: null, validTo: null, trends: [], raw: raw.trim() };
      // 有效时段：DDHH/DDHH（4/4）或 DDHHMM/DDHHMM（6/6）
      const period = tokens.find(t => /^\d{4}\/\d{4}$/.test(t) || /^\d{6}\/\d{6}$/.test(t));
      if (period) { const p = period.split('/'); out.validFrom = p[0]; out.validTo = p[1]; }
      // 收集 BECMG/TEMPO 段
      let cur = null;
      for (const t of tokens) {
        if (t === 'BECMG' || t === 'TEMPO') { if (cur) out.trends.push(cur); cur = { kind: t, body: [] }; }
        else if (cur) cur.body.push(t);
      }
      if (cur) out.trends.push(cur);
      return out;
    }

    return { parse, toScene, parseTAF, windSpeedToMPS, dewpointToRH };
  })();

  // =====================================================================
  // Layer 2 — VIS / RVR / CMV 转换（ICAO Doc 9365 / EASA NCO.OP.110）
  // =====================================================================
  const VisConv = (function () {
    // K 系数表（CMV = VIS_met × K；夜间无灯光不适用）
    const K_TABLE = {
      HI_approach: { day: 1.5, night: 2.0 },   // HI 进近灯 + 跑道灯
      other_lights: { day: 1.0, night: 1.5 },  // 其他灯光
      no_lights: { day: 1.0, night: NaN },     // 夜间无灯光
    };
    function kOf(lightType, isNight) {
      const row = K_TABLE[lightType] || K_TABLE.other_lights;
      return row[isNight ? 'night' : 'day'];
    }
    // 由气象能见度推算 CMV（用于与 RVR 对比验证）
    function calcCMV(vis, isNight, lightType) {
      const k = kOf(lightType, isNight);
      if (isNaN(k)) return { value: null, valid: false, reason: I18N.t('vis.reasonNoLight') };
      const v = vis * k;
      return { value: Math.round(v), valid: v <= 1500, k, reason: v > 1500 ? I18N.t('vis.reasonOverMax') : '' };
    }
    // RVR → VIS 反推（同一 K 因子）
    function rvrToVis(rvr, isNight, lightType) {
      const k = kOf(lightType, isNight);
      if (isNaN(k)) return null;
      return Math.round(rvr / k);
    }
    // 禁止使用 CMV 的三种情况
    function forbiddenCases(hasRVR, isTakeoff, rvrMinima) {
      return [
        { label: I18N.t('vis.forbidRvr'), hit: hasRVR },
        { label: I18N.t('vis.forbidTakeoff'), hit: isTakeoff },
        { label: I18N.t('vis.forbidRvrMin'), hit: rvrMinima != null && rvrMinima < 800 },
      ];
    }
    // 运行类别预设
    const PRESETS = {
      CAVOK: { vis: 10000, labelKey: 'vis.preset.cavok' },
      'CAT-I': { vis: 800, rvr: 550, labelKey: 'vis.preset.cat1' },
      'CAT-II': { vis: 400, rvr: 300, labelKey: 'vis.preset.cat2' },
      'CAT-IIIA': { vis: 250, rvr: 175, labelKey: 'vis.preset.cat3a' },
      'CAT-IIIB': { vis: 100, rvr: 50, labelKey: 'vis.preset.cat3b' },
      'CAT-IIIC': { vis: 0, rvr: 0, labelKey: 'vis.preset.cat3c' },
    };
    return { K_TABLE, calcCMV, rvrToVis, forbiddenCases, PRESETS, kOf };
  })();

  // =====================================================================
  // Layer 4 — 坐标系 / 中国民航机场表 / WGS-84 / 单位
  // =====================================================================
  const Coord = (function () {
    // 真实中国民航机场（代表性子集，约 60 个，坐标为 WGS-84 近似，海拔为场压面近似）
    // 完整 ~250 民用机场表由 Bridge Adapter 经 /api/airports 提供，可用 loadAirportTable 注入。
    // 注：本节为人工校核的子集；完整表以 Bridge 提供的权威数据为准。
    const TABLE = [
      ['ZBAA', 'PEK', '北京首都', 40.08, 116.58, 35],
      ['ZBAD', 'PKX', '北京大兴', 39.51, 116.41, 26],
      ['ZBTJ', 'TSN', '天津滨海', 39.12, 117.35, 3],
      ['ZBSJ', 'SJW', '石家庄正定', 38.28, 114.70, 71],
      ['ZBYN', 'TYN', '太原武宿', 37.75, 112.63, 788],
      ['ZBHH', 'HET', '呼和浩特白塔', 40.85, 111.82, 1086],
      ['ZHCC', 'CGO', '郑州新郑', 34.52, 113.84, 151],
      ['ZHES', 'CSX', '长沙黄花', 28.19, 113.22, 72],
      ['ZHHH', 'WUH', '武汉天河', 30.78, 114.21, 35],
      ['ZGGG', 'CAN', '广州白云', 23.39, 113.30, 15],
      ['ZGSZ', 'SZX', '深圳宝安', 22.64, 113.81, 4],
      ['ZGNN', 'NNG', '南宁吴圩', 22.61, 108.17, 127],
      ['ZGKL', 'KWL', '桂林两江', 25.22, 110.04, 173],
      ['ZGOW', 'SWA', '揭阳潮汕', 23.56, 116.66, 4],
      ['ZJHK', 'HAK', '海口美兰', 19.93, 110.46, 23],
      ['ZJSY', 'SYX', '三亚凤凰', 18.30, 109.41, 27],
      ['ZUGY', 'KWE', '贵阳龙洞堡', 26.54, 106.80, 1139],
      ['ZUCK', 'CKG', '重庆江北', 29.72, 106.64, 424],
      ['ZUUU', 'CTU', '成都双流', 30.58, 103.95, 508],
      ['ZUMY', 'MIG', '绵阳南郊', 31.43, 104.69, 519],
      ['ZUGU', 'GYS', '广元盘龙', 32.40, 105.70, 524],
      ['ZUYB', 'YBP', '宜宾五粮液', 28.86, 104.55, 421],
      ['ZLXY', 'XIY', '西安咸阳', 34.45, 108.75, 495],
      ['ZLLL', 'LHW', '兰州中川', 36.52, 103.62, 1947],
      ['ZLCW', 'INC', '银川河东', 37.54, 106.40, 364],
      ['ZLXN', 'XNN', '西宁曹家堡', 36.53, 102.04, 2184],
      ['ZWHM', 'HMI', '哈密', 42.84, 93.67, 824],
      ['ZWTN', 'URC', '乌鲁木齐地窝堡', 43.91, 87.47, 648],
      ['ZWKL', 'KRY', '克拉玛依', 45.22, 84.89, 327],
      ['ZWSH', 'KHG', '喀什', 39.47, 75.99, 1373],
      ['ZWAK', 'AAT', '阿勒泰', 47.75, 88.08, 750],
      ['ZYTX', 'SHE', '沈阳桃仙', 41.64, 123.48, 65],
      ['ZYTL', 'DLC', '大连周水子', 38.97, 121.54, 33],
      ['ZYHB', 'HRB', '哈尔滨太平', 45.62, 126.25, 139],
      ['ZYCC', 'CGQ', '长春龙嘉', 43.99, 125.69, 214],
      ['ZYJD', 'JGD', '佳木斯', 46.84, 130.45, 80],
      ['ZYDD', 'DDG', '丹东', 40.02, 124.29, 36],
      ['ZSAM', 'XMN', '厦门高崎', 24.54, 118.13, 19],
      ['ZSFZ', 'FOC', '福州长乐', 25.93, 119.66, 14],
      ['ZSCN', 'KHN', '南昌昌北', 28.87, 115.90, 44],
      ['ZSHC', 'HFE', '合肥新桥', 31.98, 116.97, 31],
      ['ZSNJ', 'NKG', '南京禄口', 31.74, 118.86, 15],
      ['ZSWZ', 'WNZ', '温州龙湾', 27.91, 120.85, 7],
      ['ZSJU', 'HSN', '舟山普陀山', 29.94, 122.36, 2],
      ['ZSLG', 'LYG', '连云港花果山', 34.32, 119.15, 5],
      ['ZSPD', 'PVG', '上海浦东', 31.15, 121.81, 4],
      ['ZSSS', 'SHA', '上海虹桥', 31.20, 121.34, 3],
      ['ZSOF', 'TXN', '黄山屯溪', 29.73, 118.26, 293],
      ['ZSNT', 'NTG', '南通兴东', 32.07, 120.98, 5],
      ['ZSWX', 'WUX', '无锡硕放', 31.49, 120.43, 5],
      ['ZSCG', 'LLB', '常德桃花源', 28.92, 111.61, 190],
      ['ZSJH', 'JUH', '九华山', 30.43, 117.68, 102],
      ['ZULZ', 'LZO', '泸州云龙', 28.85, 105.39, 320],
      ['ZUDC', 'DCY', '达州金垭', 31.13, 107.52, 450],
      ['ZUKD', 'KGT', '康定', 30.04, 101.95, 4238],
      ['ZJYD', 'YTY', '扬州泰州', 32.56, 119.72, 5],
      ['ZBLF', 'LFQ', '临汾尧都', 36.13, 111.64, 495],
      ['ZBCZ', 'CIH', '长治王村', 36.25, 113.10, 924],
      ['ZBYC', 'YCU', '运城张孝', 35.02, 111.03, 380],
      ['ZBXZ', 'XUZ', '徐州观音', 34.06, 117.18, 40],
      ['ZPLY', 'DAT', '大同云冈', 40.06, 113.48, 1150],
      ['ZJYZ', 'YNZ', '盐城', 33.43, 120.45, 4],
      ['ZGCD', 'HZH', '怀化芷江', 27.44, 109.70, 268],
    ].map(r => ({ icao: r[0], iata: r[1], name: r[2], lat: r[3], lon: r[4], elev: r[5] }));

    state.airportTable = TABLE;

    // 机场名三语（以 ICAO 为键；德文/英文采用现代拼音转写，与德语民航文献一致）
    // Bridge 经 loadAirportTable 注入的未知机场回退到行内自带的 name 字段。
    const AP_NAMES = {
      zh: {
        ZBAA: '北京首都', ZBAD: '北京大兴', ZBTJ: '天津滨海', ZBSJ: '石家庄正定', ZBYN: '太原武宿',
        ZBHH: '呼和浩特白塔', ZHCC: '郑州新郑', ZHES: '长沙黄花', ZHHH: '武汉天河', ZGGG: '广州白云',
        ZGSZ: '深圳宝安', ZGNN: '南宁吴圩', ZGKL: '桂林两江', ZGOW: '揭阳潮汕', ZJHK: '海口美兰',
        ZJSY: '三亚凤凰', ZUGY: '贵阳龙洞堡', ZUCK: '重庆江北', ZUUU: '成都双流', ZUMY: '绵阳南郊',
        ZUGU: '广元盘龙', ZUYB: '宜宾五粮液', ZLXY: '西安咸阳', ZLLL: '兰州中川', ZLCW: '银川河东',
        ZLXN: '西宁曹家堡', ZWHM: '哈密', ZWTN: '乌鲁木齐地窝堡', ZWKL: '克拉玛依', ZWSH: '喀什',
        ZWAK: '阿勒泰', ZYTX: '沈阳桃仙', ZYTL: '大连周水子', ZYHB: '哈尔滨太平', ZYCC: '长春龙嘉',
        ZYJD: '佳木斯', ZYDD: '丹东', ZSAM: '厦门高崎', ZSFZ: '福州长乐', ZSCN: '南昌昌北',
        ZSHC: '合肥新桥', ZSNJ: '南京禄口', ZSWZ: '温州龙湾', ZSJU: '舟山普陀山', ZSLG: '连云港花果山',
        ZSPD: '上海浦东', ZSSS: '上海虹桥', ZSOF: '黄山屯溪', ZSNT: '南通兴东', ZSWX: '无锡硕放',
        ZSCG: '常德桃花源', ZSJH: '九华山', ZULZ: '泸州云龙', ZUDC: '达州金垭', ZUKD: '康定',
        ZJYD: '扬州泰州', ZBLF: '临汾尧都', ZBCZ: '长治王村', ZBYC: '运城张孝', ZBXZ: '徐州观音',
        ZPLY: '大同云冈', ZJYZ: '盐城', ZGCD: '怀化芷江',
      },
      en: {
        ZBAA: 'Beijing Capital', ZBAD: 'Beijing Daxing', ZBTJ: 'Tianjin Binhai', ZBSJ: 'Shijiazhuang Zhengding', ZBYN: 'Taiyuan Wusu',
        ZBHH: 'Hohhot Baita', ZHCC: 'Zhengzhou Xinzheng', ZHES: 'Changsha Huanghua', ZHHH: 'Wuhan Tianhe', ZGGG: 'Guangzhou Baiyun',
        ZGSZ: "Shenzhen Bao'an", ZGNN: 'Nanning Wuxu', ZGKL: 'Guilin Liangjiang', ZGOW: 'Jieyang Chaoshan', ZJHK: 'Haikou Meilan',
        ZJSY: 'Sanya Fenghuang', ZUGY: 'Guiyang Longdongbao', ZUCK: 'Chongqing Jiangbei', ZUUU: 'Chengdu Shuangliu', ZUMY: 'Mianyang Nanjiao',
        ZUGU: 'Guangyuan Panlong', ZUYB: 'Yibin Wuliangye', ZLXY: "Xi'an Xianyang", ZLLL: 'Lanzhou Zhongchuan', ZLCW: 'Yinchuan Hedong',
        ZLXN: 'Xining Caojiapu', ZWHM: 'Hami', ZWTN: 'Urumqi Diwopu', ZWKL: 'Karamay', ZWSH: 'Kashgar',
        ZWAK: 'Altay', ZYTX: 'Shenyang Taoxian', ZYTL: 'Dalian Zhoushuizi', ZYHB: 'Harbin Taiping', ZYCC: 'Changchun Longjia',
        ZYJD: 'Jiamusi', ZYDD: 'Dandong', ZSAM: 'Xiamen Gaoqi', ZSFZ: 'Fuzhou Changle', ZSCN: 'Nanchang Changbei',
        ZSHC: 'Hefei Xinqiao', ZSNJ: 'Nanjing Lukou', ZSWZ: 'Wenzhou Longwan', ZSJU: 'Zhoushan Putuoshan', ZSLG: 'Lianyungang Huaguoshan',
        ZSPD: 'Shanghai Pudong', ZSSS: 'Shanghai Hongqiao', ZSOF: 'Huangshan Tunxi', ZSNT: 'Nantong Xingdong', ZSWX: 'Wuxi Shuofang',
        ZSCG: 'Changde Taohuayuan', ZSJH: 'Jiuhuashan', ZULZ: 'Luzhou Yunlong', ZUDC: 'Dazhou Jinya', ZUKD: 'Kangding',
        ZJYD: 'Yangzhou Taizhou', ZBLF: 'Linfen Yaodu', ZBCZ: 'Changzhi Wangcun', ZBYC: 'Yuncheng Zhangxiao', ZBXZ: 'Xuzhou Guanyin',
        ZPLY: 'Datong Yungang', ZJYZ: 'Yancheng', ZGCD: 'Huaihua Zhijiang',
      },
      de: {
        ZBAA: 'Beijing Capital', ZBAD: 'Beijing Daxing', ZBTJ: 'Tianjin Binhai', ZBSJ: 'Shijiazhuang Zhengding', ZBYN: 'Taiyuan Wusu',
        ZBHH: 'Hohhot Baita', ZHCC: 'Zhengzhou Xinzheng', ZHES: 'Changsha Huanghua', ZHHH: 'Wuhan Tianhe', ZGGG: 'Guangzhou Baiyun',
        ZGSZ: "Shenzhen Bao'an", ZGNN: 'Nanning Wuxu', ZGKL: 'Guilin Liangjiang', ZGOW: 'Jieyang Chaoshan', ZJHK: 'Haikou Meilan',
        ZJSY: 'Sanya Fenghuang', ZUGY: 'Guiyang Longdongbao', ZUCK: 'Chongqing Jiangbei', ZUUU: 'Chengdu Shuangliu', ZUMY: 'Mianyang Nanjiao',
        ZUGU: 'Guangyuan Panlong', ZUYB: 'Yibin Wuliangye', ZLXY: "Xi'an Xianyang", ZLLL: 'Lanzhou Zhongchuan', ZLCW: 'Yinchuan Hedong',
        ZLXN: 'Xining Caojiapu', ZWHM: 'Hami', ZWTN: 'Urumqi Diwopu', ZWKL: 'Karamay', ZWSH: 'Kashgar',
        ZWAK: 'Altay', ZYTX: 'Shenyang Taoxian', ZYTL: 'Dalian Zhoushuizi', ZYHB: 'Harbin Taiping', ZYCC: 'Changchun Longjia',
        ZYJD: 'Jiamusi', ZYDD: 'Dandong', ZSAM: 'Xiamen Gaoqi', ZSFZ: 'Fuzhou Changle', ZSCN: 'Nanchang Changbei',
        ZSHC: 'Hefei Xinqiao', ZSNJ: 'Nanjing Lukou', ZSWZ: 'Wenzhou Longwan', ZSJU: 'Zhoushan Putuoshan', ZSLG: 'Lianyungang Huaguoshan',
        ZSPD: 'Shanghai Pudong', ZSSS: 'Shanghai Hongqiao', ZSOF: 'Huangshan Tunxi', ZSNT: 'Nantong Xingdong', ZSWX: 'Wuxi Shuofang',
        ZSCG: 'Changde Taohuayuan', ZSJH: 'Jiuhuashan', ZULZ: 'Luzhou Yunlong', ZUDC: 'Dazhou Jinya', ZUKD: 'Kangding',
        ZJYD: 'Yangzhou Taizhou', ZBLF: 'Linfen Yaodu', ZBCZ: 'Changzhi Wangcun', ZBYC: 'Yuncheng Zhangxiao', ZBXZ: 'Xuzhou Guanyin',
        ZPLY: 'Datong Yungang', ZJYZ: 'Yancheng', ZGCD: 'Huaihua Zhijiang',
      },
    };
    function airportName(a) {
      if (!a) return '';
      const m = AP_NAMES[I18N.getLang()] || AP_NAMES[I18N.DEFAULT_LANG] || AP_NAMES.zh;
      return m[a.icao] || a.name || a.icao;
    }

    // 大地高 → 海拔（米）；此处以椭球高近似，提供 EGM96 偏移接口占位
    function geoidOffset(lat, lon) { return 0; } // 简化：默认 0，可由 Bridge 提供 EGM96 网格
    function elevationM(airport) { return airport.elev + geoidOffset(airport.lat, airport.lon); }
    // 米 ↔ 百英尺
    function mToHundredFt(m) { return m / 30.48; }
    function hundredFtToM(hf) { return hf * 30.48; }
    function search(q) {
      q = (q || '').toUpperCase();
      if (!q) return state.airportTable;
      return state.airportTable.filter(a => {
        if (a.icao.includes(q) || a.iata.includes(q)) return true;
        for (const lang of Object.keys(AP_NAMES)) {
          const n = AP_NAMES[lang][a.icao];
          if (n && n.toUpperCase().includes(q)) return true;   // 任一语言名称可命中
        }
        return !!(a.name && a.name.toUpperCase().includes(q));
      });
    }
    function byICAO(icao) { return state.airportTable.find(a => a.icao === icao) || null; }
    function loadAirportTable(arr) { if (Array.isArray(arr)) state.airportTable = arr; }

    return { TABLE, elevationM, mToHundredFt, hundredFtToM, search, byICAO, loadAirportTable, geoidOffset, airportName };
  })();

  // =====================================================================
  // Layer 3 — WebSocket Delta 客户端 + 事件录制/回放
  // =====================================================================
  const Bridge = (function () {
    function connect(url) {
      url = url || state.wsUrl;
      state.wsUrl = url;
      try { state.ws = new WebSocket(url); }
      catch (e) { return { ok: false, error: e.message }; }

      state.ws.onopen = () => { state.connected = true; send({ type: 'request_snapshot', id: 'init' }); };
      state.ws.onclose = () => { state.connected = false; };
      state.ws.onerror = () => { state.connected = false; };
      state.ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        handle(msg);
      };
      return { ok: true };
    }
    function send(obj) {
      if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(Object.assign({ schemaVersion: SCHEMA, timestamp: Date.now() }, obj)));
    }
    function handle(msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'ping') { send({ type: 'pong' }); return; }
      if (msg.type === 'snapshot') { applySnapshot(msg.scene || msg.state || msg); record({ type: 'snapshot', label: I18N.t('bridge.snap'), state: msg.scene || msg.state }); }
      else if (msg.type === 'delta') { applyDelta(msg.changes || msg); record({ type: 'delta', label: I18N.t('bridge.delta'), changes: msg.changes || msg }); }
      else if (msg.type === 'metar_result' && msg.raw) { /* 可选处理 */ }
      if (state.onMessage) state.onMessage(msg);
    }
    // 将外部 SceneState 合并进 Atmosphere.STATE（含 layers 深合并）
    function applySnapshot(scene) {
      if (!scene) return;
      const S = A.STATE;
      if (scene.atmosphere) {
        if (scene.atmosphere.temperature != null) S.surfaceTemp = scene.atmosphere.temperature;
        if (scene.atmosphere.pressure != null) S.surfacePressure = scene.atmosphere.pressure;
        if (scene.atmosphere.humidity != null) S.surfaceRH = scene.atmosphere.humidity;
        if (scene.atmosphere.lapseRate != null) S.lapseRate = scene.atmosphere.lapseRate;
      }
      if (scene.wind) {
        if (scene.wind.direction != null) S.windDir = scene.wind.direction;
        if (scene.wind.speed != null) S.windSpeed = Metar.windSpeedToMPS(scene.wind.speed, scene.wind.speedUnit || 'MPS');
      }
      if (scene.visibility && scene.visibility.value != null) {
        // 用能见度反推“雾密度”：低于 1000m 时增强低云/雾的覆盖
        const v = scene.visibility.value;
        S.surfaceRH = v < 1000 ? Math.min(100, 60 + (1000 - v) / 10) : S.surfaceRH;
      }
      if (Array.isArray(scene.clouds)) {
        scene.clouds.forEach((c, idx) => {
          const key = c.type === 'cumulonimbus' ? 'cb' : c.type === 'cirrus' ? 'ci' : c.type === 'altocumulus' || c.type === 'altostratus' ? 'cs' : c.type === 'cumulus' ? 'cu' : 'sc';
          const L = S.layers[key]; if (!L) return;
          L.on = true;
          L.base = Math.max(0.05, (c.baseHeight || 600) / 1000);
          L.top = Math.max(L.base + 0.5, ((c.baseHeight || 600) + (c.thickness || 1000)) / 1000);
          if (c.density != null) L.density = c.density;
          if (c.amount) { /* 覆盖度可由 amount 估算，已在 METAR 中处理 */ }
        });
      }
      refreshUI();
    }
    function applyDelta(changes) {
      if (!changes) return;
      // 支持点路径（如 'wind.speed'）与扁平键
      Object.keys(changes).forEach(path => {
        const v = changes[path];
        const parts = path.split('.');
        if (parts.length === 2 && parts[0] === 'wind' && parts[1] === 'speed') S_windSpeed(v);
        else if (parts.length === 1) {
          const S = A.STATE;
          if (path in S && typeof v === typeof S[path]) S[path] = v;
          else if (path.startsWith('micro.')) { const k = path.slice(6); if (k in S.micro) S.micro[k] = v; }
        }
      });
      refreshUI();
    }
    function S_windSpeed(v) { A.STATE.windSpeed = Metar.windSpeedToMPS(v, 'MPS'); }

    function refreshUI() {
      if (global.GUI && global.GUI.build) global.GUI.build();
      if (global.__cf && global.__cf.onChange) global.__cf.onChange();
    }

    // ---- 事件录制 ----
    function record(ev) {
      if (!state.recorder.active) return;
      const t = Date.now() - state.recorder.baseTime;
      state.recorder.events.push(Object.assign({ t }, ev));
    }
    function startRecording() { state.recorder.active = true; state.recorder.baseTime = Date.now(); state.recorder.events = []; }
    function stopRecording() { state.recorder.active = false; }
    function exportSession(name) {
      const session = {
        sessionId: SESSION_ID, schemaVersion: '1.0', name: name || I18N.t('replay.sessionName'),
        createdAt: new Date(state.recorder.baseTime).toISOString(),
        duration: Date.now() - state.recorder.baseTime,
        initialState: A.serialize(),
        events: state.recorder.events,
        meta: { softwareVersion: A.APP_NAME + ' ' + A.SNAPSHOT_VERSION, airport: 'ANY' },
      };
      const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'CloudField_session_' + SESSION_ID + '.json'; a.click();
      URL.revokeObjectURL(a.href);
      return session;
    }
    function importSession(json) {
      const sess = typeof json === 'string' ? JSON.parse(json) : json;
      if (!sess.events) throw new Error('会话格式无效');
      state.recorder.events = sess.events;
      return sess;
    }
    // 回放：按时间轴把事件依次应用到 STATE
    function replayAt(tMs) {
      const evs = state.recorder.events.filter(e => e.t <= tMs);
      // 先复位到初始（若有），再顺序应用
      evs.forEach(e => {
        if (e.type === 'snapshot' && e.state) A.deserialize(typeof e.state === 'string' ? JSON.parse(e.state) : e.state);
        else if (e.type === 'delta' && e.changes) applyDelta(e.changes);
        else if (e.type === 'metar' && e.raw) { try { const r = Metar.parse(e.raw); Metar.toScene(r); } catch (_) {} }
      });
      refreshUI();
    }

    return {
      connect, send, handle, applySnapshot, applyDelta,
      startRecording, stopRecording, exportSession, importSession, replayAt,
      get connected() { return state.connected; },
      get events() { return state.recorder.events; },
    };
  })();

  // =====================================================================
  // UI：renderInto(el) — 在“数据接口”弹窗中构建四层交互界面
  // =====================================================================
  function renderInto(root) {
    root.innerHTML = `
      <div class="int-tabs">
        <button data-tab="metar" class="active">${I18N.t('tab.metar')}</button>
        <button data-tab="vis">${I18N.t('tab.vis')}</button>
        <button data-tab="airport">${I18N.t('tab.airport')}</button>
        <button data-tab="bridge">${I18N.t('tab.bridge')}</button>
        <button data-tab="replay">${I18N.t('tab.replay')}</button>
      </div>
      <div class="int-body">
        <div data-pane="metar" class="int-pane active"></div>
        <div data-pane="vis" class="int-pane"></div>
        <div data-pane="airport" class="int-pane"></div>
        <div data-pane="bridge" class="int-pane"></div>
        <div data-pane="replay" class="int-pane"></div>
      </div>`;
    const panes = {
      metar: root.querySelector('[data-pane="metar"]'),
      vis: root.querySelector('[data-pane="vis"]'),
      airport: root.querySelector('[data-pane="airport"]'),
      bridge: root.querySelector('[data-pane="bridge"]'),
      replay: root.querySelector('[data-pane="replay"]'),
    };
    root.querySelectorAll('.int-tabs button').forEach(b => {
      b.onclick = () => {
        root.querySelectorAll('.int-tabs button').forEach(x => x.classList.remove('active'));
        root.querySelectorAll('.int-pane').forEach(x => x.classList.remove('active'));
        b.classList.add('active'); panes[b.dataset.tab].classList.add('active');
      };
    });
    buildMetarPane(panes.metar);
    buildVisPane(panes.vis);
    buildAirportPane(panes.airport);
    buildBridgePane(panes.bridge);
    buildReplayPane(panes.replay);
  }

  function buildMetarPane(el) {
    el.innerHTML = `
      <p class="int-note">${I18N.t('metar.note')}</p>
      <textarea id="metar-input" rows="4" style="width:100%;font-family:monospace" placeholder="METAR ZBAA 141050Z 24015G28KT 210V280 0800 R27L/0900U +TSRA BR FEW012CB BKN020 12/M01 Q1003 BECMG 6000 NSW TEMPO RA">METAR ZBAA 141050Z 24015G28KT 210V280 0800 R27L/0900U +TSRA BR FEW012CB BKN020 12/M01 Q1003 BECMG 6000 NSW TEMPO RA</textarea>
      <div class="btn-row wrap">
        <button class="act" id="metar-parse">${I18N.t('metar.parse')}</button>
        <button class="act" id="metar-apply">${I18N.t('metar.apply')}</button>
        <button class="act" id="taf-parse">${I18N.t('metar.taf')}</button>
      </div>
      <pre id="metar-out" class="int-out">${I18N.t('metar.outHint')}</pre>`;
    const input = el.querySelector('#metar-input');
    const out = el.querySelector('#metar-out');
    el.querySelector('#metar-parse').onclick = () => {
      try { const r = Metar.parse(input.value); out.textContent = JSON.stringify(r, null, 2); }
      catch (e) { out.textContent = I18N.t('metar.parseFail', { msg: e.message }); }
    };
    el.querySelector('#metar-apply').onclick = () => {
      try {
        const r = Metar.parse(input.value);
        const { applied, notes } = Metar.toScene(r);
        out.textContent = I18N.t('metar.applied') + '\n- ' + applied.join('\n- ') + (notes.length ? '\n\n' + I18N.t('metar.notesTitle') + '\n- ' + notes.join('\n- ') : '');
        if (global.GUI && global.GUI.build) global.GUI.build();
        if (global.__cf && global.__cf.onChange) global.__cf.onChange();
        Bridge.startRecording(); recordOnce({ type: 'metar', label: r.station, raw: r.raw }); Bridge.stopRecording();
      } catch (e) { out.textContent = I18N.t('metar.applyFail', { msg: e.message }); }
    };
    el.querySelector('#taf-parse').onclick = () => {
      try { const t = Metar.parseTAF(input.value); out.textContent = JSON.stringify(t, null, 2); }
      catch (e) { out.textContent = I18N.t('metar.parseFail', { msg: e.message }); }
    };
  }
  function recordOnce(ev) { // 临时录制单条
    const wasActive = state.recorder.active;
    if (!wasActive) { state.recorder.active = true; if (!state.recorder.baseTime) state.recorder.baseTime = Date.now() - 1; }
    Bridge.exportSession && (state.recorder.events.push(Object.assign({ t: Date.now() - state.recorder.baseTime }, ev)));
    if (!wasActive) state.recorder.active = false;
  }

  function buildVisPane(el) {
    el.innerHTML = `
      <p class="int-note">${I18N.t('vis.note')}</p>
      <div class="btn-row wrap" id="vis-mode">
        <button class="act active" data-mode="VIS">${I18N.t('vis.mode.vis')}</button>
        <button class="act" data-mode="RVR">${I18N.t('vis.mode.rvr')}</button>
        <button class="act" data-mode="CMV">${I18N.t('vis.mode.cmv')}</button>
      </div>
      <div id="vis-area"></div>
      <div class="btn-row wrap" id="vis-preset">
        <span style="align-self:center">${I18N.t('vis.quick')}</span>
        <button class="act" data-p="CAVOK">CAVOK</button>
        <button class="act" data-p="CAT-I">CAT-I</button>
        <button class="act" data-p="CAT-II">CAT-II</button>
        <button class="act" data-p="CAT-IIIA">CAT-IIIA</button>
        <button class="act" data-p="CAT-IIIB">CAT-IIIB</button>
        <button class="act" data-p="CAT-IIIC">CAT-IIIC</button>
      </div>
      <pre id="vis-out" class="int-out"></pre>`;
    const area = el.querySelector('#vis-area');
    const out = el.querySelector('#vis-out');
    let mode = 'VIS';
    const draw = () => {
      if (mode === 'VIS') area.innerHTML = visVisTpl();
      else if (mode === 'RVR') area.innerHTML = visRvrTpl();
      else area.innerHTML = visCmvTpl();
      bind();
    };
    const visVisTpl = () => `
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.visMain')}</label><span class="val" id="v-vis">800</span></div>
        <input type="range" id="i-vis" min="0" max="9999" step="50" value="800"></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.visMin')}</label><span class="val" id="v-vmin">2000</span></div>
        <input type="range" id="i-vmin" min="0" max="9999" step="50" value="2000"></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.visMinDir')}</label></div>
        <select id="i-vdir"><option value="">—</option><option>N</option><option>NE</option><option>E</option><option>SE</option><option>S</option><option>SW</option><option>W</option><option>NW</option></select></div>`;
    const visRvrTpl = () => `
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.rwy')}</label></div>
        <input type="text" id="i-rwy" value="27L" style="width:80px"></div>
      <div class="ctrl"><div class="row"><label>RVR (m)</label><span class="val" id="v-rvr">900</span></div>
        <input type="range" id="i-rvr" min="0" max="2000" step="25" value="900"></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.trend')}</label></div>
        <select id="i-rtrend"><option value="U">${I18N.t('vis.opt.up')}</option><option value="D">${I18N.t('vis.opt.down')}</option><option value="N" selected>${I18N.t('vis.opt.flat')}</option></select></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.ind')}</label></div>
        <select id="i-rind"><option value="exact">${I18N.t('vis.opt.exact')}</option><option value="greater_than">${I18N.t('vis.opt.gt')}</option><option value="less_than">${I18N.t('vis.opt.lt')}</option></select></div>`;
    const visCmvTpl = () => `
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.cvis')}</label><span class="val" id="v-cvis">800</span></div>
        <input type="range" id="i-cvis" min="0" max="9999" step="50" value="800"></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.daynight')}</label></div>
        <select id="i-cnight"><option value="0">${I18N.t('vis.opt.day')}</option><option value="1" selected>${I18N.t('vis.opt.night')}</option></select></div>
      <div class="ctrl"><div class="row"><label>${I18N.t('vis.label.light')}</label></div>
        <select id="i-clight"><option value="HI_approach">${I18N.t('vis.opt.hi')}</option><option value="other_lights">${I18N.t('vis.opt.other')}</option><option value="no_lights">${I18N.t('vis.opt.nolight')}</option></select></div>
      <div id="cmv-result" class="formula"></div>
      <div id="cmv-forbid" class="warn"></div>`;
    const bind = () => {
      if (mode === 'VIS') {
        const i = area.querySelector('#i-vis'), v = area.querySelector('#v-vis');
        i.oninput = () => { v.textContent = i.value; out.textContent = `${I18N.t('vis.calcVis')} ${i.value} m\nβ = 3.912/${i.value} = ${(3912 / i.value).toFixed(4)} m⁻¹`; };
        i.oninput();
      } else if (mode === 'RVR') {
        const i = area.querySelector('#i-rvr'), v = area.querySelector('#v-rvr');
        i.oninput = () => { v.textContent = i.value; out.textContent = `RVR ${i.value} m${I18N.t('vis.calcRvrRunway')}${area.querySelector('#i-rwy').value}）\n${I18N.t('vis.calcRvr')}${VisConv.rvrToVis(+i.value, false, 'HI_approach')} m`; };
        area.querySelector('#i-rwy').oninput = area.querySelector('#i-rvr').oninput;
        i.oninput();
      } else {
        const upd = () => {
          const vis = +area.querySelector('#i-cvis').value;
          area.querySelector('#v-cvis').textContent = vis;
          const isNight = area.querySelector('#i-cnight').value === '1';
          const lt = area.querySelector('#i-clight').value;
          const r = VisConv.calcCMV(vis, isNight, lt);
          area.querySelector('#cmv-result').textContent = r.value == null ? I18N.t('vis.cmvNa') : `CMV = ${vis} × ${r.k} = ${r.value} m`;
          const f = VisConv.forbiddenCases(true, false, null);
          area.querySelector('#cmv-forbid').innerHTML = I18N.t('vis.forbidTitle') + '<br>' + f.map(x => `□ ${x.label}`).join('<br>');
          out.textContent = `CMV = ${vis} × K(${lt},${isNight ? I18N.t('vis.nightShort') : I18N.t('vis.dayShort')}) = ${r.value}\n${I18N.t('vis.validPrefix')}${r.valid}${r.reason ? ' — ' + r.reason : ''}`;
        };
        area.querySelector('#i-cvis').oninput = upd;
        area.querySelector('#i-cnight').onchange = upd;
        area.querySelector('#i-clight').onchange = upd;
        upd();
      }
    };
    el.querySelectorAll('#vis-mode button').forEach(b => b.onclick = () => {
      el.querySelectorAll('#vis-mode button').forEach(x => x.classList.remove('active')); b.classList.add('active'); mode = b.dataset.mode; draw();
    });
    el.querySelectorAll('#vis-preset button').forEach(b => b.onclick = () => {
      const p = VisConv.PRESETS[b.dataset.p];
      out.textContent = I18N.t(p.labelKey) + (p.rvr != null ? `\n${I18N.t('vis.rvrStandard')} ${p.rvr} m` : '');
    });
    draw();
  }

  function buildAirportPane(el) {
    el.innerHTML = `
      <p class="int-note">${I18N.t('airport.note')}</p>
      <div class="btn-row"><input type="text" id="ap-q" placeholder="${I18N.t('airport.placeholder')}" style="flex:1">
        <button class="act" id="ap-search">${I18N.t('airport.search')}</button></div>
      <div id="ap-out" class="int-out" style="max-height:240px;overflow:auto"></div>
      <div class="formula">${I18N.t('airport.formula')}</div>`;
    const out = el.querySelector('#ap-out');
    const render = (list) => {
      out.innerHTML = list.length ? list.map(a =>
        `<div class="ap-row" data-icao="${a.icao}" style="cursor:pointer;padding:4px 6px;border-bottom:1px solid #eee">
          <b>${a.icao}</b> / ${a.iata} — ${Coord.airportName(a)}　(${a.lat.toFixed(2)}, ${a.lon.toFixed(2)})　${I18N.t('airport.altInline')} ${a.elev}m / ${Coord.mToHundredFt(a.elev).toFixed(1)}×100ft</div>`).join('')
        : I18N.t('airport.notFound');
      out.querySelectorAll('.ap-row').forEach(r => r.onclick = () => {
        const a = Coord.byICAO(r.dataset.icao);
        out.innerHTML = `<div class="ap-detail">
          <h4>${a.icao} / ${a.iata} — ${Coord.airportName(a)}</h4>
          <div>${I18N.t('airport.wgsLat')}：${a.lat.toFixed(4)}°</div>
          <div>${I18N.t('airport.wgsLon')}：${a.lon.toFixed(4)}°</div>
          <div>${I18N.t('airport.elev')}：${a.elev} m = ${Coord.mToHundredFt(a.elev).toFixed(1)}×100ft</div>
          <div>${I18N.t('airport.geoid')}：${Coord.elevationM(a)} m</div>
        </div>` + out.innerHTML;
      });
    };
    el.querySelector('#ap-search').onclick = () => render(Coord.search(el.querySelector('#ap-q').value));
    render(Coord.TABLE); // 初始展示全部
  }

  function buildBridgePane(el) {
    el.innerHTML = `
      <p class="int-note">${I18N.t('bridge.note')}</p>
      <div class="ctrl"><div class="row"><label>${I18N.t('bridge.addr')}</label></div>
        <input type="text" id="ws-url" value="${state.wsUrl}" style="width:100%"></div>
      <div class="btn-row wrap">
        <button class="act" id="ws-connect">${I18N.t('bridge.connect')}</button>
        <button class="act" id="ws-sim">${I18N.t('bridge.sim')}</button>
        <button class="act" id="ws-snapshot">${I18N.t('bridge.snapshot')}</button>
      </div>
      <div id="ws-status" class="formula">${I18N.t('bridge.statusIdle')}</div>
      <pre id="ws-out" class="int-out" style="max-height:200px;overflow:auto"></pre>`;
    const status = el.querySelector('#ws-status');
    const out = el.querySelector('#ws-out');
    el.querySelector('#ws-connect').onclick = () => {
      const r = Bridge.connect(el.querySelector('#ws-url').value);
      status.textContent = r.ok ? I18N.t('bridge.statusConnecting') : I18N.t('bridge.statusFail', { err: r.error });
      setTimeout(() => { status.textContent = I18N.t('bridge.statusDone', { ok: Bridge.connected ? I18N.t('bridge.connected') : I18N.t('bridge.notConnected') }); }, 800);
    };
    el.querySelector('#ws-snapshot').onclick = () => Bridge.send({ type: 'request_snapshot', id: 'ui' });
    el.querySelector('#ws-sim').onclick = () => {
      // 离线演示：构造一份 snapshot 与 delta，验证 Delta 协议往返一致
      const snap = { type: 'snapshot', schemaVersion: SCHEMA, scene: {
        airport: 'ZBAA', location: { lat: 40.08, lon: 116.58, alt: 35 },
        wind: { direction: 240, speed: 15, speedUnit: 'KT' }, visibility: { value: 800, unit: 'm', source: 'metar' },
        atmosphere: { temperature: 12, dewpoint: -1, pressure: 1003, humidity: 41, lapseRate: 6.5 },
        clouds: [{ type: 'cumulonimbus', amount: 'FEW', baseHeight: 365, thickness: 3000, density: 0.72, phase: 'liquid' },
                 { type: 'stratus', amount: 'BKN', baseHeight: 610, thickness: 400, density: 0.65, phase: 'liquid' }],
        solar: { elevation: 45, azimuth: 180, isDaytime: true } } };
      Bridge.handle(JSON.parse(JSON.stringify(snap)));
      setTimeout(() => Bridge.handle({ type: 'delta', schemaVersion: SCHEMA, changes: { 'wind.speed': 18, 'wind.gust': 32, 'visibility.value': 600 } }), 600);
      out.textContent = I18N.t('bridge.simDone');
      status.textContent = I18N.t('bridge.simStatus');
    };
  }

  function buildReplayPane(el) {
    el.innerHTML = `
      <p class="int-note">${I18N.t('replay.note')}</p>
      <div class="btn-row wrap">
        <button class="act" id="rec-toggle">${I18N.t('replay.start')}</button>
        <button class="act" id="rec-export">${I18N.t('replay.export')}</button>
        <button class="act" id="rec-import">${I18N.t('replay.import')}</button>
      </div>
      <div class="ctrl" style="margin-top:8px"><div class="row"><label>${I18N.t('replay.axis')}</label><span class="val" id="rp-t">0</span></div>
        <input type="range" id="rp-slider" min="0" max="1000" step="10" value="0" style="width:100%"></div>
      <div id="rp-status" class="formula">${I18N.t('replay.status', { n: 0 })}</div>
      <pre id="rp-out" class="int-out" style="max-height:160px;overflow:auto"></pre>`;
    const status = el.querySelector('#rp-status');
    const out = el.querySelector('#rp-out');
    const slider = el.querySelector('#rp-slider');
    const refresh = () => {
      const evs = Bridge.events;
      const max = evs.length ? Math.max(...evs.map(e => e.t)) : 0;
      status.textContent = I18N.t('replay.status', { n: evs.length }) + (evs.length ? I18N.t('replay.statusMax', { max }) : '');
      out.textContent = evs.map(e => `[${e.t}ms] ${e.type}${e.label ? ' · ' + e.label : ''}`).join('\n');
      slider.max = evs.length ? max : 1000;
    };
    el.querySelector('#rec-toggle').onclick = (e) => {
      if (!state.recorder.active) { Bridge.startRecording(); e.target.textContent = I18N.t('replay.stop'); e.target.classList.add('rec-on'); }
      else { Bridge.stopRecording(); e.target.textContent = I18N.t('replay.start'); e.target.classList.remove('rec-on'); }
      refresh();
    };
    el.querySelector('#rec-export').onclick = () => { Bridge.exportSession(); refresh(); };
    el.querySelector('#rec-import').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader();
        r.onload = () => { try { Bridge.importSession(r.result); refresh(); } catch (e2) { alert(I18N.t('replay.importFail', { msg: e2.message })); } }; r.readAsText(f); };
      inp.click();
    };
    slider.oninput = () => { el.querySelector('#rp-t').textContent = slider.value; Bridge.replayAt(+slider.value); };
    refresh();
  }

  // initBridge：由 main.js 在启动时调用，用于可选地连接 Bridge（默认不自动连接，避免离线报错）
  function initBridge() { /* 默认不自动连接；用户在“Bridge”页手动连接或模拟推送 */ }

  function init() {
    // 语言切换：若数据接口面板已构建，则用新语言重建
    I18N.onLangChange(() => {
      const body = document.getElementById('integration-body');
      if (body && body.dataset.built) {
        body.innerHTML = ''; body.dataset.built = '';
        renderInto(body); body.dataset.built = '1';
      }
    });
  }

  global.Integration = {
    init, initBridge, renderInto,
    parse: Metar.parse, parseTAF: Metar.parseTAF, toScene: Metar.toScene,
    VisConv, Coord, Bridge,
    get state() { return state; },
  };
})(window);
