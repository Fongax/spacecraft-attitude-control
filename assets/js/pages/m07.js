/**
 * m07.js: Module 07, sensors and estimation, an extension (package P5).
 * Widgets: W7.1 gyro-only drift, W7.2 one-axis Kalman playground, W7.3 full-simulation
 * extension, W7.4 fault-alarm base rate. Sensor defaults, thresholds and presets come from
 * ADCS.params / ADCS.presets; every result is computed live in the browser.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const D2R = A.units.D2R, R2D = A.units.R2D;
  const DEF = A.params.DEFAULTS;
  const LIM = A.params.LIMITS;
  const SM = DEF.safeMode;
  const MINUS = '\u2212';

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
  }
  /** Run fn, showing a RangeError from the engine inline in box; other errors propagate. */
  function guarded(box, fn) {
    ui.clearError(box);
    try { return fn(); } catch (err) {
      if (err instanceof RangeError) { ui.showError(box, err); return null; }
      throw err;
    }
  }
  /** A <dl class="readouts"> with one dd per label; returns a setter taking an array of strings. */
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
  function f(x, o) { return ui.fmt(x, o); }
  function deg(x, sig) { return f(x, { sig: sig || 3, unit: '°' }); }
  function pct(p) {
    if (!isFinite(p)) return '–';
    const v = 100 * p;
    if (v >= 99.995) return '> 99.99%';
    if (v < 0.01) return f(v, { sig: 2 }) + '%';
    return f(v, { sig: v < 1 ? 2 : 3 }) + '%';
  }
  /** ui.fmtTime, rounded to whole seconds above a minute. LOCAL (request P0): fmtTime(719.9999) gives "11 min 60 s". */
  function fmtT(t) { return ui.fmtTime(isFinite(t) && Math.abs(t) >= 60 ? Math.round(t) : t); }
  function minutes(s) {
    if (s === null || !isFinite(s)) return 'never';
    return fmtT(s);
  }
  /** Add the tooltip text to static honesty tags written in the HTML. */
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
  }
  /** Give static callouts in the HTML the same icon column as ui.callout. */
  function iconiseCallouts(scope) {
    const map = { info: 'info', warn: 'warn', ext: 'ext', error: 'warn' };
    ui.qsa('.callout', scope).forEach(function (c) {
      if (c.querySelector(':scope > .callout-icon')) return;
      const kind = Object.keys(map).find(function (k) { return c.classList.contains(k); }) || 'info';
      const ic = ui.icon(map[kind]);
      ic.classList.add('callout-icon');
      c.insertBefore(ic, c.firstChild);
    });
  }
  function axisSeries(arr, n, scale) {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = arr[k] * scale;
    return out;
  }
  function faultWindows(r) {
    const out = [];
    let s = -1;
    for (let k = 0; k <= r.n; k++) {
      const on = k < r.n && r.fault[k];
      if (on && s < 0) s = k;
      if (!on && s >= 0) { out.push({ t0: r.t[s], t1: r.t[Math.min(k, r.n - 1)] }); s = -1; }
    }
    return out;
  }
  function linkCursors(plots) {
    plots.forEach(function (p) { p.onSeek(function (x) { plots.forEach(function (q) { q.setCursor(x); }); }); });
  }

  /* ================================================================ W7.1 gyro-only drift */

  function buildDrift() {
    const w = parts('w-gyro-drift');
    const stSigma = DEF.sensors.stNoiseDeg;
    const bias = ui.slider({ id: 'w71-bias', label: 'Gyro bias b', min: 0, max: 20, step: 0.5, value: 10, unit: 'deg/h', tag: 'illustrative' });
    const arw = ui.slider({ id: 'w71-arw', label: 'Angle random walk', min: 0, max: 0.5, step: 0.01, value: 0.1, unit: 'deg/√h', tag: 'illustrative' });
    const dur = ui.slider({ id: 'w71-dur', label: 'Duration', min: 1, max: 30, step: 1, value: 20, unit: 'min' });
    const fix = ui.toggle({ id: 'w71-fix', label: 'Star-tracker fix every N s', checked: false, tag: 'extension',
      help: 'Each fix is the true angle plus the site star-tracker noise (σ ' + stSigma + '°).' });
    const every = ui.slider({ id: 'w71-every', label: 'Fix interval N', min: 1, max: 60, step: 1, value: 10, unit: 's' });
    const reseed = ui.button({ label: 'New noise sample', kind: 'ghost', icon: 'reset', small: true });
    [bias, arw, dur, fix, every].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Random noise'), el('div', { class: 'btn-row' }, reseed)));

    const set = readouts(w.out, ['Time to 2°, bias alone', 'Time to 2°, this run', 'Error at the end, gyro only', 'Worst error with fixes', 'Bias learnt by the filter']);
    const band = LIM.errDeg;
    const KF_SERIES = { id: 'kf', label: 'with fixes (filter)', color: '--accent', width: 2, unit: 'deg' };
    const p = A.plot.line(w.out, { height: 230, title: 'Attitude estimate error (truth is 0°)', xLabel: 't (min)', yLabel: 'error (deg)', margin: { left: 56 },
      series: [
        { id: 'gyro', label: 'gyro only', color: '--axis-x', width: 1.5, unit: 'deg' },
        { id: 'env', label: 'b·t + ARW·√t', color: '--text-2', dash: [5, 4], unit: 'deg' }
      ],
      bands: [{ y0: -band, y1: band, color: '--band-ok' }],
      hlines: [{ y: band, label: '±' + band + '° (REQ-F2 band)', color: '--line-req', dash: [5, 4] }, { y: -band, color: '--line-req', dash: [5, 4] }] });
    let seed = 7;

    function run() {
      every.disable(!fix.value);
      const dt = 0.5;
      const n = Math.round(dur.value * 60 / dt) + 1;
      const bRad = bias.value / 3600 * D2R;                 // rad/s
      const Nrad = arw.value / 60 * D2R;                     // rad/√s
      const sw = Nrad / Math.sqrt(dt);                       // per-sample rate noise (rad/s)
      const sst = stSigma * D2R;
      const gs = A.rng.gaussianStream(seed), gz = A.rng.gaussianStream(seed + 1000);
      const kf = A.est.createAxisKF({ sgRad: sw, sbRad: 1e-7, sstRad: sst, dt: dt, P0: [Math.pow(0.01 * D2R, 2), Math.pow(0.02 * D2R, 2)] });
      const m = Math.max(1, Math.round(every.value / dt));
      const tMin = new Float64Array(n), eg = new Float64Array(n), env = new Float64Array(n), ek = new Float64Array(n);
      let th = 0, cross = null, worst = 0, firstFix = null;
      for (let k = 0; k < n; k++) {
        const t = k * dt;
        tMin[k] = t / 60;
        eg[k] = th * R2D;
        env[k] = (bRad * t + Nrad * Math.sqrt(t)) * R2D;
        if (cross === null && Math.abs(eg[k]) >= band) cross = t;
        if (fix.value) {
          if (k > 0 && k % m === 0) { kf.update(sst * gz.next()); if (firstFix === null) firstFix = k; }
          const e = kf.state().theta * R2D;
          ek[k] = e;
          if (firstFix !== null && k > firstFix) worst = Math.max(worst, Math.abs(e));
        }
        const wm = bRad + sw * gs.next();
        th += wm * dt;
        if (fix.value) kf.predict(wm);
      }
      p.set('gyro', tMin, eg);
      p.set('env', tMin, env);
      if (fix.value) { p.addSeries(KF_SERIES); p.set('kf', tMin, ek); } else p.removeSeries('kf');
      const tBias = bRad > 0 ? band * D2R / bRad : null;
      const bLearnt = fix.value ? kf.state().bias / D2R * 3600 : null;
      set([
        minutes(tBias),
        cross === null ? 'not within ' + dur.value + ' min' : minutes(cross),
        deg(eg[n - 1]),
        fix.value ? (firstFix === null ? 'no fix yet' : deg(worst, 2) + ' after the first fix') : 'fixes off',
        fix.value ? f(bLearnt, { sig: 3, unit: 'deg/h' }) + ' (true ' + f(bias.value, { sig: 3, unit: 'deg/h' }) + ')' : 'fixes off'
      ]);
      p.summary('Gyro-only error after ' + dur.value + ' min: ' + deg(eg[n - 1]) + '; ' + (cross === null ? 'it stays inside ±2°.' : 'it crosses 2° at ' + fmtT(cross) + '.') +
        (fix.value ? ' With a fix every ' + every.value + ' s the worst error after the first fix is ' + deg(worst, 2) + '.' : ''));
    }
    const go = ui.debounce(run, 60);
    [bias, arw, dur, every].forEach(function (c) { c.on('change', go); });
    fix.on('change', run);
    reseed.addEventListener('click', function () { seed += 1; run(); });
    run();
  }

  /* ================================================================ W7.5 sensor fusion à la vestibular system */

  function buildVestibular() {
    const w = parts('w-vestibular');
    const BANK = 15, OUT_RATE = 7.5, HOLD = 20, LEVEL = 40, T0 = 5;      // deg, deg/s, s (illustrative profile)
    const tauS = ui.slider({ id: 'w75-tau', label: 'Canal time constant τ', min: 2, max: 20, step: 0.5, value: 6, unit: 's', tag: 'illustrative' });
    const thr = ui.slider({ id: 'w75-thr', label: 'Detection threshold', min: 0, max: 3, step: 0.1, value: 2, unit: 'deg/s', tag: 'illustrative',
      help: 'A felt rate smaller than this goes unnoticed (a dead zone on the canal output).' });
    const rin = ui.slider({ id: 'w75-rin', label: 'Roll-in rate', min: 0.25, max: 5, step: 0.05, value: 0.75, unit: 'deg/s',
      help: 'The craft rolls into ' + BANK + '° of bank at this rate, holds it for ' + HOLD + ' s, then rolls back to level at ' + OUT_RATE + ' deg/s.' });
    const fuse = ui.toggle({ id: 'w75-fuse', label: 'Fuse with an absolute reference (outside horizon)', checked: false });
    const tauC = ui.slider({ id: 'w75-tauc', label: 'Fusion time constant τc', min: 0.5, max: 20, step: 0.5, value: 3, unit: 's' });
    const sRef = ui.slider({ id: 'w75-sref', label: 'Reference noise σ', min: 0, max: 2, step: 0.05, value: 0.5, unit: 'deg', tag: 'illustrative' });
    [tauS, thr, rin, fuse, tauC, sRef].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['Felt bank at the end of the hold (truth ' + BANK + '°)', 'False bank felt after the roll-out (truth 0°)', 'Peak felt rate during the roll-in', 'Worst error of the fused estimate']);
    const FUSED = { id: 'fused', label: 'fused with the horizon', color: '--accent', width: 2, unit: 'deg' };
    const p = A.plot.line(w.out, { height: 220, title: 'Bank angle: true and perceived', xLabel: 't (s)', yLabel: 'bank (deg)', margin: { left: 56 }, y: { symmetric: true, pad: 0.15 },
      series: [{ id: 'truth', label: 'true bank', color: '--text', width: 2, unit: 'deg' }, { id: 'felt', label: 'felt (canals alone)', color: '--warn', width: 2, dash: [6, 3], unit: 'deg' }],
      hlines: [{ y: 0, color: '--text-2', dash: [2, 3] }] });
    const words = el('p', { class: 'status-line m07-words', 'aria-live': 'polite' });
    w.out.appendChild(words);

    function run() {
      tauC.disable(!fuse.value); sRef.disable(!fuse.value);
      const dt = 0.02, tau = tauS.value, th = thr.value, r = rin.value;
      const t1 = T0 + BANK / r, t2 = t1 + HOLD, t3 = t2 + BANK / OUT_RATE, T = t3 + LEVEL;
      const n = Math.round(T / dt) + 1;
      const a = tau / (tau + dt);
      const gs = A.rng.gaussianStream(21);
      const t = new Float64Array(n), phi = new Float64Array(n), felt = new Float64Array(n), fused = new Float64Array(n);
      let wPrev = 0, wp = 0, ph = 0, phF = 0, phH = 0, peakIn = 0, falseBank = 0, worst = 0, atHold = 0;
      for (let k = 0; k < n; k++) {
        const tk = k * dt;
        const wTrue = tk < T0 ? 0 : tk < t1 ? r : tk < t2 ? 0 : tk < t3 ? -OUT_RATE : 0;
        if (k > 0) {
          ph += wTrue * dt;
          wp = a * (wp + wTrue - wPrev);                       // first-order high-pass on rate
          const wf = Math.abs(wp) >= th ? wp : 0;              // detection threshold (dead zone)
          phF += wf * dt;
          const z = ph + sRef.value * gs.next();
          phH += (wf + (z - phH) / tauC.value) * dt;
          if (tk < t1) peakIn = Math.max(peakIn, Math.abs(wp));
        }
        wPrev = wTrue;
        t[k] = tk; phi[k] = ph; felt[k] = phF; fused[k] = phH;
        if (tk < t2) atHold = phF;
        if (tk >= t3 && Math.abs(phF - ph) > Math.abs(falseBank)) falseBank = phF - ph;
        if (tk >= T0) worst = Math.max(worst, Math.abs(phH - ph));
      }
      p.set('truth', t, phi); p.set('felt', t, felt);
      if (fuse.value) { p.addSeries(FUSED); p.set('fused', t, fused); } else p.removeSeries('fused');
      p.setLines({ vlines: [{ x: t2, label: 'roll-out', color: '--text-2', dash: [2, 3] }] });
      const sensed = peakIn >= th;
      const fb = deg(Math.abs(falseBank), 3) + (Math.abs(falseBank) < 0.05 ? '' : falseBank < 0 ? ' the opposite way' : ' the same way');
      set([deg(atHold, 3), fb, f(peakIn, { sig: 3, unit: 'deg/s' }) + (sensed ? ' (above the threshold)' : ' (below the threshold)'),
        fuse.value ? deg(worst, 3) : 'fusion off']);
      words.textContent = (sensed ? 'The roll-in is felt, at least at first. ' : 'The roll-in never crosses the detection threshold, so it is not felt at all. ') +
        'At the end of the hold the craft is banked ' + BANK + '° but feels banked ' + deg(atHold, 3) + '; after the roll-out it is level but feels banked ' + fb + '.' +
        (fuse.value ? ' With the horizon fused in, the estimate is never more than ' + deg(worst, 3) + ' from the truth.' : ' Switch on the horizon to correct it.');
      p.summary('True bank rises to ' + BANK + '° and returns to level. Felt bank at the end of the hold ' + deg(atHold, 3) + ', false bank after the roll-out ' + fb + '.' +
        (fuse.value ? ' Fused estimate worst error ' + deg(worst, 3) + '.' : ''));
    }
    const go = ui.debounce(run, 60);
    [tauS, thr, rin, tauC, sRef].forEach(function (c) { c.on('change', go); });
    fuse.on('change', run);
    run();
  }

  /* ================================================================ W7.2 one-axis Kalman playground */

  function buildKalman1D() {
    const w = parts('w-kalman-1d');
    const sg = ui.slider({ id: 'w72-sg', label: 'Gyro noise σg', min: 0, max: 0.5, step: 0.01, value: 0.05, unit: 'deg/s', tag: 'illustrative', help: 'Standard deviation of each gyro sample.' });
    const gb = ui.slider({ id: 'w72-gb', label: 'Gyro bias b', min: -0.5, max: 0.5, step: 0.01, value: 0.2, unit: 'deg/s', tag: 'illustrative' });
    const sa = ui.slider({ id: 'w72-sa', label: 'Absolute sensor noise σa', min: 0.01, max: 3, step: 0.01, value: 0.5, unit: 'deg', tag: 'illustrative' });
    const rate = ui.slider({ id: 'w72-rate', label: 'Absolute sensor rate', min: 0.2, max: 10, step: 0.1, value: 2, unit: 'Hz' });
    const qs = ui.slider({ id: 'w72-q', label: 'Filter Q scale', min: 0.01, max: 100, value: 1, log: true, unit: '×', help: 'The gyro variance the filter assumes, as a multiple of the true one.' });
    const rs = ui.slider({ id: 'w72-r', label: 'Filter R scale', min: 0.01, max: 100, value: 1, log: true, unit: '×', help: 'The sensor variance the filter assumes, as a multiple of the true one.' });
    const al = ui.slider({ id: 'w72-alpha', label: 'Complementary α', min: 0.5, max: 0.995, step: 0.005, value: 0.9 });
    const cfb = ui.toggle({ id: 'w72-cfb', label: 'Complementary bias correction', checked: false, help: 'Adds the bias state b̂ ← b̂ − k_b r.' });
    [sg, gb, sa, rate, qs, rs, al, cfb].forEach(function (c) { w.controls.appendChild(c.el); });

    const set = readouts(w.out, ['Kalman RMS error', 'Complementary RMS error', 'Kalman bias estimate', 'Steady gain K₁', 'Complementary τ', 'Expected offset b·τ']);
    const M = { left: 56 };
    const p1 = A.plot.line(w.out, { height: 220, title: 'Angle: truth and estimates', xLabel: 't (s)', yLabel: 'θ (deg)', margin: M,
      series: [
        { id: 'meas', label: 'absolute sensor (held)', color: '--text-2', width: 1, alpha: 0.45, unit: 'deg' },
        { id: 'truth', label: 'truth', color: '--text', width: 2, unit: 'deg' },
        { id: 'kf', label: 'Kalman', color: '--accent', width: 1.5, unit: 'deg' },
        { id: 'cf', label: 'complementary', color: '--warn', width: 1.5, dash: [6, 3], unit: 'deg' }
      ] });
    const p2 = A.plot.line(w.out, { height: 200, title: 'Estimation error', xLabel: 't (s)', yLabel: 'error (deg)', margin: M, y: { symmetric: true },
      series: [
        { id: 'ekf', label: 'Kalman', color: '--accent', width: 1.5, unit: 'deg' },
        { id: 'ecf', label: 'complementary', color: '--warn', width: 1.5, dash: [6, 3], unit: 'deg' },
        { id: 'p3', label: '±3√P₁₁', color: '--text-2', dash: [2, 3], unit: 'deg' },
        { id: 'm3', label: '−3√P₁₁', color: '--text-2', dash: [2, 3], unit: 'deg', legend: false }
      ] });
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid);
    const p3 = A.plot.line(b1, { height: 170, title: 'Uncertainty √P₁₁', xLabel: 't (s)', yLabel: '√P₁₁ (deg)', margin: M,
      series: [{ id: 's', label: '√P₁₁', color: '--accent', unit: 'deg' }] });
    const p4 = A.plot.line(b2, { height: 170, title: 'Kalman gain K₁', xLabel: 't (s)', yLabel: 'K₁', margin: M, y: { min: 0, auto: false, max: 1 },
      series: [{ id: 'k', label: 'K₁ (last update)', color: '--axis-y' }] });
    linkCursors([p1, p2, p3, p4]);

    function run() {
      const dt = 0.02, T = 120, n = Math.round(T / dt) + 1;
      const Aamp = 10 * D2R, wf = 2 * Math.PI / 60;
      const sgR = sg.value * D2R, bR = gb.value * D2R, saR = sa.value * D2R;
      const m = Math.max(1, Math.round(1 / (rate.value * dt)));
      const dtm = m * dt;
      const gs = A.rng.gaussianStream(11), gz = A.rng.gaussianStream(12);
      const kf = A.est.createAxisKF({ sgRad: sgR * Math.sqrt(qs.value), sbRad: DEF.sensors.kfBiasRW * Math.sqrt(qs.value), sstRad: saR * Math.sqrt(rs.value), dt: dt,
        P0: [Math.pow(1 * D2R, 2), Math.pow(0.5 * D2R, 2)] });
      const alpha = al.value, kc = 1 - alpha, kb = cfb.value ? kc * kc / (4 * dtm) : 0;
      const t = new Float64Array(n), tru = new Float64Array(n), meas = new Float64Array(n), ek = new Float64Array(n), ec = new Float64Array(n);
      const xk = new Float64Array(n), xc = new Float64Array(n), sP = new Float64Array(n), pp = new Float64Array(n), pm = new Float64Array(n), kk = new Float64Array(n);
      let thc = 0, bc = 0, wPrev = 0, z = 0, K1 = 0, s2k = 0, s2c = 0, cnt = 0;
      for (let k = 0; k < n; k++) {
        const tk = k * dt;
        const th = Aamp * Math.sin(wf * tk);
        if (k > 0) { kf.predict(wPrev); thc += (wPrev - bc) * dt; }
        if (k % m === 0) {
          z = th + saR * gz.next();
          const s = kf.update(z);
          K1 = s.K[0];
          const r = z - thc;
          thc += kc * r;
          bc -= kb * r;
        }
        const st = kf.state();
        t[k] = tk; tru[k] = th * R2D; meas[k] = z * R2D;
        xk[k] = st.theta * R2D; xc[k] = thc * R2D;
        ek[k] = (st.theta - th) * R2D; ec[k] = (thc - th) * R2D;
        const sd = Math.sqrt(Math.max(0, st.P[0][0])) * R2D;
        sP[k] = sd; pp[k] = 3 * sd; pm[k] = -3 * sd; kk[k] = K1;
        if (tk >= 10) { s2k += ek[k] * ek[k]; s2c += ec[k] * ec[k]; cnt++; }
        wPrev = Aamp * wf * Math.cos(wf * tk) + bR + sgR * gs.next();
      }
      p1.set('truth', t, tru); p1.set('meas', t, meas); p1.set('kf', t, xk); p1.set('cf', t, xc);
      p2.set('ekf', t, ek); p2.set('ecf', t, ec); p2.set('p3', t, pp); p2.set('m3', t, pm);
      p3.set('s', t, sP); p4.set('k', t, kk);
      const tau = alpha * dtm / kc;
      const rmsK = Math.sqrt(s2k / cnt), rmsC = Math.sqrt(s2c / cnt);
      set([deg(rmsK), deg(rmsC), f(kf.state().bias * R2D, { sig: 3, unit: 'deg/s' }) + ' (true ' + f(gb.value, { sig: 3, unit: 'deg/s' }) + ')',
        f(K1, { sig: 3 }), f(tau, { sig: 3, unit: 's' }), cfb.value ? 'removed by bias correction' : deg(gb.value * tau)]);
      p2.summary('Estimation error after 10 s: Kalman RMS ' + deg(rmsK) + ', complementary RMS ' + deg(rmsC) + '.');
    }
    const go = ui.debounce(run, 80);
    [sg, gb, sa, rate, qs, rs, al].forEach(function (c) { c.on('change', go); });
    cfb.on('change', run);
    run();
  }

  /* ================================================================ W7.3 full-simulation extension */

  function buildFullSim() {
    const w = parts('w-full-sim');
    const S = DEF.sensors;
    const NOISY = A.presets.get('ESTNOISY').sensors;
    const biasVec = S.gyroBiasDeg.map(function (v) { return f(v, { sig: 2 }); }).join(', ');
    const mode = ui.segmented({ id: 'w73-mode', label: 'Feedback to the controller and mode logic', value: 'kalman', options: [
      { value: 'truth', label: 'Truth (project)' }, { value: 'noisy', label: 'Noisy' }, { value: 'complementary', label: 'Complementary' }, { value: 'kalman', label: 'Kalman' }] });
    const sg = ui.slider({ id: 'w73-sg', label: 'Gyro noise σ', min: 0, max: 0.5, step: 0.005, value: S.gyroNoiseDeg, unit: 'deg/s', tag: 'extension' });
    const bs = ui.slider({ id: 'w73-bias', label: 'Gyro bias scale', min: 0, max: 5, step: 0.1, value: 1, unit: '×', tag: 'extension', help: 'Multiplies the default bias [' + biasVec + '] deg/s.' });
    const st = ui.slider({ id: 'w73-st', label: 'Star-tracker noise σ', min: 0.005, max: 0.5, step: 0.005, value: S.stNoiseDeg, unit: 'deg', tag: 'extension' });
    const sr = ui.slider({ id: 'w73-sr', label: 'Star-tracker rate', min: 0.5, max: 10, step: 0.5, value: S.stRateHz, unit: 'Hz', tag: 'extension' });
    const demo = ui.button({ label: 'Lock-up demo (ESTNOISY)', kind: 'primary', icon: 'warn' });
    const reset = ui.button({ label: 'Default sensors', kind: 'secondary', icon: 'reset' });
    w.controls.appendChild(mode.el);
    [sg, bs, st, sr].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Scenarios'), el('div', { class: 'btn-row' }, demo, reset)));

    const status = el('p', { class: 'status-line m07-status', 'aria-live': 'polite' });
    w.out.appendChild(status);
    const badges = ui.reqBadges(w.out, { notes: { F1: 'checked on the true rate', F2: 'needs a return to NOMINAL', L1: 'single run; the Monte Carlo check is in module 09' } });
    const M = { left: 56 };
    const p1 = A.plot.line(w.out, { height: 200, title: 'Attitude error: true and used', xLabel: 't (s)', yLabel: 'error (deg)', margin: M,
      series: [{ id: 'tr', label: 'true', color: '--accent', width: 2, unit: 'deg' }, { id: 'us', label: 'used by the logic', color: '--warn', dash: [6, 3], unit: 'deg' }],
      hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req', dash: [5, 4] }, { y: SM.returnErrDeg, label: 'return guard ' + SM.returnErrDeg + '°', color: '--line-thr', dash: [2, 3] }] });
    const p2 = A.plot.line(w.out, { height: 200, title: 'Rate norm |ω|: true and used', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M, y: { log: true, min: 0.005, auto: false, max: 20 },
      series: [{ id: 'tr', label: 'true', color: '--accent', width: 2, unit: 'deg/s' }, { id: 'us', label: 'used by the logic', color: '--warn', width: 1, alpha: 0.8, unit: 'deg/s' }],
      hlines: [{ y: SM.exitRateDeg, label: SM.exitRateDeg + ' deg/s exit', color: '--line-thr', dash: [2, 3] }, { y: SM.enterRateDeg, label: SM.enterRateDeg + ' deg/s entry', color: '--line-thr' }] });
    const p3 = A.plot.line(w.out, { height: 170, title: 'Estimation error |q̂ vs q|', xLabel: 't (s)', yLabel: 'error (deg)', margin: M,
      series: [{ id: 'e', label: 'estimation error', color: '--axis-z', unit: 'deg' }] });
    const tl = A.plot.timeline(w.out, { title: 'Mode', axis: true, margin: M });
    linkCursors([p1, p2, p3, tl]);
    const linkP = el('p', { class: 'm07-simlink' });
    w.out.appendChild(linkP);
    w.out.appendChild(ui.callout('info', 'Why REQ-F1 and REQ-F2 can disagree',
      'The requirement checks read the true state, but the controller and the mode logic read the estimate. REQ-F1 asks whether the true rate fell below ' + LIM.rateDeg + ' deg/s after safe-mode entry, and it can pass while the mode logic, seeing a noisy rate, never believes it. REQ-F2 needs the craft back in NOMINAL, so the same run fails it. A requirement verified on truth says nothing about a system that acts on estimates unless the estimate error is inside the thresholds\u2019 margins.'));

    function cfg() {
      return { mode: mode.value, gyroNoiseDeg: sg.value, gyroBiasDeg: S.gyroBiasDeg.map(function (v) { return v * bs.value; }), stNoiseDeg: st.value, stRateHz: sr.value };
    }
    function isNoisyPreset(c) {
      return c.mode === NOISY.mode && Math.abs(c.gyroNoiseDeg - NOISY.gyroNoiseDeg) < 1e-9 && Math.abs(c.stNoiseDeg - NOISY.stNoiseDeg) < 1e-9 &&
        Math.abs(bs.value - 1) < 1e-9 && Math.abs(c.stRateHz - S.stRateHz) < 1e-9;
    }
    function run() {
      const truth = mode.value === 'truth';
      [sg, bs, st, sr].forEach(function (c) { c.disable(truth); });
      guarded(w.out, function () {
        const c = cfg();
        const r = A.sim.run(A.params.merge(A.presets.get('T03'), { sensors: c }));
        const n = r.n;
        p1.set('tr', r.t, r.errDeg); p1.set('us', r.t, r.errDegUsed);
        const floor = function (src) { const o = new Float64Array(n); for (let k = 0; k < n; k++) o[k] = Math.max(0.005, src[k]); return o; };
        p2.set('tr', r.t, floor(r.rateDeg)); p2.set('us', r.t, floor(r.rateDegUsed));
        if (r.estErrDeg) { p3.set('e', r.t, r.estErrDeg); p3.summary('Estimation error: RMS ' + deg(r.metrics.estRmsDeg) + ', maximum ' + deg(r.metrics.estMaxDeg) + '.'); }
        else { p3.set('e', r.t, new Float64Array(n)); p3.summary('Truth feedback: the controller uses the true attitude, so the estimation error is zero.'); }
        tl.set({ segments: A.modes.runLengths(r.mode, r.t), faults: faultWindows(r), events: r.events.map(function (e) { return e.t; }), x: { min: 0, max: r.t[n - 1] } });
        badges.update(r.req);
        // while in SAFE_DETUMBLE, how long did the measured rate stay below the exit threshold?
        let below = 0, inSD = 0, run = 0, best = 0;
        for (let k = 0; k < n; k++) {
          if (r.mode[k] !== A.modes.SD) { run = 0; continue; }
          inSD++;
          if (r.rateDegUsed[k] < SM.exitRateDeg) { below++; run++; if (run > best) best = run; } else run = 0;
        }
        const fm = r.metrics.final.mode;
        const seq = r.events.map(function (e) { return f(e.t, { fixed: 2 }) + ' s ' + A.modes.SHORT[e.from] + '→' + A.modes.SHORT[e.to]; }).join(', ');
        status.textContent = (truth ? 'Truth feedback (the project). ' : '') + r.events.length + ' transition' + (r.events.length === 1 ? '' : 's') + (seq ? ' (' + seq + ')' : '') +
          '. Final mode ' + A.modes.NAMES[fm] + ', true error ' + deg(r.metrics.final.errDeg) + '. While in SAFE_DETUMBLE the measured |ω| was below ' + SM.exitRateDeg + ' deg/s in ' +
          pct(below / Math.max(1, inSD)) + ' of samples; the longest unbroken run was ' + fmtT(best * r.dt) + ', and the exit needs ' + SM.exitHold + ' s' +
          (r.metrics.estRmsDeg !== null && r.metrics.estRmsDeg !== undefined ? '. Estimation RMS ' + deg(r.metrics.estRmsDeg) + '.' : '.');
        linkP.textContent = '';
        const linkHash = isNoisyPreset(c) ? 'preset=ESTNOISY' : (truth ? 'preset=T03' : { preset: 'T03', sens: c.mode });
        linkP.appendChild(ui.simLink(isNoisyPreset(c) ? 'Open ESTNOISY in the simulator' : 'Open T03 with ' + (truth ? 'truth' : c.mode) + ' feedback in the simulator', linkHash));
        if (!isNoisyPreset(c) && !truth && (Math.abs(sg.value - S.gyroNoiseDeg) > 1e-9 || Math.abs(st.value - S.stNoiseDeg) > 1e-9 || Math.abs(bs.value - 1) > 1e-9 || Math.abs(sr.value - S.stRateHz) > 1e-9)) {
          linkP.appendChild(el('span', { class: 'muted' }, ' (the link carries the feedback mode; set the sensor sliders there again)'));
        }
      });
    }
    const go = ui.debounce(run, 150);
    [sg, bs, st, sr].forEach(function (c) { c.on('change', go); });
    mode.on('change', run);
    demo.addEventListener('click', function () {
      mode.set(NOISY.mode); sg.set(NOISY.gyroNoiseDeg); st.set(NOISY.stNoiseDeg); bs.set(1); sr.set(S.stRateHz);
      run();
      ui.announce('Lock-up demo loaded: gyro noise ' + NOISY.gyroNoiseDeg + ' deg/s, star-tracker noise ' + NOISY.stNoiseDeg + '°.');
    });
    reset.addEventListener('click', function () {
      sg.set(S.gyroNoiseDeg); st.set(S.stNoiseDeg); bs.set(1); sr.set(S.stRateHz);
      run();
    });
    run();
  }

  /* ================================================================ W7.4 fault-alarm base rate */

  function buildBaseRate() {
    const w = parts('w-base-rate');
    const prior = ui.slider({ id: 'w74-prior', label: 'Prior P(fault) per check', min: 1e-6, max: 1e-2, value: 1e-4, log: true, tag: 'illustrative' });
    const det = ui.slider({ id: 'w74-det', label: 'Detection rate d', min: 0.5, max: 0.999, step: 0.001, value: 0.99, tag: 'illustrative' });
    const fa = ui.slider({ id: 'w74-fa', label: 'False-alarm rate f', min: 1e-4, max: 0.2, value: 0.01, log: true, tag: 'illustrative' });
    const kk = ui.slider({ id: 'w74-k', label: 'Consecutive alarms k', min: 1, max: 10, step: 1, value: 1 });
    [prior, det, fa, kk].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['P(fault | one alarm)', 'P(fault | k alarms)', 'Likelihood ratio d/f', 'False alarms per real alarm (one alarm)']);
    const words = el('p', { class: 'status-line m07-words', 'aria-live': 'polite' });
    w.out.appendChild(words);
    const p = A.plot.line(w.out, { height: 200, title: 'P(fault | k consecutive alarms), independence assumed', xLabel: 'k (alarms)', yLabel: 'P(fault | k)', margin: { left: 56 },
      x: { min: 1, max: 10 }, y: { min: 0, max: 1, auto: false },
      series: [{ id: 'post', label: 'posterior', color: '--accent', width: 2 }],
      hlines: [{ y: 0.5, label: 'even odds', color: '--text-2', dash: [4, 4] }] });
    w.out.appendChild(ui.callout('warn', 'Independence is an assumption',
      'Multiplying the evidence of k alarms assumes each false alarm is a fresh, independent event. Real false alarms cluster: a vibration, a noise burst or a thermal transient lasts many samples, so 50 consecutive samples at 0.01 s are nowhere near 50 independent tests. Persistence works when it is long compared with those bursts.'));
    function count(x) { return x >= 100 ? Math.round(x).toLocaleString('en-GB') : f(x, { sig: 3 }); }
    function post(p0, d, fr, k) {
      const a = Math.pow(d, k) * p0, b = Math.pow(fr, k) * (1 - p0);
      return a / (a + b);
    }
    function run() {
      const p0 = prior.value, d = det.value, fr = fa.value, k = kk.value;
      const one = post(p0, d, fr, 1), many = post(p0, d, fr, k);
      const xs = new Float64Array(10), ys = new Float64Array(10);
      for (let i = 0; i < 10; i++) { xs[i] = i + 1; ys[i] = post(p0, d, fr, i + 1); }
      p.set('post', xs, ys);
      p.setCursor(k);
      const healthy = 1e6 * (1 - p0), faults = 1e6 * p0;
      const caught = faults * d, falseA = healthy * fr;
      set([pct(one), pct(many), f(d / fr, { sig: 3 }), f(falseA / Math.max(caught, 1e-12), { sig: 3 })]);
      words.textContent = 'In a million checks: about ' + count(faults) + ' real fault' + (faults === 1 ? '' : 's') + ', of which ' + count(caught) + ' raise an alarm, against about ' +
        count(falseA) + ' false alarms from healthy checks. With ' + k + ' consecutive alarm' + (k === 1 ? '' : 's') + ' required, P(fault) is ' + pct(many) + '.';
      p.summary('Posterior probability of a fault after k consecutive alarms rises from ' + pct(one) + ' at k = 1 to ' + pct(ys[9]) + ' at k = 10.');
    }
    [prior, det, fa, kk].forEach(function (c) { c.on('change', run); });
    run();
  }

  /* ================================================================ derived numbers in the prose */

  function fillCalc() {
    const S = DEF.sensors;
    const bx = Math.abs(S.gyroBiasDeg[0]);
    const kc = S.kc, alpha = 1 - kc, dtm = 1 / S.stRateHz;
    const vals = {
      'bias-vec': '[' + S.gyroBiasDeg.map(function (v) { return f(v, { sig: 3 }); }).join(', ') + '] deg/s',
      'bias-degh': f(bx * 3600, { sig: 3, unit: 'deg/h' }),
      'bias-t2': f(LIM.errDeg / bx, { sig: 3, unit: 's' }),
      'gyro-sigma': 'σ = ' + f(S.gyroNoiseDeg, { sig: 3, unit: 'deg/s' }),
      'gyro-arw': f(S.gyroNoiseDeg * Math.sqrt(DEF.dt) * 60, { sig: 2, unit: 'deg/√h' }),
      'cf-gains': '\\(k_c=' + kc + '\\) per star-tracker update, so \\(\\alpha=' + Number(alpha.toPrecision(3)) + '\\), and \\(k_b=' + S.kb + '\\)',
      'cf-tau': '\\(\\tau=' + Number((alpha * dtm / kc).toPrecision(3)) + '\\) s'
    };
    ui.qsa('.calc[data-calc]').forEach(function (s) {
      const k = s.getAttribute('data-calc');
      if (vals[k] !== undefined) s.textContent = vals[k];
    });
  }
  /** RMS estimation error over the last 20 s of T01 for each estimator (deferred: three short runs). */
  function fillRms() {
    ['kalman', 'complementary', 'noisy'].forEach(function (m) {
      const span = document.querySelector('.calc[data-calc="rms-' + m + '"]');
      if (!span) return;
      try {
        const r = A.sim.run(A.params.merge(A.presets.get('T01'), { sensors: { mode: m }, log: false }));
        const v = r.metrics.estRmsTailDeg;
        // two significant figures with trailing zeros kept (0.030°, not 0.03°), so the three values read alike
        if (v !== null && isFinite(v)) span.textContent = v > 1e-4 && v < 1e3 ? v.toPrecision(2) + '°' : deg(v, 2);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
      }
    });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm07' });
    fillCalc();
    buildDrift();
    buildVestibular();
    buildKalman1D();
    buildFullSim();
    buildBaseRate();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'An unaided gyro with a 10 deg/h bias exceeds 2° of attitude error after about…',
        options: ['12 seconds.', '12 minutes.', '12 hours.'], correct: 1,
        explain: 'The bias integrates to a ramp, \\(\\delta\\theta=b\\,t\\), so \\(t=2^\\circ/(10\\ \\text{deg/h})=0.2\\) h \\(=720\\) s, twelve minutes. Small rate errors become large angle errors because pointing is an integral.' },
      { q: 'In the ESTNOISY run, why does the spacecraft never leave SAFE_DETUMBLE?',
        options: ['The wheels saturate.', 'Measured rate noise keeps breaking the “below 0.5 deg/s for 2 s” timer.', 'The fault flag is stuck.'], correct: 1,
        explain: 'With gyro σ = 0.3 deg/s the measured |ω| averages about 0.48 deg/s even when the true rate is near zero, so a sample falls below 0.5 deg/s only about 57% of the time. The exit needs 200 in a row, which essentially never happens. The true rate is fine, so REQ-F1 passes, but REQ-F2 fails.' },
      { q: 'A detector with 99% sensitivity and a 1% false-alarm rate watches for a fault with a prior of \\(10^{-4}\\). After one alarm, P(fault) is about…',
        options: ['1%.', '50%.', '99%.'], correct: 0,
        explain: '\\(0.99\\times10^{-4}/(0.99\\times10^{-4}+0.01\\times0.9999)\\approx0.98\\%\\). False alarms from the many healthy checks swamp the few real faults: the base-rate effect. Persistence and independent confirmation are the cure.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm07');
    titleTags(document.getElementById('main'));
    iconiseCallouts(document.querySelector('.module-hero'));
    ui.typeset(document.body);
    // LOCAL (request P0): equations can overflow only after the KaTeX fonts load, so mark the scroll boxes again then.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ui.markScrollable(document.body); });
    ui.linkTerms(document.body);
    setTimeout(fillRms, 0);
  });
})();
