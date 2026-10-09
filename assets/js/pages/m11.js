/**
 * m11.js: Module 11, visualisation and UI (package P6).
 * Widgets: W11.1 quaternion-to-pixels pipeline, W11.2 playback interpolation, W11.3 annunciator
 * design lab, W11.4 one model, many views (stretch), plus a requirement-plot anatomy figure and
 * an on-device timing button. Every run is a real ADCS.sim.run; thresholds come from ADCS.params.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const R2D = A.units.R2D, D2R = A.units.D2R;
  const DEF = A.params.DEFAULTS;
  const SM = DEF.safeMode;
  const LIM = A.params.LIMITS;
  const NAMES = A.modes.NAMES;

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, body: fig.querySelector('.widget-body'), controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
  }
  function guarded(box, fn) {
    ui.clearError(box);
    try { return fn(); } catch (err) {
      if (err instanceof RangeError) { ui.showError(box, err); return null; }
      throw err;
    }
  }
  function readouts(container, labels) {
    const dl = el('dl', { class: 'readouts' });
    const dds = labels.map(function (lab) {
      const dd = el('dd', null, '–');
      dl.appendChild(el('div', null, el('dt', null, lab), dd));
      return dd;
    });
    container.appendChild(dl);
    return function (values) { values.forEach(function (v, i) { if (dds[i]) { dds[i].textContent = ''; if (v && v.nodeType) dds[i].appendChild(v); else dds[i].textContent = v; } }); };
  }
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
  }
  function f(x, o) { return ui.fmt(x, o); }
  function windows(flags, t) {
    const out = [];
    let start = -1;
    for (let k = 0; k <= flags.length; k++) {
      const on = k < flags.length && flags[k];
      if (on && start < 0) start = k;
      if (!on && start >= 0) { out.push({ t0: t[start], t1: t[Math.min(k, t.length - 1)] }); start = -1; }
    }
    return out;
  }
  function qAt(r, k) { return [r.q[4 * k], r.q[4 * k + 1], r.q[4 * k + 2], r.q[4 * k + 3]]; }
  function qStr(q, d) { return '[' + q.map(function (x) { return f(x, { fixed: d === undefined ? 3 : d }); }).join(', ') + ']'; }
  const cache = {};
  function runPreset(id) {
    if (!cache[id]) cache[id] = A.sim.run(A.presets.get(id));
    return cache[id];
  }
  function nlerp(a, b, s) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const sg = d < 0 ? -1 : 1;
    return A.quat.normalize([0, 1, 2, 3].map(function (i) { return a[i] + (sg * b[i] - a[i]) * s; }));
  }
  function torqueMilli(r) {
    const n = r.n, out = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) out[i][k] = 1000 * r.tau[3 * k + i];
    return out;
  }

  /* ================================================================ W11.1 pipeline */

  function buildPipeline() {
    const w = parts('w-pipeline');
    const ax = ui.slider({ id: 'w111-ax', label: 'Axis x component', min: -1, max: 1, step: 0.05, value: 0.3 });
    const ay = ui.slider({ id: 'w111-ay', label: 'Axis y component', min: -1, max: 1, step: 0.05, value: 0.5 });
    const az = ui.slider({ id: 'w111-az', label: 'Axis z component', min: -1, max: 1, step: 0.05, value: 0.8 });
    const ang = ui.slider({ id: 'w111-ang', label: 'Rotation angle', min: -180, max: 180, step: 1, value: 40, unit: 'deg' });
    [ax, ay, az, ang].forEach(function (c) { w.controls.appendChild(c.el); });
    const stepBtn = ui.button({ label: 'Step', kind: 'primary', icon: 'step-fwd' });
    const allBtn = ui.button({ label: 'Show all stages', kind: 'ghost', small: true });
    w.controls.appendChild(el('div', { class: 'btn-row m11-wide' }, stepBtn, allBtn));

    const stageTitles = ['1 · q → R (once per frame)', '2 · Bus corners in the body frame', '3 · Rotate: v_I = R v_B', '4 · Project and sort the faces', '5 · Draw far to near'];
    const list = el('ol', { class: 'm11-stages' });
    const stages = stageTitles.map(function (t) {
      const body = el('div', { class: 'm11-stage-body' });
      const li = el('li', { class: 'm11-stage' }, el('h4', { class: 'm11-stage-title' }, t), body);
      list.appendChild(li);
      return { li: li, body: body };
    });
    const status = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(status);
    w.out.appendChild(list);
    const canvas = el('canvas', { 'aria-label': 'Wireframe spacecraft drawn from the pipeline' });
    const wireBox = el('div', { class: 'wire m11-wire' }, canvas);
    stages[4].body.appendChild(wireBox);
    const drawNote = el('p', { class: 'm11-small' });
    stages[4].body.appendChild(drawNote);
    const wf = A.wire.create(canvas, { aspect: 0.8, maxHeight: 280, bodyAxes: true, inertialAxes: true, boresight: true, panels: true, labels: true });
    let current = 0;
    const COLS3 = [{ key: 'v', label: 'Corner' }, { key: 'x', label: 'x', num: true }, { key: 'y', label: 'y', num: true }, { key: 'z', label: 'z', num: true }];

    function quat() {
      const v = [ax.value, ay.value, az.value];
      const n = Math.hypot(v[0], v[1], v[2]);
      if (n < 1e-9) throw new RangeError('The rotation axis cannot be zero: move one of the axis sliders away from 0.');
      return A.quat.fromAxisAngle([v[0] / n, v[1] / n, v[2] / n], ang.value * D2R);
    }
    function update() {
      guarded(w.out, function () {
        const q = quat();
        wf.setQuat(q);
        wf.render();
        const p = wf.pipeline(q);
        const s0 = stages[0].body, s1 = stages[1].body, s2 = stages[2].body, s3 = stages[3].body;
        s0.textContent = '';
        s0.appendChild(el('p', { class: 'm11-mono' }, 'q = ' + qStr(q, 4)));
        s0.appendChild(ui.table([{ key: 'r', label: 'R' }, { key: 'a', label: 'col 1', num: true }, { key: 'b', label: 'col 2', num: true }, { key: 'c', label: 'col 3', num: true }],
          p.R.map(function (row, i) { return ['row ' + (i + 1), f(row[0], { fixed: 3 }), f(row[1], { fixed: 3 }), f(row[2], { fixed: 3 })]; }), { caption: 'R (body → inertial)', rowHeaders: true, compact: true }));
        s1.textContent = '';
        s1.appendChild(ui.table(COLS3, p.vertsBody.map(function (v, i) { return ['v' + i, f(v[0], { fixed: 3 }), f(v[1], { fixed: 3 }), f(v[2], { fixed: 3 })]; }), { caption: 'Corners (m), fixed for ever', rowHeaders: true, compact: true }));
        s2.textContent = '';
        s2.appendChild(ui.table(COLS3, p.vertsWorld.map(function (v, i) { return ['v' + i, f(v[0], { fixed: 3 }), f(v[1], { fixed: 3 }), f(v[2], { fixed: 3 })]; }), { caption: 'Corners in the inertial frame (m)', rowHeaders: true, compact: true }));
        s3.textContent = '';
        s3.appendChild(ui.table([{ key: 'v', label: 'Corner' }, { key: 'x', label: 'x_s (px)', num: true }, { key: 'y', label: 'y_s (px)', num: true }, { key: 'd', label: 'depth', num: true }],
          p.verts2D.map(function (v, i) { return ['v' + i, f(v.x, { fixed: 1 }), f(v.y, { fixed: 1 }), f(v.depth, { fixed: 3 })]; }), { caption: 'Screen points (camera azimuth ' + f(p.view.az, { sig: 3, unit: '°' }) + ', elevation ' + f(p.view.el, { sig: 3, unit: '°' }) + ')', rowHeaders: true, compact: true }));
        s3.appendChild(el('p', { class: 'm11-small' }, 'Face order, far → near: ' + p.faceOrder.map(function (fi) { return A.wire.FACE_NAMES[fi] + ' (' + f(p.faceDepth[fi], { fixed: 3 }) + ')'; }).join(', ') + '.'));
        drawNote.textContent = 'Rotating the 8 corners cost 8 × 9 = 72 multiplications after one q → R conversion; the quaternion sandwich would have needed 8 × 32 = 256.';
      });
    }
    function highlight() {
      stages.forEach(function (s, i) {
        const on = current === i + 1;
        s.li.classList.toggle('is-current', on);
        s.li.classList.toggle('is-dim', current > 0 && !on);
        if (on) s.li.setAttribute('aria-current', 'step'); else s.li.removeAttribute('aria-current');
      });
      status.textContent = current ? 'Stage ' + current + ' of 5: ' + stageTitles[current - 1].replace(/^\d · /, '') + '.' : 'Showing all five stages.';
    }
    stepBtn.addEventListener('click', function () { current = current % 5 + 1; highlight(); });
    allBtn.addEventListener('click', function () { current = 0; highlight(); });
    [ax, ay, az, ang].forEach(function (c) { c.on('change', update); });
    update();
    highlight();
  }

  /* ================================================================ plot anatomy */

  function buildAnatomy() {
    const w = parts('w-plot-anatomy');
    const lines = ui.toggle({ id: 'wpa-lines', label: 'Requirement and threshold lines', checked: true });
    const bands = ui.toggle({ id: 'wpa-bands', label: 'Mode timeline and fault window', checked: true });
    const grey = ui.toggle({ id: 'wpa-grey', label: 'Greyscale preview', checked: false });
    [lines, bands, grey].forEach(function (c) { w.controls.appendChild(c.el); });
    const stack = el('div', { class: 'm11-stack' });
    w.out.appendChild(stack);
    const r = runPreset('T03');
    const fw = windows(r.fault, r.t);
    const vb = fw.map(function (x) { return { x0: x.t0, x1: x.t1, color: '--band-fault', hatch: true }; });
    const M = { left: 56 };
    const tlBox = el('div'), b1 = el('div'), b2 = el('div'), b3 = el('div');
    [tlBox, b1, b2, b3].forEach(function (b) { stack.appendChild(b); });
    const tl = A.plot.timeline(tlBox, { title: 'Mode', segments: A.modes.runLengths(r.mode, r.t), faults: fw, events: r.events.map(function (e) { return e.t; }), margin: M, axis: false });
    const H1 = [{ y: SM.exitRateDeg, label: SM.exitRateDeg + ' deg/s exit', color: '--line-thr', dash: [2, 3] }, { y: SM.enterRateDeg, label: SM.enterRateDeg + ' deg/s entry', color: '--line-thr' }, { y: LIM.rateMaxDeg, label: 'REQ-S1 ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req' }];
    const H2 = [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req' }, { y: SM.returnErrDeg, label: 'return guard ' + SM.returnErrDeg + '°', color: '--line-thr', dash: [2, 3] }];
    const tm = DEF.tauMax * 1000;
    const H3 = [{ y: tm, label: '+' + tm + ' mN m (REQ-S2)', color: '--line-req' }, { y: -tm, label: '−' + tm + ' mN m', color: '--line-req' }];
    const pR = A.plot.line(b1, { height: 170, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M, y: { includeLines: true }, series: [{ id: 'w', label: '|ω|', color: '--accent', width: 2, unit: 'deg/s' }], hlines: H1, vbands: vb });
    const pE = A.plot.line(b2, { height: 170, title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', margin: M, y: { log: true }, series: [{ id: 'e', label: 'error', color: '--accent', width: 2, unit: 'deg' }], hlines: H2, vbands: vb });
    const pT = A.plot.line(b3, { height: 170, title: 'Torque per axis', xLabel: 't (s)', yLabel: 'τ (mN m)', margin: M, y: { symmetric: true, includeLines: true },
      series: [{ id: 'x', label: 'τx', color: '--axis-x', width: 2 }, { id: 'y', label: 'τy', color: '--axis-y', dash: [6, 4], width: 2 }, { id: 'z', label: 'τz', color: '--axis-z', dash: [1.5, 3], width: 2.5 }], hlines: H3, vbands: vb });
    pR.set('w', r.t, r.rateDeg);
    const errPos = new Float64Array(r.n);
    for (let k = 0; k < r.n; k++) errPos[k] = Math.max(1e-3, r.errDeg[k]);
    pE.set('e', r.t, errPos);
    const tq = torqueMilli(r);
    pT.set('x', r.t, tq[0]); pT.set('y', r.t, tq[1]); pT.set('z', r.t, tq[2]);
    const plots = [pR, pE, pT, tl];
    plots.forEach(function (p) { p.onSeek(function (t) { plots.forEach(function (q) { q.setCursor(t); }); }); });
    const note = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(note);
    function update() {
      pR.setLines({ hlines: lines.value ? H1 : [], vbands: bands.value ? vb : [] });
      pE.setLines({ hlines: lines.value ? H2 : [], vbands: bands.value ? vb : [] });
      pT.setLines({ hlines: lines.value ? H3 : [], vbands: bands.value ? vb : [] });
      tlBox.hidden = !bands.value;
      stack.classList.toggle('is-grey', grey.value);
      note.textContent = lines.value
        ? 'With the lines drawn, the check is visual: the rate stays under ' + LIM.rateMaxDeg + ' deg/s (peak ' + f(r.metrics.peakRate, { fixed: 2 }) + '), the torque never leaves ±' + tm + ' mN m and the error ends below ' + LIM.errDeg + '°.'
        : 'Without the lines, the same curves say nothing about the requirements: is 11 deg/s a lot?';
    }
    [lines, bands, grey].forEach(function (c) { c.on('change', update); });
    update();
  }

  /* ================================================================ W11.2 playback */

  function buildPlayback() {
    const w = parts('w-playback');
    const r = runPreset('T03');
    const T = r.t[r.n - 1];
    const tq = ui.slider({ id: 'w112-t', label: 'Display time t*', min: 0, max: T, step: 0.01, value: 2.37, unit: 's' });
    const gap = ui.segmented({ id: 'w112-gap', label: 'Playback copy keeps one sample every', value: '1', options: [{ value: '1', label: '1 s' }, { value: '2', label: '2 s' }, { value: '5', label: '5 s' }] });
    w.controls.appendChild(tq.el); w.controls.appendChild(gap.el);
    const set = readouts(w.out, ['Bracket', 'Nearest sample', 'nlerp', 'slerp', 'Search steps']);
    const top = el('div', { class: 'm11-pb-top' });
    const wireBox = el('div', { class: 'wire m11-pb-wire' });
    const canvas = el('canvas', { 'aria-label': 'Truth attitude (solid) and nearest-sample attitude (ghost)' });
    wireBox.appendChild(canvas);
    const wireCap = el('p', { class: 'm11-small' }, 'Solid: the full-rate truth. Ghost: the nearest stored sample.');
    const bis = el('div', { class: 'm11-bisect' });
    top.appendChild(el('div', null, wireBox, wireCap));
    top.appendChild(bis);
    w.out.appendChild(top);
    const plotBox = el('div');
    w.out.appendChild(plotBox);
    const wf = A.wire.create(canvas, { aspect: 0.85, maxHeight: 240, bodyAxes: true, panels: true, boresight: true });
    const p = A.plot.line(plotBox, { height: 200, title: 'Interpolation error over the run', xLabel: 't (s)', yLabel: 'error (deg)', margin: { left: 52 },
      series: [{ id: 'near', label: 'nearest sample', color: '--warn', width: 2, dash: [6, 4], unit: 'deg' }, { id: 'nl', label: 'nlerp', color: '--axis-y', width: 2, dash: [1.5, 3], unit: 'deg' }, { id: 'sl', label: 'slerp', color: '--accent', width: 1.5, unit: 'deg' }] });
    let down = null;
    function downsample(g) {
      const step = Math.round(g / r.dt);
      const ts = [], qs = [];
      for (let k = 0; k < r.n; k += step) { ts.push(r.t[k]); qs.push(qAt(r, k)); }
      return { t: Float64Array.from(ts), q: qs, g: g };
    }
    function interp(d, t) {
      const trace = [];
      const lo = A.sim.bisectTime(d.t, t, trace);
      const hi = Math.min(d.t.length - 1, lo + 1);
      const s = hi > lo ? Math.min(1, Math.max(0, (t - d.t[lo]) / (d.t[hi] - d.t[lo]))) : 0;
      const a = d.q[lo], b = d.q[hi];
      return { lo: lo, hi: hi, s: s, trace: trace, near: s < 0.5 ? a : b, nl: nlerp(a, b, s), sl: A.quat.slerp(a, b, s) };
    }
    function curves() {
      down = downsample(+gap.value);
      const N = Math.floor(T / 0.05) + 1;
      const ts = new Float64Array(N), e1 = new Float64Array(N), e2 = new Float64Array(N), e3 = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const t = Math.min(T, i * 0.05);
        const truth = A.sim.sampleAt(r, t).q;
        const it = interp(down, t);
        ts[i] = t;
        e1[i] = R2D * A.quat.angleBetween(it.near, truth);
        e2[i] = R2D * A.quat.angleBetween(it.nl, truth);
        e3[i] = R2D * A.quat.angleBetween(it.sl, truth);
      }
      p.set('near', ts, e1); p.set('nl', ts, e2); p.set('sl', ts, e3);
      const max = function (a) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, a[i]); return m; };
      p.summary('Over the whole run the largest errors are: nearest sample ' + f(max(e1), { sig: 3 }) + '°, nlerp ' + f(max(e2), { sig: 3 }) + '°, slerp ' + f(max(e3), { sig: 3 }) + '°.');
    }
    function update() {
      const t = tq.value;
      const it = interp(down, t);
      const truth = A.sim.sampleAt(r, t).q;
      const e = function (q) { return f(R2D * A.quat.angleBetween(q, truth), { sig: 3, unit: '°' }); };
      set([f(down.t[it.lo], { fixed: 0 }) + '–' + f(down.t[it.hi], { fixed: 0, unit: 's' }) + ', s = ' + f(it.s, { fixed: 2 }), e(it.near), e(it.nl), e(it.sl), String(it.trace.length)]);
      wf.setQuat(truth); wf.setGhost(it.near); wf.render();
      p.setCursor(t);
      bis.textContent = '';
      const rows = it.trace.map(function (st, i) {
        const goRight = down.t[st.mid] <= t;
        return [String(i + 1), String(st.lo), String(st.mid), String(st.hi), f(down.t[st.mid], { fixed: 0, unit: 's' }), goRight ? 'lo\u00a0=\u00a0mid' : 'hi\u00a0=\u00a0mid'];
      });
      bis.appendChild(ui.table([{ key: 'i', label: 'Step', num: true }, { key: 'lo', label: 'lo', num: true }, { key: 'mid', label: 'mid', num: true }, { key: 'hi', label: 'hi', num: true }, { key: 'tm', label: 't[mid]', num: true }, { key: 'd', label: 'Then' }],
        rows, { caption: 'Binary search for t* = ' + f(t, { fixed: 2, unit: 's' }) + ' in ' + down.t.length + ' samples', compact: true }));
    }
    tq.on('change', update);
    p.onSeek(function (t) { tq.set(t); update(); });
    gap.on('change', function () { curves(); update(); });
    curves();
    update();
  }

  /* ================================================================ W11.3 annunciator design lab */

  function buildAnnLab() {
    const w = parts('w-annunciator-lab');
    const r = runPreset('T03');
    const QS = [
      { pause: 3, q: 'Paused at 3 s. What mode will the spacecraft be in at 6 s?', options: ['NOMINAL', 'SAFE_DETUMBLE', 'SAFE_HOLD'], correct: 2,
        explain: 'SAFE_HOLD, entered at 4.50 s. At 3 s the rate is already below ' + SM.exitRateDeg + ' deg/s and the good UI’s “Held for ' + SM.exitHold + ' s” bar is about a quarter full, so the hold completes at about 4.5 s.' },
      { pause: 46, q: 'Paused at 46 s. What mode will the spacecraft be in at 50 s?', options: ['NOMINAL', 'SAFE_DETUMBLE', 'SAFE_HOLD'], correct: 2,
        explain: 'SAFE_HOLD, entered at 47.49 s. A fault forced SAFE_DETUMBLE at 45.49 s even though the rate was tiny; the rate lamp is lit and the hold bar shows how long is left. The plots alone show nothing unusual at all.' },
      { pause: 56, q: 'Paused at 56 s. The injected fault is scheduled to clear at 60 s. What mode at 58 s, and at 61 s?', options: ['SAFE_HOLD, then NOMINAL', 'NOMINAL, then NOMINAL', 'SAFE_HOLD, then SAFE_HOLD', 'SAFE_DETUMBLE, then SAFE_HOLD'], correct: 0,
        explain: 'SAFE_HOLD, then NOMINAL. The dwell is already complete and the rate and error lamps are lit; the only unmet guard is “Fault clear”. When the fault clears at 60 s the machine returns to NOMINAL at once (60.00 s).' }
    ];
    const score = el('p', { class: 'm11-score', 'aria-live': 'polite' });
    w.controls.appendChild(score);
    const grid = el('div', { class: 'm11-lab' });
    const poor = el('section', { class: 'm11-panel', 'aria-labelledby': 'w113-poor-h' }, el('h4', { id: 'w113-poor-h' }, 'Poor UI: plots only'));
    const good = el('section', { class: 'm11-panel', 'aria-labelledby': 'w113-good-h' }, el('h4', { id: 'w113-good-h' }, 'Good UI: mode, guards and dwell'));
    grid.appendChild(poor); grid.appendChild(good);
    const card = el('div', { class: 'm11-qcard' });
    w.out.appendChild(card);
    w.out.appendChild(grid);
    const M = { left: 52 };
    const X = { min: 0, max: 70 };
    const p1b = el('div'), p2b = el('div');
    poor.appendChild(p1b); poor.appendChild(p2b);
    const pR = A.plot.line(p1b, { height: 150, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', x: X, margin: M, legend: false, cursor: false, series: [{ id: 'w', label: '|ω|', color: '--accent', width: 2, unit: 'deg/s' }] });
    const pE = A.plot.line(p2b, { height: 150, title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', x: X, margin: M, legend: false, cursor: false, series: [{ id: 'e', label: 'error', color: '--accent', width: 2, unit: 'deg' }] });
    const cover = el('div', { class: 'm11-cover' }, el('p', null, ui.icon('info'), ' Hidden until you have answered with the poor UI.'));
    const goodInner = el('div', { class: 'm11-good-inner' });
    good.appendChild(cover); good.appendChild(goodInner);
    const annBox = el('div'), tlBox = el('div');
    goodInner.appendChild(annBox); goodInner.appendChild(tlBox);
    const ann = ui.modeAnnunciator(annBox);
    const tl = A.plot.timeline(tlBox, { title: 'Mode so far', segments: [], x: X, margin: M, axis: true });

    let qi = 0, stage = 'poor', pScore = 0, gScore = 0, answers = [];
    function showData() {
      const tP = QS[qi].pause;
      const k = Math.round(tP / r.dt);
      pR.set('w', r.t.subarray(0, k + 1), r.rateDeg.subarray(0, k + 1));
      pE.set('e', r.t.subarray(0, k + 1), r.errDeg.subarray(0, k + 1));
      ann.update(A.sim.sampleAt(r, tP), r);
      tl.set({ segments: A.modes.runLengths(r.mode.subarray(0, k + 1), r.t.subarray(0, k + 1)), faults: windows(r.fault.subarray(0, k + 1), r.t.subarray(0, k + 1)), events: r.events.filter(function (e) { return e.t <= tP; }).map(function (e) { return e.t; }) });
    }
    function render() {
      const Q = QS[qi];
      cover.hidden = stage === 'poor' ? false : true;
      goodInner.hidden = stage === 'poor';
      if (stage !== 'poor') { tl.render(); }
      score.textContent = 'Score so far: poor UI ' + pScore + ' of ' + answers.filter(function (a) { return a.poor !== undefined && a.done; }).length + ', good UI ' + gScore + ' of ' + answers.filter(function (a) { return a.done; }).length + '.';
      card.textContent = '';
      card.appendChild(el('p', { class: 'm11-qhead' }, 'Pause point ' + (qi + 1) + ' of ' + QS.length + ' · t = ' + Q.pause + ' s'));
      if (stage === 'end') {
        card.appendChild(el('p', null, el('strong', null, 'Final score: '), 'poor UI ' + pScore + ' of 3, good UI ' + gScore + ' of 3.'));
        card.appendChild(el('p', null, pScore < gScore ? 'The lamps turned guesses into readings: the good UI shows the current mode, why it changed and what the next change needs.' : 'Even when the plots led you to the right answer, they could not tell you why; the good UI makes every answer readable from the screen.'));
        const again = ui.button({ label: 'Start again', kind: 'secondary', icon: 'reset', small: true });
        again.addEventListener('click', function () { qi = 0; stage = 'poor'; pScore = 0; gScore = 0; answers = []; showData(); render(); });
        card.appendChild(again);
        return;
      }
      const name = 'w113-q' + qi + '-' + stage;
      const fs = el('fieldset', { class: 'm11-q' }, el('legend', null, Q.q + (stage === 'good' ? ' Answer again, now using the good UI.' : stage === 'poor' ? ' Use only the poor UI.' : '')));
      const radios = Q.options.map(function (o, j) {
        const inp = el('input', { type: 'radio', name: name, value: String(j), id: name + '-' + j, disabled: stage === 'reveal' });
        const lab = el('label', { class: 'm11-opt', for: name + '-' + j }, inp, el('span', null, o));
        if (stage === 'reveal') {
          const a = answers[qi];
          const marks = [];
          if (j === Q.correct) marks.push('correct answer');
          if (a.poor === j) marks.push('your poor-UI answer');
          if (a.good === j) marks.push('your good-UI answer');
          if (marks.length) lab.appendChild(el('span', { class: 'm11-mark' + (j === Q.correct ? ' ok' : ' bad') }, ui.icon(j === Q.correct ? 'check' : 'cross'), marks.join(', ')));
        }
        fs.appendChild(lab);
        return inp;
      });
      card.appendChild(fs);
      const msg = el('p', { class: 'status-line', 'aria-live': 'polite' });
      if (stage === 'reveal') {
        card.appendChild(el('p', { class: 'm11-explain' }, Q.explain));
        const next = ui.button({ label: qi < QS.length - 1 ? 'Next pause point' : 'See the final score', kind: 'primary', icon: 'arrow-right', small: true });
        next.addEventListener('click', function () {
          if (qi < QS.length - 1) { qi++; stage = 'poor'; showData(); } else stage = 'end';
          render();
          const first = card.querySelector('input:not([disabled]), button');
          if (first) first.focus();
        });
        card.appendChild(el('div', { class: 'btn-row' }, next));
      } else {
        const lock = ui.button({ label: stage === 'poor' ? 'Lock in (poor UI)' : 'Lock in (good UI)', kind: 'primary', small: true });
        lock.addEventListener('click', function () {
          const j = radios.findIndex(function (x) { return x.checked; });
          if (j < 0) { msg.textContent = 'Choose an answer first.'; return; }
          if (!answers[qi]) answers[qi] = {};
          if (stage === 'poor') { answers[qi].poor = j; stage = 'good'; ui.announce('The good UI is now visible.'); }
          else {
            answers[qi].good = j; answers[qi].done = true;
            if (answers[qi].poor === Q.correct) pScore++;
            if (j === Q.correct) gScore++;
            stage = 'reveal';
            ui.announce(j === Q.correct ? 'Correct.' : 'Not quite: the answer is ' + Q.options[Q.correct] + '.');
          }
          render();
          const first = card.querySelector('input:not([disabled]), button');
          if (first) first.focus();
        });
        card.appendChild(el('div', { class: 'btn-row' }, lock));
      }
      card.appendChild(msg);
    }
    showData();
    render();
  }

  /* ================================================================ W11.4 one model, many views */

  function buildViews() {
    const w = parts('w-views');
    const preset = ui.select({ id: 'w114-preset', label: 'Scenario (one model run)', value: 'T03', options: ['T03', 'FAULT', 'HIGHRATE', 'T01'].map(function (id) { return { value: id, label: A.presets.meta[id].label }; }) });
    const tsl = ui.slider({ id: 'w114-t', label: 'Time', min: 0, max: 120, step: 0.01, value: 5, unit: 's' });
    w.controls.appendChild(preset.el); w.controls.appendChild(tsl.el);
    const VIEWS = [{ id: 'plot', label: 'Plot' }, { id: 'wire', label: '3-D view' }, { id: 'tele', label: 'Telemetry table' }, { id: 'feed', label: 'Event feed' }];
    const chips = el('div', { class: 'chips m11-wide', role: 'group', 'aria-label': 'Views' });
    const chipApi = {};
    VIEWS.forEach(function (v) { const c = ui.chip({ label: v.label, pressed: true }); chipApi[v.id] = c; chips.appendChild(c.el); });
    const replay = ui.button({ label: 'Replay events', kind: 'secondary', icon: 'play', small: true });
    w.controls.appendChild(el('div', { class: 'm11-wide m11-view-row' }, el('span', { class: 'field-label' }, 'Views'), chips, replay));
    const grid = el('div', { class: 'm11-views' });
    w.out.appendChild(grid);
    const panels = {};
    VIEWS.forEach(function (v) { panels[v.id] = el('section', { class: 'm11-view', 'aria-label': v.label + ' view' }, el('h4', null, v.label)); grid.appendChild(panels[v.id]); });
    const M = { left: 52 };
    const tlBox = el('div'), plBox = el('div');
    panels.plot.appendChild(tlBox); panels.plot.appendChild(plBox);
    const tl = A.plot.timeline(tlBox, { title: 'Logged modes', segments: [], margin: M, axis: false });
    const pl = A.plot.line(plBox, { height: 160, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M, series: [{ id: 'w', label: '|ω|', color: '--accent', width: 2, unit: 'deg/s' }],
      hlines: [{ y: SM.enterRateDeg, label: SM.enterRateDeg + ' deg/s', color: '--line-thr' }, { y: SM.exitRateDeg, label: SM.exitRateDeg + ' deg/s', color: '--line-thr', dash: [2, 3] }] });
    const canvas = el('canvas', { 'aria-label': 'Spacecraft attitude at the selected time' });
    panels.wire.appendChild(el('div', { class: 'wire' }, canvas));
    const wf = A.wire.create(canvas, { aspect: 0.8, maxHeight: 240, bodyAxes: true, inertialAxes: true, panels: true, boresight: true, trail: 300 });
    const tele = el('div');
    panels.tele.appendChild(tele);
    const feed = el('ol', { class: 'm11-feed' });
    panels.feed.appendChild(feed);
    const replayBox = el('div', { class: 'm11-replay' });
    w.out.appendChild(replayBox);
    let r = null, lastT = -1;
    function load() {
      guarded(w.out, function () {
        r = runPreset(preset.value);
        const T = r.t[r.n - 1];
        tsl.range.max = String(T); tsl.number.max = String(T);
        if (tsl.value > T) tsl.set(T);
        tl.set({ segments: A.modes.runLengths(r.mode, r.t), faults: windows(r.fault, r.t), events: r.events.map(function (e) { return e.t; }), x: { min: 0, max: T } });
        pl.setX(0, T);
        pl.set('w', r.t, r.rateDeg);
        feed.textContent = '';
        if (!r.events.length) feed.appendChild(el('li', { class: 'muted' }, 'No ModeChanged events in this run.'));
        r.events.forEach(function (e, i) {
          feed.appendChild(el('li', { dataset: { i: String(i) } }, el('code', null, 'ModeChanged'), ' t = ' + f(e.t, { fixed: 2, unit: 's' }) + ': ' + NAMES[e.from] + ' → ' + NAMES[e.to] + ' (' + A.modes.reasonText(e.reason, r.config.safeMode) + ')'));
        });
        replayBox.textContent = '';
        wf.clearTrail(); lastT = -1;
        show();
      });
    }
    function show() {
      if (!r) return;
      const t = Math.min(tsl.value, r.t[r.n - 1]);
      const s = A.sim.sampleAt(r, t);
      if (!panels.plot.hidden) { tl.setCursor(t); pl.setCursor(t); }
      if (!panels.wire.hidden) {
        if (t < lastT) wf.clearTrail();
        lastT = t;
        wf.setQuat(s.q);
        wf.setArrows([{ v: s.w.map(function (x) { return x * 4; }), frame: 'body', color: '--accent', label: 'ω' }]);
        wf.render();
      }
      if (!panels.tele.hidden) {
        tele.textContent = '';
        tele.appendChild(ui.table([{ key: 'k', label: 'Channel' }, { key: 'v', label: 'Value' }], [
          ['t', f(s.t, { fixed: 2, unit: 's' })], ['mode', NAMES[s.mode]], ['q', qStr(s.q)],
          ['ω (deg/s)', '[' + s.w.map(function (x) { return f(x * R2D, { fixed: 2 }); }).join(', ') + ']'],
          ['τ (mN m)', '[' + s.tau.map(function (x) { return f(x * 1000, { fixed: 2 }); }).join(', ') + ']'],
          ['|ω|', f(s.rateDeg, { fixed: 3, unit: 'deg/s' })], ['error', f(s.errDeg, { fixed: 3, unit: '°' })], ['fault', s.fault ? 'active' : 'clear']],
        { caption: 'Telemetry sample', rowHeaders: true, compact: true }));
      }
      if (!panels.feed.hidden) {
        ui.qsa('li[data-i]', feed).forEach(function (li) {
          const e = r.events[+li.dataset.i];
          li.classList.toggle('is-past', e.t <= t + 1e-9);
          if (e.t <= t + 1e-9) li.setAttribute('aria-current', 'false'); else li.removeAttribute('aria-current');
        });
        const past = r.events.filter(function (e) { return e.t <= t + 1e-9; });
        const lis = ui.qsa('li[data-i]', feed);
        if (past.length) lis[past.length - 1].setAttribute('aria-current', 'true');
      }
    }
    function doReplay() {
      if (!r) return;
      const T = r.t[r.n - 1];
      let mode = r.config.initial.mode, t0 = 0;
      const segs = [];
      r.events.forEach(function (e) {
        if (e.t > t0 + 1e-12) segs.push({ mode: mode, t0: t0, t1: e.t });
        mode = e.to; t0 = e.t;
      });
      segs.push({ mode: mode, t0: t0, t1: T });
      const logged = A.modes.runLengths(r.mode, r.t);
      const same = logged.length === segs.length && logged.every(function (s, i) { return s.mode === segs[i].mode && Math.abs(s.t0 - segs[i].t0) < r.dt / 2; });
      replayBox.textContent = '';
      const box = el('div');
      replayBox.appendChild(el('p', null, ui.badge(same ? 'pass' : 'fail', same ? 'Identical' : 'Different'), ' Timeline rebuilt from ' + r.events.length + ' event' + (r.events.length === 1 ? '' : 's') + ' alone (a fold over the feed), compared with the logged mode of every one of the ' + r.n + ' samples: ' + segs.length + ' segment' + (segs.length === 1 ? '' : 's') + (same ? ', all matching.' : ', not matching.')));
      replayBox.appendChild(box);
      A.plot.timeline(box, { title: 'Rebuilt from events only', segments: segs, x: { min: 0, max: T }, margin: M, axis: true });
    }
    VIEWS.forEach(function (v) {
      chipApi[v.id].on('change', function (on) { panels[v.id].hidden = !on; if (on) { if (v.id === 'plot') { tl.render(); pl.render(); } show(); } });
    });
    preset.on('change', load);
    tsl.on('change', show);
    pl.onSeek(function (t) { tsl.set(t); show(); });
    tl.onSeek(function (t) { tsl.set(t); show(); });
    replay.addEventListener('click', doReplay);
    load();
  }

  /* ================================================================ timing button */

  function buildBench() {
    const btn = document.getElementById('bench-btn');
    const out = document.getElementById('bench-out');
    if (!btn || !out) return;
    btn.addEventListener('click', function () {
      const t0 = performance.now();
      const r = A.sim.run(A.presets.get('T03'));
      const ms = performance.now() - t0;
      const perTrial = ms;
      out.textContent = 'T03 (' + (r.n - 1).toLocaleString('en-GB') + ' RK4 steps, ' + (4 * (r.n - 1)).toLocaleString('en-GB') + ' derivative evaluations) took ' + f(ms, { sig: 3, unit: 'ms' }) +
        ' on this device, so a 60-trial, 120 s campaign needs at most about ' + f(60 * perTrial / 1000, { sig: 2, unit: 's' }) + ' of computing (less in practice, because campaign trials skip the log).';
    });
  }

  /* LOCAL (request P0): KaTeX's web fonts finish loading after typeset(), and a late vertical
     scrollbar narrows the page without a resize event; either can make a display equation overflow
     only afterwards. Re-run markScrollable then, so every scrolling box stays keyboard-focusable. */
  function recheckScrollable() {
    const again = ui.debounce(function () { ui.markScrollable(document.body); }, 150);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(again, function () { /* font loading failed: nothing to re-check */ });
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', again);
    }
    window.addEventListener('load', again);
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = 0;
      new ResizeObserver(function (entries) {
        const cw = entries[0].contentRect.width;
        if (Math.abs(cw - lastW) > 0.5) { lastW = cw; again(); }
      }).observe(document.getElementById('main'));
    }
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm11' });
    buildPipeline();
    buildAnatomy();
    buildPlayback();
    buildViews();
    buildAnnLab();
    buildBench();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'To rotate 1000 vertices by an attitude, the cheaper approach is…',
        options: ['Apply \\(q\\otimes v\\otimes q^{*}\\) to each vertex.', 'Convert to Euler angles.', 'Convert q to a matrix once, then 9 multiplies per vertex.'], correct: 2,
        explain: 'The sandwich costs two Hamilton products (32 multiplications) per vertex. One conversion to R plus 9 per vertex is about 9,000 multiplications for 1000 vertices instead of about 32,000.' },
      { q: 'Which annunciator detail best prevents mode confusion?',
        options: ['Showing why the last transition happened and what the next one needs.', 'A larger 3D view.', 'More decimal places.'], correct: 0,
        explain: 'Mode confusion is a gap between the real mode and the operator’s mental model. Showing the mode, the guard that fired and the guards still unmet lets anyone predict the next change, as in the lab above.' },
      { q: 'Interpolating attitude between samples should use…',
        options: ['linear interpolation of Euler angles.', 'slerp (or normalised lerp for tiny steps).', 'the nearest sample only.'], correct: 1,
        explain: 'Slerp moves at constant angular rate along the shortest arc between two unit quaternions; nlerp is nearly identical for small steps. Euler-angle interpolation is not uniform and fails near ±90° pitch, and the nearest sample jumps.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm11');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    recheckScrollable();
  });
})();
