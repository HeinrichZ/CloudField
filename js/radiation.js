/* radiation.js — 云辐射的双流近似查表
 * 模型：保守散射反照率用 Cahalan 近似 R0 = τ/(τ + 4/(3(1−g)))，
 *       透射率 T0 = 1 − R0；吸收按 exp(−(1−ω)·τ/μ) 修正（ω 为单次散射反照率）。
 *       在 (τ, μ) 网格上预计算 T/R 表，双线性插值。
 * 校验极限：τ=0 → T=1, R=0；τ→∞、ω=1 → T=0, R→1；ω<1 时 R 随吸收下降。
 * 作者：Heinrich.Z & Tianyuan.J.Z
 * Copyright © 2026 Tianyuan.J.Z (Zhang Heinrich). All Rights Reserved. See LICENSE-TERMS.md.
 */
(function (global) {
  'use strict';

  const G_DEF = 0.85;        // 不对称因子
  const OMEGA_DEF = 0.999;   // 单次散射反照率（云）
  const TAU_MAX = 128, NT = 129;   // τ 网格（线性）
  const NM = 24;                   // μ 网格：0.05..1

  // 解析模型（基于 Coakley & Chýlek 1975 渐近双流近似与光子趋肤深度饱和）：
  // - 保守散射基态：R0 = τ / (τ + 4/(3(1−g)))，T0 = 1 − R0；
  // - 反射光子仅穿透云顶有限趋肤深度 τ_skin ≈ 45（τ→∞ 时有效吸收光程饱和于 τ_skin，保证厚云反照率收敛于 R_∞ > 0.80 而非归零）；
  // - 透射光子穿过整层云厚 τ，按 exp(−(1−ω)·τ/μ) 衰减。
  function model(tau, mu, g, omega) {
    const t = Math.max(0, tau);
    const m = Math.max(0.02, Math.min(1, mu));
    const gg = g == null ? G_DEF : Math.max(0, Math.min(0.95, g));
    const om = omega == null ? OMEGA_DEF : Math.max(0.1, Math.min(1, omega));
    const r0 = t / (t + 4 / (3 * (1 - gg)));
    const coAlbedo = Math.max(0, 1 - om);
    const tauSkin = 45.0;
    const tauRefl = t / (1 + t / tauSkin);
    const absR = Math.exp(-coAlbedo * tauRefl / m);
    const absT = Math.exp(-coAlbedo * t / m);
    const R = r0 * absR;
    const T = (1 - r0) * absT;
    return [T, R];
  }

  // 预计算表：table[(it*NM+im)*2 + 0/1]
  const table = new Float64Array((NT * (NM + 1)) * 2);
  for (let it = 0; it < NT; it++) {
    const tau = TAU_MAX * it / (NT - 1);
    for (let im = 0; im <= NM; im++) {
      const mu = 0.05 + (1 - 0.05) * im / NM;
      const tr = model(tau, mu, G_DEF, OMEGA_DEF);
      const o = (it * (NM + 1) + im) * 2;
      table[o] = tr[0]; table[o + 1] = tr[1];
    }
  }

  function look(tau, mu, omega, g) {
    const t = Math.max(0, Math.min(TAU_MAX, tau));
    const m = Math.max(0.05, Math.min(1, mu));
    // 非默认 ω/g 时直接走解析式（保证物理一致性）
    if ((omega != null && Math.abs(omega - OMEGA_DEF) > 1e-9) ||
        (g != null && Math.abs(g - G_DEF) > 1e-9)) {
      return model(t, m, g, omega);
    }
    const ft = t / TAU_MAX * (NT - 1);
    const fm = (m - 0.05) / (1 - 0.05) * NM;
    const it = Math.min(NT - 2, Math.floor(ft)), im = Math.min(NM - 1, Math.floor(fm));
    const at = ft - it, am = fm - im;
    const o00 = (it * (NM + 1) + im) * 2, o01 = o00 + 2;
    const o10 = ((it + 1) * (NM + 1) + im) * 2, o11 = o10 + 2;
    const lerp = (a, b, f) => a * (1 - f) + b * f;
    const T = lerp(lerp(table[o00], table[o01], am), lerp(table[o10], table[o11], am), at);
    const R = lerp(lerp(table[o00 + 1], table[o01 + 1], am), lerp(table[o10 + 1], table[o11 + 1], am), at);
    return [T, R];
  }

  function transmittance(tau, mu, omega, g) { return look(tau, mu, omega, g)[0]; }
  function reflectance(tau, mu, omega, g) { return look(tau, mu, omega, g)[1]; }
  // 直射透射（未被散射/吸收）
  function direct(tau, mu) { return Math.exp(-Math.max(0, tau) / Math.max(0.05, mu)); }

  global.Radiation = { transmittance, reflectance, direct, model, G_DEF, OMEGA_DEF, TAU_MAX };
})(window);
