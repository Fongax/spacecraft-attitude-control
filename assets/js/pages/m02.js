/**
 * m02.js: module 02, System architecture and modes.
 * Widgets: live block diagram with signal probes on one T03 run (W2.1), mode cards (W2.4),
 * execution-order puzzle with a DAG (W2.2) and "swap the layer" on T01 (W2.3).
 */
(function () { 'use strict';
  const ADCS = window.ADCS;
  const ui = ADCS.ui;
  const el = ui.el;
  const svg = ui.svg;
  const P = ADCS.params;
  const M = ADCS.modes;
  const MINUS = '−';
  const MODE_CLASS = ['n', 'sd', 'sh'];

  function $(id) { return document.getElementById(id); }

  /**
   * Run `job` in its own task after page setup, so each engine run (a few tens of ms) is a short
   * task instead of part of one long block at load. Errors are shown inline in `host`; anything
   * other than the engine's RangeError is also logged once, as ui.ready does.
   */
  function later(host, job) {
    setTimeout(function () {
      try { job(); } catch (e) {
        ui.showError(host, e);
        if (!(e instanceof RangeError)) console.error('[ADCS] widget setup failed:', e);
      }
    }, 0);
  }
  /** Run jobs one per task, in order, then call done (inside the last task). */
  function series(host, jobs, done) {
    let i = 0;
    (function next() {
      later(host, function () {
        if (i < jobs.length) { jobs[i++](); next(); } else done();
      });
    })();
  }
  function signed(x, fixed) { return ui.fmt(x, { fixed: fixed }); }
  function f2(x) { return ui.fmt(x, { fixed: 2 }); }

  /* ================================================================ small SVG helpers */

  let markerSeq = 0;
  function arrowMarker(root) {
    markerSeq += 1;
    const id = 'm02-arrow-' + markerSeq;
    const defs = svg('defs');
    const mk = svg('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    mk.appendChild(svg('path', { d: 'M0 0L10 5L0 10z', class: 'sv-head' }));
    defs.appendChild(mk);
    root.appendChild(defs);
    return 'url(#' + id + ')';
  }
  function polyline(root, pts, cls, marker) {
    const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join('');
    const path = svg('path', { d: d, class: cls || 'sv-wire', fill: 'none' });
    if (marker) path.setAttribute('marker-end', marker);
    root.appendChild(path);
    return path;
  }
  function text(root, x, y, s, cls, anchor) {
    const t = svg('text', { x: x, y: y, class: cls || 'sv-text', 'text-anchor': anchor || 'middle' });
    t.textContent = s;
    root.appendChild(t);
    return t;
  }
  /** Fill a <text> with parts; a part ['cmd', 'sub'] becomes a lowered, smaller tspan. */
  function rich(t, parts) {
    t.textContent = '';
    parts.forEach(function (p) {
      const sp = svg('tspan', p[1] === 'sub' ? { class: 'sv-subscript', 'baseline-shift': 'sub' } : null);
      sp.textContent = p[0];
      t.appendChild(sp);
    });
    return t;
  }
  function box(root, b, cls) {
    const r = svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, class: cls || 'sv-block' });
    root.appendChild(r);
    return r;
  }

  /* ================================================================ W2.1 live block diagram */

  const LAYOUTS = {
    wide: {
      vb: [800, 360], lh: 13,
      ref: { x: 8, y: 160, w: 96, h: 50 }, err: { cx: 144, cy: 185, r: 18 },
      ctrl: { x: 220, y: 118, w: 172, h: 134 }, sat: { x: 490, y: 160, w: 100, h: 50 },
      dyn: { x: 656, y: 150, w: 136, h: 70 }, fb: { x: 360, y: 292, w: 160, h: 48 }, mode: { x: 236, y: 10, w: 200, h: 66 },
      wires: [
        { pts: [[104, 185], [126, 185]] },
        { pts: [[162, 185], [220, 185]] },
        { pts: [[392, 185], [490, 185]] },
        { pts: [[590, 185], [656, 185]] },
        { pts: [[724, 220], [724, 316], [520, 316]] },
        { pts: [[360, 316], [144, 316], [144, 203]] },
        { pts: [[724, 150], [724, 43], [436, 43]], cls: 'sv-wire sv-sup' },
        { pts: [[336, 76], [336, 118]], cls: 'sv-wire sv-sup' }
      ],
      notes: [{ x: 580, y: 35, s: '|ω|, θₑ, fault', anchor: 'middle' }, { x: 344, y: 102, s: 'selects law', anchor: 'start' }, { x: 156, y: 226, s: MINUS, anchor: 'middle', cls: 'sv-sign' }, { x: 118, y: 176, s: '+', anchor: 'middle', cls: 'sv-sign' }],
      probes: { theta: { x: 191, y: 154, a: 'middle' }, tauCmd: { x: 400, y: 122, a: 'start' }, tau: { x: 597, y: 122, a: 'start' }, rate: { x: 716, y: 258, a: 'end' } }
    },
    // Phone layout: the viewBox is about as wide as the diagram's box on a 360 px screen, so one
    // user unit is close to one CSS pixel and the text keeps the sizes set in m02.css.
    tall: {
      vb: [280, 736], lh: 15,
      ref: { x: 56, y: 8, w: 168, h: 44 }, err: { cx: 140, cy: 98, r: 16 }, errLabel: { x: 162, y: 103, a: 'start' },
      ctrl: { x: 56, y: 166, w: 168, h: 128 }, sat: { x: 56, y: 364, w: 168, h: 44 },
      dyn: { x: 56, y: 478, w: 168, h: 56 }, fb: { x: 56, y: 590, w: 168, h: 44 }, mode: { x: 56, y: 660, w: 168, h: 70 },
      wires: [
        { pts: [[140, 52], [140, 82]] },
        { pts: [[140, 114], [140, 166]] },
        { pts: [[140, 294], [140, 364]] },
        { pts: [[140, 408], [140, 478]] },
        { pts: [[140, 534], [140, 590]] },
        { pts: [[56, 612], [18, 612], [18, 98], [124, 98]] },
        { pts: [[140, 634], [140, 660]], cls: 'sv-wire sv-sup' },
        { pts: [[224, 695], [262, 695], [262, 230], [224, 230]], cls: 'sv-wire sv-sup' }
      ],
      notes: [{ x: 275, y: 462, s: 'selects the law', anchor: 'middle', rot: -90 }, { x: 112, y: 84, s: MINUS, anchor: 'middle', cls: 'sv-sign' }, { x: 152, y: 74, s: '+', anchor: 'middle', cls: 'sv-sign' }, { x: 152, y: 651, s: '|ω|, θₑ, fault', anchor: 'start' }],
      probes: { theta: { x: 152, y: 136, a: 'start' }, tauCmd: { x: 152, y: 309, a: 'start' }, tau: { x: 152, y: 423, a: 'start' }, rate: { x: 152, y: 558, a: 'start' } }
    }
  };
  // `spoken` is the name used in the screen-reader description; NOMINAL's comes from the run's controller.
  const LAW_ROWS = [
    { mode: 0, law: 'PID / LQR', spoken: null }, { mode: 1, law: 'Rate damping', spoken: 'rate-damping' }, { mode: 2, law: 'PD hold', spoken: 'PD hold' }
  ];

  function drawDiagram(L) {
    const root = svg('svg', { viewBox: '0 0 ' + L.vb[0] + ' ' + L.vb[1], class: 'probe-svg', role: 'img', 'aria-labelledby': 'probe-svg-title', 'aria-describedby': 'probe-desc' });
    const title = svg('title', { id: 'probe-svg-title' });
    title.textContent = 'Closed-loop block diagram with live signal values';
    root.appendChild(title);
    const head = arrowMarker(root);
    const refs = {};
    L.wires.forEach(function (w) { polyline(root, w.pts, w.cls, head); });
    L.notes.forEach(function (n) {
      const t = text(root, n.x, n.y, n.s, n.cls || 'sv-note', n.anchor);
      if (n.rot) t.setAttribute('transform', 'rotate(' + n.rot + ' ' + n.x + ' ' + n.y + ')');
    });

    function block(b, lines) {
      box(root, b);
      const cx = b.x + b.w / 2;
      text(root, cx, b.y + (lines.length > 1 ? b.h / 2 - 3 : b.h / 2 + 4), lines[0], 'sv-title');
      if (lines[1]) {
        const t = text(root, cx, b.y + b.h / 2 + 13, '', 'sv-sub');
        if (Array.isArray(lines[1])) rich(t, lines[1]); else t.textContent = lines[1];
      }
    }
    block(L.ref, ['Reference', [['q'], ['ref', 'sub']]]);
    block(L.sat, ['Saturation', '±' + ui.fmt(ADCS.units.toMilli(P.DEFAULTS.tauMax), { sig: 2 }) + ' mN m per axis']);
    block(L.dyn, ['Rigid body', 'Euler + quaternion']);
    block(L.fb, ['State feedback', 'true q, ω (H = 1)']);
    root.appendChild(svg('circle', { cx: L.err.cx, cy: L.err.cy, r: L.err.r, class: 'sv-block' }));
    text(root, L.err.cx, L.err.cy + 5, '⊗', 'sv-title');
    const eLab = L.errLabel || { x: L.err.cx, y: L.err.cy - L.err.r - 6, a: 'middle' };
    rich(text(root, eLab.x, eLab.y, '', 'sv-sub', eLab.a), [['q'], ['e', 'sub']]);

    // controller with one row per law
    const c = L.ctrl;
    box(root, c);
    text(root, c.x + c.w / 2, c.y + 18, 'Controller', 'sv-title');
    refs.rows = LAW_ROWS.map(function (r, i) {
      const ry = c.y + 28 + i * 34;
      const g = svg('g', { class: 'sv-law' });
      g.appendChild(svg('rect', { x: c.x + 8, y: ry, width: c.w - 16, height: 30, rx: 4, class: 'sv-law-box' }));
      const lt = svg('text', { x: c.x + 16, y: ry + 19, class: 'sv-law-text', 'text-anchor': 'start' });
      lt.textContent = r.law;
      g.appendChild(lt);
      const mt = svg('text', { x: c.x + c.w - 16, y: ry + 19, class: 'sv-law-mode', 'text-anchor': 'end' });
      mt.textContent = M.SHORT[r.mode];
      g.appendChild(mt);
      root.appendChild(g);
      return { g: g, label: lt, base: r.law };
    });

    // mode manager
    const m = L.mode;
    box(root, m, 'sv-block sv-supbox');
    text(root, m.x + m.w / 2, m.y + 18, 'Mode manager', 'sv-title');
    refs.modePill = svg('rect', { x: m.x + 14, y: m.y + 25, width: m.w - 28, height: 21, rx: 10, class: 'sv-modepill' });
    root.appendChild(refs.modePill);
    refs.modeText = text(root, m.x + m.w / 2, m.y + 40, '', 'sv-modetext');
    refs.faultText = text(root, m.x + m.w / 2, m.y + m.h - 6, '', 'sv-sub');

    // probes
    function probe(p, nLines) {
      const g = svg('g', { class: 'sv-probe' });
      const lines = [];
      for (let i = 0; i < nLines; i++) {
        // 3 extra units under the heading leave room for its lowered subscript (θₑ, τ_cmd).
        const t = svg('text', { x: p.x, y: p.y + i * (L.lh || 13) + (i ? 3 : 0), class: i === 0 ? 'sv-probe-head' : 'sv-probe-val', 'text-anchor': p.a });
        g.appendChild(t);
        lines.push(t);
      }
      root.appendChild(g);
      return lines;
    }
    refs.theta = probe(L.probes.theta, 2);
    refs.tauCmd = probe(L.probes.tauCmd, 4);
    refs.tau = probe(L.probes.tau, 4);
    refs.rate = probe(L.probes.rate, 2);
    return { root: root, refs: refs };
  }

  function setVal(t, label, value, sat) {
    t.textContent = '';
    const a = svg('tspan', { class: 'sv-axis' });
    a.textContent = label;
    t.appendChild(a);
    const v = svg('tspan');
    v.textContent = value;
    t.appendChild(v);
    if (sat) {
      const s = svg('tspan', { class: 'sv-sat', dx: 4 });
      s.textContent = 'SAT';
      t.appendChild(s);
    }
  }

  function buildProbes() {
    const controls = $('probe-controls');
    const out = $('probe-output');
    let cfg;
    try { cfg = ADCS.sim.resolveConfig(ADCS.presets.get('T03')); } catch (e) {
      if (e instanceof RangeError) { ui.showError(out, e); return; }
      throw e;
    }
    // The engine run itself is deferred to its own task (see later()); until it lands the
    // diagram is drawn with empty probes.
    let run = null;
    const tauMax = cfg.tauMax;
    const dt = cfg.dt;
    let tEnd = cfg.duration;
    const slider = ui.slider({ id: 'probe-t', label: 'Time t', min: 0, max: tEnd, step: dt, value: 0.5, unit: 's', help: 'Drag, type a time, or click the mode timeline.' });
    const play = ui.button({ label: 'Play (×5)', icon: 'play' });
    const back = ui.button({ label: 'Back 0.5 s', icon: 'step-back', iconOnly: true, title: 'Back 0.5 s' });
    const fwd = ui.button({ label: 'Forward 0.5 s', icon: 'step-fwd', iconOnly: true, title: 'Forward 0.5 s' });
    controls.appendChild(slider.el);
    controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Playback'), el('div', { class: 'btn-row' }, back, play, fwd)));

    const diagramBox = el('div', { class: 'probe-diagram' });
    const desc = el('p', { class: 'visually-hidden', id: 'probe-desc' }, 'Computing the T03 run.');
    out.appendChild(diagramBox);
    out.appendChild(desc);
    const tlBox = el('div', { class: 'probe-timeline' });
    out.appendChild(tlBox);
    const tl = ADCS.plot.timeline(tlBox, { title: 'Mode timeline (T03)', segments: [], faults: [], events: [], x: { min: 0, max: tEnd }, axis: true });

    let layout = null, current = null, tNow = slider.value;
    function ensureLayout() {
      const w = diagramBox.clientWidth || 800;
      const want = w < 600 ? 'tall' : 'wide';
      if (want === layout) return;
      layout = want;
      current = drawDiagram(LAYOUTS[want]);
      diagramBox.textContent = '';
      diagramBox.appendChild(current.root);
      diagramBox.dataset.layout = want;
      show(tNow);
    }
    function show(t) {
      tNow = t;
      if (!current || !run) return;
      const s = ADCS.sim.sampleAt(run, t);
      const R = current.refs;
      const mode = s.mode;
      rich(R.theta[0], [['θ'], ['e', 'sub']]);
      setVal(R.theta[1], '', ui.fmt(s.errDeg, { fixed: 1 }) + '°');
      rich(R.tauCmd[0], [['τ'], ['cmd', 'sub'], [' (mN m)']]);
      rich(R.tau[0], [['τ (mN m)']]);
      ['x', 'y', 'z'].forEach(function (ax, i) {
        const c = s.tauCmd[i], a = s.tau[i];
        setVal(R.tauCmd[i + 1], ax + ' ', signed(ADCS.units.toMilli(c), 2), Math.abs(c) > tauMax * (1 + 1e-9));
        setVal(R.tau[i + 1], ax + ' ', signed(ADCS.units.toMilli(a), 2));
      });
      setVal(R.rate[0], '', '|ω|');
      setVal(R.rate[1], '', f2(s.rateDeg) + ' deg/s');
      R.modeText.textContent = M.NAMES[mode];
      R.modePill.setAttribute('class', 'sv-modepill ' + MODE_CLASS[mode]);
      R.faultText.textContent = 'fault flag: ' + (s.fault ? 'ON' : 'off');
      R.faultText.setAttribute('class', s.fault ? 'sv-sub sv-fault-on' : 'sv-sub');
      R.rows.forEach(function (row, i) {
        const on = LAW_ROWS[i].mode === mode;
        row.g.setAttribute('class', 'sv-law' + (on ? ' is-active ' + MODE_CLASS[mode] : ''));
        row.label.textContent = (on ? '▶ ' : '') + row.base;
      });
      const satAxes = ['x', 'y', 'z'].filter(function (ax, i) { return Math.abs(s.tauCmd[i]) > tauMax * (1 + 1e-9); });
      const spoken = LAW_ROWS[mode].spoken || run.config.controller;
      desc.textContent = 't = ' + f2(t) + ' s. Mode ' + M.NAMES[mode] + ', so the ' + spoken + ' law is active. Fault flag ' + (s.fault ? 'on' : 'off') +
        '. Error angle ' + ui.fmt(s.errDeg, { fixed: 1 }) + '°. Commanded torque ' + s.tauCmd.map(function (v) { return signed(ADCS.units.toMilli(v), 2); }).join(', ') +
        ' mN m' + (satAxes.length ? ', saturated on ' + satAxes.join(' and ') : '') + '. Applied torque ' + s.tau.map(function (v) { return signed(ADCS.units.toMilli(v), 2); }).join(', ') +
        ' mN m. Rate ' + f2(s.rateDeg) + ' deg/s.';
      tl.setCursor(t);
    }
    let raf = 0, last = 0;
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; play.querySelector('.btn-label').textContent = 'Play (×5)'; play.replaceChild(ui.icon('play'), play.querySelector('svg')); }
    function tick(ts) {
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      let t = Math.round((tNow + 5 * dt) / cfg.dt) * cfg.dt;
      if (t >= tEnd) { t = tEnd; slider.set(t); show(t); stop(); return; }
      slider.set(t); show(t);
      raf = requestAnimationFrame(tick);
    }
    play.addEventListener('click', function () {
      if (raf) { stop(); return; }
      if (tNow >= tEnd) { slider.set(0); show(0); }
      last = 0;
      play.querySelector('.btn-label').textContent = 'Pause';
      play.replaceChild(ui.icon('pause'), play.querySelector('svg'));
      raf = requestAnimationFrame(tick);
    });
    function nudge(d) { stop(); const t = Math.min(tEnd, Math.max(0, Math.round((tNow + d) / dt) * dt)); slider.set(t); show(t); }
    back.addEventListener('click', function () { nudge(-0.5); });
    fwd.addEventListener('click', function () { nudge(0.5); });
    slider.on('change', function (v) { stop(); show(v); });
    tl.onSeek(function (t) { stop(); const tq = Math.round(t / dt) * dt; slider.set(tq); show(tq); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(function () { ensureLayout(); }).observe(diagramBox);
    else window.addEventListener('resize', ensureLayout);
    ensureLayout();

    later(out, function () {
      const r = ADCS.sim.run(ADCS.presets.get('T03'));
      const faults = [];
      let start = -1;
      for (let k = 0; k <= r.n; k++) {
        const on = k < r.n && r.fault[k];
        if (on && start < 0) start = k;
        if (!on && start >= 0) { faults.push({ t0: r.t[start], t1: r.t[Math.min(k, r.n - 1)] }); start = -1; }
      }
      run = r;
      tEnd = r.t[r.n - 1];
      tl.set({ segments: M.runLengths(r.mode, r.t), faults: faults, events: r.events.map(function (e) { return e.t; }) });
      show(Math.min(tNow, tEnd));
    });
  }

  /* ================================================================ W2.4 mode cards */

  function buildModeCards() {
    const out = $('modecards-output');
    const D = P.DEFAULTS, sm = D.safeMode;
    const lim = M.limits(sm, D.dt);
    const why = function (r) { return M.reasonText(r, sm); };
    const NB = '\u00a0';
    const u = function (v, unit) { return v + NB + unit.replace(/ /g, NB); };
    const CARDS = [
      { mode: 0, purpose: 'Track the target attitude.', law: 'PID (site default) or LQR toward \\(q_{ref}\\).',
        gains: 'PID Kp ' + u(D.pid.Kp, 'N m') + ', Ki ' + u(D.pid.Ki, 'N m/s') + ', Kd ' + u(D.pid.Kd, 'N m s'),
        enter: 'At the start of a run, or from SAFE_HOLD when ' + why('guards') + '.',
        leave: '→ SAFE_DETUMBLE when ' + why('rate') + ', or when ' + why('fault') + ' (' + lim.nF + ' steps).',
        never: '→ SAFE_HOLD directly: safe hold only follows a detumble.' },
      { mode: 1, purpose: 'Remove excessive angular rate; pointing is ignored.', law: 'rate damping \\(\\tau = -K_d\\,\\omega\\).',
        gains: 'Kd ' + u(D.detumble.Kd, 'N m s'),
        enter: 'From NOMINAL when ' + why('rate') + ' or ' + why('fault') + '.',
        leave: '→ SAFE_HOLD when ' + why('rate-low') + ' (' + lim.nB + ' steps in a row).',
        never: '→ NOMINAL directly: detumbling must pass through SAFE_HOLD.' },
      { mode: 2, purpose: 'Keep a coarse, stable attitude after detumbling.', law: 'low-gain PD hold \\(\\tau = -K_p\\,q_{e,v} - K_d\\,\\omega\\).',
        gains: 'Kp ' + u(D.hold.Kp, 'N m') + ', Kd ' + u(D.hold.Kd, 'N m s'),
        enter: 'From SAFE_DETUMBLE when ' + why('rate-low') + '.',
        leave: '→ NOMINAL when ' + why('guards') + ' (dwell ' + lim.nD + ' steps).',
        never: '→ NOMINAL while the fault flag is active.' }
    ];
    const grid = el('div', { class: 'modecards' });
    CARDS.forEach(function (c) {
      const front = el('div', { class: 'mc-face mc-front' },
        el('p', null, el('strong', null, 'Purpose: '), c.purpose),
        el('p', null, el('strong', null, 'Law: '), c.law),
        el('p', { class: 'mc-gains' }, c.gains, ' ', ui.tag('site')));
      const backFace = el('div', { class: 'mc-face mc-back' },
        el('p', null, el('strong', null, 'Entered: '), c.enter),
        el('p', null, el('strong', null, 'Leaves: '), c.leave),
        el('p', { class: 'mc-never' }, ui.icon('cross'), el('span', null, el('strong', null, 'Never: '), c.never)),
        el('p', { class: 'mc-gains' }, ui.tag('project')));
      backFace.hidden = true;
      const btn = ui.button({ label: 'Turn over: entry and exit', kind: 'ghost', small: true, icon: 'reset' });
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function () {
        const showBack = backFace.hidden;
        backFace.hidden = !showBack; front.hidden = showBack;
        btn.setAttribute('aria-pressed', showBack ? 'true' : 'false');
        btn.querySelector('.btn-label').textContent = showBack ? 'Turn back: purpose and law' : 'Turn over: entry and exit';
        ui.announce(M.NAMES[c.mode] + ' card: ' + (showBack ? 'entry and exit guards shown.' : 'purpose and law shown.'));
      });
      grid.appendChild(el('article', { class: 'modecard ' + MODE_CLASS[c.mode] },
        el('h4', null, ui.modePill(c.mode)), front, backFace, btn));
    });
    out.appendChild(grid);
  }

  /* ================================================================ W2.2 execution-order puzzle */

  const STEPS = [
    { id: 'read', label: 'Read state', desc: 'Take xₖ = [q, ω] from the state vector.' },
    { id: 'errors', label: 'Compute errors', desc: '\\(q_e = q_{ref}^* \\otimes q\\) (short way), the error angle and |ω|.' },
    { id: 'mode', label: 'Mode logic', desc: 'Update the fault, hold and dwell counters; maybe change mode.' },
    { id: 'ctrl', label: 'Controller', desc: 'Torque command from the law of the current mode.' },
    { id: 'sat', label: 'Saturation', desc: 'Clip each axis to the torque limit.' },
    { id: 'log', label: 'Log sample k', desc: 'Record t, q, ω, τ, the mode and the counters.' },
    { id: 'rk4', label: 'RK4 propagate', desc: 'Compute xₖ₊₁ from xₖ with τ held for one step.' },
    { id: 'renorm', label: 'Renormalise q', desc: 'Divide q by |q| to remove integration drift.' }
  ];
  const START = ['read', 'errors', 'ctrl', 'sat', 'rk4', 'renorm', 'mode', 'log'];
  const RULES = [
    { a: 'mode', b: 'rk4', msg: 'Mode logic runs after the RK4 step, so it decides on xₖ₊₁ while the controller used xₖ: the off-by-one-step bug. Every transition shifts by one step and the log pairs the wrong samples.' },
    { a: 'read', b: 'errors', msg: 'The errors need the state: read xₖ before computing qₑ and |ω|.' },
    { a: 'errors', b: 'mode', msg: 'The mode guards compare |ω| and the error angle with thresholds, so the errors must exist first.' },
    { a: 'mode', b: 'ctrl', msg: 'The controller law depends on this step’s mode. Run the mode logic first, or the controller uses the previous step’s law.' },
    { a: 'ctrl', b: 'sat', msg: 'Saturation limits the command, so the controller must produce it first.' },
    { a: 'sat', b: 'log', msg: 'Log the torque that is actually applied, after saturation.' },
    { a: 'log', b: 'rk4', msg: 'Logging after the RK4 step pairs sample k’s torque with state k + 1: an off-by-one in the log.' },
    { a: 'sat', b: 'rk4', msg: 'RK4 must integrate with the saturated torque, held constant over the step (zero-order hold).' },
    { a: 'rk4', b: 'renorm', msg: 'Renormalise after the RK4 step: the step is what lets |q| drift away from 1.' }
  ];
  const BY_ID = {};
  STEPS.forEach(function (s) { BY_ID[s.id] = s; });

  const DAG = {
    wide: { vb: [720, 236], w: 148, h: 46, pos: { read: [80, 44], errors: [260, 44], mode: [440, 44], ctrl: [620, 44], sat: [620, 180], log: [440, 180], rk4: [260, 180], renorm: [80, 180] } },
    tall: { vb: [340, 600], w: 170, h: 44, pos: { read: [170, 40], errors: [170, 112], mode: [170, 184], ctrl: [170, 256], sat: [170, 328], log: [170, 400], rk4: [170, 472], renorm: [170, 544] } }
  };
  function drawDag(kind) {
    const L = DAG[kind];
    const root = svg('svg', { viewBox: '0 0 ' + L.vb[0] + ' ' + L.vb[1], class: 'dag-svg', role: 'img', 'aria-labelledby': 'dag-title-' + kind });
    const title = svg('title', { id: 'dag-title-' + kind });
    title.textContent = 'The step as a DAG: read, errors, mode logic, controller, saturation, log, RK4 propagate, renormalise; a one-step delay feeds the new state back to read.';
    root.appendChild(title);
    const head = arrowMarker(root);
    const hw = L.w / 2, hh = L.h / 2;
    function P(id) { return L.pos[id]; }
    function edge(a, b, opts) {
      const o = opts || {};
      const A = P(a), B = P(b);
      let pts;
      if (o.via) pts = [o.from || A, ...o.via, o.to || B];
      else if (A[1] === B[1]) { const dir = B[0] > A[0] ? 1 : -1; pts = [[A[0] + dir * hw, A[1]], [B[0] - dir * hw, B[1]]]; }
      else { const dir = B[1] > A[1] ? 1 : -1; pts = [[A[0], A[1] + dir * hh], [B[0], B[1] - dir * hh]]; }
      polyline(root, pts, o.cls || 'sv-wire', head);
    }
    if (kind === 'wide') {
      edge('read', 'errors'); edge('errors', 'mode'); edge('mode', 'ctrl'); edge('ctrl', 'sat'); edge('sat', 'log'); edge('log', 'rk4'); edge('rk4', 'renorm');
      edge('errors', 'ctrl', { from: [260, 21], via: [[260, 5], [610, 5]], to: [610, 21], cls: 'sv-wire sv-skip' });
      edge('sat', 'rk4', { from: [620, 203], via: [[620, 228], [270, 228]], to: [270, 203], cls: 'sv-wire sv-skip' });
      edge('renorm', 'read', { from: [80, 157], to: [80, 67], via: [], cls: 'sv-wire sv-delay' });
      text(root, 90, 116, 'z⁻¹: xₖ₊₁ becomes the next step’s xₖ', 'sv-note', 'start');
      text(root, 435, 17, 'qₑ also feeds the controller', 'sv-note', 'middle');
      text(root, 445, 222, 'τ held for the RK4 step', 'sv-note', 'middle');
    } else {
      const order = ['read', 'errors', 'mode', 'ctrl', 'sat', 'log', 'rk4', 'renorm'];
      for (let i = 0; i < order.length - 1; i++) edge(order[i], order[i + 1]);
      edge('errors', 'ctrl', { from: [255, 112], via: [[300, 112], [300, 256]], to: [255, 256], cls: 'sv-wire sv-skip' });
      edge('sat', 'rk4', { from: [255, 328], via: [[300, 328], [300, 472]], to: [255, 472], cls: 'sv-wire sv-skip' });
      edge('renorm', 'read', { from: [85, 544], via: [[30, 544], [30, 40]], to: [85, 40], cls: 'sv-wire sv-delay' });
      const t = text(root, 22, 300, 'z⁻¹ one-step delay', 'sv-note', 'middle');
      t.setAttribute('transform', 'rotate(-90 22 300)');
    }
    Object.keys(L.pos).forEach(function (id) {
      const p = P(id);
      box(root, { x: p[0] - hw, y: p[1] - hh, w: L.w, h: L.h }, 'sv-block dag-node');
      text(root, p[0], p[1] + 5, BY_ID[id].label, 'sv-title');
    });
    return root;
  }

  function buildOrder() {
    const out = $('order-output');
    let order = START.slice();
    const list = el('ol', { class: 'order-list', 'aria-label': 'Steps in one simulation time step' });
    const checkBtn = ui.button({ label: 'Check', kind: 'primary', icon: 'check' });
    const resetBtn = ui.button({ label: 'Back to the starting order', kind: 'ghost', icon: 'reset' });
    const feedback = el('div', { class: 'order-feedback', 'aria-live': 'polite' });
    const dagBox = el('div', { class: 'order-dag' });
    dagBox.hidden = true;
    out.appendChild(list);
    out.appendChild(el('div', { class: 'btn-row' }, checkBtn, resetBtn));
    out.appendChild(feedback);
    out.appendChild(dagBox);
    let flagged = [];
    let solved = false;

    function move(i, d, focusSel) {
      const j = i + d;
      if (j < 0 || j >= order.length) return;
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      flagged = []; solved = false;
      feedback.textContent = '';
      dagBox.hidden = true;
      render();
      const card = list.children[j];
      const target = card && (focusSel ? card.querySelector(focusSel) : card);
      if (target && !target.disabled) target.focus(); else if (card) card.focus();
      ui.announce(BY_ID[order[j]].label + ' moved to position ' + (j + 1) + ' of ' + order.length + '.');
    }
    function render() {
      list.textContent = '';
      order.forEach(function (id, i) {
        const s = BY_ID[id];
        const up = el('button', { type: 'button', class: 'btn secondary sm icon-only order-btn', 'aria-label': 'Move ' + s.label + ' up', disabled: i === 0 }, el('span', { 'aria-hidden': 'true' }, '↑'));
        const down = el('button', { type: 'button', class: 'btn secondary sm icon-only order-btn', 'aria-label': 'Move ' + s.label + ' down', disabled: i === order.length - 1 }, el('span', { 'aria-hidden': 'true' }, '↓'));
        up.addEventListener('click', function () { move(i, -1, '.order-up'); });
        down.addEventListener('click', function () { move(i, 1, '.order-down'); });
        up.classList.add('order-up'); down.classList.add('order-down');
        const li = el('li', { class: ['order-card', flagged.indexOf(id) >= 0 ? 'is-flagged' : '', solved ? 'is-solved' : ''], tabindex: '0',
          'aria-label': (i + 1) + '. ' + s.label + '. ' + s.desc + ' Alt with the up or down arrow moves it.' },
          el('span', { class: 'order-pos', 'aria-hidden': 'true' }, String(i + 1)),
          el('span', { class: 'order-text' }, el('strong', null, s.label), el('span', { class: 'order-desc' }, s.desc)),
          el('span', { class: 'order-moves' }, up, down));
        li.addEventListener('keydown', function (e) {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          move(i, e.key === 'ArrowUp' ? -1 : 1);
        });
        list.appendChild(li);
      });
      ui.typeset(list);
    }
    function check() {
      const pos = {};
      order.forEach(function (id, i) { pos[id] = i; });
      const broken = RULES.filter(function (r) { return pos[r.a] > pos[r.b]; });
      const target = ['read', 'errors', 'mode', 'ctrl', 'sat', 'log', 'rk4', 'renorm'];
      const inPlace = order.filter(function (id, i) { return target[i] === id; }).length;
      feedback.textContent = '';
      if (!broken.length) {
        solved = true; flagged = [];
        feedback.appendChild(el('p', { class: 'order-ok' }, ui.icon('check'), el('span', null, el('strong', null, 'Correct. '), 'Every step runs after the steps it depends on, so this is a topological order of the step’s DAG. The integrator update for the PID term follows last.')));
        dagBox.hidden = false;
        renderDag();
      } else {
        solved = false;
        const r = broken[0];
        flagged = [r.a, r.b];
        feedback.appendChild(el('p', { class: 'order-bad' }, ui.icon('warn'),
          el('span', null, el('strong', null, BY_ID[r.a].label + ' must come before ' + BY_ID[r.b].label + '. '), r.msg)));
        feedback.appendChild(el('p', { class: 'muted order-count' }, inPlace + ' of 8 cards are in their final place; ' + broken.length + (broken.length === 1 ? ' dependency is' : ' dependencies are') + ' broken.'));
        dagBox.hidden = true;
      }
      render();
    }
    let dagKind = null;
    function renderDag() {
      if (dagBox.hidden) return;
      const kind = (dagBox.clientWidth || out.clientWidth) < 560 ? 'tall' : 'wide';
      if (kind === dagKind && dagBox.firstChild) return;
      dagKind = kind;
      dagBox.textContent = '';
      dagBox.appendChild(el('p', { class: 'field-label' }, 'The step as a directed acyclic graph'));
      dagBox.appendChild(drawDag(kind));
    }
    if (typeof ResizeObserver === 'function') new ResizeObserver(function () { renderDag(); }).observe(out);
    checkBtn.addEventListener('click', check);
    resetBtn.addEventListener('click', function () { order = START.slice(); flagged = []; solved = false; feedback.textContent = ''; dagBox.hidden = true; render(); ui.announce('Starting order restored.'); });
    render();
  }

  /* ================================================================ W2.3 swap the layer */

  function buildLayer() {
    const controls = $('layer-controls');
    const out = $('layer-output');
    const LAYERS = [
      { id: 'sim', label: 'Simulated wheel', short: 'Simulated', cfg: { delaySteps: 0, quantum: 0 }, color: '--accent', dash: [] },
      { id: 'emu', label: 'Emulator (20 ms delay)', short: 'Emulator', cfg: { delaySteps: 2, quantum: 0 }, color: '--warn', dash: [6, 4] },
      { id: 'hw', label: 'Hardware-like (50 ms, 0.01 mN m steps)', short: 'Hardware-like', cfg: { delaySteps: 5, quantum: 1e-5 }, color: '--bad', dash: [2, 3] }
    ];
    const runs = [];
    let tauMilli = [];
    const seg =ui.segmented({ id: 'layer-pick', label: 'Actuator layer', value: 'sim', options: LAYERS.map(function (L) { return { value: L.id, label: L.short }; }), tag: 'option' });
    const win = ui.segmented({ id: 'layer-win', label: 'Torque plot window', value: 'start', options: [{ value: 'start', label: 'Start (0–0.3 s)' }, { value: 'end', label: 'End (90–120 s)' }] });
    controls.appendChild(seg.el);
    controls.appendChild(win.el);

    const code = el('pre', { class: 'layer-code', tabindex: '0', role: 'region', 'aria-label': 'Controller and actuator code' });
    const codeLine = el('code');
    code.appendChild(codeLine);
    const changed = el('p', { class: 'layer-changed' }, ui.icon('check'), el('span', null, 'Controller code changed: ', el('strong', null, '0 lines')));
    const plots = el('div', { class: 'layer-plots' });
    out.appendChild(el('div', { class: 'layer-code-box' }, code, changed));
    out.appendChild(plots);
    const errBox = el('div'), tauBox = el('div');
    plots.appendChild(errBox);
    plots.appendChild(tauBox);
    const LIM = P.LIMITS;
    const pErr = ADCS.plot.line(errBox, { title: 'Attitude error, T01 (log scale)', yLabel: 'error (deg)', xLabel: 't (s)', y: { log: true },
      hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req', dash: [5, 4] }],
      series: LAYERS.map(function (L) { return { id: L.id, label: L.short, color: L.color, dash: L.dash, unit: '°' }; }) });
    const pTau = ADCS.plot.line(tauBox, { title: 'Applied torque τx', yLabel: 'τx (mN m)', xLabel: 't (s)',
      series: LAYERS.map(function (L) { return { id: L.id, label: L.short, color: L.color, dash: L.dash, unit: 'mN m' }; }) });
    function sliceRun(i, t0, t1) {
      const r = runs[i];
      const k0 = Math.max(0, Math.floor(t0 / r.dt)), k1 = Math.min(r.n - 1, Math.ceil(t1 / r.dt));
      return { t: r.t.subarray(k0, k1 + 1), y: tauMilli[i].subarray(k0, k1 + 1) };
    }
    const tableBox = el('div');
    out.appendChild(tableBox);
    const COLS = [{ key: 'l', label: 'Layer' }, { key: 's', label: 'Settling time (s)', num: true }, { key: 'e', label: 'Final error (°)', num: true },
      { key: 'f', label: 'Effort (10⁻⁶ N² m² s)', num: true }, { key: 'r', label: 'REQ-F2' }];
    function showTable(rows) {
      tableBox.textContent = '';
      const t = ui.table(COLS, rows, { caption: 'Same controller, three actuator layers (T01)', rowHeaders: true, compact: true });
      t.table.querySelector('caption').appendChild(document.createTextNode(' '));
      t.table.querySelector('caption').appendChild(ui.tag('derived'));
      tableBox.appendChild(t);
      ui.markScrollable(tableBox);
    }
    // Same-sized placeholder rows while the three runs are computed, so nothing below moves.
    showTable(LAYERS.map(function (L) { return [L.short, '…', '…', '…', '…']; }));

    function render() {
      if (runs.length < LAYERS.length) return;
      const sel = seg.value;
      const Lsel = LAYERS.find(function (L) { return L.id === sel; });
      codeLine.textContent = '// Controller: identical in every layer\n' +
        'tauCmd = ctrl.pid(qe, w, I, gains);   // body torque, N m per axis\n\n' +
        '// Actuator layer: the only part that changes\n' +
        'tau = actuator(tauCmd);               // ' + Lsel.label + '\n' +
        '// actuator: { delaySteps: ' + Lsel.cfg.delaySteps + ', quantum: ' + (Lsel.cfg.quantum ? Lsel.cfg.quantum.toExponential(0).replace('-', MINUS) + ' N m' : '0') + ' }';
      LAYERS.forEach(function (L) {
        const on = L.id === sel;
        [pErr, pTau].forEach(function (p) { p.addSeries({ id: L.id, label: L.short + (on ? ' (selected)' : ''), color: L.color, dash: L.dash, width: on ? 2.6 : 1.2, alpha: on ? 1 : 0.55 }); });
      });
      const w = win.value === 'start' ? [0, 0.3] : [90, 120];
      LAYERS.forEach(function (L, i) { const s = sliceRun(i, w[0], w[1]); pTau.set(L.id, s.t, s.y); });
      pTau.setX(w[0], w[1]);
      pErr.render();
      pTau.render();
      const rows = LAYERS.map(function (L, i) {
        const m = runs[i].metrics;
        return [el('span', { class: L.id === sel ? 'layer-sel' : null }, L.short + (L.id === sel ? ' (selected)' : '')),
          m.settle === null ? 'not settled' : f2(m.settle), ui.fmt(m.final.errDeg, { fixed: 4 }), ui.fmt(m.effort * 1e6, { fixed: 2 }), ui.badge(ADCS.req.byId(runs[i].req, 'F2').status)];
      });
      showTable(rows);
    }
    seg.on('change', function () { render(); ui.announce('Layer: ' + LAYERS.find(function (L) { return L.id === seg.value; }).label + '. Controller code changed: 0 lines.'); });
    win.on('change', render);

    // One engine run per task; plot and tabulate once all three layers are in.
    series(out, LAYERS.map(function (L) {
      return function () { runs.push(ADCS.sim.run(P.merge(ADCS.presets.get('T01'), { actuator: L.cfg }))); };
    }), function () {
      tauMilli = runs.map(function (r) {
        const a = new Float64Array(r.n);
        for (let k = 0; k < r.n; k++) a[k] = r.tau[3 * k] * 1000;
        return a;
      });
      LAYERS.forEach(function (L, i) { pErr.set(L.id, runs[i].t, runs[i].errDeg); });
      render();
    });
  }

  /* ================================================================ page setup */

  ui.ready(function () {
    ui.mountChrome({ page: 'm02' });
    buildProbes();
    buildModeCards();
    buildOrder();
    buildLayer();
    ui.quiz($('quiz'), [
      { q: 'Which block chooses between PID and rate damping?',
        options: ['The actuator model.', 'The mode manager.', 'The integrator.'], correct: 1,
        explain: 'The mode manager reads |ω|, the error and the fault flag and selects which law runs. It never computes a torque itself; the actuator only limits the torque and the integrator only propagates the state.' },
      { q: 'Why does the closed loop not create an “algebraic loop” in the simulation?',
        options: ['RK4 solves it implicitly.', 'Saturation breaks it.', 'The state from step k feeds step k + 1: a one-step delay.'], correct: 2,
        explain: 'Inside one step the dependencies form a DAG. The state computed at step k is read only at step k + 1, so the physical cycle is broken in time. RK4 is an explicit method, and saturation is just another block in the chain.' },
      { q: 'What must stay identical when replacing the simulated wheel with hardware?',
        options: ['The torque command interface (units and meaning).', 'The response time.', 'The torque ripple.'], correct: 0,
        explain: 'The contract is “body torque in N m per axis”. Response time and ripple are exactly what changes from layer to layer; they show up in the response, not in the controller code.' }
    ]);
    ui.renderProvenance($('provenance'), 'm02');
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
