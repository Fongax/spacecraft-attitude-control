/**
 * m05.js: Module 05, control design (package P4).
 * Widgets: energy during a detumble, W5.1 single-axis step-response lab, W5.2 pole viewer,
 * W5.3 windup demo, W5.4 LQR tuner and Bellman sweep, W5.5 controller decision matrix.
 * Gains, inertias, limits and presets come from ADCS.params / ADCS.presets; results are computed live.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const D2R = A.units.D2R, R2D = A.units.R2D;
  const MINUS = '\u2212';
  const DEF = A.params.DEFAULTS;

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
  function secs(x) { return x === null || x === undefined ? 'not within the run' : f(x, { fixed: 2, unit: 's' }); }
  /** Copy an interleaved 3-axis log component into a scaled Float64Array. */
  function axis(arr, n, i, scale) {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = arr[3 * k + i] * scale;
    return out;
  }
  function norm3(arr, n, scale) {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = Math.hypot(arr[3 * k], arr[3 * k + 1], arr[3 * k + 2]) * scale;
    return out;
  }
  function axisOptions() {
    return DEF.J.map(function (Ji, i) { return { value: i, label: 'xyz'[i] + ' axis (J = ' + Ji + ' kg m²)' }; });
  }
  /** TeX for a×10^b with sig significant digits. */
  function texSci(x, sig) {
    const e = Math.floor(Math.log10(Math.abs(x)));
    const m = Number((x / Math.pow(10, e)).toPrecision(sig || 2));
    return (m === 1 ? '' : m + '\\times') + '10^{' + e + '}';
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

  /** Step-response metrics for a regulation from theta0 > 0 towards zero (angles in deg). */
  function stepMetrics(t, thDeg, th0Deg, bandDeg) {
    const n = t.length;
    let t90 = null, t10 = null, minV = 0, last = -1, last2 = -1;
    for (let k = 0; k < n; k++) {
      const v = thDeg[k];
      if (t90 === null && v <= 0.9 * th0Deg) t90 = t[k];
      if (t10 === null && v <= 0.1 * th0Deg) t10 = t[k];
      if (v < minV) minV = v;
      if (Math.abs(v) >= bandDeg) last = k;
      if (Math.abs(v) >= 0.02 * th0Deg) last2 = k;
    }
    function settle(i) { return i < 0 ? 0 : (i >= n - 1 ? null : t[i + 1]); }
    return { rise: (t90 !== null && t10 !== null) ? t10 - t90 : null, overshoot: 100 * Math.max(0, -minV) / th0Deg,
      settle: settle(last), settle2: settle(last2), final: Math.abs(thDeg[n - 1]) };
  }

  /* ================================================================ energy during a detumble */

  function buildEnergy() {
    const w = parts('w-energy');
    const r = guarded(w.out, function () { return A.sim.run(A.params.merge(A.presets.get('HIGHRATE'), { duration: 8 })); });
    if (!r) return;
    const J = r.config.J, n = r.n;
    const E = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = r.w[3 * k], b = r.w[3 * k + 1], c = r.w[3 * k + 2];
      E[k] = 0.5 * (J[0] * a * a + J[1] * b * b + J[2] * c * c) * 1000;
    }
    const ev = r.events.filter(function (e) { return e.k > 0; });
    const vl = ev.map(function (e) { return { x: e.t, label: A.modes.SHORT[e.from] + ' → ' + A.modes.SHORT[e.to], color: '--text-2' }; });
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid);
    const M = { left: 56 };
    const pE = A.plot.line(b1, { height: 190, title: 'Kinetic energy T = ½ωᵀJω', xLabel: 't (s)', yLabel: 'T (mJ)', margin: M,
      series: [{ id: 'E', label: 'T', color: '--accent', width: 2, unit: 'mJ' }], vlines: vl });
    pE.set('E', r.t, E);
    const pW = A.plot.line(b2, { height: 190, title: 'Rate norm |ω|', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M,
      series: [{ id: 'w', label: '|ω|', color: '--axis-y', width: 2, unit: 'deg/s' }],
      hlines: [{ y: r.config.safeMode.exitRateDeg, label: r.config.safeMode.exitRateDeg + ' deg/s exit threshold', color: '--line-thr' }], vlines: vl });
    pW.set('w', r.t, r.rateDeg);
    const tl = A.plot.timeline(w.out, { title: 'Mode', segments: A.modes.runLengths(r.mode, r.t), events: ev.map(function (e) { return e.t; }), margin: M });
    [pE, pW, tl].forEach(function (p) { p.onSeek(function (x) { [pE, pW, tl].forEach(function (q) { q.setCursor(x); }); }); });
    let mono = true, kEnd = n - 1;
    if (ev.length) kEnd = ev[0].k;
    for (let k = 1; k <= kEnd; k++) if (E[k] > E[k - 1] + 1e-12) { mono = false; break; }
    w.out.appendChild(el('p', { class: 'status-line' }, 'From ' + f(E[0], { sig: 3, unit: 'mJ' }) + ' to ' + f(E[kEnd], { sig: 2, unit: 'mJ' }) +
      ' during SAFE_DETUMBLE (' + f(r.t[kEnd], { fixed: 2, unit: 's' }) + '); ' + (mono ? 'it never increases, as the Lyapunov argument promises.' : 'it rises somewhere, which the argument says it should not.')));
  }

  /* ================================================================ W5.1 step-response lab */

  function buildStepLab() {
    const w = parts('w-step-lab');
    const pidD = DEF.pid;
    const tauMax = DEF.tauMax;
    const dist = Math.max.apply(null, DEF.disturbance.map(Math.abs));
    const ax = ui.select({ id: 'w51-axis', label: 'Axis', options: axisOptions(), value: 1, tag: 'project' });
    const ctl = ui.segmented({ id: 'w51-ctl', label: 'Controller', value: 'PD', options: [{ value: 'P', label: 'P' }, { value: 'PD', label: 'PD' }, { value: 'PID', label: 'PID' }] });
    const kp = ui.slider({ id: 'w51-kp', label: 'Kpθ', min: 0, max: 0.05, step: 0.0005, value: pidD.Kp / 2, unit: 'N m/rad', tag: 'site', help: 'Site default Kp/2 = ' + pidD.Kp / 2 + '.' });
    const kd = ui.slider({ id: 'w51-kd', label: 'Kd', min: 0, max: 0.2, step: 0.001, value: pidD.Kd, unit: 'N m s/rad', tag: 'site' });
    const ki = ui.slider({ id: 'w51-ki', label: 'Kiθ', min: 0, max: 0.005, step: 0.0001, value: pidD.Ki / 2, unit: 'N m/(rad s)', tag: 'site', help: 'Site default Ki/2 = ' + pidD.Ki / 2 + '.' });
    const st = ui.slider({ id: 'w51-step', label: 'Step (initial error)', min: 2, max: 40, step: 1, value: 30, unit: 'deg' });
    const sat = ui.toggle({ id: 'w51-sat', label: 'Saturation ±' + f(tauMax * 1000, { sig: 2 }) + ' mN m', checked: true, tag: 'project' });
    const dis = ui.toggle({ id: 'w51-dist', label: 'Disturbance ' + ui.fmtSci(dist, 2) + ' N m', checked: false, tag: 'project' });
    [ax, ctl, kp, kd, ki, st, sat, dis].forEach(function (c) { w.controls.appendChild(c.el); });

    // 150 s: at the site gains the PID's slow integral pole (time constant about 16 s) needs about 100 s to clear the disturbance error
    const T = 150;
    const set = readouts(w.out, ['ωn', 'ζ', 'Rise time (90→10%)', 'Overshoot', 'Settling into ±2°', '2% settling', 'Error at ' + T + ' s', 'PD steady error τd/Kpθ (predicted)']);
    const b1 = el('div'), b2 = el('div');
    w.out.appendChild(b1); w.out.appendChild(b2);
    const band = A.params.LIMITS.errDeg;
    const pT = A.plot.line(b1, { height: 210, title: 'Attitude error θ(t)', xLabel: 't (s)', yLabel: 'θ (deg)', margin: { left: 56 },
      series: [{ id: 'th', label: 'θ', color: '--accent', width: 2, unit: 'deg' }],
      bands: [{ y0: -band, y1: band, color: '--band-ok' }],
      hlines: [{ y: band, label: '±' + band + '° (REQ-F2 band)', color: '--line-req', dash: [5, 4] }, { y: -band, color: '--line-req', dash: [5, 4] }] });
    const pU = A.plot.line(b2, { height: 170, title: 'Torque', xLabel: 't (s)', yLabel: 'τ (mN m)', margin: { left: 56 },
      series: [{ id: 'cmd', label: 'commanded', color: '--text-2', dash: [5, 4], unit: 'mN m' }, { id: 'tau', label: 'applied', color: '--axis-y', width: 2, unit: 'mN m' }] });
    [pT, pU].forEach(function (p) { p.onSeek(function (x) { pT.setCursor(x); pU.setCursor(x); }); });

    /** The final-value prediction for PD under the disturbance, to compare with the error at the end of the run. */
    function ssText(kTheta) {
      if (!dis.value) return '0 (disturbance off)';
      if (!(kTheta > 0)) return 'unbounded (no stiffness)';
      return f(dist / kTheta * R2D, { sig: 3, unit: '°' });
    }
    function run() {
      const mode = ctl.value;
      kd.disable(mode === 'P');
      ki.disable(mode !== 'PID');
      guarded(w.out, function () {
        const J = DEF.J[ax.value];
        const kTheta = kp.value, kW = mode === 'P' ? 0 : kd.value, kI = mode === 'PID' ? ki.value : 0;
        const s = A.sim.singleAxis({ J: J, kTheta: kTheta, kW: kW, ki: kI, tauMax: sat.value ? tauMax : null, tauD: dis.value ? dist : 0,
          theta0: st.value * D2R, duration: T, dt: DEF.dt, intMode: mode === 'PID' ? 'clamp' : 'none', clampFrac: pidD.clampFrac });
        const n = s.t.length, th = new Float64Array(n), tu = new Float64Array(n), tc = new Float64Array(n);
        for (let k = 0; k < n; k++) { th[k] = s.theta[k] * R2D; tu[k] = s.tau[k] * 1000; tc[k] = s.tauCmd[k] * 1000; }
        pT.set('th', s.t, th);
        pU.set('tau', s.t, tu); pU.set('cmd', s.t, tc);
        const m = stepMetrics(s.t, th, st.value, band);
        const wn = Math.sqrt(kTheta / J), zeta = kTheta > 0 ? kW / (2 * Math.sqrt(kTheta * J)) : NaN;
        pT.setLines({ vlines: m.settle ? [{ x: m.settle, label: 'settled ' + f(m.settle, { fixed: 1 }) + ' s', color: '--ok' }] : [] });
        pU.setLines({ hlines: sat.value ? [{ y: tauMax * 1000, label: '±' + tauMax * 1000 + ' mN m', color: '--line-req' }, { y: -tauMax * 1000, color: '--line-req' }] : [] });
        set([f(wn, { sig: 3, unit: 'rad/s' }), isFinite(zeta) ? f(zeta, { sig: 3 }) + (zeta < 1 ? ' (underdamped)' : zeta > 1 ? ' (overdamped)' : ' (critical)') : '–',
          m.rise === null ? 'not reached' : f(m.rise, { fixed: 2, unit: 's' }), f(m.overshoot, { sig: 3 }) + '%',
          st.value <= band ? 'starts inside the band' : secs(m.settle), secs(m.settle2), f(m.final, { sig: 3, unit: '°' }), ssText(kTheta)]);
        pT.summary('Attitude error from ' + st.value + '° under ' + mode + ' control: overshoot ' + f(m.overshoot, { sig: 3 }) + '%, settling into ±' + band + '° ' + secs(m.settle) + ', error at ' + T + ' s ' + f(m.final, { sig: 3 }) + '°.');
      });
    }
    const go = ui.debounce(run, 80);
    [kp, kd, ki, st].forEach(function (c) { c.on('change', go); });
    [ax, ctl, sat, dis].forEach(function (c) { c.on('change', run); });
    run();
  }

  /* ================================================================ W5.2 pole viewer */

  function buildPoles() {
    const w = parts('w-poles');
    const pidD = DEF.pid, L = DEF.lqr;
    const ax = ui.select({ id: 'w52-axis', label: 'Axis', options: axisOptions(), value: 1, tag: 'project' });
    const ctl = ui.segmented({ id: 'w52-ctl', label: 'Controller', value: 'PD', options: [{ value: 'PD', label: 'PD (2 poles)' }, { value: 'PID', label: 'PID (3 poles)' }] });
    const kp = ui.slider({ id: 'w52-kp', label: 'Kpθ', min: 0.0005, max: 0.05, step: 0.0005, value: pidD.Kp / 2, unit: 'N m/rad', tag: 'site' });
    const kd = ui.slider({ id: 'w52-kd', label: 'Kd', min: 0, max: 0.2, step: 0.001, value: pidD.Kd, unit: 'N m s/rad', tag: 'site' });
    // wider than W5.1's 0–0.005 so that the Routh–Hurwitz boundary Kiθ = Kd·Kpθ/J (0.02 at the y-axis defaults) is reachable
    const ki = ui.slider({ id: 'w52-ki', label: 'Kiθ', min: 0, max: 0.03, step: 0.0005, value: pidD.Ki / 2, unit: 'N m/(rad s)', tag: 'site' });
    const bandT = ui.toggle({ id: 'w52-band', label: 'Show the aircraft short-period handling band (ζ 0.35–1.3)', checked: false, tag: 'analogy' });
    [ax, ctl, kp, kd, ki, bandT].forEach(function (c) { w.controls.appendChild(c.el); });
    const status = el('p', { class: 'status-line w52-status', 'aria-live': 'polite' });
    w.out.appendChild(status);
    const sp = A.plot.splane(w.out, { height: 300, title: 'Closed-loop poles', zetaLines: [0.35, 0.72, 1], wnCircles: [0.5, 1] });
    const set = readouts(w.out, ['Poles', 'Dominant ωn, ζ', 'LQR for this axis']);

    function roots(J, kpv, kdv, kiv, pid) { return A.vec.polyRoots(pid ? [J, kdv, kpv, kiv] : [J, kdv, kpv]); }
    function cstr(p) { return f(p.re, { sig: 3 }) + (Math.abs(p.im) < 1e-9 ? '' : (p.im < 0 ? ' ' + MINUS + ' ' : ' + ') + f(Math.abs(p.im), { sig: 3 }) + 'j'); }
    /** Root-locus branches over a gain sweep, matched step to step by nearest neighbour. */
    function locus(J, kpMax, kdv, kiv, pid) {
      const N = 160, branches = [];
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const r = roots(J, kpMax * i / N, kdv, kiv, pid);
        if (!prev) { r.forEach(function (p) { branches.push([[p.re, p.im]]); }); prev = r; continue; }
        const used = new Array(r.length).fill(false), next = new Array(prev.length);
        prev.forEach(function (p, b) {
          let best = -1, bd = Infinity;
          r.forEach(function (q, j) { if (used[j]) return; const d = Math.hypot(q.re - p.re, q.im - p.im); if (d < bd) { bd = d; best = j; } });
          if (best >= 0) { used[best] = true; next[b] = r[best]; branches[b].push([r[best].re, r[best].im]); }
        });
        prev = next;
      }
      const out = [];
      branches.forEach(function (b, i) { if (i) out.push([NaN, NaN]); Array.prototype.push.apply(out, b); });
      return out;
    }
    function update() {
      const pid = ctl.value === 'PID';
      ki.disable(!pid);
      const i = ax.value, J = DEF.J[i];
      const P = roots(J, kp.value, kd.value, ki.value, pid);
      const label = pid ? 'PID' : 'PD';
      // label one pole: the upper member of a complex pair, else the slowest real pole
      let li = -1;
      P.forEach(function (p, j) { if (p.im > 1e-9 && (li < 0 || p.im > P[li].im)) li = j; });
      if (li < 0) { li = 0; P.forEach(function (p, j) { if (Math.abs(p.re) < Math.abs(P[li].re)) li = j; }); }
      const poles = P.map(function (p, j) { return { re: p.re, im: p.im, label: j === li ? label : '' }; });
      const g = A.lqr.axisGains(J, L.qTheta, L.qW, L.r), cl = A.lqr.closedLoop(J, g.kTheta, g.kW);
      const up = cl.poles.filter(function (p) { return p.im >= 0; })[0] || cl.poles[0];
      sp.set({ poles: poles, locus: locus(J, 3 * kp.value, kd.value, ki.value, pid), markers: [{ re: up.re, im: up.im, label: 'LQR' }],
        band: bandT.value ? { zetaMin: 0.35, zetaMax: 1.3, label: 'aircraft short-period band ζ 0.35–1.3 (analogy)' } : null });
      const cplx = P.filter(function (p) { return p.im > 1e-9; })[0];
      const dom = cplx || P.reduce(function (a, b) { return Math.abs(b.re) < Math.abs(a.re) ? b : a; });
      const wn = Math.hypot(dom.re, dom.im);
      set([P.map(cstr).join(', ') + ' (1/s)', cplx ? 'ωn ' + f(wn, { sig: 3, unit: 'rad/s' }) + ', ζ ' + f(-dom.re / wn, { sig: 3 }) : 'all real: slowest time constant ' + f(1 / Math.abs(dom.re), { sig: 3, unit: 's' }),
        'Kθ ' + f(g.kTheta, { sig: 3 }) + ', Kω ' + f(g.kW, { sig: 3 }) + ': ωn ' + f(cl.wn, { sig: 3, unit: 'rad/s' }) + ', ζ ' + f(cl.zeta, { sig: 3 })]);
      status.textContent = '';
      if (pid) {
        const lhs = kd.value * kp.value, rhs = J * ki.value, ok = lhs > rhs;
        status.appendChild(ui.badge(ok ? 'pass' : 'fail', ok ? 'Routh–Hurwitz: stable' : 'Routh–Hurwitz: unstable'));
        status.appendChild(document.createTextNode(' Kd·Kpθ = ' + ui.fmtSci(lhs, 2) + (ok ? ' > ' : ' ≤ ') + 'J·Kiθ = ' + (rhs > 0 ? ui.fmtSci(rhs, 2) : '0') + (ok && rhs > 0 ? ' (margin ×' + f(lhs / rhs, { sig: 3 }) + ')' : '') +
          '. The boundary here is Kiθ = Kd·Kpθ/J = ' + f(lhs / J, { sig: 3 }) + (lhs / J > 0.03 ? ', beyond this slider.' : '.')));
      } else {
        const stable = P.every(function (p) { return p.re < 0; });
        status.appendChild(ui.badge(stable ? 'pass' : 'fail', stable ? 'Stable' : 'Not asymptotically stable'));
        status.appendChild(document.createTextNode(kd.value === 0 ? ' With Kd = 0 the poles sit on the imaginary axis: an undamped oscillation.' : ' A PD loop on a double integrator is stable for any positive gains.'));
      }
    }
    const go = ui.debounce(update, 60);
    [kp, kd, ki].forEach(function (c) { c.on('change', go); });
    [ax, ctl, bandT].forEach(function (c) { c.on('change', update); });
    update();
  }

  /* ================================================================ W5.3 windup demo */

  // LOCAL (request P0): ADCS.sim.singleAxis has no "gated" integrator mode. This mirrors its loop
  // (RK4 with the torque held per step, integral of theta updated per step) and keeps the integrator
  // at zero until |theta| is inside gateRad, then resets it and integrates with the clamp, the
  // single-axis stand-in for "integrate only in NOMINAL, reset on entry".
  function singleAxisGated(o) {
    const n = Math.round(o.duration / o.dt) + 1;
    const out = { t: new Float64Array(n), theta: new Float64Array(n), w: new Float64Array(n), tau: new Float64Array(n), tauCmd: new Float64Array(n), I: new Float64Array(n) };
    const Imax = o.ki > 0 ? o.clampFrac * o.tauMax / o.ki : Infinity;
    let th = o.theta0, wv = 0, I = 0, on = false;
    const h = o.dt;
    for (let k = 0; k < n; k++) {
      if (!on && Math.abs(th) < o.gateRad) { on = true; I = 0; }
      const cmd = -o.kTheta * th - o.kW * wv - o.ki * I;
      const tau = Math.max(-o.tauMax, Math.min(o.tauMax, cmd));
      out.t[k] = k * h; out.theta[k] = th; out.w[k] = wv; out.tau[k] = tau; out.tauCmd[k] = cmd; out.I[k] = I;
      if (k === n - 1) break;
      const a = (tau + (o.tauD || 0)) / o.J;
      const thNew = th + h * wv + 0.5 * h * h * a, wNew = wv + h * a;   // RK4 is exact for constant acceleration
      if (on) I = Math.max(-Imax, Math.min(Imax, I + th * h));
      th = thNew; wv = wNew;
    }
    return out;
  }

  function buildWindup() {
    const w = parts('w-windup');
    const pidD = DEF.pid, tauMax = DEF.tauMax, J = DEF.J[1];
    const panelA = el('div', { class: 'w53-panel' }), panelB = el('div', { class: 'w53-panel' });
    ui.tabs(w.out, [{ id: 'single', label: 'A. Single axis', content: panelA }, { id: 'engine', label: 'B. Full engine (T03)', content: panelB }], { label: 'Windup demo views' });

    /* ---- tab A */
    const ctlA = el('div', { class: 'widget-controls' });
    panelA.appendChild(ctlA);
    const kiA = ui.slider({ id: 'w53-ki', label: 'Kiθ', min: 0.0005, max: 0.005, step: 0.0001, value: 2 * pidD.Ki / 2, unit: 'N m/(rad s)', help: 'Twice the site default, to make windup easy to see.' });
    ctlA.appendChild(kiA.el);
    const VAR = [
      { id: 'naive', label: 'naive integrator', color: '--axis-x', dash: [], width: 2 },
      { id: 'clamp', label: 'clamp |Ki·I| ≤ 10% τmax', color: '--axis-z', dash: [6, 4], width: 2 },
      { id: 'conditional', label: 'conditional (freeze while saturated)', color: '--warn', dash: [2, 3], width: 2.2 },
      { id: 'gated', label: 'clamp + reset on entry', color: '--axis-y', dash: [9, 3, 2, 3], width: 2 }
    ];
    const bA1 = el('div'), bA2 = el('div');
    panelA.appendChild(bA1); panelA.appendChild(bA2);
    const band = A.params.LIMITS.errDeg, gate = DEF.safeMode.returnErrDeg;
    const pA = A.plot.line(bA1, { height: 220, title: 'θ(t) for four integrator variants', xLabel: 't (s)', yLabel: 'θ (deg)', margin: { left: 56 },
      series: VAR.map(function (v) { return { id: v.id, label: v.label, color: v.color, dash: v.dash, width: v.width, unit: 'deg' }; }),
      bands: [{ y0: -band, y1: band, color: '--band-ok' }],
      hlines: [{ y: gate, label: gate + '° entry gate (SAFE_HOLD return guard)', color: '--line-thr', dash: [2, 3] }] });
    const pI = A.plot.line(bA2, { height: 170, title: 'Integral torque Kiθ·I', xLabel: 't (s)', yLabel: 'Kiθ·I (mN m)', margin: { left: 56 },
      series: VAR.map(function (v) { return { id: v.id, label: v.label, color: v.color, dash: v.dash, width: v.width, unit: 'mN m' }; }), legend: false });
    [pA, pI].forEach(function (p) { p.onSeek(function (x) { pA.setCursor(x); pI.setCursor(x); }); });
    const tabA = el('div');
    panelA.appendChild(tabA);

    function runA() {
      guarded(panelA, function () {
        const base = { J: J, kTheta: pidD.Kp / 2, kW: pidD.Kd, ki: kiA.value, tauMax: tauMax, tauD: 0, theta0: 30 * D2R, duration: 80, dt: DEF.dt, clampFrac: pidD.clampFrac };
        const rows = [];
        VAR.forEach(function (v) {
          const s = v.id === 'gated' ? singleAxisGated(Object.assign({ gateRad: gate * D2R }, base)) : A.sim.singleAxis(Object.assign({ intMode: v.id }, base));
          const n = s.t.length, th = new Float64Array(n), it = new Float64Array(n);
          for (let k = 0; k < n; k++) { th[k] = s.theta[k] * R2D; it[k] = kiA.value * s.I[k] * 1000; }
          pA.set(v.id, s.t, th); pI.set(v.id, s.t, it);
          const m = stepMetrics(s.t, th, 30, band);
          rows.push([v.label, f(m.overshoot, { sig: 3 }) + '%', secs(m.settle), f(m.final, { sig: 2, unit: '°' })]);
        });
        tabA.textContent = '';
        tabA.appendChild(ui.table([{ key: 'v', label: 'Variant' }, { key: 'o', label: 'Overshoot', num: true }, { key: 's', label: 'Settling into ±2°', num: true }, { key: 'f', label: 'Error at 80 s', num: true }],
          rows, { caption: '30° step on the y axis, Kiθ = ' + kiA.value, rowHeaders: true, compact: true }));
        tabA.appendChild(el('p', { class: 'status-line' }, 'The actuator saturates for well under a second here; the integrator charges up during the whole slow approach, so freezing it only while saturated changes little. Bounding it (the clamp) or not starting it until near the target (the gate) removes the overshoot.'));
      });
    }
    kiA.on('change', ui.debounce(runA, 80));
    runA();

    /* ---- tab B */
    const ctlB = el('div', { class: 'widget-controls' });
    panelB.appendChild(ctlB);
    const clampB = ui.toggle({ id: 'w53-clamp', label: 'Site clamp |Ki·I| ≤ 10% τmax', checked: true, tag: 'site', help: 'Switch it off to see what the project’s NOMINAL-only gate protects against.' });
    ctlB.appendChild(clampB.el);
    const M = { left: 56 };
    const bB1 = el('div'), bB2 = el('div');
    panelB.appendChild(bB1); panelB.appendChild(bB2);
    const pE = A.plot.line(bB1, { height: 210, title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', margin: M,
      series: [{ id: 'nominal', label: "gate 'nominal' (project)", color: '--axis-z', width: 2, unit: 'deg' }, { id: 'always', label: "gate 'always'", color: '--axis-x', dash: [6, 4], width: 2, unit: 'deg' }],
      hlines: [{ y: band, label: 'REQ-F2 ' + band + '°', color: '--line-req' }] });
    const pB = A.plot.line(bB2, { height: 170, title: 'Integral torque |Ki·I|', xLabel: 't (s)', yLabel: '|Ki·I| (mN m)', margin: M,
      series: [{ id: 'nominal', label: "gate 'nominal' (project)", color: '--axis-z', width: 2, unit: 'mN m' }, { id: 'always', label: "gate 'always'", color: '--axis-x', dash: [6, 4], width: 2, unit: 'mN m' }], legend: false });
    const tl1Box = el('div'), tl2Box = el('div');
    panelB.appendChild(tl1Box); panelB.appendChild(tl2Box);
    const tl1 = A.plot.timeline(tl1Box, { title: "Modes, gate 'nominal'", margin: M });
    const tl2 = A.plot.timeline(tl2Box, { title: "Modes, gate 'always'", margin: M, legend: false });
    const all = [pE, pB, tl1, tl2];
    all.forEach(function (p) { p.onSeek(function (x) { all.forEach(function (q) { q.setCursor(x); }); }); });
    const tabB = el('div');
    panelB.appendChild(tabB);

    function runB() {
      guarded(panelB, function () {
        const rows = [];
        ['nominal', 'always'].forEach(function (g, gi) {
          const r = A.sim.run(A.params.merge(A.presets.get('T03'), { pid: { gate: g, clampFrac: clampB.value ? pidD.clampFrac : null } }));
          const Ki = r.config.pid.Ki;
          pE.set(g, r.t, r.errDeg);
          pB.set(g, r.t, norm3(r.integ, r.n, Ki * 1000));
          const tl = gi ? tl2 : tl1;
          tl.set({ segments: A.modes.runLengths(r.mode, r.t), faults: faultWindows(r), events: r.events.map(function (e) { return e.t; }) });
          const f2 = A.req.byId(r.req, 'F2');
          rows.push([g === 'nominal' ? "'nominal' (project)" : "'always'", String(r.metrics.entries.length), secs(r.metrics.settle), ui.badge(f2.status), f(r.metrics.final.errDeg, { sig: 2, unit: '°' })]);
        });
        tabB.textContent = '';
        tabB.appendChild(ui.table([{ key: 'g', label: 'Integrator gate' }, { key: 'e', label: 'Safe-mode entries', num: true }, { key: 's', label: 'Settling', num: true },
          { key: 'f', label: 'REQ-F2' }, { key: 'x', label: 'Final error', num: true }], rows, { caption: 'Preset T03, clamp ' + (clampB.value ? 'on' : 'off'), rowHeaders: true, compact: true }));
      });
    }
    clampB.on('change', runB);
    runB();
  }

  /* ================================================================ W5.4 LQR tuner and Bellman sweep */

  function buildLqr() {
    const w = parts('w-lqr');
    const L = DEF.lqr, tauMax = DEF.tauMax, LIM = A.params.LIMITS, sm = DEF.safeMode;
    const q1 = ui.slider({ id: 'w54-q1', label: 'qθ (attitude weight)', min: 0.02, max: 200, value: L.qTheta, log: true, tag: 'project' });
    const q2 = ui.slider({ id: 'w54-q2', label: 'qω (rate weight)', min: 0.0015, max: 15, value: L.qW, log: true, tag: 'project' });
    const rr = ui.slider({ id: 'w54-r', label: 'r (torque weight)', min: 20, max: 200000, value: L.r, log: true, tag: 'project' });
    const reset = ui.button({ label: 'Project weights', icon: 'reset', small: true });
    [q1, q2, rr].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Reset'), reset));

    const gainBox = el('div');
    w.out.appendChild(gainBox);
    const badgeBox = el('div');
    w.out.appendChild(badgeBox);
    const badges = ui.reqBadges(badgeBox, { notes: { L1: 'single run; verified statistically by Monte Carlo in module 09' } });
    const set = readouts(w.out, ['Settling', 'Peak rate', 'Margin to 15 deg/s', 'Peak torque']);
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div'), b3 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid); w.out.appendChild(b3);
    const M = { left: 56 };
    const pE = A.plot.line(b1, { height: 190, title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', margin: M, x: { min: 0, max: 40 },
      series: [{ id: 'e', label: 'error', color: '--accent', width: 2, unit: 'deg' }], hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req' }] });
    const pW = A.plot.line(b2, { height: 190, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M, x: { min: 0, max: 40 },
      series: [{ id: 'w', label: '|ω|', color: '--axis-y', width: 2, unit: 'deg/s' }],
      hlines: [{ y: LIM.rateMaxDeg, label: 'REQ-S1 ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req' }, { y: sm.enterRateDeg, label: sm.enterRateDeg + ' deg/s safe-mode entry', color: '--line-thr', dash: [2, 3] }] });
    const pT = A.plot.line(b3, { height: 170, title: 'Torque per axis', xLabel: 't (s)', yLabel: 'τ (mN m)', margin: M, x: { min: 0, max: 40 }, y: { symmetric: true },
      series: [{ id: 'x', label: 'τx', color: '--axis-x', unit: 'mN m' }, { id: 'y', label: 'τy', color: '--axis-y', dash: [6, 4], unit: 'mN m' }, { id: 'z', label: 'τz', color: '--axis-z', dash: [1.5, 3], width: 2, unit: 'mN m' }],
      hlines: [{ y: tauMax * 1000, label: '±' + tauMax * 1000 + ' mN m', color: '--line-req' }, { y: -tauMax * 1000, color: '--line-req' }] });
    [pE, pW, pT].forEach(function (p) { p.onSeek(function (x) { [pE, pW, pT].forEach(function (q) { q.setCursor(x); }); }); });

    function gainsTable() {
      const rows = DEF.J.map(function (Ji, i) {
        const g = A.lqr.axisGains(Ji, q1.value, q2.value, rr.value), cl = A.lqr.closedLoop(Ji, g.kTheta, g.kW);
        return ['xyz'[i], f(g.kTheta, { sig: 3 }), f(g.kW, { sig: 3 }), f(cl.wn, { sig: 3 }), f(cl.zeta, { sig: 3 }), f(A.lqr.saturationAngleDeg(g.kTheta, tauMax), { sig: 3, unit: '°' })];
      });
      gainBox.textContent = '';
      gainBox.appendChild(ui.table([{ key: 'a', label: 'Axis' }, { key: 'kt', label: 'Kθ (N m/rad)', num: true }, { key: 'kw', label: 'Kω (N m s/rad)', num: true },
        { key: 'wn', label: 'ωn (rad/s)', num: true }, { key: 'z', label: 'ζ', num: true }, { key: 's', label: 'Saturates above', num: true }], rows,
      { caption: 'Closed-form LQR gains for qθ = ' + q1.value + ', qω = ' + q2.value + ', r = ' + rr.value, rowHeaders: true, compact: true }));
    }
    function run() {
      gainsTable();
      guarded(w.out, function () {
        const r = A.sim.run(A.params.merge(A.presets.get('T02'), { lqr: { qTheta: q1.value, qW: q2.value, r: rr.value } }));
        pE.set('e', r.t, r.errDeg);
        pW.set('w', r.t, r.rateDeg);
        pT.set('x', r.t, axis(r.tau, r.n, 0, 1000)); pT.set('y', r.t, axis(r.tau, r.n, 1, 1000)); pT.set('z', r.t, axis(r.tau, r.n, 2, 1000));
        badges.update(r.req);
        const m = r.metrics;
        set([secs(m.settle), f(m.peakRate, { fixed: 2, unit: 'deg/s' }) + (m.peakRate > sm.enterRateDeg ? ' (would trip safe mode)' : ''),
          f(m.margin, { fixed: 2, unit: 'deg/s' }), f(m.maxTau * 1000, { sig: 3, unit: 'mN m' })]);
        pW.summary('Rate norm for the T02 slew with the chosen weights: peak ' + f(m.peakRate, { fixed: 2 }) + ' deg/s, margin ' + f(m.margin, { fixed: 2 }) + ' deg/s to the 15 deg/s limit.');
      });
    }
    const go = ui.debounce(run, 200);
    [q1, q2, rr].forEach(function (c) { c.on('change', go); });
    reset.addEventListener('click', function () { q1.set(L.qTheta); q2.set(L.qW); rr.set(L.r); run(); });
    run();

    /* ---- Bellman sweep */
    w.out.appendChild(el('h4', { class: 'w54-h' }, 'Bellman sweep: value iteration on the y axis'));
    const ctlS = el('div', { class: 'widget-controls' });
    w.out.appendChild(ctlS);
    const dtSel = ui.segmented({ id: 'w54-dt', label: 'Discrete step Δt', value: '0.1', options: [{ value: '0.1', label: '0.1 s' }, { value: '0.05', label: '0.05 s' }, { value: '0.01', label: '0.01 s' }] });
    const runS = ui.button({ label: 'Run Bellman sweep', kind: 'primary', icon: 'play' });
    ctlS.appendChild(dtSel.el);
    ctlS.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Sweep'), runS));
    const sBox = el('div');
    w.out.appendChild(sBox);
    const pS = A.plot.line(sBox, { height: 200, title: 'Gain after k sweeps from P₀ = 0', xLabel: 'sweep k', yLabel: 'gain', margin: M,
      series: [{ id: 'kt', label: 'Kθ,k (N m/rad)', color: '--axis-x', width: 2 }, { id: 'kw', label: 'Kω,k (N m s/rad)', color: '--axis-z', width: 2, dash: [6, 4] }] });
    const sStatus = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(sStatus);
    let raf = 0;
    function sweep(animate) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const dt = Number(dtSel.value), N = dt >= 0.1 ? 300 : dt >= 0.05 ? 600 : 3000, Jy = DEF.J[1];
      const K = A.lqr.dareSweep(Jy, q1.value, q2.value, rr.value, dt, N);
      const g = A.lqr.axisGains(Jy, q1.value, q2.value, rr.value);
      const ks = new Float64Array(N), kt = new Float64Array(N), kw = new Float64Array(N);
      for (let i = 0; i < N; i++) { ks[i] = i + 1; kt[i] = K[i][0]; kw[i] = K[i][1]; }
      pS.setX(0, N);
      pS.setLines({ hlines: [{ y: g.kTheta, label: 'continuous Kθ ' + f(g.kTheta, { sig: 3 }), color: '--axis-x', dash: [2, 3] }, { y: g.kW, label: 'continuous Kω ' + f(g.kW, { sig: 3 }), color: '--axis-z', dash: [2, 3] }] });
      const fin = K[N - 1];
      const conv = K.convergedAt;
      // first sweep at which the gain is within 1e-4 (relative) of its final value: the policy has converged
      let pol = N;
      for (let i = N - 1; i >= 0; i--) { if (Math.abs(K[i][0] - fin[0]) > 1e-4 * fin[0] || Math.abs(K[i][1] - fin[1]) > 1e-4 * fin[1]) { pol = i + 2; break; } }
      const done = 'Converged gain [' + f(fin[0], { sig: 4 }) + ', ' + f(fin[1], { sig: 4 }) + '] against the continuous [' + f(g.kTheta, { sig: 4 }) + ', ' + f(g.kW, { sig: 4 }) + ']. ' +
        'The gain is within 0.01% of its final value after ' + pol + ' sweeps; P itself settles to 10⁻¹³ after ' + (conv === null ? 'more than ' + N : conv + 1) + ' sweeps.';
      if (!animate || ui.prefersReducedMotion()) {
        pS.set('kt', ks, kt); pS.set('kw', ks, kw); sStatus.textContent = done; return;
      }
      const t0 = performance.now(), dur = 1600;
      function frame(now) {
        const m = Math.max(1, Math.min(N, Math.round(N * (now - t0) / dur)));
        pS.set('kt', ks, kt, { n: m }); pS.set('kw', ks, kw, { n: m });
        if (m < N) { sStatus.textContent = 'Sweep ' + m + ' of ' + N + '…'; raf = requestAnimationFrame(frame); }
        else { raf = 0; sStatus.textContent = done; ui.announce('Bellman sweep finished.'); }
      }
      raf = requestAnimationFrame(frame);
    }
    runS.addEventListener('click', function () { sweep(true); });
    dtSel.on('change', function () { sweep(false); });
    sweep(false);
  }

  /* ================================================================ W5.5 decision matrix */

  function buildDecision() {
    const w = parts('w-decision');
    const runs = guarded(w.out, function () { return { pid: A.sim.run(A.presets.get('T01')), lqr: A.sim.run(A.presets.get('T02')) }; });
    if (!runs) return;
    const C = [
      { id: 'settle', label: 'Settling time', unit: 's', lower: true, get: function (m) { return m.settle; }, show: function (v) { return f(v, { fixed: 2, unit: 's' }); } },
      { id: 'peakErr', label: 'Peak error', unit: 'deg', lower: true, get: function (m) { return m.peakErr; }, show: function (v) { return f(v, { fixed: 2, unit: '°' }); } },
      { id: 'maxTau', label: 'Maximum torque', unit: 'mN m', lower: true, get: function (m) { return m.maxTau * 1000; }, show: function (v) { return f(v, { fixed: 2, unit: 'mN m' }); } },
      { id: 'effort', label: 'Control effort', unit: 'N² m² s', lower: true, get: function (m) { return m.effort; }, show: function (v) { return ui.fmtSci(v, 2) + ' N² m² s'; } },
      { id: 'margin', label: 'Safety margin', unit: 'deg/s', lower: false, get: function (m) { return m.margin; }, show: function (v) { return f(v, { fixed: 2, unit: 'deg/s' }); } }
    ];
    const sliders = C.map(function (c) { return ui.slider({ id: 'w55-' + c.id, label: 'Weight: ' + c.label.toLowerCase(), min: 0, max: 5, step: 1, value: 1 }); });
    sliders.forEach(function (s) { w.controls.appendChild(s.el); });
    function preset(weights) { sliders.forEach(function (s, i) { s.set(weights[i]); }); update(); }
    const bSafe = ui.button({ label: 'Favour safety margin', small: true, onClick: function () { preset([1, 1, 1, 1, 5]); } });
    const bFast = ui.button({ label: 'Favour fast settling', small: true, onClick: function () { preset([5, 1, 1, 1, 1]); } });
    const bEq = ui.button({ label: 'Equal weights', small: true, kind: 'ghost', onClick: function () { preset([1, 1, 1, 1, 1]); } });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Weight presets'), el('div', { class: 'btn-row' }, bSafe, bFast, bEq)));
    const verdict = el('div', { class: 'w55-verdict', 'aria-live': 'polite' });
    const tbl = el('div');
    w.out.appendChild(verdict);
    w.out.appendChild(tbl);
    const vals = C.map(function (c) { return { pid: c.get(runs.pid.metrics), lqr: c.get(runs.lqr.metrics) }; });

    function update() {
      let sP = 0, sL = 0, sw = 0;
      const rows = C.map(function (c, i) {
        const v = vals[i], wt = sliders[i].value;
        const tie = Math.abs(v.pid - v.lqr) <= 1e-9 * Math.max(Math.abs(v.pid), Math.abs(v.lqr), 1e-30);
        const pidBetter = c.lower ? v.pid < v.lqr : v.pid > v.lqr;
        const scP = tie ? 1 : (pidBetter ? 1 : 0), scL = tie ? 1 : (pidBetter ? 0 : 1);
        sP += wt * scP; sL += wt * scL; sw += wt;
        return [c.label + (c.lower ? ' (lower is better)' : ' (higher is better)'), c.show(v.pid), c.show(v.lqr), tie ? 'tie' : (pidBetter ? 'PID' : 'LQR'), String(wt), String(wt * scP), String(wt * scL)];
      });
      rows.push([el('strong', null, 'Weighted total'), '', '', '', String(sw), el('strong', null, String(sP)), el('strong', null, String(sL))]);
      tbl.textContent = '';
      tbl.appendChild(ui.table([{ key: 'c', label: 'Criterion' }, { key: 'p', label: 'PID (T01)', num: true }, { key: 'l', label: 'LQR (T02)', num: true }, { key: 'b', label: 'Better' },
        { key: 'w', label: 'Weight', num: true }, { key: 'sp', label: 'PID score', num: true }, { key: 'sl', label: 'LQR score', num: true }], rows,
      { caption: 'T01 and T02, safe mode off: the project’s five criteria', rowHeaders: true, compact: true }));
      verdict.textContent = '';
      if (sw === 0) { verdict.appendChild(el('p', null, 'All weights are zero: nothing is valued, so there is no winner.')); return; }
      const winner = sP > sL ? 'PID' : sL > sP ? 'LQR' : null;
      verdict.appendChild(el('p', { class: 'w55-winner' }, ui.badge(winner ? 'pass' : 'na', winner ? 'Winner: ' + winner : 'Tie'),
        ' PID ' + f(100 * sP / sw, { sig: 3 }) + '% against LQR ' + f(100 * sL / sw, { sig: 3 }) + '% of the available weighted score.'));
    }
    sliders.forEach(function (s) { s.on('change', update); });
    update();
  }

  /* ================================================================ derived numbers in the prose */

  function fillCalc() {
    const kd = DEF.detumble.Kd, td = DEF.disturbance;
    const ball = Math.hypot(td[0], td[1], td[2]) / kd * R2D;
    const pid = DEF.pid, Jy = DEF.J[1];
    const lhs = pid.Kd * pid.Kp / 2, rhs = Jy * pid.Ki / 2;
    ui.qsa('.calc[data-calc]').forEach(function (s) {
      const k = s.getAttribute('data-calc');
      if (k === 'ball') s.textContent = f(ball, { sig: 2, unit: 'deg/s' });
      else if (k === 'rh') s.textContent = '\\(K_dK_{p\\theta}=' + texSci(lhs, 2) + '\\) against \\(J K_{i\\theta}=' + texSci(rhs, 2) + '\\), a factor of ' + f(lhs / rhs, { sig: 2 }) + ' to spare';
    });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm05' });
    fillCalc();
    buildEnergy();
    buildStepLab();
    buildPoles();
    buildWindup();
    buildLqr();
    buildDecision();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'Why can’t P-only control hold attitude on \\(1/(Js^2)\\)?',
        options: ['The gain is too small.', 'The closed-loop poles sit on the imaginary axis, so it oscillates undamped.', 'The disturbance is too large.'], correct: 1,
        explain: 'With \\(\\tau=-K\\theta\\) the closed loop is \\(Js^2+K=0\\), so \\(s=\\pm j\\sqrt{K/J}\\) for every K: a pure oscillation. Only rate feedback (\\(K_d\\)) moves the poles into the left half-plane.' },
      { q: 'At what error does the project LQR’s attitude term alone saturate the wheels?',
        options: ['About 2°.', 'About 15°.', 'About 5.4°.'], correct: 2,
        explain: '\\(K_\\theta=\\sqrt{2/2000}=0.0316\\) N m/rad, and 0.003 N m ÷ 0.0316 N m/rad = 0.095 rad ≈ 5.44°. Above that the linear design no longer describes the loop.' },
      { q: 'Without integral action, a constant disturbance leaves…',
        options: ['a steady attitude error \\(\\tau_d/K_{p\\theta}\\).', 'a growing error.', 'no error.'], correct: 0,
        explain: 'At steady state the PD torque must cancel the disturbance, and it can only do that from a constant error: \\(K_{p\\theta}\\,\\theta_{ss}=\\tau_d\\). With the site gains that is about 0.15° for the full three-axis disturbance, and 0.115° on one axis pushed by 2×10⁻⁵ N m, as in the step-response lab.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm05');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
