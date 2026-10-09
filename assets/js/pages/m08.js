/**
 * m08.js: Module 08, safe-mode logic and formal reasoning (package P5).
 * Widgets: W8.1 live state machine, W8.2 hysteresis vs chatter, W8.3 transition-relation matrix,
 * W8.4 prove vs find, W8.5 mode-trace monitor. The machine, its thresholds, the abstract checker
 * and the trace monitor all come from ADCS.modes and ADCS.params; nothing is re-implemented here
 * except the synthetic detectors of W8.2, which are illustrations.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el, svg = ui.svg;
  const DEF = A.params.DEFAULTS;
  const SM = DEF.safeMode;
  const M = A.modes;
  const N = M.N, SD = M.SD, SH = M.SH;
  const NAMES = M.NAMES, SHORT = M.SHORT;
  const ARROW = ' → ';

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
  }
  function f(x, o) { return ui.fmt(x, o); }
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
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
  const T_ENTER = '|ω| > ' + SM.enterRateDeg + ' deg/s or fault ≥ ' + SM.faultPersist + ' s';
  const T_EXIT = '|ω| < ' + SM.exitRateDeg + ' deg/s held ' + SM.exitHold + ' s';
  const T_RETURN = 'fault clear, |ω| < ' + SM.returnRateDeg + ' deg/s, error < ' + SM.returnErrDeg + '° and dwell ≥ ' + SM.dwell + ' s';
  const T_STAY_SH = 'fault, or |ω| ≥ ' + SM.returnRateDeg + ' deg/s, or error ≥ ' + SM.returnErrDeg + '°, or dwell < ' + SM.dwell + ' s';

  /* ================================================================ W8.1 live state machine */

  const POS = [[70, 78], [290, 78], [180, 212]];   // N, SD, SH in a 360 x 270 viewBox
  const NODE_R = 31;
  const EDGES = [
    { n: 1, from: N, to: SD, kind: 'ok', text: 'NOMINAL' + ARROW + 'SAFE_DETUMBLE when ' + T_ENTER },
    { n: 2, from: SD, to: SH, kind: 'ok', text: 'SAFE_DETUMBLE' + ARROW + 'SAFE_HOLD when ' + T_EXIT },
    { n: 3, from: SH, to: N, kind: 'ok', text: 'SAFE_HOLD' + ARROW + 'NOMINAL when ' + T_RETURN },
    { n: 4, from: SD, to: N, kind: 'bad', text: 'SAFE_DETUMBLE' + ARROW + 'NOMINAL is forbidden: detumbling must pass through SAFE_HOLD' },
    { n: 5, from: N, to: SH, kind: 'bad', text: 'NOMINAL' + ARROW + 'SAFE_HOLD is forbidden: hold only follows the detumble phase' },
    { n: 6, from: SH, to: SD, kind: 'gap', text: 'SAFE_HOLD' + ARROW + 'SAFE_DETUMBLE is not specified: the specification gap' }
  ];
  function quadAt(p, c, q, t) {
    const u = 1 - t;
    return [u * u * p[0] + 2 * u * t * c[0] + t * t * q[0], u * u * p[1] + 2 * u * t * c[1] + t * t * q[1]];
  }
  function edgeGeometry(e) {
    const p = POS[e.from], q = POS[e.to];
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L, off = 34;
    const c = [(p[0] + q[0]) / 2 + nx * off, (p[1] + q[1]) / 2 + ny * off];
    function trim(a, toward, extra) {
      const vx = toward[0] - a[0], vy = toward[1] - a[1], l = Math.hypot(vx, vy);
      return [a[0] + vx / l * (NODE_R + extra), a[1] + vy / l * (NODE_R + extra)];
    }
    const s = trim(p, c, 2), t = trim(q, c, 4);
    return { d: 'M' + s[0].toFixed(1) + ',' + s[1].toFixed(1) + ' Q' + c[0].toFixed(1) + ',' + c[1].toFixed(1) + ' ' + t[0].toFixed(1) + ',' + t[1].toFixed(1),
      mid: quadAt(s, c, t, 0.5), mark: quadAt(s, c, t, e.kind === 'gap' ? 0.7 : 0.8) };
  }
  function buildGraph() {
    const root = svg('svg', { viewBox: '0 0 360 270', class: 'm08-graph', role: 'img',
      'aria-label': 'State graph: three modes, three allowed guarded transitions (1 to 3), two forbidden transitions (4 and 5) and one unspecified transition (6). The current mode is highlighted.' });
    const defs = svg('defs');
    ['ok', 'bad', 'gap', 'fired'].forEach(function (k) {
      defs.appendChild(svg('marker', { id: 'm08-arrow-' + k, viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
        svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'm08-arrowhead ' + k })));
    });
    root.appendChild(defs);
    const edgeEls = {};
    EDGES.forEach(function (e) {
      const g = edgeGeometry(e);
      const grp = svg('g', { class: 'm08-edge ' + e.kind });
      const path = svg('path', { d: g.d, class: 'm08-edge-line', 'marker-end': 'url(#m08-arrow-' + e.kind + ')' });
      grp.appendChild(path);
      if (e.kind === 'bad') {
        grp.appendChild(svg('circle', { cx: g.mark[0].toFixed(1), cy: g.mark[1].toFixed(1), r: 7, class: 'm08-no' }));
        grp.appendChild(svg('path', { d: 'M' + (g.mark[0] - 5).toFixed(1) + ',' + (g.mark[1] + 5).toFixed(1) + ' L' + (g.mark[0] + 5).toFixed(1) + ',' + (g.mark[1] - 5).toFixed(1), class: 'm08-no' }));
      } else if (e.kind === 'gap') {
        grp.appendChild(svg('text', { x: g.mark[0].toFixed(1), y: (g.mark[1] + 5).toFixed(1), class: 'm08-q', 'text-anchor': 'middle' }, '?'));
      }
      grp.appendChild(svg('circle', { cx: g.mid[0].toFixed(1), cy: g.mid[1].toFixed(1), r: 10.5, class: 'm08-badge' }));
      grp.appendChild(svg('text', { x: g.mid[0].toFixed(1), y: (g.mid[1] + 4.5).toFixed(1), class: 'm08-badge-text', 'text-anchor': 'middle' }, String(e.n)));
      root.appendChild(grp);
      edgeEls[e.from + '-' + e.to] = { grp: grp, path: path, kind: e.kind };
    });
    const nodeEls = [];
    POS.forEach(function (p, i) {
      const g = svg('g', { class: 'm08-node m' + i });
      g.appendChild(svg('circle', { cx: p[0], cy: p[1], r: NODE_R, class: 'm08-node-c' }));
      g.appendChild(svg('text', { x: p[0], y: p[1] + 6, class: 'm08-node-t', 'text-anchor': 'middle' }, SHORT[i]));
      root.appendChild(g);
      nodeEls.push(g);
    });
    return { root: root, edges: edgeEls, nodes: nodeEls };
  }

  function buildStateMachine() {
    const w = parts('w-state-machine');
    const rate = ui.slider({ id: 'w81-rate', label: 'Body rate |ω|', min: 0, max: 15, step: 0.1, value: 0.3, unit: 'deg/s' });
    const err = ui.slider({ id: 'w81-err', label: 'Attitude error', min: 0, max: 30, step: 0.5, value: 2, unit: '°' });
    const fault = ui.toggle({ id: 'w81-fault', label: 'Fault flag active', checked: false });
    const play = ui.button({ label: 'Start clock', kind: 'primary', icon: 'play' });
    const step = ui.button({ label: 'Step 1 s', icon: 'step-fwd' });
    const reset = ui.button({ label: 'Reset', icon: 'reset', kind: 'ghost' });
    [rate, err, fault].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Clock (10 × real time)'), el('div', { class: 'btn-row' }, play, step, reset)));
    const forceBtns = [N, SD, SH].map(function (to) { return ui.button({ label: 'Force' + ARROW + NAMES[to], small: true, kind: 'secondary' }); });
    w.controls.appendChild(el('div', { class: 'field m08-force' }, el('span', { class: 'field-label' }, 'Try to force a mode (bypasses the guards, not the relation)'), el('div', { class: 'btn-row' }, forceBtns)));

    const grid = el('div', { class: 'm08-sm-grid' });
    const left = el('div', { class: 'm08-sm-left' }), right = el('div', { class: 'm08-sm-right' });
    grid.appendChild(left); grid.appendChild(right);
    w.out.appendChild(grid);
    const graph = buildGraph();
    left.appendChild(graph.root);
    const legend = el('ol', { class: 'm08-edge-legend' });
    EDGES.forEach(function (e) {
      legend.appendChild(el('li', { class: e.kind, value: String(e.n) },
        el('span', { class: 'm08-kind' }, e.kind === 'ok' ? ui.icon('check') : e.kind === 'bad' ? ui.icon('cross') : ui.icon('warn'),
          e.kind === 'ok' ? 'allowed' : e.kind === 'bad' ? 'forbidden' : 'unspecified'), ' ', e.text));
    });

    const head = el('div', { class: 'm08-sm-head' });
    const clockOut = el('span', { class: 'readout m08-clock' });
    right.appendChild(head);
    const status = el('p', { class: 'status-line m08-sm-status', 'aria-live': 'polite' });
    right.appendChild(status);
    const groups = [
      { mode: N, title: 'Leave NOMINAL (either one)', lamps: [ui.lamp({ label: '|ω| > ' + SM.enterRateDeg + ' deg/s', trigger: true }), ui.lamp({ label: 'Fault active ≥ ' + SM.faultPersist + ' s', trigger: true })] },
      { mode: SD, title: 'Leave SAFE_DETUMBLE', lamps: [ui.lamp({ label: '|ω| < ' + SM.exitRateDeg + ' deg/s held ' + SM.exitHold + ' s' })] },
      { mode: SH, title: 'Return to NOMINAL (all four)', lamps: [ui.lamp({ label: 'Fault clear' }), ui.lamp({ label: '|ω| < ' + SM.returnRateDeg + ' deg/s' }),
        ui.lamp({ label: 'Error < ' + SM.returnErrDeg + '°' }), ui.lamp({ label: 'Dwell ≥ ' + SM.dwell + ' s' })] }
    ];
    groups.forEach(function (g) {
      g.box = el('div', { class: 'm08-lamp-group' }, el('p', { class: 'm08-lamp-title' }, g.title), el('div', { class: 'lamps' }, g.lamps.map(function (l) { return l.el; })));
      right.appendChild(g.box);
    });
    right.appendChild(el('p', { class: 'm08-log-title' }, 'Transition log (newest first)'));
    const log = el('ol', { class: 'm08-log', reversed: true });
    right.appendChild(log);
    grid.appendChild(legend);

    let machine, t, timer = null, logCount = 0, lastEdge = null;
    const lim = M.limits(SM, DEF.dt);
    function addLog(text, cls) {
      logCount++;
      log.insertBefore(el('li', { class: cls || null, value: String(logCount) }, el('span', { class: 'readout' }, 't = ' + f(t, { fixed: 2, unit: 's' })), ' ', text), log.firstChild);
      while (log.children.length > 8) log.removeChild(log.lastChild);
    }
    function render() {
      const m = machine.mode, c = machine.counters;
      head.textContent = '';
      head.appendChild(ui.modePill(m, { large: true }));
      clockOut.textContent = 't = ' + f(t, { fixed: 2, unit: 's' });
      head.appendChild(clockOut);
      graph.nodes.forEach(function (g, i) { g.classList.toggle('current', i === m); });
      Object.keys(graph.edges).forEach(function (k) { graph.edges[k].grp.classList.toggle('fired', k === lastEdge); });
      const r = rate.value, e = err.value, ft = c.fault * DEF.dt, bt = c.below * DEF.dt, dw = c.dwell * DEF.dt;
      groups[0].lamps[0].update({ on: r > SM.enterRateDeg, value: f(r, { fixed: 1, unit: 'deg/s' }) });
      groups[0].lamps[1].update({ on: c.fault >= lim.nF, value: f(Math.min(ft, SM.faultPersist), { fixed: 2 }) + '/' + SM.faultPersist + ' s', progress: Math.min(1, c.fault / lim.nF) });
      groups[1].lamps[0].update({ on: m === SD && c.below >= lim.nB, value: (m === SD ? f(bt, { fixed: 2 }) : '0.00') + '/' + SM.exitHold + ' s', progress: m === SD ? Math.min(1, c.below / lim.nB) : 0 });
      groups[2].lamps[0].update({ on: !fault.value, value: fault.value ? 'fault active' : 'clear' });
      groups[2].lamps[1].update({ on: r < SM.returnRateDeg, value: f(r, { fixed: 1, unit: 'deg/s' }) });
      groups[2].lamps[2].update({ on: e < SM.returnErrDeg, value: f(e, { fixed: 1, unit: '°' }) });
      groups[2].lamps[3].update({ on: m === SH && c.dwell >= lim.nD, value: (m === SH ? f(dw, { fixed: 1 }) : '0.0') + '/' + SM.dwell + ' s', progress: m === SH ? Math.min(1, c.dwell / lim.nD) : 0 });
      groups.forEach(function (g) { g.box.classList.toggle('active', g.mode === m); });
    }
    function advance(steps) {
      const inp = { rateDeg: rate.value, errDeg: err.value, fault: fault.value };
      for (let i = 0; i < steps; i++) {
        t += DEF.dt;
        const ev = machine.step(inp);
        if (ev) {
          lastEdge = ev.from + '-' + ev.to;
          addLog(NAMES[ev.from] + ARROW + NAMES[ev.to] + ' because ' + M.reasonText(ev.reason, SM));
          status.textContent = 'Entered ' + NAMES[ev.to] + ' at t = ' + f(t, { fixed: 2, unit: 's' }) + ' because ' + M.reasonText(ev.reason, SM) + '.';
        }
      }
      render();
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      play.querySelector('.btn-label').textContent = 'Start clock';
      play.replaceChild(ui.icon('play'), play.querySelector('svg'));
    }
    function start() {
      if (timer) return;
      timer = setInterval(function () { advance(100); }, 100);
      play.querySelector('.btn-label').textContent = 'Pause clock';
      play.replaceChild(ui.icon('pause'), play.querySelector('svg'));
    }
    function init() {
      stop();
      machine = M.createMachine(SM, DEF.dt);
      t = 0; lastEdge = null; logCount = 0;
      log.textContent = '';
      status.textContent = 'Machine reset: NOMINAL at t = 0. Start the clock or step it.';
      render();
    }
    play.addEventListener('click', function () { if (timer) stop(); else start(); });
    step.addEventListener('click', function () { advance(100); });
    reset.addEventListener('click', init);
    [rate, err, fault].forEach(function (c) { c.on('change', render); });
    forceBtns.forEach(function (b, to) {
      b.addEventListener('click', function () {
        const from = machine.mode;
        const res = machine.force(to, { fault: fault.value });
        if (res.ok && from !== to) {
          lastEdge = from + '-' + to;
          addLog('forced ' + NAMES[from] + ARROW + NAMES[to] + ': accepted (an allowed edge)', 'forced');
          status.textContent = 'Forced ' + NAMES[from] + ARROW + NAMES[to] + ': accepted, because the relation allows it.';
        } else if (res.ok) {
          status.textContent = 'Already in ' + NAMES[to] + '.';
        } else {
          addLog('refused: ' + res.reason, 'refused');
          status.textContent = 'Refused: ' + res.reason + '.';
          const k = from + '-' + to, edge = graph.edges[k];
          if (edge) {
            edge.grp.classList.add('rejected');
            setTimeout(function () { edge.grp.classList.remove('rejected'); }, 1500);
          }
        }
        render();
      });
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    init();
  }

  /* ================================================================ W8.2 hysteresis vs chatter */

  function buildHysteresis() {
    const w = parts('w-hysteresis');
    const mean = ui.slider({ id: 'w82-mean', label: 'Mean rate', min: 0, max: 1.5, step: 0.01, value: 0.55, unit: 'deg/s', tag: 'illustrative' });
    const sig = ui.slider({ id: 'w82-sigma', label: 'Noise σ', min: 0, max: 0.5, step: 0.01, value: 0.12, unit: 'deg/s', tag: 'illustrative' });
    const reseed = ui.button({ label: 'New noise sample', kind: 'ghost', icon: 'reset', small: true });
    [mean, sig].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Random noise'), el('div', { class: 'btn-row' }, reseed)));
    const thr = SM.exitRateDeg, hold = SM.exitHold, margin = 0.3;
    const MARGIN = { left: 56, right: 12 };
    const p = A.plot.line(w.out, { height: 190, title: 'Synthetic rate signal', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: MARGIN,
      series: [{ id: 'w', label: '|ω|', color: '--accent', width: 1.2, unit: 'deg/s' }],
      hlines: [{ y: thr, label: thr + ' deg/s threshold', color: '--line-thr', dash: [5, 4] }, { y: thr + margin, label: (thr + margin) + ' deg/s release (c)', color: '--text-2', dash: [2, 3] }] });
    const defs = [
      { key: 'a', title: '(a) Single threshold: quiet while |ω| < ' + thr + ' deg/s', tag: null },
      { key: 'b', title: '(b) Project: quiet after ' + hold + ' s continuously below ' + thr + ' deg/s', tag: 'project' },
      { key: 'c', title: '(c) As (b), released only above ' + (thr + margin) + ' deg/s', tag: 'option' }
    ];
    const rows = defs.map(function (d) {
      const count = el('span', { class: 'readout m08-switches' });
      const first = el('span', { class: 'muted m08-first' });
      const strip = svg('svg', { class: 'm08-strip', viewBox: '0 0 1000 20', preserveAspectRatio: 'none', role: 'img', 'aria-label': d.title });
      const box = el('div', { class: 'm08-detector' },
        el('p', { class: 'm08-det-title' }, d.title, d.tag ? [' ', ui.tag(d.tag)] : null),
        el('p', { class: 'm08-det-stats' }, count, ' ', first),
        el('div', { class: 'm08-strip-wrap' }, strip));
      w.out.appendChild(box);
      return { d: d, count: count, first: first, strip: strip };
    });
    w.out.appendChild(el('p', { class: 'm08-strip-key muted' }, el('span', { class: 'm08-key-quiet', 'aria-hidden': 'true' }), ' filled: the detector says "quiet" (the rate is low); empty: not quiet.'));
    let seed = 3;

    function run() {
      const dt = 0.05, T = 120, n = Math.round(T / dt) + 1;
      const tauC = 0.3, a = Math.exp(-dt / tauC), b = Math.sqrt(1 - a * a);
      const gs = A.rng.gaussianStream(seed);
      const t = new Float64Array(n), x = new Float64Array(n);
      let z = gs.next();
      for (let k = 0; k < n; k++) {
        t[k] = k * dt;
        if (k) z = a * z + b * gs.next();
        x[k] = Math.max(0, mean.value + 0.2 * Math.sin(2 * Math.PI * t[k] / 60) + sig.value * z);
      }
      p.set('w', t, x);
      const nB = Math.round(hold / dt);
      const states = { a: new Uint8Array(n), b: new Uint8Array(n), c: new Uint8Array(n) };
      let cb = 0, cc = 0, qb = 0, qc = 0;
      for (let k = 0; k < n; k++) {
        const low = x[k] < thr;
        states.a[k] = low ? 1 : 0;
        cb = low ? cb + 1 : 0;
        if (!low) qb = 0; else if (cb >= nB) qb = 1;
        states.b[k] = qb;
        if (qc) { if (x[k] >= thr + margin) { qc = 0; cc = 0; } }
        else { cc = low ? cc + 1 : 0; if (cc >= nB) qc = 1; }
        states.c[k] = qc;
      }
      const summary = [];
      rows.forEach(function (r) {
        const s = states[r.d.key];
        let sw = 0, firstQ = null;
        for (let k = 0; k < n; k++) { if (k && s[k] !== s[k - 1]) sw++; if (firstQ === null && s[k]) firstQ = t[k]; }
        const perMin = sw / (T / 60);
        r.count.textContent = f(perMin, { sig: 3 }) + ' switches/min (' + sw + ' in ' + T + ' s)';
        r.first.textContent = firstQ === null ? 'never quiet' : 'first quiet at ' + f(firstQ, { fixed: 1, unit: 's' });
        r.strip.textContent = '';
        r.strip.appendChild(svg('rect', { x: 0, y: 0, width: 1000, height: 20, class: 'm08-strip-bg' }));
        let s0 = -1;
        for (let k = 0; k <= n; k++) {
          const on = k < n && s[k];
          if (on && s0 < 0) s0 = k;
          if (!on && s0 >= 0) {
            const x0 = t[s0] / T * 1000, x1 = t[Math.min(k, n - 1)] / T * 1000;
            r.strip.appendChild(svg('rect', { x: x0.toFixed(2), y: 2, width: Math.max(0.8, x1 - x0).toFixed(2), height: 16, class: 'm08-strip-on' }));
            s0 = -1;
          }
        }
        r.strip.setAttribute('aria-label', r.d.title + ': ' + sw + ' switches in ' + T + ' s; ' + r.first.textContent + '.');
        summary.push(r.d.key + ' ' + sw);
      });
      p.summary('Synthetic rate with mean ' + mean.value + ' deg/s and noise ' + sig.value + ' deg/s. Switch counts: ' + summary.join(', ') + '.');
    }
    const go = ui.debounce(run, 60);
    [mean, sig].forEach(function (c) { c.on('change', go); });
    reseed.addEventListener('click', function () { seed += 1; run(); });
    run();
  }

  /* ================================================================ W8.3 transition-relation matrix */

  function relationCell(from, to, gap) {
    const allowed = M.allowedMatrix(gap)[from][to];
    if (from === to) {
      const stay = from === N ? '|ω| ≤ ' + SM.enterRateDeg + ' deg/s and fault active < ' + SM.faultPersist + ' s'
        : from === SD ? 'not yet ' + SM.exitHold + ' s continuously below ' + SM.exitRateDeg + ' deg/s'
          : T_STAY_SH + (gap ? '; and, with the gap closed, |ω| ≤ ' + SM.enterRateDeg + ' deg/s and fault active < ' + SM.faultPersist + ' s' : '');
      return { kind: 'self', label: 'stay', short: from === SH ? 'any guard false' : from === SD ? 'hold not done' : 'no trigger', icon: 'circle', text: 'Stay in ' + NAMES[from] + ' while ' + stay + '.', source: 'project' };
    }
    const forb = M.FORBIDDEN.some(function (pr) { return pr[0] === from && pr[1] === to; });
    if (forb) {
      const why = from === SD ? 'detumbling should pass through safe hold first' : 'safe hold should only occur after the detumble phase';
      return { kind: 'bad', label: 'forbidden', short: from === SD ? 'must pass SAFE_HOLD' : 'only after detumble', icon: 'cross', text: 'Forbidden: ' + why + '. The machine asserts this edge never fires; force() refuses it.', source: 'project' };
    }
    if (allowed) {
      if (from === SH && to === SD) return { kind: 'ok gap-closed', label: 'allowed (option)', short: '|ω| > ' + SM.enterRateDeg + ' or fault ' + SM.faultPersist + ' s', icon: 'check', text: 'Allowed with the gap closed, on a re-upset: ' + T_ENTER + '.', source: 'option' };
      const g = from === N ? T_ENTER : from === SD ? T_EXIT : T_RETURN;
      const extra = from === SH ? ' Returning while the fault is active is forbidden, so the guard includes "fault clear".' : '';
      const short = from === N ? '|ω| > ' + SM.enterRateDeg + ' or fault ' + SM.faultPersist + ' s' : from === SD ? '|ω| < ' + SM.exitRateDeg + ' for ' + SM.exitHold + ' s' : 'no fault, |ω| < ' + SM.returnRateDeg + ', e < ' + SM.returnErrDeg + '°, ' + SM.dwell + ' s';
      return { kind: 'ok', label: 'allowed', short: short, icon: 'check', text: 'Allowed when ' + g + '.' + extra, source: 'project' };
    }
    return { kind: 'gap', label: 'spec gap', short: 'not specified', icon: 'warn', text: 'Not specified. The notes neither allow nor forbid it, so the machine stays in SAFE_HOLD even if the craft is re-upset above ' + SM.enterRateDeg + ' deg/s.', source: 'project' };
  }

  function buildRelation() {
    const w = parts('w-relation');
    const gapT = ui.toggle({ id: 'w83-gap', label: 'Close the gap (SAFE_HOLD → SAFE_DETUMBLE on re-upset)', checked: false, tag: 'option' });
    w.controls.appendChild(gapT.el);
    const table = el('table', { class: 'm08-relation' });
    const thead = el('thead', null, el('tr', null, el('th', { scope: 'col' }, el('span', { class: 'visually-hidden' }, 'From'), el('span', { 'aria-hidden': 'true' }, 'from ↓ / to →')),
      [N, SD, SH].map(function (m) { return el('th', { scope: 'col' }, NAMES[m]); })));
    const tbody = el('tbody');
    table.appendChild(el('caption', { class: 'visually-hidden' }, 'Transition relation: rows are the current mode, columns the next mode'));
    table.appendChild(thead); table.appendChild(tbody);
    const wrap = el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Transition-relation matrix' }, table);
    w.out.appendChild(wrap);
    const detail = el('div', { class: 'm08-rel-detail', 'aria-live': 'polite' });
    w.out.appendChild(detail);
    const cells = [];
    [N, SD, SH].forEach(function (from) {
      const tr = el('tr', null, el('th', { scope: 'row' }, NAMES[from]));
      [N, SD, SH].forEach(function (to) {
        const btn = el('button', { type: 'button', class: 'm08-cell', 'aria-pressed': 'false' });
        btn.addEventListener('click', function () { select(from, to); });
        tr.appendChild(el('td', null, btn));
        cells.push({ from: from, to: to, btn: btn });
      });
      tbody.appendChild(tr);
    });
    let sel = [SH, SD];
    function paint() {
      cells.forEach(function (c) {
        const info = relationCell(c.from, c.to, gapT.value);
        c.btn.className = 'm08-cell ' + info.kind;
        c.btn.textContent = '';
        c.btn.appendChild(el('span', { class: 'visually-hidden' }, NAMES[c.from] + ' to ' + NAMES[c.to] + ': '));
        c.btn.appendChild(el('span', { class: 'm08-cell-head' }, ui.icon(info.icon), el('span', null, info.label)));
        c.btn.appendChild(el('span', { class: 'm08-cell-short' }, info.short));
        c.btn.setAttribute('aria-pressed', c.from === sel[0] && c.to === sel[1] ? 'true' : 'false');
      });
      const info = relationCell(sel[0], sel[1], gapT.value);
      detail.textContent = '';
      detail.appendChild(el('h4', null, NAMES[sel[0]] + ARROW + NAMES[sel[1]]));
      detail.appendChild(el('p', null, info.text, ' ', ui.tag(info.source)));
      if (sel[0] === SH && sel[1] === SD) {
        detail.appendChild(el('p', null, gapT.value ? ui.simLink('Run T03 with the gap closed in the simulator', { preset: 'T03', gap: 1 })
          : 'Turn on "close the gap" to see the site option, which adds this edge with the same trigger as NOMINAL’s entry guard.'));
      }
    }
    function select(from, to) { sel = [from, to]; paint(); }
    gapT.on('change', paint);
    paint();
  }

  /* ================================================================ W8.4 prove vs find */

  const KEYS = M.ABSTRACT_KEYS;
  const KEY_TEXT = {
    rateHigh: '|ω| > ' + SM.enterRateDeg, faultPersisted: 'fault ≥ ' + SM.faultPersist + ' s', belowHeld: '|ω| < ' + SM.exitRateDeg + ' held ' + SM.exitHold + ' s',
    fault: 'fault', rateLow: '|ω| < ' + SM.exitRateDeg, errSmall: 'error < ' + SM.returnErrDeg + '°', dwellDone: 'dwell ≥ ' + SM.dwell + ' s'
  };
  function abstractInputs() {
    const all = [];
    for (let bits = 0; bits < 128; bits++) {
      const a = {};
      let pop = 0;
      KEYS.forEach(function (k, i) { a[k] = !!(bits & (1 << i)); if (a[k]) pop++; });
      all.push({ a: a, pop: pop, bits: bits });
    }
    all.sort(function (x, y) { return x.pop - y.pop || x.bits - y.bits; });
    return all;
  }
  const INPUTS = abstractInputs();
  function describe(a) {
    const on = KEYS.filter(function (k) { return a[k]; }).map(function (k) { return KEY_TEXT[k]; });
    return on.length ? on.join(', ') : 'no guard input true';
  }
  /** Check one abstract transition; returns the list of violated property ids/texts. */
  function violationsOf(from, a, succ) {
    const out = [];
    succ.forEach(function (to) {
      M.ABSTRACT_INVARIANTS.forEach(function (inv) { if (!inv.check(from, to, a)) out.push({ id: inv.id, text: inv.text, to: to }); });
    });
    if (succ.length !== 1) out.push({ id: 'det', text: 'Deterministic: exactly one successor' });
    return out;
  }
  function exhaustive(cfg) {
    const props = [{ id: 'det', text: 'Deterministic: exactly one successor' }].concat(M.ABSTRACT_INVARIANTS.map(function (i) { return { id: i.id, text: i.text }; }));
    props.push({ id: 'reach', text: 'NOMINAL reachable from every mode' });
    const count = {}; props.forEach(function (p) { count[p.id] = 0; });
    let valid = 0, bad = 0;
    const adj = [[], [], []];
    [N, SD, SH].forEach(function (m) {
      INPUTS.forEach(function (inp) {
        if (!M.abstractValid(inp.a)) return;
        valid++;
        const succ = M.nextModeAbstract(m, inp.a, cfg);
        succ.forEach(function (s) { if (adj[m].indexOf(s) < 0) adj[m].push(s); });
        const v = violationsOf(m, inp.a, succ);
        if (v.length) bad++;
        const seen = {};
        v.forEach(function (x) { if (!seen[x.id]) { count[x.id]++; seen[x.id] = true; } });
      });
    });
    let unreachable = [];
    [N, SD, SH].forEach(function (m) {
      const seen = [false, false, false]; seen[m] = true;
      const q = [m];
      while (q.length) { const u = q.shift(); adj[u].forEach(function (s) { if (!seen[s]) { seen[s] = true; q.push(s); } }); }
      if (!seen[N]) unreachable.push(m);
    });
    count.reach = unreachable.length;
    // shortest counterexample: BFS over modes from NOMINAL, inputs free at every step
    const parent = [null, null, null], visited = [true, false, false];
    let frontier = [N], trace = null;
    while (frontier.length && !trace) {
      const next = [];
      for (let i = 0; i < frontier.length && !trace; i++) {
        const m = frontier[i];
        for (let j = 0; j < INPUTS.length && !trace; j++) {
          const inp = INPUTS[j];
          if (!M.abstractValid(inp.a)) continue;
          const succ = M.nextModeAbstract(m, inp.a, cfg);
          const v = violationsOf(m, inp.a, succ);
          if (v.length) {
            const steps = [];
            let cur = m;
            while (parent[cur]) { steps.unshift(parent[cur]); cur = parent[cur].from; }
            steps.push({ from: m, a: inp.a, to: v[0].to !== undefined ? v[0].to : succ[0], succ: succ, bad: v[0] });
            trace = steps;
            break;
          }
          succ.forEach(function (s) { if (!visited[s]) { visited[s] = true; parent[s] = { from: m, a: inp.a, to: s }; next.push(s); } });
        }
      }
      frontier = next;
    }
    return { props: props, count: count, valid: valid, bad: bad, total: 3 * 128, trace: trace, unreachable: unreachable };
  }

  function buildProveFind() {
    const w = parts('w-prove-find');
    const bugOpts = [{ value: '0', label: 'None (the project logic)' }].concat(M.BUGS.map(function (b) { return { value: String(b.id), label: 'Bug ' + b.id + ': ' + b.label }; }));
    const bug = ui.select({ id: 'w84-bug', label: 'Planted bug', options: bugOpts, value: '0' });
    const gapT = ui.toggle({ id: 'w84-gap', label: 'Close the gap (SH → SD on re-upset)', checked: false, tag: 'option' });
    const randBtn = ui.button({ label: 'Random test until a violation', kind: 'secondary', icon: 'play' });
    [bug, gapT].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Random testing (up to 100,000 samples)'), el('div', { class: 'btn-row' }, randBtn)));
    const grid = el('div', { class: 'grid-2 m08-pf' });
    const exBox = el('div', { class: 'm08-pf-box' }), rnBox = el('div', { class: 'm08-pf-box' });
    grid.appendChild(exBox); grid.appendChild(rnBox);
    w.out.appendChild(grid);
    exBox.appendChild(el('h4', null, 'Exhaustive check (complete)'));
    const exVerdict = el('p', { class: 'm08-verdict', 'aria-live': 'polite' });
    exBox.appendChild(exVerdict);
    const exTable = el('div');
    exBox.appendChild(exTable);
    const exTrace = el('div', { class: 'm08-trace' });
    exBox.appendChild(exTrace);
    rnBox.appendChild(el('h4', null, 'Random testing (incomplete)'));
    const rnOut = el('div', { 'aria-live': 'polite' });
    rnBox.appendChild(rnOut);
    let last = null, seed = 1;

    function cfg() {
      const c = {};
      const id = Number(bug.value);
      M.BUGS.forEach(function (b) { if (b.id === id) c[b.key] = true; });
      if (gapT.value) c.holdToDetumble = true;
      return c;
    }
    function check() {
      const r = last = exhaustive(cfg());
      const allOk = r.bad === 0 && r.unreachable.length === 0;
      exVerdict.textContent = '';
      exVerdict.appendChild(ui.badge(allOk ? 'pass' : 'fail', allOk ? 'PROVED' : 'VIOLATION'));
      exVerdict.appendChild(document.createTextNode(allOk
        ? ' No violation in 3 × 128 = ' + r.total + ' abstract states (' + r.valid + ' consistent). Over this abstraction, the properties hold.'
        : ' ' + r.bad + ' of the ' + r.valid + ' consistent abstract states break a property.'));
      exTable.textContent = '';
      exTable.appendChild(ui.table([{ key: 'p', label: 'Property' }, { key: 'r', label: 'Result' }, { key: 'n', label: 'Violating states', num: true }],
        r.props.map(function (p) {
          const n = r.count[p.id];
          return [p.text, ui.badge(n ? 'fail' : 'pass'), p.id === 'reach' ? (n ? r.unreachable.map(function (m) { return SHORT[m]; }).join(', ') : '0') : String(n)];
        }), { caption: 'Properties checked over every consistent abstract state', compact: true, rowHeaders: true }));
      exTrace.textContent = '';
      if (r.trace) {
        exTrace.appendChild(el('p', { class: 'm08-trace-title' }, 'Shortest counterexample from NOMINAL (' + r.trace.length + ' step' + (r.trace.length === 1 ? '' : 's') + '):'));
        const ol = el('ol', { class: 'm08-trace-steps' });
        r.trace.forEach(function (s, i) {
          const last = i === r.trace.length - 1;
          ol.appendChild(el('li', { class: last ? 'bad' : null },
            el('span', { class: 'readout' }, SHORT[s.from] + ARROW + (last && s.succ.length > 1 ? '{' + s.succ.map(function (x) { return SHORT[x]; }).join(', ') + '}' : SHORT[s.to])),
            ' with ' + describe(s.a) + (last ? '. Breaks: ' + s.bad.text + '.' : '')));
        });
        exTrace.appendChild(ol);
      }
      rnOut.textContent = '';
      rnOut.appendChild(el('p', { class: 'muted' }, r.bad
        ? 'A uniformly random consistent state breaks a property with probability ' + r.bad + '/' + r.valid + ', so random testing needs about ' + f(r.valid / r.bad, { sig: 3 }) + ' samples on average to hit one.'
        : 'No consistent state breaks a property, so no number of random samples will ever find a violation, and no number of them proves there is none.'));
    }
    function randomTest() {
      const c = cfg();
      const rnd = A.rng.mulberry32(1000 + seed++);
      const MAX = 100000;
      // One uniform draw over the 3 × 128 abstract states is a uniform mode with seven fair,
      // independent booleans. A state's verdict is a pure function of (mode, inputs, planted
      // bug), so it is memoised for this press: 100,000 samples of the correct machine then
      // take a few milliseconds instead of a 200 ms main-thread task (§7.6).
      const NS = 3 * 128;
      const memo = new Array(NS);
      function verdictOf(idx) {
        let r = memo[idx];
        if (r === undefined) {
          const m = idx >> 7, bits = idx & 127, a = {};
          KEYS.forEach(function (k, i) { a[k] = !!(bits & (1 << i)); });
          if (!M.abstractValid(a)) r = null;
          else {
            const succ = M.nextModeAbstract(m, a, c);
            const v = violationsOf(m, a, succ);
            r = { m: m, a: a, v: v.length ? v[0] : null, succ: succ };
          }
          memo[idx] = r;
        }
        return r;
      }
      let drawn = 0, rejected = 0, hit = null;
      while (drawn < MAX) {
        const r = verdictOf(Math.floor(rnd() * NS));
        if (r === null) { rejected++; continue; }
        drawn++;
        if (r.v) { hit = r; break; }
      }
      rnOut.textContent = '';
      if (hit) {
        rnOut.appendChild(el('p', null, ui.badge('fail', 'FOUND'), ' after ' + drawn.toLocaleString('en-GB') + ' sample' + (drawn === 1 ? '' : 's') + ' (' + rejected.toLocaleString('en-GB') + ' inconsistent draws discarded): in ' +
          NAMES[hit.m] + ' with ' + describe(hit.a) + ', breaking "' + hit.v.text + '".'));
      } else {
        rnOut.appendChild(el('p', null, ui.badge('na', 'NOTHING FOUND'), ' in ' + MAX.toLocaleString('en-GB') + ' samples. That is evidence, not proof: sampling cannot certify the absence of a bug. Only the exhaustive check can.'));
      }
      if (last && last.bad) rnOut.appendChild(el('p', { class: 'muted' }, 'Expected about ' + f(last.valid / last.bad, { sig: 3 }) + ' samples. Press again for a new random sequence.'));
    }
    bug.on('change', check);
    gapT.on('change', check);
    randBtn.addEventListener('click', randomTest);
    check();
  }

  /* ================================================================ W8.5 mode-trace monitor */

  const TOKEN_RE = /^(N|SD|SH)(!?)(?:[*×x](\d+))?$/i;
  function parseLog(text) {
    const toks = text.trim().split(/[\s,;]+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const m = TOKEN_RE.exec(toks[i]);
      if (!m) return { error: 'Token ' + (i + 1) + ' "' + toks[i] + '" is not N, SD or SH (optionally with ! and *k).' };
      const mode = SHORT.indexOf(m[1].toUpperCase());
      const k = m[3] ? parseInt(m[3], 10) : 1;
      if (!(k >= 1)) return { error: 'Token ' + (i + 1) + ' repeats zero times.' };
      out.push({ mode: mode, fault: m[2] === '!', k: k, text: toks[i] });
    }
    if (!out.length) return { error: 'The log is empty.' };
    return { tokens: out };
  }
  function runDfa(tokens) {
    let state = N, ticks = 0;
    const steps = [];
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      let next = state, rule = null;
      if (state !== tk.mode) {
        if (state === N && tk.mode === SD) next = SD;
        else if (state === SD && tk.mode === SH) next = SH;
        else if (state === SH && tk.mode === N) {
          if (tk.fault) rule = 'SAFE_HOLD' + ARROW + 'NOMINAL while the fault is active';
          else next = N;
        } else if (state === N && tk.mode === SH) rule = 'NOMINAL' + ARROW + 'SAFE_HOLD is forbidden';
        else if (state === SD && tk.mode === N) rule = 'SAFE_DETUMBLE' + ARROW + 'NOMINAL is forbidden';
        else if (state === SH && tk.mode === SD) rule = 'SAFE_HOLD' + ARROW + 'SAFE_DETUMBLE is not in the specification';
      }
      if (rule) { steps.push({ tk: tk, state: 'ERR', rule: rule, from: state, at: ticks }); return { ok: false, steps: steps, at: i, ticks: ticks, rule: rule }; }
      state = next;
      ticks += tk.k;
      steps.push({ tk: tk, state: SHORT[state] });
    }
    return { ok: true, steps: steps, ticks: ticks, final: state };
  }
  function regexAccepts(tokens) {
    const sym = 'n' + tokens.map(function (t) { return 'ndh'[t.mode]; }).join('');
    return /^n+(d+h+n+)*(d+h*)?$/.test(sym);
  }
  function rle(r) {
    const out = [];
    let s = 0;
    for (let k = 1; k <= r.n; k++) {
      if (k === r.n || r.mode[k] !== r.mode[s] || r.fault[k] !== r.fault[s]) {
        out.push(SHORT[r.mode[s]] + (r.fault[s] ? '!' : '') + (k - s > 1 ? '*' + (k - s) : ''));
        s = k;
      }
    }
    return out.join(' ');
  }
  const BROKEN = [
    { text: 'SD*450 SH*3476 N*600 SD*300 N*500', note: 'a detumble that skips SAFE_HOLD' },
    { text: 'SD*450 SH!*1200 N!*400', note: 'a return while the fault is still active' },
    { text: 'N*300 SH*900 N*200', note: 'NOMINAL straight to SAFE_HOLD' },
    { text: 'SD*450 SH*500 SD*300 SH*800 N*100', note: 'a re-upset during SAFE_HOLD (the gap)' }
  ];

  function buildMonitor() {
    const w = parts('w-monitor');
    const id = 'w85-log';
    const area = el('textarea', { id: id, class: 'm08-log-input', rows: '3', spellcheck: 'false', autocomplete: 'off', 'aria-describedby': id + '-help' });
    const t03 = ui.button({ label: 'Load from T03', kind: 'secondary', icon: 'sim' });
    const broken = ui.button({ label: 'Load a broken log', kind: 'secondary', icon: 'warn' });
    const checkBtn = ui.button({ label: 'Check', kind: 'primary', icon: 'check' });
    w.controls.classList.add('m08-mon-controls');
    w.controls.appendChild(el('div', { class: 'field m08-log-field' },
      el('label', { class: 'field-label', for: id }, 'Mode log (run-length tokens)'), area,
      el('p', { class: 'field-help', id: id + '-help' }, 'Example: SD*450 SH*3476 N*574. A ! after a token marks the fault as active.'),
      el('div', { class: 'btn-row' }, t03, broken, checkBtn)));
    const verdict = el('p', { class: 'm08-verdict', 'aria-live': 'polite' });
    const chips = el('ol', { class: 'm08-chips', 'aria-label': 'Monitor steps' });
    const regex = el('p', { class: 'm08-regex' });
    [verdict, chips, regex].forEach(function (n) { w.out.appendChild(n); });
    let brokenIdx = 0, t03text = null;

    function check() {
      ui.clearError(w.out);
      chips.textContent = ''; verdict.textContent = ''; regex.textContent = '';
      const p = parseLog(area.value);
      if (p.error) { ui.showError(w.out, p.error); return; }
      const r = runDfa(p.tokens);
      const MAXC = 40;
      r.steps.slice(0, MAXC).forEach(function (s) {
        chips.appendChild(el('li', { class: 'm08-chip' + (s.state === 'ERR' ? ' bad' : '') },
          el('span', { class: 'm08-chip-tok' }, s.tk.text), el('span', { class: 'm08-chip-arrow', 'aria-hidden': 'true' }, '→'),
          el('span', { class: 'visually-hidden' }, ' moves the monitor to '), el('span', { class: 'm08-chip-state' }, s.state)));
      });
      if (r.steps.length > MAXC) chips.appendChild(el('li', { class: 'm08-chip more' }, '… ' + (r.steps.length - MAXC) + ' more'));
      if (r.ok) {
        verdict.appendChild(ui.badge('pass', 'ACCEPT'));
        verdict.appendChild(document.createTextNode(' ' + p.tokens.length + ' tokens, ' + r.ticks.toLocaleString('en-GB') + ' ticks read in one pass; the monitor ends in ' + NAMES[r.final] + ' and never reached ERR.'));
      } else {
        verdict.appendChild(ui.badge('fail', 'REJECT'));
        verdict.appendChild(document.createTextNode(' at token ' + (r.at + 1) + ' ("' + p.tokens[r.at].text + '", after ' + r.ticks.toLocaleString('en-GB') + ' ticks): ' + r.rule + '.'));
      }
      const acc = regexAccepts(p.tokens);
      regex.appendChild(document.createTextNode('Regular expression N+ (SD+ SH+ N+)* (SD+ SH*)? on the mode sequence, with the initial N: '));
      regex.appendChild(ui.badge(acc ? 'pass' : 'fail', acc ? 'matches' : 'does not match'));
      const faultOnly = acc && !r.ok;
      if (faultOnly) regex.appendChild(document.createTextNode(' The pattern ignores the fault flag, so it misses this violation; the automaton does not.'));
    }
    t03.addEventListener('click', function () {
      if (!t03text) {
        try { t03text = rle(A.sim.run(A.presets.get('T03'))); } catch (err) {
          if (err instanceof RangeError) { ui.showError(w.out, err); return; }
          throw err;
        }
      }
      area.value = t03text;
      check();
    });
    broken.addEventListener('click', function () {
      const b = BROKEN[brokenIdx++ % BROKEN.length];
      area.value = b.text;
      check();
      ui.announce('Loaded a broken log: ' + b.note + '.');
    });
    checkBtn.addEventListener('click', check);
    area.addEventListener('input', ui.debounce(check, 300));
    area.value = 'SD*450 SH*3476 N*574 N!*49 SD!*200 SH!*1251 N*6001';
    check();
  }

  /* ================================================================ W8.6 mode logic as a rule engine */

  function buildRuleEngine() {
    const w = parts('w-rule-engine');
    const WD_T = 1;                                               // watchdog confirmation window (s), illustrative
    const modeSel = ui.segmented({ id: 'w86-mode', label: 'Current mode (a fact)', value: String(N),
      options: [N, SD, SH].map(function (m) { return { value: String(m), label: NAMES[m] }; }) });
    const rate = ui.slider({ id: 'w86-rate', label: 'Body rate |ω|', min: 0, max: 15, step: 0.1, value: 0.3, unit: 'deg/s' });
    const faultT = ui.slider({ id: 'w86-fault', label: 'Fault flag active for', min: 0, max: 2, step: 0.05, value: 0, unit: 's', help: '0 means the fault flag is clear.' });
    const belowT = ui.slider({ id: 'w86-below', label: 'Time continuously below ' + SM.exitRateDeg + ' deg/s', min: 0, max: 5, step: 0.1, value: 0, unit: 's' });
    const err = ui.slider({ id: 'w86-err', label: 'Attitude error', min: 0, max: 30, step: 0.5, value: 2, unit: '°' });
    const dwell = ui.slider({ id: 'w86-dwell', label: 'Dwell time in SAFE_HOLD', min: 0, max: 20, step: 0.5, value: 0, unit: 's' });
    const stuck = ui.toggle({ id: 'w86-stuck', label: 'Stuck wheel (a fault no rule mentions)', checked: false, tag: 'illustrative' });
    const wd = ui.toggle({ id: 'w86-wd', label: 'Watchdog rule: health must be confirmed every ' + WD_T + ' s', checked: false, tag: 'option' });
    const apply = ui.button({ label: 'Apply the result as the new mode', kind: 'secondary', icon: 'step-fwd' });
    [modeSel, rate, faultT, belowT, err, dwell, stuck, wd].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Next cycle'), el('div', { class: 'btn-row' }, apply)));

    const result = el('p', { class: 'm08-verdict m08-re-result', 'aria-live': 'polite' });
    const grid = el('div', { class: 'grid-2 m08-re-grid' });
    const wmBox = el('div', { class: 'm08-pf-box' }, el('h4', null, 'Working memory'));
    const ruleBox = el('div', { class: 'm08-pf-box' }, el('h4', null, 'Mode rules, in priority order'));
    const wm = el('dl', { class: 'm08-wm' });
    const rules = el('ol', { class: 'm08-rules' });
    wmBox.appendChild(wm); ruleBox.appendChild(rules);
    grid.appendChild(wmBox); grid.appendChild(ruleBox);
    const xcheck = el('p', { class: 'm08-re-x muted' });
    const auditTitle = el('p', { class: 'm08-log-title' }, 'Audit trail (newest first)');
    const audit = el('ol', { class: 'm08-log', reversed: true });
    [result, grid, xcheck, auditTitle, audit].forEach(function (n) { w.out.appendChild(n); });
    let cycle = 0, last = null;

    function clause(text, ok) { return { text: text, ok: !!ok }; }
    function evaluate() {
      const m = Number(modeSel.value), r = rate.value, ft = faultT.value, bt = belowT.value, e = err.value, dw = dwell.value;
      const d = {
        rateHigh: r > SM.enterRateDeg, rateLow: r < SM.exitRateDeg, fault: ft > 0, faultPersisted: ft >= SM.faultPersist,
        errSmall: e < SM.returnErrDeg, dwellDone: dw >= SM.dwell, healthConfirmed: !stuck.value
      };
      d.belowHeld = d.rateLow && bt >= SM.exitHold;
      const R = [
        { id: 'R1', then: SD, reason: 'rate or persistent fault', when: m === N, clauses: [clause('mode = NOMINAL', m === N),
          clause('|ω| > ' + SM.enterRateDeg + ' (' + f(r, { fixed: 1 }) + ') or fault ≥ ' + SM.faultPersist + ' s (' + f(ft, { fixed: 2 }) + ' s)', d.rateHigh || d.faultPersisted)] },
        { id: 'R2', then: SH, reason: 'rate held low', when: m === SD, clauses: [clause('mode = SAFE_DETUMBLE', m === SD),
          clause('|ω| < ' + SM.exitRateDeg + ' held ' + SM.exitHold + ' s (' + (d.rateLow ? f(bt, { fixed: 1 }) + ' s' : 'reset: |ω| = ' + f(r, { fixed: 1 })) + ')', d.belowHeld)] },
        { id: 'R3', then: N, reason: 'return guards', when: m === SH, clauses: [clause('mode = SAFE_HOLD', m === SH), clause('fault clear', !d.fault),
          clause('|ω| < ' + SM.returnRateDeg + ' (' + f(r, { fixed: 1 }) + ')', r < SM.returnRateDeg), clause('error < ' + SM.returnErrDeg + '° (' + f(e, { fixed: 1 }) + '°)', d.errSmall),
          clause('dwell ≥ ' + SM.dwell + ' s (' + f(dw, { fixed: 1 }) + ' s)', d.dwellDone)] }
      ];
      if (wd.value) {
        R.push({ id: 'W', then: SD, reason: 'health not confirmed', when: m === N, watchdog: true, clauses: [clause('mode = NOMINAL', m === N),
          clause('health not confirmed within ' + WD_T + ' s', !d.healthConfirmed)] });
      }
      R.forEach(function (x) { x.matched = x.clauses.every(function (c) { return c.ok; }); });
      const fired = R.find(function (x) { return x.matched; }) || null;
      return { m: m, d: d, R: R, fired: fired, next: fired ? fired.then : m };
    }
    function render() {
      belowT.disable(Number(modeSel.value) !== SD);
      dwell.disable(Number(modeSel.value) !== SH);
      const s = last = evaluate();
      wm.textContent = '';
      const facts = [
        ['mode', NAMES[s.m]], ['|ω|', f(rate.value, { fixed: 1, unit: 'deg/s' })], ['fault active for', f(faultT.value, { fixed: 2, unit: 's' })],
        ['below ' + SM.exitRateDeg + ' deg/s for', f(belowT.value, { fixed: 1, unit: 's' })], ['attitude error', f(err.value, { fixed: 1, unit: '°' })],
        ['dwell', f(dwell.value, { fixed: 1, unit: 's' })], ['wheel 2', stuck.value ? 'stuck (no rule mentions it)' : 'responding']
      ];
      facts.forEach(function (p, i) {
        wm.appendChild(el('div', { class: i === 6 && stuck.value ? 'unref' : null }, el('dt', null, p[0]), el('dd', null, p[1])));
      });
      const derived = [['rateHigh', s.d.rateHigh], ['rateLow', s.d.rateLow], ['fault', s.d.fault], ['faultPersisted', s.d.faultPersisted], ['belowHeld', s.d.belowHeld],
        ['errSmall', s.d.errSmall], ['dwellDone', s.d.dwellDone]].concat(wd.value ? [['healthConfirmed', s.d.healthConfirmed]] : []);
      wm.appendChild(el('div', { class: 'm08-derived' }, el('dt', null, 'derived'), el('dd', null, derived.map(function (p) {
        return el('span', { class: 'm08-fact ' + (p[1] ? 'on' : 'off') }, p[0] + ' = ' + (p[1] ? 'true' : 'false'));
      }))));
      rules.textContent = '';
      s.R.forEach(function (x) {
        const isFired = s.fired === x;
        const state = isFired ? 'fired' : x.matched ? 'matched, lower priority' : !x.when ? 'mode does not match' : 'not matched';
        rules.appendChild(el('li', { class: 'm08-rule' + (isFired ? ' fired' : x.matched ? ' matched' : '') + (x.watchdog ? ' watchdog' : '') },
          el('p', { class: 'm08-rule-head' }, el('strong', null, x.id), ' IF all hold THEN mode := ' + NAMES[x.then], el('span', { class: 'm08-rule-state' }, state)),
          el('ul', { class: 'm08-clauses' }, x.clauses.map(function (c) {
            return el('li', { class: c.ok ? 'ok' : 'no' }, ui.icon(c.ok ? 'check' : 'cross', { label: c.ok ? 'holds' : 'fails' }), ' ', c.text);
          }))));
      });
      result.textContent = '';
      if (s.fired) {
        result.appendChild(ui.badge('pass', s.fired.id + ' FIRED'));
        result.appendChild(document.createTextNode(' ' + NAMES[s.m] + ARROW + NAMES[s.next] + ' (' + s.fired.reason + ').' +
          (s.R.filter(function (x) { return x.matched; }).length > 1 ? ' More than one rule matched; priority chose ' + s.fired.id + '.' : '')));
      } else {
        result.appendChild(ui.badge('na', 'NO RULE FIRED'));
        result.appendChild(document.createTextNode(stuck.value && s.m === N
          ? ' The mode stays NOMINAL. The stuck wheel changed a fact that no rule reads, so the supervisor is silent and the craft looks healthy.'
          : ' The mode stays ' + NAMES[s.m] + ': no rule’s conditions all hold.'));
      }
      const abs = M.nextModeAbstract(s.m, { rateHigh: s.d.rateHigh, faultPersisted: s.d.faultPersisted, belowHeld: s.d.belowHeld, fault: s.d.fault,
        rateLow: s.d.rateLow, errSmall: s.d.errSmall, dwellDone: s.d.dwellDone });
      const core = s.R.find(function (x) { return x.matched && !x.watchdog; });
      const coreNext = core ? core.then : s.m;
      xcheck.textContent = 'Cross-check: ADCS.modes.nextModeAbstract gives ' + NAMES[abs[0]] + (abs.length === 1 && abs[0] === coreNext ? ', the same as rules R1 to R3.' : ', which DIFFERS from rules R1 to R3.') +
        (s.fired && s.fired.watchdog ? ' The abstract machine has no watchdog rule; the difference is the site option.' : '');
    }
    function log(text) {
      cycle++;
      audit.insertBefore(el('li', { value: String(cycle) }, text), audit.firstChild);
      while (audit.children.length > 6) audit.removeChild(audit.lastChild);
    }
    apply.addEventListener('click', function () {
      const s = last || evaluate();
      if (!s.fired) { log('cycle ' + (cycle + 1) + ': no rule fired; mode stays ' + NAMES[s.m] + '.'); return; }
      log('cycle ' + (cycle + 1) + ': ' + s.fired.id + ' fired, ' + NAMES[s.m] + ARROW + NAMES[s.next] + ', with |ω| = ' + f(rate.value, { fixed: 1, unit: 'deg/s' }) +
        ', fault ' + f(faultT.value, { fixed: 2, unit: 's' }) + ', error ' + f(err.value, { fixed: 1, unit: '°' }) + '.');
      modeSel.set(String(s.next));
      if (s.next === SD) belowT.set(0);                          // the machine resets the counters on entry
      if (s.next === SH) dwell.set(0);
      render();
    });
    [modeSel, rate, faultT, belowT, err, dwell, stuck, wd].forEach(function (c) { c.on('change', render); });
    render();
  }

  /* ================================================================ derived numbers in the prose */

  function fillCalc() {
    const lim = M.limits(SM, DEF.dt);
    const l10 = M.limits(SM, 0.1);
    const big = 3 * (lim.nB + 1) * (lim.nF + 1) * (lim.nD + 1);
    const vals = {
      detumble: String(DEF.detumble.Kd),
      'hold-kp': String(DEF.hold.Kp),
      'hold-kd': String(DEF.hold.Kd),
      counters: lim.nF + ', ' + lim.nB + ' and ' + lim.nD + ' steps',
      explosion: 'about ' + f(big / 1e6, { sig: 3 }) + ' million'
    };
    if (3 * (l10.nB + 1) * (l10.nF + 1) * (l10.nD + 1) !== 30618) vals.explosion += ' (dt = 0.1 s gives ' + 3 * (l10.nB + 1) * (l10.nF + 1) * (l10.nD + 1) + ')';
    ui.qsa('.calc[data-calc]').forEach(function (s) {
      const k = s.getAttribute('data-calc');
      if (vals[k] !== undefined) s.textContent = vals[k];
    });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm08' });
    fillCalc();
    buildStateMachine();
    buildHysteresis();
    buildProveFind();
    buildMonitor();
    buildRelation();
    buildRuleEngine();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'The spacecraft has been in SAFE_HOLD for 9 s, the rate is 0.2 deg/s, the error is 3° and the fault is still active. What is the next mode?',
        options: ['NOMINAL.', 'It stays in SAFE_HOLD.', 'SAFE_DETUMBLE.'], correct: 1,
        explain: 'The return guard is a conjunction: fault clear and |ω| < 0.5 deg/s and error < 4° and dwell ≥ 8 s. Three conjuncts hold, but the fault is active, and by De Morgan one failing conjunct is enough to stay. SAFE_DETUMBLE is not reachable from SAFE_HOLD at all in the specification as written.' },
      { q: 'Why can’t 60 passing Monte Carlo trials prove that the forbidden transitions never happen?',
        options: ['60 is too few; 600 would prove it.', 'Monte Carlo ignores the modes.', 'Sampling can find bugs but not prove their absence; an exhaustive check of the finite logic can.'], correct: 2,
        explain: 'Any finite sample can miss the one combination that triggers a bug; here the campaign never even injects a fault. The mode logic is finite once its guards are abstracted to booleans, so all 384 abstract states can be checked, which is a proof over that abstraction.' },
      { q: 'What does the 2 s “continuously below 0.5 deg/s” timer prevent?',
        options: ['Flapping between modes when the rate hovers near the threshold.', 'Torque saturation.', 'Quaternion drift.'], correct: 0,
        explain: 'Noise near a single threshold makes the decision flip many times a minute. Requiring the condition to hold for 2 s, together with the 6 / 0.5 deg/s gap, turns those flips into one clean transition, and the 8 s dwell bounds how often the cycle can repeat.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm08');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    // LOCAL (request P0): equations can overflow only after the KaTeX fonts load, so mark the scroll boxes again then.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ui.markScrollable(document.body); });
    ui.linkTerms(document.body);
  });
})();
