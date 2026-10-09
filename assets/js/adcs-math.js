/*
 * adcs-math.js: maths primitives for the ADCS teaching site.
 * Namespaces: ADCS.units, ADCS.vec, ADCS.quat, ADCS.rng, ADCS.stats.
 *
 * Conventions (binding, see the site plan):
 * - Quaternions are scalar-first plain arrays [q0, q1, q2, q3], Hamilton product.
 *   q is the active rotation from body to inertial: v_I = q (x) [0, v_B] (x) q*.
 * - toR(q) is the active body-to-inertial matrix; toDCM(q) = toR(q)^T is the
 *   passive inertial-to-body direction cosine matrix (v_B = C v_I).
 * - Euler angles are aerospace 3-2-1 (yaw, then pitch, then roll), radians.
 * - Matrices are arrays of row arrays.
 *
 * Classic script (no modules). Loads in browsers and in Node (vm.runInThisContext).
 * Never touches the DOM.
 */
(function (root) {
  'use strict';
  const ADCS = root.ADCS = root.ADCS || {};

  /* ------------------------------------------------------------------ */
  /* ADCS.units                                                         */
  /* ------------------------------------------------------------------ */

  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  /**
   * Unit conversion constants and helpers. The engine works in rad, rad/s,
   * N m and s; the UI shows deg, deg/s and mN m.
   * @namespace ADCS.units
   */
  ADCS.units = {
    D2R: D2R,
    R2D: R2D,
    /** @param {number} d degrees @returns {number} radians */
    deg2rad: function (d) { return d * D2R; },
    /** @param {number} r radians @returns {number} degrees */
    rad2deg: function (r) { return r * R2D; },
    /** @param {number} nm torque in N m @returns {number} torque in mN m */
    toMilli: function (nm) { return nm * 1000; }
  };

  /* ------------------------------------------------------------------ */
  /* ADCS.vec                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 3-vectors and 3x3 matrices (arrays of row arrays), plus a small
   * polynomial root finder. All functions return new arrays.
   * @namespace ADCS.vec
   */
  const vec = {};

  /** @param {number[]} a @param {number[]} b @returns {number[]} a + b */
  vec.add = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
  /** @param {number[]} a @param {number[]} b @returns {number[]} a - b */
  vec.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  /** @param {number[]} a @param {number} s @returns {number[]} s a */
  vec.scale = function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; };
  /** @param {number[]} a @param {number[]} b @returns {number} a . b */
  vec.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  /** @param {number[]} a @param {number[]} b @returns {number[]} a x b */
  vec.cross = function (a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  };
  /** @param {number[]} a @returns {number} Euclidean norm |a| */
  vec.norm = function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); };
  /**
   * Unit vector along a. A zero vector is returned unchanged (as zeros).
   * @param {number[]} a @returns {number[]}
   */
  vec.normalize = function (a) {
    const n = vec.norm(a);
    return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
  };
  /**
   * Skew-symmetric cross-product matrix [a x], so that skew(a) b = a x b.
   * @param {number[]} a @returns {number[][]}
   */
  vec.skew = function (a) {
    return [[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]];
  };
  /**
   * Matrix-vector product for any rectangular matrix (rows) and vector.
   * @param {number[][]} M @param {number[]} v @returns {number[]}
   */
  vec.matVec = function (M, v) {
    const out = new Array(M.length);
    for (let i = 0; i < M.length; i++) {
      const row = M[i];
      let s = 0;
      for (let j = 0; j < row.length; j++) s += row[j] * v[j];
      out[i] = s;
    }
    return out;
  };
  /**
   * Matrix product A B for rectangular matrices.
   * @param {number[][]} A @param {number[][]} B @returns {number[][]}
   */
  vec.matMul = function (A, B) {
    const n = A.length, m = B[0].length, p = B.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(m);
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let k = 0; k < p; k++) s += A[i][k] * B[k][j];
        row[j] = s;
      }
      out[i] = row;
    }
    return out;
  };
  /** @param {number[][]} M @returns {number[][]} transpose of M */
  vec.transpose = function (M) {
    const n = M.length, m = M[0].length;
    const out = new Array(m);
    for (let j = 0; j < m; j++) {
      const row = new Array(n);
      for (let i = 0; i < n; i++) row[i] = M[i][j];
      out[j] = row;
    }
    return out;
  };
  /** @param {number[][]} M 3x3 matrix @returns {number} determinant */
  vec.det = function (M) {
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  };
  /** @returns {number[][]} the 3x3 identity matrix */
  vec.eye = function () { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; };
  /** @param {number[]} d diagonal entries @returns {number[][]} diagonal matrix */
  vec.diag = function (d) {
    const n = d.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(n).fill(0);
      row[i] = d[i];
      out[i] = row;
    }
    return out;
  };

  /**
   * All roots of a real polynomial of degree <= 4 by Durand-Kerner
   * (200 iterations). Used by the pole viewer.
   * @param {number[]} coeffs coefficients, highest power first, e.g. [J, Kd, Kp] for J s^2 + Kd s + Kp
   * @returns {{re:number, im:number}[]} roots (empty for a constant polynomial)
   */
  vec.polyRoots = function (coeffs) {
    let c = Array.prototype.slice.call(coeffs).map(Number);
    while (c.length > 0 && c[0] === 0) c.shift();
    const deg = c.length - 1;
    if (deg < 1) return [];
    if (deg > 4) throw new RangeError('polyRoots supports degree 4 or lower (got degree ' + deg + ')');
    const lead = c[0];
    c = c.map(function (v) { return v / lead; });
    if (deg === 1) return [{ re: -c[1], im: 0 }];
    // Cauchy bound for the initial circle radius.
    let bound = 0;
    for (let i = 1; i <= deg; i++) bound = Math.max(bound, Math.abs(c[i]));
    const rad = 1 + bound;
    const zr = new Array(deg), zi = new Array(deg);
    // Standard non-symmetric seeds (0.4 + 0.9i)^(k+1), scaled to the root bound.
    let pr = 1, pi = 0;
    for (let k = 0; k < deg; k++) {
      const nr = pr * 0.4 - pi * 0.9, ni = pr * 0.9 + pi * 0.4;
      pr = nr; pi = ni;
      zr[k] = pr * rad * 0.5;
      zi[k] = pi * rad * 0.5;
    }
    for (let it = 0; it < 200; it++) {
      for (let i = 0; i < deg; i++) {
        // Evaluate the monic polynomial at z_i (Horner, complex).
        let vr = 1, vi = 0;
        for (let j = 1; j <= deg; j++) {
          const tr = vr * zr[i] - vi * zi[i] + c[j];
          const ti = vr * zi[i] + vi * zr[i];
          vr = tr; vi = ti;
        }
        // Denominator: prod_{j != i} (z_i - z_j).
        let dr = 1, di = 0;
        for (let j = 0; j < deg; j++) {
          if (j === i) continue;
          const ar = zr[i] - zr[j], ai = zi[i] - zi[j];
          const tr = dr * ar - di * ai, ti = dr * ai + di * ar;
          dr = tr; di = ti;
        }
        const den = dr * dr + di * di;
        if (den === 0) { zr[i] += 1e-9 * rad; continue; }
        const qr = (vr * dr + vi * di) / den, qi = (vi * dr - vr * di) / den;
        zr[i] -= qr; zi[i] -= qi;
      }
    }
    const out = [];
    for (let i = 0; i < deg; i++) {
      // Repeated real roots only converge to ~sqrt(eps) in the imaginary part,
      // so imaginary parts below 1e-7 |z| are treated as numerical noise.
      const scale = Math.max(1e-300, Math.hypot(zr[i], zi[i]));
      out.push({ re: zr[i], im: Math.abs(zi[i]) < 1e-7 * scale ? 0 : zi[i] });
    }
    out.sort(function (a, b) { return a.re - b.re || a.im - b.im; });
    return out;
  };

  ADCS.vec = vec;

  /* ------------------------------------------------------------------ */
  /* ADCS.quat                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Scalar-first Hamilton quaternions as plain arrays [q0, q1, q2, q3].
   * q is the active rotation body -> inertial.
   * @namespace ADCS.quat
   */
  const quat = {};

  /** @returns {number[]} the identity quaternion [1, 0, 0, 0] */
  quat.identity = function () { return [1, 0, 0, 0]; };

  /**
   * Hamilton product p (x) q.
   * @param {number[]} p @param {number[]} q @returns {number[]}
   */
  quat.mul = function (p, q) {
    const p0 = p[0], p1 = p[1], p2 = p[2], p3 = p[3];
    const q0 = q[0], q1 = q[1], q2 = q[2], q3 = q[3];
    return [
      p0 * q0 - p1 * q1 - p2 * q2 - p3 * q3,
      p0 * q1 + p1 * q0 + p2 * q3 - p3 * q2,
      p0 * q2 - p1 * q3 + p2 * q0 + p3 * q1,
      p0 * q3 + p1 * q2 - p2 * q1 + p3 * q0
    ];
  };
  /** @param {number[]} q @returns {number[]} conjugate [q0, -qv] */
  quat.conj = function (q) { return [q[0], -q[1], -q[2], -q[3]]; };
  /** @param {number[]} q @returns {number} |q| */
  quat.norm = function (q) { return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); };
  /**
   * Unit quaternion along q. A zero quaternion returns the identity.
   * @param {number[]} q @returns {number[]}
   */
  quat.normalize = function (q) {
    const n = quat.norm(q);
    if (!(n > 0)) return [1, 0, 0, 0];
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  };
  /**
   * Quaternion of a rotation by `angle` (rad) about `axis` (need not be unit).
   * A zero axis gives the identity.
   * @param {number[]} axis @param {number} angle @returns {number[]}
   */
  quat.fromAxisAngle = function (axis, angle) {
    const n = vec.norm(axis);
    if (!(n > 0)) return [1, 0, 0, 0];
    const s = Math.sin(angle / 2) / n;
    return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
  };
  /**
   * Axis and angle of q, using the shortest representation (angle in [0, pi]).
   * The axis is [1, 0, 0] when the rotation is (numerically) zero.
   * @param {number[]} q @returns {{axis:number[], angle:number}}
   */
  quat.toAxisAngle = function (q) {
    let s = q[0] < 0 ? -1 : 1;
    const v0 = s * q[1], v1 = s * q[2], v2 = s * q[3], w = s * q[0];
    const nv = Math.sqrt(v0 * v0 + v1 * v1 + v2 * v2);
    const angle = 2 * Math.atan2(nv, w);
    if (nv < 1e-15) return { axis: [1, 0, 0], angle: angle };
    return { axis: [v0 / nv, v1 / nv, v2 / nv], angle: angle };
  };
  /**
   * Quaternion from aerospace 3-2-1 Euler angles (radians): yaw about z,
   * then pitch about y, then roll about x.
   * @param {number} r roll phi @param {number} p pitch theta @param {number} y yaw psi
   * @returns {number[]}
   */
  quat.fromEuler321 = function (r, p, y) {
    const cr = Math.cos(r / 2), sr = Math.sin(r / 2);
    const cp = Math.cos(p / 2), sp = Math.sin(p / 2);
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
    return [
      cr * cp * cy + sr * sp * sy,
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy
    ];
  };
  /**
   * Active rotation matrix body -> inertial:
   * R = (q0^2 - qv.qv) I + 2 qv qv^T + 2 q0 [qv x].
   * @param {number[]} q unit quaternion @returns {number[][]}
   */
  quat.toR = function (q) {
    const q0 = q[0], q1 = q[1], q2 = q[2], q3 = q[3];
    const a = q0 * q0 - q1 * q1 - q2 * q2 - q3 * q3;
    return [
      [a + 2 * q1 * q1, 2 * (q1 * q2 - q0 * q3), 2 * (q1 * q3 + q0 * q2)],
      [2 * (q1 * q2 + q0 * q3), a + 2 * q2 * q2, 2 * (q2 * q3 - q0 * q1)],
      [2 * (q1 * q3 - q0 * q2), 2 * (q2 * q3 + q0 * q1), a + 2 * q3 * q3]
    ];
  };
  /**
   * Passive direction cosine matrix inertial -> body, C = R^T:
   * C = (q0^2 - qv.qv) I + 2 qv qv^T - 2 q0 [qv x]. Then v_B = C v_I.
   * @param {number[]} q unit quaternion @returns {number[][]}
   */
  quat.toDCM = function (q) {
    const q0 = q[0], q1 = q[1], q2 = q[2], q3 = q[3];
    const a = q0 * q0 - q1 * q1 - q2 * q2 - q3 * q3;
    return [
      [a + 2 * q1 * q1, 2 * (q1 * q2 + q0 * q3), 2 * (q1 * q3 - q0 * q2)],
      [2 * (q1 * q2 - q0 * q3), a + 2 * q2 * q2, 2 * (q2 * q3 + q0 * q1)],
      [2 * (q1 * q3 + q0 * q2), 2 * (q2 * q3 - q0 * q1), a + 2 * q3 * q3]
    ];
  };
  /**
   * 3-2-1 Euler angles [roll, pitch, yaw] (radians) from the DCM C:
   * roll = atan2(C23, C33), pitch = -asin(clamp(C13)), yaw = atan2(C12, C11).
   * @param {number[]} q @returns {number[]}
   */
  quat.toEuler321 = function (q) {
    const C = quat.toDCM(q);
    const s = Math.max(-1, Math.min(1, C[0][2]));
    return [Math.atan2(C[1][2], C[2][2]), -Math.asin(s), Math.atan2(C[0][1], C[0][0])];
  };
  /**
   * Rotate a vector actively by q: the vector part of q (x) [0, v] (x) q*.
   * Equal to toR(q) v for a unit quaternion.
   * @param {number[]} q @param {number[]} v @returns {number[]}
   */
  quat.rotate = function (q, v) {
    const w = q[0], x = q[1], y = q[2], z = q[3];
    // t = 2 qv x v ; v' = v + w t + qv x t
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx)
    ];
  };
  /**
   * Shortest-rotation error quaternion qe = conj(qRef) (x) q, negated when qe0 < 0.
   * @param {number[]} qRef @param {number[]} q @returns {number[]} qe with qe[0] >= 0
   */
  quat.errorShortest = function (qRef, q) {
    const e = quat.mul(quat.conj(qRef), q);
    if (e[0] < 0) { e[0] = -e[0]; e[1] = -e[1]; e[2] = -e[2]; e[3] = -e[3]; }
    return e;
  };
  /**
   * Error angle 2 atan2(|qe_v|, qe0) in radians (never acos: atan2 keeps
   * full precision at small angles).
   * @param {number[]} qe @returns {number}
   */
  quat.errorAngle = function (qe) {
    return 2 * Math.atan2(Math.sqrt(qe[1] * qe[1] + qe[2] * qe[2] + qe[3] * qe[3]), qe[0]);
  };
  /**
   * Smallest rotation angle (rad, in [0, pi]) between two attitudes.
   * @param {number[]} a @param {number[]} b @returns {number}
   */
  quat.angleBetween = function (a, b) { return quat.errorAngle(quat.errorShortest(a, b)); };
  /**
   * Spherical linear interpolation from a (s = 0) to b (s = 1) along the short
   * path. Uses normalised lerp when the dot product exceeds 0.9995.
   * @param {number[]} a @param {number[]} b @param {number} s @returns {number[]}
   */
  quat.slerp = function (a, b, s) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    if (d < 0) { d = -d; b0 = -b0; b1 = -b1; b2 = -b2; b3 = -b3; }
    if (d > 0.9995) {
      return quat.normalize([
        a[0] + s * (b0 - a[0]), a[1] + s * (b1 - a[1]),
        a[2] + s * (b2 - a[2]), a[3] + s * (b3 - a[3])
      ]);
    }
    const th = Math.acos(Math.min(1, d));
    const st = Math.sin(th);
    const wa = Math.sin((1 - s) * th) / st, wb = Math.sin(s * th) / st;
    return [wa * a[0] + wb * b0, wa * a[1] + wb * b1, wa * a[2] + wb * b2, wa * a[3] + wb * b3];
  };
  /**
   * Exact quaternion of the rotation vector v (axis times angle, rad):
   * [cos(|v|/2), sin(|v|/2) v/|v|]; first-order series [1, v/2] when |v| < 1e-12.
   * @param {number[]} v @returns {number[]}
   */
  quat.expRotvec = function (v) {
    const th = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (th < 1e-12) return [1, v[0] / 2, v[1] / 2, v[2] / 2];
    const s = Math.sin(th / 2) / th;
    return [Math.cos(th / 2), v[0] * s, v[1] * s, v[2] * s];
  };
  /**
   * Rotation vector (axis times angle, rad) of q, shortest representation.
   * Inverse of expRotvec.
   * @param {number[]} q @returns {number[]}
   */
  quat.logRotvec = function (q) {
    const sg = q[0] < 0 ? -1 : 1;
    const w = sg * q[0], x = sg * q[1], y = sg * q[2], z = sg * q[3];
    const nv = Math.sqrt(x * x + y * y + z * z);
    if (nv < 1e-15) {
      const f = w > 0 ? 2 / w : 2;
      return [x * f, y * f, z * f];
    }
    const f = 2 * Math.atan2(nv, w) / nv;
    return [x * f, y * f, z * f];
  };
  /**
   * Uniformly distributed random rotation: four standard normals (two
   * normal pairs), normalised.
   * @param {function():number} rnd uniform [0,1) generator (ADCS.rng.mulberry32)
   * @returns {number[]}
   */
  quat.randomUniform = function (rnd) {
    const a = ADCS.rng.normalPair(rnd), b = ADCS.rng.normalPair(rnd);
    return quat.normalize([a[0], a[1], b[0], b[1]]);
  };
  /**
   * The 4x4 quaternion rate matrix Omega(w), so that qdot = 1/2 Omega(w) q.
   * Used by teaching widgets.
   * @param {number[]} w body rate (rad/s) @returns {number[][]}
   */
  quat.omegaMatrix = function (w) {
    const x = w[0], y = w[1], z = w[2];
    return [[0, -x, -y, -z], [x, 0, z, -y], [y, -z, 0, x], [z, y, -x, 0]];
  };

  ADCS.quat = quat;

  /* ------------------------------------------------------------------ */
  /* ADCS.rng                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Deterministic random numbers, bit-exact with the reference values.
   * @namespace ADCS.rng
   */
  const rng = {};

  /**
   * Mulberry32 generator.
   * @param {number} seed 32-bit seed
   * @returns {function():number} generator of floats in [0, 1)
   */
  rng.mulberry32 = function (seed) {
    let a = seed | 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  /**
   * Per-trial seed derived from a base seed and a trial index (hash mix).
   * @param {number} base @param {number} i trial index (0-based) @returns {number} uint32
   */
  rng.trialSeed = function (base, i) {
    let h = (base ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  /**
   * Two independent standard normals by Box-Muller (consumes two draws).
   * @param {function():number} rnd @returns {number[]} [n1, n2]
   */
  rng.normalPair = function (rnd) {
    let u1 = rnd();
    const u2 = rnd();
    if (u1 <= 0) u1 = 1e-300;
    const r = Math.sqrt(-2 * Math.log(u1));
    return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
  };
  /**
   * Uniform draw in [a, b).
   * @param {function():number} rnd @param {number} a @param {number} b @returns {number}
   */
  rng.uniform = function (rnd, a, b) { return a + (b - a) * rnd(); };
  /**
   * Stream of standard normals from mulberry32(seed); the second value of
   * each Box-Muller pair is cached and returned by the next call.
   * @param {number} seed @returns {{next:function():number}}
   */
  rng.gaussianStream = function (seed) {
    const rnd = rng.mulberry32(seed);
    let cached = 0, has = false;
    return {
      next: function () {
        if (has) { has = false; return cached; }
        const p = rng.normalPair(rnd);
        cached = p[1]; has = true;
        return p[0];
      }
    };
  };

  ADCS.rng = rng;

  /* ------------------------------------------------------------------ */
  /* ADCS.stats                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Descriptive statistics, binomial confidence bounds and helpers.
   * @namespace ADCS.stats
   */
  const stats = {};

  function finiteOnly(values) {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (typeof v === 'number' && isFinite(v)) out.push(v);
    }
    return out;
  }

  /**
   * Arithmetic mean of the finite values (NaN when there are none).
   * @param {ArrayLike<number>} values @returns {number}
   */
  stats.mean = function (values) {
    const v = finiteOnly(values);
    if (v.length === 0) return NaN;
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i];
    return s / v.length;
  };
  /**
   * Standard deviation of the finite values. Sample (n - 1) by default.
   * @param {ArrayLike<number>} values
   * @param {{population?:boolean}} [opts] population:true divides by n
   * @returns {number}
   */
  stats.std = function (values, opts) {
    const v = finiteOnly(values);
    const pop = !!(opts && opts.population);
    const n = v.length;
    if (n === 0 || (!pop && n < 2)) return n === 1 ? 0 : NaN;
    const m = stats.mean(v);
    let s = 0;
    for (let i = 0; i < n; i++) s += (v[i] - m) * (v[i] - m);
    return Math.sqrt(s / (pop ? n : n - 1));
  };
  /**
   * Quantile of already sorted values by linear interpolation (type 7,
   * as R and NumPy default): h = (n - 1) p.
   * @param {ArrayLike<number>} sortedValues ascending
   * @param {number} p in [0, 1]
   * @returns {number}
   */
  stats.quantile = function (sortedValues, p) {
    const n = sortedValues.length;
    if (n === 0) return NaN;
    if (n === 1) return sortedValues[0];
    const pp = Math.max(0, Math.min(1, p));
    const h = (n - 1) * pp;
    const lo = Math.floor(h);
    const hi = Math.min(n - 1, lo + 1);
    return sortedValues[lo] + (h - lo) * (sortedValues[hi] - sortedValues[lo]);
  };
  /**
   * Histogram of the finite values.
   * @param {ArrayLike<number>} values
   * @param {{bins?:('auto'|number), mode?:('fixed'|'quantile'), min?:number, max?:number}} [opts]
   *   bins:'auto' uses Sturges' rule; mode:'quantile' places edges at equal-count
   *   quantiles (variable width), 'fixed' uses equal widths.
   * @returns {{x0:number, x1:number, count:number, density:number}[]}
   *   density = count / (n (x1 - x0)), so variable-width bins compare fairly.
   */
  stats.histogram = function (values, opts) {
    const o = opts || {};
    const v = finiteOnly(values).sort(function (a, b) { return a - b; });
    const n = v.length;
    if (n === 0) return [];
    let nb = (o.bins === undefined || o.bins === 'auto') ? Math.ceil(Math.log2(n) + 1) : Math.max(1, Math.round(o.bins));
    let lo = (typeof o.min === 'number') ? o.min : v[0];
    let hi = (typeof o.max === 'number') ? o.max : v[n - 1];
    if (!(hi > lo)) { lo -= 0.5; hi += 0.5; nb = 1; }
    let edges = [];
    if (o.mode === 'quantile') {
      edges.push(lo);
      for (let i = 1; i < nb; i++) {
        const e = stats.quantile(v, i / nb);
        if (e > edges[edges.length - 1] && e < hi) edges.push(e);
      }
      edges.push(hi);
    } else {
      for (let i = 0; i <= nb; i++) edges.push(lo + (hi - lo) * i / nb);
    }
    const m = edges.length - 1;
    const bins = [];
    for (let i = 0; i < m; i++) bins.push({ x0: edges[i], x1: edges[i + 1], count: 0, density: 0 });
    for (let k = 0; k < n; k++) {
      const x = v[k];
      if (x < lo || x > hi) continue;
      // Binary search for the bin; the last bin is closed on the right.
      let a = 0, b = m - 1;
      while (a < b) {
        const mid = (a + b + 1) >> 1;
        if (x >= edges[mid]) a = mid; else b = mid - 1;
      }
      bins[a].count++;
    }
    for (let i = 0; i < m; i++) {
      const w = bins[i].x1 - bins[i].x0;
      bins[i].density = w > 0 ? bins[i].count / (n * w) : 0;
    }
    return bins;
  };

  function logGamma(x) {
    // Lanczos approximation (g = 7, n = 9); accurate to ~1e-15 for x > 0.
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function logChoose(n, k) {
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  }

  /**
   * Binomial probability P(X = k) for X ~ Bin(n, p).
   * @param {number} k @param {number} n @param {number} p @returns {number}
   */
  stats.binomPmf = function (k, n, p) {
    if (k < 0 || k > n || k !== Math.floor(k)) return 0;
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    if (k === n) return Math.pow(p, n);
    if (k === 0) return Math.pow(1 - p, n);
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  };
  /**
   * Binomial cumulative probability P(X <= k) for X ~ Bin(n, p).
   * @param {number} k @param {number} n @param {number} p @returns {number}
   */
  stats.binomCdf = function (k, n, p) {
    if (k < 0) return 0;
    if (k >= n) return 1;
    let s = 0;
    for (let i = 0; i <= k; i++) s += stats.binomPmf(i, n, p);
    return Math.min(1, s);
  };
  /**
   * One-sided Clopper-Pearson lower confidence bound on a success probability.
   * alpha^(1/n) when s = n; otherwise bisection on P(X >= s | p) = 1 - conf.
   * 60 bisection steps reach full double precision, and the tail is summed over its
   * shorter side: P(X >= s | p) = P(failures <= n - s | 1 - p) when n - s < s, so each
   * step costs min(s, n - s + 1) pmf terms rather than s (fast enough to call per frame).
   * @param {number} n trials @param {number} s successes @param {number} [conf=0.95]
   * @returns {number}
   */
  stats.cpLower = function (n, s, conf) {
    const c = conf === undefined ? 0.95 : conf;
    const alpha = 1 - c;
    if (!(n > 0) || s <= 0) return 0;
    if (s >= n) return Math.pow(alpha, 1 / n);
    const failTail = n - s < s;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      // P(X >= s | mid), increasing in mid
      const tail = failTail ? stats.binomCdf(n - s, n, 1 - mid) : 1 - stats.binomCdf(s - 1, n, mid);
      if (tail < alpha) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  /**
   * Zero-failure demonstration sample size n = ceil(ln(1 - C) / ln R).
   * @param {number} R reliability to demonstrate @param {number} C confidence
   * @returns {number}
   */
  stats.zeroFailureN = function (R, C) {
    const x = Math.log(1 - C) / Math.log(R);
    // Guard against values such as 58.99999999999999 from rounding.
    const r = Math.round(x);
    return Math.abs(x - r) < 1e-9 ? r : Math.ceil(x);
  };
  /**
   * Liu-Layland rate-monotonic utilisation bound n (2^(1/n) - 1).
   * @param {number} n number of tasks @returns {number}
   */
  stats.rmBound = function (n) { return n * (Math.pow(2, 1 / n) - 1); };
  /**
   * Percentile bootstrap confidence interval of a statistic.
   * @param {ArrayLike<number>} values
   * @param {function(number[]):number} stat e.g. ADCS.stats.mean
   * @param {number} [B=1000] resamples
   * @param {function():number} [rnd] uniform generator (default mulberry32(1))
   * @param {number} [conf=0.95]
   * @returns {{lo:number, hi:number, est:number}}
   */
  stats.bootstrapCI = function (values, stat, B, rnd, conf) {
    const v = finiteOnly(values);
    const nB = B || 1000;
    const r = rnd || rng.mulberry32(1);
    const c = conf === undefined ? 0.95 : conf;
    const n = v.length;
    if (n === 0) return { lo: NaN, hi: NaN, est: NaN };
    const est = stat(v);
    const res = new Array(nB);
    const sample = new Array(n);
    for (let b = 0; b < nB; b++) {
      for (let i = 0; i < n; i++) sample[i] = v[Math.floor(r() * n)];
      res[b] = stat(sample);
    }
    res.sort(function (a, b) { return a - b; });
    return { lo: stats.quantile(res, (1 - c) / 2), hi: stats.quantile(res, 1 - (1 - c) / 2), est: est };
  };
  /**
   * Levenshtein edit distance between two sequences (strings or arrays),
   * with one optimal edit script.
   * @param {string|Array} a @param {string|Array} b
   * @returns {{distance:number, ops:{op:('keep'|'sub'|'ins'|'del'), a:*, b:*, i:number, j:number}[]}}
   *   i, j are positions in a and b (the insert/delete side carries -1).
   */
  stats.levenshtein = function (a, b) {
    const n = a.length, m = b.length;
    const D = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      D[i] = new Int32Array(m + 1);
      D[i][0] = i;
    }
    for (let j = 0; j <= m; j++) D[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost);
      }
    }
    const ops = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
        ops.push({ op: a[i - 1] === b[j - 1] ? 'keep' : 'sub', a: a[i - 1], b: b[j - 1], i: i - 1, j: j - 1 });
        i--; j--;
      } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
        ops.push({ op: 'del', a: a[i - 1], b: null, i: i - 1, j: -1 });
        i--;
      } else {
        ops.push({ op: 'ins', a: null, b: b[j - 1], i: -1, j: j - 1 });
        j--;
      }
    }
    ops.reverse();
    return { distance: D[n][m], ops: ops };
  };

  ADCS.stats = stats;
})(typeof window !== 'undefined' ? window : globalThis);
