/**
 * components.js: builds the kitchen sink in tests/components.html from the shared UI kit.
 * Uses a real T03 run when the engine is loaded, otherwise a synthetic run of the same shape.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------------------- data for the demos */

  function syntheticRun() {
    const dt = 0.1, n = 1201, t = new Float64Array(n), rate = new Float64Array(n), err = new Float64Array(n);
    const mode = new Uint8Array(n), fault = new Uint8Array(n), q = new Float64Array(4 * n), w = new Float64Array(3 * n);
    const tau = new Float64Array(3 * n), tauCmd = new Float64Array(3 * n);
    const cf = new Uint16Array(n), cb = new Uint16Array(n), cd = new Uint16Array(n);
    for (let k = 0; k < n; k++) {
      const tk = k * dt; t[k] = tk;
      rate[k] = 11 * Math.exp(-tk / 2) + 0.2 * Math.exp(-tk / 30);
      err[k] = 37 * Math.exp(-tk / 15);
      mode[k] = tk < 4.5 ? 1 : tk < 39.3 ? 2 : 0;
      fault[k] = tk >= 45 && tk < 60 ? 1 : 0;
      const half = (err[k] * Math.PI / 180) / 2;
      q[4 * k] = Math.cos(half); q[4 * k + 3] = Math.sin(half);
      for (let i = 0; i < 3; i++) { w[3 * k + i] = rate[k] * Math.PI / 180 / Math.sqrt(3); tauCmd[3 * k + i] = -0.006 * Math.exp(-tk / 3) * (i + 1) / 3; tau[3 * k + i] = Math.max(-0.003, tauCmd[3 * k + i]); }
      cb[k] = mode[k] === 1 && rate[k] < 0.5 ? Math.round((tk - 2) / dt) : 0;
      cd[k] = mode[k] === 2 ? Math.round((tk - 4.5) / dt) : 0;
    }
    return {
      n: n, dt: dt, t: t, q: q, w: w, tau: tau, tauCmd: tauCmd, errDeg: err, rateDeg: rate, errDegUsed: err, rateDegUsed: rate,
      mode: mode, fault: fault, counters: { fault: cf, below: cb, dwell: cd },
      config: { duration: 120, dt: dt, safeMode: { enabled: true, enterRateDeg: 6, faultPersist: 0.5, exitRateDeg: 0.5, exitHold: 2, returnErrDeg: 4, returnRateDeg: 0.5, dwell: 8 } },
      events: [{ k: 45, t: 4.5, from: 1, to: 2, reason: 'rate-low', values: {} }, { k: 393, t: 39.3, from: 2, to: 0, reason: 'guards', values: {} }],
      req: [{ id: 'REQ-F1', status: 'pass', value: 'max detumble time 2.51 s' }, { id: 'REQ-F2', status: 'pass', value: 'final error 0.045°' },
        { id: 'REQ-S1', status: 'pass', value: 'peak 11.18 deg/s, margin 3.82' }, { id: 'REQ-S2', status: 'fail', value: 'synthetic failure' },
        { id: 'REQ-L1', status: 'na', value: 'synthetic' }],
      metrics: { settle: 43.8, peakErr: 37, peakRate: 11.18, peakRateT: 0, maxTau: 0.003, maxTauCmd: 0.00698, effort: 1.2e-4, margin: 3.82,
        entries: [0], detumble: [2.51], transitions: 2, satFrac: 0.008, final: { mode: 0, errDeg: 0.045, rateDeg: 0.01 }, tLastNominalEntry: 39.3 }
    };
  }
  function sampleOf(r, tq) {
    if (A.sim && A.sim.sampleAt && r.config && r.config.sensors) return A.sim.sampleAt(r, tq);
    const k = Math.max(0, Math.min(r.n - 1, Math.round(tq / r.dt)));
    return { t: tq, k: k, q: [r.q[4 * k], r.q[4 * k + 1], r.q[4 * k + 2], r.q[4 * k + 3]], w: [r.w[3 * k], r.w[3 * k + 1], r.w[3 * k + 2]],
      tau: [r.tau[3 * k], r.tau[3 * k + 1], r.tau[3 * k + 2]], errDeg: r.errDeg[k], rateDeg: r.rateDeg[k], mode: r.mode[k], fault: !!r.fault[k],
      counters: { fault: r.counters.fault[k], below: r.counters.below[k], dwell: r.counters.dwell[k] } };
  }
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
  function rng(seed) {
    if (A.rng && A.rng.mulberry32) return A.rng.mulberry32(seed);
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'components', base: '../' });
    const real = !!(A.sim && A.presets && A.presets.T03);
    const run = real ? A.sim.run(A.presets.T03) : syntheticRun();
    const LIM = (A.params && A.params.LIMITS) || { errDeg: 2, rateDeg: 0.5, rateMaxDeg: 15 };
    const sm = run.config.safeMode;
    const tauMax = (run.config.tauMax || 0.003);
    $('demo-run-note').textContent = real
      ? 'Live data: one ADCS.sim.run of preset T03 (safe-mode upset with a fault from 45 to 60 s).'
      : 'Synthetic data: the engine is not loaded, so a stand-in run of the same shape is used.';

    /* ------------------------------------------------ theme preview buttons */
    const tb = $('theme-buttons');
    ['system', 'light', 'dark'].forEach(function (t) {
      const b = ui.button({ label: t.charAt(0).toUpperCase() + t.slice(1), kind: 'secondary', small: true, icon: t === 'system' ? 'system' : t === 'light' ? 'sun' : 'moon' });
      b.setAttribute('aria-pressed', ui.theme.get() === t ? 'true' : 'false');
      b.addEventListener('click', function () { ui.theme.set(t); });
      b.dataset.theme = t;
      tb.appendChild(b);
    });
    window.addEventListener('adcs:themechange', function () {
      ui.qsa('button', tb).forEach(function (b) { b.setAttribute('aria-pressed', ui.theme.get() === b.dataset.theme ? 'true' : 'false'); });
    });

    /* ------------------------------------------------ chrome parts */
    const crumbs = $('demo-crumbs');
    const bc = ui.breadcrumb('m05'), strip = ui.moduleStrip('m05');
    if (bc) crumbs.appendChild(bc);
    if (strip) crumbs.appendChild(strip);
    $('demo-pager').appendChild(ui.pager('m05'));
    const m5 = A.data && A.data.module('m05');
    const pre = $('demo-prereqs');
    pre.appendChild(document.createTextNode('Prerequisites: '));
    (m5 ? m5.prereqs : []).forEach(function (id, i, arr) {
      const p = A.data.module(id);
      if (i) pre.appendChild(document.createTextNode(i === arr.length - 1 ? ' and ' : ', '));
      pre.appendChild(el('a', { href: '../' + p.slug }, String(p.num).padStart(2, '0') + ' ' + p.title));
    });

    /* ------------------------------------------------ stats */
    const stats = el('div', { class: 'stats' });
    const J = (A.params && A.params.DEFAULTS.J) || [0.035, 0.040, 0.025];
    stats.appendChild(ui.stat({ value: '±' + ui.fmt(tauMax * 1000, { sig: 2 }) + ' mN m', label: 'torque per axis', tag: 'project' }));
    stats.appendChild(ui.stat({ value: J.join(', '), label: 'J diagonal (kg m²)', tag: 'project' }));
    $('demo-stats').appendChild(stats);

    /* ------------------------------------------------ buttons */
    const bb = $('demo-buttons');
    bb.appendChild(ui.button({ label: 'Run', kind: 'primary', icon: 'play' }));
    bb.appendChild(ui.button({ label: 'Reset to preset', icon: 'reset' }));
    bb.appendChild(ui.button({ label: 'Copy scenario link', kind: 'ghost', icon: 'link' }));
    bb.appendChild(ui.button({ label: 'Step forward 0.1 s', icon: 'step-fwd', iconOnly: true, title: 'Step forward 0.1 s' }));
    bb.appendChild(ui.button({ label: 'Small', kind: 'secondary', small: true }));

    /* ------------------------------------------------ controls */
    const cbox = $('demo-controls');
    const kp = ui.slider({ id: 'k-kp', label: 'Kp', min: 0, max: 0.1, step: 0.001, value: 0.02, unit: 'N m', tag: 'site', help: 'Proportional gain on the error quaternion vector.' });
    const rr = ui.slider({ id: 'k-r', label: 'r (log)', min: 100, max: 20000, value: 2000, log: true, tag: 'project' });
    const sw = ui.toggle({ id: 'k-safe', label: 'Safe mode enabled', checked: true, tag: 'project' });
    const seg = ui.segmented({ id: 'k-ctl', label: 'Controller', value: 'PID', options: [{ value: 'PID', label: 'PID' }, { value: 'LQR', label: 'LQR' }, { value: 'DETUMBLE', label: 'Detumble only' }, { value: 'NONE', label: 'None' }] });
    const sel = ui.select({ id: 'k-preset', label: 'Preset', value: 'T03', options: (A.presets ? Object.keys(A.presets) : ['T01', 'T02', 'T03']).map(function (k) { return { value: k, label: k }; }) });
    [kp, rr, sw, seg, sel].forEach(function (c) { cbox.appendChild(c.el); });
    function showValues() { $('demo-control-values').textContent = 'Kp = ' + kp.value + ', r = ' + rr.value + ', safe = ' + sw.value + ', controller = ' + seg.value + ', preset = ' + sel.value; }
    [kp, rr, sw, seg, sel].forEach(function (c) { c.on('change', showValues); });
    showValues();

    /* ------------------------------------------------ tags, badges, pills, chips */
    ['project', 'derived', 'site', 'option', 'illustrative', 'extension', 'analogy', 'typical'].forEach(function (k) { $('demo-tags').appendChild(ui.tag(k)); });
    $('demo-legend').appendChild(ui.legend(false));
    ['pass', 'fail', 'na'].forEach(function (s) { $('demo-badges').appendChild(ui.badge(s)); });
    $('demo-badges').appendChild(ui.badge('pass', 'PASS 60/60'));
    ['strong', 'moderate', 'weak'].forEach(function (s) { $('demo-pills').appendChild(ui.pill(s)); });
    ['notes', 'partial', 'outline'].forEach(function (e) { $('demo-pills').appendChild(ui.evidence(e)); });
    (A.data ? A.data.disciplines : []).forEach(function (d, i) {
      $('demo-chips').appendChild(ui.chip({ label: d.name, dot: d.color, pressed: i === 1 }).el);
    });

    /* ------------------------------------------------ widget card with a live single-axis run */
    const w = ui.widget({ id: 'k-step', title: 'Single-axis PD step (pattern)', try: 'Move Kd.', notice: 'Low damping overshoots; high damping is slow.', tags: ['site', 'derived'], notes: 'Uses ADCS.sim.singleAxis; errors from the engine appear inline.' });
    $('demo-widget').appendChild(w.el);
    const ctl = el('div', { class: 'widget-controls' });
    const outBox = el('div', { class: 'widget-output' });
    w.body.appendChild(ctl); w.body.appendChild(outBox);
    const kd = ui.slider({ id: 'k-kd', label: 'Kd', min: 0.005, max: 0.2, step: 0.005, value: 0.08, unit: 'N m s', tag: 'site' });
    ctl.appendChild(kd.el);
    const errBtn = ui.button({ label: 'Trigger a RangeError', kind: 'ghost', icon: 'warn' });
    ctl.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Error display'), errBtn));
    const stepPlot = A.plot.line(outBox, { height: 170, title: 'θ(t), 30° step', yLabel: 'θ (deg)', xLabel: 't (s)',
      series: [{ id: 'th', label: 'θ', color: '--accent', unit: 'deg' }], bands: [{ y0: -2, y1: 2, color: '--band-ok' }],
      hlines: [{ y: 2, label: '±2°', color: '--line-thr', dash: [4, 4] }] });
    function runStep() {
      ui.clearError(outBox);
      if (!(A.sim && A.sim.singleAxis)) return;
      try {
        const s = A.sim.singleAxis({ J: J[1], kTheta: 0.01, kW: kd.value, duration: 40, dt: 0.02, theta0: 30 * Math.PI / 180 });
        const deg = new Float64Array(s.theta.length);
        for (let i = 0; i < deg.length; i++) deg[i] = s.theta[i] * 180 / Math.PI;
        stepPlot.set('th', s.t, deg);
      } catch (err) {
        if (err instanceof RangeError) ui.showError(outBox, err); else throw err;
      }
    }
    kd.on('change', ui.debounce(runStep, 60));
    errBtn.addEventListener('click', function () {
      try { if (A.sim) A.sim.run({ dt: -1 }); else throw new RangeError('Time step dt must be positive.'); }
      catch (err) { if (err instanceof RangeError) ui.showError(outBox, err); else throw err; }
    });
    runStep();

    /* ------------------------------------------------ callouts */
    const cl = $('demo-callouts');
    cl.appendChild(ui.callout('info', 'How to read this', 'An info callout explains a convention or gives context.'));
    cl.appendChild(ui.callout('warn', 'Watch the spec gap', 'A warning callout flags something the reader could get wrong.'));
    const ext = ui.callout('ext', null);
    ext.querySelector('.callout-content').appendChild(el('p', { class: 'callout-title' }, 'Beyond the original project scope ', ui.tag('extension')));
    ext.querySelector('.callout-content').appendChild(el('p', null, 'The original project fed back the true simulated state. This is a natural extension.'));
    cl.appendChild(ext);
    cl.appendChild(ui.callout('error', null, 'Duration must be positive (an inline error from showError).'));

    /* ------------------------------------------------ provenance */
    ui.renderProvenance($('demo-provenance'), 'm05');

    /* ------------------------------------------------ quiz */
    ui.quiz($('demo-quiz'), [
      { q: 'Which kind of evidence can refute REQ-S1?', options: ['A single log sample above 15 deg/s.', 'The absence of a detumble within 60 s.', 'A Monte Carlo pass rate below 95%.'], correct: 0,
        explain: 'REQ-S1 is a safety property ("never exceed"), so one bad sample in a finite log is enough to refute it.' },
      { q: 'With \\(q_e = q_{ref}^* \\otimes q\\), why negate \\(q_e\\) when \\(q_{e0} < 0\\)?', options: ['To take the shorter rotation.', 'To normalise the quaternion.', 'To change the rotation axis.'], correct: 0,
        explain: 'q and −q describe the same attitude; choosing q_e0 ≥ 0 makes the controller rotate the short way.' }
    ]);

    /* ------------------------------------------------ simulation displays */
    const pills = $('demo-modepills');
    [0, 1, 2].forEach(function (m) { pills.appendChild(ui.modePill(m)); });
    pills.appendChild(ui.modePill('SAFE_HOLD', { large: true }));
    const lampsBox = $('demo-lamps');
    lampsBox.appendChild(ui.lamp({ label: 'Fault clear', on: true, value: 'clear' }).el);
    lampsBox.appendChild(ui.lamp({ label: 'Dwell ≥ 8 s', on: false, value: '3.2/8 s', progress: 0.4 }).el);
    lampsBox.appendChild(ui.lamp({ label: '|ω| > 6 deg/s', trigger: true, on: true, value: '11.18 deg/s' }).el);
    const ann = ui.modeAnnunciator($('demo-annunciator'));
    const metrics = ui.metricsTable($('demo-metrics'));
    metrics.update(run.metrics);
    const badges = ui.reqBadges($('demo-reqs'));
    badges.update(run.req);

    /* ------------------------------------------------ plots */
    const t = run.t, n = run.n;
    const vb = windows(run.fault, t).map(function (wn) { return { x0: wn.t0, x1: wn.t1, color: '--band-fault', hatch: true }; });
    const pErr = A.plot.line($('demo-plot-err'), { title: 'Attitude error', yLabel: 'error (deg)', xLabel: 't (s)',
      series: [{ id: 'e', label: 'error', color: '--accent', unit: 'deg' }],
      hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req' }, { y: sm.returnErrDeg, label: 'return guard ' + sm.returnErrDeg + '°', color: '--line-thr', dash: [2, 3] }],
      vbands: vb });
    pErr.set('e', t, run.errDeg);
    const pRate = A.plot.line($('demo-plot-rate'), { title: 'Rate norm', yLabel: '|ω| (deg/s)', xLabel: 't (s)',
      series: [{ id: 'w', label: '|ω|', color: '--accent', unit: 'deg/s' }],
      hlines: [{ y: sm.exitRateDeg, label: sm.exitRateDeg + ' deg/s', color: '--line-thr', dash: [2, 3] }, { y: sm.enterRateDeg, label: sm.enterRateDeg + ' deg/s entry', color: '--line-thr' },
        { y: LIM.rateMaxDeg, label: 'REQ-S1 limit ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req' }], vbands: vb });
    pRate.set('w', t, run.rateDeg);
    const tx = new Float64Array(n), ty = new Float64Array(n), tz = new Float64Array(n);
    for (let k = 0; k < n; k++) { tx[k] = run.tau[3 * k] * 1000; ty[k] = run.tau[3 * k + 1] * 1000; tz[k] = run.tau[3 * k + 2] * 1000; }
    const pTau = A.plot.line($('demo-plot-tau'), { title: 'Torque per axis', yLabel: 'τ (mN m)', xLabel: 't (s)', y: { symmetric: true },
      series: [{ id: 'x', label: 'τx', color: '--axis-x' }, { id: 'y', label: 'τy', color: '--axis-y', dash: [6, 4] }, { id: 'z', label: 'τz', color: '--axis-z', dash: [1.5, 3], width: 2 }],
      hlines: [{ y: tauMax * 1000, label: '+' + tauMax * 1000 + ' mN m', color: '--line-req' }, { y: -tauMax * 1000, label: MINUS() + tauMax * 1000 + ' mN m', color: '--line-req' }], vbands: vb });
    pTau.set('x', t, tx); pTau.set('y', t, ty); pTau.set('z', t, tz);
    function MINUS() { return '−'; }
    const segs = A.modes && A.modes.runLengths ? A.modes.runLengths(run.mode, run.t) : A.plot.segmentsFrom(run.mode, run.t);
    const tl = A.plot.timeline($('demo-timeline'), { title: 'Mode timeline', segments: segs, faults: windows(run.fault, t), events: run.events.map(function (e) { return e.t; }), axis: true });

    // histogram: synthetic detumble-like times from a seeded generator
    const rnd = rng(42);
    const vals = [];
    for (let i = 0; i < 60; i++) vals.push(1.5 + 2.5 * rnd() + 1.2 * rnd() * rnd() * 4);
    let bins;
    if (A.stats && A.stats.histogram) bins = A.stats.histogram(vals, { bins: 12, mode: 'fixed' });
    else { bins = []; for (let b = 0; b < 12; b++) bins.push({ x0: 1 + b * 0.6, x1: 1.6 + b * 0.6, count: 0 }); vals.forEach(function (v) { const b = Math.min(11, Math.max(0, Math.floor((v - 1) / 0.6))); bins[b].count++; }); }
    const mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    const sorted = vals.slice().sort(function (a, b) { return a - b; });
    const p95 = A.stats && A.stats.quantile ? A.stats.quantile(sorted, 0.95) : sorted[Math.floor(0.95 * (sorted.length - 1))];
    const width = bins.length ? bins[0].x1 - bins[0].x0 : 1;
    const curve = [];
    const sd = Math.sqrt(vals.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / vals.length);
    for (let x = bins[0].x0; x <= bins[bins.length - 1].x1 + 1e-9; x += width / 4) curve.push([x, vals.length * width * Math.exp(-0.5 * Math.pow((x - mean) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI))]);
    A.plot.histogram($('demo-hist'), { title: 'Detumble time (synthetic, 60 trials)', xLabel: 'detumble time (s)', yLabel: 'trials', bins: bins, label: 'trials',
      markers: [{ x: mean, label: 'mean ' + ui.fmt(mean, { sig: 3 }) + ' s', color: '--text-2' }, { x: p95, label: '95th percentile', color: '--line-req' }],
      curves: [{ label: 'normal fit', points: curve, color: '--warn', dash: [5, 3] }] });

    // scatter: synthetic initial angle vs |ω0|, coloured by a peak-rate proxy
    const pts = [];
    for (let i = 0; i < 60; i++) {
      const ang = 120 * rnd(), wv = [16 * rnd() - 8, 16 * rnd() - 8, 16 * rnd() - 8];
      const wn = Math.hypot(wv[0], wv[1], wv[2]);
      pts.push({ id: i + 1, x: ang, y: wn, c: Math.min(13, wn * 0.9 + ang / 60) });
    }
    const pickNote = el('p', { class: 'status-line', 'aria-live': 'polite' });
    const sc = A.plot.scatter($('demo-scatter'), { title: 'Initial angle against |ω0| (synthetic)', xLabel: 'initial angle (deg)', yLabel: '|ω0| (deg/s)', points: pts,
      colorScale: { min: 0, max: 13, label: 'peak rate (deg/s)' }, onPick: function (id) { pickNote.textContent = 'Picked trial ' + id + '.'; } });
    sc.el.appendChild(pickNote);

    // s-plane: PD locus for J_y with Kθ = 0.01 and the LQR operating point
    const Jy = J[1], kth = 0.01, locU = [], locL = [];
    for (let kdv = 0; kdv <= 0.2 + 1e-12; kdv += 0.002) {
      const disc = kdv * kdv - 4 * Jy * kth;
      if (disc < 0) { const re = -kdv / (2 * Jy), im = Math.sqrt(-disc) / (2 * Jy); locU.push([re, im]); locL.push([re, -im]); }
      else { const r1 = (-kdv + Math.sqrt(disc)) / (2 * Jy), r2 = (-kdv - Math.sqrt(disc)) / (2 * Jy); locU.push([r1, 0]); locL.push([r2, 0]); }
    }
    const locus = locU.concat([[NaN, NaN]], locL);
    const site = (function () { const kdv = 0.08, disc = kdv * kdv - 4 * Jy * kth; return disc >= 0 ? [{ re: (-kdv + Math.sqrt(disc)) / (2 * Jy), im: 0, label: 'PD (site)' }, { re: (-kdv - Math.sqrt(disc)) / (2 * Jy), im: 0 }] : []; })();
    const markers = [];
    if (A.lqr && A.lqr.axisGains) {
      const g = A.lqr.axisGains(Jy, 2, 0.15, 2000), cl2 = A.lqr.closedLoop(Jy, g.kTheta, g.kW);
      const wn = cl2.wn, z = cl2.zeta;
      markers.push({ re: -z * wn, im: wn * Math.sqrt(Math.max(0, 1 - z * z)), label: 'LQR' });
    }
    A.plot.splane($('demo-splane'), { title: 'Closed-loop poles, y axis', poles: site, locus: locus, markers: markers, zetaLines: [0.35, 0.72, 1], wnCircles: [0.5, 1], extent: 2.2,
      band: { zetaMin: 0.35, zetaMax: 1.3, label: 'short-period band ζ 0.35–1.3 (Analogy)' } });

    // bars: gyroscopic torque against the disturbance bound and the torque limit
    const wr = [5, -3, 4].map(function (v) { return v * Math.PI / 180; });
    const Jw = [J[0] * wr[0], J[1] * wr[1], J[2] * wr[2]];
    const gyro = Math.hypot(wr[1] * Jw[2] - wr[2] * Jw[1], wr[2] * Jw[0] - wr[0] * Jw[2], wr[0] * Jw[1] - wr[1] * Jw[0]);
    const dist = (A.params && A.params.DEFAULTS.disturbance) || [2e-5, -1e-5, 1.5e-5];
    A.plot.bars($('demo-bars'), { title: 'Torque magnitudes (log scale)', log: true, unit: 'N m', xLabel: 'torque (N m)',
      items: [{ label: '|ω × Jω|', value: gyro, color: '--warn' }, { label: '|τd|', value: Math.hypot(dist[0], dist[1], dist[2]), color: '--axis-y' }, { label: 'τmax', value: tauMax, color: '--accent' }],
      refLines: [{ v: 2e-5, label: '2×10⁻⁵ bound', color: '--text-2' }, { v: tauMax, label: 'τmax', color: '--line-req' }] });

    // log-log line plot (x.log and y.log): global error at t = 1 of y' = -y against the step size
    const hs = [], eE = [], eR = [];
    for (let k = 0; k <= 24; k++) {
      const hh = Math.pow(10, -3 + k / 8), steps = Math.max(1, Math.round(1 / hh)), dh = 1 / steps;
      let ye = 1, yr = 1;
      for (let i = 0; i < steps; i++) {
        ye += dh * -ye;
        const k1 = -yr, k2 = -(yr + dh / 2 * k1), k3 = -(yr + dh / 2 * k2), k4 = -(yr + dh * k3);
        yr += dh / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      }
      hs.push(dh); eE.push(Math.abs(ye - Math.exp(-1))); eR.push(Math.abs(yr - Math.exp(-1)));
    }
    const pLog = A.plot.line($('demo-logx'), { title: 'Global error against step size (log–log)', xLabel: 'h (s)', yLabel: 'error at t = 1',
      x: { log: true }, y: { log: true }, series: [{ id: 'e', label: 'forward Euler', color: '--axis-x' }, { id: 'r', label: 'RK4', color: '--axis-z', dash: [6, 4] }],
      vlines: [{ x: 0.01, label: 'site dt 0.01 s' }, { x: 0.012, label: 'close label' }], cursor: true });
    pLog.set('e', Float64Array.from(hs), Float64Array.from(eE)).set('r', Float64Array.from(hs), Float64Array.from(eR));

    /* ------------------------------------------------ wireframe */
    const wf = A.wire.create($('demo-wire'), { trail: 400, aspect: 0.9 });
    wf.setGhost([1, 0, 0, 0]);
    const pipeBox = $('demo-pipeline');

    /* ------------------------------------------------ scrub: one time cursor drives everything */
    const scrub = ui.slider({ id: 'k-scrub', label: 'Playback time t', min: 0, max: t[n - 1], step: 0.01, value: 47.5, unit: 's', help: 'Drag, type a time, or click any plot to seek.' });
    $('demo-scrub').appendChild(scrub.el);
    let lastT = -1;
    function show(tq) {
      const s = sampleOf(run, tq);
      ann.update(s, run);
      [pErr, pRate, pTau, tl].forEach(function (p) { p.setCursor(tq); });
      if (tq < lastT) wf.clearTrail();
      lastT = tq;
      wf.setQuat(s.q);
      wf.setArrows([{ v: s.w, frame: 'body', color: '--accent', label: 'ω' }, { v: s.tau.map(function (x) { return x * 50; }), frame: 'body', color: '--warn', label: 'τ' }]);
      wf.render();
      const pl = wf.pipeline(s.q);
      pipeBox.textContent = '';
      pipeBox.appendChild(ui.table([{ key: 'r', label: 'R (body → inertial)' }, { key: 'a', label: 'col 1', num: true }, { key: 'b', label: 'col 2', num: true }, { key: 'c', label: 'col 3', num: true }],
        pl.R.map(function (row, i) { return ['row ' + (i + 1), ui.fmt(row[0], { fixed: 3 }), ui.fmt(row[1], { fixed: 3 }), ui.fmt(row[2], { fixed: 3 })]; }),
        { caption: 'wire.pipeline(q): rotation matrix', rowHeaders: true, compact: true }));
      pipeBox.appendChild(el('p', { class: 'k-note' }, 'Face draw order (far to near): ' + pl.faceOrder.map(function (f) { return A.wire.FACE_NAMES[f]; }).join(', ')));
    }
    scrub.on('change', function (v) { show(v); });
    [pErr, pRate, pTau, tl].forEach(function (p) { p.onSeek(function (tq) { scrub.set(tq); show(tq); }); });
    show(scrub.value);

    /* ------------------------------------------------ popover and tabs */
    ui.popover($('demo-pop-btn'), function () {
      return el('div', null, el('h3', null, 'REQ-S1 · safety'),
        el('p', null, 'Angular rate shall never exceed 15 deg/s during the defined verification cases. ', ui.tag('project')),
        el('p', null, 'Tab stays inside; Escape closes and returns focus.'),
        ui.button({ label: 'A focusable button', small: true }));
    }, { label: 'Example popover' });
    const tabs = ui.tabs($('demo-tabs'), [
      { id: 'cards', label: 'Cards', content: el('p', null, 'Cards view: one card per subject.') },
      { id: 'matrix', label: 'Matrix', content: el('p', null, 'Matrix view: subjects against the 13 project parts.') },
      { id: 'disc', label: 'Disciplines', content: el('p', null, 'Disciplines view: an 8 × 13 heat table.') }
    ], { label: 'Example views' });
    tabs.on('change', function (id) { ui.announce('Showing the ' + id + ' tab'); });

    /* ------------------------------------------------ tables and matrix */
    if (A.params && A.params.PROVENANCE) {
      // PROVENANCE tags are ui.tag kinds ('project', 'derived', 'site', 'extension', ...)
      const rows = A.params.PROVENANCE.map(function (p) { return [p.label, p.value, ui.tag(p.tag), p.note || '']; });
      $('demo-table').appendChild(ui.table([{ key: 'p', label: 'Parameter' }, { key: 'v', label: 'Value' }, { key: 't', label: 'Tag' }, { key: 'n', label: 'Note' }], rows,
        { caption: 'Parameter provenance (ADCS.params.PROVENANCE)', rowHeaders: true }));
    }
    if (A.data) {
      const mods = A.data.modules, courses = A.data.courses.slice(0, 10);
      const table = el('table', { class: 'matrix' });
      const head = el('tr', null, el('th', { scope: 'col', class: 'sticky-col' }, 'Subject'));
      mods.forEach(function (m) { head.appendChild(el('th', { scope: 'col', title: m.title }, String(m.num).padStart(2, '0'))); });
      table.appendChild(el('thead', null, head));
      const tb2 = el('tbody');
      tb2.appendChild(el('tr', { class: 'group-row' }, el('th', { scope: 'rowgroup', colspan: String(mods.length + 1) }, 'First ten subjects')));
      courses.forEach(function (c) {
        const tr = el('tr', null, el('th', { scope: 'row' }, c.name));
        mods.forEach(function (m) {
          const row = A.data.mappingsForCourse(c.id).find(function (r) { return r.module === m.id; });
          const td = el('td');
          if (row) {
            const b = el('button', { type: 'button', 'aria-label': c.name + ', module ' + m.num + ' ' + m.title + ': ' + row.strength }, el('span', { class: 'cell-dot ' + row.strength, 'aria-hidden': 'true' }));
            ui.popover(b, function () { return el('div', null, el('h4', null, c.name + ' → ' + String(m.num).padStart(2, '0') + ' ' + m.short), el('p', null, row.concept), ui.pill(row.strength)); }, { label: c.name + ' and ' + m.short });
            td.appendChild(b);
          }
          tr.appendChild(td);
        });
        tb2.appendChild(tr);
      });
      table.appendChild(tb2);
      $('demo-matrix').appendChild(el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Subject by module matrix' }, table));
    }

    /* ------------------------------------------------ files and status */
    const fbox = $('demo-files'), status = $('demo-file-status');
    fbox.appendChild(ui.button({ label: 'Download run CSV', icon: 'download', onClick: function () {
      if (run.config && run.config.sensors) { ui.download('t03-run.csv', ui.toCSV(run, { decimate: 10 })); status.textContent = 'CSV download started.'; }
      else status.textContent = 'CSV export needs the engine run.';
    } }));
    fbox.appendChild(ui.button({ label: 'Copy page link', icon: 'copy', onClick: function () {
      ui.copyText(window.location.href).then(function (ok) { status.textContent = ok ? 'Link copied.' : 'Copy failed; select the address bar instead.'; });
    } }));
    fbox.appendChild(ui.button({ label: 'Announce a status', kind: 'ghost', icon: 'info', onClick: function () { ui.announce('Run complete: 5 of 5 requirements pass.'); status.textContent = 'Announced through the shared live region.'; } }));
    const sl = $('demo-simlinks');
    ((m5 && m5.simLinks) || [{ label: 'T03 safe-mode upset and fault', hash: 'preset=T03' }]).forEach(function (s) { sl.appendChild(el('li', null, ui.simLink(s.label, s.hash))); });
    sl.appendChild(el('li', null, ui.simLink('Close the spec gap', { preset: 'T03', gap: 1 })));

    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
