/**
 * m04.js: Module 04, numerical integration (package P4).
 * Widgets: W4.1 Euler vs RK4 vs exact, W4.2 order-of-accuracy detective, W4.3 stability region,
 * W4.4 float precision lab, W4.5 event location by bisection (stretch).
 * Every number comes from ADCS.params / ADCS.presets or is computed live with the site engine.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const D2R = A.units.D2R, R2D = A.units.R2D;
  const MINUS = '−';

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, body: fig.querySelector('.widget-body'), controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
  }
  /** Run fn; show a RangeError from the engine inline in box instead of throwing. */
  function guarded(box, fn) {
    ui.clearError(box);
    try { return fn(); } catch (err) {
      if (err instanceof RangeError) { ui.showError(box, err); return null; }
      throw err;
    }
  }
  /** <dl class="readouts"> with [label, value] pairs; returns an updater keyed by label index. */
  function readouts(container, labels) {
    const dl = el('dl', { class: 'readouts' });
    const dds = labels.map(function (lab) {
      const dd = el('dd', null, '–');
      dl.appendChild(el('div', null, el('dt', null, lab), dd));
      return dd;
    });
    container.appendChild(dl);
    return function (values) { values.forEach(function (v, i) { if (dds[i]) dds[i].textContent = v; }); };
  }
  function sci(x, sig) { return ui.fmtSci(x, sig || 3); }
  function fmtSigned(x, sig) { return (x > 0 ? '+' : '') + ui.fmt(x, { sig: sig || 3 }); }
  /** Give every static honesty tag its tooltip from the shared tag table. */
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
  }
  /** Constant-rate quaternion kinematics qdot = 1/2 q (x) [0, w], as an f(x) for integrators.step. */
  function kinematics(w) {
    return function (q) {
      return [
        0.5 * (-q[1] * w[0] - q[2] * w[1] - q[3] * w[2]),
        0.5 * (q[0] * w[0] + q[2] * w[2] - q[3] * w[1]),
        0.5 * (q[0] * w[1] - q[1] * w[2] + q[3] * w[0]),
        0.5 * (q[0] * w[2] + q[1] * w[1] - q[2] * w[0])
      ];
    };
  }
  function qnorm(q) { return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); }
  function unit(q) { const n = qnorm(q); return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; }

  /* ================================================================ W4.1 Euler vs RK4 vs exact */

  function buildEulerRk4() {
    const w = parts('w-euler-rk4');
    const T = 100;
    const wx = ui.slider({ id: 'w41-wx', label: 'ωx', min: -10, max: 10, step: 0.5, value: 5, unit: 'deg/s' });
    const wy = ui.slider({ id: 'w41-wy', label: 'ωy', min: -10, max: 10, step: 0.5, value: -3, unit: 'deg/s' });
    const wz = ui.slider({ id: 'w41-wz', label: 'ωz', min: -10, max: 10, step: 0.5, value: 4, unit: 'deg/s' });
    const hs = ui.slider({ id: 'w41-h', label: 'Step h', min: 0.01, max: 1, value: 0.1, log: true, unit: 's', help: 'Logarithmic slider from 0.01 s to 1 s.' });
    const rn = ui.toggle({ id: 'w41-renorm', label: 'Renormalise after every step', checked: false, tag: 'project' });
    [wx, wy, wz, hs, rn].forEach(function (c) { w.controls.appendChild(c.el); });

    const status = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(status);
    const grid = el('div', { class: 'grid-2' });
    const boxN = el('div'), boxA = el('div');
    grid.appendChild(boxN); grid.appendChild(boxA);
    w.out.appendChild(grid);
    const pN = A.plot.line(boxN, {
      height: 240, title: 'Norm error ||q| − 1| (log scale)', xLabel: 't (s)', yLabel: '||q| − 1|', y: { log: true },
      series: [{ id: 'e', label: 'Forward Euler', color: '--axis-x', width: 2 }, { id: 'r', label: 'RK4', color: '--axis-z', dash: [6, 4], width: 2 }],
      hlines: [{ y: 2.220446e-16, label: 'float64 ε', color: '--text-2', dash: [2, 3] }]
    });
    const pA = A.plot.line(boxA, {
      height: 240, title: 'Attitude error against the exact solution (log scale)', xLabel: 't (s)', yLabel: 'error (deg)', y: { log: true },
      series: [{ id: 'e', label: 'Forward Euler', color: '--axis-x', width: 2, unit: 'deg' }, { id: 'r', label: 'RK4', color: '--axis-z', dash: [6, 4], width: 2, unit: 'deg' }]
    });
    const tableBox = el('div');
    w.out.appendChild(tableBox);
    const FLOOR = 1e-16;

    function run() {
      guarded(w.out, function () {
        const wv = [wx.value * D2R, wy.value * D2R, wz.value * D2R];
        const wn = Math.hypot(wv[0], wv[1], wv[2]);
        const h = hs.value;
        const n = Math.max(1, Math.round(T / h));
        const f = kinematics(wv);
        const t = new Float64Array(n + 1), nE = new Float64Array(n + 1), nR = new Float64Array(n + 1);
        const aE = new Float64Array(n + 1), aR = new Float64Array(n + 1);
        let qE = [1, 0, 0, 0], qR = [1, 0, 0, 0];
        const renorm = rn.value;
        for (let k = 0; k <= n; k++) {
          if (k > 0) {
            qE = A.integrators.step('euler', f, qE, h);
            qR = A.integrators.step('rk4', f, qR, h);
            if (renorm) { qE = unit(qE); qR = unit(qR); }
          }
          const tk = k * h;
          t[k] = tk;
          const qx = A.quat.expRotvec([wv[0] * tk, wv[1] * tk, wv[2] * tk]);
          nE[k] = Math.max(FLOOR, Math.abs(qnorm(qE) - 1));
          nR[k] = Math.max(FLOOR, Math.abs(qnorm(qR) - 1));
          aE[k] = Math.max(FLOOR, A.quat.angleBetween(qx, unit(qE)) * R2D);
          aR[k] = Math.max(FLOOR, A.quat.angleBetween(qx, unit(qR)) * R2D);
        }
        pN.set('e', t, nE); pN.set('r', t, nR);
        pA.set('e', t, aE); pA.set('r', t, aR);
        const qX = A.quat.expRotvec([wv[0] * t[n], wv[1] * t[n], wv[2] * t[n]]);
        const rows = [
          ['Forward Euler', ui.fmt(qnorm(qE), { fixed: 6 }), fmtSigned(qnorm(qE) - 1, 3), sci(A.quat.angleBetween(qX, unit(qE)) * R2D, 3)],
          ['RK4', ui.fmt(qnorm(qR), { fixed: 6 }), fmtSigned(qnorm(qR) - 1, 3), sci(A.quat.angleBetween(qX, unit(qR)) * R2D, 3)],
          ['Exact (matrix exponential)', ui.fmt(qnorm(qX), { fixed: 6 }), fmtSigned(qnorm(qX) - 1, 3), '0 (reference)']
        ];
        tableBox.textContent = '';
        tableBox.appendChild(ui.table([{ key: 'm', label: 'Method' }, { key: 'q', label: '|q| at ' + T + ' s', num: true },
          { key: 'd', label: '|q| − 1', num: true }, { key: 'a', label: 'Attitude error (deg)', num: true }], rows,
        { caption: 'After ' + T + ' s at h = ' + ui.fmt(h, { sig: 3 }) + ' s (' + n + ' steps)' + (renorm ? ', renormalised every step' : ', no renormalisation'), rowHeaders: true, compact: true }));
        const growth = Math.sqrt(1 + h * h * wn * wn / 4);
        status.textContent = '|ω| = ' + ui.fmt(wn * R2D, { sig: 4, unit: 'deg/s' }) + '. Each Euler step multiplies |q| by √(1 + h²|ω|²/4) = ' +
          ui.fmt(growth, { fixed: 9 }) + (renorm ? ', and renormalisation divides it back out.' : '; over ' + n + ' steps that compounds to ' + ui.fmt(Math.pow(growth, n), { fixed: 5 }) + '.');
        pN.summary('Norm error of the quaternion over ' + T + ' s at h = ' + ui.fmt(h, { sig: 3 }) + ' s: Euler ends at ' + sci(Math.abs(qnorm(qE) - 1), 3) +
          ', RK4 at ' + sci(Math.abs(qnorm(qR) - 1), 3) + (renorm ? ' with renormalisation on.' : '.'));
      });
    }
    const go = ui.debounce(run, 120);
    [wx, wy, wz, hs].forEach(function (c) { c.on('change', go); });
    rn.on('change', run);
    run();
  }

  /* ================================================================ W4.2 order-of-accuracy detective */

  function buildOrder() {
    const w = parts('w-order');
    const J = A.params.DEFAULTS.J;
    const W0 = [0.1, 0.2, -0.15];
    const T = 10, HS = [0.1, 0.05, 0.025];
    const VARIANTS = {
      rk4: { method: 'rk4', label: 'Correct RK4', order: 4 },
      a: { method: 'rk4-bug-weights', label: 'Mystery RK4 A', order: 2,
        reveal: 'Mystery A uses equal weights, (k₁ + k₂ + k₃ + k₄)/4, instead of 1-2-2-1. The weights still add to 1 and still give the right h² term, so the method converges, but the h³ terms no longer cancel: it is second order.' },
      b: { method: 'rk4-bug-stage', label: 'Mystery RK4 B', order: 2,
        reveal: 'Mystery B builds k₃ from x + (h/2)k₁ instead of x + (h/2)k₂, so k₃ simply repeats k₂. The chain of stages that cancels the higher Taylor terms is broken and the method drops to second order.' }
    };
    const sel = ui.segmented({ id: 'w42-variant', label: 'Third row: the RK4 under test', value: 'rk4',
      options: [{ value: 'rk4', label: 'Correct RK4' }, { value: 'a', label: 'Mystery A' }, { value: 'b', label: 'Mystery B' }] });
    w.controls.appendChild(sel.el);

    const tableBox = el('div');
    const plotBox = el('div');
    const extra = el('p', { class: 'status-line' });
    const qBox = el('div', { class: 'quiz w42-quiz' });
    w.out.appendChild(tableBox);
    w.out.appendChild(plotBox);
    w.out.appendChild(extra);
    w.out.appendChild(qBox);

    function euler(x) {
      const h0 = J[0] * x[0], h1 = J[1] * x[1], h2 = J[2] * x[2];
      return [-(x[1] * h2 - x[2] * h1) / J[0], -(x[2] * h0 - x[0] * h2) / J[1], -(x[0] * h1 - x[1] * h0) / J[2]];
    }
    function integrate(method, h) {
      let x = W0.slice();
      const n = Math.round(T / h);
      for (let i = 0; i < n; i++) x = A.integrators.step(method, euler, x, h);
      return x;
    }
    function energy(x) { return 0.5 * (J[0] * x[0] * x[0] + J[1] * x[1] * x[1] + J[2] * x[2] * x[2]); }
    const ref = integrate('rk4', 0.1 / 64);
    const T0 = energy(W0);
    function errors(method) {
      return HS.map(function (h) { const x = integrate(method, h); return Math.hypot(x[0] - ref[0], x[1] - ref[1], x[2] - ref[2]); });
    }
    const base = { euler: errors('euler'), rk2: errors('rk2') };
    const cache = {};
    const plot = A.plot.line(plotBox, {
      height: 200, title: 'Error relative to the h = 0.1 s run, against halvings of h', xLabel: 'halvings of h (0 = 0.1 s)', yLabel: 'e(h) / e(0.1 s)', y: { log: true, min: 1e-3, max: 1 }, cursor: false,
      series: [{ id: 'euler', label: 'Euler', color: '--axis-x', width: 2 }, { id: 'rk2', label: 'RK2 (midpoint)', color: '--axis-y', width: 2, dash: [6, 4] },
        { id: 'third', label: 'RK4 under test', color: '--axis-z', width: 2, dash: [2, 3] }]
    });
    const xs = new Float64Array([0, 1, 2]);
    function rel(e) { return new Float64Array([1, e[1] / e[0], e[2] / e[0]]); }
    plot.set('euler', xs, rel(base.euler));
    plot.set('rk2', xs, rel(base.rk2));

    function row(name, e) {
      const r1 = e[0] / e[1], r2 = e[1] / e[2];
      const p = Math.log2(r2);
      return [name, sci(e[0], 3), sci(e[1], 3), sci(e[2], 3), ui.fmt(r1, { fixed: 2 }), ui.fmt(r2, { fixed: 2 }), ui.fmt(p, { fixed: 2 })];
    }
    function update() {
      const v = VARIANTS[sel.value];
      const e = cache[v.method] || (cache[v.method] = errors(v.method));
      tableBox.textContent = '';
      tableBox.appendChild(ui.table([
        { key: 'm', label: 'Method' }, { key: 'a', label: 'e at h = 0.1 s', num: true }, { key: 'b', label: 'e at 0.05 s', num: true },
        { key: 'c', label: 'e at 0.025 s', num: true }, { key: 'r1', label: 'ratio 1', num: true }, { key: 'r2', label: 'ratio 2', num: true }, { key: 'p', label: 'p ≈ log₂(ratio)', num: true }
      ], [row('Forward Euler', base.euler), row('RK2 (midpoint)', base.rk2), row(v.label, e)],
      { caption: 'Error in ω after 10 s (rad/s) and the ratio between successive halvings of h', rowHeaders: true, compact: true }));
      plot.addSeries({ id: 'third', label: v.label, color: '--axis-z', width: 2, dash: [2, 3] });
      plot.set('third', xs, rel(e));
      plot.summary('Relative error after one and two halvings of h: Euler ' + ui.fmt(base.euler[2] / base.euler[0], { sig: 3 }) + ', RK2 ' + ui.fmt(base.rk2[2] / base.rk2[0], { sig: 3 }) + ', ' + v.label + ' ' + sci(e[2] / e[0], 3) + '. A slope of one decade per 3.3 halvings means first order.');
      const xE = integrate('euler', 0.1), xR = integrate(v.method, 0.1);
      extra.textContent = 'Energy check at h = 0.1 s: forward Euler changes the kinetic energy by ' + fmtSigned(100 * (energy(xE) - T0) / T0, 3) +
        '%, ' + v.label + ' by ' + fmtSigned(100 * (energy(xR) - T0) / T0, 3) + '%. The exact motion conserves it.';
      qBox.textContent = '';
      ui.quiz(qBox, [{
        q: 'From the ratio in its row, the method labelled “' + v.label + '” is…',
        options: ['fourth order (ratio about 16)', 'second order (ratio about 4)', 'first order (ratio about 2)'],
        correct: v.order === 4 ? 0 : 1,
        explain: v.order === 4
          ? 'A ratio near 16 = 2⁴ means each halving of h cuts the error 16-fold: the 1-2-2-1 weights cancel every Taylor term up to h⁴. (The last ratio creeps above 16 because the error is approaching the reference run’s own rounding.)'
          : 'A ratio near 4 = 2² means second order. ' + v.reveal + ' Both mysteries give the same ratio, so the ratio tells you the order, not which line is wrong; finding the line takes a code review.'
      }]);
    }
    sel.on('change', update);
    update();
  }

  /* ================================================================ W4.3 stability region */

  function buildStability() {
    const w = parts('w-stability');
    const J = A.params.DEFAULTS.J;
    const Kd = A.params.DEFAULTS.detumble.Kd;
    const dt = A.params.DEFAULTS.dt;
    const zs = ui.slider({ id: 'w43-z', label: 'z = hλ', min: -4, max: 0.5, step: 0.01, value: -0.5, help: 'λ is negative for a decaying mode, so a larger step means a more negative z.' });
    const meth = ui.segmented({ id: 'w43-method', label: 'Method', value: 'euler', options: [{ value: 'euler', label: 'Forward Euler' }, { value: 'rk4', label: 'RK4' }] });
    w.controls.appendChild(zs.el); w.controls.appendChild(meth.el);
    const RK4_LIMIT = -2.785293563;
    function R(m, z) { return m === 'euler' ? 1 + z : 1 + z + z * z / 2 + z * z * z / 6 + z * z * z * z / 24; }

    const verdict = el('p', { class: 'status-line w43-verdict', 'aria-live': 'polite' });
    w.out.appendChild(verdict);
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid);
    const zGrid = new Float64Array(451);
    for (let i = 0; i < zGrid.length; i++) zGrid[i] = -4 + i * 0.01;
    const pR = A.plot.line(b1, {
      height: 200, title: 'Amplification |R(z)| on the real axis', xLabel: 'z = hλ', yLabel: '|R(z)|', y: { min: 0, max: 3.2, auto: false },
      series: [{ id: 'R', label: '|R(z)|', color: '--accent', width: 2 }],
      hlines: [{ y: 1, label: '|R| = 1', color: '--line-req' }],
      vlines: [{ x: -2, label: 'Euler −2', color: '--axis-x' }, { x: RK4_LIMIT, label: 'RK4 −2.785', color: '--axis-z' }]
    });
    const pS = A.plot.line(b2, {
      height: 200, title: 'Decay sequence ωₖ / ω₀ for 20 steps', xLabel: 'step k', yLabel: 'ωₖ / ω₀', y: { min: -2, max: 2, auto: false }, cursor: false,
      series: [{ id: 'num', label: 'numerical', color: '--accent', width: 2 }, { id: 'ex', label: 'exact e^(zk)', color: '--text-2', dash: [5, 4] }]
    });
    const ks = new Float64Array(21);
    for (let k = 0; k <= 20; k++) ks[k] = k;
    const tableBox = el('div');
    w.out.appendChild(tableBox);
    const note = el('p', { class: 'status-line' });
    w.out.appendChild(note);

    function update() {
      const m = meth.value, z = zs.value;
      const ys = new Float64Array(zGrid.length);
      for (let i = 0; i < zGrid.length; i++) ys[i] = Math.abs(R(m, zGrid[i]));
      pR.set('R', zGrid, ys);
      pR.setCursor(z);
      const r = R(m, z);
      const seq = new Float64Array(21), ex = new Float64Array(21);
      for (let k = 0; k <= 20; k++) { seq[k] = Math.pow(r, k); ex[k] = Math.exp(z * k); }
      pS.set('num', ks, seq); pS.set('ex', ks, ex);
      // |R| = 1 (z = 0, or Euler at z = −2) neither decays nor grows; a tolerance absorbs slider rounding
      const ar = Math.abs(r), neutral = Math.abs(ar - 1) < 1e-9;
      const state = neutral ? ['na', 'Neutral'] : ar < 1 ? ['pass', 'Decays'] : ['fail', 'Grows'];
      verdict.textContent = '';
      verdict.appendChild(ui.badge(state[0], state[1]));
      verdict.appendChild(document.createTextNode(' ' + (m === 'euler' ? 'Forward Euler' : 'RK4') + ': R(' + ui.fmt(z, { fixed: 2 }) + ') = ' + ui.fmt(neutral ? Math.sign(r) : r, { sig: 4 }) +
        ', so after 20 steps |ω₂₀/ω₀| = ' + (neutral ? '1: the sequence neither decays nor grows' : ui.fmt(Math.pow(ar, 20), { sig: 3 })) + (r < 0 ? ', alternating in sign.' : '.')));
      const lim = m === 'euler' ? 2 : -RK4_LIMIT;
      const rows = J.map(function (Ji, i) {
        const lam = -Kd / Ji;
        return ['xyz'[i], ui.fmt(Ji, { fixed: 3 }), ui.fmt(lam, { fixed: 3 }), z < 0 ? ui.fmt(z / lam, { sig: 3, unit: 's' }) : 'z ≥ 0 (no decay)', ui.fmt(2 / -lam, { sig: 3, unit: 's' }), ui.fmt(-RK4_LIMIT / -lam, { sig: 3, unit: 's' })];
      });
      tableBox.textContent = '';
      tableBox.appendChild(ui.table([{ key: 'a', label: 'Axis' }, { key: 'J', label: 'J (kg m²)', num: true }, { key: 'l', label: 'λ = −Kd/J (1/s)', num: true },
        { key: 'h', label: 'h for this z', num: true }, { key: 'e', label: 'h limit, Euler', num: true }, { key: 'r', label: 'h limit, RK4', num: true }], rows,
      { caption: 'Detumble with Kd = ' + Kd + ' N m s: step sizes per axis', rowHeaders: true, compact: true }));
      const zSim = -Kd / Math.min.apply(null, J) * dt;
      note.textContent = 'The simulator runs at dt = ' + dt + ' s, which is z = ' + ui.fmt(zSim, { sig: 2 }) + ' on the stiffest axis: ' +
        ui.fmt(lim / -zSim, { sig: 3 }) + ' times inside the ' + (m === 'euler' ? 'Euler' : 'RK4') + ' limit.';
      pR.summary('|R(z)| for ' + (m === 'euler' ? 'forward Euler' : 'RK4') + ' from z = −4 to 0.5; the method is stable where |R| ≤ 1, down to z = ' + (m === 'euler' ? '−2' : '−2.785') + '. Current z = ' + ui.fmt(z, { fixed: 2 }) + ', |R| = ' + ui.fmt(Math.abs(r), { sig: 3 }) + '.');
    }
    zs.on('change', update);
    meth.on('change', update);
    pR.onSeek(function (z) { zs.set(Math.round(Math.max(-4, Math.min(0.5, z)) * 100) / 100); update(); });
    update();
  }

  /* ================================================================ W4.4 float precision lab */

  function buildFloat() {
    const w = parts('w-float');
    const prec = ui.segmented({ id: 'w44-prec', label: 'Precision', value: 'f32', options: [{ value: 'f32', label: 'float32 (single)' }, { value: 'f64', label: 'float64 (double)' }] });
    const th = ui.slider({ id: 'w44-theta', label: 'True error angle θ', min: 1e-6, max: 1e-2, value: 1e-3, log: true, unit: 'rad', help: 'Logarithmic slider from 10⁻⁶ to 10⁻² rad.' });
    w.controls.appendChild(prec.el); w.controls.appendChild(th.el);

    function rnd(x, f32) { return f32 ? Math.fround(x) : x; }
    /** The attitude error of a rotation by theta about one axis, computed both ways at the chosen precision. */
    function angles(theta, f32) {
      const q0 = rnd(Math.cos(theta / 2), f32), qv = rnd(Math.sin(theta / 2), f32);
      return { q0: q0, qv: qv, acos: rnd(2 * rnd(Math.acos(q0), f32), f32), atan2: rnd(2 * rnd(Math.atan2(qv, q0), f32), f32) };
    }
    // collapse threshold: the largest angle whose cos(theta/2) rounds to exactly 1
    function collapseAt(f32) {
      let lo = 1e-12, hi = 1e-1;
      for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (rnd(Math.cos(m / 2), f32) === 1) lo = m; else hi = m; }
      return lo;
    }
    const COLLAPSE = { f32: collapseAt(true), f64: collapseAt(false) };

    w.out.appendChild(el('h4', { class: 'w44-h' }, 'A. The error angle of a small rotation'));
    const setA = readouts(w.out, ['stored q₀', 'stored |qᵥ|', '2·acos(q₀)', '2·atan2(|qᵥ|, q₀)']);
    const boxA = el('div');
    w.out.appendChild(boxA);
    // log axes cannot show zero, so a collapsed acos is drawn on the axis floor, one decade below the chart's smallest angle
    const FLOOR = 1e-7;
    const pA = A.plot.line(boxA, {
      height: 220, title: 'Computed error angle against the true angle (log–log)', xLabel: 'log₁₀ θ (θ in rad)', yLabel: 'computed angle (rad)', y: { log: true, min: FLOOR, max: 1e-2 },
      series: [{ id: 'true', label: 'true θ', color: '--text-2', dash: [5, 4], unit: 'rad' }, { id: 'acos', label: '2·acos(q₀)', color: '--axis-x', width: 2.2, unit: 'rad' },
        { id: 'atan', label: '2·atan2(|qᵥ|, q₀)', color: '--axis-z', width: 2, dash: [2, 3], unit: 'rad' }]
    });
    const noteA = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(noteA);

    w.out.appendChild(el('h4', { class: 'w44-h' }, 'B. A dwell timer that sums 0.01 s'));
    const tableB = el('div');
    w.out.appendChild(tableB);
    const boxB = el('div');
    w.out.appendChild(boxB);
    const pB = A.plot.line(boxB, {
      height: 180, title: 'Accumulated timer error tₖ − k·0.01', xLabel: 'step k', yLabel: 'error (s)',
      series: [{ id: 'err', label: 'summed timer error', color: '--warn', width: 2, unit: 's' }],
      vlines: [{ x: 800, label: '800 steps', color: '--text-2' }]
    });

    // LOCAL (request P0): ADCS.plot.line has no logarithmic x axis, so panel A plots log10(theta) on a linear axis.
    const xs = new Float64Array(401);
    for (let i = 0; i < xs.length; i++) xs[i] = -6 + i * 0.01;
    const nD = A.modes.limits(A.params.DEFAULTS.safeMode, A.params.DEFAULTS.dt).nD;
    const dwell = A.params.DEFAULTS.safeMode.dwell, dt = A.params.DEFAULTS.dt;

    /** Sum dt K times at one precision: the error trace, the sum after nD additions and the first step with t >= dwell. */
    function timer(f32) {
      const K = 820, ks = new Float64Array(K + 1), err = new Float64Array(K + 1), inc = rnd(dt, f32);
      let t = 0, steps = null, tN = 0;
      for (let k = 0; k <= K; k++) {
        if (k > 0) t = rnd(t + inc, f32);
        ks[k] = k; err[k] = t - k * dt;
        if (k === nD) tN = t;
        if (steps === null && t >= dwell) steps = k;
      }
      return { ks: ks, err: err, tN: tN, steps: steps, K: K };
    }
    const TIMER = { f64: timer(false), f32: timer(true) };
    function timerCells(tm, f32) {
      const e = tm.tN - dwell;
      return [(f32 ? String(tm.tN) : String(Number(tm.tN.toPrecision(15)))) + ' s',
        tm.steps + (tm.steps > nD ? ' (one step late)' : tm.steps === nD ? ' (on time, by luck of rounding)' : ' (early)'),
        (e > 0 ? '+' : MINUS) + sci(Math.abs(e), 2) + ' s'];
    }
    // both precisions side by side: the float64 sum is the one that fires late, the float32 one happens to round upwards
    (function () {
      const a = timerCells(TIMER.f64, false), b = timerCells(TIMER.f32, true);
      const rows = [['t after ' + nD + ' additions', a[0], b[0], nD + ' × ' + dt + ' s = ' + dwell + ' s'],
        ['Steps until t ≥ ' + dwell + ' s', a[1], b[1], nD + ' (exact)'],
        ['Error after ' + nD + ' steps', a[2], b[2], '0']];
      tableB.appendChild(ui.table([{ key: 'q', label: 'Quantity' }, { key: 'd', label: 'float64 sum', num: true }, { key: 's', label: 'float32 sum', num: true }, { key: 'i', label: 'Integer counter', num: true }], rows,
        { caption: 'The same ' + nD + ' additions of ' + dt + ' s in both precisions, against counting whole steps', rowHeaders: true, compact: true }));
    }());

    function update() {
      const f32 = prec.value === 'f32';
      const yT = new Float64Array(xs.length), yA = new Float64Array(xs.length), yB = new Float64Array(xs.length);
      for (let i = 0; i < xs.length; i++) {
        const t = Math.pow(10, xs[i]), a = angles(t, f32);
        yT[i] = t; yA[i] = Math.max(a.acos, FLOOR); yB[i] = a.atan2;
      }
      pA.set('true', xs, yT); pA.set('acos', xs, yA); pA.set('atan', xs, yB);
      const cx = Math.log10(COLLAPSE[prec.value]);
      pA.setLines({ vbands: cx > -6 ? [{ x0: -6, x1: cx, color: '--band-fault' }] : [] });
      pA.setCursor(Math.log10(th.value));
      const a = angles(th.value, f32);
      function relErr(v) { return Math.abs(v - th.value) / th.value; }
      setA([ui.fmt(a.q0, { fixed: f32 ? 9 : 15 }), sci(a.qv, f32 ? 7 : 12), a.acos === 0 ? '0 (collapsed)' : sci(a.acos, 4) + ' (error ' + ui.fmt(100 * relErr(a.acos), { sig: 2 }) + '%)',
        sci(a.atan2, 4) + ' (error ' + (relErr(a.atan2) < 1e-15 ? '< 10⁻¹⁵' : sci(100 * relErr(a.atan2), 2)) + '%)']);
      noteA.textContent = f32
        ? 'In float32, cos(θ/2) rounds to exactly 1 for θ below ' + sci(COLLAPSE.f32, 3) + ' rad (' + ui.fmt(COLLAPSE.f32 * R2D, { sig: 2 }) + '°, the shaded band), so acos returns exactly zero, drawn here on the axis floor. Just above it acos returns coarse steps.'
        : 'In float64 the same collapse only starts below ' + sci(COLLAPSE.f64, 2) + ' rad, off this chart, but acos still loses digits as θ shrinks; atan2 stays exact to rounding.';
      pA.summary('Computed error angle against the true angle from 10⁻⁶ to 10⁻² rad in ' + (f32 ? 'float32' : 'float64') + '. atan2 follows the true angle; acos ' +
        (f32 ? 'collapses to zero below ' + sci(COLLAPSE.f32, 2) + ' rad.' : 'stays on the line in this range.'));

      // B: the plot follows the precision toggle; the table above always shows both
      const tm = TIMER[prec.value];
      pB.addSeries({ id: 'err', label: 'summed timer error, ' + (f32 ? 'float32' : 'float64') });
      pB.set('err', tm.ks, tm.err);
      pB.summary('Summed timer error over ' + tm.K + ' steps in ' + (f32 ? 'float32' : 'float64') + ': after ' + nD + ' additions t = ' + timerCells(tm, f32)[0] + '; the loop reaches ' + dwell + ' s after ' + tm.steps + ' steps.');
    }
    prec.on('change', update);
    th.on('change', update);
    pA.onSeek(function (x) { th.set(Math.pow(10, Math.max(-6, Math.min(-2, x)))); update(); });
    update();
  }

  /* ================================================================ W4.5 event location by bisection */

  function buildBisect() {
    const w = parts('w-bisect');
    const thr = A.params.DEFAULTS.safeMode.exitRateDeg;
    const go = ui.button({ label: 'Start again', icon: 'reset' });
    const next = ui.button({ label: 'Next halving', icon: 'step-fwd' });
    const all = ui.button({ label: 'Show all 10', kind: 'ghost' });
    next.disabled = true; all.disabled = true;
    w.controls.appendChild(el('div', { class: 'btn-row' }, go, next, all));
    const status = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(status);
    const plotBox = el('div');
    w.out.appendChild(plotBox);
    const tableBox = el('div');
    w.out.appendChild(tableBox);
    const p = A.plot.line(plotBox, {
      height: 190, title: 'Rate inside the step that contains the crossing', xLabel: 'time after step start (ms)', yLabel: '|ω| (deg/s)', y: { includeLines: true },
      series: [{ id: 'w', label: '|ω| (RK4 sub-steps)', color: '--accent', width: 2, unit: 'deg/s' }],
      hlines: [{ y: thr, label: thr + ' deg/s threshold', color: '--line-thr' }]
    });
    let st = null;

    function locate() {
      const res = guarded(w.out, function () { return A.sim.run(A.presets.get('HIGHRATE')); });
      if (!res) return;
      const k0 = res.metrics.entries.length ? res.metrics.entries[0] : 0;
      let k = -1;
      for (let i = k0; i < res.n - 1; i++) if (res.rateDeg[i] >= thr && res.rateDeg[i + 1] < thr) { k = i; break; }
      if (k < 0) { status.textContent = 'No crossing found in this run.'; return; }
      const cfg = res.config, h = res.dt;
      const x0 = [res.q[4 * k], res.q[4 * k + 1], res.q[4 * k + 2], res.q[4 * k + 3], res.w[3 * k], res.w[3 * k + 1], res.w[3 * k + 2]];
      const tau = [res.tau[3 * k], res.tau[3 * k + 1], res.tau[3 * k + 2]];
      function rateAfter(s) {
        if (s <= 0) return res.rateDeg[k];
        const x = A.dynamics.propagate(x0, tau, cfg.disturbance, cfg.J, s, { method: cfg.method, renormalise: cfg.renormalise });
        return Math.hypot(x[4], x[5], x[6]) * R2D;
      }
      const N = 64, xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { xs[i] = 1000 * h * i / N; ys[i] = rateAfter(h * i / N); }
      p.set('w', xs, ys);
      st = { k: k, t0: res.t[k], h: h, a: 0, b: h, rows: [], rateAfter: rateAfter, rk: res.rateDeg[k], rk1: res.rateDeg[k + 1] };
      p.setLines({ vbands: [{ x0: 0, x1: 1000 * h, color: '--band-ok' }] });
      next.disabled = false; all.disabled = false;
      render();
      status.textContent = 'Safe mode entered at t = 0 s. The rate is ' + ui.fmt(st.rk, { fixed: 4 }) + ' deg/s at step ' + k + ' (t = ' + ui.fmt(st.t0, { fixed: 2 }) +
        ' s) and ' + ui.fmt(st.rk1, { fixed: 4 }) + ' deg/s one step later, so the crossing lies inside this ' + ui.fmt(1000 * h, { sig: 2 }) + ' ms step.';
    }
    function halve() {
      if (!st || st.rows.length >= 10) return;
      const m = 0.5 * (st.a + st.b), r = st.rateAfter(m);
      const below = r < thr;
      st.rows.push({ a: st.a, b: st.b, m: m, r: r, below: below });
      if (below) st.b = m; else st.a = m;
      render();
      if (st.rows.length >= 10) { next.disabled = true; all.disabled = true; }
    }
    function render() {
      p.setLines({ vbands: [{ x0: 1000 * st.a, x1: 1000 * st.b, color: '--band-ok' }] });
      tableBox.textContent = '';
      const rows = st.rows.map(function (r, i) {
        return [String(i + 1), ui.fmt(1000 * r.a, { fixed: 4 }) + ' to ' + ui.fmt(1000 * r.b, { fixed: 4 }), ui.fmt(1e6 * (r.b - r.a) / 2, { sig: 3 }),
          ui.fmt(r.r, { fixed: 5 }), r.below ? 'first half' : 'second half'];
      });
      tableBox.appendChild(ui.table([{ key: 'i', label: 'Halving' }, { key: 'iv', label: 'Interval (ms after step start)' }, { key: 'w', label: 'New width (µs)', num: true },
        { key: 'r', label: '|ω| at midpoint (deg/s)', num: true }, { key: 'c', label: 'Crossing in' }], rows, { caption: 'Bisection inside step ' + st.k, compact: true }));
      if (st.rows.length) {
        const tc = st.t0 + 0.5 * (st.a + st.b);
        const lin = st.t0 + st.h * (st.rk - thr) / (st.rk - st.rk1);
        status.textContent = 'After ' + st.rows.length + ' halving' + (st.rows.length > 1 ? 's' : '') + ': crossing at t = ' + ui.fmt(tc, { fixed: 6 }) + ' s ± ' +
          ui.fmt(1e6 * (st.b - st.a) / 2, { sig: 3 }) + ' µs. Straight-line interpolation between the two logged samples would say ' + ui.fmt(lin, { fixed: 6 }) + ' s.';
      }
    }
    go.addEventListener('click', locate);
    next.addEventListener('click', halve);
    locate();
    all.addEventListener('click', function () { while (st && st.rows.length < 10) halve(); });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm04' });
    buildEulerRk4();
    buildOrder();
    buildStability();
    buildFloat();
    buildBisect();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'Forward Euler on \\(\\dot q=\\tfrac12\\Omega(\\omega)q\\) makes \\(|q|\\)…',
        options: ['shrink every step.', 'grow every step.', 'stay exactly 1.'], correct: 1,
        explain: 'One Euler step multiplies |q|² by 1 + h²|ω|²/4, which is larger than 1 whenever the body rotates, so the norm grows on every step and the growth compounds.' },
      { q: 'Halving h cut the error by 16×. The method is most likely…',
        options: ['forward Euler.', 'midpoint (RK2).', 'RK4.'], correct: 2,
        explain: '16 = 2⁴, so the global error scales as h⁴: a fourth-order method. Euler would give about 2 and the midpoint method about 4.' },
      { q: 'Why count dwell time in integer steps?',
        options: ['0.01 is not exact in binary, so summed time reaches 8.0 one step late.', 'Integers are faster.', 'Floats overflow at 8 s.'], correct: 0,
        explain: 'The stored 0.01 is slightly off, and after 800 additions the float64 sum is 7.99999999999987, so “t ≥ 8” first holds at step 801. An integer counter reaches exactly 800.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm04');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
