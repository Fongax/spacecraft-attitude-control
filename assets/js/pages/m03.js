/**
 * m03.js: module 03, Dynamics, quaternions and the environment.
 * Widgets: build-a-box inertia (W3.6), gyroscopic coupling explorer (W3.1), tennis-racket lab
 * (W3.2), gimbal-lock explorer (W3.4), quaternion builder with Compose tab (W3.3) and the
 * disturbance-torque estimator (W3.5). J, limits, presets and the disturbance bound are read from
 * ADCS.params, ADCS.presets and ADCS.mc; the environment constants are illustrative (tagged).
 */
(function () { 'use strict';
  const ADCS = window.ADCS;
  const ui = ADCS.ui;
  const el = ui.el;
  const V = ADCS.vec;
  const Q = ADCS.quat;
  const P = ADCS.params;
  const D2R = ADCS.units.D2R, R2D = ADCS.units.R2D;
  const J = P.DEFAULTS.J.slice();
  const TAU_MAX = P.DEFAULTS.tauMax;
  const D_BOUND = ADCS.mc.DEFAULTS.distBound;
  const AX = ['x', 'y', 'z'];
  const AX_COL = ['--axis-x', '--axis-y', '--axis-z'];
  const AX_DASH = [[], [6, 4], [1.5, 3]];

  function $(id) { return document.getElementById(id); }
  function fx(x, d) { return ui.fmt(x, { fixed: d }); }
  function sci(x) { return x === 0 ? '0' : ui.fmtSci(x, 2); }
  function readouts(pairs) {
    const dl = el('dl', { class: 'readouts' });
    pairs.forEach(function (p) { dl.appendChild(el('div', null, el('dt', null, p[0]), el('dd', null, p[1]))); });
    return dl;
  }
  function wireBox(cls) {
    const c = el('canvas');
    return { box: el('div', { class: 'wire ' + (cls || '') }, c), canvas: c };
  }
  function scaled(v, ref, lo, hi) {
    const n = V.norm(v);
    if (!(n > 0)) return [0, 0, 0];
    const L = lo + (hi - lo) * Math.min(1, n / ref);
    return V.scale(v, L / n);
  }

  /* ================================================================ W3.6 build-a-box inertia */

  function buildBox() {
    const controls = $('box-controls');
    const out = $('box-output');
    const PROJECT = { m: 4, a: 0.212, b: 0.173, c: 0.274 };
    const sm = ui.slider({ id: 'box-m', label: 'Mass m', min: 1, max: 10, step: 0.1, value: PROJECT.m, unit: 'kg', tag: 'derived' });
    const sa = ui.slider({ id: 'box-a', label: 'Edge a (along x)', min: 0.05, max: 0.5, step: 0.001, value: PROJECT.a, unit: 'm' });
    const sb = ui.slider({ id: 'box-b', label: 'Edge b (along y)', min: 0.05, max: 0.5, step: 0.001, value: PROJECT.b, unit: 'm' });
    const sc = ui.slider({ id: 'box-c', label: 'Edge c (along z)', min: 0.05, max: 0.5, step: 0.001, value: PROJECT.c, unit: 'm' });
    [sm, sa, sb, sc].forEach(function (s) { controls.appendChild(s.el); s.on('change', render); });
    const reset = ui.button({ label: 'Project box', title: '4 kg, 0.212 × 0.173 × 0.274 m', icon: 'reset', small: true, onClick: function () {
      sm.set(PROJECT.m); sa.set(PROJECT.a); sb.set(PROJECT.b); sc.set(PROJECT.c); render(); ui.announce('Project box loaded.');
    } });
    out.appendChild(el('div', { class: 'btn-row' }, reset));
    const tableBox = el('div');
    const note = el('p', { class: 'box-note', 'aria-live': 'polite' });
    out.appendChild(tableBox);
    out.appendChild(note);
    function render() {
      const m = sm.value, a = sa.value, b = sb.value, c = sc.value;
      const Jb = [m / 12 * (b * b + c * c), m / 12 * (a * a + c * c), m / 12 * (a * a + b * b)];
      const order = [0, 1, 2].sort(function (i, k) { return Jb[k] - Jb[i]; });
      const label = [];
      const tie = function (i, k) { return Math.abs(Jb[i] - Jb[k]) < 1e-9 * Math.max(Jb[i], Jb[k]); };
      label[order[0]] = 'major'; label[order[1]] = 'intermediate'; label[order[2]] = 'minor';
      const ties = tie(order[0], order[1]) || tie(order[1], order[2]);
      const rows = [0, 1, 2].map(function (i) {
        return [AX[i], fx(Jb[i], 4), ties ? 'tie' : label[i], fx(J[i], 3)];
      });
      tableBox.textContent = '';
      const t = ui.table([{ key: 'a', label: 'Axis' }, { key: 'j', label: 'J (kg m²)', num: true }, { key: 'r', label: 'Rank' }, { key: 'p', label: 'Project J (kg m²)', num: true }],
        rows, { caption: 'Principal moments of the box', rowHeaders: true, compact: true });
      tableBox.appendChild(t);
      const match = Jb.every(function (v, i) { return Math.abs(v - J[i]) < 5e-5; });
      note.textContent = ties
        ? 'Two moments are equal: the body is axisymmetric, so there is no single intermediate axis.'
        : 'Intermediate axis: ' + AX[order[1]] + '. Spin about it is unstable; spins about ' + AX[order[0]] + ' (major) and ' + AX[order[2]] + ' (minor) are stable.' +
          (match ? ' These values match the project J to three significant figures.' : '');
    }
    render();
  }

  /* ================================================================ W3.1 gyroscopic coupling */

  function buildGyro() {
    const controls = $('gyro-controls');
    const out = $('gyro-output');
    const lim = P.LIMITS.rateMaxDeg;
    const sl = AX.map(function (ax, i) {
      return ui.slider({ id: 'gyro-w' + ax, label: 'ω' + ax, min: -lim, max: lim, step: 0.1, value: i < 2 ? 0.1 * R2D : 0, unit: 'deg/s', sig: 4 });
    });
    sl.forEach(function (s) { controls.appendChild(s.el); s.on('change', render); });
    const presets = [
      { label: '[0.1, 0.1, 0] rad/s', w: [0.1 * R2D, 0.1 * R2D, 0] },
      { label: 'Along x', w: [10, 0, 0] },
      { label: 'Worst at ' + lim + ' deg/s (y + z)', w: [0, lim / Math.SQRT2, lim / Math.SQRT2] },
      { label: 'Zero', w: [0, 0, 0] }
    ];
    const row = el('div', { class: 'btn-row', role: 'group', 'aria-label': 'Example rates' });
    presets.forEach(function (p) {
      row.appendChild(ui.button({ label: p.label, small: true, onClick: function () { sl.forEach(function (s, i) { s.set(p.w[i]); }); render(); ui.announce('Loaded ' + p.label + '.'); } }));
    });
    out.appendChild(row);
    const grid = el('div', { class: 'gyro-grid' });
    const wb = wireBox('gyro-wire');
    grid.appendChild(wb.box);
    const right = el('div', { class: 'gyro-right' });
    grid.appendChild(right);
    out.appendChild(grid);
    const wf = ADCS.wire.create(wb.canvas, { aspect: 0.85, maxHeight: 360, bodyAxes: false, boresight: false, ariaLabel: 'Spacecraft with the vectors ω, Jω and ω × Jω' });
    const barsBox = el('div');
    const read = el('div', { 'aria-live': 'polite' });
    const vecBox = el('div');
    right.appendChild(read);
    right.appendChild(barsBox);
    right.appendChild(vecBox);
    const legend = el('p', { class: 'gyro-legend' },
      el('span', { class: 'sw sw-accent' }), 'ω ', el('span', { class: 'sw sw-text2' }), 'Jω ', el('span', { class: 'sw sw-warn' }), 'ω × Jω');
    wb.box.appendChild(legend);
    const bars = ADCS.plot.bars(barsBox, { title: 'Torque magnitudes (log scale)', log: true, unit: 'N m', xLabel: 'torque (N m)', items: [] });
    const gRef = (Math.max.apply(null, J) - Math.min.apply(null, J)) / 2 * Math.pow(lim * D2R, 2);

    function render() {
      const w = sl.map(function (s) { return s.value * D2R; });
      const Jw = [J[0] * w[0], J[1] * w[1], J[2] * w[2]];
      const g = ADCS.dynamics.gyroscopic(w, J);
      const gn = V.norm(g);
      const work = V.dot(w, g);
      // Jω is within a few degrees of ω because the moments are similar (the foot note says so);
      // its label is dropped then, so the two labels do not print on top of each other.
      const wn = V.norm(w), jn = V.norm(Jw);
      const apart = wn > 0 && jn > 0 ? Math.acos(Math.max(-1, Math.min(1, V.dot(w, Jw) / (wn * jn)))) * R2D : 0;
      wf.setQuat([1, 0, 0, 0]);
      // A zero vector has no direction: leave its arrow (and label) out instead of drawing a dot.
      // Lengths stay below 0.32 so a label never lands on an inertial axis tip (drawn at 0.4).
      wf.setArrows([
        { v: scaled(w, lim * D2R, 0.12, 0.32), frame: 'body', color: '--accent', label: 'ω', width: 4 },
        { v: scaled(g, gRef, 0.12, 0.32), frame: 'body', color: '--warn', label: 'ω×Jω' },
        { v: scaled(Jw, Math.max.apply(null, J) * lim * D2R, 0.1, 0.28), frame: 'body', color: '--text-2', label: apart < 5 ? null : 'Jω', width: 1.6 }
      ].filter(function (a) { return V.norm(a.v) > 0; }));
      wf.render();
      bars.set({ items: [
        { label: '|ω × Jω|', value: gn, color: '--warn', text: gn === 0 ? '0 (exactly)' : sci(gn) + ' N m' },
        { label: 'Disturbance bound', value: D_BOUND, color: '--axis-y', text: sci(D_BOUND) + ' N m' },
        { label: 'Torque limit τmax', value: TAU_MAX, color: '--accent', text: sci(TAU_MAX) + ' N m' }
      ] });
      read.textContent = '';
      const along = [0, 1, 2].filter(function (i) { return Math.abs(w[i]) > 0; }).length <= 1;
      read.appendChild(readouts([
        ['|ω|', fx(V.norm(w) * R2D, 2) + ' deg/s'],
        ['|ω × Jω|', gn === 0 ? '0 N m' : sci(gn) + ' N m'],
        ['vs bound', gn === 0 ? '0%' : ui.fmt(100 * gn / D_BOUND, { sig: 3 }) + '%'],
        ['vs τmax', gn === 0 ? '0%' : ui.fmt(100 * gn / TAU_MAX, { sig: 3 }) + '%'],
        ['ω · (ω × Jω)', Math.abs(work) < 1e-18 ? '0 (no work)' : sci(work) + ' W']
      ]));
      if (along) read.appendChild(el('p', { class: 'gyro-zero' }, ui.icon('info'), V.norm(w) === 0 ? 'No rotation, no gyroscopic torque.' : 'ω lies along a principal axis, so Jω is parallel to ω and the term is exactly zero.'));
      vecBox.textContent = '';
      const r = function (name, v, unitFmt) { return [name].concat(v.map(unitFmt)); };
      vecBox.appendChild(ui.table([{ key: 'v', label: 'Vector' }, { key: 'x', label: 'x', num: true }, { key: 'y', label: 'y', num: true }, { key: 'z', label: 'z', num: true }], [
        r('ω (rad/s)', w, function (v) { return fx(v, 4); }),
        r('Jω (N m s)', Jw, function (v) { return v === 0 ? '0' : ui.fmtSci(v, 3); }),
        r('ω × Jω (N m)', g, function (v) { return Math.abs(v) < 1e-20 ? '0' : ui.fmtSci(v, 3); })
      ], { caption: 'Body-frame components', rowHeaders: true, compact: true }));
    }
    render();
  }

  /* ================================================================ W3.2 tennis-racket lab */

  function buildRacket() {
    const controls = $('racket-controls');
    const out = $('racket-output');
    const RANK = ['intermediate', 'major', 'minor'];
    const predBox = el('fieldset', { class: 'racket-predict' }, el('legend', null, 'Your prediction: which spin axis will flip?'));
    let prediction = null;
    AX.forEach(function (ax, i) {
      const id = 'racket-pred-' + ax;
      const inp = el('input', { type: 'radio', name: 'racket-pred', id: id, value: ax });
      inp.addEventListener('change', function () {
        prediction = ax;
        runBtn.disabled = false;
        hint.textContent = 'Prediction recorded: spin about ' + ax + '. Now run the spins.';
      });
      predBox.appendChild(el('label', { for: id, class: 'racket-opt' }, inp, el('span', null, 'About ' + ax + ' (J = ' + J[i].toFixed(3) + ' kg m²)')));
    });
    const which = ui.segmented({ id: 'racket-axis', label: 'Spin to run', value: 'x', options: AX.map(function (ax) { return { value: ax, label: 'About ' + ax }; }) });
    const runBtn = ui.button({ label: 'Run spin', kind: 'primary', icon: 'play' });
    runBtn.disabled = true;
    const hint = el('p', { class: 'field-help', 'aria-live': 'polite' }, 'Make a prediction first; the Run button unlocks when you do.');
    controls.appendChild(predBox);
    controls.appendChild(el('div', { class: 'racket-run' }, which.el, el('div', { class: 'btn-row' }, runBtn), hint));

    const reveal = el('div', { class: 'racket-reveal', 'aria-live': 'polite' });
    reveal.hidden = true;
    const stage = el('div', { class: 'racket-stage' });
    stage.hidden = true;
    out.appendChild(reveal);
    out.appendChild(stage);
    const wb = wireBox('racket-wire');
    const plotsBox = el('div', { class: 'racket-plots' });
    const anim = el('div', { class: 'racket-anim' });
    stage.appendChild(el('div', { class: 'racket-grid' }, el('div', null, wb.box, anim), plotsBox));
    const wf = ADCS.wire.create(wb.canvas, { aspect: 0.85, maxHeight: 340, trail: 600, ariaLabel: 'Torque-free spinning spacecraft' });
    const legend = el('p', { class: 'gyro-legend' }, el('span', { class: 'sw sw-accent' }), 'ω (body) ', el('span', { class: 'sw sw-warn' }), 'H (fixed in space)');
    wb.box.appendChild(legend);
    const tSlider = ui.slider({ id: 'racket-t', label: 'Time t', min: 0, max: 200, step: 0.1, value: 0, unit: 's' });
    const play = ui.button({ label: 'Play (×10)', icon: 'play' });
    anim.appendChild(tSlider.el);
    anim.appendChild(el('div', { class: 'btn-row' }, play));
    const wBox = el('div'), dBox = el('div');
    plotsBox.appendChild(wBox);
    plotsBox.appendChild(dBox);
    const pW = ADCS.plot.line(wBox, { height: 170, title: 'Body rates ω', yLabel: 'ω (rad/s)', xLabel: 't (s)', y: { symmetric: true },
      series: AX.map(function (ax, i) { return { id: ax, label: 'ω' + ax, color: AX_COL[i], dash: AX_DASH[i], unit: 'rad/s' }; }) });
    const pD = ADCS.plot.line(dBox, { height: 170, title: 'Relative drift of T and |H| (log scale)', yLabel: '|relative drift|', xLabel: 't (s)', y: { log: true },
      series: [{ id: 'T', label: '|T − T₀| / T₀', color: '--accent' }, { id: 'H', label: '||H| − |H₀|| / |H₀|', color: '--warn', dash: [5, 3] }] });

    const cache = {};
    let run = null, info = null, tNow = 0, raf = 0, last = 0;
    function compute(ax) {
      if (cache[ax]) return cache[ax];
      const id = 'SPIN' + ax.toUpperCase();
      const r = ADCS.sim.run(ADCS.presets.get(id));
      const i = AX.indexOf(ax);
      const flips = [];
      for (let k = 1; k < r.n; k++) {
        if ((r.w[3 * k + i] < 0) !== (r.w[3 * (k - 1) + i] < 0)) flips.push(r.t[k]);
      }
      const T = new Float64Array(r.n), H = new Float64Array(r.n);
      const w0 = [r.w[0], r.w[1], r.w[2]];
      const T0 = ADCS.dynamics.energy(w0, J), H0 = ADCS.dynamics.momentum(null, w0, J);
      let mT = 0, mH = 0;
      for (let k = 0; k < r.n; k++) {
        const w = [r.w[3 * k], r.w[3 * k + 1], r.w[3 * k + 2]];
        T[k] = Math.abs(ADCS.dynamics.energy(w, J) - T0) / T0;
        H[k] = Math.abs(ADCS.dynamics.momentum(null, w, J) - H0) / H0;
        if (T[k] > mT) mT = T[k];
        if (H[k] > mH) mH = H[k];
      }
      cache[ax] = { id: id, r: r, flips: flips, T: T, H: H, maxT: mT, maxH: mH, i: i };
      return cache[ax];
    }
    function show(t) {
      tNow = t;
      if (!run) return;
      const s = ADCS.sim.sampleAt(run, t);
      wf.setQuat(s.q);
      const Hi = ADCS.dynamics.momentumInertial(s.q, s.w, J);
      wf.setArrows([
        { v: scaled(s.w, 0.5, 0.2, 0.42), frame: 'body', color: '--accent', label: 'ω' },
        { v: scaled(Hi, 1e-9, 0.38, 0.38), frame: 'inertial', color: '--warn', label: 'H' }
      ]);
      wf.render();
      pW.setCursor(t); pD.setCursor(t);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      play.querySelector('.btn-label').textContent = 'Play (×10)';
      play.replaceChild(ui.icon('play'), play.querySelector('svg'));
    }
    function tick(ts) {
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      let t = tNow + 10 * dt;
      if (t >= 200) { t = 200; tSlider.set(t); show(t); stop(); return; }
      tSlider.set(Math.round(t * 10) / 10); show(t);
      raf = requestAnimationFrame(tick);
    }
    play.addEventListener('click', function () {
      if (raf) { stop(); return; }
      if (tNow >= 200) { wf.clearTrail(); tNow = 0; }
      last = 0;
      play.querySelector('.btn-label').textContent = 'Pause';
      play.replaceChild(ui.icon('pause'), play.querySelector('svg'));
      raf = requestAnimationFrame(tick);
    });
    tSlider.on('change', function (v) { stop(); if (v < tNow) wf.clearTrail(); show(v); });
    [pW, pD].forEach(function (p) { p.onSeek(function (t) { stop(); if (t < tNow) wf.clearTrail(); tSlider.set(t); show(t); }); });

    function revealText(c) {
      reveal.textContent = '';
      const ok = prediction === 'x';
      const ord = [0, 1, 2].slice().sort(function (a, b) { return J[b] - J[a]; });
      reveal.appendChild(el('p', { class: 'racket-verdict ' + (ok ? 'ok' : 'bad') }, ui.icon(ok ? 'check' : 'cross'),
        el('span', null, el('strong', null, (ok ? 'Your prediction (x) was right. ' : 'You predicted ' + prediction + '; the axis that flips is x. ')),
          'x is the intermediate axis: J', el('sub', null, AX[ord[0]]), ' = ' + J[ord[0]].toFixed(3) + ' > J', el('sub', null, AX[ord[1]]), ' = ' + J[ord[1]].toFixed(3) + ' > J', el('sub', null, AX[ord[2]]), ' = ' + J[ord[2]].toFixed(3) + ' kg m². ',
          'For a spin about x, (J', el('sub', null, 'x'), ' − J', el('sub', null, 'y'), ')(J', el('sub', null, 'x'), ' − J', el('sub', null, 'z'), ') < 0, so the small wobble grows instead of oscillating. About the major and minor axes it only oscillates.')));
      const ax = AX[c.i];
      const fl = c.flips.map(function (t) { return fx(t, 1) + ' s'; });
      reveal.appendChild(el('p', null, el('strong', null, c.id + ' (spin about ' + ax + ', the ' + RANK[c.i] + ' axis): '),
        c.flips.length ? 'ω' + ax + ' changed sign at ' + fl.join(' and ') + '. ' : 'ω' + ax + ' never changed sign in 200 s; the small rates on the other axes just oscillate. ',
        'Largest relative drift over the run: T ' + sci(c.maxT) + ', |H| ' + sci(c.maxH) + ', both at rounding level.'));
    }
    runBtn.addEventListener('click', function () {
      if (!prediction) return;
      stop();
      ui.clearError(out);
      let c;
      try { c = compute(which.value); } catch (e) {
        if (e instanceof RangeError) { ui.showError(out, e); return; }
        throw e;
      }
      run = c.r;
      stage.hidden = false;
      reveal.hidden = false;
      AX.forEach(function (ax, i) { pW.set(ax, run.t, run.w, { stride: 3, offset: i }); });
      pD.set('T', run.t, c.T); pD.set('H', run.t, c.H);
      pW.render(); pD.render();
      wf.clearTrail();
      tSlider.set(0);
      show(0);
      revealText(c);
      ui.announce('Ran ' + c.id + '. ' + (c.flips.length ? 'The spin axis rate changed sign ' + c.flips.length + ' times.' : 'The spin axis rate never changed sign.'));
      if (!ui.prefersReducedMotion()) play.click();
    });
  }

  /* ================================================================ W3.4 gimbal-lock explorer */

  function buildGimbal() {
    const controls = $('gimbal-controls');
    const out = $('gimbal-output');
    const r = 0.1; // body rate about z (rad/s), roll = yaw = 0
    const pitch = ui.slider({ id: 'gimbal-pitch', label: 'Pitch θ', min: -90, max: 90, step: 0.1, value: 60, unit: 'deg' });
    controls.appendChild(pitch.el);
    controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Fixed inputs'),
      el('p', { class: 'gimbal-fixed' }, 'Roll φ = 0°, yaw ψ = 0°, body rate ω = (0, 0, ' + r + ') rad/s')));
    const grid = el('div', { class: 'gimbal-grid' });
    const wb = wireBox('gimbal-wire');
    const plotBox = el('div');
    grid.appendChild(el('div', null, wb.box));
    grid.appendChild(plotBox);
    out.appendChild(grid);
    const read = el('div', { 'aria-live': 'polite' });
    out.appendChild(read);
    const wf = ADCS.wire.create(wb.canvas, { aspect: 0.85, maxHeight: 300, ariaLabel: 'Spacecraft at the chosen pitch' });
    const N = 1799, xs = new Float64Array(N), yPhi = new Float64Array(N), yPsi = new Float64Array(N), yQ = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const th = (-89.9 + 0.1 * i) * D2R;
      xs[i] = th * R2D;
      yPhi[i] = Math.abs(r * Math.tan(th));
      yPsi[i] = Math.abs(r / Math.cos(th));
      yQ[i] = r / 2;
    }
    const plot = ADCS.plot.line(plotBox, { height: 220, title: 'Rates against pitch (log scale)', xLabel: 'pitch θ (deg)', yLabel: 'rate (rad/s or 1/s)', x: { min: -90, max: 90 },
      y: { log: true, min: 1e-4, max: 1e2 },
      series: [{ id: 'psi', label: 'yaw rate |dψ/dt|', color: '--axis-z', unit: 'rad/s' }, { id: 'phi', label: 'roll rate |dφ/dt|', color: '--axis-x', dash: [6, 4], unit: 'rad/s' },
        { id: 'q', label: '|dq/dt| = |ω|/2', color: '--ok', dash: [2, 3], width: 2, unit: '1/s' }] });
    plot.set('psi', xs, yPsi); plot.set('phi', xs, yPhi); plot.set('q', xs, yQ);
    plot.onSeek(function (x) { pitch.set(Math.max(-90, Math.min(90, Math.round(x * 10) / 10))); render(); });
    function render() {
      const thd = pitch.value, th = thd * D2R;
      const c = Math.cos(th);
      const singular = Math.abs(c) < 1e-9;
      const phiDot = singular ? Infinity : r * Math.tan(th);
      const psiDot = singular ? Infinity : r / c;
      const fmtRate = function (v) { return isFinite(v) ? fx(v, 4) + ' rad/s (' + fx(v * R2D, 1) + ' deg/s)' : '∞ (singular)'; };
      plot.setLines({ vlines: [{ x: thd, label: 'θ = ' + fx(thd, 1) + '°', color: '--text-2', dash: [4, 3] }] });
      plot.setCursor(thd);
      const q = Q.fromEuler321(0, th, 0);
      wf.setQuat(q);
      wf.setArrows([{ v: [0, 0, 0.42], frame: 'body', color: '--accent', label: 'ω' }]);
      wf.render();
      read.textContent = '';
      read.appendChild(readouts([
        ['roll rate dφ/dt', fmtRate(phiDot)],
        ['pitch rate dθ/dt', fx(0, 4) + ' rad/s'],
        ['yaw rate dψ/dt', fmtRate(psiDot)],
        ['|dq/dt| = |ω|/2', fx(r / 2, 4) + ' 1/s']
      ]));
      if (Math.abs(thd) >= 80) read.appendChild(el('p', { class: 'gimbal-warn' }, ui.icon('warn'),
        singular ? 'At exactly ±90° the Euler-angle rates are undefined: yaw and roll turn about the same axis (gimbal lock). The quaternion rate is unchanged.'
          : 'Close to ±90°: the same 0.1 rad/s body rate needs ' + fx(1 / Math.abs(c), 1) + ' times its value in yaw rate.'));
    }
    pitch.on('change', render);
    render();
  }

  /* ================================================================ W3.3 quaternion builder */

  function quatText(q) { return '[' + q.map(function (v) { return fx(v, 4); }).join(', ') + ']'; }
  function axisFrom(azDeg, elDeg) {
    const a = azDeg * D2R, e = elDeg * D2R;
    return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  }

  function buildQuat() {
    const out = $('quat-output');
    const buildPanel = el('div', { class: 'quat-panel' });
    const composePanel = el('div', { class: 'quat-panel' });
    const tabs = ui.tabs(out, [{ id: 'build', label: 'Build', content: buildPanel }, { id: 'compose', label: 'Compose', content: composePanel }], { label: 'Quaternion builder views' });

    // ---- build
    const az = ui.slider({ id: 'q-az', label: 'Axis azimuth', min: -180, max: 180, step: 1, value: 0, unit: 'deg', help: 'Direction of the axis in the x–y plane.' });
    const elv = ui.slider({ id: 'q-el', label: 'Axis elevation', min: -90, max: 90, step: 0.01, value: 0, unit: 'deg', help: 'Tilt of the axis out of the x–y plane.' });
    const ang = ui.slider({ id: 'q-ang', label: 'Angle α', min: -360, max: 360, step: 1, value: 90, unit: 'deg' });
    const neg = ui.toggle({ id: 'q-neg', label: 'Negate q (use −q)', checked: false });
    const ctr = el('div', { class: 'widget-controls' });
    [az, elv, ang, neg].forEach(function (c) { ctr.appendChild(c.el); c.on('change', renderBuild); });
    buildPanel.appendChild(ctr);
    const pre = el('div', { class: 'btn-row', role: 'group', 'aria-label': 'Example rotations' });
    // The (1, 1, 1) axis has elevation asin(1/√3) = 35.26°; set() keeps the exact value, so the
    // preset gives the textbook permutation DCM and 3-2-1 angles of 90°, 0°, 90°.
    [{ label: '90° about x', a: 0, e: 0, g: 90 }, { label: '300° about z', a: 0, e: 90, g: 300 }, { label: '120° about (1, 1, 1)', a: 45, e: Math.asin(1 / Math.sqrt(3)) * R2D, g: 120 }]
      .forEach(function (p) { pre.appendChild(ui.button({ label: p.label, small: true, onClick: function () { az.set(p.a); elv.set(p.e); ang.set(p.g); neg.set(false); renderBuild(); ui.announce('Loaded ' + p.label + '.'); } })); });
    buildPanel.appendChild(pre);
    const grid = el('div', { class: 'quat-grid' });
    const wb = wireBox('quat-wire');
    const info = el('div', { class: 'quat-info' });
    grid.appendChild(wb.box);
    grid.appendChild(info);
    buildPanel.appendChild(grid);
    const wf = ADCS.wire.create(wb.canvas, { aspect: 0.9, maxHeight: 340, ariaLabel: 'Spacecraft rotated by q' });
    wf.setGhost([1, 0, 0, 0]);

    function renderBuild() {
      const n = axisFrom(az.value, elv.value);
      let q = Q.fromAxisAngle(n, ang.value * D2R);
      if (neg.value) q = q.map(function (v) { return -v; });
      const raw = 2 * Math.atan2(V.norm([q[1], q[2], q[3]]), q[0]) * R2D;
      const qe = Q.errorShortest([1, 0, 0, 0], q);
      const short = Q.errorAngle(qe) * R2D;
      const C = Q.toDCM(q);
      const CtC = V.matMul(V.transpose(C), C);
      let orth = 0;
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) orth = Math.max(orth, Math.abs(CtC[i][k] - (i === k ? 1 : 0)));
      const eul = Q.toEuler321(q).map(function (v) { return v * R2D; });
      wf.setQuat(q);
      wf.setArrows([{ v: V.scale(n, 0.45), frame: 'inertial', color: '--warn', label: 'n̂' }]);
      wf.render();
      info.textContent = '';
      info.appendChild(readouts([
        ['axis n̂', '[' + n.map(function (v) { return fx(v, 3); }).join(', ') + ']'],
        ['q = [q₀, q₁, q₂, q₃]', quatText(q)],
        ['|q|', fx(Q.norm(q), 6)]
      ]));
      info.appendChild(readouts([
        ['2 atan2(|q_v|, q₀)', fx(raw, 1) + '°'],
        ['shortest rotation', fx(short, 1) + '°'],
        ['3-2-1 roll, pitch, yaw', eul.map(function (v) { return fx(v, 1) + '°'; }).join(', ')]
      ]));
      if (q[0] < 0) info.appendChild(el('p', { class: 'quat-note' }, ui.icon('info'),
        'q₀ < 0: this q describes the long way round (' + fx(raw, 1) + '°). The error quaternion flips the sign and rotates ' + fx(short, 1) + '° instead. The DCM and the picture are the same either way.'));
      const rows = C.map(function (row, i) { return ['row ' + (i + 1)].concat(row.map(function (v) { return fx(v, 4); })); });
      info.appendChild(ui.table([{ key: 'r', label: 'C' }, { key: 'a', label: 'col 1', num: true }, { key: 'b', label: 'col 2', num: true }, { key: 'c', label: 'col 3', num: true }], rows,
        { caption: 'DCM C (inertial → body)', rowHeaders: true, compact: true }));
      info.appendChild(el('p', { class: 'quat-check' }, 'max |CᵀC − I| = ' + sci(orth) + ', det C = ' + fx(V.det(C), 6)));
    }

    // ---- compose
    function rotControls(prefix, title, axis, angle) {
      const s = ui.segmented({ id: 'q-' + prefix + '-ax', label: title + ' axis', value: axis, options: AX.map(function (a) { return { value: a, label: a }; }) });
      const g = ui.slider({ id: 'q-' + prefix + '-ang', label: title + ' angle', min: -180, max: 180, step: 1, value: angle, unit: 'deg' });
      return { s: s, g: g, q: function () { const v = [0, 0, 0]; v[AX.indexOf(s.value)] = 1; return Q.fromAxisAngle(v, g.value * D2R); } };
    }
    const A = rotControls('a', 'Rotation A:', 'x', 90);
    const B = rotControls('b', 'Rotation B:', 'z', 90);
    const cctr = el('div', { class: 'widget-controls' });
    [A.s, A.g, B.s, B.g].forEach(function (c) { cctr.appendChild(c.el); c.on('change', renderCompose); });
    composePanel.appendChild(cctr);
    const cgrid = el('div', { class: 'compose-grid' });
    const w1 = wireBox('quat-wire'), w2 = wireBox('quat-wire');
    const c1 = el('div', { class: 'compose-cell' }, el('p', { class: 'compose-title' }, '\\(A \\otimes B\\)'), w1.box);
    const c2 = el('div', { class: 'compose-cell' }, el('p', { class: 'compose-title' }, '\\(B \\otimes A\\)'), w2.box);
    const q1 = el('p', { class: 'compose-q' }), q2 = el('p', { class: 'compose-q' });
    c1.appendChild(q1); c2.appendChild(q2);
    cgrid.appendChild(c1); cgrid.appendChild(c2);
    composePanel.appendChild(cgrid);
    const cread = el('div', { 'aria-live': 'polite' });
    composePanel.appendChild(cread);
    // One span for the maths and the sentence, so the flex note wraps them as one line of text.
    composePanel.appendChild(el('p', { class: 'quat-note' }, ui.icon('info'), el('span', null, '\\(A \\otimes B\\) applies B first and then A, both about the fixed (inertial) axes; equivalently, A first and then B about the body’s new axes.')));
    const wa = ADCS.wire.create(w1.canvas, { aspect: 0.9, maxHeight: 280, ariaLabel: 'Spacecraft rotated by A ⊗ B' });
    const wbb = ADCS.wire.create(w2.canvas, { aspect: 0.9, maxHeight: 280, ariaLabel: 'Spacecraft rotated by B ⊗ A' });
    [wa, wbb].forEach(function (w) { w.setGhost([1, 0, 0, 0]); });
    function renderCompose() {
      const qa = A.q(), qb = B.q();
      const ab = Q.mul(qa, qb), ba = Q.mul(qb, qa);
      wa.setQuat(ab); wa.render();
      wbb.setQuat(ba); wbb.render();
      q1.textContent = 'q = ' + quatText(ab);
      q2.textContent = 'q = ' + quatText(ba);
      const d = Q.angleBetween(ab, ba) * R2D;
      cread.textContent = '';
      cread.appendChild(readouts([['angle between the two results', fx(d, 1) + '°'], ['commute?', d < 0.05 ? 'yes, for these two' : 'no']]));
      if (d < 0.05) cread.appendChild(el('p', { class: 'quat-note' }, ui.icon('info'), 'Rotations about the same axis (or by zero) commute; rotations about different axes generally do not.'));
    }
    tabs.on('change', function (id) { if (id === 'compose') { wa.render(); wbb.render(); } else wf.render(); });
    renderBuild();
    renderCompose();
  }

  /* ================================================================ W3.5 disturbance estimator */

  const ENV = { mu: 3.986e14, RE: 6371e3, rho400: 3e-12, H: 60e3, CD: 2.2, Adrag: 0.03, Asrp: 0.06, refl: 0.6, S: 1361, c: 299792458, B0: 3.0e-5 };
  function envTorques(hKm, activity, offsetM, dipole) {
    const h = hKm * 1e3, r = ENV.RE + h;
    const v = Math.sqrt(ENV.mu / r);
    const rho = ENV.rho400 * activity * Math.exp(-(h - 400e3) / ENV.H);
    const drag = 0.5 * rho * v * v * ENV.CD * ENV.Adrag * offsetM;
    const gg = 3 * ENV.mu / (2 * r * r * r) * (Math.max.apply(null, J) - Math.min.apply(null, J));
    const srp = ENV.S / ENV.c * (1 + ENV.refl) * ENV.Asrp * offsetM;
    const B = ENV.B0 * Math.pow(ENV.RE / r, 3);
    const mag = dipole * B;
    return { v: v, rho: rho, B: B, drag: drag, gg: gg, srp: srp, mag: mag, sum: drag + gg + srp + mag };
  }

  function buildEnvTable() {
    const e = envTorques(400, 1, 0.02, 0.01);
    const rows = [
      ['Aerodynamic drag', '½ρv²C_D A × 2 cm offset', e.drag],
      ['Gravity gradient', '3μ/(2r³) × |J_max − J_min|', e.gg],
      ['Solar radiation pressure', '(1361/c)(1 + 0.6) A × 2 cm offset', e.srp],
      ['Residual dipole', '0.01 A m² × B', e.mag],
      ['All four, worst-case sum', '', e.sum]
    ].map(function (r) { return [r[0], r[1], ui.fmtSci(r[2], 1), ui.fmt(D_BOUND / r[2], { sig: 2 }) + '×']; });
    const t = ui.table([{ key: 's', label: 'Source' }, { key: 'm', label: 'Model' }, { key: 't', label: 'Torque (N m)', num: true }, { key: 'r', label: 'Bound ÷ torque', num: true }], rows,
      { caption: 'Environmental torques at 400 km, medium solar activity', rowHeaders: true, compact: true });
    $('env-table').appendChild(t);
  }

  function buildEnv() {
    const controls = $('env-controls');
    const out = $('env-output');
    const alt = ui.slider({ id: 'env-h', label: 'Altitude h', min: 300, max: 800, step: 10, value: 400, unit: 'km', tag: 'illustrative' });
    const act = ui.segmented({ id: 'env-act', label: 'Solar activity (ρ × 0.3, 1 or 3)', value: '1', options: [{ value: '0.3', label: 'Low' }, { value: '1', label: 'Medium' }, { value: '3', label: 'High' }] });
    const off = ui.slider({ id: 'env-off', label: 'Centre-of-pressure offset', min: 0, max: 5, step: 0.1, value: 2, unit: 'cm', tag: 'illustrative' });
    const dip = ui.slider({ id: 'env-dip', label: 'Residual dipole m', min: 0, max: 0.05, step: 0.001, value: 0.01, unit: 'A m²', tag: 'illustrative' });
    [alt, act, off, dip].forEach(function (c) { controls.appendChild(c.el); c.on('change', render); });
    const read = el('div', { 'aria-live': 'polite' });
    const barsBox = el('div');
    out.appendChild(read);
    out.appendChild(barsBox);
    // No reference line: the "Project bound" bar already marks 2e-5 N m, and a line would cross the value labels.
    const bars = ADCS.plot.bars(barsBox, { title: 'Disturbance torques (log scale)', log: true, unit: 'N m', xLabel: 'torque (N m)', items: [] });
    function render() {
      const e = envTorques(alt.value, Number(act.value), off.value / 100, dip.value);
      const big = ['drag', 'gg', 'srp', 'mag'].reduce(function (a, k) { return e[k] > e[a] ? k : a; }, 'drag');
      const NAMES = { drag: 'drag', gg: 'gravity gradient', srp: 'solar pressure', mag: 'magnetic dipole' };
      bars.set({ items: [
        { label: 'Drag', value: e.drag, color: '--axis-z', text: sci(e.drag) },
        { label: 'Gravity gradient', value: e.gg, color: '--axis-y', text: sci(e.gg) },
        { label: 'Solar pressure', value: e.srp, color: '--warn', text: sci(e.srp) },
        { label: 'Magnetic dipole', value: e.mag, color: '--axis-x', text: sci(e.mag) },
        { label: 'Sum (worst case)', value: e.sum, color: '--text-2', text: sci(e.sum) },
        { label: 'Project bound', value: D_BOUND, color: '--line-req', text: sci(D_BOUND) },
        { label: 'Torque limit τmax', value: TAU_MAX, color: '--accent', text: sci(TAU_MAX) }
      ] });
      read.textContent = '';
      read.appendChild(readouts([
        ['ρ', sci(e.rho) + ' kg/m³'],
        ['v', fx(e.v / 1000, 2) + ' km/s'],
        ['B', ui.fmt(e.B * 1e6, { sig: 3 }) + ' μT'],
        ['largest', NAMES[big]],
        ['bound ÷ sum', ui.fmt(D_BOUND / e.sum, { sig: 2 }) + '×']
      ]));
      bars.summary('Disturbance torques at ' + alt.value + ' km: drag ' + sci(e.drag) + ', gravity gradient ' + sci(e.gg) + ', solar pressure ' + sci(e.srp) + ', magnetic ' + sci(e.mag) +
        ', sum ' + sci(e.sum) + ' N m, against the project bound of ' + sci(D_BOUND) + ' N m and τmax ' + sci(TAU_MAX) + ' N m.');
    }
    render();
  }

  /* ================================================================ page setup */

  ui.ready(function () {
    ui.mountChrome({ page: 'm03' });
    buildBox();
    buildGyro();
    buildRacket();
    buildGimbal();
    buildQuat();
    buildEnvTable();
    buildEnv();
    ui.quiz($('quiz'), [
      { q: 'For J = diag(0.035, 0.040, 0.025) kg m², which torque-free spin is unstable?',
        options: ['About y.', 'About x.', 'About z.'], correct: 1,
        explain: 'x has the intermediate moment (0.035 lies between 0.040 and 0.025), so \\((J_x - J_y)(J_x - J_z) < 0\\) and small perturbations grow. y is the major axis and z the minor axis; spins about them only wobble. SPINX flips at about 64 s and 166 s.' },
      { q: 'Why does the controller flip the error quaternion when \\(q_{e0} < 0\\)?',
        options: ['To keep |q| = 1.', 'To avoid gimbal lock.', 'q and −q are the same attitude; flipping picks the shorter rotation.'], correct: 2,
        explain: 'q and −q give the same DCM, but q_e0 < 0 describes the long way round (say 300° instead of 60°). Flipping the sign makes the controller turn the short way. The norm is unchanged by a sign flip, and quaternions have no gimbal lock.' },
      { q: 'The project’s disturbance bound (2×10⁻⁵ N m) compared with typical LEO environmental torques for this size is…',
        options: ['about 100× larger: conservative.', 'about equal.', '100× smaller.'], correct: 0,
        explain: 'At 400 km drag is about 1×10⁻⁷ N m, gravity gradient about 3×10⁻⁸, solar pressure about 1×10⁻⁸ and a residual dipole a few ×10⁻⁷ N m. The bound is roughly two orders of magnitude above typical sources, a deliberately conservative choice.' }
    ]);
    ui.renderProvenance($('provenance'), 'm03');
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
