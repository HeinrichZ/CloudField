/* mie.js — 米氏消光的紧凑查表（van de Hulst 反常衍射近似 + 多分散粒子谱宽修正）
 * 说明：完整 BHMIE（Mie 级数）在浏览器内代价高，这里用 van de Hulst 反常衍射近似
 *       Q_ext(ρ) = 2 − 4/ρ·sinρ + 4/ρ²·(1−cosρ)，ρ = 2x(n−1)，x = 2πr/λ。
 *       预先在对数网格上建表并线性插值；适用于云滴尺度（x≫1）的工程近似。
 * 多分散谱耦合：当给定 Gamma 谱有效方差 ν_eff ∈ [0, 0.5] 时，采用五点高斯求积对
 *       Q_ext(x) 做谱宽平滑与有效截面修正，使谱型参数（ν_eff / σ_g）直接驱动消光系数。
 */
(function (global) {
  'use strict';

  const LAMBDA_DEFAULT = 550;     // nm，可见光基准
  const N_WATER = 1.33;          // 水滴折射率（实部）
  const XMIN = 1e-2, XMAX = 1e3, NX = 256;

  // 反常衍射近似：消光效率 Q_ext
  function qextAD(x, n) {
    const nn = n == null ? N_WATER : n;
    const rho = 2 * Math.max(0, x) * (nn - 1);
    if (rho < 1e-6) return 0;
    return 2 - 4 / rho * Math.sin(rho) + 4 / (rho * rho) * (1 - Math.cos(rho));
  }

  // 在 [XMIN, XMAX] 对数网格上建表（水滴）
  const LUT = new Float64Array(NX + 1);
  for (let i = 0; i <= NX; i++) {
    const lx = Math.log(XMIN) + (Math.log(XMAX) - Math.log(XMIN)) * i / NX;
    LUT[i] = qextAD(Math.exp(lx), N_WATER);
  }

  function qext(x, n) {
    if (!(x > 0)) return 0;
    if (n != null && Math.abs(n - N_WATER) > 1e-6) return Math.max(0, qextAD(x, n));
    if (x <= XMIN) return LUT[0];
    if (x >= XMAX) return LUT[NX];
    const t = (Math.log(x) - Math.log(XMIN)) / (Math.log(XMAX) - Math.log(XMIN)) * NX;
    const i = Math.floor(t), f = t - i;
    return LUT[i] * (1 - f) + LUT[i + 1] * f;
  }

  // 5 点 Gauss-Hermite 归一求积节点与权重（零均值、单位方差）
  const GH5_Z = [-2.02018287, -0.95857246, 0.0, 0.95857246, 2.02018287];
  const GH5_W = [0.01125741, 0.22207592, 0.53333333, 0.22207592, 0.01125741];

  // 多分散 Gamma 谱消光效率（按有效方差 veff 对 Q_ext 做五点高斯谱宽求积）
  function qextPolydisperse(x, veff) {
    const v = Math.max(0, Math.min(0.5, veff || 0));
    if (v < 1e-3) return qext(x, N_WATER);
    const spread = Math.sqrt(v);
    let qAvg = 0;
    for (let k = 0; k < 5; k++) {
      const z = GH5_Z[k];
      const fac = Math.max(0.15, 1 + z * spread + 0.15 * v * (z * z - 1));
      const xk = Math.max(XMIN, Math.min(XMAX, x * fac));
      qAvg += GH5_W[k] * qext(xk, N_WATER);
    }
    // 谱宽展宽对固定 LWC 下几何截面二阶矩的调制因子
    return qAvg * (1 - 0.18 * v);
  }

  // 消光系数：β = β_geo · (Q_ext/2)，β_geo = 1.5·LWC_gm3/r_e_um  [m⁻¹]
  function betaFromLWC_Mie(lwcGm3, reUm, lambdaNm, veff) {
    const re = Math.max(0.5, reUm);
    const x = 2 * Math.PI * (re * 1e-6) / ((lambdaNm || LAMBDA_DEFAULT) * 1e-9);
    const betaGeo = 1.5 * Math.max(0, lwcGm3) / re;   // m⁻¹
    const q = veff != null ? qextPolydisperse(x, veff) : qext(x, N_WATER);
    return betaGeo * (q / 2);
  }

  // 相对几何光学的修正因子（≈1 表示大滴近似成立）
  function ratio(reUm, lambdaNm, veff) {
    const x = 2 * Math.PI * (Math.max(0.5, reUm) * 1e-6) / ((lambdaNm || LAMBDA_DEFAULT) * 1e-9);
    const q = veff != null ? qextPolydisperse(x, veff) : qext(x, N_WATER);
    return q / 2;
  }

  global.Mie = { qext, qextAD, qextPolydisperse, betaFromLWC_Mie, ratio, LAMBDA_DEFAULT, N_WATER };
})(window);
