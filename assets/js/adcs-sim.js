/*
 * adcs-sim.js: the simulation engine of the ADCS teaching site.
 * Namespaces: ADCS.params, ADCS.integrators, ADCS.dynamics, ADCS.lqr, ADCS.ctrl,
 * ADCS.modes, ADCS.est, ADCS.sim, ADCS.metrics, ADCS.req, ADCS.mc,
 * ADCS.presets, ADCS.tests, ADCS.hash.
 *
 * Requires adcs-math.js (ADCS.units, ADCS.vec, ADCS.quat, ADCS.rng, ADCS.stats).
 * Every function is pure apart from the explicit random-number objects, and
 * deterministic for a given configuration. Engine units: rad, rad/s, N m, s.
 *
 * Classic script (no modules). Loads in browsers and in Node (vm.runInThisContext).
 * Never touches the DOM.
 */
(function (root) {
  'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  if (!ADCS.quat || !ADCS.vec || !ADCS.rng || !ADCS.stats || !ADCS.units) {
    throw new Error('adcs-sim.js needs adcs-math.js to be loaded first');
  }
  const quat = ADCS.quat, vec = ADCS.vec, rng = ADCS.rng, stats = ADCS.stats;
  const D2R = ADCS.units.D2R, R2D = ADCS.units.R2D;

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                    */
  /* ------------------------------------------------------------------ */

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x) && !ArrayBuffer.isView(x);
  }
  function deepClone(x) {
    if (Array.isArray(x)) return x.map(deepClone);
    if (ArrayBuffer.isView(x)) return x.slice();
    if (isPlainObject(x)) {
      const o = {};
      for (const k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = deepClone(x[k]);
      return o;
    }
    return x;
  }
  function deepMerge(base, delta) {
    const out = deepClone(base);
    if (!isPlainObject(delta)) return out;
    for (const k in delta) {
      if (!Object.prototype.hasOwnProperty.call(delta, k)) continue;
      const v = delta[k];
      if (v === undefined) continue;
      if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
      else out[k] = deepClone(v);
    }
    return out;
  }
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }
  const now = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? function () { return performance.now(); }
    : function () { return Date.now(); };
  function fixed(x, d) { return (typeof x === 'number' && isFinite(x)) ? x.toFixed(d) : '\u2013'; }
  function list(a, d) { return '[' + a.map(function (v) { return fmtG(v, d); }).join(', ') + ']'; }
  function listExp(a) { return '[' + a.map(function (v) { return Number(v).toExponential(); }).join(', ') + ']'; }
  function fmtG(v, sig) { return String(Number(Number(v).toPrecision(sig || 6))); }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  /* ------------------------------------------------------------------ */
  /* ADCS.params                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Project parameters, defaults, provenance and requirement texts.
   * DEFAULTS, LIMITS and REQ are deep-frozen: use ADCS.params.defaults() for a
   * mutable copy, or ADCS.params.merge(base, delta) to build configs.
   * @namespace ADCS.params
   */
  const params = {};

  /** The full default configuration (the schema of every sim.run config). Frozen. */
  params.DEFAULTS = deepFreeze({
    J: [0.035, 0.040, 0.025],
    tauMax: 0.003,
    dt: 0.01,
    duration: 120,
    eulerDeg: [25, -15, 20],
    q0: null,
    w0Deg: [0, 0, 0],
    qRef: [1, 0, 0, 0],
    controller: 'PID',
    pid: { Kp: 0.02, Ki: 0.002, Kd: 0.08, clampFrac: 0.1, gate: 'nominal', freezeWhenSaturated: false, onEntry: 'hold' },
    detumble: { Kd: 0.05 },
    hold: { Kp: 0.01, Kd: 0.07 },
    lqr: { qTheta: 2, qW: 0.15, r: 2000, K: null },
    safeMode: {
      enabled: true, enterRateDeg: 6, faultPersist: 0.5, exitRateDeg: 0.5, exitHold: 2,
      returnErrDeg: 4, returnRateDeg: 0.5, dwell: 8, holdToDetumble: false
    },
    fault: { enabled: false, start: 45, end: 60 },
    disturbance: [2e-5, -1e-5, 1.5e-5],
    saturation: 'clip',
    actuator: { delaySteps: 0, quantum: 0 },
    method: 'rk4',
    renormalise: true,
    sensors: {
      mode: 'truth', seed: 1, gyroNoiseDeg: 0.01, gyroBiasDeg: [0.02, -0.015, 0.01], stNoiseDeg: 0.02,
      stRateHz: 5, kc: 0.2, kb: 0.05, kfP0AngleDeg: 1, kfP0BiasDeg: 0.05, kfBiasRW: 1e-5
    },
    initial: { mode: 0, counters: { fault: 0, below: 0, dwell: 0 }, integral: [0, 0, 0] },
    log: true,
    logEvery: 1
  });

  /**
   * Requirement thresholds used by the metrics and checks (from the
   * requirement texts): REQ-F2 2 deg, REQ-F1 0.5 deg/s, REQ-S1 15 deg/s,
   * REQ-L1 60 s and 95 %.
   */
  params.LIMITS = deepFreeze({ errDeg: 2, rateDeg: 0.5, rateMaxDeg: 15, detumbleS: 60, l1Rate: 0.95 });

  /** Requirement texts, verbatim from the project notes, with class and verification method. */
  params.REQ = deepFreeze([
    {
      id: 'REQ-F1', key: 'F1', class: 'functional',
      text: 'The system shall stabilize angular rates below 0.5 deg/s after safe-mode entry.',
      method: 'Safe-mode scenario and Monte Carlo verification.',
      check: 'Every entry into SAFE_DETUMBLE from NOMINAL is followed by a sample with |\u03c9| < 0.5 deg/s.'
    },
    {
      id: 'REQ-F2', key: 'F2', class: 'functional',
      text: 'The system shall maintain a target attitude within +/-2 deg in nominal mode.',
      method: 'Nominal PID and LQR simulation.',
      check: 'At the end of the run: mode NOMINAL, attitude error < 2\u00b0 and |\u03c9| < 0.5 deg/s.'
    },
    {
      id: 'REQ-S1', key: 'S1', class: 'safety',
      text: 'Angular rate shall never exceed 15 deg/s during the defined verification cases.',
      method: 'Maximum-rate check across all simulation logs.',
      check: 'max |\u03c9| over the whole log \u2264 15 deg/s.'
    },
    {
      id: 'REQ-S2', key: 'S2', class: 'safety',
      text: 'Commanded torque shall not exceed actuator limits.',
      method: 'Torque saturation check in controller output.',
      check: 'max |\u03c4\u1d62| after saturation \u2264 3 mN m on every axis.'
    },
    {
      id: 'REQ-L1', key: 'L1', class: 'liveness',
      text: 'The system shall reach the detumble threshold within 60 seconds for at least 95% of Monte Carlo trials.',
      method: 'Monte Carlo pass-rate calculation.',
      check: 'Single run: every safe-mode entry reaches |\u03c9| < 0.5 deg/s within 60 s. Campaign: at least 95% of trials pass.'
    }
  ]);

  /**
   * Mutable deep copy of DEFAULTS.
   * @returns {Object}
   */
  params.defaults = function () { return deepClone(params.DEFAULTS); };
  /**
   * Deep merge: plain objects merge recursively; arrays and other values replace.
   * Neither argument is modified.
   * @param {Object} base @param {Object} delta @returns {Object}
   */
  params.merge = function (base, delta) { return deepMerge(base, delta); };
  /** @param {*} x @returns {*} deep copy of a config-like value */
  params.clone = deepClone;
  /**
   * Requirement record by id ('REQ-F1') or key ('F1').
   * @param {string} id @returns {Object|null}
   */
  params.reqById = function (id) {
    for (let i = 0; i < params.REQ.length; i++) {
      if (params.REQ[i].id === id || params.REQ[i].key === id) return params.REQ[i];
    }
    return null;
  };

  ADCS.params = params;

  /* ------------------------------------------------------------------ */
  /* ADCS.integrators                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Fixed-step ODE integrators.
   * @namespace ADCS.integrators
   */
  const integrators = {};
  /** Supported method names for integrators.step and config.method. */
  integrators.METHODS = Object.freeze(['euler', 'rk2', 'rk4', 'rk4-bug-weights', 'rk4-bug-stage']);

  function axpy(x, h, k) {
    const out = new Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] + h * k[i];
    return out;
  }
  /**
   * One step of an explicit method on xdot = f(x).
   * 'euler': x + h f(x). 'rk2': midpoint. 'rk4': classical 1-2-2-1.
   * 'rk4-bug-weights' uses (k1 + k2 + k3 + k4)/4; 'rk4-bug-stage' computes k3
   * from x + h/2 k1 (teaching bugs for the order-of-accuracy widget).
   * @param {string} method
   * @param {function(number[]):number[]} f derivative
   * @param {number[]} x state @param {number} h step
   * @returns {number[]} new state
   */
  integrators.step = function (method, f, x, h) {
    if (integrators.METHODS.indexOf(method) < 0) throw new RangeError('Unknown integration method "' + method + '"');
    const n = x.length;
    const k1 = f(x);
    if (method === 'euler') return axpy(x, h, k1);
    const k2 = f(axpy(x, 0.5 * h, k1));
    if (method === 'rk2') return axpy(x, h, k2);
    const k3 = f(axpy(x, 0.5 * h, method === 'rk4-bug-stage' ? k1 : k2));
    const k4 = f(axpy(x, h, k3));
    const out = new Array(n);
    if (method === 'rk4-bug-weights') {
      for (let i = 0; i < n; i++) out[i] = x[i] + h * (k1[i] + k2[i] + k3[i] + k4[i]) / 4;
    } else {
      for (let i = 0; i < n; i++) out[i] = x[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    return out;
  };

  ADCS.integrators = integrators;

  /* ------------------------------------------------------------------ */
  /* ADCS.dynamics                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Rigid-body attitude dynamics: qdot = 1/2 q (x) [0, w],
   * J wdot = tau + tauD - w x (J w). State x = [q0, q1, q2, q3, wx, wy, wz].
   * @namespace ADCS.dynamics
   */
  const dynamics = {};

  // Allocation-free derivative into `o` (length >= 7). u = tau + tauD.
  function derivInto(o, x, u0, u1, u2, J0, J1, J2) {
    const q0 = x[0], q1 = x[1], q2 = x[2], q3 = x[3], wx = x[4], wy = x[5], wz = x[6];
    o[0] = 0.5 * (-q1 * wx - q2 * wy - q3 * wz);
    o[1] = 0.5 * (q0 * wx + q2 * wz - q3 * wy);
    o[2] = 0.5 * (q0 * wy - q1 * wz + q3 * wx);
    o[3] = 0.5 * (q0 * wz + q1 * wy - q2 * wx);
    const h0 = J0 * wx, h1 = J1 * wy, h2 = J2 * wz;
    o[4] = (u0 - (wy * h2 - wz * h1)) / J0;
    o[5] = (u1 - (wz * h0 - wx * h2)) / J1;
    o[6] = (u2 - (wx * h1 - wy * h0)) / J2;
  }

  // Reusable in-place stepper (zero-order hold on the torque).
  function createStepper() {
    const k1 = new Float64Array(7), k2 = new Float64Array(7), k3 = new Float64Array(7), k4 = new Float64Array(7);
    const xs = new Float64Array(7);
    return function step(x, tau, tauD, J, h, method, renorm) {
      const u0 = tau[0] + tauD[0], u1 = tau[1] + tauD[1], u2 = tau[2] + tauD[2];
      const J0 = J[0], J1 = J[1], J2 = J[2];
      const hh = 0.5 * h;
      let i;
      derivInto(k1, x, u0, u1, u2, J0, J1, J2);
      if (method === 'euler') {
        for (i = 0; i < 7; i++) x[i] = x[i] + h * k1[i];
      } else {
        for (i = 0; i < 7; i++) xs[i] = x[i] + hh * k1[i];
        derivInto(k2, xs, u0, u1, u2, J0, J1, J2);
        if (method === 'rk2') {
          for (i = 0; i < 7; i++) x[i] = x[i] + h * k2[i];
        } else {
          const kk = method === 'rk4-bug-stage' ? k1 : k2;
          for (i = 0; i < 7; i++) xs[i] = x[i] + hh * kk[i];
          derivInto(k3, xs, u0, u1, u2, J0, J1, J2);
          for (i = 0; i < 7; i++) xs[i] = x[i] + h * k3[i];
          derivInto(k4, xs, u0, u1, u2, J0, J1, J2);
          if (method === 'rk4-bug-weights') {
            for (i = 0; i < 7; i++) x[i] = x[i] + h * (k1[i] + k2[i] + k3[i] + k4[i]) / 4;
          } else {
            const h6 = h / 6;
            for (i = 0; i < 7; i++) x[i] = x[i] + h6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
          }
        }
      }
      if (renorm) {
        const n = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2] + x[3] * x[3]);
        x[0] = x[0] / n; x[1] = x[1] / n; x[2] = x[2] / n; x[3] = x[3] / n;
      }
    };
  }

  /**
   * State derivative xdot for x = [q0..q3, wx, wy, wz].
   * @param {number[]} x @param {number[]} tau control torque (N m)
   * @param {number[]} tauD disturbance torque (N m) @param {number[]} J principal inertias (kg m^2)
   * @returns {number[]} length-7 derivative
   */
  dynamics.deriv = function (x, tau, tauD, J) {
    const o = new Array(7);
    derivInto(o, x, tau[0] + tauD[0], tau[1] + tauD[1], tau[2] + tauD[2], J[0], J[1], J[2]);
    return o;
  };
  /**
   * Torque-free derivative (tau = tauD = 0).
   * @param {number[]} x @param {number[]} J @returns {number[]}
   */
  dynamics.torqueFree = function (x, J) { return dynamics.deriv(x, [0, 0, 0], [0, 0, 0], J); };
  /**
   * Gyroscopic term w x (J w) in N m.
   * @param {number[]} w rad/s @param {number[]} J @returns {number[]}
   */
  dynamics.gyroscopic = function (w, J) { return vec.cross(w, [J[0] * w[0], J[1] * w[1], J[2] * w[2]]); };
  /**
   * One integration step with tau held constant (zero-order hold); q is
   * normalised afterwards when opts.renormalise is true (default true).
   * @param {number[]} x @param {number[]} tau @param {number[]} tauD @param {number[]} J
   * @param {number} h step (s)
   * @param {{method?:string, renormalise?:boolean}} [opts] method default 'rk4'
   * @returns {number[]} new state (length 7)
   */
  dynamics.propagate = function (x, tau, tauD, J, h, opts) {
    const o = opts || {};
    const method = o.method || 'rk4';
    if (integrators.METHODS.indexOf(method) < 0) throw new RangeError('Unknown integration method "' + method + '"');
    const xs = new Float64Array(7);
    for (let i = 0; i < 7; i++) xs[i] = x[i];
    createStepper()(xs, tau, tauD, J, h, method, o.renormalise !== false);
    return Array.prototype.slice.call(xs);
  };
  /**
   * Rotational kinetic energy T = 1/2 sum J_i w_i^2 (J).
   * @param {number[]} w @param {number[]} J @returns {number}
   */
  dynamics.energy = function (w, J) { return 0.5 * (J[0] * w[0] * w[0] + J[1] * w[1] * w[1] + J[2] * w[2] * w[2]); };
  /**
   * Angular-momentum magnitude |J w| (N m s). The body-frame magnitude equals
   * the inertial one; the inertial vector is R(q) J w.
   * @param {number[]} q (unused for the magnitude) @param {number[]} w @param {number[]} J
   * @returns {number}
   */
  dynamics.momentum = function (q, w, J) { return vec.norm([J[0] * w[0], J[1] * w[1], J[2] * w[2]]); };
  /**
   * Inertial angular-momentum vector R(q) J w (N m s).
   * @param {number[]} q @param {number[]} w @param {number[]} J @returns {number[]}
   */
  dynamics.momentumInertial = function (q, w, J) { return quat.rotate(q, [J[0] * w[0], J[1] * w[1], J[2] * w[2]]); };

  ADCS.dynamics = dynamics;

  /* ------------------------------------------------------------------ */
  /* ADCS.lqr                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Per-axis LQR for the double integrator thetadot = w, wdot = tau/J.
   * @namespace ADCS.lqr
   */
  const lqr = {};

  /**
   * Closed-form CARE gains for one axis.
   * @param {number} Ji inertia @param {number} qTheta @param {number} qW @param {number} r
   * @returns {{kTheta:number, kW:number}}
   */
  lqr.axisGains = function (Ji, qTheta, qW, r) {
    return { kTheta: Math.sqrt(qTheta / r), kW: Math.sqrt((2 * Ji * Math.sqrt(qTheta * r) + qW) / r) };
  };
  /**
   * 3x6 gain matrix K = [diag(kTheta) | diag(kW)], or the explicit lqr.K override.
   * @param {number[]} J @param {{qTheta:number, qW:number, r:number, K?:number[][]}} w
   * @returns {number[][]}
   */
  lqr.gains3 = function (J, w) {
    if (w && w.K) return w.K.map(function (row) { return row.slice(); });
    const K = [];
    for (let i = 0; i < 3; i++) {
      const g = lqr.axisGains(J[i], w.qTheta, w.qW, w.r);
      const row = [0, 0, 0, 0, 0, 0];
      row[i] = g.kTheta; row[i + 3] = g.kW;
      K.push(row);
    }
    return K;
  };
  /**
   * Second-order closed loop J s^2 + kW s + kTheta: natural frequency,
   * damping ratio and poles.
   * @param {number} Ji @param {number} kTheta @param {number} kW
   * @returns {{wn:number, zeta:number, poles:{re:number, im:number}[]}}
   */
  lqr.closedLoop = function (Ji, kTheta, kW) {
    const wn = Math.sqrt(kTheta / Ji);
    const zeta = kW / (2 * Math.sqrt(kTheta * Ji));
    let poles;
    if (zeta >= 1) {
      const s = wn * Math.sqrt(zeta * zeta - 1);
      poles = [{ re: -zeta * wn - s, im: 0 }, { re: -zeta * wn + s, im: 0 }];
    } else {
      const s = wn * Math.sqrt(1 - zeta * zeta);
      poles = [{ re: -zeta * wn, im: -s }, { re: -zeta * wn, im: s }];
    }
    return { wn: wn, zeta: zeta, poles: poles };
  };
  /**
   * Closed-form Riccati solution P for one axis.
   * @param {number} Ji @param {number} q1 @param {number} q2 @param {number} r
   * @returns {{p11:number, p12:number, p22:number, K:number[]}}
   */
  lqr.riccatiP = function (Ji, q1, q2, r) {
    const p12 = Math.sqrt(q1 * r) * Ji;
    const p22 = Math.sqrt(r * (2 * p12 + q2)) * Ji;
    const p11 = p12 * p22 / (r * Ji * Ji);
    return { p11: p11, p12: p12, p22: p22, K: [p12 / (r * Ji), p22 / (r * Ji)] };
  };
  /**
   * Maximum absolute entry of A^T P + P A - P B R^-1 B^T P + Q for the
   * closed-form P (should be below 1e-12).
   * @param {number} Ji @param {number} q1 @param {number} q2 @param {number} r @returns {number}
   */
  lqr.riccatiResidual = function (Ji, q1, q2, r) {
    const P = lqr.riccatiP(Ji, q1, q2, r);
    const b = 1 / Ji;
    // A = [[0,1],[0,0]], B = [0; b]
    const r11 = -P.p12 * P.p12 * b * b / r + q1;
    const r12 = P.p11 - P.p12 * P.p22 * b * b / r;
    const r22 = 2 * P.p12 - P.p22 * P.p22 * b * b / r + q2;
    return Math.max(Math.abs(r11), Math.abs(r12), Math.abs(r22));
  };
  /**
   * Value iteration on the discretised axis ("value iteration = Riccati").
   * A = [[1, dt], [0, 1]], B = [dt^2/(2Ji), dt/Ji], Qd = diag(q1, q2) dt, Rd = r dt,
   * from P0 = 0: K_k = (Rd + B^T P_k B)^-1 B^T P_k A, P_{k+1} = Qd + A^T P_k (A - B K_k).
   * @param {number} Ji @param {number} q1 @param {number} q2 @param {number} r
   * @param {number} dt @param {number} nSweeps
   * @returns {number[][]} K_0 ... K_{nSweeps-1} (K_0 = [0, 0]); entry k-1 is the
   *   gain "after k sweeps". The array also carries `convergedAt` (first index
   *   with max|P_{k+1} - P_k| < 1e-13 max(1, max|P|), or null) and `P` (final P).
   */
  lqr.dareSweep = function (Ji, q1, q2, r, dt, nSweeps) {
    const b1 = dt * dt / (2 * Ji), b2 = dt / Ji;
    const Qa = q1 * dt, Qb = q2 * dt, Rd = r * dt;
    let p11 = 0, p12 = 0, p21 = 0, p22 = 0;
    const out = [];
    let conv = null;
    for (let k = 0; k < nSweeps; k++) {
      // B^T P
      const bp1 = b1 * p11 + b2 * p21, bp2 = b1 * p12 + b2 * p22;
      const s = Rd + bp1 * b1 + bp2 * b2;
      // B^T P A with A = [[1, dt], [0, 1]]
      const k1 = bp1 / s, k2 = (bp1 * dt + bp2) / s;
      out.push([k1, k2]);
      // A - B K
      const m11 = 1 - b1 * k1, m12 = dt - b1 * k2, m21 = -b2 * k1, m22 = 1 - b2 * k2;
      // A^T P
      const a11 = p11, a12 = p12, a21 = dt * p11 + p21, a22 = dt * p12 + p22;
      const n11 = Qa + a11 * m11 + a12 * m21;
      const n12 = a11 * m12 + a12 * m22;
      const n21 = a21 * m11 + a22 * m21;
      const n22 = Qb + a21 * m12 + a22 * m22;
      if (conv === null) {
        const d = Math.max(Math.abs(n11 - p11), Math.abs(n12 - p12), Math.abs(n21 - p21), Math.abs(n22 - p22));
        const big = Math.max(1, Math.abs(n11), Math.abs(n12), Math.abs(n21), Math.abs(n22));
        if (d < 1e-13 * big) conv = k;
      }
      p11 = n11; p12 = n12; p21 = n21; p22 = n22;
    }
    out.convergedAt = conv;
    out.P = [[p11, p12], [p21, p22]];
    return out;
  };
  /**
   * Attitude error (deg) at which the attitude term alone saturates: R2D tauMax / kTheta.
   * @param {number} kTheta @param {number} tauMax @returns {number}
   */
  lqr.saturationAngleDeg = function (kTheta, tauMax) { return R2D * tauMax / kTheta; };

  ADCS.lqr = lqr;

  /* ------------------------------------------------------------------ */
  /* ADCS.ctrl                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Pure torque laws (unsaturated) and the actuator saturation.
   * @namespace ADCS.ctrl
   */
  const ctrl = {};

  /**
   * Quaternion-error PID: -Kp qe_v - Kd w - Ki I (per axis).
   * @param {number[]} qe error quaternion @param {number[]} w rate (rad/s)
   * @param {number[]} I integral of qe_v (s) @param {{Kp:number, Ki:number, Kd:number}} g
   * @returns {number[]} torque (N m)
   */
  ctrl.pid = function (qe, w, I, g) {
    return [
      -g.Kp * qe[1] - g.Kd * w[0] - g.Ki * I[0],
      -g.Kp * qe[2] - g.Kd * w[1] - g.Ki * I[1],
      -g.Kp * qe[3] - g.Kd * w[2] - g.Ki * I[2]
    ];
  };
  /**
   * LQR state feedback -K [2 qe_v; w] (theta ~ 2 qe_v).
   * @param {number[]} qe @param {number[]} w @param {number[][]} K 3x6
   * @returns {number[]}
   */
  ctrl.lqr = function (qe, w, K) {
    const s = [2 * qe[1], 2 * qe[2], 2 * qe[3], w[0], w[1], w[2]];
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const row = K[i];
      let a = 0;
      for (let j = 0; j < 6; j++) a += row[j] * s[j];
      out[i] = -a;
    }
    return out;
  };
  /**
   * Rate damping -Kd w.
   * @param {number[]} w @param {{Kd:number}} g @returns {number[]}
   */
  ctrl.detumble = function (w, g) { return [-g.Kd * w[0], -g.Kd * w[1], -g.Kd * w[2]]; };
  /**
   * SAFE_HOLD low-gain PD: -Kp qe_v - Kd w.
   * @param {number[]} qe @param {number[]} w @param {{Kp:number, Kd:number}} g @returns {number[]}
   */
  ctrl.hold = function (qe, w, g) {
    return [-g.Kp * qe[1] - g.Kd * w[0], -g.Kp * qe[2] - g.Kd * w[1], -g.Kp * qe[3] - g.Kd * w[2]];
  };
  /**
   * Actuator saturation. 'clip' clamps each axis to +/-tauMax (the project);
   * 'scale' multiplies by min(1, tauMax / max|tau_i|), keeping the direction.
   * @param {number[]} tau @param {number} tauMax @param {('clip'|'scale')} [mode='clip']
   * @returns {number[]}
   */
  ctrl.saturate = function (tau, tauMax, mode) {
    if (mode === 'scale') {
      const m = Math.max(Math.abs(tau[0]), Math.abs(tau[1]), Math.abs(tau[2]));
      const f = m > tauMax ? tauMax / m : 1;
      return [tau[0] * f, tau[1] * f, tau[2] * f];
    }
    return [clamp(tau[0], -tauMax, tauMax), clamp(tau[1], -tauMax, tauMax), clamp(tau[2], -tauMax, tauMax)];
  };
  /**
   * True if any |tau_i| exceeds tauMax (1 + 1e-12).
   * @param {number[]} tauCmd @param {number} tauMax @returns {boolean}
   */
  ctrl.isSaturated = function (tauCmd, tauMax) {
    const lim = tauMax * (1 + 1e-12);
    return Math.abs(tauCmd[0]) > lim || Math.abs(tauCmd[1]) > lim || Math.abs(tauCmd[2]) > lim;
  };

  ADCS.ctrl = ctrl;

  /* ------------------------------------------------------------------ */
  /* ADCS.modes                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * The safe-mode state machine (NOMINAL, SAFE_DETUMBLE, SAFE_HOLD), its
   * transition relation, the abstract machine for model checking, and a
   * run-time trace monitor.
   * @namespace ADCS.modes
   */
  const modes = { N: 0, SD: 1, SH: 2 };
  const N = 0, SD = 1, SH = 2;
  /** Display names by mode id (0, 1, 2). */
  modes.NAMES = Object.freeze(['NOMINAL', 'SAFE_DETUMBLE', 'SAFE_HOLD']);
  /** Short labels by mode id, as used in mode-trace tokens. */
  modes.SHORT = Object.freeze(['N', 'SD', 'SH']);
  /** Allowed transitions [from][to], self-loops included (spec as written). */
  modes.ALLOWED = deepFreeze([[true, true, false], [false, true, true], [true, false, true]]);
  /** Always-forbidden ordered pairs; SH -> N is also forbidden while the fault is active. */
  modes.FORBIDDEN = deepFreeze([[SD, N], [N, SH]]);

  const ARROW = ' \u2192 ';
  const FORBID_MSG = {
    '1-0': 'SAFE_DETUMBLE' + ARROW + 'NOMINAL is forbidden: detumbling must pass through SAFE_HOLD',
    '0-2': 'NOMINAL' + ARROW + 'SAFE_HOLD is forbidden: safe hold only follows the detumble phase',
    '2-0f': 'SAFE_HOLD' + ARROW + 'NOMINAL is forbidden while the fault is active',
    '2-1': 'SAFE_HOLD' + ARROW + 'SAFE_DETUMBLE is not specified (the specification gap); enable "close the gap" to allow it'
  };

  /**
   * Allowed-transition matrix, optionally with the SH -> SD "close the gap" option.
   * @param {boolean} holdToDetumble @returns {boolean[][]}
   */
  modes.allowedMatrix = function (holdToDetumble) {
    const A = modes.ALLOWED.map(function (r) { return r.slice(); });
    if (holdToDetumble) A[SH][SD] = true;
    return A;
  };

  /**
   * Create the extended finite-state machine (mode plus integer counters).
   * `step(inp)` implements the project logic exactly and is the single
   * implementation used by ADCS.sim.run.
   * @param {Object} sm safe-mode parameters (ADCS.params.DEFAULTS.safeMode shape)
   * @param {number} dt step (s); counters are Math.round(time/dt) steps
   * @param {{mode?:number, counters?:{fault:number, below:number, dwell:number}}} [initial]
   * @returns {{mode:number, counters:{fault:number, below:number, dwell:number},
   *   limits:{nF:number, nB:number, nD:number},
   *   step:function({rateDeg:number, errDeg:number, fault:boolean}):(Object|null),
   *   force:function(number, {fault?:boolean}=):{ok:boolean, reason?:string},
   *   snapshot:function():Object}}
   *   step returns null or {from, to, reason, values:{rateDeg, errDeg, faultTime, dwell}}.
   */
  modes.createMachine = function (sm, dt, initial) {
    const s = deepMerge(params.DEFAULTS.safeMode, sm || {});
    const ini = initial || {};
    const c0 = ini.counters || {};
    const lim = modes.limits(s, dt);
    const nF = lim.nF, nB = lim.nB, nD = lim.nD;
    const allowed = modes.allowedMatrix(!!s.holdToDetumble);
    let lastFault = false;
    const m = {
      mode: (ini.mode === SD || ini.mode === SH) ? ini.mode : N,
      counters: { fault: c0.fault | 0, below: c0.below | 0, dwell: c0.dwell | 0 },
      limits: { nF: nF, nB: nB, nD: nD },
      params: s
    };
    function transition(to, reason, inp) {
      const from = m.mode;
      if (!allowed[from][to]) {
        throw new Error('Mode machine bug: illegal transition ' + modes.NAMES[from] + ARROW + modes.NAMES[to]);
      }
      m.mode = to;
      return {
        from: from, to: to, reason: reason,
        values: { rateDeg: inp.rateDeg, errDeg: inp.errDeg, faultTime: m.counters.fault * dt, dwell: m.counters.dwell * dt }
      };
    }
    m.step = function (inp) {
      lastFault = !!inp.fault;
      if (!s.enabled) return null;
      const c = m.counters;
      c.fault = inp.fault ? c.fault + 1 : 0;
      switch (m.mode) {
        case N:
          if (inp.rateDeg > s.enterRateDeg || c.fault >= nF) {
            const reason = (inp.rateDeg > s.enterRateDeg) ? 'rate' : 'fault';
            c.below = 0;
            return transition(SD, reason, inp);
          }
          return null;
        case SD:
          c.below = (inp.rateDeg < s.exitRateDeg) ? c.below + 1 : 0;
          if (c.below >= nB) {
            c.dwell = 0;
            return transition(SH, 'rate-low', inp);
          }
          return null;
        case SH:
          c.dwell += 1;
          if (s.holdToDetumble && (inp.rateDeg > s.enterRateDeg || c.fault >= nF)) {
            c.below = 0;
            return transition(SD, 'reupset', inp);
          } else if (!inp.fault && inp.rateDeg < s.returnRateDeg && inp.errDeg < s.returnErrDeg && c.dwell >= nD) {
            return transition(N, 'guards', inp);
          }
          return null;
        default:
          throw new Error('Mode machine bug: unknown mode ' + m.mode);
      }
    };
    /**
     * Force a mode change, bypassing the guards but never the transition
     * relation. Used by the live state-machine widget.
     * @param {number} to target mode
     * @param {{fault?:boolean}} [opts] fault state to judge SH -> N (default: the last step input)
     * @returns {{ok:boolean, reason?:string}}
     */
    m.force = function (to, opts) {
      const fault = (opts && typeof opts.fault === 'boolean') ? opts.fault : lastFault;
      const from = m.mode;
      if (to !== N && to !== SD && to !== SH) return { ok: false, reason: 'Unknown mode ' + to };
      if (to === from) return { ok: true };
      if (from === SD && to === N) return { ok: false, reason: FORBID_MSG['1-0'] };
      if (from === N && to === SH) return { ok: false, reason: FORBID_MSG['0-2'] };
      if (from === SH && to === N && fault) return { ok: false, reason: FORBID_MSG['2-0f'] };
      if (!allowed[from][to]) return { ok: false, reason: FORBID_MSG[from + '-' + to] || 'Transition not allowed' };
      if (to === SD) m.counters.below = 0;
      if (to === SH) m.counters.dwell = 0;
      m.mode = to;
      return { ok: true };
    };
    /** @returns {{mode:number, counters:{fault:number, below:number, dwell:number}}} a copy of the state */
    m.snapshot = function () {
      return { mode: m.mode, counters: { fault: m.counters.fault, below: m.counters.below, dwell: m.counters.dwell } };
    };
    return m;
  };

  /**
   * Integer counter limits for a step size: fault persistence, exit hold and dwell.
   * @param {Object} [sm] safe-mode parameters (defaults merged) @param {number} dt
   * @returns {{nF:number, nB:number, nD:number}} 50 / 200 / 800 at dt = 0.01
   */
  modes.limits = function (sm, dt) {
    const s = deepMerge(params.DEFAULTS.safeMode, sm || {});
    return { nF: Math.round(s.faultPersist / dt), nB: Math.round(s.exitHold / dt), nD: Math.round(s.dwell / dt) };
  };
  /**
   * Plain-text explanation of a transition reason, built from the thresholds,
   * for annunciators ("entered SAFE_HOLD because ...").
   * @param {('rate'|'fault'|'rate-low'|'guards'|'reupset')} reason @param {Object} [sm]
   * @returns {string}
   */
  modes.reasonText = function (reason, sm) {
    const s = deepMerge(params.DEFAULTS.safeMode, sm || {});
    switch (reason) {
      case 'rate': return '|\u03c9| > ' + s.enterRateDeg + ' deg/s';
      case 'fault': return 'the fault flag was active for ' + s.faultPersist + ' s';
      case 'rate-low': return '|\u03c9| < ' + s.exitRateDeg + ' deg/s for ' + s.exitHold + ' s';
      case 'guards': return 'fault clear, |\u03c9| < ' + s.returnRateDeg + ' deg/s, error < ' + s.returnErrDeg + '\u00b0 and dwell \u2265 ' + s.dwell + ' s';
      case 'reupset': return 're-upset during SAFE_HOLD (|\u03c9| > ' + s.enterRateDeg + ' deg/s or a persistent fault)';
      default: return String(reason);
    }
  };

  /** Names of the abstract guard booleans of the model-checking widget. */
  modes.ABSTRACT_KEYS = Object.freeze(['rateHigh', 'faultPersisted', 'belowHeld', 'fault', 'rateLow', 'errSmall', 'dwellDone']);
  /** Planted bugs for the "prove vs find" widget (cfgBugs keys). */
  modes.BUGS = deepFreeze([
    { id: 1, key: 'returnIgnoresFault', label: 'Return guard ignores the fault flag' },
    { id: 2, key: 'sdExitNoHold', label: 'SAFE_DETUMBLE exits on rateLow without the 2 s hold' },
    { id: 3, key: 'sdToNominal', label: 'SAFE_DETUMBLE \u2192 NOMINAL allowed when rateLow and errSmall' },
    { id: 4, key: 'nominalToHold', label: 'NOMINAL \u2192 SAFE_HOLD on rateLow and fault' }
  ]);
  function bugsOf(cfgBugs) {
    const b = {};
    if (!cfgBugs) return b;
    const arr = Array.isArray(cfgBugs) ? cfgBugs : (typeof cfgBugs === 'number' ? [cfgBugs] : null);
    if (arr) {
      arr.forEach(function (id) {
        modes.BUGS.forEach(function (d) { if (d.id === id || d.key === id) b[d.key] = true; });
      });
    } else {
      modes.BUGS.forEach(function (d) { if (cfgBugs[d.key] || cfgBugs[d.id]) b[d.key] = true; });
      if (cfgBugs.holdToDetumble) b.holdToDetumble = true;
    }
    return b;
  }
  /**
   * Validity of an abstract state: rateHigh and rateLow exclusive,
   * belowHeld implies rateLow, faultPersisted implies fault.
   * @param {Object} a abstract guard booleans @returns {boolean}
   */
  modes.abstractValid = function (a) {
    if (a.rateHigh && a.rateLow) return false;
    if (a.belowHeld && !a.rateLow) return false;
    if (a.faultPersisted && !a.fault) return false;
    return true;
  };
  /**
   * Successor modes of the abstract machine (timers abstracted to booleans).
   * Every enabled guard contributes its target; with no enabled guard the
   * mode stays. A correct machine always returns exactly one successor.
   * @param {number} mode 0, 1 or 2
   * @param {{rateHigh:boolean, faultPersisted:boolean, belowHeld:boolean, fault:boolean,
   *   rateLow:boolean, errSmall:boolean, dwellDone:boolean}} a
   * @param {(Object|number[]|number)} [cfgBugs] planted bugs by key ({returnIgnoresFault:true}),
   *   by id list ([1, 3]) or a single id; {holdToDetumble:true} closes the specification gap.
   * @returns {number[]} sorted unique successor modes
   */
  modes.nextModeAbstract = function (mode, a, cfgBugs) {
    const b = bugsOf(cfgBugs);
    const next = [];
    function add(m) { if (next.indexOf(m) < 0) next.push(m); }
    if (mode === N) {
      if (a.rateHigh || a.faultPersisted) add(SD);
      if (b.nominalToHold && a.rateLow && a.fault) add(SH);
    } else if (mode === SD) {
      if (a.belowHeld || (b.sdExitNoHold && a.rateLow)) add(SH);
      if (b.sdToNominal && a.rateLow && a.errSmall) add(N);
    } else if (mode === SH) {
      if (b.holdToDetumble && (a.rateHigh || a.faultPersisted)) add(SD);
      if ((b.returnIgnoresFault || !a.fault) && a.rateLow && a.errSmall && a.dwellDone) add(N);
    }
    if (next.length === 0) next.push(mode);
    return next.sort();
  };
  /**
   * Invariants of the abstract machine, each checked on one transition.
   * check(from, to, a) returns true when the transition respects the rule.
   */
  modes.ABSTRACT_INVARIANTS = Object.freeze([
    { id: 'no-sd-n', text: 'SAFE_DETUMBLE never goes straight to NOMINAL', check: function (f, t) { return !(f === SD && t === N); } },
    { id: 'no-n-sh', text: 'NOMINAL never goes straight to SAFE_HOLD', check: function (f, t) { return !(f === N && t === SH); } },
    { id: 'no-sh-n-fault', text: 'No return to NOMINAL while the fault is active', check: function (f, t, a) { return !(f === SH && t === N && a.fault); } },
    { id: 'sd-sh-held', text: 'SAFE_HOLD is entered only after the 2 s hold below 0.5 deg/s', check: function (f, t, a) { return !(f === SD && t === SH && !a.belowHeld); } }
  ]);
  /**
   * Run-time monitor (DFA) over a mode log: rejects SD -> N, N -> SH, and
   * SH -> N while the fault flag is set at the step of the transition.
   * @param {ArrayLike<number>} modeLog @param {ArrayLike<number>} [faults]
   * @returns {{ok:boolean, violations:{k:number, from:number, to:number, rule:string}[]}}
   */
  modes.checkTrace = function (modeLog, faults) {
    const v = [];
    for (let k = 1; k < modeLog.length; k++) {
      const f = modeLog[k - 1], t = modeLog[k];
      if (f === t) continue;
      if (f === SD && t === N) v.push({ k: k, from: f, to: t, rule: FORBID_MSG['1-0'] });
      else if (f === N && t === SH) v.push({ k: k, from: f, to: t, rule: FORBID_MSG['0-2'] });
      else if (f === SH && t === N && faults && faults[k]) v.push({ k: k, from: f, to: t, rule: FORBID_MSG['2-0f'] });
    }
    return { ok: v.length === 0, violations: v };
  };
  /**
   * Run-length segments of a mode log. Segment t1 is the start time of the
   * next segment (the last ends at the final sample).
   * @param {ArrayLike<number>} modeLog @param {ArrayLike<number>} t
   * @returns {{mode:number, t0:number, t1:number}[]}
   */
  modes.runLengths = function (modeLog, t) {
    const out = [];
    const n = modeLog.length;
    if (n === 0) return out;
    let start = 0;
    for (let k = 1; k <= n; k++) {
      if (k === n || modeLog[k] !== modeLog[start]) {
        out.push({ mode: modeLog[start], t0: t[start], t1: k === n ? t[n - 1] : t[k] });
        start = k;
      }
    }
    return out;
  };

  ADCS.modes = modes;

  /* ------------------------------------------------------------------ */
  /* ADCS.est (extension)                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Sensors and estimators. Beyond the original project, which fed back the
   * true simulated state.
   * @namespace ADCS.est
   */
  const est = {};
  /** Feedback modes for config.sensors.mode ('truth' is the project). */
  est.MODES = Object.freeze(['truth', 'noisy', 'complementary', 'kalman']);

  /**
   * Gyro (every step) and star tracker (every nST steps) models with noise
   * from one gaussianStream(cfg.seed), consumed gyro x, y, z then star tracker x, y, z.
   * @param {Object} cfg sensors config (DEFAULTS.sensors shape)
   * @param {number[]} J inertia (unused by the current models)
   * @param {number} dt
   * @returns {{nST:number, sample:function(number, number[], number[]):{wMeas:number[], qMeas:(number[]|null)}}}
   */
  est.createSensors = function (cfg, J, dt) {
    const c = deepMerge(params.DEFAULTS.sensors, cfg || {});
    const gs = rng.gaussianStream(c.seed);
    const sg = c.gyroNoiseDeg * D2R;
    const b = c.gyroBiasDeg.map(function (v) { return v * D2R; });
    const sst = c.stNoiseDeg * D2R;
    const nST = Math.max(1, Math.round(1 / (c.stRateHz * dt)));
    return {
      nST: nST,
      sample: function (k, q, w) {
        const wMeas = [w[0] + b[0] + sg * gs.next(), w[1] + b[1] + sg * gs.next(), w[2] + b[2] + sg * gs.next()];
        let qMeas = null;
        if (k % nST === 0) {
          const r = [sst * gs.next(), sst * gs.next(), sst * gs.next()];
          qMeas = quat.normalize(quat.mul(q, quat.expRotvec(r)));
        }
        return { wMeas: wMeas, qMeas: qMeas };
      }
    };
  };

  /**
   * Attitude estimator: 'noisy' (sample-and-hold star tracker, raw gyro),
   * 'complementary' or 'kalman' (per-axis two-state filter on [dtheta, dbias]
   * with multiplicative quaternion correction).
   * @param {Object} cfg sensors config @param {number} dt @param {number[]} q0 true initial attitude
   * @returns {{update:function(number, number[], (number[]|null)):{qUse:number[], wUse:number[]},
   *   state:function():{q:number[], bias:number[], P:number[][]}}}
   */
  est.createEstimator = function (cfg, dt, q0) {
    const c = deepMerge(params.DEFAULTS.sensors, cfg || {});
    const mode = c.mode;
    const sg = c.gyroNoiseDeg * D2R, sst = c.stNoiseDeg * D2R;
    const qbRW2 = c.kfBiasRW * c.kfBiasRW * dt;
    const qth = (sg * dt) * (sg * dt);
    const pa = Math.pow(c.kfP0AngleDeg * D2R, 2), pb = Math.pow(c.kfP0BiasDeg * D2R, 2);
    let qh = quat.normalize(q0 || [1, 0, 0, 0]);
    let qHold = qh.slice();
    const bh = [0, 0, 0];
    const P = [[pa, 0, 0, pb], [pa, 0, 0, pb], [pa, 0, 0, pb]]; // per axis [P11, P12, P21, P22]
    let wPrev = null;
    function update(k, wMeas, qMeas) {
      if (mode === 'noisy' || mode === 'truth') {
        if (qMeas) qHold = qMeas.slice();
        return { qUse: qHold, wUse: wMeas.slice() };
      }
      if (k >= 1 && wPrev) {
        qh = quat.normalize(quat.mul(qh, quat.expRotvec([
          (wPrev[0] - bh[0]) * dt, (wPrev[1] - bh[1]) * dt, (wPrev[2] - bh[2]) * dt])));
        if (mode === 'kalman') {
          for (let i = 0; i < 3; i++) {
            const p = P[i];
            const p11 = p[0], p12 = p[1], p21 = p[2], p22 = p[3];
            p[0] = p11 - dt * (p21 + p12) + dt * dt * p22 + qth;
            p[1] = p12 - dt * p22;
            p[2] = p21 - dt * p22;
            p[3] = p22 + qbRW2;
          }
        }
      }
      if (qMeas) {
        const e = quat.errorShortest(qh, qMeas);
        const r = [2 * e[1], 2 * e[2], 2 * e[3]];
        const dth = [0, 0, 0], db = [0, 0, 0];
        if (mode === 'kalman') {
          for (let i = 0; i < 3; i++) {
            const p = P[i];
            const p11 = p[0], p12 = p[1], p21 = p[2], p22 = p[3];
            const S = p11 + sst * sst;
            const K1 = p11 / S, K2 = p21 / S;
            dth[i] = K1 * r[i]; db[i] = K2 * r[i];
            p[0] = (1 - K1) * p11;
            p[1] = (1 - K1) * p12;
            p[2] = p21 - K2 * p11;
            p[3] = p22 - K2 * p12;
          }
        } else {
          for (let i = 0; i < 3; i++) { dth[i] = c.kc * r[i]; db[i] = -c.kb * r[i]; }
        }
        qh = quat.normalize(quat.mul(qh, quat.expRotvec(dth)));
        bh[0] += db[0]; bh[1] += db[1]; bh[2] += db[2];
      }
      wPrev = wMeas.slice();
      return { qUse: qh, wUse: [wMeas[0] - bh[0], wMeas[1] - bh[1], wMeas[2] - bh[2]] };
    }
    return {
      update: update,
      state: function () {
        return { q: qh.slice(), bias: bh.slice(), P: P.map(function (p) { return [[p[0], p[1]], [p[2], p[3]]]; }) };
      }
    };
  };

  /**
   * Stand-alone one-axis, two-state Kalman filter [theta, bias] for the
   * teaching widgets. predict(wMeas) integrates the gyro; update(z) fuses an
   * absolute angle measurement.
   * @param {{sgRad:number, sbRad:number, sstRad:number, dt:number, P0?:(number[]|number[][]),
   *   theta0?:number, bias0?:number}} o sgRad gyro noise (rad/s), sbRad bias random walk
   *   (rad/s/sqrt(s)), sstRad absolute sensor noise (rad), P0 [P11, P22] or a 2x2 matrix
   * @returns {{predict:function(number):Object, update:function(number):Object, state:function():Object}}
   *   each returns {theta, bias, P:[[P11, P12], [P21, P22]], K:[K1, K2]}
   */
  est.createAxisKF = function (o) {
    const dt = o.dt;
    const sg = o.sgRad || 0, sb = o.sbRad || 0, sst = o.sstRad || 0;
    let theta = o.theta0 || 0, bias = o.bias0 || 0;
    let p11, p12 = 0, p21 = 0, p22;
    if (Array.isArray(o.P0) && Array.isArray(o.P0[0])) {
      p11 = o.P0[0][0]; p12 = o.P0[0][1]; p21 = o.P0[1][0]; p22 = o.P0[1][1];
    } else if (Array.isArray(o.P0)) {
      p11 = o.P0[0]; p22 = o.P0[1];
    } else {
      p11 = Math.pow(1 * D2R, 2); p22 = Math.pow(0.05 * D2R, 2);
    }
    let K = [0, 0];
    function snap() { return { theta: theta, bias: bias, P: [[p11, p12], [p21, p22]], K: K.slice() }; }
    return {
      predict: function (wMeas) {
        theta += (wMeas - bias) * dt;
        const n11 = p11 - dt * (p21 + p12) + dt * dt * p22 + (sg * dt) * (sg * dt);
        const n12 = p12 - dt * p22, n21 = p21 - dt * p22, n22 = p22 + sb * sb * dt;
        p11 = n11; p12 = n12; p21 = n21; p22 = n22;
        return snap();
      },
      update: function (z) {
        const S = p11 + sst * sst;
        const K1 = S > 0 ? p11 / S : 0, K2 = S > 0 ? p21 / S : 0;
        const r = z - theta;
        theta += K1 * r; bias += K2 * r;
        const o11 = p11, o12 = p12;
        p11 = (1 - K1) * o11; p12 = (1 - K1) * o12; p21 = p21 - K2 * o11; p22 = p22 - K2 * o12;
        K = [K1, K2];
        return snap();
      },
      state: snap
    };
  };

  ADCS.est = est;

  /* ------------------------------------------------------------------ */
  /* ADCS.metrics                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Run metrics from true error and rate. All definitions follow the
   * project's comparison criteria.
   * @namespace ADCS.metrics
   */
  const metrics = {};

  // Online accumulator shared by sim.run (log:false) and metrics.compute.
  function createAccumulator(tauMax, initialMode, tTail) {
    const L = params.LIMITS;
    const lim = tauMax * (1 + 1e-12);
    const a = {
      n: 0, lastViol: -1, prevViol: false, settleCand: 0,
      peakErr: -Infinity, peakRate: -Infinity, peakRateT: 0,
      maxTau: 0, maxTauCmd: 0, effort: 0, prevS: 0, prevT: 0,
      entries: [], entryTimes: [], detumble: [], pending: [],
      transitions: 0, satCount: 0, prevMode: initialMode, tLastNominalEntry: null,
      lastErr: NaN, lastRate: NaN, lastMode: initialMode,
      estSq: 0, estMax: 0, estN: 0, tailSq: 0, tailN: 0
    };
    const tTailStart = (typeof tTail === 'number' ? tTail : Infinity) - 1e-9;
    a.push = function (k, t, errDeg, rateDeg, t0, t1, t2, c0, c1, c2, mode, estErr) {
      const idx = a.n;
      const viol = !(errDeg < L.errDeg && rateDeg < L.rateDeg);
      if (viol) a.lastViol = idx;
      else if (a.prevViol) a.settleCand = t;
      a.prevViol = viol;
      if (errDeg > a.peakErr) a.peakErr = errDeg;
      if (rateDeg > a.peakRate) { a.peakRate = rateDeg; a.peakRateT = t; }
      const at = Math.max(Math.abs(t0), Math.abs(t1), Math.abs(t2));
      if (at > a.maxTau) a.maxTau = at;
      const ac = Math.max(Math.abs(c0), Math.abs(c1), Math.abs(c2));
      if (ac > a.maxTauCmd) a.maxTauCmd = ac;
      if (ac > lim) a.satCount++;
      const s = t0 * t0 + t1 * t1 + t2 * t2;
      if (idx > 0) a.effort += 0.5 * (s + a.prevS) * (t - a.prevT);
      a.prevS = s; a.prevT = t;
      const prev = idx === 0 ? a.prevMode : a.lastMode;
      if (mode !== prev) a.transitions++;
      if (mode === SD && (idx === 0 || prev === N)) {
        a.entries.push(k); a.entryTimes.push(t); a.detumble.push(null); a.pending.push(a.detumble.length - 1);
      }
      if (mode === N && prev !== N) a.tLastNominalEntry = t;
      if (rateDeg < L.rateDeg && a.pending.length) {
        for (let i = 0; i < a.pending.length; i++) {
          const j = a.pending[i];
          a.detumble[j] = t - a.entryTimes[j];
        }
        a.pending.length = 0;
      }
      if (typeof estErr === 'number') {
        a.estSq += estErr * estErr; a.estN++;
        if (estErr > a.estMax) a.estMax = estErr;
        if (t >= tTailStart) { a.tailSq += estErr * estErr; a.tailN++; }
      }
      a.lastErr = errDeg; a.lastRate = rateDeg; a.lastMode = mode;
      a.n++;
    };
    a.result = function () {
      let settle;
      if (a.n === 0) settle = null;
      else if (a.lastViol === a.n - 1) settle = null;
      else if (a.lastViol === -1) settle = 0;
      else settle = a.settleCand;
      const out = {
        n: a.n,
        settle: settle,
        peakErr: a.peakErr, peakRate: a.peakRate, peakRateT: a.peakRateT,
        maxTau: a.maxTau, maxTauCmd: a.maxTauCmd,
        effort: a.effort,
        margin: L.rateMaxDeg - a.peakRate,
        entries: a.entries.slice(), entryTimes: a.entryTimes.slice(),
        detumble: a.detumble.slice(),
        maxDetumble: null,
        transitions: a.transitions,
        satFrac: a.n ? a.satCount / a.n : 0,
        final: { mode: a.lastMode, errDeg: a.lastErr, rateDeg: a.lastRate },
        tLastNominalEntry: a.tLastNominalEntry,
        estRmsDeg: a.estN ? Math.sqrt(a.estSq / a.estN) : null,
        estMaxDeg: a.estN ? a.estMax : null,
        estRmsTailDeg: a.tailN ? Math.sqrt(a.tailSq / a.tailN) : null
      };
      let md = null;
      for (let i = 0; i < out.detumble.length; i++) {
        const d = out.detumble[i];
        if (d === null) { md = null; break; }
        md = md === null ? d : Math.max(md, d);
      }
      out.maxDetumble = out.detumble.length ? md : null;
      return out;
    };
    return a;
  }

  /**
   * Metrics of a logged run (true errDeg and rateDeg).
   * settle: last entry into the band err < 2 deg and |w| < 0.5 deg/s (null if
   * never settled, 0 if always inside); effort: trapezoid integral of sum tau_i^2;
   * entries: step indices where the mode becomes SAFE_DETUMBLE from NOMINAL
   * (a SAFE_DETUMBLE first sample counts as an entry); detumble: time from each
   * entry to the first sample with |w| < 0.5 deg/s (null if none).
   * @param {Object} result an ADCS.sim.run result with logs
   * @returns {{n:number, settle:(number|null), peakErr:number, peakRate:number, peakRateT:number,
   *   maxTau:number, maxTauCmd:number, effort:number, margin:number, entries:number[],
   *   entryTimes:number[], detumble:(number|null)[], maxDetumble:(number|null), transitions:number,
   *   satFrac:number, final:{mode:number, errDeg:number, rateDeg:number},
   *   tLastNominalEntry:(number|null), estRmsDeg:(number|null), estMaxDeg:(number|null),
   *   estRmsTailDeg:(number|null)}} the est* fields (deg) exist only with the estimation
   *   extension; estRmsTailDeg covers the last 20 s of the run.
   */
  metrics.compute = function (result) {
    const cfg = result.config || params.DEFAULTS;
    const n = result.n;
    const acc = createAccumulator(cfg.tauMax, cfg.initial ? cfg.initial.mode : N, n ? result.t[n - 1] - 20 : 0);
    const tau = result.tau, tc = result.tauCmd, est = result.estErrDeg;
    for (let i = 0; i < n; i++) {
      const j = 3 * i;
      acc.push(Math.round(result.t[i] / result.dt), result.t[i], result.errDeg[i], result.rateDeg[i],
        tau[j], tau[j + 1], tau[j + 2], tc[j], tc[j + 1], tc[j + 2], result.mode[i], est ? est[i] : undefined);
    }
    return acc.result();
  };

  ADCS.metrics = metrics;

  /* ------------------------------------------------------------------ */
  /* ADCS.req                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Requirement checks of one run against REQ-F1, F2, S1, S2 and L1.
   * @namespace ADCS.req
   */
  const req = {};

  /**
   * Evaluate the five requirements on one run (true state).
   * @param {{config:Object, metrics?:Object}} result a sim.run result (metrics computed if absent)
   * @returns {{id:string, key:string, status:('pass'|'fail'|'na'), value:string, text:string,
   *   note:string, check:string, method:string, class:string}[]} in the order F1, F2, S1, S2, L1
   */
  req.evaluate = function (result) {
    const cfg = result.config || params.DEFAULTS;
    const m = result.metrics || metrics.compute(result);
    const L = params.LIMITS;
    const ctl = cfg.controller;
    const tauMax = cfg.tauMax;
    function item(key, status, value, note) {
      const r = params.reqById(key);
      return {
        id: r.id, key: key, status: status, value: value, note: note || '', text: r.text,
        check: r.check, method: r.method, class: r.class
      };
    }
    const out = [];
    const nEntries = m.entries.length;
    const allDetumbled = m.detumble.every(function (d) { return d !== null; });
    // F1
    if (nEntries === 0) {
      out.push(item('F1', 'na', 'no safe-mode entry in this run', 'REQ-F1 applies only after a safe-mode entry.'));
    } else if (allDetumbled) {
      out.push(item('F1', 'pass', 'max detumble time ' + fixed(m.maxDetumble, 2) + ' s', ''));
    } else {
      const k = m.detumble.indexOf(null);
      out.push(item('F1', 'fail', 'no detumble after the entry at ' + fixed(m.entryTimes[k], 2) + ' s', ''));
    }
    // F2
    if (ctl !== 'PID' && ctl !== 'LQR') {
      out.push(item('F2', 'na', 'nominal controller is ' + (ctl === 'NONE' ? 'off' : 'detumble only'),
        'REQ-F2 is checked for the PID and LQR pointing controllers.'));
    } else {
      const f = m.final;
      const ok = f.mode === N && f.errDeg < L.errDeg && f.rateDeg < L.rateDeg;
      const settled = m.settle === null ? 'not settled' : 'settled at ' + fixed(m.settle, 2) + ' s';
      out.push(item('F2', ok ? 'pass' : 'fail',
        'final error ' + fixed(f.errDeg, 3) + '\u00b0 (' + settled + ')' + (f.mode === N ? '' : ', final mode ' + modes.NAMES[f.mode]), ''));
    }
    // S1
    if (ctl === 'NONE') {
      out.push(item('S1', 'na', 'peak ' + fixed(m.peakRate, 2) + ' deg/s', 'torque-free physics demo'));
    } else {
      out.push(item('S1', m.peakRate <= L.rateMaxDeg ? 'pass' : 'fail',
        'peak ' + fixed(m.peakRate, 2) + ' deg/s, margin ' + fixed(m.margin, 2), ''));
    }
    // S2
    out.push(item('S2', m.maxTau <= tauMax * (1 + 1e-9) ? 'pass' : 'fail',
      'peak ' + fixed(m.maxTau * 1000, 2) + ' mN m (demand ' + fixed(m.maxTauCmd * 1000, 2) + ' mN m, saturated ' +
      fixed(m.satFrac * 100, 1) + '%)', ''));
    // L1 (single run)
    const l1Note = 'REQ-L1 is a statistical requirement; see the Monte Carlo runner.';
    if (nEntries === 0) {
      out.push(item('L1', 'na', 'no safe-mode entry in this run', l1Note));
    } else {
      const ok = allDetumbled && m.detumble.every(function (d) { return d <= L.detumbleS; });
      out.push(item('L1', ok ? 'pass' : 'fail',
        (allDetumbled ? 'max detumble time ' + fixed(m.maxDetumble, 2) + ' s' : 'not detumbled') + ' (limit ' + L.detumbleS + ' s)', l1Note));
    }
    return out;
  };
  /**
   * Find one requirement result by id ('REQ-S1') or key ('S1').
   * @param {Object[]} reqArray from evaluate @param {string} id @returns {Object|null}
   */
  req.byId = function (reqArray, id) {
    for (let i = 0; i < reqArray.length; i++) if (reqArray[i].id === id || reqArray[i].key === id) return reqArray[i];
    return null;
  };

  ADCS.req = req;

  /* ------------------------------------------------------------------ */
  /* ADCS.sim                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * The closed-loop simulation (single source of truth) and helpers.
   * @namespace ADCS.sim
   */
  const sim = {};
  /** Nominal controllers for config.controller. */
  sim.CONTROLLERS = Object.freeze(['PID', 'LQR', 'DETUMBLE', 'NONE']);
  /** Step limit for logged runs (memory guard); runs beyond it throw RangeError. */
  sim.MAX_STEPS_LOGGED = 500000;
  /** Step limit for log:false runs. */
  sim.MAX_STEPS = 5000000;

  function checkFiniteDeep(x, path) {
    if (typeof x === 'number') {
      if (!isFinite(x)) throw new RangeError('Input "' + path + '" must be a finite number (got ' + x + ').');
    } else if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) checkFiniteDeep(x[i], path + '[' + i + ']');
    } else if (isPlainObject(x)) {
      for (const k in x) if (Object.prototype.hasOwnProperty.call(x, k)) checkFiniteDeep(x[k], path ? path + '.' + k : k);
    }
  }
  function needVec(v, len, name) {
    if (!Array.isArray(v) && !ArrayBuffer.isView(v)) throw new RangeError(name + ' must be a list of ' + len + ' numbers.');
    if (v.length !== len) throw new RangeError(name + ' must have ' + len + ' components (got ' + v.length + ').');
    for (let i = 0; i < len; i++) {
      if (typeof v[i] !== 'number' || !isFinite(v[i])) throw new RangeError(name + ' must contain finite numbers.');
    }
  }
  function needNum(x, name, opts) {
    if (typeof x !== 'number' || !isFinite(x)) throw new RangeError(name + ' must be a finite number.');
    if (opts && opts.positive && !(x > 0)) throw new RangeError(name + ' must be greater than zero (got ' + x + ').');
    if (opts && opts.nonneg && !(x >= 0)) throw new RangeError(name + ' must not be negative (got ' + x + ').');
  }
  function needEnum(x, allowed, name) {
    if (allowed.indexOf(x) < 0) throw new RangeError(name + ' must be one of ' + allowed.join(', ') + ' (got "' + x + '").');
  }

  /**
   * Merge a config over DEFAULTS and validate it. Throws RangeError with a
   * human-readable message for invalid input (J <= 0, dt <= 0, duration <= 0,
   * fault end <= start, non-finite numbers, unknown options).
   * @param {Object} [config] delta over ADCS.params.DEFAULTS
   * @returns {Object} the full, validated config (a fresh object)
   */
  sim.resolveConfig = function (config) {
    const cfg = deepMerge(params.DEFAULTS, config || {});
    checkFiniteDeep(cfg, '');
    needVec(cfg.J, 3, 'Inertia J');
    if (!(cfg.J[0] > 0 && cfg.J[1] > 0 && cfg.J[2] > 0)) {
      throw new RangeError('Inertia J must be positive on every axis (got J = ' + list(cfg.J, 4) + ' kg m\u00b2).');
    }
    needNum(cfg.tauMax, 'Torque limit tauMax', { positive: true });
    needNum(cfg.dt, 'Time step dt', { positive: true });
    needNum(cfg.duration, 'Duration', { positive: true });
    const steps = Math.round(cfg.duration / cfg.dt);
    if (steps < 1) throw new RangeError('Duration must be at least one time step (duration ' + cfg.duration + ' s, dt ' + cfg.dt + ' s).');
    const maxSteps = cfg.log === false ? sim.MAX_STEPS : sim.MAX_STEPS_LOGGED;
    if (steps > maxSteps) {
      throw new RangeError('Too many steps: duration/dt = ' + steps + ' exceeds ' + maxSteps + '; increase dt or shorten the run.');
    }
    needVec(cfg.eulerDeg, 3, 'Initial Euler angles');
    needVec(cfg.w0Deg, 3, 'Initial body rates');
    if (cfg.q0 !== null && cfg.q0 !== undefined) {
      needVec(cfg.q0, 4, 'Initial quaternion q0');
      if (!(quat.norm(cfg.q0) > 0)) throw new RangeError('Initial quaternion q0 must not be zero.');
    }
    needVec(cfg.qRef, 4, 'Target quaternion qRef');
    if (!(quat.norm(cfg.qRef) > 0)) throw new RangeError('Target quaternion qRef must not be zero.');
    needEnum(cfg.controller, sim.CONTROLLERS, 'Controller');
    needEnum(cfg.method, integrators.METHODS, 'Integration method');
    needEnum(cfg.saturation, ['clip', 'scale'], 'Saturation mode');
    ['Kp', 'Ki', 'Kd'].forEach(function (k) { needNum(cfg.pid[k], 'PID gain ' + k, { nonneg: true }); });
    if (cfg.pid.clampFrac !== null) needNum(cfg.pid.clampFrac, 'Integrator clamp fraction', { nonneg: true });
    needEnum(cfg.pid.gate, ['nominal', 'always'], 'Integrator gate');
    needEnum(cfg.pid.onEntry, ['hold', 'reset'], 'Integrator on NOMINAL entry');
    needNum(cfg.detumble.Kd, 'Detumble gain Kd', { nonneg: true });
    needNum(cfg.hold.Kp, 'Hold gain Kp', { nonneg: true });
    needNum(cfg.hold.Kd, 'Hold gain Kd', { nonneg: true });
    needNum(cfg.lqr.qTheta, 'LQR weight q_theta', { nonneg: true });
    needNum(cfg.lqr.qW, 'LQR weight q_omega', { nonneg: true });
    needNum(cfg.lqr.r, 'LQR weight r', { positive: true });
    if (cfg.lqr.K !== null && cfg.lqr.K !== undefined) {
      if (!Array.isArray(cfg.lqr.K) || cfg.lqr.K.length !== 3) throw new RangeError('LQR gain matrix K must be 3 \u00d7 6.');
      cfg.lqr.K.forEach(function (row, i) { needVec(row, 6, 'LQR gain matrix row ' + (i + 1)); });
    }
    ['enterRateDeg', 'faultPersist', 'exitRateDeg', 'exitHold', 'returnErrDeg', 'returnRateDeg', 'dwell'].forEach(function (k) {
      needNum(cfg.safeMode[k], 'Safe-mode parameter ' + k, { nonneg: true });
    });
    if (cfg.fault.enabled) {
      needNum(cfg.fault.start, 'Fault start');
      needNum(cfg.fault.end, 'Fault end');
      if (!(cfg.fault.end > cfg.fault.start)) {
        throw new RangeError('The fault must end after it starts (start ' + cfg.fault.start + ' s, end ' + cfg.fault.end + ' s).');
      }
    }
    needVec(cfg.disturbance, 3, 'Disturbance torque');
    const d = cfg.actuator.delaySteps;
    if (!(d >= 0 && d === Math.floor(d))) throw new RangeError('Actuator delay must be a whole number of steps (got ' + d + ').');
    needNum(cfg.actuator.quantum, 'Actuator quantum', { nonneg: true });
    needEnum(cfg.sensors.mode, est.MODES, 'Feedback mode');
    if (cfg.sensors.mode !== 'truth') {
      needNum(cfg.sensors.gyroNoiseDeg, 'Gyro noise', { nonneg: true });
      needVec(cfg.sensors.gyroBiasDeg, 3, 'Gyro bias');
      needNum(cfg.sensors.stNoiseDeg, 'Star-tracker noise', { nonneg: true });
      needNum(cfg.sensors.stRateHz, 'Star-tracker rate', { positive: true });
      needNum(cfg.sensors.seed, 'Noise seed');
    }
    if ([N, SD, SH].indexOf(cfg.initial.mode) < 0) throw new RangeError('Initial mode must be 0, 1 or 2 (got ' + cfg.initial.mode + ').');
    needVec(cfg.initial.integral, 3, 'Initial integral state');
    const le = cfg.logEvery;
    if (!(le >= 1 && le === Math.floor(le))) throw new RangeError('logEvery must be a whole number of at least 1 (got ' + le + ').');
    return cfg;
  };

  /**
   * Run the closed-loop simulation. config is deep-merged over
   * ADCS.params.DEFAULTS. Per step k = 0..N (t_k = k dt): feedback, errors,
   * fault flag, mode logic, commanded torque, actuator, log, integrate (RK4,
   * zero-order hold), integrator update (PID).
   * @param {Object} [config] delta over DEFAULTS; log:false returns summaries only
   * @returns {Object} with log: {config, n, dt, t, q, w, tau, tauCmd, integ, errDeg, rateDeg,
   *   errDegUsed, rateDegUsed, qUse, estErrDeg, mode, fault, counters:{fault, below, dwell},
   *   events, metrics, req, final}; with log:false: {config, metrics, req, events, final}.
   *   final = {k, t, q, w, integral, mode, counters, tau}.
   * @throws {RangeError} for invalid input
   */
  sim.run = function (config) {
    const cfg = sim.resolveConfig(config);
    const J = cfg.J, dt = cfg.dt, tauMax = cfg.tauMax;
    const Nsteps = Math.round(cfg.duration / dt);
    const doLog = cfg.log !== false;
    const every = cfg.logEvery;
    const nLog = doLog ? Math.floor(Nsteps / every) + 1 + (Nsteps % every ? 1 : 0) : 0;
    const controller = cfg.controller;
    const satMode = cfg.saturation;
    const method = cfg.method, renorm = cfg.renormalise !== false;
    const tauD = cfg.disturbance.slice();
    const qRef = quat.normalize(cfg.qRef);
    const fEn = !!cfg.fault.enabled, fStart = cfg.fault.start, fEnd = cfg.fault.end;
    const pid = cfg.pid, det = cfg.detumble, hold = cfg.hold;
    const K = controller === 'LQR' ? lqr.gains3(J, cfg.lqr) : null;
    const Imax = (pid.clampFrac === null || pid.clampFrac === undefined || pid.Ki === 0) ? Infinity : pid.clampFrac * tauMax / pid.Ki;
    const useEst = cfg.sensors.mode !== 'truth';
    const delay = cfg.actuator.delaySteps | 0, quantum = cfg.actuator.quantum;

    // State.
    const q0 = cfg.q0 ? quat.normalize(cfg.q0) : quat.fromEuler321(cfg.eulerDeg[0] * D2R, cfg.eulerDeg[1] * D2R, cfg.eulerDeg[2] * D2R);
    const x = new Float64Array(7);
    x[0] = q0[0]; x[1] = q0[1]; x[2] = q0[2]; x[3] = q0[3];
    x[4] = cfg.w0Deg[0] * D2R; x[5] = cfg.w0Deg[1] * D2R; x[6] = cfg.w0Deg[2] * D2R;
    const I = cfg.initial.integral.slice();
    const machine = modes.createMachine(cfg.safeMode, dt, cfg.initial);
    const stepper = createStepper();
    const sensors = useEst ? est.createSensors(cfg.sensors, J, dt) : null;
    const estimator = useEst ? est.createEstimator(cfg.sensors, dt, q0) : null;
    const fifo = [];
    for (let i = 0; i < delay; i++) fifo.push([0, 0, 0]);
    let fifoHead = 0;

    // Logs.
    let L = null;
    if (doLog) {
      L = {
        t: new Float64Array(nLog), q: new Float64Array(4 * nLog), w: new Float64Array(3 * nLog),
        tau: new Float64Array(3 * nLog), tauCmd: new Float64Array(3 * nLog), integ: new Float64Array(3 * nLog),
        errDeg: new Float64Array(nLog), rateDeg: new Float64Array(nLog),
        errDegUsed: new Float64Array(nLog), rateDegUsed: new Float64Array(nLog),
        qUse: useEst ? new Float64Array(4 * nLog) : null, estErrDeg: useEst ? new Float64Array(nLog) : null,
        mode: new Uint8Array(nLog), fault: new Uint8Array(nLog),
        counters: { fault: new Uint16Array(nLog), below: new Uint16Array(nLog), dwell: new Uint16Array(nLog) }
      };
    }
    const acc = createAccumulator(tauMax, machine.mode, Math.max(0, Nsteps * dt - 20));
    const events = [];
    const inp = { rateDeg: 0, errDeg: 0, fault: false };
    const qT = [1, 0, 0, 0], wT = [0, 0, 0];
    let li = 0;
    let tau = [0, 0, 0], tauCmd = [0, 0, 0];

    for (let k = 0; k <= Nsteps; k++) {
      const t = k * dt;
      qT[0] = x[0]; qT[1] = x[1]; qT[2] = x[2]; qT[3] = x[3];
      wT[0] = x[4]; wT[1] = x[5]; wT[2] = x[6];
      // 2. Feedback.
      let qU = qT, wU = wT;
      if (useEst) {
        const s = sensors.sample(k, qT, wT);
        const u = estimator.update(k, s.wMeas, s.qMeas);
        qU = u.qUse; wU = u.wUse;
      }
      // 3. Errors (used and true).
      const qe = quat.errorShortest(qRef, qU);
      const errDeg = R2D * quat.errorAngle(qe);
      const rateDeg = R2D * Math.sqrt(wU[0] * wU[0] + wU[1] * wU[1] + wU[2] * wU[2]);
      let errDegTrue = errDeg, rateDegTrue = rateDeg, estErr;
      if (useEst) {
        errDegTrue = R2D * quat.errorAngle(quat.errorShortest(qRef, qT));
        rateDegTrue = R2D * Math.sqrt(wT[0] * wT[0] + wT[1] * wT[1] + wT[2] * wT[2]);
        estErr = R2D * quat.angleBetween(qT, qU);
      }
      // 4. Fault flag.
      const fault = fEn && fStart <= t && t < fEnd;
      // 5. Mode logic.
      inp.rateDeg = rateDeg; inp.errDeg = errDeg; inp.fault = fault;
      const ev = machine.step(inp);
      if (ev) {
        events.push({ k: k, t: t, from: ev.from, to: ev.to, reason: ev.reason, values: ev.values });
        if (ev.to === N && pid.onEntry === 'reset') { I[0] = 0; I[1] = 0; I[2] = 0; }
      }
      const mode = machine.mode;
      // 6. Commanded torque.
      if (mode === N) {
        if (controller === 'PID') tauCmd = ctrl.pid(qe, wU, I, pid);
        else if (controller === 'LQR') tauCmd = ctrl.lqr(qe, wU, K);
        else if (controller === 'DETUMBLE') tauCmd = ctrl.detumble(wU, det);
        else tauCmd = [0, 0, 0];
      } else if (mode === SD) {
        tauCmd = ctrl.detumble(wU, det);
      } else {
        tauCmd = ctrl.hold(qe, wU, hold);
      }
      // 7. Actuator: saturate, optional transport delay and quantisation.
      tau = ctrl.saturate(tauCmd, tauMax, satMode);
      if (delay > 0) {
        const out = fifo[fifoHead];
        fifo[fifoHead] = tau;
        fifoHead = (fifoHead + 1) % delay;
        tau = out;
      }
      if (quantum > 0) {
        tau = ctrl.saturate([Math.round(tau[0] / quantum) * quantum, Math.round(tau[1] / quantum) * quantum,
          Math.round(tau[2] / quantum) * quantum], tauMax, satMode);
      }
      // 8. Log (metrics always accumulate every step).
      acc.push(k, t, errDegTrue, rateDegTrue, tau[0], tau[1], tau[2], tauCmd[0], tauCmd[1], tauCmd[2], mode, estErr);
      if (doLog && (k % every === 0 || k === Nsteps)) {
        L.t[li] = t;
        const i4 = 4 * li, i3 = 3 * li;
        L.q[i4] = x[0]; L.q[i4 + 1] = x[1]; L.q[i4 + 2] = x[2]; L.q[i4 + 3] = x[3];
        L.w[i3] = x[4]; L.w[i3 + 1] = x[5]; L.w[i3 + 2] = x[6];
        L.tau[i3] = tau[0]; L.tau[i3 + 1] = tau[1]; L.tau[i3 + 2] = tau[2];
        L.tauCmd[i3] = tauCmd[0]; L.tauCmd[i3 + 1] = tauCmd[1]; L.tauCmd[i3 + 2] = tauCmd[2];
        L.integ[i3] = I[0]; L.integ[i3 + 1] = I[1]; L.integ[i3 + 2] = I[2];
        L.errDeg[li] = errDegTrue; L.rateDeg[li] = rateDegTrue;
        L.errDegUsed[li] = errDeg; L.rateDegUsed[li] = rateDeg;
        if (useEst) {
          L.qUse[i4] = qU[0]; L.qUse[i4 + 1] = qU[1]; L.qUse[i4 + 2] = qU[2]; L.qUse[i4 + 3] = qU[3];
          L.estErrDeg[li] = estErr;
        }
        L.mode[li] = mode; L.fault[li] = fault ? 1 : 0;
        const c = machine.counters;
        L.counters.fault[li] = Math.min(65535, c.fault);
        L.counters.below[li] = Math.min(65535, c.below);
        L.counters.dwell[li] = Math.min(65535, c.dwell);
        li++;
      }
      // 9. Stop after logging the last sample.
      if (k === Nsteps) break;
      // 10. Integrate with tau held over the step.
      stepper(x, tau, tauD, J, dt, method, renorm);
      // 11. Integrator update (PID only).
      if ((pid.gate === 'always' || mode === N) && controller === 'PID' &&
        !(pid.freezeWhenSaturated && ctrl.isSaturated(tauCmd, tauMax))) {
        I[0] = clamp(I[0] + qe[1] * dt, -Imax, Imax);
        I[1] = clamp(I[1] + qe[2] * dt, -Imax, Imax);
        I[2] = clamp(I[2] + qe[3] * dt, -Imax, Imax);
      }
    }

    const final = {
      k: Nsteps, t: Nsteps * dt,
      q: [x[0], x[1], x[2], x[3]], w: [x[4], x[5], x[6]],
      integral: I.slice(), mode: machine.mode, counters: machine.snapshot().counters, tau: tau.slice()
    };
    if (!doLog) {
      const outS = { config: cfg, metrics: acc.result(), events: events, final: final };
      outS.req = req.evaluate(outS);
      return outS;
    }
    const result = {
      config: cfg, n: nLog, dt: dt,
      t: L.t, q: L.q, w: L.w, tau: L.tau, tauCmd: L.tauCmd, integ: L.integ,
      errDeg: L.errDeg, rateDeg: L.rateDeg, errDegUsed: L.errDegUsed, rateDegUsed: L.rateDegUsed,
      qUse: L.qUse, estErrDeg: L.estErrDeg,
      mode: L.mode, fault: L.fault, counters: L.counters,
      events: events, final: final
    };
    // Metrics from the logs (identical to the online accumulator when every
    // step is logged); decimated logs keep the exact online metrics.
    result.metrics = every === 1 ? metrics.compute(result) : acc.result();
    result.req = req.evaluate(result);
    return result;
  };

  /**
   * Binary search on a sorted time column: the index lo with
   * t[lo] <= tQuery < t[lo + 1], clamped to [0, n - 2].
   * @param {ArrayLike<number>} t ascending times
   * @param {number} tQuery
   * @param {Array} [trace] when given, receives one {lo, hi, mid} per step
   * @returns {number}
   */
  sim.bisectTime = function (t, tQuery, trace) {
    const n = t.length;
    if (n < 2) return 0;
    if (!(tQuery > t[0])) return 0;
    if (tQuery >= t[n - 1]) return n - 2;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (trace) trace.push({ lo: lo, hi: hi, mid: mid });
      if (t[mid] <= tQuery) lo = mid; else hi = mid;
    }
    return lo;
  };

  /**
   * Interpolated sample of a logged run at time tQuery: q by slerp, other
   * signals linearly; mode, fault and counters from the previous sample.
   * @param {Object} result sim.run result with logs @param {number} tQuery
   * @returns {{t:number, k:number, q:number[], w:number[], tau:number[], tauCmd:number[],
   *   integ:number[], errDeg:number, rateDeg:number, errDegUsed:number, rateDegUsed:number,
   *   mode:number, fault:boolean, counters:{fault:number, below:number, dwell:number},
   *   euler:number[], eulerDeg:number[], qUse:(number[]|null), estErrDeg:(number|null)}}
   *   euler in rad, eulerDeg in deg (3-2-1 roll, pitch, yaw).
   */
  sim.sampleAt = function (result, tQuery) {
    const t = result.t, n = result.n;
    let tq = typeof tQuery === 'number' && isFinite(tQuery) ? tQuery : 0;
    tq = clamp(tq, t[0], t[n - 1]);
    let k = sim.bisectTime(t, tq);
    let s = 0;
    if (n > 1) {
      const span = t[k + 1] - t[k];
      s = span > 0 ? clamp((tq - t[k]) / span, 0, 1) : 0;
      if (s >= 1) { k = k + 1; s = 0; }
    }
    const k2 = Math.min(n - 1, k + 1);
    function lerp3(arr) {
      const a = 3 * k, b = 3 * k2;
      return [arr[a] + s * (arr[b] - arr[a]), arr[a + 1] + s * (arr[b + 1] - arr[a + 1]), arr[a + 2] + s * (arr[b + 2] - arr[a + 2])];
    }
    function lin(arr) { return arr[k] + s * (arr[k2] - arr[k]); }
    function q4(arr, i) { return [arr[4 * i], arr[4 * i + 1], arr[4 * i + 2], arr[4 * i + 3]]; }
    const q = s > 0 ? quat.slerp(q4(result.q, k), q4(result.q, k2), s) : q4(result.q, k);
    const eul = quat.toEuler321(q);
    return {
      t: tq, k: k,
      q: q, w: lerp3(result.w), tau: lerp3(result.tau), tauCmd: lerp3(result.tauCmd), integ: lerp3(result.integ),
      errDeg: lin(result.errDeg), rateDeg: lin(result.rateDeg),
      errDegUsed: lin(result.errDegUsed), rateDegUsed: lin(result.rateDegUsed),
      mode: result.mode[k], fault: !!result.fault[k],
      counters: { fault: result.counters.fault[k], below: result.counters.below[k], dwell: result.counters.dwell[k] },
      euler: eul, eulerDeg: [eul[0] * R2D, eul[1] * R2D, eul[2] * R2D],
      qUse: result.qUse ? (s > 0 ? quat.slerp(q4(result.qUse, k), q4(result.qUse, k2), s) : q4(result.qUse, k)) : null,
      estErrDeg: result.estErrDeg ? lin(result.estErrDeg) : null
    };
  };

  /**
   * Single-axis double integrator theta' = w, w' = (tau + tauD)/J under PID
   * with optional saturation (RK4, tau held per step, integral of theta
   * updated per step). kTheta acts on theta directly (Kp_theta = Kp/2).
   * intMode 'gated' is the single-axis stand-in for the project's "integrate only in NOMINAL,
   * reset on entry": the integral stays 0 until |theta| < gateRad, is reset once at that step and
   * then integrates with the same clamp as 'clamp' (|ki I| <= clampFrac tauMax).
   * @param {{J?:number, kTheta?:number, kW?:number, ki?:number, tauMax?:(number|null), tauD?:number,
   *   theta0?:number, w0?:number, duration?:number, dt?:number,
   *   intMode?:('naive'|'clamp'|'conditional'|'gated'|'none'), clampFrac?:number, gateRad?:number}} o
   *   defaults: J 0.040, kTheta 0.01, kW 0.08, ki 0, tauMax 0.003, tauD 0, theta0 0.5236 rad,
   *   w0 0, duration 60 s, dt 0.01 s, intMode 'clamp', clampFrac 0.1,
   *   gateRad DEFAULTS.safeMode.returnErrDeg in rad (4 deg)
   * @returns {{t:Float64Array, theta:Float64Array, w:Float64Array, tau:Float64Array,
   *   tauCmd:Float64Array, I:Float64Array}}
   */
  sim.singleAxis = function (o) {
    const c = deepMerge({
      J: 0.040, kTheta: 0.01, kW: 0.08, ki: 0, tauMax: 0.003, tauD: 0, theta0: 30 * D2R, w0: 0,
      duration: 60, dt: 0.01, intMode: 'clamp', clampFrac: 0.1, gateRad: params.DEFAULTS.safeMode.returnErrDeg * D2R
    }, o || {});
    needNum(c.J, 'Inertia J', { positive: true });
    needNum(c.dt, 'Time step dt', { positive: true });
    needNum(c.duration, 'Duration', { positive: true });
    ['kTheta', 'kW', 'ki', 'tauD', 'theta0', 'w0', 'clampFrac'].forEach(function (k) { needNum(c[k], k); });
    if (c.tauMax !== null) needNum(c.tauMax, 'Torque limit', { positive: true });
    needEnum(c.intMode, ['naive', 'clamp', 'conditional', 'gated', 'none'], 'Integrator mode');
    if (c.intMode === 'gated') needNum(c.gateRad, 'Integrator gate', { positive: true });
    const n = Math.round(c.duration / c.dt) + 1;
    if (n > sim.MAX_STEPS_LOGGED) throw new RangeError('Too many steps; increase dt or shorten the run.');
    const out = {
      t: new Float64Array(n), theta: new Float64Array(n), w: new Float64Array(n),
      tau: new Float64Array(n), tauCmd: new Float64Array(n), I: new Float64Array(n)
    };
    const lim = c.tauMax === null ? Infinity : c.tauMax;
    const clamped = c.intMode === 'clamp' || c.intMode === 'gated';
    const Imax = (clamped && c.ki > 0 && c.tauMax !== null) ? c.clampFrac * c.tauMax / c.ki : Infinity;
    let th = c.theta0, w = c.w0, I = 0, gateOpen = false;
    const h = c.dt;
    for (let k = 0; k < n; k++) {
      if (c.intMode === 'gated' && !gateOpen && Math.abs(th) < c.gateRad) { gateOpen = true; I = 0; }
      const cmd = -c.kTheta * th - c.kW * w - (c.intMode === 'none' ? 0 : c.ki * I);
      const tau = clamp(cmd, -lim, lim);
      out.t[k] = k * h; out.theta[k] = th; out.w[k] = w; out.tau[k] = tau; out.tauCmd[k] = cmd; out.I[k] = I;
      if (k === n - 1) break;
      // RK4 on [theta, w] with constant acceleration a over the step.
      const a = (tau + c.tauD) / c.J;
      const k1t = w, k1w = a;
      const k2t = w + 0.5 * h * k1w, k2w = a;
      const k3t = w + 0.5 * h * k2w, k3w = a;
      const k4t = w + h * k3w, k4w = a;
      const thNew = th + h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
      const wNew = w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
      if (c.intMode === 'naive') I = I + th * h;
      else if (c.intMode === 'clamp') I = clamp(I + th * h, -Imax, Imax);
      else if (c.intMode === 'conditional') { if (!(Math.abs(cmd) > lim * (1 + 1e-12))) I = I + th * h; }
      else if (c.intMode === 'gated' && gateOpen) I = clamp(I + th * h, -Imax, Imax);
      th = thNew; w = wNew;
    }
    return out;
  };

  /**
   * Reaction-wheel momentum exchange about one axis: the motor torque tau
   * spins the wheel up (Iw wWheel' = tau) and the body reacts (Jb wBody' = -tau).
   * Total momentum H = Jb wBody + Iw wWheel is constant.
   * @param {{Jb?:number, Iw?:number, tau?:(number|function(number):number), duration?:number,
   *   dt?:number, wBody0?:number, wWheel0?:number}} o defaults Jb 0.040, Iw 5e-5, tau 0.001,
   *   duration 20 s, dt 0.01 s, wBody0 0, wWheel0 0 (rad/s, inertial wheel rate)
   * @returns {{t:Float64Array, wBody:Float64Array, wWheel:Float64Array, wRel:Float64Array, H:Float64Array}}
   */
  sim.momentumExchange = function (o) {
    const c = deepMerge({ Jb: 0.040, Iw: 5e-5, tau: 0.001, duration: 20, dt: 0.01, wBody0: 0, wWheel0: 0 }, o || {});
    if (o && typeof o.tau === 'function') c.tau = o.tau;
    needNum(c.Jb, 'Body inertia', { positive: true });
    needNum(c.Iw, 'Wheel inertia', { positive: true });
    needNum(c.dt, 'Time step dt', { positive: true });
    needNum(c.duration, 'Duration', { positive: true });
    const n = Math.round(c.duration / c.dt) + 1;
    if (n > sim.MAX_STEPS_LOGGED) throw new RangeError('Too many steps; increase dt or shorten the run.');
    const tauF = typeof c.tau === 'function' ? c.tau : function () { return c.tau; };
    const out = { t: new Float64Array(n), wBody: new Float64Array(n), wWheel: new Float64Array(n), wRel: new Float64Array(n), H: new Float64Array(n) };
    let wb = c.wBody0, ww = c.wWheel0;
    for (let k = 0; k < n; k++) {
      const t = k * c.dt;
      out.t[k] = t; out.wBody[k] = wb; out.wWheel[k] = ww; out.wRel[k] = ww - wb; out.H[k] = c.Jb * wb + c.Iw * ww;
      const tau = Number(tauF(t)) || 0;
      wb -= tau / c.Jb * c.dt;
      ww += tau / c.Iw * c.dt;
    }
    return out;
  };

  ADCS.sim = sim;

  /* ------------------------------------------------------------------ */
  /* ADCS.mc                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Seeded Monte Carlo campaign (project setup by default).
   * @namespace ADCS.mc
   */
  const mc = {};
  /** Campaign defaults (the project set-up with the site's seed and duration). Frozen. */
  mc.DEFAULTS = deepFreeze({
    n: 60, baseSeed: 42, duration: 120, controller: 'PID', sampling: 'project',
    maxAngleDeg: 120, rateBoundDeg: 8, distBound: 2e-5, config: null
  });
  function mcOpts(opts) {
    const o = deepMerge(mc.DEFAULTS, opts || {});
    needNum(o.n, 'Number of trials', { positive: true });
    o.n = Math.round(o.n);
    needNum(o.baseSeed, 'Base seed');
    needEnum(o.sampling, ['project', 'uniform'], 'Attitude sampling');
    needNum(o.maxAngleDeg, 'Maximum angle', { nonneg: true });
    needNum(o.rateBoundDeg, 'Rate bound', { nonneg: true });
    needNum(o.distBound, 'Disturbance bound', { nonneg: true });
    return o;
  }

  /**
   * Draw the initial conditions of trial i. Project sampling: uniform axis
   * (three normals), angle U(0, maxAngle), rates U(+/-rateBound) per axis,
   * disturbance U(+/-distBound) per axis, in exactly that draw order.
   * 'uniform' draws uniform rotations by rejection (angle <= maxAngle).
   * @param {number} baseSeed @param {number} i
   * @param {{sampling?:string, maxAngleDeg?:number, rateBoundDeg?:number, distBound?:number}} [opts]
   * @returns {{i:number, seed:number, q0:number[], w0Deg:number[], tauD:number[], angleDeg:number, axis:number[]}}
   */
  mc.sampleTrial = function (baseSeed, i, opts) {
    const o = deepMerge(mc.DEFAULTS, opts || {});
    const seed = rng.trialSeed(baseSeed, i);
    const rnd = rng.mulberry32(seed);
    const maxA = o.maxAngleDeg * D2R;
    let q0, axis, angle;
    if (o.sampling === 'uniform') {
      let q = null;
      for (let tries = 0; tries < 1000; tries++) {
        q = quat.randomUniform(rnd);
        if (q[0] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
        if (quat.errorAngle(q) <= maxA) break;
      }
      let aa = quat.toAxisAngle(q);
      if (aa.angle > maxA) {
        q = quat.slerp([1, 0, 0, 0], q, maxA / aa.angle);
        aa = quat.toAxisAngle(q);
      }
      q0 = q; axis = aa.axis; angle = aa.angle;
    } else {
      const p1 = rng.normalPair(rnd), p2 = rng.normalPair(rnd);
      axis = vec.normalize([p1[0], p1[1], p2[0]]);
      angle = rnd() * maxA;
      q0 = quat.fromAxisAngle(axis, angle);
    }
    const w0Deg = [(2 * rnd() - 1) * o.rateBoundDeg, (2 * rnd() - 1) * o.rateBoundDeg, (2 * rnd() - 1) * o.rateBoundDeg];
    const tauD = [(2 * rnd() - 1) * o.distBound, (2 * rnd() - 1) * o.distBound, (2 * rnd() - 1) * o.distBound];
    return { i: i, seed: seed, q0: q0, w0Deg: w0Deg, tauD: tauD, angleDeg: angle * R2D, axis: axis };
  };

  /**
   * Run one trial (log:false, safe mode on) and summarise it.
   * L1: never entered safe mode, or every entry detumbled within 60 s.
   * finalOK: final mode NOMINAL, error < 2 deg, rate < 0.5 deg/s. safetyOK: S1 and S2.
   * @param {number} base base seed @param {number} i trial index @param {Object} [opts] mc options
   *   (opts.config is an extra config delta, e.g. {detumble:{Kd:0.01}})
   * @returns {Object} {i, seed, q0, w0Deg, axis, angleDeg, w0NormDeg, tauD, entries, detumble[],
   *   maxDetumble, peakRate, settle, finalErr, finalRate, finalMode, satFrac, tReturn, maxTau,
   *   transitions, L1, finalOK, safetyOK}
   */
  mc.runTrial = function (base, i, opts) {
    const o = deepMerge(mc.DEFAULTS, opts || {});
    const s = mc.sampleTrial(base, i, o);
    const cfg = deepMerge(o.config || {}, {
      q0: s.q0, w0Deg: s.w0Deg, disturbance: s.tauD, duration: o.duration, controller: o.controller,
      safeMode: { enabled: true }, log: false
    });
    const r = sim.run(cfg);
    const m = r.metrics;
    const L = params.LIMITS;
    const entries = m.entries.length;
    const L1 = entries === 0 || m.detumble.every(function (d) { return d !== null && d <= L.detumbleS; });
    const finalOK = m.final.mode === N && m.final.errDeg < L.errDeg && m.final.rateDeg < L.rateDeg;
    const safetyOK = m.peakRate <= L.rateMaxDeg && m.maxTau <= r.config.tauMax * (1 + 1e-9);
    return {
      i: i, seed: s.seed, q0: s.q0, w0Deg: s.w0Deg, axis: s.axis, angleDeg: s.angleDeg,
      w0NormDeg: vec.norm(s.w0Deg), tauD: s.tauD,
      entries: entries, detumble: m.detumble.slice(), maxDetumble: m.maxDetumble,
      peakRate: m.peakRate, settle: m.settle, finalErr: m.final.errDeg, finalRate: m.final.rateDeg,
      finalMode: m.final.mode, satFrac: m.satFrac,
      tReturn: m.tLastNominalEntry !== null ? m.tLastNominalEntry : (entries === 0 ? 0 : null),
      maxTau: m.maxTau, transitions: m.transitions,
      L1: L1, finalOK: finalOK, safetyOK: safetyOK
    };
  };

  /**
   * Campaign summary of a list of trial summaries.
   * @param {Object[]} trials @param {number} [elapsedMs]
   * @returns {{n:number, L1:{pass:number, rate:number, cpLower95:number}, final:{pass:number, rate:number},
   *   safety:{pass:number, rate:number}, worst:{peakRate:number, i:number},
   *   detumble:{mean:number, p95:number, max:number, count:number}, entries:number,
   *   tReturnMax:(number|null), elapsedMs:number}}
   */
  mc.summarise = function (trials, elapsedMs) {
    const n = trials.length;
    let l1 = 0, fin = 0, saf = 0, worst = -Infinity, wi = -1, entries = 0, tRet = null;
    const det = [];
    trials.forEach(function (tr) {
      if (tr.L1) l1++;
      if (tr.finalOK) fin++;
      if (tr.safetyOK) saf++;
      if (tr.peakRate > worst) { worst = tr.peakRate; wi = tr.i; }
      entries += tr.entries;
      tr.detumble.forEach(function (d) { if (d !== null) det.push(d); });
      if (tr.tReturn !== null && (tRet === null || tr.tReturn > tRet)) tRet = tr.tReturn;
    });
    det.sort(function (a, b) { return a - b; });
    return {
      n: n,
      L1: { pass: l1, rate: n ? l1 / n : NaN, cpLower95: n ? stats.cpLower(n, l1, 0.95) : NaN },
      final: { pass: fin, rate: n ? fin / n : NaN },
      safety: { pass: saf, rate: n ? saf / n : NaN },
      worst: { peakRate: worst, i: wi },
      detumble: {
        mean: det.length ? stats.mean(det) : NaN, p95: det.length ? stats.quantile(det, 0.95) : NaN,
        max: det.length ? det[det.length - 1] : NaN, count: det.length
      },
      entries: entries,
      tReturnMax: tRet,
      elapsedMs: elapsedMs || 0
    };
  };

  /**
   * Run a campaign asynchronously in chunks of about 12 ms (setTimeout 0
   * between chunks), checking signal.aborted between trials.
   * @param {Object} [opts] {n:60, baseSeed:42, duration:120, controller:'PID',
   *   sampling:'project'|'uniform', maxAngleDeg:120, rateBoundDeg:8, distBound:2e-5, config:null}
   * @param {{onProgress?:function(number, number, number), onTrial?:function(Object, number, number),
   *   signal?:{aborted:boolean}}} [hooks] onProgress(done, n, elapsedMs) after each chunk;
   *   onTrial(trial, done, n) after each trial
   * @returns {Promise<{trials:Object[], summary:Object, cancelled:boolean}>} resolves with the
   *   completed trials when cancelled (summary.cancelled true); rejects on invalid options
   */
  mc.run = function (opts, hooks) {
    let o;
    try { o = mcOpts(opts); } catch (e) { return Promise.reject(e); }
    const h = hooks || {};
    return new Promise(function (resolve, reject) {
      const trials = [];
      const t0 = now();
      let i = 0, maxChunk = 0;
      function aborted() { return !!(h.signal && h.signal.aborted); }
      function finish(cancelled) {
        const summary = mc.summarise(trials, now() - t0);
        summary.cancelled = cancelled;
        summary.maxChunkMs = maxChunk;
        resolve({ trials: trials, summary: summary, cancelled: cancelled });
      }
      function chunk() {
        if (aborted()) { finish(true); return; }
        const c0 = now();
        try {
          do {
            const tr = mc.runTrial(o.baseSeed, i, o);
            trials.push(tr);
            i++;
            if (h.onTrial) h.onTrial(tr, i, o.n);
          } while (i < o.n && !aborted() && now() - c0 < 12);
          maxChunk = Math.max(maxChunk, now() - c0);
          if (h.onProgress) h.onProgress(i, o.n, now() - t0);
        } catch (e) {
          reject(e);
          return;
        }
        if (aborted()) finish(true);
        else if (i >= o.n) finish(false);
        else setTimeout(chunk, 0);
      }
      setTimeout(chunk, 0);
    });
  };
  /**
   * Synchronous campaign (Node tests and small runs).
   * @param {Object} [opts] as mc.run @returns {{trials:Object[], summary:Object}}
   */
  mc.runSync = function (opts) {
    const o = mcOpts(opts);
    const t0 = now();
    const trials = [];
    for (let i = 0; i < o.n; i++) trials.push(mc.runTrial(o.baseSeed, i, o));
    return { trials: trials, summary: mc.summarise(trials, now() - t0) };
  };

  ADCS.mc = mc;

  /* ------------------------------------------------------------------ */
  /* ADCS.presets                                                       */
  /* ------------------------------------------------------------------ */

  const T01 = {
    eulerDeg: [25, -15, 20], w0Deg: [0, 0, 0], controller: 'PID', duration: 120,
    safeMode: { enabled: false }, fault: { enabled: false }, disturbance: [2e-5, -1e-5, 1.5e-5], sensors: { mode: 'truth' }
  };
  const T03 = deepMerge(T01, { w0Deg: [8, -6, 5], safeMode: { enabled: true }, fault: { enabled: true, start: 45, end: 60 } });
  function spin(axis) {
    const w = [0.01 * R2D, 0.01 * R2D, 0.01 * R2D];
    w[axis] = 0.5 * R2D;
    return {
      eulerDeg: [0, 0, 0], w0Deg: w, controller: 'NONE', duration: 200, safeMode: { enabled: false },
      fault: { enabled: false }, disturbance: [0, 0, 0], sensors: { mode: 'truth' }
    };
  }
  /**
   * Scenario presets: config deltas over DEFAULTS, passable straight to
   * ADCS.sim.run. Non-enumerable helpers: ids (display order), meta[id]
   * ({label, purpose, reqs, ext}) and get(id) (a mutable copy).
   * @namespace ADCS.presets
   */
  const presets = {
    T01: T01,
    T02: deepMerge(T01, { controller: 'LQR' }),
    T03: T03,
    FAULT: deepMerge(T01, {
      eulerDeg: [10, 5, -8], w0Deg: [0.5, -0.3, 0.2], duration: 90, safeMode: { enabled: true },
      fault: { enabled: true, start: 10, end: 20 }
    }),
    HIGHRATE: deepMerge(T01, { eulerDeg: [0, 0, 0], w0Deg: [8, -8, 8], safeMode: { enabled: true } }),
    LQRSAFE: deepMerge(T01, { controller: 'LQR', safeMode: { enabled: true } }),
    SPINX: spin(0),
    SPINY: spin(1),
    SPINZ: spin(2),
    ESTKF: deepMerge(T03, { sensors: { mode: 'kalman' } }),
    ESTNOISY: deepMerge(T03, { sensors: { mode: 'kalman', gyroNoiseDeg: 0.3, stNoiseDeg: 0.2 } })
  };
  const PRESET_IDS = ['T01', 'T02', 'T03', 'FAULT', 'HIGHRATE', 'LQRSAFE', 'SPINX', 'SPINY', 'SPINZ', 'ESTKF', 'ESTNOISY'];
  const PRESET_META = deepFreeze({
    T01: { label: 'T01 PID nominal', purpose: 'REQ-F2 with PID', reqs: ['REQ-F2'], ext: false },
    T02: { label: 'T02 LQR nominal', purpose: 'REQ-F2 with LQR', reqs: ['REQ-F2'], ext: false },
    T03: { label: 'T03 safe-mode upset and fault', purpose: 'REQ-F1, REQ-S1 and REQ-S2', reqs: ['REQ-F1', 'REQ-S1', 'REQ-S2'], ext: false },
    FAULT: { label: 'FAULT fault-triggered entry', purpose: 'Safe-mode entry from a persistent fault flag', reqs: [], ext: false },
    HIGHRATE: { label: 'HIGHRATE high-rate upset', purpose: 'Detumble from 13.86 deg/s', reqs: [], ext: false },
    LQRSAFE: { label: 'LQRSAFE LQR with safe mode on', purpose: 'The LQR slew trips the 6 deg/s entry', reqs: [], ext: false },
    SPINX: { label: 'SPINX torque-free spin about x', purpose: 'Intermediate-axis demo (x is the intermediate axis)', reqs: [], ext: false },
    SPINY: { label: 'SPINY torque-free spin about y', purpose: 'Intermediate-axis demo (y is the major axis)', reqs: [], ext: false },
    SPINZ: { label: 'SPINZ torque-free spin about z', purpose: 'Intermediate-axis demo (z is the minor axis)', reqs: [], ext: false },
    ESTKF: { label: 'ESTKF Kalman-style estimator (extension)', purpose: 'T03 with a per-axis Kalman-style filter', reqs: [], ext: true },
    ESTNOISY: { label: 'ESTNOISY high-noise lock-up (extension)', purpose: 'Noise versus the safe-mode thresholds', reqs: [], ext: true }
  });
  Object.defineProperty(presets, 'ids', { value: Object.freeze(PRESET_IDS.slice()), enumerable: false });
  Object.defineProperty(presets, 'meta', { value: PRESET_META, enumerable: false });
  Object.defineProperty(presets, 'get', {
    enumerable: false,
    value: function (id) { return Object.prototype.hasOwnProperty.call(presets, id) ? deepClone(presets[id]) : null; }
  });
  deepFreeze(presets);
  ADCS.presets = presets;

  /* ------------------------------------------------------------------ */
  /* ADCS.tests                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * The project's verification matrix T01-T06 and its traceability.
   * Every row's run(hooks) returns a Promise of {status:'pass'|'fail', value, detail}
   * (status 'na' if the campaign was cancelled through hooks.signal); runSync()
   * returns the same object synchronously. T04 runs the 60-trial campaign with
   * mc.run (hooks: onProgress, onTrial, signal), cached and shared with T05 and T06.
   * @namespace ADCS.tests
   */
  const tests = {};
  /** Requirement -> tests traceability, verbatim from the notes. */
  tests.trace = deepFreeze({
    'REQ-F2': ['T01', 'T02'],
    'REQ-F1': ['T03'],
    'REQ-S1': ['T03', 'T05'],
    'REQ-S2': ['T03', 'T06'],
    'REQ-L1': ['T04']
  });

  const cache = { runs: {}, campaign: null, campaignPromise: null };
  function presetRun(id) {
    if (!cache.runs[id]) cache.runs[id] = sim.run(deepMerge(presets[id], { log: false }));
    return cache.runs[id];
  }
  function campaignSync() {
    if (!cache.campaign) cache.campaign = mc.runSync({});
    return cache.campaign;
  }
  function campaignAsync(hooks) {
    if (cache.campaign) return Promise.resolve(cache.campaign);
    if (!cache.campaignPromise) {
      cache.campaignPromise = mc.run({}, hooks).then(function (res) {
        cache.campaignPromise = null;
        if (!res.cancelled) cache.campaign = res;
        return res;
      }, function (e) { cache.campaignPromise = null; throw e; });
    }
    return cache.campaignPromise;
  }
  function nominalCheck(id) {
    const r = presetRun(id);
    const f = r.metrics.final;
    const ok = f.mode === N && f.errDeg < params.LIMITS.errDeg && f.rateDeg < params.LIMITS.rateDeg;
    return {
      status: ok ? 'pass' : 'fail',
      value: 'final error ' + fixed(f.errDeg, 3) + '\u00b0, rate ' + fixed(f.rateDeg, 4) + ' deg/s, settled ' +
        (r.metrics.settle === null ? 'never' : fixed(r.metrics.settle, 2) + ' s'),
      detail: { metrics: r.metrics, req: r.req }
    };
  }
  function t03Check() {
    const r = presetRun('T03');
    const g = function (k) { return req.byId(r.req, k).status; };
    const entered = r.metrics.entries.length > 0;
    const ok = entered && g('F1') === 'pass' && g('S1') === 'pass' && g('S2') === 'pass';
    const seq = r.events.map(function (e) { return fixed(e.t, 2) + ' s ' + modes.SHORT[e.from] + '\u2192' + modes.SHORT[e.to]; }).join('; ');
    return {
      status: ok ? 'pass' : 'fail',
      value: r.events.length + ' transitions (' + seq + '); peak ' + fixed(r.metrics.peakRate, 2) + ' deg/s; max |\u03c4| ' +
        fixed(r.metrics.maxTau * 1000, 2) + ' mN m',
      detail: { metrics: r.metrics, req: r.req, events: r.events }
    };
  }
  function cancelled(res) {
    return { status: 'na', value: 'cancelled after ' + res.trials.length + ' trials', detail: { summary: res.summary } };
  }
  function t04Check(res) {
    if (res.cancelled) return cancelled(res);
    const s = res.summary;
    const ok = s.L1.rate >= params.LIMITS.l1Rate;
    return {
      status: ok ? 'pass' : 'fail',
      value: 'L1 ' + s.L1.pass + '/' + s.n + ' (' + fixed(100 * s.L1.rate, 1) + '%), one-sided 95% lower bound ' + fixed(s.L1.cpLower95, 4),
      detail: { summary: s }
    };
  }
  function acrossAll(res, field, limit, unitScale, unit) {
    if (res.cancelled) return cancelled(res);
    let worst = -Infinity, where = '';
    ['T01', 'T02', 'T03'].forEach(function (id) {
      const v = field === 'rate' ? presetRun(id).metrics.peakRate : presetRun(id).metrics.maxTau;
      if (v > worst) { worst = v; where = id; }
    });
    res.trials.forEach(function (tr) {
      const v = field === 'rate' ? tr.peakRate : tr.maxTau;
      if (v > worst) { worst = v; where = 'MC trial ' + tr.i; }
    });
    return {
      status: worst <= limit ? 'pass' : 'fail',
      value: 'max ' + fixed(worst * unitScale, field === 'rate' ? 2 : 3) + ' ' + unit + ' (' + where + ') across T01, T02, T03 and ' + res.trials.length + ' MC trials',
      detail: { worst: worst, where: where }
    };
  }
  function row(id, reqs, scenario, expected, sync, async) {
    return {
      id: id, reqs: reqs, scenario: scenario, expected: expected,
      run: function (hooks) {
        if (async) return async(hooks);
        try { return Promise.resolve(sync()); } catch (e) { return Promise.reject(e); }
      },
      runSync: sync
    };
  }
  const tauLimit = function () { return params.DEFAULTS.tauMax * (1 + 1e-9); };
  /** Rows T01-T06: {id, reqs, scenario, expected, run(hooks), runSync()}; texts verbatim from the notes. */
  tests.matrix = Object.freeze([
    row('T01', ['REQ-F2'], 'Nominal PID pointing from 25 deg, -15 deg, 20 deg initial Euler attitude.',
      'Final attitude error < 2 deg and final rate < 0.5 deg/s.', function () { return nominalCheck('T01'); }),
    row('T02', ['REQ-F2'], 'Nominal LQR pointing from same initial condition as T01.',
      'Final attitude error < 2 deg and final rate < 0.5 deg/s.', function () { return nominalCheck('T02'); }),
    row('T03', ['REQ-F1', 'REQ-S1', 'REQ-S2'], 'Safe-mode upset with high initial rate and temporary fault.',
      'Enters safe mode, detumbles below 0.5 deg/s, torque remains saturated within limits.', t03Check),
    row('T04', ['REQ-L1'], '60-trial Monte Carlo with random attitude, rate, and disturbance.',
      'At least 95% of trials reach detumble threshold within 60 s.',
      function () { return t04Check(campaignSync()); },
      function (hooks) { return campaignAsync(hooks).then(t04Check); }),
    row('T05', ['REQ-S1'], 'All simulations.', 'Maximum angular rate remains <= 15 deg/s.',
      function () { return acrossAll(campaignSync(), 'rate', params.LIMITS.rateMaxDeg, 1, 'deg/s'); },
      function (hooks) { return campaignAsync(hooks).then(function (r) { return acrossAll(r, 'rate', params.LIMITS.rateMaxDeg, 1, 'deg/s'); }); }),
    row('T06', ['REQ-S2'], 'All controller outputs.', 'Torque commands remain within +/-0.003 Nm.',
      function () { return acrossAll(campaignSync(), 'tau', tauLimit(), 1000, 'mN m'); },
      function (hooks) { return campaignAsync(hooks).then(function (r) { return acrossAll(r, 'tau', tauLimit(), 1000, 'mN m'); }); })
  ]);
  /** Forget cached preset runs and the cached campaign. */
  tests.clearCache = function () { cache.runs = {}; cache.campaign = null; cache.campaignPromise = null; };

  ADCS.tests = tests;

  /* ------------------------------------------------------------------ */
  /* ADCS.params.PROVENANCE (needs lqr)                                 */
  /* ------------------------------------------------------------------ */

  (function buildProvenance() {
    const D = params.DEFAULTS;
    const K = lqr.gains3(D.J, D.lqr);
    const sm = D.safeMode;
    const ktheta = K[0][0];
    const mcD = mc.DEFAULTS;
    const box = [0.212, 0.173, 0.274];
    const q01 = quat.fromEuler321(D.eulerDeg[0] * D2R, D.eulerDeg[1] * D2R, D.eulerDeg[2] * D2R);
    const ang01 = R2D * quat.errorAngle(quat.errorShortest(D.qRef, q01));
    /** Parameter provenance rows {key, label, value, tag, note} for the About page and tooltips. */
    params.PROVENANCE = deepFreeze([
      { key: 'J', label: 'Inertia J', value: 'diag(' + D.J.map(function (v) { return v.toFixed(3); }).join(', ') + ') kg m\u00b2', tag: 'project', note: 'Diagonal and constant; body axes are principal axes.' },
      { key: 'busBox', label: 'Equivalent uniform box', value: '4 kg, ' + box.join(' \u00d7 ') + ' m', tag: 'derived', note: 'A uniform 4 kg box of these dimensions has this J to within 0.2% (edges rounded to the millimetre; I\u2093\u2093 = m(b\u00b2 + c\u00b2)/12).' },
      { key: 'tauMax', label: 'Wheel torque limit', value: '\u00b1' + D.tauMax + ' N m per axis (\u00b1' + D.tauMax * 1000 + ' mN m)', tag: 'project', note: 'Per-axis saturation of the commanded torque.' },
      { key: 'disturbance', label: 'Nominal disturbance', value: listExp(D.disturbance) + ' N m', tag: 'project', note: 'Bounded and constant over each run.' },
      { key: 'eulerDeg', label: 'T01 initial attitude', value: 'roll ' + D.eulerDeg[0] + '\u00b0, pitch ' + D.eulerDeg[1] + '\u00b0, yaw ' + D.eulerDeg[2] + '\u00b0 (3-2-1)', tag: 'project', note: 'About ' + ang01.toFixed(1) + '\u00b0 from the target.' },
      { key: 'qRef', label: 'Target attitude', value: 'q_ref = [1, 0, 0, 0] (inertial frame)', tag: 'site', note: 'The notes use a scalar-first reference quaternion without a value.' },
      { key: 'dt', label: 'Time step', value: D.dt + ' s (control period = integration step)', tag: 'site', note: 'Timers are integer step counters.' },
      { key: 'duration', label: 'Run duration', value: D.duration + ' s', tag: 'site', note: '' },
      { key: 'method', label: 'Integrator', value: 'RK4 with renormalisation of q after every step', tag: 'project', note: 'Forward Euler is offered for teaching.' },
      { key: 'controller', label: 'Nominal controller', value: 'PID (LQR selectable)', tag: 'project', note: 'Quaternion-error PID or small-angle LQR.' },
      { key: 'pid', label: 'PID gains', value: 'Kp ' + D.pid.Kp + ' N m, Ki ' + D.pid.Ki + ' N m/s, Kd ' + D.pid.Kd + ' N m s/rad', tag: 'site', note: 'The notes give the control law, not the gain values.' },
      { key: 'pid.gate', label: 'Integrator gating', value: 'Integrates only in NOMINAL', tag: 'project', note: 'Avoids wind-up during safe detumble.' },
      { key: 'pid.clampFrac', label: 'Integrator clamp', value: '|Ki I| \u2264 ' + (D.pid.clampFrac * 100) + '% of the torque limit', tag: 'site', note: 'The project carried the integral in its RK4 state; the site holds it as a per-step controller state with this clamp.' },
      { key: 'detumble.Kd', label: 'Detumble gain', value: 'Kd ' + D.detumble.Kd + ' N m s/rad', tag: 'site', note: 'Rate damping \u03c4 = \u2212Kd \u03c9 (law from the notes).' },
      { key: 'hold', label: 'SAFE_HOLD gains', value: 'Kp ' + D.hold.Kp + ' N m, Kd ' + D.hold.Kd + ' N m s/rad', tag: 'site', note: 'Low-gain PD toward q_ref (law from the notes).' },
      { key: 'lqr.weights', label: 'LQR weights', value: 'Q = diag(' + D.lqr.qTheta + ', ' + D.lqr.qTheta + ', ' + D.lqr.qTheta + ', ' + D.lqr.qW + ', ' + D.lqr.qW + ', ' + D.lqr.qW + '), R = ' + D.lqr.r + ' I', tag: 'project', note: 'State [\u03b8, \u03c9] with \u03b8 \u2248 2 q_v.' },
      { key: 'lqr.K', label: 'LQR gains', value: 'K_\u03b8 ' + ktheta.toFixed(4) + ' N m/rad (all axes); K_\u03c9 ' + [K[0][3], K[1][4], K[2][5]].map(function (v) { return v.toFixed(4); }).join(' / ') + ' N m s/rad', tag: 'derived', note: 'Closed-form CARE solution per axis.' },
      { key: 'lqr.satAngle', label: 'LQR saturation angle', value: lqr.saturationAngleDeg(ktheta, D.tauMax).toFixed(2) + '\u00b0', tag: 'derived', note: 'Attitude error at which K_\u03b8 alone reaches the torque limit.' },
      { key: 'safeMode.enterRateDeg', label: 'Safe-mode entry rate', value: '|\u03c9| > ' + sm.enterRateDeg + ' deg/s', tag: 'project', note: 'NOMINAL \u2192 SAFE_DETUMBLE.' },
      { key: 'safeMode.faultPersist', label: 'Fault persistence', value: sm.faultPersist + ' s', tag: 'project', note: 'Fault active this long triggers SAFE_DETUMBLE.' },
      { key: 'safeMode.exit', label: 'Detumble exit', value: '|\u03c9| < ' + sm.exitRateDeg + ' deg/s held ' + sm.exitHold + ' s', tag: 'project', note: 'SAFE_DETUMBLE \u2192 SAFE_HOLD.' },
      { key: 'safeMode.return', label: 'Return guards', value: 'fault clear, |\u03c9| < ' + sm.returnRateDeg + ' deg/s, error < ' + sm.returnErrDeg + '\u00b0, dwell \u2265 ' + sm.dwell + ' s', tag: 'project', note: 'SAFE_HOLD \u2192 NOMINAL.' },
      { key: 'safeMode.counters', label: 'Timer counters', value: Math.round(sm.faultPersist / D.dt) + ' / ' + Math.round(sm.exitHold / D.dt) + ' / ' + Math.round(sm.dwell / D.dt) + ' steps', tag: 'derived', note: 'Integer step counters at dt = ' + D.dt + ' s.' },
      { key: 'safeMode.holdToDetumble', label: 'SAFE_HOLD \u2192 SAFE_DETUMBLE on re-upset', value: 'off', tag: 'site', note: 'Optional fix for the specification gap; the notes do not specify this transition.' },
      { key: 'fault', label: 'Fault window (T03)', value: D.fault.start + '\u2013' + D.fault.end + ' s', tag: 'site', note: 'The notes describe a temporary fault without times.' },
      { key: 'saturation', label: 'Saturation mode', value: 'per-axis clip', tag: 'project', note: 'Direction-preserving scaling is a site option.' },
      { key: 'actuator', label: 'Actuator delay and quantisation', value: 'none', tag: 'site', note: 'Options for the architecture widget.' },
      { key: 'sensors', label: 'Feedback', value: 'true simulated state', tag: 'project', note: 'Sensors and estimation were out of scope; the noisy, complementary and Kalman-style modes are an extension.' },
      { key: 'sensors.models', label: 'Sensor models (extension)', value: 'gyro \u03c3 ' + D.sensors.gyroNoiseDeg + ' deg/s, bias ' + list(D.sensors.gyroBiasDeg, 3) + ' deg/s; star tracker \u03c3 ' + D.sensors.stNoiseDeg + '\u00b0 at ' + D.sensors.stRateHz + ' Hz', tag: 'extension', note: 'Beyond the original project scope.' },
      { key: 'mc.n', label: 'Monte Carlo trials', value: String(mcD.n), tag: 'project', note: '' },
      { key: 'mc.sampling', label: 'Monte Carlo sampling', value: 'random axis, angle U(0, ' + mcD.maxAngleDeg + '\u00b0); rates U(\u00b1' + mcD.rateBoundDeg + ' deg/s) per axis; disturbance U(\u00b1' + Number(mcD.distBound).toExponential() + ' N m) per axis', tag: 'project', note: '' },
      { key: 'mc.baseSeed', label: 'Monte Carlo seed', value: String(mcD.baseSeed), tag: 'site', note: 'The project fixed its seed; the value here is the site\u2019s own.' },
      { key: 'mc.duration', label: 'Monte Carlo trial duration', value: mcD.duration + ' s', tag: 'site', note: '' }
    ]);
  })();

  /* ------------------------------------------------------------------ */
  /* ADCS.hash                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * URL-hash encoding of a config delta for deep links.
   * Keys: preset, eul, w, ctl, pid (Kp,Ki,Kd), kd, lqr (q1,q2,r), safe, gap,
   * fault (start,end or 0), td, sat, dur, dt, sens, q0, mc (n,seed), t,
   * method, renorm, plus hold (SAFE_HOLD Kp,Kd), clamp (integrator clamp 0|1;
   * 1 = DEFAULTS.pid.clampFrac), gyro (noise, bias x,y,z in deg/s), st (star-tracker
   * noise in deg, rate in Hz), cf (complementary kc,kb) and nseed (sensor noise seed).
   * Numbers carry at most 6 significant digits.
   * @namespace ADCS.hash
   */
  const hash = {};
  /** Every hash key that encode can write. */
  hash.KEYS = Object.freeze(['preset', 'eul', 'w', 'ctl', 'pid', 'kd', 'lqr', 'safe', 'gap', 'fault', 'td', 'sat',
    'dur', 'dt', 'sens', 'q0', 'mc', 't', 'method', 'renorm', 'hold', 'clamp', 'gyro', 'st', 'cf', 'nseed']);
  function num6(x) {
    const v = Number(Number(x).toPrecision(6));
    // Small magnitudes (disturbance torques) read better as 2e-5 than 0.00002.
    if (v !== 0 && Math.abs(v) < 1e-3) return v.toExponential();
    return String(v);
  }
  function nums(a) { return Array.prototype.map.call(a, num6).join(','); }
  function bool(b) { return b ? '1' : '0'; }

  /**
   * Encode a config delta (DEFAULTS shape plus preset, mc {n, baseSeed} and t)
   * as a hash string without the leading '#'. Only present keys are written.
   * @param {Object} d config delta @returns {string} e.g. 'preset=T03&gap=1'
   */
  hash.encode = function (d) {
    const parts = [];
    if (!d) return '';
    function put(k, v) { parts.push(k + '=' + encodeURIComponent(v).replace(/%2C/g, ',')); }
    if (d.preset) put('preset', d.preset);
    if (d.eulerDeg) put('eul', nums(d.eulerDeg));
    if (d.w0Deg) put('w', nums(d.w0Deg));
    if (d.controller) put('ctl', d.controller);
    if (d.pid && ('Kp' in d.pid || 'Ki' in d.pid || 'Kd' in d.pid)) {
      const p = deepMerge(params.DEFAULTS.pid, d.pid);
      put('pid', nums([p.Kp, p.Ki, p.Kd]));
    }
    if (d.detumble && typeof d.detumble.Kd === 'number') put('kd', num6(d.detumble.Kd));
    if (d.lqr && ('qTheta' in d.lqr || 'qW' in d.lqr || 'r' in d.lqr)) {
      const l = deepMerge(params.DEFAULTS.lqr, d.lqr);
      put('lqr', nums([l.qTheta, l.qW, l.r]));
    }
    if (d.safeMode && typeof d.safeMode.enabled === 'boolean') put('safe', bool(d.safeMode.enabled));
    if (d.safeMode && typeof d.safeMode.holdToDetumble === 'boolean') put('gap', bool(d.safeMode.holdToDetumble));
    if (d.fault && typeof d.fault.enabled === 'boolean') {
      if (d.fault.enabled) {
        const f = deepMerge(params.DEFAULTS.fault, d.fault);
        put('fault', nums([f.start, f.end]));
      } else put('fault', '0');
    }
    if (d.disturbance) put('td', nums(d.disturbance));
    if (d.saturation) put('sat', d.saturation);
    if (typeof d.duration === 'number') put('dur', num6(d.duration));
    if (typeof d.dt === 'number') put('dt', num6(d.dt));
    if (d.sensors && d.sensors.mode) put('sens', d.sensors.mode);
    if (d.q0) put('q0', nums(d.q0));
    if (d.mc && (typeof d.mc.n === 'number' || typeof d.mc.baseSeed === 'number')) {
      put('mc', nums([typeof d.mc.n === 'number' ? d.mc.n : mc.DEFAULTS.n, typeof d.mc.baseSeed === 'number' ? d.mc.baseSeed : mc.DEFAULTS.baseSeed]));
    }
    if (typeof d.t === 'number' && isFinite(d.t)) put('t', num6(d.t));
    if (d.method) put('method', d.method);
    if (typeof d.renormalise === 'boolean') put('renorm', bool(d.renormalise));
    if (d.hold && ('Kp' in d.hold || 'Kd' in d.hold)) {
      const hd = deepMerge(params.DEFAULTS.hold, d.hold);
      put('hold', nums([hd.Kp, hd.Kd]));
    }
    if (d.pid && 'clampFrac' in d.pid) put('clamp', d.pid.clampFrac === null ? '0' : '1');
    const sn = d.sensors, sd = params.DEFAULTS.sensors;
    if (sn && ('gyroNoiseDeg' in sn || 'gyroBiasDeg' in sn)) {
      put('gyro', nums([typeof sn.gyroNoiseDeg === 'number' ? sn.gyroNoiseDeg : sd.gyroNoiseDeg].concat(sn.gyroBiasDeg || sd.gyroBiasDeg)));
    }
    if (sn && ('stNoiseDeg' in sn || 'stRateHz' in sn)) {
      put('st', nums([typeof sn.stNoiseDeg === 'number' ? sn.stNoiseDeg : sd.stNoiseDeg, typeof sn.stRateHz === 'number' ? sn.stRateHz : sd.stRateHz]));
    }
    if (sn && ('kc' in sn || 'kb' in sn)) {
      put('cf', nums([typeof sn.kc === 'number' ? sn.kc : sd.kc, typeof sn.kb === 'number' ? sn.kb : sd.kb]));
    }
    if (sn && typeof sn.seed === 'number') put('nseed', num6(sn.seed));
    return parts.join('&');
  };

  /**
   * Decode a hash string (with or without '#') into a config delta.
   * Unknown keys and malformed values are ignored.
   * @param {string} s @returns {Object} delta (may contain preset, mc {n, baseSeed} and t)
   */
  hash.decode = function (s) {
    const out = {};
    if (typeof s !== 'string') return out;
    const str = s.charAt(0) === '#' ? s.slice(1) : s;
    if (!str) return out;
    function numList(v, len) {
      const a = v.split(',').map(function (x) { return x.trim() === '' ? NaN : Number(x); });
      if (a.length !== len || !a.every(function (x) { return isFinite(x); })) return null;
      return a;
    }
    function one(v) { const a = numList(v, 1); return a ? a[0] : null; }
    function sensorsOf() { return (out.sensors = out.sensors || {}); }
    function flag(v) {
      if (v === '1' || v === 'true' || v === 'on') return true;
      if (v === '0' || v === 'false' || v === 'off') return false;
      return null;
    }
    str.split('&').forEach(function (part) {
      const eq = part.indexOf('=');
      if (eq < 1) return;
      let key, val;
      try {
        key = decodeURIComponent(part.slice(0, eq));
        val = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
      } catch (e) { return; }
      let a, b;
      switch (key) {
        case 'preset': if (/^[A-Za-z0-9_-]{1,24}$/.test(val)) out.preset = val; break;
        case 'eul': if ((a = numList(val, 3))) out.eulerDeg = a; break;
        case 'w': if ((a = numList(val, 3))) out.w0Deg = a; break;
        case 'ctl': {
          const c = val.toUpperCase();
          if (sim.CONTROLLERS.indexOf(c) >= 0) out.controller = c;
          break;
        }
        case 'pid': if ((a = numList(val, 3))) out.pid = Object.assign(out.pid || {}, { Kp: a[0], Ki: a[1], Kd: a[2] }); break;
        case 'kd': if ((a = one(val)) !== null) out.detumble = { Kd: a }; break;
        case 'lqr': if ((a = numList(val, 3))) out.lqr = { qTheta: a[0], qW: a[1], r: a[2] }; break;
        case 'safe': if ((b = flag(val)) !== null) { out.safeMode = out.safeMode || {}; out.safeMode.enabled = b; } break;
        case 'gap': if ((b = flag(val)) !== null) { out.safeMode = out.safeMode || {}; out.safeMode.holdToDetumble = b; } break;
        case 'fault':
          if (flag(val) === false) out.fault = { enabled: false };
          else if ((a = numList(val, 2))) out.fault = { enabled: true, start: a[0], end: a[1] };
          break;
        case 'td': if ((a = numList(val, 3))) out.disturbance = a; break;
        case 'sat': if (val === 'clip' || val === 'scale') out.saturation = val; break;
        case 'dur': if ((a = one(val)) !== null) out.duration = a; break;
        case 'dt': if ((a = one(val)) !== null) out.dt = a; break;
        case 'sens': if (est.MODES.indexOf(val) >= 0) sensorsOf().mode = val; break;
        case 'q0': if ((a = numList(val, 4))) out.q0 = a; break;
        case 'mc': if ((a = numList(val, 2))) out.mc = { n: a[0], baseSeed: a[1] }; break;
        case 't': if ((a = one(val)) !== null) out.t = a; break;
        case 'method': if (integrators.METHODS.indexOf(val) >= 0) out.method = val; break;
        case 'renorm': if ((b = flag(val)) !== null) out.renormalise = b; break;
        case 'hold': if ((a = numList(val, 2))) out.hold = { Kp: a[0], Kd: a[1] }; break;
        case 'clamp':
          if ((b = flag(val)) !== null) { out.pid = out.pid || {}; out.pid.clampFrac = b ? params.DEFAULTS.pid.clampFrac : null; }
          break;
        case 'gyro': if ((a = numList(val, 4))) { sensorsOf().gyroNoiseDeg = a[0]; sensorsOf().gyroBiasDeg = a.slice(1); } break;
        case 'st': if ((a = numList(val, 2))) { sensorsOf().stNoiseDeg = a[0]; sensorsOf().stRateHz = a[1]; } break;
        case 'cf': if ((a = numList(val, 2))) { sensorsOf().kc = a[0]; sensorsOf().kb = a[1]; } break;
        case 'nseed': if ((a = one(val)) !== null) sensorsOf().seed = a; break;
        default: break;
      }
    });
    return out;
  };

  /**
   * Turn a decoded delta into a sim.run config delta: the named preset (if
   * any) with the other keys merged over it; preset, mc and t are dropped.
   * @param {Object} delta from decode @returns {Object}
   */
  hash.toConfig = function (delta) {
    const d = deepClone(delta || {});
    const base = (d.preset && Object.prototype.hasOwnProperty.call(presets, d.preset)) ? presets[d.preset] : {};
    delete d.preset; delete d.mc; delete d.t;
    return deepMerge(base, d);
  };

  ADCS.hash = hash;
})(typeof window !== 'undefined' ? window : globalThis);
