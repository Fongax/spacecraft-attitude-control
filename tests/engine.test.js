/*
 * engine.test.js: assertions for the simulation engine (adcs-math.js and
 * adcs-sim.js). Reproduces every reference value of the site plan (section 8)
 * within its stated tolerance, plus the convention checks of section 7.1.
 *
 * Runs unchanged in Node (tests/run-node.js) and in a browser
 * (tests/browser.html). Registers cases on root.ADCSTests and exposes
 * ADCSTests.runAll({onResult}) -> Promise<{passed, failed, skipped, results}>.
 */
(function (root) {
  'use strict';
  const T = root.ADCSTests = { cases: [] };
  const A = root.ADCS;

  function test(group, name, fn) { T.cases.push({ group: group, name: name, fn: fn }); }

  /* ---------------- assertion helpers ---------------- */

  function fail(msg) { throw new Error(msg); }
  function fmt(x) {
    if (Array.isArray(x) || ArrayBuffer.isView(x)) return '[' + Array.prototype.map.call(x, fmt).join(', ') + ']';
    if (typeof x === 'number') return String(Number(x.toPrecision(12)));
    return String(x);
  }
  function ok(cond, label) { if (!cond) fail(label || 'assertion failed'); }
  function eq(actual, expected, label) {
    if (actual !== expected) fail((label || 'value') + ': expected ' + fmt(expected) + ', got ' + fmt(actual));
  }
  function near(actual, expected, tol, label) {
    if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= tol)) {
      fail((label || 'value') + ': expected ' + fmt(expected) + ' \u00b1 ' + tol + ', got ' + fmt(actual));
    }
  }
  function nearRel(actual, expected, frac, label) {
    if (typeof actual !== 'number' || !(Math.abs(actual - expected) <= frac * Math.abs(expected))) {
      fail((label || 'value') + ': expected ' + fmt(expected) + ' \u00b1 ' + (100 * frac) + '%, got ' + fmt(actual));
    }
  }
  function nearVec(actual, expected, tol, label) {
    if (!actual || actual.length !== expected.length) fail((label || 'vector') + ': wrong length');
    for (let i = 0; i < expected.length; i++) near(actual[i], expected[i], tol, (label || 'vector') + '[' + i + ']');
  }
  function nearMat(actual, expected, tol, label) {
    for (let i = 0; i < expected.length; i++) nearVec(actual[i], expected[i], tol, (label || 'matrix') + ' row ' + i);
  }
  function throwsRange(fn, label) {
    try { fn(); } catch (e) {
      if (e instanceof RangeError && e.message) return e.message;
      fail(label + ': expected RangeError, got ' + e);
    }
    fail(label + ': expected RangeError, nothing thrown');
    return '';
  }
  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function q4(arr, k) { return [arr[4 * k], arr[4 * k + 1], arr[4 * k + 2], arr[4 * k + 3]]; }
  function v3(arr, k) { return [arr[3 * k], arr[3 * k + 1], arr[3 * k + 2]]; }
  function randUnitQuat(rnd) { return A.quat.randomUniform(rnd); }
  const D2R = A.units.D2R, R2D = A.units.R2D;
  const N = A.modes.N, SD = A.modes.SD, SH = A.modes.SH;

  // Cached runs shared by several cases.
  const memo = {};
  function presetLog(id) {
    if (!memo['log-' + id]) memo['log-' + id] = A.sim.run(A.presets[id]);
    return memo['log-' + id];
  }
  function campaign(opts, key) {
    if (!memo['mc-' + key]) memo['mc-' + key] = A.mc.runSync(opts);
    return memo['mc-' + key];
  }

  /* ================================================================ */
  /* 8.1 Primitives                                                   */
  /* ================================================================ */

  test('8.1 primitives', 'mulberry32(42) first three values are bit-exact', function () {
    const r = A.rng.mulberry32(42);
    eq(r(), 0.6011037519201636, 'first');
    eq(r(), 0.44829055899754167, 'second');
    eq(r(), 0.8524657934904099, 'third');
  });
  test('8.1 primitives', 'trialSeed(42, 0..2) is exact', function () {
    eq(A.rng.trialSeed(42, 0), 862081050, 'trial 0');
    eq(A.rng.trialSeed(42, 1), 2860932040, 'trial 1');
    eq(A.rng.trialSeed(42, 2), 404444327, 'trial 2');
  });
  test('8.1 primitives', 'sampleTrial(42, 0) angle, q0, w0Deg and tauD', function () {
    const s = A.mc.sampleTrial(42, 0);
    near(s.angleDeg, 4.116276316345, 1e-9, 'angle');
    nearVec(s.q0, [0.999354899930, 0.014151164093, 0.030174565872, 0.013379989388], 1e-9, 'q0');
    nearVec(s.w0Deg, [-7.064161691815, -7.768837720156, 6.722245968878], 1e-9, 'w0Deg');
    nearVec(s.tauD, [-1.205218e-5, 1.464904e-5, -1.747714e-5], 1e-11, 'tauD');
  });
  test('8.1 primitives', 'sampleTrial(42, 1) and (42, 2) angle and w0Deg', function () {
    const s1 = A.mc.sampleTrial(42, 1), s2 = A.mc.sampleTrial(42, 2);
    near(s1.angleDeg, 87.484663892537, 1e-9, 'trial 1 angle');
    nearVec(s1.w0Deg, [-2.412229329348, -2.076552297920, 4.438278742135], 1e-9, 'trial 1 w0Deg');
    near(s2.angleDeg, 94.774611610919, 1e-9, 'trial 2 angle');
    nearVec(s2.w0Deg, [3.994922604412, 2.517052184790, -6.764974255115], 1e-9, 'trial 2 w0Deg');
  });
  test('8.1 primitives', 'LQR gains kTheta and kW per axis', function () {
    const J = A.params.DEFAULTS.J, w = A.params.DEFAULTS.lqr;
    const kw = [0.0478393, 0.0510375, 0.0406957];
    for (let i = 0; i < 3; i++) {
      const g = A.lqr.axisGains(J[i], w.qTheta, w.qW, w.r);
      near(g.kTheta, 0.0316228, 1e-7, 'kTheta axis ' + i);
      near(g.kW, kw[i], 1e-7, 'kW axis ' + i);
    }
    const K = A.lqr.gains3(J, w);
    near(K[1][1], 0.0316228, 1e-7, 'K[1][1]');
    near(K[2][5], kw[2], 1e-7, 'K[2][5]');
    eq(K[0][1], 0, 'off-diagonal');
  });
  test('8.1 primitives', 'LQR closed-loop natural frequency and damping', function () {
    const J = A.params.DEFAULTS.J, w = A.params.DEFAULTS.lqr;
    const wn = [0.9505, 0.8891, 1.1247], z = [0.7190, 0.7175, 0.7237];
    for (let i = 0; i < 3; i++) {
      const g = A.lqr.axisGains(J[i], w.qTheta, w.qW, w.r);
      const c = A.lqr.closedLoop(J[i], g.kTheta, g.kW);
      near(c.wn, wn[i], 1e-4, 'wn axis ' + i);
      near(c.zeta, z[i], 1e-4, 'zeta axis ' + i);
      near(c.poles[0].re, -c.zeta * c.wn, 1e-12, 'pole real part');
    }
  });
  test('8.1 primitives', 'Riccati residual below 1e-12 on every axis', function () {
    const J = A.params.DEFAULTS.J, w = A.params.DEFAULTS.lqr;
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      const r = A.lqr.riccatiResidual(J[i], w.qTheta, w.qW, w.r);
      ok(r < 1e-12, 'residual axis ' + i + ' = ' + r);
      worst = Math.max(worst, r);
      const P = A.lqr.riccatiP(J[i], w.qTheta, w.qW, w.r);
      near(P.K[1], A.lqr.axisGains(J[i], w.qTheta, w.qW, w.r).kW, 1e-15, 'K from P');
    }
    return 'max residual ' + worst.toExponential(2);
  });
  test('8.1 primitives', 'dareSweep y axis, dt = 0.1: sweeps 10 / 50 / 100 and convergence', function () {
    const w = A.params.DEFAULTS.lqr;
    const Ks = A.lqr.dareSweep(0.040, w.qTheta, w.qW, w.r, 0.1, 400);
    nearVec(Ks[0], [0, 0], 0, 'K_0 from P0 = 0');
    nearVec(Ks[9], [0.00965, 0.00783], 5e-5, 'after 10 sweeps');
    nearVec(Ks[49], [0.02925, 0.04891], 5e-5, 'after 50 sweeps');
    nearVec(Ks[99], [0.02967, 0.04939], 5e-5, 'after 100 sweeps');
    nearVec(Ks[399], [0.02967, 0.04939], 5e-5, 'converged');
    ok(Ks.convergedAt !== null && Math.abs(Ks.convergedAt + 1 - 230) <= 3, 'about 230 sweeps to 1e-13 (got ' + (Ks.convergedAt + 1) + ')');
    return 'converged after ' + (Ks.convergedAt + 1) + ' sweeps';
  });
  test('8.1 primitives', 'dareSweep y axis, dt = 0.01 converges to [0.03142, 0.05087]', function () {
    const w = A.params.DEFAULTS.lqr;
    const Ks = A.lqr.dareSweep(0.040, w.qTheta, w.qW, w.r, 0.01, 3000);
    nearVec(Ks[2999], [0.03142, 0.05087], 5e-5, 'converged gain');
    ok(Ks.convergedAt !== null && Math.abs(Ks.convergedAt + 1 - 2164) <= 20, 'about 2164 sweeps (got ' + (Ks.convergedAt + 1) + ')');
    return 'converged after ' + (Ks.convergedAt + 1) + ' sweeps';
  });
  test('8.1 primitives', 'LQR saturation angle 5.4356 deg', function () {
    const g = A.lqr.axisGains(0.035, 2, 0.15, 2000);
    near(A.lqr.saturationAngleDeg(g.kTheta, A.params.DEFAULTS.tauMax), 5.4356, 1e-3, 'saturation angle');
  });
  test('8.1 primitives', 'PID linear analysis (Kp_theta = Kp/2): wn and zeta per axis', function () {
    const p = A.params.DEFAULTS.pid, J = A.params.DEFAULTS.J;
    const exp = [[0.5345, 2.138], [0.5000, 2.000], [0.6325, 2.530]];
    for (let i = 0; i < 3; i++) {
      const c = A.lqr.closedLoop(J[i], p.Kp / 2, p.Kd);
      near(c.wn, exp[i][0], 1e-3, 'wn axis ' + i);
      near(c.zeta, exp[i][1], 1e-3, 'zeta axis ' + i);
    }
  });
  test('8.1 primitives', 'peak angular acceleration tauMax / J', function () {
    const D = A.params.DEFAULTS;
    nearVec(D.J.map(function (j) { return D.tauMax / j; }), [0.08571, 0.075, 0.12], 1e-5, 'peak acceleration');
  });
  test('8.1 primitives', 'detumble Kd lower bounds from REQ-L1 and REQ-F1', function () {
    const D = A.params.DEFAULTS, sm = D.safeMode;
    const Jmax = Math.max.apply(null, D.J);
    const kL1 = Jmax / A.params.LIMITS.detumbleS * Math.log(sm.enterRateDeg / sm.exitRateDeg);
    const kF1 = A.mc.DEFAULTS.distBound / (sm.exitRateDeg * D2R);
    near(kL1, 0.0016566, 1e-6, 'REQ-L1 bound');
    near(kF1, 0.0022918, 1e-6, 'REQ-F1 bound (one axis)');
    ok(D.detumble.Kd > kL1 && D.detumble.Kd > kF1, 'site detumble gain satisfies both');
  });
  test('8.1 primitives', 'T01 initial quaternion and angle', function () {
    const e = A.params.DEFAULTS.eulerDeg;
    const q = A.quat.fromEuler321(e[0] * D2R, e[1] * D2R, e[2] * D2R);
    nearVec(q, [0.948333, 0.233456, -0.088233, 0.195903], 1e-5, 'q');
    // The angle is quoted to four decimals, so it is checked to half a unit of the last digit.
    near(R2D * A.quat.errorAngle(A.quat.errorShortest([1, 0, 0, 0], q)), 36.9967, 5e-5, 'angle (deg)');
  });
  function kinematicsNorm(method, h, T) {
    const w = [5 * D2R, -3 * D2R, 4 * D2R];
    const f = function (q) { const d = A.quat.mul(q, [0, w[0], w[1], w[2]]); return [d[0] / 2, d[1] / 2, d[2] / 2, d[3] / 2]; };
    let q = [1, 0, 0, 0];
    const n = Math.round(T / h);
    for (let k = 0; k < n; k++) q = A.integrators.step(method, f, q, h);
    return A.quat.norm(q);
  }
  test('8.1 primitives', 'forward Euler inflates |q|: 1.01922 (h = 0.1) and 1.09982 (h = 0.5) after 100 s', function () {
    near(kinematicsNorm('euler', 0.1, 100), 1.01922, 1e-4, 'h = 0.1');
    near(kinematicsNorm('euler', 0.5, 100), 1.09982, 1e-4, 'h = 0.5');
  });
  test('8.1 primitives', 'RK4 kinematics drift: |q| - 1 about -3.84e-13 (h = 0.1) and -1.20e-9 (h = 0.5)', function () {
    const d1 = kinematicsNorm('rk4', 0.1, 100) - 1, d5 = kinematicsNorm('rk4', 0.5, 100) - 1;
    ok(d1 < 0 && d1 / -3.84e-13 > 0.3 && d1 / -3.84e-13 < 3, 'h = 0.1 drift ' + d1.toExponential(3));
    ok(d5 < 0 && d5 / -1.20e-9 > 0.3 && d5 / -1.20e-9 < 3, 'h = 0.5 drift ' + d5.toExponential(3));
    return 'drift ' + d1.toExponential(2) + ' / ' + d5.toExponential(2);
  });
  test('8.1 primitives', 'torque-free spin: x flips at 64.1 s and 166.4 s; y and z never flip in 200 s', function () {
    const flips = function (r, axis) {
      const out = [];
      for (let k = 1; k < r.n; k++) {
        if ((r.w[3 * k + axis] < 0) !== (r.w[3 * (k - 1) + axis] < 0)) out.push(r.t[k]);
      }
      return out;
    };
    const fx = flips(presetLog('SPINX'), 0);
    eq(fx.length, 2, 'number of x flips');
    near(fx[0], 64.1, 0.5, 'first flip');
    near(fx[1], 166.4, 0.5, 'second flip');
    eq(flips(presetLog('SPINY'), 1).length, 0, 'SPINY flips of w_y');
    eq(flips(presetLog('SPINZ'), 2).length, 0, 'SPINZ flips of w_z');
    return 'x flips at ' + fx.map(function (t) { return t.toFixed(2); }).join(' s and ') + ' s';
  });
  test('8.1 primitives', 'float64 dwell timer: t += 0.01 reaches 8 after 801 steps', function () {
    let t = 0, k = 0;
    while (t < 8) { t += 0.01; k++; }
    eq(k, 801, 'steps');
    eq(t, 8.009999999999874, 't');
    eq(A.modes.createMachine(A.params.DEFAULTS.safeMode, 0.01).limits.nD, 800, 'integer dwell counter');
  });
  test('8.1 primitives', 'float32 acos collapse below 4.8e-4 rad; atan2 form stays accurate', function () {
    const f = Math.fround;
    [1e-6, 1e-5, 1e-4, 3e-4, 4.8e-4].forEach(function (th) {
      eq(2 * Math.acos(f(Math.cos(th / 2))), 0, 'acos form at ' + th);
    });
    ok(2 * Math.acos(f(Math.cos(4.9e-4 / 2))) > 0, 'acos form no longer zero at 4.9e-4');
    [1e-6, 1e-5, 1e-4, 4.8e-4, 1e-3, 1e-2].forEach(function (th) {
      const a = 2 * Math.atan2(f(Math.sin(th / 2)), f(Math.cos(th / 2)));
      nearRel(a, th, 1e-6, 'atan2 form at ' + th);
    });
  });
  test('8.1 primitives', 'Clopper-Pearson lower bounds for 60/60, 59/60 and 58/60', function () {
    near(A.stats.cpLower(60, 60, 0.95), 0.951297, 1e-5, '60/60');
    near(A.stats.cpLower(60, 59, 0.95), 0.923360, 1e-5, '59/60');
    near(A.stats.cpLower(60, 58, 0.95), 0.898764, 1e-5, '58/60');
  });
  test('8.1 primitives', 'zero-failure sample sizes 59 and 299; 0.95^60; RM bound; 8 sqrt 3', function () {
    eq(A.stats.zeroFailureN(0.95, 0.95), 59, 'R 0.95, C 0.95');
    eq(A.stats.zeroFailureN(0.99, 0.95), 299, 'R 0.99, C 0.95');
    near(A.stats.binomPmf(60, 60, 0.95), 0.0461, 1e-4, '0.95^60');
    near(A.stats.rmBound(3), 0.7798, 1e-4, 'rate-monotonic bound n = 3');
    near(A.vec.norm([8, 8, 8]), 13.8564, 1e-4, '8 sqrt 3');
  });
  test('8.1 primitives', 'gyroscopic term at w = [0.1, 0.1, 0] is [0, 0, 5e-5] N m', function () {
    const J = A.params.DEFAULTS.J;
    nearVec(A.dynamics.gyroscopic([0.1, 0.1, 0], J), [0, 0, 5.0e-5], 1e-12, 'w x Jw');
    const d = A.dynamics.deriv([1, 0, 0, 0, 0.1, 0.1, 0], [0, 0, 0], [0, 0, 0], J);
    near(d[6], -5e-5 / J[2], 1e-12, 'wdot_z from Euler\u2019s equation');
  });

  /* ================================================================ */
  /* 7.1 Conventions                                                  */
  /* ================================================================ */

  test('7.1 conventions', 'quat.mul is associative and q (x) q* = identity', function () {
    const rnd = A.rng.mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const p = randUnitQuat(rnd), q = randUnitQuat(rnd), r = randUnitQuat(rnd);
      nearVec(A.quat.mul(A.quat.mul(p, q), r), A.quat.mul(p, A.quat.mul(q, r)), 1e-15 * 4, 'associativity');
      nearVec(A.quat.mul(q, A.quat.conj(q)), [1, 0, 0, 0], 1e-15 * 2, 'q q*');
    }
  });
  test('7.1 conventions', 'toR is orthonormal with det +1; toDCM = toR^T; rotate = toR v', function () {
    const rnd = A.rng.mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const q = randUnitQuat(rnd);
      const R = A.quat.toR(q);
      nearMat(A.vec.matMul(A.vec.transpose(R), R), A.vec.eye(), 1e-12, 'R^T R');
      near(A.vec.det(R), 1, 1e-12, 'det R');
      nearMat(A.quat.toDCM(q), A.vec.transpose(R), 1e-15, 'DCM = R^T');
      const v = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      nearVec(A.quat.rotate(q, v), A.vec.matVec(R, v), 1e-12, 'rotate');
      const qv = A.quat.mul(A.quat.mul(q, [0, v[0], v[1], v[2]]), A.quat.conj(q));
      nearVec(A.quat.rotate(q, v), [qv[1], qv[2], qv[3]], 1e-12, 'q [0,v] q*');
      nearMat(A.quat.toDCM([-q[0], -q[1], -q[2], -q[3]]), A.quat.toDCM(q), 1e-15, 'q and -q give the same DCM');
    }
  });
  test('7.1 conventions', '3-2-1 Euler round trip within 1e-9 away from +/-90 deg pitch', function () {
    const rnd = A.rng.mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const e = [(rnd() * 2 - 1) * Math.PI * 0.999, (rnd() * 2 - 1) * 85 * D2R, (rnd() * 2 - 1) * Math.PI * 0.999];
      const back = A.quat.toEuler321(A.quat.fromEuler321(e[0], e[1], e[2]));
      nearVec(back, e, 1e-9, 'round trip');
    }
    // Yaw about z only: v_B = C v_I with C from the DCM convention.
    const q = A.quat.fromEuler321(0, 0, 30 * D2R);
    nearVec(A.vec.matVec(A.quat.toDCM(q), [1, 0, 0]), [Math.cos(30 * D2R), -Math.sin(30 * D2R), 0], 1e-15, 'passive yaw');
  });
  test('7.1 conventions', 'errorShortest always returns qe0 >= 0; errorAngle uses atan2', function () {
    const rnd = A.rng.mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const a = randUnitQuat(rnd), b = randUnitQuat(rnd);
      const e = A.quat.errorShortest(a, b);
      ok(e[0] >= 0, 'qe0 >= 0');
      const ang = A.quat.errorAngle(e);
      ok(ang >= 0 && ang <= Math.PI + 1e-12, 'angle in [0, pi]');
    }
    // atan2 keeps full precision where acos(q0) collapses to zero.
    const tiny = A.quat.expRotvec([1e-9, 0, 0]);
    nearRel(A.quat.errorAngle(tiny), 1e-9, 1e-9, 'tiny angle');
    eq(2 * Math.acos(tiny[0]), 0, 'acos would collapse');
    near(A.quat.errorAngle(A.quat.errorShortest([1, 0, 0, 0], A.quat.fromAxisAngle([0, 0, 1], 200 * D2R))), 160 * D2R, 1e-12, 'shortest rotation');
  });
  test('7.1 conventions', 'dynamics.deriv matches 1/2 q (x) [0, w] and 1/2 Omega(w) q', function () {
    const rnd = A.rng.mulberry32(9);
    const J = A.params.DEFAULTS.J;
    for (let i = 0; i < 100; i++) {
      const q = randUnitQuat(rnd), w = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      const d = A.dynamics.deriv(q.concat(w), [0, 0, 0], [0, 0, 0], J);
      const a = A.quat.mul(q, [0, w[0], w[1], w[2]]).map(function (v) { return v / 2; });
      const b = A.vec.matVec(A.quat.omegaMatrix(w), q).map(function (v) { return v / 2; });
      nearVec(d.slice(0, 4), a, 1e-15, 'q (x) [0,w]');
      nearVec(d.slice(0, 4), b, 1e-15, 'Omega(w) q');
    }
  });
  test('7.1 conventions', 'small angles: q ~ [1, theta/2] and a positive w_z turns the body counter-clockwise about +Z', function () {
    let x = [1, 0, 0, 0, 0, 0, 0.1];
    for (let k = 0; k < 100; k++) x = A.dynamics.propagate(x, [0, 0, 0], [0, 0, 0], A.params.DEFAULTS.J, 0.01, {});
    const q = x.slice(0, 4);
    near(q[3], Math.sin(0.05), 1e-12, 'q3 = sin(theta/2)');
    const xb = A.quat.rotate(q, [1, 0, 0]);
    ok(xb[1] > 0, 'body x axis moves toward +Y');
    near(Math.atan2(xb[1], xb[0]), 0.1, 1e-12, 'rotation angle 0.1 rad');
    const small = A.quat.fromAxisAngle([1, 0, 0], 1e-4);
    near(small[1], 0.5e-4, 1e-12, 'qv ~ theta/2');
  });
  test('7.1 conventions', 'torque-free T and |J w| are conserved to 1e-10 over 200 s (RK4, dt = 0.01)', function () {
    let worst = 0;
    ['SPINX', 'SPINY', 'SPINZ'].forEach(function (id) {
      const r = presetLog(id), J = r.config.J;
      const T0 = A.dynamics.energy(v3(r.w, 0), J), H0 = A.dynamics.momentum(q4(r.q, 0), v3(r.w, 0), J);
      const Hi0 = A.dynamics.momentumInertial(q4(r.q, 0), v3(r.w, 0), J);
      for (let k = 0; k < r.n; k += 10) {
        const w = v3(r.w, k);
        const dT = Math.abs(A.dynamics.energy(w, J) - T0) / T0;
        const dH = Math.abs(A.dynamics.momentum(q4(r.q, k), w, J) - H0) / H0;
        worst = Math.max(worst, dT, dH);
      }
      const HiN = A.dynamics.momentumInertial(q4(r.q, r.n - 1), v3(r.w, r.n - 1), J);
      nearVec(HiN, Hi0, 1e-8 * A.vec.norm(Hi0), id + ' inertial momentum vector');
    });
    ok(worst < 1e-10, 'relative drift ' + worst);
    return 'max relative drift ' + worst.toExponential(2);
  });
  test('7.1 conventions', 'slerp, expRotvec/logRotvec and axis-angle round trips', function () {
    const rnd = A.rng.mulberry32(13);
    for (let i = 0; i < 100; i++) {
      const a = randUnitQuat(rnd), b = randUnitQuat(rnd);
      nearVec(A.quat.slerp(a, b, 0), a, 1e-12, 'slerp s = 0');
      const e = A.quat.slerp(a, b, 1);
      near(A.quat.angleBetween(e, b), 0, 1e-7, 'slerp s = 1');
      const m = A.quat.slerp(a, b, 0.5);
      near(A.quat.angleBetween(a, m), A.quat.angleBetween(a, b) / 2, 1e-9, 'slerp midpoint is halfway on the short path');
      const v = [(rnd() - 0.5) * 3, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3];
      nearVec(A.quat.logRotvec(A.quat.expRotvec(v)), v, 1e-12, 'log(exp(v))');
      const aa = A.quat.toAxisAngle(a);
      ok(aa.angle >= 0 && aa.angle <= Math.PI, 'angle in [0, pi]');
      near(A.quat.angleBetween(A.quat.fromAxisAngle(aa.axis, aa.angle), a), 0, 1e-7, 'axis-angle round trip');
      near(A.quat.norm(a), 1, 1e-15, 'randomUniform is unit');
    }
    nearVec(A.quat.expRotvec([1e-13, 0, 0]), [1, 5e-14, 0, 0], 1e-20, 'first-order series');
  });
  test('7.1 conventions', 'polyRoots (Durand-Kerner) finds known roots', function () {
    const r1 = A.vec.polyRoots([1, -6, 11, -6]);
    nearVec(r1.map(function (z) { return z.re; }), [1, 2, 3], 1e-10, 'cubic');
    const r2 = A.vec.polyRoots([1, 0, 1]);
    near(Math.abs(r2[0].im), 1, 1e-12, 'imaginary pair');
    near(r2[0].re, 0, 1e-12, 'imaginary pair real part');
    const p = A.params.DEFAULTS.pid;
    const r3 = A.vec.polyRoots([0.04, p.Kd, p.Kp / 2]);
    const cl = A.lqr.closedLoop(0.04, p.Kp / 2, p.Kd);
    nearVec(r3.map(function (z) { return z.re; }), cl.poles.map(function (z) { return z.re; }), 1e-10, 'PD poles');
    eq(A.vec.polyRoots([1, 2, 1]).length, 2, 'double root count');
    eq(A.vec.polyRoots([5]).length, 0, 'constant');
  });
  test('7.1 conventions', 'integrator order: halving h divides the error by about 2 / 4 / 16', function () {
    const J = A.params.DEFAULTS.J;
    const x0 = [1, 0, 0, 0, 0.1, 0.2, -0.15];
    const f = function (x) { return A.dynamics.torqueFree(x, J); };
    function integrate(method, h) {
      let x = x0.slice();
      const n = Math.round(10 / h);
      for (let k = 0; k < n; k++) x = A.integrators.step(method, f, x, h);
      return x;
    }
    const ref = integrate('rk4', 0.1 / 64);
    function err(method, h) {
      const x = integrate(method, h);
      return Math.hypot(x[4] - ref[4], x[5] - ref[5], x[6] - ref[6]);
    }
    const ratio = function (m) { return err(m, 0.05) / err(m, 0.025); };
    const rE = ratio('euler'), r2 = ratio('rk2'), r4 = err('rk4', 0.1) / err('rk4', 0.05);
    near(rE, 2, 0.3, 'Euler ratio');
    near(r2, 4, 0.6, 'RK2 ratio');
    near(r4, 16, 2.5, 'RK4 ratio');
    ok(ratio('rk4-bug-weights') < 8, 'buggy weights lower the ratio');
    ok(ratio('rk4-bug-stage') < 8, 'buggy stage lowers the ratio');
    return 'ratios ' + rE.toFixed(2) + ' / ' + r2.toFixed(2) + ' / ' + r4.toFixed(2);
  });
  test('7.1 conventions', 'dynamics.propagate equals the generic integrator for every method', function () {
    const J = A.params.DEFAULTS.J;
    const x0 = A.quat.fromEuler321(0.3, -0.2, 0.5).concat([0.1, -0.2, 0.15]);
    const tau = [0.001, -0.002, 0.0005], tauD = [2e-5, -1e-5, 1.5e-5];
    A.integrators.METHODS.forEach(function (m) {
      const f = function (x) { return A.dynamics.deriv(x, tau, tauD, J); };
      const a = A.integrators.step(m, f, x0, 0.05);
      const b = A.dynamics.propagate(x0, tau, tauD, J, 0.05, { method: m, renormalise: false });
      nearVec(b, a, 1e-15, m);
    });
    const c = A.dynamics.propagate(x0, tau, tauD, J, 0.5, { method: 'euler', renormalise: true });
    near(A.quat.norm(c.slice(0, 4)), 1, 1e-15, 'renormalised');
  });

  /* ================================================================ */
  /* 7.1 Project parameters                                           */
  /* ================================================================ */

  test('7.1 parameters', 'project values exactly (J, torque limit, disturbance, Q/R, thresholds, MC set-up)', function () {
    const D = A.params.DEFAULTS, sm = D.safeMode, M = A.mc.DEFAULTS;
    nearVec(D.J, [0.035, 0.040, 0.025], 0, 'J');
    eq(D.tauMax, 0.003, 'tauMax');
    nearVec(D.disturbance, [2e-5, -1e-5, 1.5e-5], 0, 'disturbance');
    eq(D.lqr.qTheta, 2, 'q_theta'); eq(D.lqr.qW, 0.15, 'q_omega'); eq(D.lqr.r, 2000, 'r');
    eq(sm.enterRateDeg, 6, 'entry rate'); eq(sm.faultPersist, 0.5, 'fault persistence');
    eq(sm.exitRateDeg, 0.5, 'exit rate'); eq(sm.exitHold, 2, 'exit hold');
    eq(sm.returnErrDeg, 4, 'return error'); eq(sm.returnRateDeg, 0.5, 'return rate'); eq(sm.dwell, 8, 'dwell');
    eq(M.n, 60, 'MC trials'); eq(M.maxAngleDeg, 120, 'MC angle'); eq(M.rateBoundDeg, 8, 'MC rate bound'); eq(M.distBound, 2e-5, 'MC disturbance bound');
    eq(D.method, 'rk4', 'integrator'); eq(D.renormalise, true, 'renormalise'); eq(D.saturation, 'clip', 'saturation');
    eq(D.pid.gate, 'nominal', 'integrator gated to NOMINAL'); eq(D.controller, 'PID', 'controller');
    eq(D.dt, 0.01, 'dt'); eq(D.duration, 120, 'duration');
    nearVec(D.eulerDeg, [25, -15, 20], 0, 'T01 attitude');
  });
  test('7.1 parameters', 'DEFAULTS, presets and REQ are frozen; defaults() is a mutable copy', function () {
    ok(Object.isFrozen(A.params.DEFAULTS) && Object.isFrozen(A.params.DEFAULTS.pid), 'DEFAULTS frozen');
    ok(Object.isFrozen(A.presets.T03) && Object.isFrozen(A.presets.T03.fault), 'presets frozen');
    const d = A.params.defaults();
    d.pid.Kp = 1;
    eq(A.params.DEFAULTS.pid.Kp, 0.02, 'DEFAULTS untouched');
    const m = A.params.merge(A.params.DEFAULTS, { pid: { Kp: 0.5 }, J: [1, 2, 3] });
    eq(m.pid.Kp, 0.5, 'merged'); eq(m.pid.Kd, 0.08, 'kept'); nearVec(m.J, [1, 2, 3], 0, 'array replaced');
  });
  test('7.1 parameters', 'requirement texts verbatim with class and verification method', function () {
    const R = A.params.REQ;
    eq(R.length, 5, 'five requirements');
    eq(R.map(function (r) { return r.id; }).join(','), 'REQ-F1,REQ-F2,REQ-S1,REQ-S2,REQ-L1', 'ids');
    eq(R[0].text, 'The system shall stabilize angular rates below 0.5 deg/s after safe-mode entry.', 'F1');
    eq(R[1].text, 'The system shall maintain a target attitude within +/-2 deg in nominal mode.', 'F2');
    eq(R[2].text, 'Angular rate shall never exceed 15 deg/s during the defined verification cases.', 'S1');
    eq(R[3].text, 'Commanded torque shall not exceed actuator limits.', 'S2');
    eq(R[4].text, 'The system shall reach the detumble threshold within 60 seconds for at least 95% of Monte Carlo trials.', 'L1');
    eq(R.map(function (r) { return r.class; }).join(','), 'functional,functional,safety,safety,liveness', 'classes');
    R.forEach(function (r) { ok(r.method && r.check, r.id + ' method and check'); });
  });
  test('7.1 parameters', 'PROVENANCE entries carry valid honesty tags; gains are labelled honestly', function () {
    const tags = ['project', 'derived', 'site', 'illustrative', 'extension', 'analogy'];
    const P = A.params.PROVENANCE;
    ok(P.length >= 20, 'enough entries');
    const seen = {};
    P.forEach(function (p) {
      ok(p.key && p.label && typeof p.value === 'string' && typeof p.note === 'string', 'shape of ' + p.key);
      ok(tags.indexOf(p.tag) >= 0, 'tag of ' + p.key);
      ok(!seen[p.key], 'unique key ' + p.key);
      seen[p.key] = p;
    });
    eq(seen.pid.tag, 'site', 'PID gains are Site default');
    eq(seen['detumble.Kd'].tag, 'site', 'detumble gain is Site default');
    eq(seen.hold.tag, 'site', 'hold gains are Site default');
    eq(seen.dt.tag, 'site', 'dt is Site default');
    eq(seen.duration.tag, 'site', 'duration is Site default');
    eq(seen['lqr.K'].tag, 'derived', 'LQR gains are Derived');
    eq(seen['lqr.weights'].tag, 'project', 'LQR weights are Project');
    eq(seen.J.tag, 'project', 'J is Project');
  });
  test('7.1 parameters', 'every preset id exists, validates and matches the documented deltas', function () {
    const ids = ['T01', 'T02', 'T03', 'FAULT', 'HIGHRATE', 'LQRSAFE', 'SPINX', 'SPINY', 'SPINZ', 'ESTKF', 'ESTNOISY'];
    eq(Object.keys(A.presets).join(','), ids.join(','), 'enumerable preset ids');
    eq(A.presets.ids.join(','), ids.join(','), 'display order');
    ids.forEach(function (id) {
      ok(A.presets.meta[id] && A.presets.meta[id].label, 'meta ' + id);
      A.sim.resolveConfig(A.presets[id]);
    });
    eq(A.presets.T01.safeMode.enabled, false, 'T01 safe off');
    eq(A.presets.T02.controller, 'LQR', 'T02 LQR');
    eq(A.presets.T03.fault.start, 45, 'T03 fault start');
    eq(A.presets.FAULT.duration, 90, 'FAULT duration');
    near(A.presets.SPINX.w0Deg[0], 28.6479, 1e-4, 'SPINX 0.5 rad/s');
    near(A.presets.SPINX.w0Deg[1], 0.57296, 1e-5, 'SPINX 0.01 rad/s');
    eq(A.presets.ESTNOISY.sensors.gyroNoiseDeg, 0.3, 'ESTNOISY gyro noise');
    const g = A.presets.get('T03');
    g.duration = 5;
    eq(A.presets.T03.duration, 120, 'get() returns a copy');
  });

  /* ================================================================ */
  /* 7.1 State machine                                                */
  /* ================================================================ */

  test('7.1 state machine', 'counters are exact: 50 / 200 / 800 steps at dt = 0.01', function () {
    const sm = A.params.DEFAULTS.safeMode;
    const m = A.modes.createMachine(sm, 0.01);
    eq(m.limits.nF, 50, 'fault persistence'); eq(m.limits.nB, 200, 'exit hold'); eq(m.limits.nD, 800, 'dwell');
    eq(JSON.stringify(A.modes.limits(sm, 0.005)), JSON.stringify({ nF: 100, nB: 400, nD: 1600 }), 'limits at dt = 0.005');
    eq(A.modes.reasonText('rate-low', sm), '|\u03c9| < 0.5 deg/s for 2 s', 'reason text');
    // Fault persistence: the 50th consecutive faulty step triggers the entry.
    let ev = null, k = 0;
    while (!ev) { ev = m.step({ rateDeg: 0.1, errDeg: 1, fault: true }); k++; }
    eq(k, 50, 'fault entry step'); eq(ev.reason, 'fault', 'reason'); near(ev.values.faultTime, 0.5, 1e-12, 'fault time');
    // Exit hold: 200 consecutive steps below 0.5 deg/s, reset by one step above.
    ev = null; k = 0;
    for (let i = 0; i < 150; i++) m.step({ rateDeg: 0.1, errDeg: 1, fault: true });
    m.step({ rateDeg: 0.6, errDeg: 1, fault: true });
    while (!ev) { ev = m.step({ rateDeg: 0.1, errDeg: 1, fault: true }); k++; }
    eq(k, 200, 'exit hold steps after a reset'); eq(ev.to, SH, 'to SAFE_HOLD'); eq(ev.reason, 'rate-low', 'reason');
    // Dwell: 800 steps, and never while the fault is active.
    for (let i = 0; i < 1000; i++) eq(m.step({ rateDeg: 0.1, errDeg: 1, fault: true }), null, 'stay in hold while faulted');
    ev = m.step({ rateDeg: 0.1, errDeg: 1, fault: false });
    eq(ev && ev.to, N, 'return once the fault clears'); eq(ev.reason, 'guards', 'reason');
    const m2 = A.modes.createMachine(sm, 0.01, { mode: SH });
    ev = null; k = 0;
    while (!ev) { ev = m2.step({ rateDeg: 0.1, errDeg: 1, fault: false }); k++; }
    eq(k, 800, 'dwell steps');
  });
  test('7.1 state machine', 'rate entry, hysteresis and the quiz case (9 s in hold, fault active)', function () {
    const sm = A.params.DEFAULTS.safeMode;
    const m = A.modes.createMachine(sm, 0.01);
    eq(m.step({ rateDeg: 6, errDeg: 0, fault: false }), null, '6 deg/s is not above 6');
    const ev = m.step({ rateDeg: 6.01, errDeg: 0, fault: false });
    eq(ev.reason, 'rate', 'rate entry');
    const h = A.modes.createMachine(sm, 0.01, { mode: SH, counters: { fault: 100, below: 0, dwell: 900 } });
    eq(h.step({ rateDeg: 0.2, errDeg: 3, fault: true }), null, 'stays in SAFE_HOLD');
    eq(h.mode, SH, 'mode');
    const off = A.modes.createMachine(A.params.merge(sm, { enabled: false }), 0.01);
    eq(off.step({ rateDeg: 50, errDeg: 0, fault: true }), null, 'disabled machine never switches');
    eq(off.mode, N, 'stays NOMINAL');
  });
  test('7.1 state machine', 'force() rejects the forbidden pairs with the documented messages', function () {
    const sm = A.params.DEFAULTS.safeMode;
    const m = A.modes.createMachine(sm, 0.01, { mode: SD });
    const r1 = m.force(N);
    eq(r1.ok, false, 'SD -> N rejected');
    eq(r1.reason, 'SAFE_DETUMBLE \u2192 NOMINAL is forbidden: detumbling must pass through SAFE_HOLD', 'message');
    const n = A.modes.createMachine(sm, 0.01);
    const r2 = n.force(SH);
    eq(r2.ok, false, 'N -> SH rejected'); ok(/forbidden/.test(r2.reason), 'N -> SH message');
    const h = A.modes.createMachine(sm, 0.01, { mode: SH });
    h.step({ rateDeg: 0.1, errDeg: 1, fault: true });
    const r3 = h.force(N);
    eq(r3.ok, false, 'SH -> N with fault rejected'); ok(/fault/.test(r3.reason), 'fault message');
    eq(h.force(N, { fault: false }).ok, true, 'SH -> N without fault allowed');
    eq(h.mode, N, 'forced mode');
    eq(n.force(SD).ok, true, 'N -> SD allowed');
    eq(A.modes.createMachine(sm, 0.01, { mode: SH }).force(SD).ok, false, 'SH -> SD unspecified without the gap option');
  });
  test('7.1 state machine', 'no SH -> SD without holdToDetumble; reupset with it', function () {
    const sm = A.params.DEFAULTS.safeMode;
    const a = A.modes.createMachine(sm, 0.01, { mode: SH });
    for (let i = 0; i < 2000; i++) eq(a.step({ rateDeg: 10, errDeg: 30, fault: false }), null, 'stays in SAFE_HOLD');
    const b = A.modes.createMachine(A.params.merge(sm, { holdToDetumble: true }), 0.01, { mode: SH });
    const ev = b.step({ rateDeg: 10, errDeg: 30, fault: false });
    eq(ev && ev.to, SD, 'SH -> SD'); eq(ev.reason, 'reupset', 'reason');
    // In a full run: HIGHRATE-like upset during hold with and without the option.
    const r = A.sim.run({ eulerDeg: [0, 0, 0], w0Deg: [0, 0, 0], safeMode: { enabled: true }, duration: 5, initial: { mode: SH } });
    ok(r.events.every(function (e) { return !(e.from === SH && e.to === SD); }), 'no SH -> SD in a run');
  });
  test('7.1 state machine', 'checkTrace is clean for every preset and flags forbidden transitions', function () {
    A.presets.ids.forEach(function (id) {
      const r = presetLog(id);
      const c = A.modes.checkTrace(r.mode, r.fault);
      ok(c.ok, id + ': ' + JSON.stringify(c.violations.slice(0, 2)));
    });
    const bad = A.modes.checkTrace([N, SD, N, SH, SH, N], [0, 0, 0, 0, 0, 1]);
    eq(bad.ok, false, 'bad trace rejected');
    eq(bad.violations.map(function (v) { return v.k; }).join(','), '2,3,5', 'violations at SD->N, N->SH, SH->N with fault');
    const rl = A.modes.runLengths([N, N, SD, SD, SD, SH], [0, 1, 2, 3, 4, 5]);
    eq(JSON.stringify(rl), JSON.stringify([{ mode: N, t0: 0, t1: 2 }, { mode: SD, t0: 2, t1: 5 }, { mode: SH, t0: 5, t1: 5 }]), 'runLengths');
  });
  test('7.1 state machine', 'abstract machine: exhaustive check passes; each planted bug is found', function () {
    const keys = A.modes.ABSTRACT_KEYS;
    function states() {
      const out = [];
      for (let mask = 0; mask < 128; mask++) {
        const a = {};
        keys.forEach(function (k, i) { a[k] = !!(mask & (1 << i)); });
        if (A.modes.abstractValid(a)) out.push(a);
      }
      return out;
    }
    function check(bugs) {
      let violations = 0, nondet = 0;
      [N, SD, SH].forEach(function (m) {
        states().forEach(function (a) {
          const next = A.modes.nextModeAbstract(m, a, bugs);
          if (next.length !== 1) nondet++;
          next.forEach(function (to) {
            A.modes.ABSTRACT_INVARIANTS.forEach(function (inv) { if (!inv.check(m, to, a)) violations++; });
          });
        });
      });
      return { violations: violations, nondet: nondet };
    }
    const clean = check(null);
    eq(clean.violations, 0, 'no violation without bugs'); eq(clean.nondet, 0, 'deterministic');
    eq(check({ holdToDetumble: true }).violations, 0, 'closing the gap is safe');
    // NOMINAL reachable from every mode (BFS over the abstract graph).
    [SD, SH].forEach(function (start) {
      const seen = {}; const queue = [start]; seen[start] = true;
      while (queue.length) {
        const m = queue.shift();
        states().forEach(function (a) {
          A.modes.nextModeAbstract(m, a).forEach(function (to) { if (!seen[to]) { seen[to] = true; queue.push(to); } });
        });
      }
      ok(seen[N], 'NOMINAL reachable from ' + A.modes.NAMES[start]);
    });
    A.modes.BUGS.forEach(function (b) {
      const r = check([b.id]);
      ok(r.violations + r.nondet > 0, 'bug ' + b.id + ' (' + b.key + ') detected');
    });
    return states().length + ' valid abstract states per mode';
  });

  /* ================================================================ */
  /* 8.2 Scenarios                                                    */
  /* ================================================================ */

  // Reference values. Effort reference values are the unrounded output of the
  // reference implementation (its rectangle sum); the trapezoid rule of the
  // engine differs by dt/2 (s_0 + s_N), inside the 2% tolerance.
  const SCEN = {
    T01: { ev: [], settle: 18.33, peak: 4.318, fin: [N, 0.002, 0.0006], effort: 7.824e-6, effortPlan: 7.82e-6, badges: 'na,pass,pass,pass,na' },
    T02: { ev: [], settle: 5.39, peak: 14.281, fin: [N, 0.049, 0.000], effort: 5.885e-5, effortPlan: 5.89e-5, badges: 'na,pass,pass,pass,na', margin: 0.72 },
    LQRSAFE: {
      ev: [[0.64, N, SD, 'rate'], [4.22, SD, SH, 'rate-low'], [33.76, SH, N, 'guards']], settle: 36.80, peak: 6.028,
      fin: [N, 0.049, 0.000], effort: 2.864e-5, effortPlan: 2.86e-5, badges: 'pass,pass,pass,pass,pass', det: [1.59]
    },
    T03: {
      ev: [[0.00, N, SD, 'rate'], [4.50, SD, SH, 'rate-low'], [39.26, SH, N, 'guards'], [45.49, N, SD, 'fault'], [47.49, SD, SH, 'rate-low'], [60.00, SH, N, 'guards']],
      settle: 43.81, peak: 11.180, fin: [N, 0.045, 0.007], effort: 2.895e-5, effortPlan: 2.90e-5, badges: 'pass,pass,pass,pass,pass', det: [2.51, 0.00]
    },
    FAULT: {
      ev: [[10.49, N, SD, 'fault'], [12.61, SD, SH, 'rate-low'], [20.61, SH, N, 'guards']], settle: 10.62, peak: 1.730,
      fin: [N, 0.014, 0.005], effort: 1.969e-6, effortPlan: 1.97e-6, badges: 'pass,pass,pass,pass,pass'
    },
    HIGHRATE: {
      ev: [[0.00, N, SD, 'rate'], [4.77, SD, SH, 'rate-low'], [21.98, SH, N, 'guards']], settle: 26.53, peak: 13.856,
      fin: [N, 0.008, 0.001], effort: 3.362e-5, effortPlan: 3.36e-5, badges: 'pass,pass,pass,pass,pass', det: [2.78]
    }
  };
  Object.keys(SCEN).forEach(function (id) {
    const ex = SCEN[id];
    test('8.2 scenarios', id + ': transitions, settling, peak rate, final state, effort and badges', function () {
      const r = presetLog(id), m = r.metrics;
      eq(r.events.length, ex.ev.length, 'number of transitions');
      ex.ev.forEach(function (e, i) {
        near(r.events[i].t, e[0], 0.02, 'transition ' + i + ' time');
        eq(r.events[i].from, e[1], 'transition ' + i + ' from');
        eq(r.events[i].to, e[2], 'transition ' + i + ' to');
        eq(r.events[i].reason, e[3], 'transition ' + i + ' reason');
      });
      near(m.settle, ex.settle, 0.05, 'settling time');
      near(m.peakRate, ex.peak, 0.01, 'peak rate');
      eq(m.final.mode, ex.fin[0], 'final mode');
      ok(Math.abs(m.final.errDeg - ex.fin[1]) <= Math.max(0.01, 0.1 * ex.fin[1]), 'final error ' + m.final.errDeg);
      near(m.final.rateDeg, ex.fin[2], 0.001, 'final rate');
      nearRel(m.effort, ex.effort, 0.02, 'effort (trapezoid)');
      // Cross-check: the rectangle sum over all samples reproduces the plan value closely.
      let rect = 0;
      for (let k = 0; k < r.n; k++) {
        const t = v3(r.tau, k);
        rect += (t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) * r.dt;
      }
      nearRel(rect, ex.effortPlan, 0.006, 'effort (rectangle sum vs plan value)');
      eq(r.req.map(function (q) { return q.status; }).join(','), ex.badges, 'badges F1, F2, S1, S2, L1');
      if (ex.det) nearVec(m.detumble, ex.det, 0.02, 'detumble times');
      if (ex.margin !== undefined) near(m.margin, ex.margin, 0.01, 'S1 margin');
      ok(m.maxTau <= A.params.DEFAULTS.tauMax * (1 + 1e-9), 'torque within limit');
      return 'settle ' + m.settle.toFixed(2) + ' s, peak ' + m.peakRate.toFixed(3) + ' deg/s, effort ' + m.effort.toExponential(3);
    });
  });
  test('8.2 scenarios', 'log:false summaries equal the logged metrics; metrics.compute is consistent', function () {
    Object.keys(SCEN).concat(['ESTKF']).forEach(function (id) {
      const a = presetLog(id);
      const b = A.sim.run(A.params.merge(A.presets[id], { log: false }));
      eq(JSON.stringify(b.metrics), JSON.stringify(a.metrics), id + ' metrics');
      eq(JSON.stringify(b.req), JSON.stringify(a.req), id + ' requirements');
      eq(JSON.stringify(b.events), JSON.stringify(a.events), id + ' events');
      eq(JSON.stringify(b.final), JSON.stringify(a.final), id + ' final state');
      ok(!('t' in b) && !('q' in b), 'no logs with log:false');
      eq(JSON.stringify(A.metrics.compute(a)), JSON.stringify(a.metrics), id + ' compute(result)');
    });
  });
  test('8.2 scenarios', 'result shapes, logEvery decimation and determinism', function () {
    const r = presetLog('T03');
    eq(r.n, 12001, 'samples'); eq(r.q.length, 4 * 12001, 'q length'); ok(r.mode instanceof Uint8Array, 'mode typed');
    ok(r.counters.dwell instanceof Uint16Array, 'counters typed'); ok(r.t instanceof Float64Array, 't typed');
    eq(r.qUse, null, 'no estimator log in truth mode');
    eq(r.t[12000], 120, 'last time');
    const d = A.sim.run(A.params.merge(A.presets.T03, { logEvery: 7 }));
    eq(d.n, Math.floor(12000 / 7) + 2, 'decimated samples include the last step');
    eq(d.t[d.n - 1], 120, 'decimated last time');
    eq(JSON.stringify(d.metrics), JSON.stringify(r.metrics), 'decimated runs keep exact metrics');
    const again = A.sim.run(A.presets.T03);
    eq(again.q[4 * 9000 + 1], r.q[4 * 9000 + 1], 'deterministic');
  });

  /* ================================================================ */
  /* 8.3 Monte Carlo                                                  */
  /* ================================================================ */

  test('8.3 Monte Carlo', 'seed 42, n = 60, PID: 60/60/60, worst 12.468 deg/s, 54 entries, detumble 2.62 / 2.00 s, return by 52.8 s', function () {
    const res = campaign({}, 'pid42'), s = res.summary;
    eq(s.n, 60, 'trials');
    eq(s.L1.pass, 60, 'L1'); eq(s.final.pass, 60, 'final nominal stability'); eq(s.safety.pass, 60, 'safety');
    near(s.L1.cpLower95, 0.9513, 1e-4, 'CP lower bound');
    near(s.worst.peakRate, 12.468, 0.01, 'worst peak rate'); eq(s.worst.i, 0, 'worst trial');
    near(res.trials[0].w0NormDeg, s.worst.peakRate, 1e-3, 'worst rate equals the initial rate norm');
    near(s.entries, 54, 1, 'safe-mode entries');
    near(s.detumble.max, 2.62, 0.02, 'max detumble'); near(s.detumble.mean, 2.00, 0.02, 'mean detumble');
    near(s.tReturnMax, 52.8, 0.1, 'latest return to NOMINAL');
    res.trials.forEach(function (tr) {
      ok(tr.maxTau <= A.params.DEFAULTS.tauMax * (1 + 1e-9), 'trial ' + tr.i + ' torque');
    });
    return 'worst ' + s.worst.peakRate.toFixed(3) + ' deg/s, ' + s.entries + ' entries, ' + s.elapsedMs.toFixed(0) + ' ms';
  });
  test('8.3 Monte Carlo', 'checkTrace is clean for every MC trial (seed 42)', function () {
    for (let i = 0; i < 60; i++) {
      const s = A.mc.sampleTrial(42, i);
      const r = A.sim.run({ q0: s.q0, w0Deg: s.w0Deg, disturbance: s.tauD, safeMode: { enabled: true } });
      const c = A.modes.checkTrace(r.mode, r.fault);
      ok(c.ok, 'trial ' + i);
    }
  });
  test('8.3 Monte Carlo', 'LQR and seeds 7 and 2025 also give 60/60/60 (worst 12.32 and 11.74 deg/s)', function () {
    const l = campaign({ controller: 'LQR' }, 'lqr42').summary;
    eq(l.L1.pass + l.final.pass + l.safety.pass, 180, 'LQR 60/60/60');
    const s7 = campaign({ baseSeed: 7 }, 'pid7').summary, s2025 = campaign({ baseSeed: 2025 }, 'pid2025').summary;
    eq(s7.L1.pass + s7.final.pass + s7.safety.pass, 180, 'seed 7 60/60/60');
    eq(s2025.L1.pass + s2025.final.pass + s2025.safety.pass, 180, 'seed 2025 60/60/60');
    near(s7.worst.peakRate, 12.32, 0.01, 'seed 7 worst');
    near(s2025.worst.peakRate, 11.74, 0.01, 'seed 2025 worst');
  });
  test('8.3 Monte Carlo', 'mc.run is chunked (<100 ms per chunk), reports progress and matches runSync', function () {
    const calls = [];
    let trialsSeen = 0;
    return A.mc.run({}, {
      onProgress: function (done, n, ms) { calls.push([done, n, ms]); },
      onTrial: function () { trialsSeen++; }
    }).then(function (res) {
      eq(res.cancelled, false, 'not cancelled');
      eq(res.trials.length, 60, 'trials');
      eq(trialsSeen, 60, 'onTrial calls');
      ok(calls.length >= 2, 'several chunks (' + calls.length + ')');
      eq(calls[calls.length - 1][0], 60, 'final progress');
      ok(res.summary.maxChunkMs < 100, 'longest chunk ' + res.summary.maxChunkMs.toFixed(1) + ' ms');
      ok(res.summary.elapsedMs <= 4000, 'campaign within 4 s (' + res.summary.elapsedMs.toFixed(0) + ' ms)');
      const ref = campaign({}, 'pid42').summary;
      eq(res.summary.worst.peakRate, ref.worst.peakRate, 'same as runSync');
      eq(res.summary.entries, ref.entries, 'same entries');
      return calls.length + ' chunks, longest ' + res.summary.maxChunkMs.toFixed(1) + ' ms, total ' + res.summary.elapsedMs.toFixed(0) + ' ms';
    });
  });
  test('8.3 Monte Carlo', 'mc.run cancels between trials and rejects invalid options', function () {
    const signal = { aborted: false };
    return A.mc.run({ n: 300 }, {
      signal: signal,
      onTrial: function (tr, done) { if (done === 3) signal.aborted = true; }
    }).then(function (res) {
      eq(res.cancelled, true, 'cancelled');
      eq(res.trials.length, 3, 'stopped after the current trial');
      eq(res.summary.cancelled, true, 'summary flag');
      return A.mc.run({ n: -1 }).then(function () { fail('expected a rejection'); }, function (e) {
        ok(e instanceof RangeError, 'RangeError for n = -1');
      });
    });
  });
  test('8.3 Monte Carlo', 'uniform-rotation sampling respects the angle cap', function () {
    for (let i = 0; i < 200; i++) {
      const s = A.mc.sampleTrial(42, i, { sampling: 'uniform' });
      ok(s.angleDeg <= 120 + 1e-9, 'angle cap');
      near(A.quat.norm(s.q0), 1, 1e-12, 'unit q0');
      ok(s.q0[0] >= 0, 'canonical q0');
      near(R2D * A.quat.errorAngle(s.q0), s.angleDeg, 1e-9, 'angle matches q0');
    }
    const r = A.mc.runTrial(42, 0, { sampling: 'uniform', duration: 30 });
    ok(typeof r.L1 === 'boolean' && r.i === 0, 'trial summary');
  });

  /* ================================================================ */
  /* 8.4 Extension                                                    */
  /* ================================================================ */

  test('8.4 extension', 'T01 with estimators: true error < 0.05 deg; RMS Kalman < complementary < raw; bias within 25%', function () {
    const out = {};
    ['noisy', 'complementary', 'kalman'].forEach(function (mode) {
      const r = A.sim.run(A.params.merge(A.presets.T01, { sensors: { mode: mode } }));
      out[mode] = r;
      ok(r.metrics.final.errDeg < 0.05, mode + ' final true error ' + r.metrics.final.errDeg);
      ok(r.qUse instanceof Float64Array && r.estErrDeg instanceof Float64Array, mode + ' estimation logs');
    });
    const kf = out.kalman.metrics.estRmsTailDeg, cf = out.complementary.metrics.estRmsTailDeg, raw = out.noisy.metrics.estRmsTailDeg;
    ok(kf > 0.004 && kf < 0.016, 'Kalman RMS about 0.008 deg (' + kf.toFixed(4) + ')');
    ok(cf > 0.0065 && cf < 0.026, 'complementary RMS about 0.013 deg (' + cf.toFixed(4) + ')');
    ok(raw > 0.018 && raw < 0.074, 'raw RMS about 0.037 deg (' + raw.toFixed(4) + ')');
    ok(kf < cf && cf < raw, 'ordering');
    ['complementary', 'kalman'].forEach(function (mode) {
      const cfg = A.sim.resolveConfig(A.params.merge(A.presets.T01, { sensors: { mode: mode } }));
      const r = out[mode];
      const sensors = A.est.createSensors(cfg.sensors, cfg.J, cfg.dt);
      const e = A.est.createEstimator(cfg.sensors, cfg.dt, q4(r.q, 0));
      for (let k = 0; k < r.n; k++) {
        const s = sensors.sample(k, q4(r.q, k), v3(r.w, k));
        const u = e.update(k, s.wMeas, s.qMeas);
        if (k === r.n - 1) nearVec(u.qUse, q4(r.qUse, k), 1e-12, mode + ' replay matches the run');
      }
      const b = e.state().bias.map(function (v) { return v * R2D; });
      cfg.sensors.gyroBiasDeg.forEach(function (bt, i) { nearRel(b[i], bt, 0.25, mode + ' bias axis ' + i); });
    });
    return 'tail RMS ' + kf.toFixed(4) + ' / ' + cf.toFixed(4) + ' / ' + raw.toFixed(4) + ' deg';
  });
  test('8.4 extension', 'ESTKF behaves like T03; ESTNOISY locks up in SAFE_DETUMBLE (F2 fails, F1/S1/S2 pass)', function () {
    const kf = presetLog('ESTKF');
    eq(kf.events.length, 6, 'ESTKF transitions');
    ok(kf.metrics.final.errDeg < 0.1, 'ESTKF final error');
    const r = presetLog('ESTNOISY');
    eq(r.events.length, 1, 'only the initial entry');
    eq(r.events[0].to, SD, 'entered SAFE_DETUMBLE');
    ok(r.events.every(function (e) { return !(e.from === SD && e.to === SH); }), 'no SD -> SH');
    eq(r.req.map(function (q) { return q.key + ':' + q.status; }).join(' '), 'F1:pass F2:fail S1:pass S2:pass L1:pass', 'badges');
    ok(r.metrics.final.errDeg > 10, 'true attitude wanders (' + r.metrics.final.errDeg.toFixed(1) + ' deg)');
  });
  test('8.4 extension', 'sensors and axis Kalman filter behave as specified', function () {
    const s = A.est.createSensors({ seed: 1 }, A.params.DEFAULTS.J, 0.01);
    eq(s.nST, 20, 'star tracker every 20 steps at 5 Hz');
    ok(s.sample(0, [1, 0, 0, 0], [0, 0, 0]).qMeas !== null, 'star tracker at k = 0');
    eq(s.sample(1, [1, 0, 0, 0], [0, 0, 0]).qMeas, null, 'no star tracker at k = 1');
    const g = A.rng.gaussianStream(3), r = A.rng.mulberry32(3), p = A.rng.normalPair(r);
    eq(g.next(), p[0], 'stream first value'); eq(g.next(), p[1], 'stream caches the second value');
    const kf = A.est.createAxisKF({ sgRad: 1e-4, sbRad: 1e-6, sstRad: 1e-3, dt: 0.01, P0: [1e-2, 1e-6] });
    let st;
    for (let k = 0; k < 2000; k++) {
      st = kf.predict(0.001); // true angle constant 0.2 rad, gyro reads the bias only
      if (k % 20 === 0) st = kf.update(0.2);
    }
    near(st.theta, 0.2, 3e-3, 'angle estimate');
    near(st.bias, 0.001, 3e-4, 'bias estimate');
    ok(st.P[0][0] < 1e-2, 'covariance shrank');
  });

  /* ================================================================ */
  /* API behaviour                                                    */
  /* ================================================================ */

  test('API', 'sim.run validation throws RangeError with a human message', function () {
    const msgs = [
      throwsRange(function () { A.sim.run({ J: [0.035, 0, 0.025] }); }, 'J <= 0'),
      throwsRange(function () { A.sim.run({ dt: 0 }); }, 'dt <= 0'),
      throwsRange(function () { A.sim.run({ duration: -5 }); }, 'duration <= 0'),
      throwsRange(function () { A.sim.run({ fault: { enabled: true, start: 60, end: 45 } }); }, 'fault end <= start'),
      throwsRange(function () { A.sim.run({ w0Deg: [NaN, 0, 0] }); }, 'NaN rate'),
      throwsRange(function () { A.sim.run({ pid: { Kp: Infinity } }); }, 'infinite gain'),
      throwsRange(function () { A.sim.run({ controller: 'MPC' }); }, 'unknown controller'),
      throwsRange(function () { A.sim.run({ q0: [0, 0, 0, 0] }); }, 'zero quaternion'),
      throwsRange(function () { A.sim.run({ duration: 300, dt: 0.0001 }); }, 'too many steps')
    ];
    msgs.forEach(function (m) { ok(m.length > 10, 'message: ' + m); });
    A.sim.run({ fault: { enabled: false, start: 60, end: 45 }, duration: 1 });
    return msgs[0];
  });
  test('API', 'sampleAt interpolates (slerp) and bisectTime records its steps', function () {
    const r = presetLog('T03');
    const s0 = A.sim.sampleAt(r, 47.49);
    const k = Math.round(47.49 / r.dt);
    nearVec(s0.q, q4(r.q, k), 1e-9, 'q at a sample');
    eq(s0.mode, r.mode[k], 'mode at a sample');
    const s = A.sim.sampleAt(r, 10.005);
    const qa = q4(r.q, 1000), qb = q4(r.q, 1001);
    near(A.quat.angleBetween(s.q, qa), A.quat.angleBetween(qa, qb) / 2, 1e-9, 'slerp halfway');
    near(s.rateDeg, (r.rateDeg[1000] + r.rateDeg[1001]) / 2, 1e-12, 'linear rate');
    eq(s.mode, r.mode[1000], 'mode from the previous sample');
    eq(s.euler.length, 3, 'euler'); near(s.eulerDeg[0], s.euler[0] * R2D, 1e-12, 'eulerDeg');
    const end = A.sim.sampleAt(r, 500);
    eq(end.t, 120, 'clamped to the end'); eq(end.mode, r.mode[r.n - 1], 'last mode');
    const trace = [];
    const lo = A.sim.bisectTime(r.t, 47.5, trace);
    ok(r.t[lo] <= 47.5 && 47.5 < r.t[lo + 1], 'bracket');
    ok(trace.length >= 13 && trace.length <= 14, 'log2(12000) steps (' + trace.length + ')');
    ok(trace.every(function (st) { return st.lo < st.mid && st.mid < st.hi; }), 'trace entries');
    eq(A.sim.bisectTime(r.t, -1), 0, 'below range');
    eq(A.sim.bisectTime(r.t, 1e9), r.n - 2, 'above range');
  });
  test('API', 'singleAxis: PD response, saturation and windup variants', function () {
    const base = { J: 0.04, kTheta: 0.01, kW: 0.08, theta0: 30 * D2R, duration: 60, dt: 0.01 };
    const pd = A.sim.singleAxis(A.params.merge(base, { ki: 0, intMode: 'none', tauMax: null }));
    eq(pd.t.length, 6001, 'samples');
    ok(Math.abs(pd.theta[6000]) < 0.01 * D2R * 30, 'PD converges');
    ok(Math.max.apply(null, Array.prototype.map.call(pd.tau, Math.abs)) > 0.003, 'unsaturated demand exceeds 3 mN m');
    const free = A.sim.singleAxis({ J: 0.04, kTheta: 0, kW: 0, theta0: 0.1, w0: 0.02, duration: 10, tauMax: null, intMode: 'none' });
    near(free.theta[1000], 0.1 + 0.02 * 10, 1e-12, 'free double integrator');
    const kick = A.sim.singleAxis({ J: 0.04, kTheta: 0, kW: 0, theta0: 0, w0: 0, tauD: 4e-4, duration: 10, tauMax: null, intMode: 'none' });
    near(kick.theta[1000], 0.5 * (4e-4 / 0.04) * 100, 1e-10, 'constant torque (RK4 exact)');
    function settle(r) {
      let last = -1;
      for (let i = 0; i < r.t.length; i++) if (Math.abs(r.theta[i]) >= 2 * D2R) last = i;
      return last < 0 ? 0 : r.t[last + 1];
    }
    const pid = { ki: 0.002, tauMax: 0.003, duration: 120 };
    const naive = A.sim.singleAxis(A.params.merge(base, A.params.merge(pid, { intMode: 'naive' })));
    const clamp = A.sim.singleAxis(A.params.merge(base, A.params.merge(pid, { intMode: 'clamp', clampFrac: 0.1 })));
    const cond = A.sim.singleAxis(A.params.merge(base, A.params.merge(pid, { intMode: 'conditional' })));
    ok(Math.max.apply(null, Array.prototype.map.call(clamp.I, Math.abs)) <= 0.1 * 0.003 / 0.002 + 1e-15, 'clamp holds |Ki I| <= 10% tauMax');
    ok(settle(naive) > settle(clamp), 'windup slows settling (' + settle(naive).toFixed(1) + ' s vs ' + settle(clamp).toFixed(1) + ' s)');
    ok(Math.max.apply(null, Array.prototype.map.call(naive.tau, Math.abs)) <= 0.003, 'saturated');
    ok(cond.I.length === naive.I.length, 'conditional runs');
    // 'gated': the integral stays 0 until |theta| < gateRad (default 4 deg), then integrates with the clamp.
    const gated = A.sim.singleAxis(A.params.merge(base, A.params.merge(pid, { intMode: 'gated', theta0: 60 * D2R })));
    let open = -1;
    for (let k = 0; k < gated.t.length; k++) if (Math.abs(gated.theta[k]) < 4 * D2R) { open = k; break; }
    ok(open > 0, 'gate opens');
    for (let k = 0; k <= open; k++) eq(gated.I[k], 0, 'integral held at 0 before the gate (step ' + k + ')');
    ok(Math.abs(gated.I[gated.t.length - 1]) > 0, 'integrates after the gate');
    ok(Math.max.apply(null, Array.prototype.map.call(gated.I, Math.abs)) <= 0.1 * 0.003 / 0.002 + 1e-15, 'gated mode keeps the clamp');
    throwsRange(function () { A.sim.singleAxis({ intMode: 'gated', gateRad: 0 }); }, 'invalid gate');
    throwsRange(function () { A.sim.singleAxis({ J: -1 }); }, 'invalid J');
  });
  test('API', 'momentumExchange conserves total momentum', function () {
    const r = A.sim.momentumExchange({ Jb: 0.04, Iw: 5e-5, tau: 0.002, duration: 20, dt: 0.01 });
    for (let k = 0; k < r.t.length; k++) near(r.H[k], 0, 1e-15, 'H at ' + k);
    near(r.wBody[2000], -0.002 * 20 / 0.04, 1e-12, 'body reacts with -tau');
    near(r.wWheel[2000], 0.002 * 20 / 5e-5, 1e-6, 'wheel spins up');
    const f = A.sim.momentumExchange({ tau: function (t) { return t < 5 ? 0.001 : -0.001; }, duration: 10 });
    near(f.wBody[1000], 0, 1e-12, 'torque profile');
  });
  test('API', 'controllers, saturation and actuator options', function () {
    const c = A.ctrl.saturate([0.006, 0.001, 0], 0.003, 'clip'), s = A.ctrl.saturate([0.006, 0.001, 0], 0.003, 'scale');
    nearVec(c, [0.003, 0.001, 0], 1e-18, 'clip'); nearVec(s, [0.003, 0.0005, 0], 1e-18, 'scale');
    near(Math.atan2(c[1], c[0]) * R2D, 18.43, 0.01, 'clipping rotates the vector');
    eq(A.ctrl.isSaturated([0.003, 0, 0], 0.003), false, 'at the limit');
    eq(A.ctrl.isSaturated([0.0031, 0, 0], 0.003), true, 'above the limit');
    const qe = [0.99, 0.1, -0.05, 0.02], w = [0.01, 0.02, -0.03];
    nearVec(A.ctrl.lqr(qe, w, A.lqr.gains3(A.params.DEFAULTS.J, A.params.DEFAULTS.lqr)),
      [0, 1, 2].map(function (i) {
        const g = A.lqr.axisGains(A.params.DEFAULTS.J[i], 2, 0.15, 2000);
        return -(g.kTheta * 2 * qe[i + 1] + g.kW * w[i]);
      }), 1e-15, 'LQR law');
    nearVec(A.ctrl.pid(qe, w, [1, 2, 3], { Kp: 1, Ki: 0.1, Kd: 2 }), [-0.1 - 0.02 - 0.1, 0.05 - 0.04 - 0.2, -0.02 + 0.06 - 0.3], 1e-15, 'PID law');
    // Transport delay and quantisation.
    const d = A.sim.run(A.params.merge(A.presets.T01, { duration: 2, actuator: { delaySteps: 2 } }));
    nearVec(v3(d.tau, 0), [0, 0, 0], 0, 'delayed start');
    nearVec(v3(d.tau, 5), A.ctrl.saturate(v3(d.tauCmd, 3), 0.003, 'clip'), 1e-18, 'two-step delay');
    const qn = A.sim.run(A.params.merge(A.presets.T01, { duration: 2, actuator: { quantum: 1e-4 } }));
    for (let k = 0; k < qn.n; k++) {
      v3(qn.tau, k).forEach(function (v) { near(v / 1e-4, Math.round(v / 1e-4), 1e-9, 'quantised'); });
    }
  });
  test('API', 'integrator options: gate, reset on entry, freeze when saturated', function () {
    const reset = A.sim.run(A.params.merge(A.presets.T03, { pid: { onEntry: 'reset', gate: 'always' } }));
    const ev = reset.events.filter(function (e) { return e.to === N; })[0];
    nearVec(v3(reset.integ, ev.k), [0, 0, 0], 0, 'integral zeroed on NOMINAL entry');
    const always = A.sim.run(A.params.merge(A.presets.T03, { pid: { gate: 'always' } }));
    ok(Math.abs(always.integ[3 * 300]) > 0, 'integrates in SAFE_DETUMBLE with gate always');
    eq(presetLog('T03').integ[3 * 300], 0, 'gated to NOMINAL by default');
    const frz = A.sim.run(A.params.merge(A.presets.T01, { duration: 2, pid: { freezeWhenSaturated: true } }));
    let frozenSteps = 0, movedSteps = 0;
    for (let k = 0; k + 1 < frz.n; k++) {
      const same = frz.integ[3 * k] === frz.integ[3 * (k + 1)];
      if (A.ctrl.isSaturated(v3(frz.tauCmd, k), 0.003)) { ok(same, 'frozen at step ' + k); frozenSteps++; } else if (!same) movedSteps++;
    }
    ok(frozenSteps > 10 && movedSteps > 10, 'frozen while saturated, integrating otherwise (' + frozenSteps + ' / ' + movedSteps + ')');
  });
  test('API', 'URL hash round trip and documented deep links', function () {
    const d = A.hash.decode('#preset=Custom&eul=25,-15,20&w=8,-6,5&ctl=PID&safe=1&fault=45,60&dur=120&bogus=7');
    eq(d.preset, 'Custom', 'preset'); nearVec(d.eulerDeg, [25, -15, 20], 0, 'eul'); nearVec(d.w0Deg, [8, -6, 5], 0, 'w');
    eq(d.controller, 'PID', 'ctl'); eq(d.safeMode.enabled, true, 'safe');
    eq(JSON.stringify(d.fault), JSON.stringify({ enabled: true, start: 45, end: 60 }), 'fault'); eq(d.duration, 120, 'dur');
    ok(!('bogus' in d), 'unknown keys ignored');
    eq(A.hash.decode('preset=SPINX&method=euler').method, 'euler', 'method');
    eq(A.hash.decode('#preset=T03&gap=1').safeMode.holdToDetumble, true, 'gap');
    eq(A.hash.decode('#preset=HIGHRATE&sat=scale').saturation, 'scale', 'sat');
    eq(A.hash.decode('#preset=T03&sens=complementary').sensors.mode, 'complementary', 'sens');
    eq(JSON.stringify(A.hash.decode('#mc=60,42').mc), JSON.stringify({ n: 60, baseSeed: 42 }), 'mc');
    eq(A.hash.decode('renorm=0').renormalise, false, 'renorm');
    eq(A.hash.decode('fault=0').fault.enabled, false, 'fault off');
    eq(A.hash.decode('eul=1,2').eulerDeg, undefined, 'malformed list ignored');
    const full = {
      preset: 'T03', eulerDeg: [25.123456789, -15, 20], w0Deg: [8, -6, 5], controller: 'LQR',
      pid: { Kp: 0.02, Ki: 0.002, Kd: 0.08, clampFrac: null }, detumble: { Kd: 0.05 }, lqr: { qTheta: 2, qW: 0.15, r: 2000 },
      safeMode: { enabled: true, holdToDetumble: true }, fault: { enabled: true, start: 45, end: 60 },
      disturbance: [2e-5, -1e-5, 1.5e-5], saturation: 'scale', duration: 90, dt: 0.005,
      sensors: { mode: 'kalman', gyroNoiseDeg: 0.05, gyroBiasDeg: [0.1, -0.2, 0.3], stNoiseDeg: 0.04, stRateHz: 2, kc: 0.3, kb: 0.02, seed: 7 },
      q0: [0.9, 0.1, 0.2, 0.3], mc: { n: 60, baseSeed: 42 }, t: 47.5,
      method: 'euler', renormalise: false, hold: { Kp: 0.015, Kd: 0.06 }
    };
    const enc = A.hash.encode(full);
    const back = A.hash.decode(enc);
    eq(back.eulerDeg[0], 25.1235, 'six significant digits');
    back.eulerDeg[0] = full.eulerDeg[0];
    eq(JSON.stringify(back), JSON.stringify(full), 'round trip');
    eq(A.hash.encode(A.hash.decode(enc)), enc, 'encode(decode(s)) = s');
    A.hash.KEYS.forEach(function (k) { ok(enc.indexOf(k + '=') >= 0, 'key ' + k + ' encoded'); });
    // A copied link reproduces the same run.
    const cfg = A.hash.toConfig(A.hash.decode(A.hash.encode({ preset: 'T03', t: 12 })));
    const r = A.sim.run(cfg);
    eq(r.metrics.settle, presetLog('T03').metrics.settle, 'same run from the link');
    const custom = A.hash.toConfig(A.hash.decode('preset=T03&gap=1&dur=60'));
    eq(custom.safeMode.holdToDetumble, true, 'delta over preset'); eq(custom.fault.start, 45, 'preset kept'); eq(custom.duration, 60, 'override');
  });
  test('API', 'statistics helpers', function () {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    near(A.stats.quantile(xs, 0.95), 9.55, 1e-12, 'type 7 quantile');
    near(A.stats.quantile(xs, 0.5), 5.5, 1e-12, 'median');
    near(A.stats.mean(xs), 5.5, 1e-12, 'mean');
    near(A.stats.std(xs), Math.sqrt(55 / 6), 1e-12, 'sample std');
    near(A.stats.std(xs, { population: true }), Math.sqrt(8.25), 1e-12, 'population std');
    const h = A.stats.histogram(xs, { bins: 3 });
    eq(h.length, 3, 'bins'); eq(h.reduce(function (s, b) { return s + b.count; }, 0), 10, 'counts');
    eq(h[2].count, 4, 'last bin closed on the right');
    const hq = A.stats.histogram(xs.concat([100]), { bins: 4, mode: 'quantile' });
    eq(hq.reduce(function (s, b) { return s + b.count; }, 0), 11, 'quantile bins count');
    ok(hq[hq.length - 1].x1 - hq[hq.length - 1].x0 > hq[0].x1 - hq[0].x0, 'variable widths');
    eq(A.stats.histogram([], {}).length, 0, 'empty');
    eq(A.stats.histogram([2, 2, 2, null], {}).length, 1, 'constant values');
    near(A.stats.binomCdf(59, 60, 0.95) + A.stats.binomPmf(60, 60, 0.95), 1, 1e-12, 'cdf + pmf');
    near(A.stats.cpLower(60, 0, 0.95), 0, 0, 'no successes');
    const lv = A.stats.levenshtein(['N', 'SD', 'SH', 'N'], ['N', 'SD', 'N']);
    eq(lv.distance, 1, 'distance'); eq(lv.ops.filter(function (o) { return o.op !== 'keep'; }).length, 1, 'one edit');
    eq(A.stats.levenshtein('kitten', 'sitting').distance, 3, 'classic example');
    const ci = A.stats.bootstrapCI(xs, A.stats.mean, 500, A.rng.mulberry32(1), 0.95);
    ok(ci.lo < 5.5 && 5.5 < ci.hi, 'bootstrap interval contains the mean');
  });
  test('API', 'test matrix T01-T06 passes and the trace is verbatim', function () {
    const ids = A.tests.matrix.map(function (r) { return r.id; });
    eq(ids.join(','), 'T01,T02,T03,T04,T05,T06', 'rows');
    const res = A.tests.matrix.map(function (r) { return r.runSync(); });
    res.forEach(function (r, i) { eq(r.status, 'pass', ids[i] + ' (' + r.value + ')'); });
    ok(/14\.28/.test(res[4].value), 'T05 worst is T02 at 14.28 deg/s (' + res[4].value + ')');
    eq(JSON.stringify(A.tests.trace), JSON.stringify({
      'REQ-F2': ['T01', 'T02'], 'REQ-F1': ['T03'], 'REQ-S1': ['T03', 'T05'], 'REQ-S2': ['T03', 'T06'], 'REQ-L1': ['T04']
    }), 'trace');
    return A.tests.matrix[3].run().then(function (r) { eq(r.status, 'pass', 'async T04'); return res[3].value; });
  });
  test('API', 'requirement evaluation edge cases', function () {
    const none = A.req.evaluate(presetLog('SPINX'));
    eq(A.req.byId(none, 'S1').status, 'na', 'S1 na without a controller');
    eq(A.req.byId(none, 'S1').note, 'torque-free physics demo', 'S1 note');
    eq(A.req.byId(none, 'F2').status, 'na', 'F2 na without PID/LQR');
    const t3 = presetLog('T03').req;
    eq(A.req.byId(t3, 'REQ-L1').note, 'REQ-L1 is a statistical requirement; see the Monte Carlo runner.', 'L1 note');
    ok(/^peak 11\.18 deg\/s, margin 3\.82$/.test(A.req.byId(t3, 'S1').value), 'S1 value ' + A.req.byId(t3, 'S1').value);
    ok(/^peak 3\.00 mN m \(demand /.test(A.req.byId(t3, 'S2').value), 'S2 value ' + A.req.byId(t3, 'S2').value);
    const failing = A.sim.run({ eulerDeg: [0, 0, 0], w0Deg: [8, -8, 8], controller: 'PID', safeMode: { enabled: true }, detumble: { Kd: 0.0005 }, duration: 30 });
    eq(A.req.byId(failing.req, 'F1').status, 'fail', 'weak detumble fails F1 in 30 s');
  });
  test('Performance', '120 s run at dt = 0.01 within 150 ms; 60-trial campaign within 4 s', function () {
    A.sim.run(A.presets.T03);
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t0 = now();
      A.sim.run(A.presets.T03);
      times.push(now() - t0);
    }
    times.sort(function (a, b) { return a - b; });
    ok(times[2] <= 150, 'median run ' + times[2].toFixed(1) + ' ms');
    const t0 = now();
    A.mc.runSync({});
    const mcMs = now() - t0;
    ok(mcMs <= 4000, 'campaign ' + mcMs.toFixed(0) + ' ms');
    return 'run ' + times[2].toFixed(1) + ' ms (median), campaign ' + mcMs.toFixed(0) + ' ms';
  });
  test('Data', 'ADCS.data.validate() passes (when adcs-data.js is loaded)', function () {
    if (!A.data || typeof A.data.validate !== 'function') return { skip: 'adcs-data.js not loaded' };
    A.data.validate();
    return 'validated';
  });
  test('Data', 'every loop block feeds from its own set of subjects', function () {
    if (!A.data || !A.data.loopBlocks) return { skip: 'adcs-data.js not loaded' };
    const seen = {};
    A.data.loopBlocks.forEach(function (b) {
      const rows = A.data.matchBlock(b);
      ok(rows.length > 0, b.id + ' has subjects');
      const key = rows.map(function (r) { return r.course; }).sort().join(',');
      ok(!seen[key], b.id + ' repeats the subject list of ' + seen[key]);
      seen[key] = b.id;
    });
    const n = function (id) { return A.data.matchBlock(id).length; };
    return A.data.loopBlocks.length + ' blocks; ref ' + n('ref') + ', err ' + n('err') + ', dyn ' + n('dyn') + ', sens ' + n('sens') + ', est ' + n('est');
  });
  test('Data', 'ADCS.data trace, tests and presets agree with ADCS.tests and ADCS.presets', function () {
    if (!A.data || !A.data.trace) return { skip: 'adcs-data.js not loaded' };
    const fromData = A.data.trace.map(function (r) { return r.req + ':' + r.tests.join('+'); }).sort().join(' ');
    const fromSim = Object.keys(A.tests.trace).map(function (k) { return k + ':' + A.tests.trace[k].join('+'); }).sort().join(' ');
    eq(fromData, fromSim, 'trace');
    eq(A.data.tests.map(function (r) { return r.id; }).join(','), A.tests.matrix.map(function (r) { return r.id; }).join(','), 'test ids');
    A.data.tests.forEach(function (r, i) {
      eq(r.reqs.slice().sort().join(','), A.tests.matrix[i].reqs.slice().sort().join(','), r.id + ' requirements');
      ok(r.preset === null || Object.prototype.hasOwnProperty.call(A.presets, r.preset), r.id + ' preset ' + r.preset + ' exists');
    });
    const links = [];
    A.data.modules.forEach(function (m) { (m.simLinks || []).forEach(function (l) { links.push([m.id, l]); }); });
    (A.data.loopBlocks || []).forEach(function (b) { if (b.sim) links.push([b.id, b.sim]); });
    links.forEach(function (pair) {
      const d = A.hash.decode(pair[1].hash);
      ok(!d.preset || d.preset === 'Custom' || Object.prototype.hasOwnProperty.call(A.presets, d.preset), pair[0] + ' sim link preset ' + d.preset);
      A.sim.resolveConfig(A.hash.toConfig(d));   // throws RangeError on an invalid link
    });
    return A.data.trace.length + ' trace rows, ' + A.data.tests.length + ' tests, ' + links.length + ' simulator links';
  });

  /* ================================================================ */
  /* Runner                                                           */
  /* ================================================================ */

  function yieldTick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /**
   * Run every case in order. Each case may return a detail string, a
   * {skip: reason} object or a Promise of either.
   * @param {{onResult?:function(Object), filter?:function(Object):boolean}} [opts]
   * @returns {Promise<{passed:number, failed:number, skipped:number, results:Object[], ms:number}>}
   */
  T.runAll = function (opts) {
    const o = opts || {};
    const results = [];
    const t0 = now();
    let i = 0;
    function next() {
      if (i >= T.cases.length) {
        const summary = { passed: 0, failed: 0, skipped: 0, results: results, ms: now() - t0 };
        results.forEach(function (r) { summary[r.status === 'pass' ? 'passed' : (r.status === 'skip' ? 'skipped' : 'failed')]++; });
        return Promise.resolve(summary);
      }
      const c = T.cases[i++];
      if (o.filter && !o.filter(c)) return next();
      const c0 = now();
      let p;
      try { p = Promise.resolve(c.fn()); } catch (e) { p = Promise.reject(e); }
      return p.then(function (v) {
        if (v && typeof v === 'object' && v.skip) return { status: 'skip', detail: String(v.skip) };
        return { status: 'pass', detail: v === undefined ? '' : String(v) };
      }, function (e) {
        return { status: 'fail', detail: e && e.message ? e.message : String(e) };
      }).then(function (r) {
        r.group = c.group; r.name = c.name; r.ms = now() - c0;
        results.push(r);
        if (o.onResult) o.onResult(r, results.length, T.cases.length);
        return yieldTick().then(next);
      });
    }
    return next();
  };
})(typeof window !== 'undefined' ? window : globalThis);
