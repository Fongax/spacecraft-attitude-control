/**
 * simulator.js: simulator.html (package P2): the control panel, runs, playback, plots,
 * annunciator, requirement badges, metrics, pinned comparison, URL hash, CSV, and the
 * teaching sections (live experiment numbers, model worked numbers, subjects behind each
 * panel, quiz and parameter provenance).
 *
 * One ADCS.sim.run per scenario is the single source of truth: the 3D view, HUD, plots,
 * annunciator, badges, metrics and CSV all read the same logged result. Inputs re-run the
 * simulation 200 ms after the last change.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const page = A.simPage = A.simPage || {};
  const D2R = A.units.D2R, R2D = A.units.R2D;

  const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20];
  const DT_CHOICES = [0.005, 0.01, 0.02, 0.05];
  const RUN_DEBOUNCE_MS = 200;
  const PLOT_LEFT = 58;                 // shared left margin so every time cursor lines up
  const DOM_EVERY_MS = 80;              // HUD/annunciator refresh while playing
  const MAX_CSV_ROWS = 30001;
  const EPS = Number.EPSILON;           // 2.2e-16, the spacing of doubles near 1
  const ROUNDING_MAX = 1e-14;           // a norm error below this is rounding, not integrator drift
  function roundingSteps(x) { const k = Math.max(1, Math.round(x / EPS)); return k === 1 ? 'one rounding step' : k + ' rounding steps'; }
  const DEFAULT_PRESET = 'T03';
  const PRESET_SHORT = {
    T01: 'T01 · PID nominal', T02: 'T02 · LQR nominal', T03: 'T03 · upset and fault', FAULT: 'FAULT · fault-only entry',
    HIGHRATE: 'HIGHRATE · fast upset', LQRSAFE: 'LQRSAFE · LQR, safe mode', SPINX: 'SPINX · free spin, x', SPINY: 'SPINY · free spin, y',
    SPINZ: 'SPINZ · free spin, z', ESTKF: 'ESTKF · Kalman (ext.)', ESTNOISY: 'ESTNOISY · noisy (ext.)'
  };
  const MODE_NAMES = A.modes.NAMES;

  function $(id) { return document.getElementById(id); }
  function clone(x) { return A.params.clone(x); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function f(x, d, unit) { return ui.fmt(x, { fixed: d, unit: unit }); }
  function sec(x) { return x === null || x === undefined ? '–' : f(x, 2, 's'); }
  function num6(x) {
    const v = Number(Number(x).toPrecision(6));
    return (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential() : String(v);
  }
  function resolvePreset(id) { return A.sim.resolveConfig(A.presets[id]); }
  function moduleLink(id, text) {
    const m = A.data.module(id);
    if (!m) return document.createTextNode(text || id);
    return el('a', { href: m.slug }, text || (String(m.num).padStart(2, '0') + ' ' + m.title));
  }
  function faultWindows(r) {
    const out = [];
    let start = -1;
    for (let k = 0; k <= r.n; k++) {
      const on = k < r.n && r.fault[k];
      if (on && start < 0) start = k;
      if (!on && start >= 0) { out.push({ t0: r.t[start], t1: r.t[Math.min(k, r.n - 1)] }); start = -1; }
    }
    return out;
  }

  /* ================================================================ LOCAL hash keys */

  // LOCAL (request P0): ADCS.hash has no keys for the SAFE_HOLD gains, the integrator clamp
  // toggle or the sensor-model parameters, so a copied link could not reproduce those edits.
  // These extra keys ride alongside ADCS.hash.encode output; ADCS.hash.decode ignores them.
  //   hold=Kp,Kd   clamp=0|1   gyro=sigma,bx,by,bz (deg/s)   st=sigma (deg),rateHz   cf=kc,kb   nseed=n
  const LOCAL_KEYS = ['hold', 'clamp', 'gyro', 'st', 'cf', 'nseed'];
  function encodeLocal(cfg, base) {
    const parts = [];
    function nums(a) { return a.map(num6).join(','); }
    if (!same([cfg.hold.Kp, cfg.hold.Kd], [base.hold.Kp, base.hold.Kd])) parts.push('hold=' + nums([cfg.hold.Kp, cfg.hold.Kd]));
    if ((cfg.pid.clampFrac === null) !== (base.pid.clampFrac === null)) parts.push('clamp=' + (cfg.pid.clampFrac === null ? '0' : '1'));
    const s = cfg.sensors, b = base.sensors;
    const g = [s.gyroNoiseDeg].concat(s.gyroBiasDeg), gb = [b.gyroNoiseDeg].concat(b.gyroBiasDeg);
    if (!same(g, gb)) parts.push('gyro=' + nums(g));
    if (!same([s.stNoiseDeg, s.stRateHz], [b.stNoiseDeg, b.stRateHz])) parts.push('st=' + nums([s.stNoiseDeg, s.stRateHz]));
    if (!same([s.kc, s.kb], [b.kc, b.kb])) parts.push('cf=' + nums([s.kc, s.kb]));
    if (s.seed !== b.seed) parts.push('nseed=' + num6(s.seed));
    return parts.join('&');
  }
  function decodeLocal(str) {
    const d = {};
    str.split('&').forEach(function (part) {
      const eq = part.indexOf('=');
      if (eq < 1) return;
      let key, val;
      try { key = decodeURIComponent(part.slice(0, eq)); val = decodeURIComponent(part.slice(eq + 1)); } catch (e) { return; }
      if (LOCAL_KEYS.indexOf(key) < 0) return;
      const a = val.split(',').map(function (x) { return x.trim() === '' ? NaN : Number(x); });
      const ok = function (len) { return a.length === len && a.every(function (x) { return isFinite(x); }); };
      if (key === 'hold' && ok(2)) d.hold = { Kp: a[0], Kd: a[1] };
      else if (key === 'clamp' && (val === '0' || val === '1')) { d.pid = d.pid || {}; d.pid.clampFrac = val === '1' ? A.params.DEFAULTS.pid.clampFrac : null; }
      else if (key === 'gyro' && ok(4)) { d.sensors = d.sensors || {}; d.sensors.gyroNoiseDeg = a[0]; d.sensors.gyroBiasDeg = a.slice(1); }
      else if (key === 'st' && ok(2)) { d.sensors = d.sensors || {}; d.sensors.stNoiseDeg = a[0]; d.sensors.stRateHz = a[1]; }
      else if (key === 'cf' && ok(2)) { d.sensors = d.sensors || {}; d.sensors.kc = a[0]; d.sensors.kb = a[1]; }
      else if (key === 'nseed' && ok(1)) { d.sensors = d.sensors || {}; d.sensors.seed = a[0]; }
    });
    return d;
  }

  /* ================================================================ the app */

  function createApp() {
    const S = {
      cfg: null, base: DEFAULT_PRESET, result: null, runMs: 0, pinned: null,
      t: 0, playing: false, loop: false, speed: 2, raf: 0, lastFrame: 0, lastDom: 0,
      lastHash: null, faultBad: false, distMode: 'nominal', firstRun: true
    };
    const reduced = ui.prefersReducedMotion();
    const desk = window.matchMedia && window.matchMedia('(min-width: 1100px)').matches;
    const binds = [];
    const errHost = $('sim-run-error');
    const runStatus = $('sim-run-status');
    const actionStatus = $('sim-action-status');

    function bind(ctrl, get, set) {
      binds.push({ ctrl: ctrl, get: get });
      ctrl.on('change', function (v) { set(v); edited(); });
      return ctrl;
    }

    /* ------------------------------------------------------------ control groups */
    const groupsHost = $('sim-groups');
    function group(num, title, openDesk, tag) {
      const body = el('div', { class: 'details-body' });
      const d = el('details', { class: 'disclosure sim-group', open: num === 1 || (desk && openDesk) },
        el('summary', null, el('span', { class: 'sim-group-num' }, num + '.'), ' ' + title, tag ? ui.tag(tag) : null), body);
      groupsHost.appendChild(d);
      return body;
    }
    function advanced(parent, title) {
      const d = ui.details(title || 'Advanced', false);
      d.classList.add('sim-adv');
      parent.appendChild(d);
      return d.body;
    }
    function readout(parent) { const p = el('p', { class: 'sim-readout', 'aria-live': 'polite' }); parent.appendChild(p); return p; }
    function subBlock(parent, title, tag) {
      const b = el('div', { class: 'sim-sub-block' }, title ? el('p', { class: 'sim-sub-block-title' }, title, tag ? [' ', ui.tag(tag)] : null) : null);
      parent.appendChild(b);
      return b;
    }

    /* 1. Scenario */
    const g1 = group(1, 'Scenario', true);
    // short option text: the full names do not fit the 320px panel; the purpose line below gives the full name
    const presetOptions = A.presets.ids.map(function (id) { return { value: id, label: PRESET_SHORT[id] || A.presets.meta[id].label }; }).concat([{ value: 'Custom', label: 'Custom' }]);
    const presetSel = ui.select({ id: 'sim-preset', label: 'Preset', options: presetOptions, value: DEFAULT_PRESET });
    g1.appendChild(presetSel.el);
    const presetInfo = el('p', { class: 'sim-note' });
    g1.appendChild(presetInfo);
    presetSel.on('change', function (v) { if (v !== 'Custom') loadPreset(v, 'preset'); else updatePresetUI(); });
    g1.appendChild(bind(ui.slider({ id: 'sim-dur', label: 'Duration', min: 10, max: 300, step: 1, value: 120, unit: 's', tag: 'site' }),
      function (c) { return c.duration; }, function (v) { S.cfg.duration = v; }).el);
    const g1a = advanced(g1, 'Advanced: time step');
    const dtSel = bind(ui.select({ id: 'sim-dt', label: 'Time step Δt', value: 0.01, tag: 'site', options: DT_CHOICES.map(function (v) { return { value: v, label: v + ' s' }; }),
      help: 'Control period = integration step. Larger steps run faster; timers still count whole steps.' }),
    function (c) { return c.dt; }, function (v) { S.cfg.dt = Number(v); });
    g1a.appendChild(dtSel.el);

    /* 2. Initial attitude */
    const g2 = group(2, 'Initial attitude', true, 'project');
    const eulerSliders = ['Roll φ (about x)', 'Pitch θ (about y)', 'Yaw ψ (about z)'].map(function (label, i) {
      const s = ui.slider({ id: 'sim-eul-' + i, label: label, min: -180, max: 180, step: 0.1, value: 0, unit: 'deg' });
      bind(s, function (c) { return c.q0 ? eulerOf(c.q0)[i] : c.eulerDeg[i]; }, function (v) {
        if (S.cfg.q0) { S.cfg.eulerDeg = eulerSliders.map(function (x) { return x.value; }); S.cfg.q0 = null; }
        S.cfg.eulerDeg[i] = v;
      });
      g2.appendChild(s.el);
      return s;
    });
    const attReadout = readout(g2);
    const q0Note = el('p', { class: 'sim-note' }, 'The initial attitude came as a quaternion (a Monte Carlo replay or a link). The sliders show the same attitude as 3-2-1 angles; moving one switches back to roll, pitch and yaw.');
    q0Note.hidden = true;
    g2.appendChild(q0Note);
    g2.appendChild(el('p', { class: 'sim-note' }, 'Sequence 3-2-1: yaw about z, then pitch about the new y, then roll about the new x. The project’s T01 start is 25°, −15°, 20°.'));
    function eulerOf(q) { const n = A.quat.normalize(q); return A.quat.toEuler321(n).map(function (v) { return v * R2D; }); }

    /* 3. Initial body rates */
    const g3 = group(3, 'Initial body rates', true, 'site');
    ['ωx', 'ωy', 'ωz'].forEach(function (label, i) {
      g3.appendChild(bind(ui.slider({ id: 'sim-w-' + i, label: label, min: -30, max: 30, step: 0.01, value: 0, unit: 'deg/s' }),
        function (c) { return c.w0Deg[i]; }, function (v) { S.cfg.w0Deg[i] = v; }).el);
    });
    const rateReadout = readout(g3);
    const rateWarn = el('p', { class: 'sim-warn' });
    rateWarn.hidden = true;
    g3.appendChild(rateWarn);

    /* 4. Controller */
    const g4 = group(4, 'Controller', true);
    const ctlSeg = bind(ui.segmented({ id: 'sim-ctl', label: 'Nominal controller', value: 'PID', tag: 'project',
      options: [{ value: 'PID', label: 'PID' }, { value: 'LQR', label: 'LQR' }, { value: 'DETUMBLE', label: 'Detumble only' }, { value: 'NONE', label: 'None (torque-free)' }],
      help: 'PID and LQR are the project’s controllers. “Detumble only” and “None” are site options for comparison; None turns the wheels off, so the run is a pure physics demo.' }),
    function (c) { return c.controller; }, function (v) { S.cfg.controller = v; });
    g4.appendChild(ctlSeg.el);
    const pidBlock = subBlock(g4, 'PID gains');
    [['Kp', 'Kp', 0, 0.1, 0.001, 'N m'], ['Ki', 'Ki', 0, 0.01, 0.0001, 'N m/s'], ['Kd', 'Kd', 0, 0.2, 0.001, 'N m s/rad']].forEach(function (d) {
      pidBlock.appendChild(bind(ui.slider({ id: 'sim-pid-' + d[0], label: d[1], min: d[2], max: d[3], step: d[4], value: A.params.DEFAULTS.pid[d[0]], unit: d[5], tag: 'site' }),
        function (c) { return c.pid[d[0]]; }, function (v) { S.cfg.pid[d[0]] = v; }).el);
    });
    pidBlock.appendChild(bind(ui.toggle({ id: 'sim-clamp', label: 'Integrator clamp at 10% of the torque limit', checked: true, tag: 'site',
      help: 'The integral only runs in NOMINAL (project); the clamp stops it winding up during the large T01 slew.' }),
    function (c) { return c.pid.clampFrac !== null; }, function (v) { S.cfg.pid.clampFrac = v ? A.params.DEFAULTS.pid.clampFrac : null; }).el);
    const pidTable = el('div');
    pidBlock.appendChild(pidTable);
    const lqrBlock = subBlock(g4, 'LQR weights');
    [['qTheta', 'q_θ (attitude weight)', 0.1, 20], ['qW', 'q_ω (rate weight)', 0.01, 2], ['r', 'r (torque weight)', 100, 20000]].forEach(function (d) {
      lqrBlock.appendChild(bind(ui.slider({ id: 'sim-lqr-' + d[0], label: d[1], min: d[2], max: d[3], log: true, value: A.params.DEFAULTS.lqr[d[0]], tag: 'project' }),
        function (c) { return c.lqr[d[0]]; }, function (v) { S.cfg.lqr[d[0]] = v; }).el);
    });
    const lqrTable = el('div');
    lqrBlock.appendChild(lqrTable);
    g4.appendChild(bind(ui.slider({ id: 'sim-kd-sd', label: 'Detumble gain Kd', min: 0, max: 0.2, step: 0.001, value: A.params.DEFAULTS.detumble.Kd, unit: 'N m s/rad', tag: 'site',
      help: 'SAFE_DETUMBLE law τ = −Kd ω; also the nominal law for “Detumble only”.' }),
    function (c) { return c.detumble.Kd; }, function (v) { S.cfg.detumble.Kd = v; }).el);
    const g4a = advanced(g4, 'Advanced: SAFE_HOLD gains');
    g4a.appendChild(bind(ui.slider({ id: 'sim-hold-kp', label: 'Kp_h', min: 0, max: 0.1, step: 0.001, value: A.params.DEFAULTS.hold.Kp, unit: 'N m', tag: 'site' }),
      function (c) { return c.hold.Kp; }, function (v) { S.cfg.hold.Kp = v; }).el);
    g4a.appendChild(bind(ui.slider({ id: 'sim-hold-kd', label: 'Kd_h', min: 0, max: 0.2, step: 0.001, value: A.params.DEFAULTS.hold.Kd, unit: 'N m s/rad', tag: 'site',
      help: 'SAFE_HOLD points gently toward the target: τ = −Kp_h q_e,v − Kd_h ω.' }),
    function (c) { return c.hold.Kd; }, function (v) { S.cfg.hold.Kd = v; }).el);

    /* 5. Safe mode */
    const g5 = group(5, 'Safe mode', true);
    g5.appendChild(bind(ui.toggle({ id: 'sim-safe', label: 'Safe-mode logic enabled', checked: true, tag: 'project' }),
      function (c) { return c.safeMode.enabled; }, function (v) { S.cfg.safeMode.enabled = v; }).el);
    const thrBox = el('div');
    g5.appendChild(thrBox);
    const g5a = advanced(g5, 'Advanced: the specification gap');
    g5a.appendChild(bind(ui.toggle({ id: 'sim-gap', label: 'Close the spec gap: SAFE_HOLD → SAFE_DETUMBLE on re-upset', checked: false, tag: 'option',
      help: 'The notes give no way out of SAFE_HOLD if the craft is upset again. This site option adds one, guarded by |ω| > 6 deg/s or a fault lasting 0.5 s.' }),
    function (c) { return c.safeMode.holdToDetumble; }, function (v) { S.cfg.safeMode.holdToDetumble = v; }).el);

    /* 6. Fault injection */
    const g6 = group(6, 'Fault injection', true);
    g6.appendChild(bind(ui.toggle({ id: 'sim-fault', label: 'Inject a temporary fault', checked: false, tag: 'project' }),
      function (c) { return c.fault.enabled; }, function (v) { S.cfg.fault.enabled = v; validateFault(); }).el);
    function numField(id, label, unit, tag) {
      const input = el('input', { type: 'number', id: id, min: 0, max: 300, step: 0.01, inputmode: 'decimal', 'aria-describedby': 'sim-fault-err' });
      const wrap = el('div', { class: 'field' },
        el('div', { class: 'field-head' }, el('label', { for: id, class: 'field-label' }, label, el('span', { class: 'unit' }, ' (' + unit + ')')), tag ? ui.tag(tag) : null), input);
      return { el: wrap, input: input };
    }
    const fStart = numField('sim-fault-start', 'Start', 's', 'site');
    const fEnd = numField('sim-fault-end', 'End', 's', 'site');
    g6.appendChild(el('div', { class: 'sim-fault-row' }, fStart.el, fEnd.el));
    const faultErr = el('p', { class: 'field-error', id: 'sim-fault-err', 'aria-live': 'polite' });
    g6.appendChild(faultErr);
    g6.appendChild(el('p', { class: 'sim-note' }, 'The fault is a flag only: it drives the mode logic (a fault lasting 0.5 s triggers SAFE_DETUMBLE, and SAFE_HOLD cannot return while it is active). It does not change the physics or the sensors.'));
    function validateFault() {
      const a = parseFloat(fStart.input.value), b = parseFloat(fEnd.input.value);
      let msg = '';
      if (S.cfg.fault.enabled) {
        if (!isFinite(a) || !isFinite(b)) msg = 'Enter both a start and an end time.';
        else if (a < 0 || a > 300 || b < 0 || b > 300) msg = 'Use times between 0 and 300 s.';
        else if (!(b > a)) msg = 'The fault must end after it starts.';
      }
      S.faultBad = !!msg;
      faultErr.textContent = msg;
      [fStart.input, fEnd.input].forEach(function (i) { if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
      if (!msg && isFinite(a) && isFinite(b) && b > a) { S.cfg.fault.start = a; S.cfg.fault.end = b; }
      return !msg;
    }
    [fStart.input, fEnd.input].forEach(function (inp) {
      inp.addEventListener('input', function () { validateFault(); edited(); });
    });

    /* 7. Disturbance */
    const g7 = group(7, 'Disturbance', false);
    const NOMINAL_TD = A.params.DEFAULTS.disturbance.slice();
    let customTd = NOMINAL_TD.slice();
    const distSeg = ui.segmented({ id: 'sim-dist', label: 'Disturbance torque', value: 'nominal', tag: 'project',
      options: [{ value: 'nominal', label: 'Nominal' }, { value: 'custom', label: 'Custom' }, { value: 'off', label: 'Off' }],
      help: 'Nominal is the project’s constant [2, −1, 1.5] × 10⁻⁵ N m.' });
    distSeg.on('change', function (v) {
      S.distMode = v;
      S.cfg.disturbance = v === 'nominal' ? NOMINAL_TD.slice() : v === 'off' ? [0, 0, 0] : customTd.slice();
      edited();
    });
    g7.appendChild(distSeg.el);
    const distBlock = subBlock(g7, 'Custom disturbance', 'option');
    const distSliders = ['τd,x', 'τd,y', 'τd,z'].map(function (label, i) {
      const s = ui.slider({ id: 'sim-td-' + i, label: label, min: -0.05, max: 0.05, step: 0.0005, value: NOMINAL_TD[i] * 1000, unit: 'mN m' });
      s.on('change', function (v) { customTd[i] = v / 1000; S.cfg.disturbance = customTd.slice(); edited(); });
      distBlock.appendChild(s.el);
      return s;
    });
    const distReadout = readout(g7);

    /* 8. Actuator */
    const g8 = group(8, 'Actuator', false);
    const satSeg = bind(ui.segmented({ id: 'sim-sat', label: 'Saturation', value: 'clip',
      options: [{ value: 'clip', label: 'Per-axis clip' }, { value: 'scale', label: 'Scale, keep direction' }] }),
    function (c) { return c.saturation; }, function (v) { S.cfg.saturation = v; });
    satSeg.el.appendChild(el('p', { class: 'field-help' }, ui.tag('project'), ' each axis clipped to ±3 mN m on its own. ', ui.tag('option'), ' the whole vector scaled down until the largest axis fits, so the torque keeps its direction.'));
    g8.appendChild(satSeg.el);

    /* 9. Sensors and estimation (extension) */
    const g9 = group(9, 'Sensors and estimation', false, 'extension');
    const extBanner = ui.callout('ext', null);
    extBanner.querySelector('.callout-content').appendChild(el('p', { class: 'callout-title' }, 'Beyond original scope ', ui.tag('extension')));
    extBanner.querySelector('.callout-content').appendChild(el('p', null, 'The original project fed back the true simulated state. This is a natural extension.'));
    g9.appendChild(extBanner);
    const sensSeg = bind(ui.segmented({ id: 'sim-sens', label: 'Feedback', value: 'truth', tag: 'extension',
      options: [{ value: 'truth', label: 'True state' }, { value: 'noisy', label: 'Noisy sensors, no filter' }, { value: 'complementary', label: 'Complementary filter' }, { value: 'kalman', label: 'Kalman-style filter' }] }),
    function (c) { return c.sensors.mode; }, function (v) { S.cfg.sensors.mode = v; });
    g9.appendChild(sensSeg.el);
    const sensBlock = subBlock(g9, 'Sensor models', 'extension');
    sensBlock.appendChild(bind(ui.slider({ id: 'sim-gyro-sd', label: 'Gyro noise σ', min: 0, max: 0.5, step: 0.001, value: 0.01, unit: 'deg/s' }),
      function (c) { return c.sensors.gyroNoiseDeg; }, function (v) { S.cfg.sensors.gyroNoiseDeg = v; }).el);
    ['x', 'y', 'z'].forEach(function (ax, i) {
      sensBlock.appendChild(bind(ui.slider({ id: 'sim-gyro-b' + ax, label: 'Gyro bias ' + ax, min: -0.1, max: 0.1, step: 0.001, value: 0, unit: 'deg/s' }),
        function (c) { return c.sensors.gyroBiasDeg[i]; }, function (v) { S.cfg.sensors.gyroBiasDeg[i] = v; }).el);
    });
    sensBlock.appendChild(bind(ui.slider({ id: 'sim-st-sd', label: 'Star tracker noise σ', min: 0, max: 0.5, step: 0.001, value: 0.02, unit: 'deg' }),
      function (c) { return c.sensors.stNoiseDeg; }, function (v) { S.cfg.sensors.stNoiseDeg = v; }).el);
    sensBlock.appendChild(bind(ui.slider({ id: 'sim-st-hz', label: 'Star tracker rate', min: 1, max: 10, step: 1, value: 5, unit: 'Hz' }),
      function (c) { return c.sensors.stRateHz; }, function (v) { S.cfg.sensors.stRateHz = v; }).el);
    const cfBlock = el('div', { class: 'sim-sub-block' }, el('p', { class: 'sim-sub-block-title' }, 'Complementary filter gains ', ui.tag('extension')));
    cfBlock.appendChild(bind(ui.slider({ id: 'sim-kc', label: 'k_c (attitude correction)', min: 0, max: 1, step: 0.01, value: 0.2 }),
      function (c) { return c.sensors.kc; }, function (v) { S.cfg.sensors.kc = v; }).el);
    cfBlock.appendChild(bind(ui.slider({ id: 'sim-kb', label: 'k_b (bias correction)', min: 0, max: 0.5, step: 0.005, value: 0.05, unit: '1/s' }),
      function (c) { return c.sensors.kb; }, function (v) { S.cfg.sensors.kb = v; }).el);
    sensBlock.appendChild(cfBlock);
    const seedIn = el('input', { type: 'number', id: 'sim-nseed', min: 0, step: 1, inputmode: 'numeric', value: '1' });
    sensBlock.appendChild(el('div', { class: 'field sim-number-field' },
      el('div', { class: 'field-head' }, el('label', { for: 'sim-nseed', class: 'field-label' }, 'Noise seed')), seedIn,
      el('p', { class: 'field-help' }, 'The same seed gives the same noise sequence, so runs stay reproducible.')));
    seedIn.addEventListener('change', function () {
      const v = Number(seedIn.value);
      if (seedIn.value.trim() === '' || !Number.isInteger(v) || v < 0) { seedIn.setAttribute('aria-invalid', 'true'); return; }
      seedIn.removeAttribute('aria-invalid');
      S.cfg.sensors.seed = v;
      edited();
    });
    binds.push({ ctrl: { set: function (v) { seedIn.value = String(v); seedIn.removeAttribute('aria-invalid'); } }, get: function (c) { return c.sensors.seed; } });

    /* 10. Integrator */
    const g10 = group(10, 'Integrator (for teaching)', false);
    const methSeg = bind(ui.segmented({ id: 'sim-method', label: 'Method', value: 'rk4',
      options: [{ value: 'rk4', label: 'RK4' }, { value: 'euler', label: 'Forward Euler' }] }),
    function (c) { return c.method; }, function (v) { S.cfg.method = v; });
    methSeg.el.appendChild(el('p', { class: 'field-help' }, ui.tag('project'), ' fourth-order Runge–Kutta. ', ui.tag('option'), ' forward Euler, to see the error it adds.'));
    g10.appendChild(methSeg.el);
    g10.appendChild(bind(ui.toggle({ id: 'sim-renorm', label: 'Renormalise q after each step', checked: true, tag: 'project',
      help: 'Turn it off with forward Euler and watch |q| − 1 in the HUD grow.' }),
    function (c) { return c.renormalise; }, function (v) { S.cfg.renormalise = v; }).el);

    /* ------------------------------------------------------------ actions */
    const actions = $('sim-actions');
    const runBtn = ui.button({ label: 'Run', kind: 'primary', icon: 'play', title: 'Run now (inputs also re-run automatically)', onClick: function () { runNow('button'); } });
    const resetBtn = ui.button({ label: 'Reset to preset', icon: 'reset', onClick: function () { loadPreset(S.base || DEFAULT_PRESET, 'reset'); } });
    const copyBtn = ui.button({ label: 'Copy scenario link', icon: 'link', onClick: copyLink });
    const csvBtn = ui.button({ label: 'Download CSV', icon: 'download', onClick: downloadCSV });
    const pinBtn = ui.button({ label: 'Pin run', icon: 'ring', onClick: togglePin });
    [runBtn, resetBtn].forEach(function (b) { actions.appendChild(b); });
    [pinBtn, copyBtn, csvBtn].forEach(function (b) { b.classList.add('sm'); $('sim-run-actions').appendChild(b); });
    function setPinLabel() {
      pinBtn.querySelector('.btn-label').textContent = S.pinned ? 'Unpin run' : 'Pin run';
      pinBtn.setAttribute('aria-pressed', S.pinned ? 'true' : 'false');
      pinBtn.title = S.pinned ? 'Remove the pinned comparison run' : 'Keep this run as faint dashed traces for comparison';
    }
    setPinLabel();

    /* ------------------------------------------------------------ 3D view */
    const view = page.createView($('sim-view'));

    /* ------------------------------------------------------------ time bar */
    const tb = $('sim-timebar');
    const playBtn = ui.button({ label: 'Play', kind: 'primary', icon: 'play', onClick: togglePlay });
    const backBtn = ui.button({ label: 'Back 0.1 s', icon: 'step-back', iconOnly: true, title: 'Back 0.1 s (←)', onClick: function () { step(-0.1); } });
    const fwdBtn = ui.button({ label: 'Forward 0.1 s', icon: 'step-fwd', iconOnly: true, title: 'Forward 0.1 s (→)', onClick: function () { step(0.1); } });
    const prevBtn = ui.button({ label: 'Previous mode change', icon: 'chevron-left', iconOnly: true, title: 'Previous mode change', onClick: function () { jumpEvent(-1); } });
    const nextBtn = ui.button({ label: 'Next mode change', icon: 'chevron-right', iconOnly: true, title: 'Next mode change', onClick: function () { jumpEvent(1); } });
    const loopChip = ui.chip({ label: 'Loop', pressed: false, title: 'Restart from 0 at the end' });
    loopChip.on('change', function (v) { S.loop = v; });
    const speedSel = ui.select({ id: 'sim-speed', label: 'Speed', value: 2, options: SPEEDS.map(function (v) { return { value: v, label: v + '×' }; }) });
    speedSel.on('change', function (v) { S.speed = Number(v); });
    tb.appendChild(el('div', { class: 'sim-transport' }, playBtn, backBtn, fwdBtn, prevBtn, nextBtn, loopChip.el, speedSel.el));
    const scrub = el('input', { type: 'range', id: 'sim-scrub', min: 0, max: 120, step: 0.1, value: 0, style: { '--fill': '0%' } });
    const timeOut = el('output', { for: 'sim-scrub', 'aria-hidden': 'true' });
    tb.appendChild(el('div', { class: 'sim-scrub' }, el('label', { for: 'sim-scrub' }, 'Time'), scrub, timeOut));
    tb.appendChild(el('p', { class: 'sim-keys' }, 'Inside the simulator: ', el('kbd', null, 'Space'), ' plays or pauses; ', el('kbd', null, '←'), ' and ', el('kbd', null, '→'), ' step 0.1 s.'));
    scrub.addEventListener('input', function () { seek(Number(scrub.value), { scrub: true }); });

    function setPlayBtn() {
      playBtn.textContent = '';
      playBtn.appendChild(ui.icon(S.playing ? 'pause' : 'play'));
      playBtn.appendChild(el('span', { class: 'btn-label' }, S.playing ? 'Pause' : 'Play'));
    }
    function endT() { return S.result ? S.result.t[S.result.n - 1] : 0; }
    function play() {
      if (!S.result) return;
      if (S.t >= endT() - 1e-9) { view.clearTrail(); seek(0); }
      S.playing = true;
      setPlayBtn();
      S.lastFrame = now();
      S.raf = window.requestAnimationFrame(tick);
    }
    function pause() {
      S.playing = false;
      if (S.raf) window.cancelAnimationFrame(S.raf);
      S.raf = 0;
      setPlayBtn();
      seek(S.t);
    }
    function togglePlay() { if (S.playing) pause(); else play(); }
    function tick(ts) {
      if (!S.playing) return;
      const dtw = Math.min(0.1, Math.max(0, (ts - S.lastFrame) / 1000));
      S.lastFrame = ts;
      let t = S.t + dtw * S.speed;
      if (t >= endT()) {
        if (S.loop) { t = 0; view.clearTrail(); }
        else { seek(endT()); pause(); ui.announce('Playback reached the end of the run.'); return; }
      }
      seek(t, { play: true });
      S.raf = window.requestAnimationFrame(tick);
    }
    function step(d) {
      if (S.playing) pause();
      seek(Math.round((S.t + d) * 1000) / 1000);
    }
    function jumpEvent(dir) {
      const r = S.result;
      if (!r) return;
      const evs = r.events;
      let ev = null;
      if (dir > 0) ev = evs.find(function (e) { return e.t > S.t + 1e-6; }) || null;
      else for (let i = evs.length - 1; i >= 0; i--) { if (evs[i].t < S.t - 1e-6) { ev = evs[i]; break; } }
      if (!ev) { ui.announce(dir > 0 ? 'No later mode change in this run.' : 'No earlier mode change in this run.'); return; }
      if (S.playing) pause();
      seek(ev.t);
      ui.announce('t = ' + f(ev.t, 2, 's') + ': ' + MODE_NAMES[ev.from] + ' to ' + MODE_NAMES[ev.to] + '.');
    }

    /* keyboard shortcuts inside the simulator region */
    $('sim').addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tgt = e.target, tag = tgt.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tgt.isContentEditable) return;
      if (tgt.closest && tgt.closest('.popover')) return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 0.1 : -0.1);
      }
    });

    /* ------------------------------------------------------------ annunciator, badges, metrics */
    const ann = ui.modeAnnunciator($('sim-ann'));
    const badges = ui.reqBadges($('sim-reqs'));
    const metrics = ui.metricsTable($('sim-metrics'));
    const compareHost = $('sim-compare');

    /* ------------------------------------------------------------ plots */
    const plotsHost = $('sim-plots');
    function plotBox(wide) { const b = el('div', { class: 'sim-plot-box' + (wide ? ' sim-plot-wide' : '') }); plotsHost.appendChild(b); return b; }
    const LIM = A.params.LIMITS;
    const SM = A.params.DEFAULTS.safeMode;
    const tauMax = A.params.DEFAULTS.tauMax;
    const tl = A.plot.timeline(plotBox(true), { title: 'Mode timeline', segments: [], faults: [], events: [], axis: true, margin: { left: PLOT_LEFT } });
    const errBox = plotBox(false);
    const pErr = A.plot.line(errBox, { title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', margin: { left: PLOT_LEFT },
      series: [{ id: 'e', label: 'error', color: '--accent', unit: '°', width: 1.8 }],
      hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req', dash: [5, 4] }, { y: SM.returnErrDeg, label: 'return guard ' + SM.returnErrDeg + '°', color: '--line-thr', dash: [2, 3] }] });
    const errLog = ui.toggle({ id: 'sim-err-log', label: 'Log scale', checked: false });
    errLog.on('change', function (v) { pErr.setY({ log: v }); });
    errBox.appendChild(el('div', { class: 'sim-plot-tools' }, errLog.el));
    const rateBox = plotBox(false);
    const pRate = A.plot.line(rateBox, { title: 'Rate norm |ω|', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: { left: PLOT_LEFT },
      series: [{ id: 'w', label: '|ω|', color: '--accent', unit: 'deg/s', width: 1.8 }],
      hlines: [{ y: SM.exitRateDeg, label: 'exit ' + SM.exitRateDeg + ' deg/s', color: '--line-thr', dash: [2, 3] },
        { y: SM.enterRateDeg, label: 'entry ' + SM.enterRateDeg + ' deg/s', color: '--line-thr', dash: [6, 3] },
        { y: LIM.rateMaxDeg, label: 'REQ-S1 limit ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req', dash: [5, 4] }] });
    const rateLog = ui.toggle({ id: 'sim-rate-log', label: 'Log scale', checked: false });
    rateLog.on('change', function (v) { pRate.setY({ log: v }); });
    rateBox.appendChild(el('div', { class: 'sim-plot-tools' }, rateLog.el));
    const tauBox = plotBox(true);
    const pTau = A.plot.line(tauBox, { title: 'Torque per axis', xLabel: 't (s)', yLabel: 'τ (mN m)', margin: { left: PLOT_LEFT }, y: { symmetric: true },
      series: [{ id: 'x', label: 'τx', color: '--axis-x', width: 1.6 }, { id: 'y', label: 'τy', color: '--axis-y', dash: [6, 4], width: 1.6 }, { id: 'z', label: 'τz', color: '--axis-z', dash: [1.5, 3], width: 2.2 }],
      hlines: [{ y: tauMax * 1000, label: '+' + tauMax * 1000 + ' mN m limit', color: '--line-req', dash: [5, 4] }, { y: -tauMax * 1000, label: '−' + tauMax * 1000 + ' mN m limit', color: '--line-req', dash: [5, 4] }] });
    const cmdToggle = ui.toggle({ id: 'sim-cmd', label: 'Show commanded (pre-saturation)', checked: false });
    cmdToggle.on('change', function () { updateTorqueSeries(); });
    tauBox.appendChild(el('div', { class: 'sim-plot-tools' }, cmdToggle.el));
    const mainPlots = [tl, pErr, pRate, pTau];

    /* more plots, built when first opened */
    const more = ui.details('More plots: Euler angles, quaternion, body rates and estimation', false);
    more.classList.add('sim-more');
    plotsHost.appendChild(more);
    let morePlots = null;
    more.addEventListener('toggle', function () {
      if (more.open && !morePlots) buildMorePlots();
      if (more.open) { updateMorePlots(); syncCursor(); }
    });
    function buildMorePlots() {
      const b = more.body;
      function box(wide) { const x = el('div', { class: 'sim-plot-box' + (wide ? ' sim-plot-wide' : '') }); b.appendChild(x); return x; }
      const ax = { margin: { left: PLOT_LEFT }, xLabel: 't (s)' };
      morePlots = {
        eul: A.plot.line(box(), Object.assign({ title: 'Euler angles (3-2-1)', yLabel: 'angle (deg)', series: [{ id: 'r', label: 'roll φ', color: '--axis-x' }, { id: 'p', label: 'pitch θ', color: '--axis-y', dash: [6, 4] }, { id: 'y', label: 'yaw ψ', color: '--axis-z', dash: [1.5, 3], width: 2.2 }] }, ax)),
        rates: A.plot.line(box(), Object.assign({ title: 'Body rates', yLabel: 'ω (deg/s)', y: { symmetric: true }, series: [{ id: 'x', label: 'ωx', color: '--axis-x' }, { id: 'y', label: 'ωy', color: '--axis-y', dash: [6, 4] }, { id: 'z', label: 'ωz', color: '--axis-z', dash: [1.5, 3], width: 2.2 }] }, ax)),
        quat: A.plot.line(box(), Object.assign({ title: 'Quaternion components', yLabel: 'q', y: { min: -1.05, max: 1.05 }, series: [{ id: 'q0', label: 'q0', color: '--accent', width: 1.8 }, { id: 'q1', label: 'q1', color: '--axis-x', dash: [6, 4] }, { id: 'q2', label: 'q2', color: '--axis-y', dash: [2, 3] }, { id: 'q3', label: 'q3', color: '--axis-z', dash: [8, 3, 2, 3] }] }, ax)),
        qn: A.plot.line(box(), Object.assign({ title: 'Norm error | |q| − 1 | (log scale)', yLabel: '| |q| − 1 |', y: { log: true }, series: [{ id: 'n', label: '| |q| − 1 |', color: '--warn', width: 1.6 }],
          hlines: [{ y: EPS, label: 'double-precision rounding ' + ui.fmtSci(EPS, 2), color: '--line-thr', dash: [2, 3] }] }, ax)),
        estErr: A.plot.line(box(), Object.assign({ title: 'Estimation error (extension)', yLabel: 'error (deg)', series: [{ id: 'e', label: 'estimate error', color: '--ext', unit: '°' }] }, ax)),
        estRate: A.plot.line(box(), Object.assign({ title: 'Estimated against true |ω| (extension)', yLabel: '|ω| (deg/s)', series: [{ id: 'u', label: 'what the logic saw', color: '--ext', width: 1.2, alpha: 0.85 }, { id: 'w', label: 'true', color: '--accent', dash: [6, 4], width: 1.8 }],
          hlines: [{ y: SM.exitRateDeg, label: 'exit ' + SM.exitRateDeg + ' deg/s', color: '--line-thr', dash: [2, 3] }] }, ax)),
        note: el('p', { class: 'sim-note sim-plot-wide' })
      };
      b.appendChild(morePlots.note);
      [morePlots.eul, morePlots.rates, morePlots.quat, morePlots.qn, morePlots.estErr, morePlots.estRate].forEach(function (p) {
        p.onSeek(function (t) { seek(t); });
      });
    }
    function updateMorePlots() {
      if (!morePlots || !S.result) return;
      const r = S.result, n = r.n, T = endT();
      const roll = new Float64Array(n), pit = new Float64Array(n), yaw = new Float64Array(n), qn = new Float64Array(n);
      let qMax = 0, zeros = 0;
      const wx = new Float64Array(n), wy = new Float64Array(n), wz = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const q = [r.q[4 * k], r.q[4 * k + 1], r.q[4 * k + 2], r.q[4 * k + 3]];
        const e = A.quat.toEuler321(q);
        roll[k] = e[0] * R2D; pit[k] = e[1] * R2D; yaw[k] = e[2] * R2D;
        // exact zeros cannot sit on a log axis: leave them out (NaN is a gap) rather than clamp them
        const dn = Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1);
        qn[k] = dn > 0 ? dn : NaN;
        if (dn > qMax) qMax = dn;
        if (dn === 0) zeros++;
        wx[k] = r.w[3 * k] * R2D; wy[k] = r.w[3 * k + 1] * R2D; wz[k] = r.w[3 * k + 2] * R2D;
      }
      const P = morePlots;
      [P.eul, P.rates, P.quat, P.qn, P.estErr, P.estRate].forEach(function (p) { p.setX(0, T); });
      P.eul.set('r', r.t, roll); P.eul.set('p', r.t, pit); P.eul.set('y', r.t, yaw);
      P.rates.set('x', r.t, wx); P.rates.set('y', r.t, wy); P.rates.set('z', r.t, wz);
      ['q0', 'q1', 'q2', 'q3'].forEach(function (id, i) { P.quat.set(id, r.t, r.q, { stride: 4, offset: i }); });
      // at rounding level, a fixed six-decade axis shows the values as a thin band near 10⁻¹⁶
      const rounding = qMax < ROUNDING_MAX;
      P.qn.setY(rounding ? { min: 1e-18, max: 1e-12 } : { min: null, max: null });
      P.qn.set('n', r.t, qn);
      const ext = !!r.estErrDeg;
      P.estErr.el.parentNode.hidden = !ext;
      P.estRate.el.parentNode.hidden = !ext;
      if (ext) {
        P.estErr.set('e', r.t, r.estErrDeg);
        P.estRate.set('u', r.t, r.rateDegUsed); P.estRate.set('w', r.t, r.rateDeg);
      }
      const zeroNote = zeros === n ? 'Every sample has |q| exactly 1, so the norm plot has nothing to draw.'
        : zeros === 1 ? '1 of ' + n.toLocaleString('en-GB') + ' samples has |q| exactly 1; a log scale cannot show 0, so it is left out.'
          : zeros ? zeros.toLocaleString('en-GB') + ' of ' + n.toLocaleString('en-GB') + ' samples have |q| exactly 1; a log scale cannot show 0, so they are left out.' : '';
      P.note.textContent = (ext ? '' : 'The two estimation plots appear when “Sensors and estimation” feeds back anything other than the true state. ') +
        (qMax === 0 ? '' : rounding ? 'Here | |q| − 1 | never exceeds ' + ui.fmtSci(qMax, 2) + ', ' + roundingSteps(qMax) + ' of double precision near 1, so q stays a pure rotation. '
          : 'Here | |q| − 1 | reaches ' + ui.fmtSci(qMax, 2) + ', far above double-precision rounding: q is no longer a pure rotation. ') + zeroNote;
    }
    function allPlots() {
      const list = mainPlots.slice();
      if (morePlots && more.open) list.push(morePlots.eul, morePlots.rates, morePlots.quat, morePlots.qn, morePlots.estErr, morePlots.estRate);
      return list;
    }
    function syncCursor() { allPlots().forEach(function (p) { p.setCursor(S.t); }); }
    mainPlots.forEach(function (p) { p.onSeek(function (t) { seek(t); }); });

    let tauArrays = null;
    function updateTorqueSeries() {
      const r = S.result;
      if (!r) return;
      const ids = ['cx', 'cy', 'cz'];
      if (cmdToggle.value) {
        const defs = [['cx', 'τx demanded', '--axis-x', []], ['cy', 'τy demanded', '--axis-y', [6, 4]], ['cz', 'τz demanded', '--axis-z', [1.5, 3]]];
        defs.forEach(function (d, i) {
          pTau.addSeries({ id: d[0], label: d[1], color: d[2], dash: d[3], alpha: 0.35, width: 1.2 });
          pTau.set(d[0], r.t, tauArrays.cmd[i]);
        });
      } else ids.forEach(function (id) { pTau.removeSeries(id); });
    }

    /* ------------------------------------------------------------ readouts and visibility */
    function updateReadouts() {
      const c = S.cfg;
      const q0 = c.q0 ? A.quat.normalize(c.q0) : A.quat.fromEuler321(c.eulerDeg[0] * D2R, c.eulerDeg[1] * D2R, c.eulerDeg[2] * D2R);
      const ang = R2D * A.quat.errorAngle(A.quat.errorShortest(c.qRef, q0));
      attReadout.textContent = '';
      attReadout.appendChild(document.createTextNode('Initial rotation: '));
      attReadout.appendChild(el('strong', null, f(ang, 1, '°')));
      attReadout.appendChild(document.createTextNode(' from target'));
      q0Note.hidden = !c.q0;
      const wn = Math.hypot(c.w0Deg[0], c.w0Deg[1], c.w0Deg[2]);
      rateReadout.textContent = '';
      rateReadout.appendChild(document.createTextNode('|ω₀| = '));
      rateReadout.appendChild(el('strong', null, f(wn, 2, 'deg/s')));
      rateWarn.textContent = '';
      if (wn > LIM.rateMaxDeg) {
        rateWarn.appendChild(ui.icon('warn'));
        rateWarn.appendChild(el('span', null, 'Above the REQ-S1 limit (' + LIM.rateMaxDeg + ' deg/s): the run starts outside the safety envelope.'));
      } else if (wn > c.safeMode.enterRateDeg && c.safeMode.enabled) {
        rateWarn.appendChild(ui.icon('info'));
        rateWarn.appendChild(el('span', null, 'Above the ' + c.safeMode.enterRateDeg + ' deg/s safe-mode entry rate: SAFE_DETUMBLE starts at t = 0.'));
      }
      rateWarn.hidden = !rateWarn.childNodes.length;
      const td = c.disturbance;
      distReadout.textContent = '';
      distReadout.appendChild(document.createTextNode('τd = '));
      distReadout.appendChild(el('strong', null, '[' + td.map(function (v) { return v === 0 ? '0' : ui.fmtSci(v, 2); }).join(', ') + '] N m'));
      updateGainTables();
    }
    function updateGainTables() {
      const c = S.cfg, J = c.J;
      const kp = c.pid.Kp / 2;
      const pidRows = J.map(function (Ji, i) {
        const wn = Math.sqrt(kp / Ji), z = kp > 0 ? c.pid.Kd / (2 * Math.sqrt(kp * Ji)) : NaN;
        return ['xyz'[i], f(Ji, 3), kp > 0 ? f(wn, 3) : '–', isFinite(z) ? f(z, 2) : '–'];
      });
      pidTable.textContent = '';
      pidTable.appendChild(ui.table([{ key: 'a', label: 'Axis' }, { key: 'j', label: 'J (kg m²)', num: true }, { key: 'w', label: 'ωn (rad/s)', num: true }, { key: 'z', label: 'ζ', num: true }],
        pidRows, { caption: 'Linearised PD (spring Kp/2 per rad), ignoring Ki', rowHeaders: true, compact: true }));
      pidTable.appendChild(el('p', { class: 'sim-note' }, ui.tag('derived'), ' ζ above 1 means no overshoot but a slow approach.'));
      const lq = c.lqr;
      const rows = [];
      let kth = NaN;
      J.forEach(function (Ji, i) {
        const g = A.lqr.axisGains(Ji, lq.qTheta, lq.qW, lq.r), cl = A.lqr.closedLoop(Ji, g.kTheta, g.kW);
        kth = g.kTheta;
        rows.push(['xyz'[i], f(g.kTheta, 4), f(g.kW, 4), f(cl.wn, 3), f(cl.zeta, 3)]);
      });
      lqrTable.textContent = '';
      lqrTable.appendChild(ui.table([{ key: 'a', label: 'Axis' }, { key: 'k', label: 'Kθ (N m/rad)', num: true }, { key: 'kw', label: 'Kω (N m s/rad)', num: true }, { key: 'w', label: 'ωn (rad/s)', num: true }, { key: 'z', label: 'ζ', num: true }],
        rows, { caption: 'LQR gains and closed-loop poles per axis', rowHeaders: true, compact: true }));
      lqrTable.appendChild(el('p', { class: 'sim-note' }, ui.tag('derived'), ' Saturation angle τmax/Kθ = ' + f(A.lqr.saturationAngleDeg(kth, c.tauMax), 2, '°') + ': larger errors saturate the wheels from the attitude term alone.'));
    }
    function buildThresholds() {
      const sm = A.params.DEFAULTS.safeMode;
      const rows = [
        ['Entry rate (NOMINAL → SAFE_DETUMBLE)', '|ω| > ' + sm.enterRateDeg + ' deg/s'],
        ['Fault persistence (NOMINAL → SAFE_DETUMBLE)', sm.faultPersist + ' s'],
        ['Detumble exit (→ SAFE_HOLD)', '|ω| < ' + sm.exitRateDeg + ' deg/s held ' + sm.exitHold + ' s'],
        ['Return error (→ NOMINAL)', '< ' + sm.returnErrDeg + '°'],
        ['Return rate (→ NOMINAL)', '< ' + sm.returnRateDeg + ' deg/s'],
        ['Dwell in SAFE_HOLD before return', '≥ ' + sm.dwell + ' s']
      ];
      const thr = ui.table([{ key: 'g', label: 'Guard' }, { key: 'v', label: 'Threshold', num: true }], rows, { caption: 'Thresholds (read-only)', rowHeaders: true, compact: true });
      thr.table.querySelector('caption').append(' ', ui.tag('project'));
      thrBox.appendChild(thr);
      thrBox.appendChild(el('p', { class: 'sim-note' }, ui.tag('derived'), ' Timers count whole steps: ' + A.params.PROVENANCE.find(function (p) { return p.key === 'safeMode.counters'; }).value + ' at Δt = 0.01 s.'));
    }
    buildThresholds();

    function updateVisibility() {
      const c = S.cfg;
      pidBlock.hidden = c.controller !== 'PID';
      lqrBlock.hidden = c.controller !== 'LQR';
      distBlock.hidden = S.distMode !== 'custom';
      sensBlock.hidden = c.sensors.mode === 'truth';
      cfBlock.hidden = c.sensors.mode !== 'complementary';
      fStart.input.disabled = !c.fault.enabled;
      fEnd.input.disabled = !c.fault.enabled;
    }
    function updatePresetUI() {
      const id = S.base && same(S.cfg, resolvePreset(S.base)) ? S.base : null;
      presetSel.set(id || 'Custom');
      if (id) {
        const m = A.presets.meta[id];
        presetInfo.textContent = m.label + '. Purpose: ' + m.purpose + '.';
      } else presetInfo.textContent = 'Custom scenario' + (S.base ? ', changed from ' + A.presets.meta[S.base].label : '') + '. “Reset to preset” goes back to ' + (S.base || DEFAULT_PRESET) + '.';
      return id;
    }
    function scenarioLabel() {
      const id = S.base && same(S.cfg, resolvePreset(S.base)) ? S.base : null;
      return id ? id : 'Custom' + (S.base ? ' (from ' + S.base + ')' : '');
    }
    function syncControls() {
      binds.forEach(function (b) { b.ctrl.set(b.get(S.cfg)); });
      const td = S.cfg.disturbance;
      S.distMode = same(td, NOMINAL_TD) ? 'nominal' : (td[0] === 0 && td[1] === 0 && td[2] === 0 ? 'off' : 'custom');
      if (S.distMode === 'custom') customTd = td.slice();
      distSeg.set(S.distMode);
      distSliders.forEach(function (s, i) { s.set(customTd[i] * 1000); });
      fStart.input.value = String(S.cfg.fault.start);
      fEnd.input.value = String(S.cfg.fault.end);
      validateFault();
      updateVisibility();
      updateReadouts();
      updatePresetUI();
    }
    const scheduleRun = ui.debounce(function () { runNow('edit'); }, RUN_DEBOUNCE_MS);
    function edited() {
      updateVisibility();
      updateReadouts();
      updatePresetUI();
      scheduleRun();
    }

    /* ------------------------------------------------------------ running */
    function setRunStatus(text) { runStatus.textContent = text; }
    function runNow(why) {
      scheduleRun.cancel();
      ui.clearError(errHost);
      if (S.faultBad) {
        setRunStatus('Not run: fix the fault window first.');
        if (why !== 'edit') ui.announce('Not run: the fault window is invalid.');
        return false;
      }
      let r;
      const t0 = now();
      try {
        r = A.sim.run(S.cfg);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        ui.showError(errHost, err);
        setRunStatus('Not run: ' + err.message);
        ui.announce('Not run: ' + err.message);
        return false;
      }
      S.runMs = now() - t0;
      S.result = r;
      applyResult(why);
      if (why === 'edit' || why === 'button' || why === 'preset' || why === 'reset') syncAddress();
      return true;
    }

    function applyResult(why) {
      const r = S.result, n = r.n, T = endT();
      const tx = new Float64Array(n), ty = new Float64Array(n), tz = new Float64Array(n);
      const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        tx[k] = r.tau[3 * k] * 1000; ty[k] = r.tau[3 * k + 1] * 1000; tz[k] = r.tau[3 * k + 2] * 1000;
        cx[k] = r.tauCmd[3 * k] * 1000; cy[k] = r.tauCmd[3 * k + 1] * 1000; cz[k] = r.tauCmd[3 * k + 2] * 1000;
      }
      tauArrays = { cmd: [cx, cy, cz] };
      const fw = faultWindows(r);
      const vb = fw.map(function (w) { return { x0: w.t0, x1: w.t1, color: '--band-fault', hatch: true }; });
      [pErr, pRate, pTau].forEach(function (p) { p.setX(0, T); p.setLines({ vbands: vb }); });
      pErr.set('e', r.t, r.errDeg);
      pRate.set('w', r.t, r.rateDeg);
      pTau.set('x', r.t, tx); pTau.set('y', r.t, ty); pTau.set('z', r.t, tz);
      updateTorqueSeries();
      tl.setX(0, T);
      tl.set({ segments: A.modes.runLengths(r.mode, r.t), faults: fw, events: r.events.map(function (e) { return e.t; }) });
      drawPinned();
      if (more.open) updateMorePlots();
      badges.update(r.req);
      metrics.update(r.metrics);
      updateCompare();
      scrub.max = String(T);
      if (S.t > T) S.t = T;
      view.clearTrail();
      seek(S.t);
      const req = r.req;
      const pass = req.filter(function (q) { return q.status === 'pass'; }).length;
      const fail = req.filter(function (q) { return q.status === 'fail'; }).length;
      const na = req.length - pass - fail;
      const label = scenarioLabel();
      setRunStatus(label + ': ' + n.toLocaleString('en-GB') + ' samples over ' + f(T, 0, 's') + ', computed in ' + Math.max(1, Math.round(S.runMs)) + ' ms. ' +
        pass + ' requirement check' + (pass === 1 ? '' : 's') + ' pass' + (pass === 1 ? 'es' : '') + (fail ? ', ' + fail + ' fail' + (fail === 1 ? 's' : '') : '') + (na ? ', ' + na + ' not applicable' : '') +
        '; ' + r.events.length + ' mode change' + (r.events.length === 1 ? '' : 's') + '.');
      if (why !== 'init') ui.announce('Run complete: ' + pass + ' of ' + req.length + ' requirement checks pass' + (fail ? ', ' + fail + ' fail' : '') + '.');
    }

    function seek(t, o) {
      const r = S.result;
      if (!r) return;
      const T = endT();
      const tq = Math.max(0, Math.min(T, isFinite(t) ? t : 0));
      const jump = Math.abs(tq - S.t);
      if (!(o && o.play) && (tq < S.t - 1e-9 || jump > 1)) view.clearTrail();
      S.t = tq;
      const s = A.sim.sampleAt(r, tq);
      const tnow = now();
      const dom = !(o && o.play) || tnow - S.lastDom >= DOM_EVERY_MS;
      view.update(s, r, { dom: dom });
      allPlots().forEach(function (p) { p.setCursor(tq); });
      // the thumb and the track fill move together on every call (the shared CSS defaults --fill to 50%)
      if (!(o && o.scrub)) scrub.value = String(tq);
      scrub.style.setProperty('--fill', (T > 0 ? 100 * tq / T : 0).toFixed(2) + '%');
      if (dom) {
        S.lastDom = tnow;
        ann.update(s, r);
        scrub.setAttribute('aria-valuetext', 't = ' + f(tq, 2, 's') + ', ' + MODE_NAMES[s.mode]);
        timeOut.textContent = f(tq, 2) + ' / ' + f(T, 2) + ' s';
      }
    }

    /* ------------------------------------------------------------ pinned comparison */
    function togglePin() {
      if (S.pinned) {
        S.pinned = null;
        ui.announce('Pinned run removed.');
        actionStatus.textContent = 'Pinned run removed.';
      } else if (S.result) {
        S.pinned = { r: S.result, label: scenarioLabel() };
        ui.announce('Run pinned: ' + S.pinned.label + '. Change the scenario to compare.');
        actionStatus.textContent = 'Pinned ' + S.pinned.label + '. Its error and rate now stay as dashed grey traces.';
      }
      setPinLabel();
      drawPinned();
      updateCompare();
    }
    function drawPinned() {
      [[pErr, 'errDeg'], [pRate, 'rateDeg']].forEach(function (pr) {
        pr[0].removeSeries('pin');
        if (S.pinned) {
          pr[0].addSeries({ id: 'pin', label: 'pinned: ' + S.pinned.label, color: '--text-2', dash: [5, 4], alpha: 0.7, width: 1.5 });
          pr[0].set('pin', S.pinned.r.t, S.pinned.r[pr[1]]);
        }
      });
    }
    // a word joiner inside |x| stops a line break straight after the opening bar
    function bars(s) { return s.replace(/\|([^|\s]+)\|/g, '|⁠$1⁠|'); }
    function updateCompare() {
      compareHost.textContent = '';
      compareHost.hidden = false;
      const pinned = !!(S.pinned && S.result);
      // a pinned comparison takes the full width under the metrics (three columns need the room)
      compareHost.classList.toggle('is-pinned', pinned);
      if (!pinned) {
        compareHost.appendChild(el('p', { class: 'sim-compare-empty' }, el('strong', null, 'Compare two runs. '),
          'Press Pin run, then change the scenario: the pinned run’s error and rate stay on the plots as dashed grey traces, and its metrics appear here beside the current run.'));
        return;
      }
      const a = S.pinned.r.metrics, b = S.result.metrics;
      function passCount(r) { return r.req.filter(function (q) { return q.status === 'pass'; }).length + ' of ' + r.req.length; }
      function settle(x) { return x === null ? 'not settled' : f(x, 2); }
      // units sit in the metric names, so the value columns stay narrow enough for a phone
      const rows = [
        ['Settling time (s)', settle(a.settle), settle(b.settle)],
        ['Peak error (°)', f(a.peakErr, 2), f(b.peakErr, 2)],
        [bars('Peak rate |ω| (deg/s)'), f(a.peakRate, 2), f(b.peakRate, 2)],
        [bars('Max demanded |τ| (mN m)'), f(a.maxTauCmd * 1000, 2), f(b.maxTauCmd * 1000, 2)],
        ['Control effort (N² m² s)', ui.fmtSci(a.effort, 3), ui.fmtSci(b.effort, 3)],
        ['Time saturated (%)', f(a.satFrac * 100, 1), f(b.satFrac * 100, 1)],
        ['Safe-mode entries', String(a.entries.length), String(b.entries.length)],
        ['Mode changes', String(a.transitions), String(b.transitions)],
        ['Final mode', MODE_NAMES[a.final.mode], MODE_NAMES[b.final.mode]],
        ['Final error (°)', f(a.final.errDeg, 3), f(b.final.errDeg, 3)],
        ['Requirement checks passing', passCount(S.pinned.r), passCount(S.result)]
      ];
      const t = ui.table([{ key: 'm', label: 'Metric' }, { key: 'a', label: 'Pinned', num: true }, { key: 'b', label: 'Current', num: true }],
        rows, { caption: 'Pinned run (' + S.pinned.label + ') against the current run (' + scenarioLabel() + ')', rowHeaders: true, compact: true });
      t.classList.add('sim-compare-table');
      compareHost.appendChild(t);
    }

    /* ------------------------------------------------------------ hash, links, CSV */
    /** The hash that reproduces the current scenario; withTime false leaves out the cursor time. */
    function scenarioHash(withTime) {
      const c = S.cfg;
      const baseId = S.base;
      const base = baseId ? resolvePreset(baseId) : A.sim.resolveConfig({});
      const d = { preset: baseId || 'Custom' };
      const custom = !baseId;
      if (custom || !same(c.eulerDeg, base.eulerDeg) || c.q0) d.eulerDeg = c.eulerDeg;
      if (c.q0) d.q0 = c.q0;
      if (custom || !same(c.w0Deg, base.w0Deg)) d.w0Deg = c.w0Deg;
      if (custom || c.controller !== base.controller) d.controller = c.controller;
      if (!same([c.pid.Kp, c.pid.Ki, c.pid.Kd], [base.pid.Kp, base.pid.Ki, base.pid.Kd])) d.pid = { Kp: c.pid.Kp, Ki: c.pid.Ki, Kd: c.pid.Kd };
      if (c.detumble.Kd !== base.detumble.Kd) d.detumble = { Kd: c.detumble.Kd };
      if (!same([c.lqr.qTheta, c.lqr.qW, c.lqr.r], [base.lqr.qTheta, base.lqr.qW, base.lqr.r])) d.lqr = { qTheta: c.lqr.qTheta, qW: c.lqr.qW, r: c.lqr.r };
      if (custom || c.safeMode.enabled !== base.safeMode.enabled) d.safeMode = { enabled: c.safeMode.enabled };
      if (c.safeMode.holdToDetumble !== base.safeMode.holdToDetumble) { d.safeMode = d.safeMode || {}; d.safeMode.holdToDetumble = c.safeMode.holdToDetumble; }
      if (custom || c.fault.enabled !== base.fault.enabled || (c.fault.enabled && (c.fault.start !== base.fault.start || c.fault.end !== base.fault.end))) {
        d.fault = { enabled: c.fault.enabled, start: c.fault.start, end: c.fault.end };
      }
      if (!same(c.disturbance, base.disturbance)) d.disturbance = c.disturbance;
      if (c.saturation !== base.saturation) d.saturation = c.saturation;
      if (custom || c.duration !== base.duration) d.duration = c.duration;
      if (c.dt !== base.dt) d.dt = c.dt;
      if (c.sensors.mode !== base.sensors.mode) d.sensors = { mode: c.sensors.mode };
      if (c.method !== base.method) d.method = c.method;
      if (c.renormalise !== base.renormalise) d.renormalise = c.renormalise;
      if (withTime !== false && S.t > 0) d.t = Math.round(S.t * 100) / 100;
      const extra = encodeLocal(c, base);
      return A.hash.encode(d) + (extra ? '&' + extra : '');
    }
    function writeHash(h) {
      S.lastHash = h;
      if (window.location.hash.replace(/^#/, '') !== h) window.location.hash = h;
    }
    /**
     * Keep the address bar in step with the scenario on screen after a run the reader started, so
     * reloading or bookmarking restores this run. Replaces the history entry (no new Back step) and
     * runs only after a debounced or explicit run, well inside the browsers' navigation rate limits.
     */
    function syncAddress() {
      const h = scenarioHash(false);
      if (window.location.hash.replace(/^#/, '') === h) { S.lastHash = h; return; }
      S.lastHash = h;     // set first: the location.replace fallback fires a hashchange
      try {
        window.history.replaceState(window.history.state, '', '#' + h);
      } catch (e) {
        window.location.replace('#' + h);
      }
    }
    function copyLink() {
      const h = scenarioHash();
      writeHash(h);
      ui.copyText(window.location.href).then(function (ok) {
        const msg = ok ? 'Scenario link copied. Opening it reproduces this run.' : 'Copying is blocked here; the scenario link is now in the address bar.';
        actionStatus.textContent = msg;
        ui.announce(msg);
      });
    }
    function downloadCSV() {
      const r = S.result;
      if (!r) return;
      const dec = Math.max(1, Math.ceil(r.n / MAX_CSV_ROWS));
      const name = 'adcs-run-' + scenarioLabel().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
      ui.download(name, ui.toCSV(r, { decimate: dec }));
      const msg = 'CSV download started: ' + Math.ceil(r.n / dec).toLocaleString('en-GB') + ' rows' + (dec > 1 ? ' (every ' + dec + 'th sample)' : '') + ' in display units (deg, deg/s, mN m).';
      actionStatus.textContent = msg;
      ui.announce(msg);
    }

    function snapUnsupported(cfg) {
      const notes = [];
      if (DT_CHOICES.indexOf(cfg.dt) < 0) {
        const nearest = DT_CHOICES.reduce(function (a, b) { return Math.abs(b - cfg.dt) < Math.abs(a - cfg.dt) ? b : a; });
        notes.push('Time step ' + cfg.dt + ' s is not offered here; using ' + nearest + ' s.');
        cfg.dt = nearest;
      }
      if (cfg.method !== 'rk4' && cfg.method !== 'euler') { notes.push('Integrator ' + cfg.method + ' is not offered here; using RK4.'); cfg.method = 'rk4'; }
      if (cfg.duration < 10 || cfg.duration > 300) { const d = Math.min(300, Math.max(10, cfg.duration)); notes.push('Duration limited to ' + d + ' s.'); cfg.duration = d; }
      cfg.log = true;
      cfg.logEvery = 1;
      return notes;
    }
    function loadConfig(delta, base, why) {
      let cfg;
      try {
        cfg = A.sim.resolveConfig(delta);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        ui.showError(errHost, err);
        return err;
      }
      const notes = snapUnsupported(cfg);
      S.cfg = cfg;
      S.base = base;
      syncControls();
      runNow(why);
      if (notes.length) actionStatus.textContent = notes.join(' ');
      return true;
    }
    function loadPreset(id, why) {
      if (!A.presets.get(id)) return false;
      const ok = loadConfig(A.presets.get(id), id, why) === true;
      if (ok && why === 'reset') { actionStatus.textContent = 'Reset to ' + A.presets.meta[id].label + '.'; ui.announce(actionStatus.textContent); }
      return ok;
    }
    /**
     * Parse a scenario hash. Returns null for an empty hash, {none:true} when it holds no key this
     * page recognises, otherwise {scenario, delta, base, t, mc, unknownPreset, otherKeys}.
     */
    function parseHash(h) {
      const raw = String(h || '').replace(/^#/, '');
      if (!raw) return null;
      const dec = A.hash.decode(raw);
      const extra = decodeLocal(raw);
      let unknownPreset = null;
      if (dec.preset && dec.preset !== 'Custom' && A.presets.ids.indexOf(dec.preset) < 0) { unknownPreset = dec.preset; delete dec.preset; }
      if (dec.preset === 'Custom') delete dec.preset;
      const otherKeys = Object.keys(dec).filter(function (k) { return k !== 'mc' && k !== 't' && k !== 'preset'; }).length + Object.keys(extra).length;
      const scenarioKeys = otherKeys + (dec.preset || unknownPreset ? 1 : 0);
      if (!scenarioKeys && !dec.mc && dec.t === undefined) return { none: true };
      return {
        scenario: scenarioKeys > 0,
        delta: A.params.merge(A.hash.toConfig(dec), extra),
        base: dec.preset || null, t: dec.t, mc: dec.mc,
        unknownPreset: unknownPreset, otherKeys: otherKeys
      };
    }
    function linkNote(msg, announce) {
      ui.showError(errHost, msg);
      if (announce) ui.announce(msg);
    }
    /**
     * The element a plain in-page fragment such as #main or #mc names, or null. No scenario key
     * can be written without '=', so a bare fragment that names an element is an ordinary anchor.
     */
    function pageAnchor(raw) {
      if (!raw || raw.indexOf('=') >= 0) return null;
      let id = raw;
      try { id = decodeURIComponent(raw); } catch (e) { /* keep the raw text */ }
      return document.getElementById(id);
    }
    /**
     * Opened at an anchor (simulator.html#check), the browser jumps before the sections above it
     * are built, so the target drifts down as they fill in. Keep it at the top while the page
     * grows, until the reader scrolls, presses a key or clicks, or the page has been still a moment.
     */
    function holdAnchor(target) {
      if (!target || typeof window.ResizeObserver !== 'function') return;
      const root = document.documentElement;
      const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
      let ro = null, quiet = 0, cap = 0;
      function place() {
        const prev = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';     // an instant jump, even where smooth scrolling is on
        target.scrollIntoView({ block: 'start' });
        root.style.scrollBehavior = prev;
      }
      function stop() {
        if (!ro) return;
        ro.disconnect();
        ro = null;
        clearTimeout(quiet);
        clearTimeout(cap);
        inputs.forEach(function (t) { window.removeEventListener(t, stop, true); });
      }
      ro = new ResizeObserver(function () {
        place();
        clearTimeout(quiet);
        quiet = setTimeout(stop, 1500);
      });
      ro.observe(document.body);
      inputs.forEach(function (t) { window.addEventListener(t, stop, { capture: true, passive: true }); });
      cap = setTimeout(stop, 10000);
    }
    /**
     * Load a scenario link. Returns the parsed hash, or null when the hash is empty or is an
     * in-page anchor (the browser scrolls to it; the scenario on screen and any notice stay as they are).
     */
    function loadFromHash(h, o) {
      const raw = String(h || '').replace(/^#/, '');
      if (pageAnchor(raw)) return null;
      const userNav = !S.firstRun;
      ui.clearError(errHost);
      const p = parseHash(raw);
      if (!p) return null;
      S.lastHash = raw;
      if (p.none) {
        const had = !!S.result;
        if (!had) loadPreset(DEFAULT_PRESET, 'init');
        linkNote('This link has no recognised scenario keys, so ' + (had ? 'nothing changed.' : 'the default scenario (' + DEFAULT_PRESET + ') is shown.'), userNav);
        return p;
      }
      if (p.scenario) {
        const res = loadConfig(p.delta, p.base, 'hash');
        if (res !== true) {
          // keep the current run (or start from T03) and leave the reason on screen
          if (!S.result) loadPreset(DEFAULT_PRESET, 'init');
          ui.showError(errHost, 'This link could not be loaded, so the previous scenario is still shown. ' + res.message);
          ui.announce('The link could not be loaded: ' + res.message);
        } else if (p.unknownPreset) {
          linkNote('Unknown preset “' + p.unknownPreset + '”, so ' + (p.otherKeys ? 'the link’s other settings were applied to the site defaults instead.' : 'the site defaults were loaded instead.'), userNav);
        } else if (userNav) { actionStatus.textContent = 'Loaded the scenario from the link.'; }
      } else if (!S.result) loadPreset(DEFAULT_PRESET, 'init');
      if (isFinite(p.t)) { if (S.playing) pause(); seek(p.t); }
      if (p.mc) {
        mc.setInputs(p.mc);
        $('mc').scrollIntoView({ block: 'start' });
        mc.run();
      } else if (o && o.scroll) $('sim').scrollIntoView({ block: 'start' });
      return p;
    }
    window.addEventListener('hashchange', function () {
      const h = window.location.hash.replace(/^#/, '');
      if (h === S.lastHash) return;
      loadFromHash(h, { scroll: true });
    });
    // a link to the scenario already in the address bar fires no hashchange: load it anyway
    document.getElementById('main').addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a.sim-link');
      if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute('href') || '';
      const at = href.indexOf('#');
      if (at < 0 || href.slice(0, at).replace(/^\.\//, '') !== 'simulator.html') return;
      const h = href.slice(at + 1);
      if (h === window.location.hash.replace(/^#/, '')) { e.preventDefault(); S.lastHash = null; loadFromHash(h, { scroll: true }); }
    });

    /* ------------------------------------------------------------ Monte Carlo */
    const mc = page.createMC($('mc-panel'), {
      onReplay: function (trial, opts) {
        const delta = { q0: trial.q0, w0Deg: trial.w0Deg, disturbance: trial.tauD, controller: opts.controller, duration: opts.duration,
          safeMode: { enabled: true }, fault: { enabled: false } };
        if (S.playing) pause();
        S.t = 0;
        if (loadConfig(delta, null, 'replay') !== true) return;
        writeHash(A.hash.encode({ q0: trial.q0, w0Deg: trial.w0Deg, disturbance: trial.tauD, controller: opts.controller, safeMode: { enabled: true }, duration: opts.duration }));
        actionStatus.textContent = 'Replaying Monte Carlo trial ' + trial.i + ' (base seed ' + opts.baseSeed + '): its initial attitude, rates and disturbance.';
        ui.announce(actionStatus.textContent);
        $('sim').scrollIntoView({ block: 'start' });
        if (!reduced) play();
      }
    });

    /* ------------------------------------------------------------ start */
    function start() {
      const p = loadFromHash(window.location.hash, {});
      if (!S.result) loadPreset(DEFAULT_PRESET, 'init');
      holdAnchor(pageAnchor(window.location.hash.replace(/^#/, '')));
      S.firstRun = false;
      if (!reduced && !(p && (isFinite(p.t) || p.mc))) play();
    }

    return { start: start, state: S };
  }

  /* ================================================================ teaching sections */

  function fillModel() {
    const D = A.params.DEFAULTS;
    const q = A.quat.fromEuler321(D.eulerDeg[0] * D2R, D.eulerDeg[1] * D2R, D.eulerDeg[2] * D2R);
    const ang = R2D * A.quat.errorAngle(A.quat.errorShortest(D.qRef, q));
    const K = A.lqr.axisGains(D.J[1], D.lqr.qTheta, D.lqr.qW, D.lqr.r);
    const kp = D.pid.Kp / 2, Jy = D.J[1];
    const w03 = A.presets.T03.w0Deg.map(function (v) { return v * D2R; });
    const fills = {
      t03energy: ui.fmtSci(energy(w03, D.J), 3) + ' J',
      t01q: '[' + q.map(function (v) { return f(v, 4); }).join(', ') + ']',
      t01ang: f(ang, 2, '°'),
      lqrk: f(K.kTheta, 4),
      t01tau: '[' + q.slice(1).map(function (v) { return f(-D.pid.Kp * v * 1000, 2); }).join(', ') + ']',
      satang: f(A.lqr.saturationAngleDeg(K.kTheta, D.tauMax), 2, '°')
    };
    ui.qsa('[data-fill]').forEach(function (n) { const k = n.getAttribute('data-fill'); if (fills[k]) n.textContent = fills[k]; });
    const pid = document.querySelector('[data-tex="pid"]');
    if (pid) {
      const wn = Math.sqrt(kp / Jy), z = D.pid.Kd / (2 * Math.sqrt(kp * Jy));
      pid.textContent = '\\[ \\begin{aligned} \\omega_n &= \\sqrt{\\frac{K_p/2}{J_y}} = \\sqrt{\\frac{' + kp + '}{' + Jy.toFixed(3) + '}} = ' + wn.toFixed(3) + '\\ \\text{rad/s}, \\\\ ' +
        '\\zeta &= \\frac{K_d}{2\\sqrt{(K_p/2)\\,J_y}} = \\frac{' + D.pid.Kd + '}{2\\sqrt{' + kp + '\\times' + Jy.toFixed(3) + '}} = ' + z.toFixed(2) + ' \\end{aligned} \\]';
    }
  }

  /* experiments: the numbers are computed by the engine after the page has loaded */
  function evt(r, from, to, nth) {
    const list = r.events.filter(function (e) { return e.from === A.modes[from] && e.to === A.modes[to]; });
    return list[(nth || 1) - 1] || null;
  }
  function et(r, from, to, nth) { const e = evt(r, from, to, nth); return e ? f(e.t, 2, 's') : '–'; }
  /** Times at which body-rate component `axis` changes sign (a tumble of a spin about that axis). */
  function signFlips(r, axis) {
    const out = [];
    for (let k = 1; k < r.n; k++) if ((r.w[3 * k + axis] < 0) !== (r.w[3 * (k - 1) + axis] < 0)) out.push(r.t[k]);
    return out;
  }
  function energy(w, J) { return 0.5 * (J[0] * w[0] * w[0] + J[1] * w[1] * w[1] + J[2] * w[2] * w[2]); }
  // Runs are cached so each one can be computed in its own macrotask before its card is filled.
  const runCache = new Map();
  function quick(cfg, log) {
    const c = A.params.merge(cfg, { log: !!log });
    const key = JSON.stringify(c);
    if (!runCache.has(key)) runCache.set(key, A.sim.run(c));
    return runCache.get(key);
  }
  function gapCfg() { return A.params.merge(A.presets.T03, { safeMode: { holdToDetumble: true } }); }
  function eulerCfg() { return A.params.merge(A.presets.SPINX, { method: 'euler', renormalise: false }); }
  function scaleCfg() { return A.params.merge(A.presets.T03, { saturation: 'scale' }); }
  /** The runs each experiment card needs, as {cfg, log} specs (pre-computed one per task). */
  function spec(cfg, log) { return { cfg: cfg, log: !!log }; }
  const WARM = {
    'pid-lqr': function () { return [ spec(A.presets.T01), spec(A.presets.T02) ]; },
    'lqr-safe': function () { return [ spec(A.presets.LQRSAFE), spec(A.presets.T02) ]; },
    t03: function () { return [ spec(A.presets.T03) ]; },
    gap: function () { return [ spec(A.presets.T03), spec(gapCfg()) ]; },
    spin: function () { return [ spec(A.presets.SPINX, true), spec(A.presets.SPINY, true), spec(A.presets.SPINZ, true) ]; },
    euler: function () { return [ spec(A.presets.SPINX), spec(eulerCfg()) ]; },
    sat: function () { return [ spec(A.presets.T03, true), spec(scaleCfg(), true) ]; },
    fault: function () { return [ spec(A.presets.FAULT) ]; },
    est: function () { return [ spec(A.presets.ESTKF), spec(A.presets.ESTNOISY) ]; },
    mc: function () { return []; }
  };

  const EXPERIMENTS = [
    { id: 'pid-lqr', title: 'PID against LQR', module: 'm05', tags: ['derived'],
      links: [{ label: 'T01 PID nominal', hash: 'preset=T01' }, { label: 'T02 LQR nominal', hash: 'preset=T02' }],
      try: 'Load T01, press Pin run, then load T02 and compare the dashed traces.',
      notice: function () {
        const a = quick(A.presets.T01), b = quick(A.presets.T02);
        const D = A.params.DEFAULTS, K = A.lqr.axisGains(D.J[0], D.lqr.qTheta, D.lqr.qW, D.lqr.r);
        return 'PID settles at ' + sec(a.metrics.settle) + ' with a peak rate of ' + f(a.metrics.peakRate, 2, 'deg/s') + '. LQR settles at ' + sec(b.metrics.settle) +
          ' but peaks at ' + f(b.metrics.peakRate, 2, 'deg/s') + ', only ' + f(b.metrics.margin, 2, 'deg/s') + ' below the REQ-S1 limit: its Kθ saturates the wheels above ' +
          f(A.lqr.saturationAngleDeg(K.kTheta, D.tauMax), 2, '°') + ' of error, so the whole slew runs at full torque. Both pass REQ-F2.';
      } },
    { id: 'lqr-safe', title: 'LQR meets the safe-mode logic', module: 'm05', tags: ['derived'],
      links: [{ label: 'LQRSAFE LQR with safe mode on', hash: 'preset=LQRSAFE' }],
      try: 'Load LQRSAFE and step through the mode changes with the event buttons.',
      notice: function () {
        const r = quick(A.presets.LQRSAFE), b = quick(A.presets.T02);
        return 'The fast LQR slew crosses 6 deg/s at ' + et(r, 'N', 'SD') + ', so safe mode takes over: detumbled in ' + sec(r.metrics.detumble[0]) + ', SAFE_HOLD at ' + et(r, 'SD', 'SH') +
          ', NOMINAL again at ' + et(r, 'SH', 'N') + '. The peak rate falls from ' + f(b.metrics.peakRate, 2) + ' to ' + f(r.metrics.peakRate, 2, 'deg/s') + ', but settling now takes ' + sec(r.metrics.settle) + '.';
      } },
    { id: 't03', title: 'The full safe-mode sequence', module: 'm08', tags: ['derived', 'site'],
      links: [{ label: 'T03 safe-mode upset and fault', hash: 'preset=T03' }],
      try: 'Load T03, pause near 45 s and watch the fault-persistence lamp fill.',
      notice: function () {
        const r = quick(A.presets.T03), sm = r.config.safeMode, f0 = r.config.fault;
        const sh2 = evt(r, 'SD', 'SH', 2), back = evt(r, 'SH', 'N', 2);
        const w0 = r.config.w0Deg;
        return 'The ' + f(Math.hypot(w0[0], w0[1], w0[2]), 2, 'deg/s') + ' start is above the ' + sm.enterRateDeg + ' deg/s entry rate, so SAFE_DETUMBLE begins at ' + et(r, 'N', 'SD') + '; SAFE_HOLD follows at ' + et(r, 'SD', 'SH') + ' and NOMINAL at ' + et(r, 'SH', 'N') +
          '. The fault that appears at ' + f0.start + ' s has lasted ' + sm.faultPersist + ' s (' + Math.round(sm.faultPersist / r.config.dt) + ' steps) at ' + et(r, 'N', 'SD', 2) + ', which sends the craft back to SAFE_DETUMBLE. The ' + sm.dwell + ' s dwell is complete at ' +
          (sh2 ? f(sh2.t + sm.dwell, 2, 's') : '–') + ', yet NOMINAL waits until ' + (back ? f(back.t, 2, 's') : '–') + ', when the fault clears.';
      } },
    { id: 'gap', title: 'Closing the specification gap', module: 'm08', tags: ['derived', 'option'],
      links: [{ label: 'T03 with the spec gap closed', hash: 'preset=T03&gap=1' }],
      try: 'Pin T03, then load this variant, which adds SAFE_HOLD → SAFE_DETUMBLE on a re-upset.',
      notice: function () {
        const a = quick(A.presets.T03), b = quick(gapCfg());
        const re = b.events.filter(function (e) { return e.reason === 'reupset'; }).length;
        const backA = a.events.filter(function (e) { return e.to === A.modes.N; }).pop(), backB = b.events.filter(function (e) { return e.to === A.modes.N; }).pop();
        return 'While the fault is still active, every entry to SAFE_HOLD re-triggers SAFE_DETUMBLE one step later: ' + re + ' re-upsets and ' + b.events.length + ' mode changes instead of ' + a.events.length +
          '. NOMINAL returns at ' + (backB ? f(backB.t, 2, 's') : '–') + ' instead of ' + (backA ? f(backA.t, 2, 's') : '–') + '. A new transition needs its own guard, for example a fault that newly appears rather than one still present.';
      } },
    { id: 'spin', title: 'The intermediate-axis flip', module: 'm03', tags: ['derived'],
      links: [{ label: 'SPINX', hash: 'preset=SPINX' }, { label: 'SPINY', hash: 'preset=SPINY' }, { label: 'SPINZ', hash: 'preset=SPINZ' }],
      try: 'Load each torque-free spin and watch ωx, ωy and ωz under “More plots”.',
      notice: function () {
        const J = A.params.DEFAULTS.J;
        const fx = signFlips(quick(A.presets.SPINX, true), 0), fy = signFlips(quick(A.presets.SPINY, true), 1), fz = signFlips(quick(A.presets.SPINZ, true), 2);
        function flips(list) { return list.length ? 'changes sign at ' + list.map(function (t) { return f(t, 1, 's'); }).join(' and ') : 'never changes sign'; }
        return 'With J = diag(' + J.map(function (v) { return v.toFixed(3); }).join(', ') + ') kg m², x is the intermediate axis. In SPINX the spin rate ωx ' + flips(fx) +
          ': the craft turns over. In SPINY (major axis) ωy ' + flips(fy) + ', and in SPINZ (minor axis) ωz ' + flips(fz) + ' over 200 s. REQ-S1 reads N/A because the wheels are off: a physics demo, not a verification case.';
      } },
    { id: 'euler', title: 'Forward Euler against RK4', module: 'm04', tags: ['derived', 'option'],
      links: [{ label: 'SPINX with forward Euler', hash: 'preset=SPINX&method=euler' }, { label: 'Euler without renormalisation', hash: 'preset=SPINX&method=euler&renorm=0' }],
      try: 'Load the second link and watch |q| − 1 in the HUD while it plays.',
      notice: function () {
        const cfg = A.presets.SPINX, J = A.params.DEFAULTS.J;
        const e0 = energy(cfg.w0Deg.map(function (v) { return v * D2R; }), J);
        const rk = quick(cfg), eu = quick(eulerCfg());
        const dRk = Math.abs(energy(rk.final.w, J) / e0 - 1), dEu = energy(eu.final.w, J) / e0 - 1;
        const qn = Math.hypot(eu.final.q[0], eu.final.q[1], eu.final.q[2], eu.final.q[3]);
        return 'Over 200 s, RK4 keeps the rotational energy constant to ' + ui.fmtSci(dRk, 1) + ' (relative); forward Euler gains ' + f(100 * dEu, 2, '%') +
          '. Without renormalisation Euler also inflates the quaternion: |q| reaches ' + f(qn, 4) + ', so its “rotation” is no longer a pure rotation.';
      } },
    { id: 'sat', title: 'Clip or scale the torque', module: 'm06', tags: ['derived', 'option'],
      // T03, not HIGHRATE: HIGHRATE's ω0 lies on a diagonal, where clipping and scaling give the same torque
      links: [{ label: 'T03 with per-axis clipping', hash: 'preset=T03' }, { label: 'T03 with scaling', hash: 'preset=T03&sat=scale' }],
      try: 'Pin the clipped run, load the scaled one, switch on “Show commanded” and compare the torque plot over the first 3 s.',
      notice: function () {
        const a = quick(A.presets.T03, true), b = quick(scaleCfg(), true);     // logged: the card reads the t = 0 torques
        const tm = a.config.tauMax * 1000;
        function at0(arr) { return [arr[0], arr[1], arr[2]].map(function (v) { return v * 1000; }); }
        function vec(v) { return '[' + v.map(function (x) { return f(x, Math.abs(x - Math.round(x)) < 1e-9 ? 0 : 2); }).join(', ') + '] mN m'; }
        function angle(u, v) {
          const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]));
          return R2D * Math.acos(Math.max(-1, Math.min(1, c)));
        }
        const cmd = at0(a.tauCmd), clip = at0(a.tau), scl = at0(b.tau);
        const over = cmd.filter(function (v) { return Math.abs(v) > tm + 1e-12; }).length;
        const saved = 100 * (1 - b.metrics.effort / a.metrics.effort);
        return 'At t = 0 the detumble law τ = −Kd ω asks for ' + vec(cmd) + ', beyond ' + f(tm, 0, 'mN m') + ' on ' + (over === 3 ? 'all three axes' : over + ' axes') +
          '. Clipping cuts each axis on its own to ' + vec(clip) + ': every wheel gives its full torque, but the vector turns ' + f(angle(clip, cmd), 1, '°') +
          ' away from −ω. Scaling shrinks the whole vector until the largest axis fits, ' + vec(scl) + ', still exactly along −ω. Clipping removes energy a little faster (detumbled in ' +
          sec(a.metrics.detumble[0]) + ' against ' + sec(b.metrics.detumble[0]) + '; NOMINAL at ' + et(a, 'SH', 'N') + ' against ' + et(b, 'SH', 'N') + '), while scaling uses ' +
          f(saved, 0, '%') + ' less control effort. Any torque with ω·τ < 0 detumbles; keeping the direction matters more in a pointing slew, where a turned torque rotates the craft about an axis the controller did not ask for.';
      } },
    { id: 'fault', title: 'A fault without an upset', module: 'm08', tags: ['derived', 'site'],
      links: [{ label: 'FAULT fault-triggered entry', hash: 'preset=FAULT' }],
      try: 'Load FAULT and read the annunciator’s “Last change” line at 11 s and at 21 s.',
      notice: function () {
        const r = quick(A.presets.FAULT), c = r.config;
        return 'The craft starts at only ' + f(Math.hypot(c.w0Deg[0], c.w0Deg[1], c.w0Deg[2]), 2, 'deg/s') + ', yet the fault flag from ' + c.fault.start + ' s trips safe mode at ' + et(r, 'N', 'SD') +
          '. Detumbling takes ' + sec(r.metrics.detumble[0]) + '; NOMINAL returns at ' + et(r, 'SH', 'N') + ', once the ' + c.safeMode.dwell + ' s dwell is complete and the fault (cleared at ' + c.fault.end + ' s) is gone.';
      } },
    { id: 'est', title: 'Sensors, noise and thresholds', module: 'm07', tags: ['extension', 'derived'], ext: true,
      links: [{ label: 'ESTKF Kalman-style estimator', hash: 'preset=ESTKF' }, { label: 'ESTNOISY high-noise lock-up', hash: 'preset=ESTNOISY' }],
      try: 'Load ESTKF, open “More plots”, then load ESTNOISY.',
      notice: function () {
        const a = quick(A.presets.ESTKF), b = quick(A.presets.ESTNOISY), D = A.params.DEFAULTS.sensors, s = A.presets.ESTNOISY.sensors;
        return 'The Kalman-style filter tracks the attitude to ' + f(a.metrics.estRmsDeg, 4, '°') + ' RMS and keeps T03’s mode sequence. With ' + Math.round(s.gyroNoiseDeg / D.gyroNoiseDeg) + ' times the gyro noise and ' +
          Math.round(s.stNoiseDeg / D.stNoiseDeg) + ' times the star-tracker noise, the rate the logic sees never stays below 0.5 deg/s for 2 s: the craft ends in ' + MODE_NAMES[b.metrics.final.mode] +
          ' and REQ-F2 fails, although the true rate is only ' + f(b.metrics.final.rateDeg, 2, 'deg/s') + '.';
      } },
    { id: 'mc', title: 'Sixty upsets at once', module: 'm09', tags: ['project', 'derived'],
      links: [{ label: 'Monte Carlo: 60 trials, seed 42', hash: 'mc=60,42' }],
      try: 'Run the campaign, switch the histogram to peak rate and replay the worst trial.',
      notice: function () {
        const n = A.mc.DEFAULTS.n;
        return 'With ' + n + ' passes out of ' + n + ', the one-sided 95% lower bound on the pass probability is ' + f(A.stats.cpLower(n, n, 0.95), 3) +
          ': REQ-L1 is demonstrated, but only just. One failure would drop the bound to ' + f(A.stats.cpLower(n, n - 1, 0.95), 3) + ', below 0.95.';
      } }
  ];

  function buildExperiments() {
    const host = $('sim-experiments');
    const jobs = [];
    EXPERIMENTS.forEach(function (x) {
      // not a live region: ten cards fill themselves after load, which nobody asked to hear read out
      const notice = el('p', { class: 'sim-exp-notice pending', 'aria-busy': 'true' }, el('strong', null, 'Notice: '), 'computing…');
      const m = A.data.module(x.module);
      const card = el('article', { class: 'card sim-exp' + (x.ext ? ' is-ext' : ''), 'aria-labelledby': 'exp-' + x.id },
        el('h3', { id: 'exp-' + x.id }, x.title),
        el('ul', { class: 'sim-exp-links' }, x.links.map(function (l) { return el('li', null, ui.simLink(l.label, l.hash)); })),
        el('p', null, el('strong', null, 'Try: '), x.try),
        notice,
        el('p', { class: 'sim-exp-foot' }, m ? el('span', null, 'Learn it: ', moduleLink(x.module), ' →') : null,
          el('span', { class: 'tags' }, x.tags.map(function (t) { return ui.tag(t); }))));
      host.appendChild(card);
      (WARM[x.id] ? WARM[x.id]() : []).forEach(function (sp) {
        jobs.push(function () {
          try { quick(sp.cfg, sp.log); } catch (err) { if (!(err instanceof RangeError)) throw err; }
        });
      });
      jobs.push(function () {
        let text;
        try { text = x.notice(); } catch (err) { if (!(err instanceof RangeError)) throw err; text = 'Could not compute: ' + err.message; }
        notice.textContent = '';
        notice.appendChild(el('strong', null, 'Notice: '));
        notice.appendChild(document.createTextNode(text));
        notice.classList.remove('pending');
        notice.removeAttribute('aria-busy');
      });
    });
    // one experiment per macrotask, after the first frame, so the simulator itself appears first
    function next() {
      const j = jobs.shift();
      if (!j) { runCache.clear(); return; }
      setTimeout(next, 0);      // queued first, so one failing card cannot stall the others
      j();
    }
    setTimeout(next, 300);
  }

  const BEHIND_SHOWN = 3;
  const CONCEPT_MAX = 90;
  /** The first clause of a mapping's concept text, cut at a word boundary if still long. */
  function shortConcept(s) {
    let t = String(s || '').split(/;\s/)[0].trim();
    if (t.length > CONCEPT_MAX) {
      const cut = t.lastIndexOf(' ', CONCEPT_MAX - 1);
      t = t.slice(0, cut > 40 ? cut : CONCEPT_MAX - 1).replace(/[\s,:(–-]+$/, '') + '…';
    }
    return t;
  }

  function buildBehind() {
    const ROWS = [
      { panel: 'Requirement badges', module: 'm01' },
      { panel: 'The loop: mode logic → controller → wheels → dynamics', module: 'm02' },
      { panel: 'Initial attitude, body rates and disturbance', module: 'm03' },
      { panel: 'Integrator', module: 'm04' },
      { panel: 'Controller and gains', module: 'm05' },
      { panel: 'Actuator saturation', module: 'm06' },
      { panel: 'Sensors and estimation', module: 'm07', tag: 'extension' },
      { panel: 'Safe mode, fault injection and annunciator', module: 'm08' },
      { panel: 'Monte Carlo campaign', module: 'm09' },
      { panel: 'CSV export and scenario links', module: 'm10' },
      { panel: '3D view, plots and playback', module: 'm11' }
    ];
    const rows = ROWS.map(function (row) {
      const maps = A.data.mappingsFor(row.module).slice().sort(A.data.compareRows);
      const seen = {}, uniq = [];
      maps.forEach(function (m) { if (!seen[m.course]) { seen[m.course] = true; uniq.push(m); } });
      const disc = {};
      uniq.forEach(function (m) { const c = A.data.course(m.course); if (c) disc[c.discipline] = true; });
      // every strong link is tied, so the cell shows the first three A–Z and points to the rest
      const strong = uniq.filter(function (m) { return m.strength === 'strong'; });
      const shown = (strong.length ? strong : uniq).slice(0, BEHIND_SHOWN);
      const rest = (strong.length ? strong.length : uniq.length) - shown.length;
      const items = shown.map(function (m) {
        const c = A.data.course(m.course);
        return el('li', null, el('a', { href: 'atlas.html#c-' + m.course }, c ? c.name : m.course),
          m.tag !== 'direct' ? [' ', ui.tag(m.tag)] : null, c && c.evidence === 'outline' ? [' ', ui.tag('typical')] : null,
          el('span', { class: 'sim-behind-concept', title: m.concept }, shortConcept(m.concept)));
      });
      const mod = A.data.module(row.module);
      if (rest > 0 && mod) {
        items.push(el('li', { class: 'sim-behind-more' }, el('a', { href: mod.slug + '#provenance' },
          '+' + rest + ' more ' + (strong.length ? 'strong ' : '') + (rest === 1 ? 'link' : 'links') + ' in “Where this came from”')));
      }
      return [el('span', null, row.panel, row.tag ? [' ', ui.tag(row.tag)] : null), moduleLink(row.module),
        el('span', { class: 'count' }, uniq.length + ' subjects · ' + Object.keys(disc).length + ' disciplines' + (strong.length ? ' · ' + strong.length + ' strong' : '')), el('ul', null, items)];
    });
    const t = ui.table([{ key: 'p', label: 'Panel' }, { key: 'm', label: 'Project part' }, { key: 'n', label: 'Subject links' }, { key: 's', label: 'Strong links (A–Z) and what each supplies' }], rows,
      { caption: 'Simulator panels, the module that explains each, and the subjects that feed it', rowHeaders: true });
    t.classList.add('sim-behind');
    $('sim-behind').appendChild(t);
  }

  function buildQuiz() {
    ui.quiz($('sim-quiz'), [
      { q: 'In T03 the second SAFE_HOLD starts at 47.49 s, so the 8 s dwell is complete at 55.49 s. Why does NOMINAL only return at 60.00 s?',
        options: ['The rate stays above 0.5 deg/s until 60 s, because the fault keeps upsetting the craft.',
          'The fault is still active until 60 s, and the return guard needs the fault flag clear.',
          'The return needs a second full 8 s dwell that only starts once the fault has gone.'],
        correct: 1, explain: 'SAFE_HOLD returns only when all four guards hold together: fault clear, |ω| < 0.5 deg/s, error < 4° and dwell ≥ 8 s. The fault window ends at 60 s, so that is the first step at which every lamp is lit.' },
      { q: 'T02 (LQR) settles in 5.39 s against 18.33 s for T01 (PID). What does the LQR pay for its speed?',
        options: ['It fails REQ-S2, because it demands 14.77 mN m from wheels rated at 3 mN m.',
          'It ends the run outside the 2° pointing limit, so REQ-F2 fails at 120 s.',
          'Its peak rate is 14.28 deg/s, leaving only 0.72 deg/s of margin to REQ-S1.'],
        correct: 2, explain: 'The LQR demands far more than the wheels can give, but REQ-S2 checks the torque after saturation, which never exceeds 3 mN m. The real cost is rate: the saturated slew reaches 14.28 deg/s, close to the 15 deg/s safety limit.' },
      { q: 'A 60-trial campaign passes all 60 trials. What can you claim about REQ-L1 at 95% confidence?',
        options: ['The pass probability is at least 0.951, so REQ-L1 is demonstrated, but only just.',
          'The pass probability is exactly 100%, because all 60 of the 60 trials passed REQ-L1.',
          'Nothing at all: 60 trials are far too few to support any claim at 95% confidence.'],
        correct: 0, explain: 'The one-sided Clopper–Pearson bound for 60 successes in 60 trials is 0.05^(1/60) = 0.951. That clears 0.95 by a hair; a single failure would bring it down to 0.923.' }
    ]);
  }

  function buildProvenance() {
    const rows = A.params.PROVENANCE.map(function (p) { return [p.label, p.value, ui.tag(p.tag), p.note || '']; });
    const d = ui.details('Show all ' + rows.length + ' parameters and their labels', false);
    d.body.appendChild(ui.table([{ key: 'p', label: 'Parameter' }, { key: 'v', label: 'Value' }, { key: 't', label: 'Label' }, { key: 'n', label: 'Note' }], rows,
      { caption: 'Parameter provenance', rowHeaders: true, compact: true }));
    $('sim-provenance').appendChild(d);
  }

  /* ================================================================ boot */

  /**
   * Typeset KaTeX in time-sliced chunks (one block element at a time, about 12 ms per task),
   * so the maths below the simulator never blocks the main thread for long.
   */
  function typesetChunked(done) {
    const blocks = ui.qsa('main .prose > *, main .eq, #sim-quiz').filter(function (n) { return /\\[(\[]/.test(n.textContent); });
    function step() {
      const t0 = now();
      while (blocks.length && now() - t0 < 12) ui.typeset(blocks.shift());
      if (blocks.length) setTimeout(step, 0); else if (done) done();
    }
    step();
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'simulator' });
    fillModel();
    const app = createApp();
    app.start();
    ui.linkTerms(document.body);
    // below the simulator: built in later tasks so the simulator appears first
    setTimeout(function () {
      $('sim-legend').appendChild(ui.legend(false));
      buildBehind();
      buildQuiz();
      buildProvenance();
      typesetChunked(function () { ui.typeset(document.body); buildExperiments(); });
    }, 0);
  });
})();
