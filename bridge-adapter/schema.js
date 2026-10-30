/* schema.js — CloudField 参数 Schema（Bridge /api/schema 返回）
 * 映射到 js/atmosphere.js 的 STATE 字段，供外部系统按路径读写。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
'use strict';

const PARAMETERS = [
  { path: 'atmosphere.temperature', name: '地面温度', type: 'number', unit: '°C', min: -15, max: 40, step: 0.5, group: '场景参数' },
  { path: 'atmosphere.pressure', name: '地面气压', type: 'integer', unit: 'hPa', min: 950, max: 1050, step: 1, group: '场景参数' },
  { path: 'atmosphere.humidity', name: '地面相对湿度', type: 'integer', unit: '%RH', min: 10, max: 100, step: 1, group: '场景参数' },
  { path: 'atmosphere.lapseRate', name: '温度直减率', type: 'number', unit: '°C/km', min: 0, max: 12, step: 0.1, group: '场景参数' },
  { path: 'wind.direction', name: '风向(来向)', type: 'integer', unit: '°', min: 0, max: 360, step: 1, group: '场景参数' },
  { path: 'wind.speed', name: '风速', type: 'number', unit: 'm/s', min: 0, max: 30, step: 0.5, group: '场景参数' },
  { path: 'visibility.value', name: '主导能见度', type: 'integer', unit: 'm', min: 0, max: 9999, step: 50, group: '气象能见度' },
  { path: 'micro.effRadiusUm', name: '云滴有效半径 r_e', type: 'number', unit: 'µm', min: 2, max: 25, step: 0.5, group: '常量与阈值', advanced: true },
  { path: 'micro.dropConc', name: '云滴数浓度 N', type: 'integer', unit: 'cm⁻³', min: 10, max: 1000, step: 10, group: '常量与阈值', advanced: true },
  { path: 'micro.autoConvK', name: '自动转化 k1', type: 'number', unit: '×10⁻³', min: 0.1, max: 5, step: 0.1, group: '常量与阈值', advanced: true },
  { path: 'micro.autoConvQc0', name: '转化阈值 qc0', type: 'number', unit: '×10⁻³', min: 0.1, max: 2, step: 0.1, group: '常量与阈值', advanced: true },
  { path: 'micro.accretK', name: '碰并系数 k2', type: 'number', unit: '', min: 0.5, max: 5, step: 0.1, group: '常量与阈值', advanced: true },
  { path: 'micro.iceFrac', name: '冰相占比', type: 'number', unit: '', min: 0, max: 1, step: 0.02, group: '常量与阈值', advanced: true },
];

module.exports = { schemaVersion: '1.0', parameters: PARAMETERS };
