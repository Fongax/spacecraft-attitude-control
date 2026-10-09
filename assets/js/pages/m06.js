/**
 * m06.js: Module 06, actuators (package P4).
 * Widgets: W6.1 torque-reaction turntable, W6.2 wheel torque envelope, W6.3 momentum bucket,
 * W6.4 clip vs scale, W6.5 Stribeck zero-crossing (stretch).
 * Project values come from ADCS.params / ADCS.presets; hardware numbers are the module's
 * illustrative constants below and are tagged Illustrative wherever they are shown.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el, svg = ui.svg;
  const D2R = A.units.D2R, R2D = A.units.R2D;
  const DEF = A.params.DEFAULTS;
  const TAU_MAX = DEF.tauMax;
  const RPM = 60 / (2 * Math.PI);

  /** Illustrative hardware (plan §3 m06): not project data. */
  const HW = {
    Iw: 5e-5,                       // wheel inertia, kg m²
    motor: { V: 8, R: 4, kM: 0.006, Ilim: 0.5 },
    B: 30e-6,                       // Earth field magnitude, T
    orbit: 5400,                    // s
    hmax: 0.01,                     // N m s
    dipole: 0.8,                    // A m²
    friction: { Tc: 0.12e-3, Ts: 0.2e-3, ws: 10, cv: 1e-6 },
    rim: { rho: 7800, r: 0.04, w: 1000 }
  };

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
    return function (values) { values.forEach(function (v, i) { if (dds[i]) dds[i].textContent = v; }); };
  }
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
  }
  function f(x, o) { return ui.fmt(x, o); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function cumTrapz(t, y) {
    const out = new Float64Array(y.length);
    for (let k = 1; k < y.length; k++) out[k] = out[k - 1] + 0.5 * (y[k] + y[k - 1]) * (t[k] - t[k - 1]);
    return out;
  }
  function lerpAt(t, y, tq) {
    const n = t.length;
    if (tq <= t[0]) return y[0];
    if (tq >= t[n - 1]) return y[n - 1];
    const dt = t[1] - t[0], i = Math.min(n - 2, Math.floor((tq - t[0]) / dt));
    const s = (tq - t[i]) / dt;
    return y[i] + (y[i + 1] - y[i]) * s;
  }
  /** A playback clock driven by requestAnimationFrame; only runs after an explicit Play. */
  function player(onFrame) {
    let raf = 0, last = 0;
    const api = { playing: false };
    function frame(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (onFrame(dt) === false) { api.stop(); return; }
      raf = requestAnimationFrame(frame);
    }
    api.start = function () { if (api.playing) return; api.playing = true; last = 0; raf = requestAnimationFrame(frame); };
    api.stop = function () { api.playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
    return api;
  }
  function playButton(onToggle) {
    const b = ui.button({ label: 'Play', kind: 'primary', icon: 'play' });
    b.setPlaying = function (on) {
      b.textContent = '';
      b.appendChild(ui.icon(on ? 'pause' : 'play'));
      b.appendChild(el('span', { class: 'btn-label' }, on ? 'Pause' : 'Play'));
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    b.addEventListener('click', onToggle);
    b.setPlaying(false);
    return b;
  }

  /* ================================================================ W6.1 torque-reaction turntable */

  function buildTurntable() {
    const w = parts('w-turntable');
    const Jb = DEF.J[1], T = 20, WHEEL_SLOW = 100;
    const tq = ui.slider({ id: 'w61-tau', label: 'Motor torque on the wheel', min: -TAU_MAX * 1000, max: TAU_MAX * 1000, step: 0.1, value: 1, unit: 'mN m', tag: 'project', help: 'Limited to the project’s ±' + TAU_MAX * 1000 + ' mN m.' });
    const prof = ui.segmented({ id: 'w61-profile', label: 'Torque profile', value: 'updown',
      options: [{ value: 'const', label: 'Constant' }, { value: 'pulse', label: '2 s pulse' }, { value: 'updown', label: 'Spin up, then brake' }] });
    const ts = ui.slider({ id: 'w61-t', label: 'Time', min: 0, max: T, step: 0.05, value: 0, unit: 's' });
    w.controls.appendChild(tq.el); w.controls.appendChild(prof.el); w.controls.appendChild(ts.el);
    const play = playButton(function () { if (clock.playing) { clock.stop(); play.setPlaying(false); } else { if (ts.value >= T) ts.set(0); clock.start(); play.setPlaying(true); } });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Playback (2× real time)'), play));

    // SVG: body (square bus) with the wheel inside, viewed along +y
    const S = 240, C = S / 2;
    const bodyG = svg('g', { class: 'tt-body' },
      svg('rect', { x: C - 82, y: C - 82, width: 164, height: 164, rx: 14, class: 'tt-bus' }),
      svg('rect', { x: C - 112, y: C - 14, width: 30, height: 28, class: 'tt-panel' }),
      svg('rect', { x: C + 82, y: C - 14, width: 30, height: 28, class: 'tt-panel' }),
      svg('path', { d: 'M' + C + ' ' + (C - 80) + ' l -9 16 h 18 z', class: 'tt-mark-body' }));
    const wheelG = svg('g', { class: 'tt-wheel' },
      svg('circle', { cx: C, cy: C, r: 52, class: 'tt-rim' }),
      svg('path', { d: 'M' + C + ' ' + C + ' L' + C + ' ' + (C - 50) + ' M' + C + ' ' + C + ' L' + (C + 43.3) + ' ' + (C + 25) + ' M' + C + ' ' + C + ' L' + (C - 43.3) + ' ' + (C + 25), class: 'tt-spokes' }),
      svg('circle', { cx: C, cy: C - 40, r: 6, class: 'tt-mark-wheel' }),
      svg('circle', { cx: C, cy: C, r: 6, class: 'tt-hub' }));
    const fig = svg('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'tt-svg', role: 'img', 'aria-label': 'Turntable: spacecraft body and reaction wheel' }, bodyG, wheelG);
    // the caption sits below the drawing because the rotating body sweeps almost the whole square
    const stage = el('div', { class: 'tt-stage' }, fig, el('p', { class: 'tt-caption' }, 'Viewed along +y; positive rates turn anticlockwise.'));
    const side = el('div', { class: 'tt-side' });
    const top = el('div', { class: 'tt-top' }, stage, side);
    w.out.appendChild(top);
    const set = readouts(side, ['t', 'Body rate', 'Wheel speed', 'Body momentum J·ω', 'Wheel momentum Iw·ωw', 'Total H']);
    const live = el('p', { class: 'status-line' });
    side.appendChild(live);
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div'), b3 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid); w.out.appendChild(b3);
    const M = { left: 56 };
    const pB = A.plot.line(b1, { height: 170, title: 'Body rate', xLabel: 't (s)', yLabel: 'ω (deg/s)', margin: M, series: [{ id: 'b', label: 'body', color: '--axis-y', width: 2, unit: 'deg/s' }] });
    const pW = A.plot.line(b2, { height: 170, title: 'Wheel speed', xLabel: 't (s)', yLabel: 'ωw (rpm)', margin: M, series: [{ id: 'w', label: 'wheel', color: '--accent', width: 2, unit: 'rpm' }] });
    const pH = A.plot.line(b3, { height: 190, title: 'Angular momentum about y', xLabel: 't (s)', yLabel: 'H (mN m s)', margin: M,
      series: [{ id: 'hb', label: 'body J·ω', color: '--axis-y', width: 2, unit: 'mN m s' }, { id: 'hw', label: 'wheel Iw·ωw', color: '--accent', dash: [6, 4], width: 2, unit: 'mN m s' },
        { id: 'H', label: 'total H', color: '--text', width: 2.5, unit: 'mN m s' }] });
    const plots = [pB, pW, pH];
    let res = null, thB = null, thW = null;
    // |H| below this (N m s) is floating-point rounding of a quantity that is exactly zero
    const H_ROUND = 1e-12;
    function totalText(hNms) { return Math.abs(hNms) < H_ROUND ? '0 (to rounding)' : f(hNms * 1000, { sig: 3, unit: 'mN m s' }); }

    function tauFn() {
      const v = tq.value / 1000, p = prof.value;
      if (p === 'const') return function () { return v; };
      if (p === 'pulse') return function (t) { return t < 2 ? v : 0; };
      return function (t) { return t < T / 2 ? v : -v; };
    }
    function compute() {
      res = guarded(w.out, function () { return A.sim.momentumExchange({ Jb: Jb, Iw: HW.Iw, tau: tauFn(), duration: T, dt: 0.01 }); });
      if (!res) return;
      const n = res.t.length, bd = new Float64Array(n), wr = new Float64Array(n), hb = new Float64Array(n), hw = new Float64Array(n), H = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        bd[k] = res.wBody[k] * R2D; wr[k] = res.wWheel[k] * RPM;
        hb[k] = Jb * res.wBody[k] * 1000; hw[k] = HW.Iw * res.wWheel[k] * 1000; H[k] = res.H[k] * 1000;
      }
      pB.set('b', res.t, bd); pW.set('w', res.t, wr);
      pH.set('hb', res.t, hb); pH.set('hw', res.t, hw); pH.set('H', res.t, H);
      thB = cumTrapz(res.t, res.wBody); thW = cumTrapz(res.t, res.wRel);
      let hMax = 0;
      for (let k = 0; k < n; k++) hMax = Math.max(hMax, Math.abs(res.H[k]));
      live.textContent = 'Largest |total H| over the run: ' + (hMax === 0 ? '0 (exactly)' : hMax < H_ROUND ? ui.fmtSci(hMax, 2) + ' N m s, which is rounding: H is conserved' : ui.fmtSci(hMax, 2) + ' N m s') + '. Peak wheel speed ' +
        f(Math.max.apply(null, Array.from(wr, Math.abs)), { sig: 3, unit: 'rpm' }) + '; peak body rate ' + f(Math.max.apply(null, Array.from(bd, Math.abs)), { sig: 3, unit: 'deg/s' }) + '.';
      show(ts.value);
    }
    function show(t) {
      if (!res) return;
      // the wheel rides on the body; its spin relative to the body is drawn WHEEL_SLOW times slower
      const ab = lerpAt(res.t, thB, t) * R2D, aw = lerpAt(res.t, thW, t) * R2D / WHEEL_SLOW;
      // positive rates turn anticlockwise on screen (SVG rotate is clockwise)
      bodyG.setAttribute('transform', 'rotate(' + (-ab).toFixed(2) + ' ' + C + ' ' + C + ')');
      wheelG.setAttribute('transform', 'rotate(' + (-(ab + aw)).toFixed(2) + ' ' + C + ' ' + C + ')');
      const wb = lerpAt(res.t, res.wBody, t), ww = lerpAt(res.t, res.wWheel, t);
      set([f(t, { fixed: 2, unit: 's' }), f(wb * R2D, { sig: 3, unit: 'deg/s' }), f(ww * RPM, { sig: 4, unit: 'rpm' }), f(Jb * wb * 1000, { sig: 3, unit: 'mN m s' }),
        f(HW.Iw * ww * 1000, { sig: 3, unit: 'mN m s' }), totalText(Jb * wb + HW.Iw * ww)]);
      plots.forEach(function (p) { p.setCursor(t); });
      fig.setAttribute('aria-label', 'Turntable at t = ' + f(t, { fixed: 1 }) + ' s: body rate ' + f(wb * R2D, { sig: 3 }) + ' deg/s, wheel ' + f(ww * RPM, { sig: 4 }) + ' rpm, in opposite directions.');
    }
    const clock = player(function (dt) {
      let t = ts.value + 2 * dt;
      if (t >= T) { t = T; ts.set(t); show(t); play.setPlaying(false); return false; }
      ts.set(t); show(t);
      return true;
    });
    ts.on('change', function (v) { show(v); });
    plots.forEach(function (p) { p.onSeek(function (x) { ts.set(x); show(x); }); });
    tq.on('change', ui.debounce(compute, 80));
    prof.on('change', compute);
    compute();
  }

  /* ================================================================ W6.2 wheel torque envelope */

  function buildEnvelope() {
    const w = parts('w-envelope');
    const m0 = HW.motor;
    const V = ui.slider({ id: 'w62-v', label: 'Bus voltage Vbus', min: 4, max: 16, step: 0.5, value: m0.V, unit: 'V', tag: 'illustrative' });
    const R = ui.slider({ id: 'w62-r', label: 'Winding resistance R', min: 1, max: 8, step: 0.1, value: m0.R, unit: 'Ω', tag: 'illustrative' });
    const K = ui.slider({ id: 'w62-k', label: 'Torque constant kM', min: 0.002, max: 0.012, step: 0.0005, value: m0.kM, unit: 'N m/A', tag: 'illustrative' });
    const I = ui.slider({ id: 'w62-i', label: 'Current limit Ilim', min: 0.1, max: 1.5, step: 0.05, value: m0.Ilim, unit: 'A', tag: 'illustrative' });
    const W0 = ui.slider({ id: 'w62-w0', label: 'Wheel speed at the start of the detumble', min: -1200, max: 1200, step: 10, value: 0, unit: 'rad/s', tag: 'illustrative' });
    const ov = ui.toggle({ id: 'w62-ov', label: 'Overlay a detumble (preset HIGHRATE, y axis)', checked: false, tag: 'project' });
    [V, R, K, I, W0, ov].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['Corner speed', 'No-load speed', 'Stall torque', 'Efficiency at the corner', 'Peak mechanical power', '3 mN m available up to']);
    const box = el('div');
    w.out.appendChild(box);
    const p = A.plot.line(box, { height: 250, title: 'Available motoring torque against wheel speed', xLabel: 'wheel speed |ωw| (rad/s)', yLabel: 'torque (mN m)', margin: { left: 56 },
      series: [{ id: 'avail', label: 'available torque', color: '--accent', width: 2.5, unit: 'mN m' }, { id: 'line', label: 'back-EMF line', color: '--text-2', dash: [5, 4], unit: 'mN m' }] });
    const status = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(status);
    let hr = null, pathIds = [];

    function wheelPath() {
      if (!hr) hr = guarded(w.out, function () { return A.sim.run(A.presets.get('HIGHRATE')); });
      if (!hr) return null;
      const n = hr.n, ww = new Float64Array(n), tauW = new Float64Array(n);
      let acc = W0.value;
      for (let k = 0; k < n; k++) {
        if (k > 0) acc -= 0.5 * (hr.tau[3 * (k - 1) + 1] + hr.tau[3 * k + 1]) * hr.dt / HW.Iw;
        ww[k] = acc;
        tauW[k] = -hr.tau[3 * k + 1];          // motor torque on the wheel
      }
      return { t: hr.t, ww: ww, tauW: tauW, n: n };
    }
    /** Split the motoring samples (|ωw|, |τ|) into runs that are monotonic in |ωw| for the line plot. */
    function runs(path, limit) {
      const out = [];
      let cur = null, dir = 0;
      for (let k = 0; k < path.n; k += 5) {
        const x = Math.abs(path.ww[k]), y = Math.abs(path.tauW[k]) * 1000;
        const motoring = path.tauW[k] * path.ww[k] > 0 || Math.abs(path.ww[k]) < 1e-9;
        if (!motoring || y < 1e-3) { cur = null; continue; }
        if (cur) {
          const last = cur.x[cur.x.length - 1], d = Math.sign(x - last);
          if (d !== 0 && dir !== 0 && d !== dir) { cur = null; }
          else if (d !== 0) dir = d;
        }
        if (!cur) { cur = { x: [], y: [] }; out.push(cur); dir = 0; }
        cur.x.push(x); cur.y.push(y);
        if (out.length > limit) break;
      }
      return out.filter(function (r) { return r.x.length > 1; }).map(function (r) {
        if (r.x[r.x.length - 1] < r.x[0]) { r.x.reverse(); r.y.reverse(); }
        return r;
      });
    }
    function update() {
      const v = V.value, r = R.value, k = K.value, il = I.value, ke = k;
      const w0 = v / ke, wc = Math.max(0, (v - il * r) / ke), tS = k * v / r, tCeil = k * il;
      const xMax = Math.max(1.05 * w0, 1.1 * Math.abs(W0.value) + 200);
      const N = 400, xs = new Float64Array(N + 1), ya = new Float64Array(N + 1), yl = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const x = xMax * i / N;
        xs[i] = x;
        const line = Math.max(0, k * (v - ke * x) / r);
        yl[i] = line * 1000;
        ya[i] = Math.min(tCeil, line) * 1000;
      }
      p.setX(0, xMax);
      p.set('avail', xs, ya); p.set('line', xs, yl);
      const need = TAU_MAX;
      const w3 = tCeil < need ? 0 : Math.max(0, (v - need * r / k) / ke);
      p.setLines({
        hlines: [{ y: need * 1000, label: '±' + need * 1000 + ' mN m (project box)', color: '--line-req' }, { y: tCeil * 1000, label: 'current limit ' + f(tCeil * 1000, { sig: 3 }) + ' mN m', color: '--line-thr', dash: [2, 3] }],
        vbands: [{ x0: w3, x1: xMax, color: '--band-fault' }],
        vlines: wc > 0 && wc < xMax ? [{ x: wc, label: 'corner', color: '--text-2' }] : []
      });
      p.setY({ min: 0, max: 1.6 * Math.max(tCeil, need) * 1000, auto: false });
      const pAtCorner = tCeil * wc, eta = wc > 0 ? ke * wc / v : 0;
      // peak mechanical power along the back-EMF line is at w0/2 (if that is beyond the corner)
      const wp = Math.max(wc, w0 / 2), pPeak = Math.min(tCeil, k * (v - ke * wp) / r) * wp;
      set([f(wc, { sig: 4, unit: 'rad/s' }) + ' (' + f(wc * RPM, { sig: 3, unit: 'rpm' }) + ')', f(w0, { sig: 4, unit: 'rad/s' }), f(tS * 1000, { sig: 3, unit: 'mN m' }) + ' at ' + f(v / r, { sig: 3, unit: 'A' }),
        f(100 * eta, { sig: 3 }) + '% (' + f(v * il, { sig: 3, unit: 'W' }) + ' in, ' + f(pAtCorner, { sig: 3, unit: 'W' }) + ' out)', f(pPeak, { sig: 3, unit: 'W' }) + ' at ' + f(wp, { sig: 4, unit: 'rad/s' }),
        tCeil < need ? 'never: the current limit is below 3 mN m' : f(w3, { sig: 4, unit: 'rad/s' })]);
      pathIds.forEach(function (id) { p.removeSeries(id); });
      pathIds = [];
      status.textContent = 'Shaded: speeds at which the motor cannot deliver the project’s 3 mN m in the direction of rotation.';
      if (ov.value) {
        const path = wheelPath();
        if (!path) return;
        const rr = runs(path, 40);
        rr.forEach(function (run, i) {
          const id = 'path' + i;
          pathIds.push(id);
          p.addSeries({ id: id, label: 'detumble demand', color: '--warn', width: 2.5, legend: i === 0, unit: 'mN m' });
          p.set(id, new Float64Array(run.x), new Float64Array(run.y));
        });
        let wMax = 0, short = 0, cnt = 0;
        for (let j = 0; j < path.n; j++) {
          const x = Math.abs(path.ww[j]);
          if (x > wMax) wMax = x;
          if (path.tauW[j] * path.ww[j] > 0) {
            const avail = Math.min(tCeil, Math.max(0, k * (v - ke * x) / r));
            cnt++;
            if (Math.abs(path.tauW[j]) > avail * (1 + 1e-9)) short++;
          }
        }
        status.textContent = 'Detumble overlay: the wheel reaches ' + f(wMax, { sig: 3, unit: 'rad/s' }) + ' (' + f(wMax * RPM, { sig: 3, unit: 'rpm' }) + '). ' +
          (short ? 'For ' + f(short * path.t[1], { sig: 2, unit: 's' }) + ' of the run the commanded torque is above what the motor can deliver: the ideal ±3 mN m box would over-promise.' :
            'Every motoring sample stays inside the envelope, so the ideal ±3 mN m box is honest for this detumble.');
      }
    }
    const go = ui.debounce(update, 60);
    [V, R, K, I, W0].forEach(function (c) { c.on('change', go); });
    ov.on('change', update);
    update();
  }

  /* ================================================================ W6.3 momentum bucket */

  function buildBucket() {
    const w = parts('w-bucket');
    const td = ui.slider({ id: 'w63-td', label: 'Disturbance torque |τd|', min: 0, max: 5e-5, step: 1e-6, value: Math.abs(DEF.disturbance[0]), unit: 'N m', tag: 'project', sig: 3 });
    const hm = ui.slider({ id: 'w63-hmax', label: 'Wheel capacity hmax', min: 0.005, max: 0.05, step: 0.001, value: HW.hmax, unit: 'N m s', tag: 'illustrative' });
    const mm = ui.slider({ id: 'w63-m', label: 'Magnetorquer dipole m', min: 0, max: 1, step: 0.01, value: HW.dipole, unit: 'A m²', tag: 'illustrative' });
    const dump = ui.toggle({ id: 'w63-dump', label: 'Dump with magnetorquer', checked: false, tag: 'illustrative' });
    const speed = ui.segmented({ id: 'w63-speed', label: 'Simulated seconds per real second', value: '50', options: [{ value: '10', label: '×10' }, { value: '50', label: '×50' }, { value: '200', label: '×200' }] });
    [td, hm, mm, dump, speed].forEach(function (c) { w.controls.appendChild(c.el); });
    const play = playButton(function () { if (clock.playing) { clock.stop(); play.setPlaying(false); } else { clock.start(); play.setPlaying(true); } });
    const reset = ui.button({ label: 'Reset', icon: 'reset' });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Simulation'), el('div', { class: 'btn-row' }, play, reset)));

    const H = 220, Wd = 160, top = 20, bot = 200;
    const fill = svg('rect', { x: 36, y: bot, width: 88, height: 0, class: 'bk-fill' });
    const level = svg('text', { x: 80, y: 110, class: 'bk-pct', 'text-anchor': 'middle' }, '0%');
    const drain = svg('path', { d: 'M124 186 h22 l-6 -6 m6 6 l-6 6', class: 'bk-drain' });
    const inflow = svg('path', { d: 'M80 2 v18 l-6 -6 m6 6 l6 -6', class: 'bk-in' });
    const bucket = svg('svg', { viewBox: '0 0 ' + Wd + ' ' + H, class: 'bk-svg', role: 'img', 'aria-label': 'Momentum bucket' },
      svg('path', { d: 'M34 ' + top + ' V' + (bot + 2) + ' H126 V' + top, class: 'bk-wall' }),
      fill, inflow, drain, level,
      svg('text', { x: 2, y: top + 8, class: 'bk-lab' }, 'hmax'),
      svg('line', { x1: 30, y1: top, x2: 130, y2: top, class: 'bk-max' }));
    const side = el('div', { class: 'bk-side' });
    w.out.appendChild(el('div', { class: 'bk-top' }, el('div', { class: 'bk-stage' }, bucket), side));
    const set = readouts(side, ['Simulated time', 'Stored momentum', 'Net fill rate', 'Time to saturation', 'Per 90-min orbit', 'Dipole needed to cancel τd']);
    const state = el('p', { class: 'status-line bk-state', 'aria-live': 'polite' });
    side.appendChild(state);
    const box = el('div');
    w.out.appendChild(box);
    const p = A.plot.line(box, { height: 180, title: 'Stored wheel momentum over one orbit', xLabel: 't (s)', yLabel: 'h (mN m s)', x: { min: 0, max: HW.orbit }, margin: { left: 56 },
      series: [{ id: 'ref', label: 'no dumping (from empty)', color: '--text-2', dash: [5, 4], unit: 'mN m s' }, { id: 'h', label: 'simulated hw', color: '--accent', width: 2.5, unit: 'mN m s' }] });
    function reference() {
      const N = 200, xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { xs[i] = HW.orbit * i / N; ys[i] = Math.min(td.value * xs[i], hm.value) * 1000; }
      p.set('ref', xs, ys);
    }

    let t = 0, h = 0, ts = [0], hs = [0], wasSat = false;
    function netRate() { return td.value - (dump.value ? mm.value * HW.B : 0); }
    function render() {
      const hmax = hm.value, frac = clamp(h / hmax, 0, 1);
      const hh = frac * (bot - top);
      fill.setAttribute('y', (bot - hh).toFixed(1));
      fill.setAttribute('height', hh.toFixed(1));
      fill.setAttribute('class', 'bk-fill' + (frac >= 1 ? ' full' : frac > 0.8 ? ' high' : ''));
      level.textContent = f(100 * frac, { sig: 3 }) + '%';
      drain.style.display = dump.value && mm.value > 0 ? '' : 'none';
      inflow.style.display = td.value > 0 ? '' : 'none';
      const rate = netRate();
      const tsat = rate > 0 ? (hmax - h) / rate : null;
      set([ui.fmtTime(t), f(h * 1000, { sig: 3, unit: 'mN m s' }), (rate >= 0 ? '+' : '') + ui.fmtSci(rate, 2) + ' N m s/s',
        frac >= 1 ? 'saturated' : tsat === null ? 'never (draining or balanced)' : ui.fmtTime(tsat),
        f(td.value * HW.orbit * 1000, { sig: 3, unit: 'mN m s' }) + ' (' + f(td.value * HW.orbit / hmax, { sig: 2 }) + '× capacity)', f(td.value / HW.B, { sig: 2, unit: 'A m²' })]);
      const sat = frac >= 1;
      state.textContent = '';
      state.appendChild(ui.badge(sat ? 'fail' : 'pass', sat ? 'Wheel saturated' : 'Wheel has headroom'));
      state.appendChild(document.createTextNode(sat ? ' The wheels cannot absorb more disturbance: attitude control is lost until momentum is dumped.' :
        (dump.value ? (rate < 0 ? ' The magnetorquer torque m·B = ' + ui.fmtSci(mm.value * HW.B, 2) + ' N m beats the disturbance.' : ' m·B = ' + ui.fmtSci(mm.value * HW.B, 2) + ' N m is too small to beat the disturbance.') : '')));
      if (sat && !wasSat) ui.announce('Wheel saturated at ' + ui.fmtTime(t));
      wasSat = sat;
      bucket.setAttribute('aria-label', 'Momentum bucket ' + f(100 * frac, { sig: 3 }) + '% full at ' + ui.fmtTime(t));
      p.set('h', new Float64Array(ts), new Float64Array(hs));
      p.setLines({ hlines: [{ y: hmax * 1000, label: 'hmax ' + f(hmax * 1000, { sig: 3 }) + ' mN m s', color: '--line-req' }] });
    }
    const clock = player(function (dt) {
      const sp = Number(speed.value), step = dt * sp;
      t += step;
      h = clamp(h + netRate() * step, 0, hm.value);
      ts.push(t); hs.push(h * 1000);
      if (t >= HW.orbit) { p.setX(0, Math.ceil(t / HW.orbit) * HW.orbit); }
      render();
      if (ts.length > 20000) { ts = ts.filter(function (_, i) { return i % 2 === 0; }); hs = hs.filter(function (_, i) { return i % 2 === 0; }); }
      return true;
    });
    reset.addEventListener('click', function () {
      clock.stop(); play.setPlaying(false);
      t = 0; h = 0; ts = [0]; hs = [0]; wasSat = false; p.setX(0, HW.orbit); render();
    });
    [td, hm, mm, dump].forEach(function (c) { c.on('change', function () { h = Math.min(h, hm.value); reference(); render(); }); });
    reference();
    render();
  }

  /* ================================================================ W6.4 clip vs scale */

  function buildClipScale() {
    const w = parts('w-clip-scale');
    const LIM = 6, BOX = TAU_MAX * 1000;
    const tx = ui.slider({ id: 'w64-tx', label: 'Commanded τx', min: -LIM, max: LIM, step: 0.1, value: 6, unit: 'mN m' });
    const ty = ui.slider({ id: 'w64-ty', label: 'Commanded τy', min: -LIM, max: LIM, step: 0.1, value: 1, unit: 'mN m' });
    const runB = ui.button({ label: 'Run HIGHRATE both ways', kind: 'primary', icon: 'play' });
    w.controls.appendChild(tx.el); w.controls.appendChild(ty.el);
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Full engine'), runB));

    const S = 300, PAD = 18, SC = (S - 2 * PAD) / (2 * 6.5);
    function X(v) { return S / 2 + v * SC; }
    function Y(v) { return S / 2 - v * SC; }
    const gridG = svg('g', { class: 'cs-grid' });
    for (let v = -6; v <= 6; v++) {
      gridG.appendChild(svg('line', { x1: X(v), y1: Y(-6.5), x2: X(v), y2: Y(6.5), class: v === 0 ? 'cs-axis' : 'cs-gridline' }));
      gridG.appendChild(svg('line', { x1: X(-6.5), y1: Y(v), x2: X(6.5), y2: Y(v), class: v === 0 ? 'cs-axis' : 'cs-gridline' }));
    }
    const boxR = svg('rect', { x: X(-BOX), y: Y(BOX), width: 2 * BOX * SC, height: 2 * BOX * SC, class: 'cs-box' });
    const cmdL = svg('line', { x1: X(0), y1: Y(0), class: 'cs-cmd' });
    const clipL = svg('line', { x1: X(0), y1: Y(0), class: 'cs-clip' });
    const scaleL = svg('line', { x1: X(0), y1: Y(0), class: 'cs-scale' });
    const projL = svg('line', { class: 'cs-proj' });
    const clipP = svg('circle', { r: 6, class: 'cs-clip-pt' });
    const scaleP = svg('rect', { width: 11, height: 11, class: 'cs-scale-pt' });
    const handle = svg('circle', { r: 10, class: 'cs-handle', tabindex: '0', role: 'slider', 'aria-label': 'Commanded torque: arrow keys move it, Shift for larger steps',
      'aria-valuemin': String(-LIM), 'aria-valuemax': String(LIM) });
    // keyboard focus ring: must directly follow the handle (CSS uses .cs-handle:focus-visible + .cs-handle-ring)
    const handleRing = svg('circle', { r: 15, class: 'cs-handle-ring', 'aria-hidden': 'true' });
    const plane = svg('svg', { viewBox: '0 0 ' + S + ' ' + S, class: 'cs-svg', 'aria-labelledby': 'w64-cap' },
      gridG, boxR,
      svg('text', { x: X(BOX) + 4, y: Y(BOX) - 4, class: 'cs-lab' }, '±' + BOX + ' mN m box'),
      svg('text', { x: X(6.5) - 4, y: Y(0) + 14, class: 'cs-lab', 'text-anchor': 'end' }, 'τx'),
      svg('text', { x: X(0) + 6, y: Y(6.5) + 12, class: 'cs-lab' }, 'τy'),
      projL, scaleL, clipL, cmdL, scaleP, clipP, handle, handleRing);
    const legend = el('ul', { class: 'cs-legend' },
      el('li', null, el('span', { class: 'sw cs-sw-cmd', 'aria-hidden': 'true' }), 'command (drag the handle)'),
      el('li', null, el('span', { class: 'sw cs-sw-clip', 'aria-hidden': 'true' }), 'clipped per axis (circle)'),
      el('li', null, el('span', { class: 'sw cs-sw-scale', 'aria-hidden': 'true' }), 'scaled, direction kept (square)'));
    const stage = el('div', { class: 'cs-stage' }, plane, el('p', { class: 'visually-hidden', id: 'w64-cap' }, 'Torque plane from −6.5 to 6.5 mN m with the ±3 mN m box, the commanded vector, its clipped point and its scaled point.'), legend);
    const tableBox = el('div', { class: 'cs-side' });
    w.out.appendChild(el('div', { class: 'cs-top' }, stage, tableBox));
    const runBox = el('div');
    w.out.appendChild(runBox);

    function ang(x, y) { return Math.atan2(y, x) * R2D; }
    function vec(v) { return '[' + f(v[0], { fixed: 2 }) + ', ' + f(v[1], { fixed: 2 }) + ']'; }
    function update() {
      const c = [tx.value, ty.value];
      const clip = A.ctrl.saturate([c[0] / 1000, c[1] / 1000, 0], TAU_MAX, 'clip').map(function (v) { return v * 1000; });
      const scl = A.ctrl.saturate([c[0] / 1000, c[1] / 1000, 0], TAU_MAX, 'scale').map(function (v) { return v * 1000; });
      cmdL.setAttribute('x2', X(c[0])); cmdL.setAttribute('y2', Y(c[1]));
      clipL.setAttribute('x2', X(clip[0])); clipL.setAttribute('y2', Y(clip[1]));
      scaleL.setAttribute('x2', X(scl[0])); scaleL.setAttribute('y2', Y(scl[1]));
      projL.setAttribute('x1', X(c[0])); projL.setAttribute('y1', Y(c[1])); projL.setAttribute('x2', X(clip[0])); projL.setAttribute('y2', Y(clip[1]));
      clipP.setAttribute('cx', X(clip[0])); clipP.setAttribute('cy', Y(clip[1]));
      scaleP.setAttribute('x', X(scl[0]) - 5.5); scaleP.setAttribute('y', Y(scl[1]) - 5.5);
      handle.setAttribute('cx', X(c[0])); handle.setAttribute('cy', Y(c[1]));
      handleRing.setAttribute('cx', X(c[0])); handleRing.setAttribute('cy', Y(c[1]));
      handle.setAttribute('aria-valuenow', String(c[0]));
      handle.setAttribute('aria-valuetext', 'τx ' + f(c[0], { fixed: 1 }) + ', τy ' + f(c[1], { fixed: 1 }) + ' mN m');
      const nC = Math.hypot(c[0], c[1]);
      /** Angle (deg) between the command and v. */
      function turn(v) {
        const n = Math.hypot(v[0], v[1]);
        return nC > 1e-9 && n > 1e-9 ? Math.abs(((ang(v[0], v[1]) - ang(c[0], c[1]) + 540) % 360) - 180) : 0;
      }
      function row(name, v) {
        return [name, vec(v), f(Math.hypot(v[0], v[1]), { fixed: 2 }), nC > 1e-9 ? f(ang(v[0], v[1]), { fixed: 1, unit: '°' }) : '–', f(turn(v), { fixed: 1, unit: '°' }), f(Math.hypot(v[0] - c[0], v[1] - c[1]), { fixed: 2 })];
      }
      tableBox.textContent = '';
      tableBox.appendChild(ui.table([{ key: 'n', label: 'Torque' }, { key: 'v', label: 'τ (mN m)', num: true }, { key: 'm', label: '|τ|', num: true }, { key: 'a', label: 'Angle off x', num: true },
        { key: 'd', label: 'Turned by', num: true }, { key: 'e', label: 'Distance to command', num: true }], [row('Command', c), row('Clipped', clip), row('Scaled', scl)],
      { caption: 'Command and the two feasible torques', rowHeaders: true, compact: true }));
      const inside = Math.abs(c[0]) <= BOX && Math.abs(c[1]) <= BOX;
      const dClip = Math.hypot(clip[0] - c[0], clip[1] - c[1]), dScl = Math.hypot(scl[0] - c[0], scl[1] - c[1]), tClip = turn(clip);
      let msg;
      if (inside) msg = 'The command is inside the box: both methods pass it through unchanged.';
      // clipping keeps the direction only along an axis or on a diagonal of the box, where it gives the scaled point
      else if (tClip < 0.05) msg = 'Here clipping and scaling coincide: the command lies along an axis or on a diagonal of the box, so clipping does not turn it. Both are ' + f(dClip, { fixed: 2 }) + ' mN m from the command.';
      else msg = 'Clipping is ' + f(dClip, { fixed: 2 }) + ' mN m from the command but turns it by ' + f(tClip, { fixed: 1, unit: '°' }) + '; scaling is ' + f(dScl, { fixed: 2 }) + ' mN m away and keeps the direction.';
      tableBox.appendChild(el('p', { class: 'status-line' }, msg));
    }
    function fromPointer(e) {
      const r = plane.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * S, sy = (e.clientY - r.top) / r.height * S;
      tx.set(Math.round(clamp((sx - S / 2) / SC, -LIM, LIM) * 10) / 10);
      ty.set(Math.round(clamp((S / 2 - sy) / SC, -LIM, LIM) * 10) / 10);
      update();
    }
    let dragging = false;
    plane.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { plane.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      fromPointer(e);
    });
    plane.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
    ['pointerup', 'pointercancel'].forEach(function (evt) { plane.addEventListener(evt, function () { dragging = false; }); });
    handle.addEventListener('keydown', function (e) {
      const st = e.shiftKey ? 1 : 0.1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowRight') dx = st; else if (e.key === 'ArrowLeft') dx = -st;
      else if (e.key === 'ArrowUp') dy = st; else if (e.key === 'ArrowDown') dy = -st;
      else return;
      e.preventDefault();
      tx.set(Math.round(clamp(tx.value + dx, -LIM, LIM) * 10) / 10);
      ty.set(Math.round(clamp(ty.value + dy, -LIM, LIM) * 10) / 10);
      update();
    });
    tx.on('change', update); ty.on('change', update);
    update();

    runB.addEventListener('click', function () {
      guarded(runBox, function () {
        const rs = ['clip', 'scale'].map(function (mode) { return A.sim.run(A.params.merge(A.presets.get('HIGHRATE'), { saturation: mode })); });
        runBox.textContent = '';
        const rows = rs.map(function (r, i) {
          const m = r.metrics, sh = r.events.filter(function (e) { return e.to === A.modes.SH; })[0];
          return [i ? "'scale' (site option)" : "'clip' (project)", f(m.detumble[0], { fixed: 2, unit: 's' }), f(m.peakRate, { fixed: 2, unit: 'deg/s' }), sh ? f(sh.t, { fixed: 2, unit: 's' }) : '–',
            m.settle === null ? '–' : f(m.settle, { fixed: 2, unit: 's' }), f(100 * m.satFrac, { sig: 2 }) + '%'];
        });
        runBox.appendChild(ui.table([{ key: 'm', label: 'Saturation' }, { key: 'd', label: 'Detumble time', num: true }, { key: 'p', label: 'Peak rate', num: true },
          { key: 'h', label: 'Enters SAFE_HOLD', num: true }, { key: 's', label: 'Settling', num: true }, { key: 'f', label: 'Steps saturated', num: true }], rows,
        { caption: 'Preset HIGHRATE (|ω₀| = 13.86 deg/s), full engine', rowHeaders: true, compact: true }));
        const b = el('div');
        runBox.appendChild(b);
        const pl = A.plot.line(b, { height: 180, title: 'Rate norm during the detumble', xLabel: 't (s)', yLabel: '|ω| (deg/s)', x: { min: 0, max: 8 }, margin: { left: 56 },
          series: [{ id: 'clip', label: 'clip (project)', color: '--axis-x', width: 2, unit: 'deg/s' }, { id: 'scale', label: 'scale (site option)', color: '--axis-z', dash: [6, 4], width: 2, unit: 'deg/s' }],
          hlines: [{ y: DEF.safeMode.exitRateDeg, label: DEF.safeMode.exitRateDeg + ' deg/s threshold', color: '--line-thr' }] });
        pl.set('clip', rs[0].t, rs[0].rateDeg); pl.set('scale', rs[1].t, rs[1].rateDeg);
        runBox.appendChild(el('p', { class: 'status-line' }, 'Scaling never uses the full torque on the less-loaded axes, so it detumbles a little more slowly; per-axis clipping wins on speed here, at the cost of turning the torque vector.'));
        ui.announce('HIGHRATE runs finished.');
      });
    });
  }

  /* ================================================================ W6.5 Stribeck zero-crossing */

  function buildStribeck() {
    const w = parts('w-stribeck');
    const F = HW.friction;
    const sp = ui.slider({ id: 'w65-w', label: 'Wheel speed ωw', min: -50, max: 50, step: 0.5, value: 20, unit: 'rad/s' });
    const Ts = ui.slider({ id: 'w65-ts', label: 'Static (breakaway) torque Ts', min: 0.12, max: 0.5, step: 0.01, value: F.Ts * 1000, unit: 'mN m', tag: 'illustrative' });
    const Tc = ui.slider({ id: 'w65-tc', label: 'Coulomb torque Tc', min: 0.02, max: 0.3, step: 0.01, value: F.Tc * 1000, unit: 'mN m', tag: 'illustrative' });
    [sp, Ts, Tc].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['Friction at this speed', 'Jump through zero (2Ts)', 'Against the disturbance bound', 'Share of τmax']);
    const box = el('div');
    w.out.appendChild(box);
    const bound = A.mc.DEFAULTS.distBound * 1000;
    const p = A.plot.line(box, { height: 220, title: 'Bearing friction torque τf(ωw)', xLabel: 'ωw (rad/s)', yLabel: 'τf (mN m)', margin: { left: 56 },
      series: [{ id: 'tf', label: 'friction', color: '--accent', width: 2.2, unit: 'mN m' }],
      bands: [{ y0: -bound, y1: bound, color: '--band-ok' }],
      hlines: [{ y: bound, label: '±' + f(bound, { sig: 2 }) + ' mN m disturbance bound', color: '--line-thr', dash: [2, 3] }, { y: -bound, color: '--line-thr', dash: [2, 3] }] });
    function tf(wv, ts, tc) {
      if (wv === 0) return 0;
      return Math.sign(wv) * (tc + (ts - tc) * Math.exp(-Math.pow(wv / F.ws, 2))) + F.cv * wv;
    }
    function update() {
      const ts = Ts.value / 1000, tc = Tc.value / 1000;
      const xs = [], ys = [];
      for (let i = -500; i <= 500; i++) {
        const x = i / 10;
        if (i === 0) { xs.push(-1e-6); ys.push(tf(-1e-6, ts, tc) * 1000); xs.push(1e-6); ys.push(tf(1e-6, ts, tc) * 1000); continue; }
        xs.push(x); ys.push(tf(x, ts, tc) * 1000);
      }
      p.set('tf', new Float64Array(xs), new Float64Array(ys));
      p.setCursor(sp.value);
      const now = tf(sp.value, ts, tc) * 1000;
      set([f(now, { sig: 3, unit: 'mN m' }), f(2 * ts * 1000, { sig: 3, unit: 'mN m' }), f(2 * ts * 1000 / bound, { sig: 2 }) + '× the bound', f(100 * ts / TAU_MAX, { sig: 2 }) + '% of τmax (per side)']);
      p.summary('Friction torque against wheel speed from −50 to 50 rad/s; it jumps by ' + f(2 * ts * 1000, { sig: 3 }) + ' mN m through zero, ' + f(2 * ts * 1000 / bound, { sig: 2 }) + ' times the disturbance bound.');
    }
    // keep Ts >= Tc by moving the other slider, so the readouts always match both controls
    const later = ui.debounce(update, 40);
    Ts.on('change', function () { if (Ts.value < Tc.value) Tc.set(Ts.value); later(); });
    Tc.on('change', function () { if (Tc.value > Ts.value) Ts.set(Tc.value); later(); });
    sp.on('change', update);
    p.onSeek(function (x) { sp.set(Math.round(x * 2) / 2); update(); });
    update();
  }

  /* ================================================================ derived numbers in the prose */

  function fillCalc() {
    const r = HW.rim;
    const sigma = r.rho * r.w * r.w * r.r * r.r;
    ui.qsa('.calc[data-calc="hoop"]').forEach(function (s) {
      s.textContent = 'For a steel rim of ' + r.r * 1000 + ' mm radius at ' + r.w + ' rad/s that is about ' + f(sigma / 1e6, { sig: 2 }) + ' MPa';
    });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm06' });
    fillCalc();
    buildTurntable();
    buildEnvelope();
    buildBucket();
    buildClipScale();
    buildStribeck();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'Spinning a reaction wheel up with +τ about z makes the body…',
        options: ['accelerate with +τ.', 'stay still.', 'accelerate with −τ about z.'], correct: 2,
        explain: 'The motor torque is internal: whatever it gives the wheel, it takes from the body. Total momentum is conserved, so \\(\\tau_c=-\\dot h_w\\) and the body turns the other way.' },
      { q: 'Why is the wheel modelled as an ideal torque source?',
        options: ['The current loop (~0.1 ms) is far faster than the attitude dynamics (~1 s).', 'Wheels have no inertia.', 'Saturation removes dynamics.'], correct: 0,
        explain: 'The winding’s electrical time constant L/R is about 0.125 ms, against \\(J/K_d\\approx1\\) s for the attitude loop: four orders of magnitude apart, so the torque appears effectively at once.' },
      { q: 'A constant \\(2\\times10^{-5}\\) N m disturbance on a 0.01 N m s wheel saturates it in about…',
        options: ['5 s.', '500 s.', '5 days.'], correct: 1,
        explain: '\\(t_{sat}=h_{max}/|\\tau_d|=0.01/(2\\times10^{-5})=500\\) s, under a tenth of an orbit, which is why wheels need regular momentum unloading.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm06');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
