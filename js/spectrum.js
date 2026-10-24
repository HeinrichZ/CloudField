/* spectrum.js — 粒子谱模型与谱矩（#4）
 * 支持三类谱：Gamma、对数正态、实测谱导入。
 * 由谱参数计算数浓度 N、有效半径 r_e、有效方差 ν_eff、液态水含量 LWC。
 * 关系（Gamma / 对数正态通用近似）：
 *   r_e = r_g · exp(2.5·ln²σ_g)，  ν_eff = exp(ln²σ_g) − 1
 *   LWC = ρ_w · (4π/3) · N · r_e³ · (1 + 3·ν_eff)
 * 实测谱：对 bin 求和 LWC = ρ_w·(4π/3)·Σ r³·(dN/dlnr)·Δlnr。
 */
(function (global) {
  'use strict';
  const A = global.Atmosphere;
  const RHO_W = A.RHO_W;          // 1000 kg/m³
  const S = A.STATE;

  // 由 (N, r_e, ν_eff) 计算 LWC（kg/m³ 与 g/m³）
  function lwcFromMoments(N_cm3, re_um, veff) {
    const r = re_um * 1e-6;                       // m
    const N = Math.max(0, N_cm3) * 1e6;           // m⁻³
    const LWCkg = RHO_W * (4 * Math.PI / 3) * N * Math.pow(r, 3) * (1 + 3 * (veff || 0));
    return { kg: LWCkg, gm3: LWCkg * 1000 };
  }

  function moments() {
    const sp = S.spectrum;
    if (sp.type === 'lognormal') {
      const lnSg = Math.log(sp.sigmaG);
      const re = sp.rg * Math.exp(2.5 * lnSg * lnSg);
      const veff = Math.exp(lnSg * lnSg) - 1;
      const m = lwcFromMoments(sp.N, re, veff);
      return { type: 'lognormal', N: sp.N, re, veff, LWCkg: m.kg, LWCgm3: m.gm3 };
    }
    if (sp.type === 'measured' && sp.measured && sp.measured.length) {
      const bins = sp.measured;
      let N = 0, sumR2 = 0, sumR3 = 0, LWCkg = 0;
      for (let i = 0; i < bins.length; i++) {
        const r = bins[i].r * 1e-6, dN = bins[i].dNdlnr * 1e6; // m⁻³ per lnr
        let dln = bins[i].dln || 0;
        if (i < bins.length - 1) dln = Math.log(bins[i + 1].r / bins[i].r);
        else if (i > 0 && !dln) dln = Math.log(bins[i].r / bins[i - 1].r);
        N += dN * dln;
        sumR2 += r * r * dN * dln;
        sumR3 += r * r * r * dN * dln;
        LWCkg += RHO_W * (4 * Math.PI / 3) * r * r * r * dN * dln;
      }
      const re = sumR2 > 0 ? (sumR3 / sumR2) * 1e6 : 0;
      const veff = 0; // 实测谱不直接给出 ν_eff，按等效球处理
      const num = N / 1e6;
      return { type: 'measured', N: num, re, veff, LWCkg, LWCgm3: LWCkg * 1000 };
    }
    // 默认 Gamma
    const m = lwcFromMoments(sp.N, sp.re, sp.veff);
    return { type: 'gamma', N: sp.N, re: sp.re, veff: sp.veff, LWCkg: m.kg, LWCgm3: m.gm3 };
  }

  // 解析实测谱文本：每行 "r(µm)  dNdlnr(cm⁻³)"，空行/井号注释忽略
  function parseMeasured(text) {
    const lines = (text || '').split(/\r?\n/);
    const bins = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || t[0] === '#') continue;
      const m = t.split(/[\s,;]+/).map(Number);
      if (m.length >= 2 && isFinite(m[0]) && isFinite(m[1])) bins.push({ r: m[0], dNdlnr: m[1] });
    }
    return bins.length >= 2 ? bins : null;
  }
  function importMeasured(text) {
    const bins = parseMeasured(text);
    if (!bins) return { ok: false, msg: '实测谱至少需要 2 个有效 bin' };
    S.spectrum.type = 'measured';
    S.spectrum.measured = bins;
    return { ok: true, bins: bins.length, moments: moments() };
  }

  global.Spectrum = { moments, lwcFromMoments, parseMeasured, importMeasured };
})(window);
