/**
 * m13.js: Module 13, operations, human factors and safety culture (package P6).
 * Widgets: W13.1 Swiss-cheese stack, W13.2 automation level, W13.3 commanding across the gap,
 * W13.4 reboot into the right mode (two engine runs joined and checked with ADCS.modes.checkTrace),
 * W13.5 alarm fatigue (stretch). Contact model, link figures and detector settings are illustrative.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el, svg = ui.svg;
  const R2D = A.units.R2D;
  const NAMES = A.modes.NAMES;
  const SM = A.params.DEFAULTS.safeMode;

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
  function pct(x, d) { return f(100 * x, { fixed: d === undefined ? 1 : d, unit: '%' }); }
  function windows(flags, t, shift) {
    const out = [], s = shift || 0;
    let start = -1;
    for (let k = 0; k <= flags.length; k++) {
      const on = k < flags.length && flags[k];
      if (on && start < 0) start = k;
      if (!on && start >= 0) { out.push({ t0: t[start] + s, t1: t[Math.min(k, t.length - 1)] + s }); start = -1; }
    }
    return out;
  }
  function riskBadge(level) {
    const cls = level === 'High' ? 'fail' : level === 'Low' ? 'pass' : 'na';
    return ui.badge(cls, level);
  }
  let t03 = null;
  function T03() { if (!t03) t03 = A.sim.run(A.presets.get('T03')); return t03; }

  /* ================================================================ W13.1 Swiss-cheese stack */

  function buildSwiss() {
    const w = parts('w-swiss');
    const SLICES = [
      { id: 'ctrl', label: 'Controller and saturation (S2)', short: 'Saturation' },
      { id: 'rate', label: 'Rate-limit checks (S1)', short: 'Rate check' },
      { id: 'hyst', label: 'Hysteresis and dwell', short: 'Hysteresis' },
      { id: 'forbid', label: 'Forbidden transitions', short: 'Forbidden' },
      { id: 'mc', label: 'Monte Carlo verification', short: 'Monte Carlo' },
      { id: 'risk', label: 'Risk register', short: 'Register' }
    ];
    const HAZ = [
      { label: 'Excessive gain', stop: ['ctrl', 'rate', 'mc'], how: 'saturation bounds the torque, the S1 check flags the rate, Monte Carlo finds the bad cases' },
      { label: 'Mode flapping under noise', stop: ['hyst'], how: 'hysteresis and the minimum dwell' },
      { label: 'Quaternion sign ambiguity', stop: ['ctrl'], how: 'the shortest-rotation error in the controller' },
      { label: 'Fault during hold', stop: ['forbid'], how: 'no return to NOMINAL while the fault is active' },
      { label: 'Toolbox missing', stop: ['risk'], how: 'the register’s stored fallback gain' },
      { label: 'Irreproducible results', stop: ['risk'], how: 'the register’s fixed seed and CSV outputs' }
    ];
    const toggles = {};
    SLICES.forEach(function (s) {
      const t = ui.toggle({ id: 'w131-' + s.id, label: s.label, checked: true });
      toggles[s.id] = t;
      w.controls.appendChild(t.el);
    });
    const allOn = ui.button({ label: 'All slices on', kind: 'ghost', icon: 'reset', small: true });
    w.controls.appendChild(el('div', { class: 'btn-row' }, allOn));
    const summary = el('p', { class: 'status-line m13-sum', 'aria-live': 'polite' });
    w.out.appendChild(summary);
    const box = el('div', { class: 'scroll-x m13-swiss-wrap', tabindex: '0', role: 'region', 'aria-label': 'Swiss-cheese diagram' });
    w.out.appendChild(box);
    const tbl = el('div');
    w.out.appendChild(tbl);
    function on(id) { return toggles[id].value; }
    let compact = false;
    function update() {
      // wide: hazard names in a column on the left; narrow (phone): names sit above their arrows,
      // so the six slices get the whole width and the diagram needs no sideways scrolling
      compact = (box.clientWidth || 700) < 560;
      const L = compact ? 24 : 190, SW = compact ? 26 : 34, GAP = compact ? 47 : 62, top = compact ? 60 : 46, RH = compact ? 50 : 44;
      const W = compact ? L + SLICES.length * GAP + 20 : L + SLICES.length * GAP + 120, H = top + HAZ.length * RH + 10;
      const rowY = function (j) { return compact ? top + j * RH + RH / 2 + 4 : top + j * RH + RH / 2 - 6; };
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'm13-swiss' + (compact ? ' is-compact' : ''), role: 'img' });
      SLICES.forEach(function (sl, i) {
        const x = L + i * GAP;
        const g = svg('g', { class: 'm13-slice' + (on(sl.id) ? '' : ' off') });
        g.appendChild(svg('rect', { x: x, y: top - 8, width: SW, height: HAZ.length * RH + 4, rx: 8 }));
        HAZ.forEach(function (h, j) {
          if (h.stop.indexOf(sl.id) < 0) g.appendChild(svg('ellipse', { cx: x + SW / 2, cy: rowY(j), rx: compact ? 8 : 10, ry: compact ? 10 : 12, class: 'm13-hole' }));
        });
        s.appendChild(g);
        s.appendChild(svg('text', { x: x + SW / 2, y: 18, class: 'm13-slice-lab' }, String(i + 1)));
        s.appendChild(svg('text', { x: x + SW / 2, y: compact ? (i % 2 ? 44 : 32) : 32, class: 'm13-slice-sub' }, sl.short));
      });
      const results = HAZ.map(function (h, j) {
        const y = rowY(j);
        let stopAt = -1;
        for (let i = 0; i < SLICES.length; i++) if (on(SLICES[i].id) && h.stop.indexOf(SLICES[i].id) >= 0) { stopAt = i; break; }
        const xEnd = stopAt >= 0 ? L + stopAt * GAP - 4 : W - 10;
        s.appendChild(svg('text', compact ? { x: 4, y: y - 13, class: 'm13-haz' } : { x: 6, y: y + 4, class: 'm13-haz' }, h.label));
        s.appendChild(svg('path', { d: 'M' + (compact ? 4 : L - 26) + ' ' + y + ' H ' + xEnd, class: 'm13-arrow ' + (stopAt >= 0 ? 'stopped' : 'through'), 'marker-end': stopAt >= 0 ? 'url(#m13-stop)' : 'url(#m13-head)' }));
        if (stopAt < 0) s.appendChild(svg('text', { x: W - 6, y: y - (compact ? 13 : 9), class: 'm13-through-lab' }, 'gets through'));
        return stopAt;
      });
      s.insertBefore(svg('defs', null,
        svg('marker', { id: 'm13-head', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' }, svg('path', { d: 'M0 0L10 5L0 10z', class: 'm13-head-through' })),
        svg('marker', { id: 'm13-stop', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' }, svg('rect', { x: 6, y: 0, width: 4, height: 10, class: 'm13-head-stop' }))), s.firstChild);
      const nThrough = results.filter(function (r) { return r < 0; }).length;
      s.setAttribute('aria-label', 'Swiss-cheese stack: ' + (nThrough ? nThrough + ' hazard' + (nThrough > 1 ? 's get' : ' gets') + ' through all enabled slices' : 'every hazard is stopped') + '.');
      box.textContent = '';
      box.appendChild(s);
      summary.textContent = nThrough ? nThrough + ' of ' + HAZ.length + ' hazards get through every enabled slice: ' + HAZ.filter(function (h, j) { return results[j] < 0; }).map(function (h) { return h.label.toLowerCase(); }).join(', ') + '.' : 'All ' + HAZ.length + ' hazards are stopped by at least one enabled slice.';
      tbl.textContent = '';
      // the result comes second so it stays in view when a phone scrolls the table sideways
      tbl.appendChild(ui.table([{ key: 'h', label: 'Hazard' }, { key: 'r', label: 'Result' }, { key: 's', label: 'Slices that stop it' }, { key: 'n', label: 'Enabled', num: true }],
        HAZ.map(function (h, j) {
          const enabled = h.stop.filter(on).length;
          return [h.label, results[j] >= 0 ? ui.badge('pass', 'stopped at slice ' + (results[j] + 1)) : ui.badge('fail', 'gets through'),
            h.stop.map(function (id) { return SLICES.findIndex(function (s2) { return s2.id === id; }) + 1; }).join(', ') + ': ' + h.how, String(enabled) + ' of ' + h.stop.length];
        }), { caption: 'Which slices stop which hazard', rowHeaders: true, compact: true }));
    }
    Object.keys(toggles).forEach(function (k) { toggles[k].on('change', update); });
    allOn.addEventListener('click', function () { Object.keys(toggles).forEach(function (k) { toggles[k].set(true); }); update(); });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { if (((box.clientWidth || 700) < 560) !== compact) update(); }).observe(box);
    }
  }

  /* ================================================================ W13.2 automation level */

  function buildAutomation() {
    const w = parts('w-automation');
    const LEVELS = [
      null,
      { name: 'Level 1: the ground commands every transition', who: 'ground, for every mode change', gated: 'all', risk: 'Low', safety: 'High' },
      { name: 'Level 2: the ground approves the return to NOMINAL', who: 'ground approves each return', gated: 'returns', risk: 'Low', safety: 'Low' },
      { name: 'Level 3: autonomous, with a ground veto window', who: 'on board, unless the ground vetoes', gated: 'veto', risk: 'Medium', safety: 'Low' },
      { name: 'Level 4: fully autonomous (the project)', who: 'on board, by the guards alone', gated: 'none', risk: 'Medium', safety: 'Low' }
    ];
    const lvl = ui.slider({ id: 'w132-level', label: 'Automation level', min: 1, max: 4, step: 1, value: 4, help: '1 = the ground commands everything; 4 = fully autonomous, as in the project.' });
    const orbit = ui.slider({ id: 'w132-orbit', label: 'Orbit period', min: 60, max: 200, step: 1, value: 95, unit: 'min', tag: 'illustrative' });
    const contact = ui.slider({ id: 'w132-contact', label: 'Contact per orbit', min: 2, max: 30, step: 1, value: 10, unit: 'min', tag: 'illustrative' });
    const veto = ui.slider({ id: 'w132-veto', label: 'Veto window (level 3)', min: 5, max: 60, step: 1, value: 15, unit: 'min', tag: 'illustrative' });
    [lvl, orbit, contact, veto].forEach(function (c) { w.controls.appendChild(c.el); });
    const levelName = el('p', { class: 'm13-level', 'aria-live': 'polite' });
    w.out.appendChild(levelName);
    const set = readouts(w.out, ['Who decides the return', 'Mode changes in T03', 'Time in SAFE_HOLD (autonomous)', 'Wait per gated change outside a contact', 'Extra waiting over T03', 'Risk of an inappropriate return', 'Risk while waiting for the ground']);
    const tlBox = el('div'), barBox = el('div');
    w.out.appendChild(tlBox); w.out.appendChild(barBox);
    const r = T03();
    const segs = A.modes.runLengths(r.mode, r.t);
    A.plot.timeline(tlBox, { title: 'T03 modes as the guards would run them (autonomous)', segments: segs, faults: windows(r.fault, r.t), events: r.events.map(function (e) { return e.t; }), axis: true, margin: { left: 52 } });
    const bars = A.plot.bars(barBox, { title: 'Extra waiting over the T03 episode, by level', xLabel: 'minutes', unit: 'min', items: [] });
    const note = el('p', { class: 'status-line' });
    w.out.appendChild(note);
    const ev = r.events;
    const nRet = ev.filter(function (e) { return e.to === 0; }).length;
    const nEntry = ev.filter(function (e) { return e.from === 0; }).length;
    const shTime = segs.filter(function (s) { return s.mode === 2; }).reduce(function (a, s) { return a + (s.t1 - s.t0); }, 0);
    function extraFor(L, P, c, V) {
      const g = Math.max(0, P - c);
      const eWait = (g / P) * (g / 2);
      if (L === 1) return eWait * ev.length;
      if (L === 2) return eWait * nRet;
      if (L === 3) return V * nRet;
      return 0;
    }
    function update() {
      const P = orbit.value, c = Math.min(contact.value, P - 1), V = veto.value, L = lvl.value;
      const g = P - c;
      const info = LEVELS[L];
      levelName.textContent = info.name + '.';
      const ex = extraFor(L, P, c, V);
      const vetoChance = Math.min(1, (c + V) / P);
      const avg = (g / P) * (g / 2);
      // what one gated change waits, and how the episode total is built from it
      const perWait = L === 1 ? f(g / 2, { sig: 3, unit: 'min' }) + ' per change'
        : L === 2 ? f(g / 2, { sig: 3, unit: 'min' }) + ' per return'
          : L === 3 ? f(V, { sig: 3, unit: 'min' }) + ' per return (the veto window)' : 'none';
      const exText = L === 1 ? f(ex, { sig: 3, unit: 'min' }) + ' (' + ev.length + ' changes × ' + f(avg, { sig: 4, unit: 'min' }) + ', orbit-averaged)'
        : L === 2 ? f(ex, { sig: 3, unit: 'min' }) + ' (' + nRet + ' returns × ' + f(avg, { sig: 4, unit: 'min' }) + ', orbit-averaged)'
          : L === 3 ? f(ex, { sig: 3, unit: 'min' }) + ' (' + nRet + ' returns × ' + f(V, { sig: 3, unit: 'min' }) + ')' : 'none';
      set([info.who, ev.length + ' (' + nEntry + ' entries, ' + nRet + ' returns)', f(shTime, { fixed: 1, unit: 's' }), perWait, exText,
        riskBadge(info.risk), L === 4 ? 'no waiting' : riskBadge(L === 1 ? 'High' : 'Low')]);
      bars.set({ items: [1, 2, 3, 4].map(function (k) { const v = extraFor(k, P, c, V); return { label: 'Level ' + k, value: v, text: v ? f(v, { sig: 3 }) + ' min' : '0', color: k === L ? '--accent' : '--border-strong' }; }) });
      let msg;
      if (L === 1) msg = 'Every one of the ' + ev.length + ' transitions waits for a contact, about ' + f(g / 2, { sig: 3 }) + ' min if it falls outside one. That includes the two entries: the craft keeps spinning, or keeps running in the faulty mode, until someone can command SAFE_DETUMBLE. Entry must never wait.';
      else if (L === 2) msg = 'Each of the ' + nRet + ' returns waits for the next contact: on average ' + f(g / 2, { sig: 3 }) + ' min (half the ' + f(g, { sig: 3 }) + ' min gap) when the guards are met outside a contact, ' + f(avg, { sig: 3 }) + ' min averaged over the orbit (inside a contact there is no wait). A person checks each return.';
      else if (L === 3) msg = 'Each return is announced and happens after ' + V + ' min unless the ground vetoes it. A veto is only possible if a contact falls inside the window: about ' + pct(vetoChance, 0) + ' of the time here.';
      else msg = 'The project’s choice: the return happens the moment the four guards are met (fault clear, |ω| < ' + SM.returnRateDeg + ' deg/s, error < ' + SM.returnErrDeg + '°, ' + SM.dwell + ' s dwell). No waiting, and no second opinion: the guards are the only protection against an inappropriate return.';
      note.textContent = msg;
    }
    [lvl, orbit, contact, veto].forEach(function (cc) { cc.on('change', update); });
    update();
  }

  /* ================================================================ W13.3 commanding across the gap */

  function linkModel(o) {
    const L = o.frameBytes * 8;
    const Tf = L / o.rate;
    const a2 = o.rtt / Tf;                 // 2a in Stallings' notation
    const N = 1 + a2;                      // frames needed to fill the pipe
    const p = o.loss, Wn = o.window;
    const uSW = (1 - p) * Tf / (Tf + o.rtt);
    const uGBN = Wn >= N ? (1 - p) / (1 + a2 * p) : Wn * (1 - p) / (N * (1 - p + Wn * p));
    const uSR = Wn >= N ? 1 - p : Wn * (1 - p) / N;
    const K = Math.min(Wn, N);
    const nGBN = (1 - p + K * p) / (1 - p), nSR = 1 / (1 - p);
    return { Tf: Tf, N: N, bdpBytes: o.rate * o.rtt / 8, uSW: uSW, uGBN: uGBN, uSR: uSR, wGBN: 1 - 1 / nGBN, wSR: 1 - 1 / nSR, wSW: 1 - 1 / nSR };
  }

  function buildGap() {
    const w = parts('w-gap');
    const RTT = { leo: 0.02, geo: 0.6, moon: 2.6 };
    const dist = ui.segmented({ id: 'w133-dist', label: 'Where is the spacecraft?', value: 'leo', options: [{ value: 'leo', label: 'LEO (RTT 20 ms)' }, { value: 'geo', label: 'GEO (600 ms)' }, { value: 'moon', label: 'Lunar (2.6 s)' }] });
    const rate = ui.slider({ id: 'w133-rate', label: 'Link rate', min: 1000, max: 1e8, log: true, value: 1e6, unit: 'b/s', tag: 'illustrative' });
    const loss = ui.slider({ id: 'w133-loss', label: 'Frame loss rate', min: 0, max: 10, step: 0.1, value: 1, unit: '%', tag: 'illustrative' });
    const win = ui.slider({ id: 'w133-win', label: 'Window size (frames)', min: 1, max: 4096, log: true, value: 1, sig: 4 });
    [dist, rate, loss, win].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['Bandwidth-delay product', 'Frames to fill the pipe', 'Frame time T_f', 'Stop-and-wait', 'Go-Back-N', 'Selective repeat']);
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid);
    const pU = A.plot.bars(b1, { title: 'Link utilisation', xLabel: 'useful share of the link (%)', unit: '%', items: [], refLines: [{ v: 100, label: 'full link', color: '--border-strong' }] });
    const pW = A.plot.bars(b2, { title: 'Wasted transmissions', xLabel: 'frames sent in vain (%)', unit: '%', items: [] });
    const note = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(note);
    function bytes(b) { return b >= 1e6 ? f(b / 1e6, { sig: 3, unit: 'MB' }) : b >= 1e3 ? f(b / 1e3, { sig: 3, unit: 'kB' }) : f(b, { sig: 3, unit: 'B' }); }
    function update() {
      const Wn = Math.max(1, Math.round(win.value));
      const m = linkModel({ frameBytes: 1024, rate: rate.value, rtt: RTT[dist.value], loss: loss.value / 100, window: Wn });
      set([bytes(m.bdpBytes), f(m.N, { sig: 3 }), f(m.Tf * 1000, { sig: 3, unit: 'ms' }), pct(m.uSW), pct(m.uGBN), pct(m.uSR)]);
      pU.set({ items: [{ label: 'Stop-and-wait', value: 100 * m.uSW, text: pct(m.uSW), color: '--warn' }, { label: 'Go-Back-N', value: 100 * m.uGBN, text: pct(m.uGBN), color: '--axis-z' }, { label: 'Selective repeat', value: 100 * m.uSR, text: pct(m.uSR), color: '--ok' }] });
      pW.set({ items: [{ label: 'Stop-and-wait', value: 100 * m.wSW, text: pct(m.wSW), color: '--warn' }, { label: 'Go-Back-N', value: 100 * m.wGBN, text: pct(m.wGBN), color: '--axis-z' }, { label: 'Selective repeat', value: 100 * m.wSR, text: pct(m.wSR), color: '--ok' }] });
      const upload = 1e6 * 8 / (Math.max(1e-9, m.uSR) * rate.value) + RTT[dist.value];
      note.textContent = (Wn < m.N ? 'The window (' + Wn + ') is smaller than the pipe (' + f(m.N, { sig: 3 }) + ' frames), so even a perfect link idles while waiting for acknowledgements. ' : 'The window covers the pipe, so a loss-free link would be full. ') +
        'With selective repeat a 1 MB software patch takes about ' + f(upload, { sig: 3, unit: 's' }) + ' to upload.';
    }
    [dist, rate, loss, win].forEach(function (c) { c.on('change', update); });
    update();
  }

  /* ================================================================ W13.4 reboot into the right mode */

  function buildReboot() {
    const w = parts('w-reboot');
    const tr = ui.slider({ id: 'w134-t', label: 'Reset time', min: 0.5, max: 100, step: 0.5, value: 2, unit: 's' });
    const wal = ui.toggle({ id: 'w134-wal', label: 'Write-ahead mode log', checked: false, tag: 'extension', help: 'On: the mode, its timers and the integral are logged before each step and restored on boot. Off: the computer always boots into NOMINAL with zeroed timers.' });
    w.controls.appendChild(tr.el); w.controls.appendChild(wal.el);
    const verdict = el('div', { class: 'm13-verdict', 'aria-live': 'polite' });
    w.out.appendChild(verdict);
    const set = readouts(w.out, ['Mode at the reset', 'Boots into', 'Trace check', 'Largest rate difference from the uninterrupted run']);
    const M = { left: 52 };
    const tlBox = el('div'), plBox = el('div');
    w.out.appendChild(tlBox); w.out.appendChild(plBox);
    const tl = A.plot.timeline(tlBox, { title: 'Joined mode log (reset marked as an event tick)', segments: [], margin: M, axis: true, x: { min: 0, max: 120 } });
    const pl = A.plot.line(plBox, { height: 170, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M, x: { min: 0, max: 120 },
      series: [{ id: 'orig', label: 'uninterrupted', color: '--border-strong', width: 1.5, dash: [5, 4], unit: 'deg/s' }, { id: 'join', label: 'with the reset', color: '--accent', width: 2, unit: 'deg/s' }],
      hlines: [{ y: SM.enterRateDeg, label: SM.enterRateDeg + ' deg/s', color: '--line-thr' }] });
    const evBox = el('div');
    w.out.appendChild(evBox);
    const r1 = T03();
    pl.set('orig', r1.t, r1.rateDeg);
    const base = A.presets.get('T03');
    function run() {
      return guarded(w.out, function () {
        const tReset = tr.value;
        // q, ω and the integral are logged after step k; the mode and its counters as they stood
        // entering it (sample k − 1). Restoring that pair reproduces the uninterrupted run exactly.
        const k = Math.round(tReset / r1.dt), j = k - 1;
        const q = [0, 1, 2, 3].map(function (i) { return r1.q[4 * k + i]; });
        const wd = [0, 1, 2].map(function (i) { return r1.w[3 * k + i] * R2D; });
        const persisted = { mode: r1.mode[j], counters: { fault: r1.counters.fault[j], below: r1.counters.below[j], dwell: r1.counters.dwell[j] }, integral: [0, 1, 2].map(function (i) { return r1.integ[3 * k + i]; }) };
        const fresh = { mode: A.modes.N, counters: { fault: 0, below: 0, dwell: 0 }, integral: [0, 0, 0] };
        const r2 = A.sim.run(A.params.merge(base, { q0: q, w0Deg: wd, duration: base.duration - tReset,
          fault: { enabled: true, start: base.fault.start - tReset, end: base.fault.end - tReset }, initial: wal.value ? persisted : fresh }));
        const n = k + r2.n;
        const modes = new Uint8Array(n), faults = new Uint8Array(n), t = new Float64Array(n), rate = new Float64Array(n);
        for (let i = 0; i < k; i++) { modes[i] = r1.mode[i]; faults[i] = r1.fault[i]; t[i] = r1.t[i]; rate[i] = r1.rateDeg[i]; }
        for (let i = 0; i < r2.n; i++) { modes[k + i] = r2.mode[i]; faults[k + i] = r2.fault[i]; t[k + i] = r2.t[i] + tReset; rate[k + i] = r2.rateDeg[i]; }
        let diff = 0;
        for (let i = k; i < n && i < r1.n; i++) diff = Math.max(diff, Math.abs(rate[i] - r1.rateDeg[i]));
        const check = A.modes.checkTrace(modes, faults);
        const evs = r1.events.filter(function (e) { return e.t < tReset - 1e-9; }).map(function (e) { return { t: e.t, from: e.from, to: e.to, reason: e.reason, part: 'before' }; })
          .concat(r2.events.map(function (e) { return { t: e.t + tReset, from: e.from, to: e.to, reason: e.reason, part: 'after' }; }));
        // a reset is itself a mode change when the boot mode differs from the mode it interrupted
        const bootMode = wal.value ? persisted.mode : A.modes.N;
        // guard bypass: a reset out of SAFE_HOLD into NOMINAL that the guards had not allowed
        const s = A.sim.sampleAt(r1, tReset);
        let bypass = null;
        if (persisted.mode === A.modes.SH && !wal.value && bootMode === A.modes.N) {
          const unmet = [];
          if (s.fault) unmet.push('fault active');
          if (s.rateDeg >= SM.returnRateDeg) unmet.push('|ω| = ' + f(s.rateDeg, { fixed: 2 }) + ' deg/s');
          if (s.errDeg >= SM.returnErrDeg) unmet.push('error = ' + f(s.errDeg, { fixed: 1, unit: '°' }));
          if (persisted.counters.dwell * r1.dt < SM.dwell) unmet.push('dwell only ' + f(persisted.counters.dwell * r1.dt, { fixed: 1, unit: 's' }));
          if (unmet.length) bypass = unmet;
        }
        return { tReset: tReset, k: k, modes: modes, faults: faults, t: t, rate: rate, check: check, events: evs, before: persisted.mode, boot: bootMode, diff: diff, bypass: bypass };
      });
    }
    function update() {
      const res = run();
      if (!res) return;
      tl.set({ segments: A.modes.runLengths(res.modes, res.t), faults: windows(res.faults, res.t), events: [res.tReset].concat(res.events.map(function (e) { return e.t; })) });
      pl.set('join', res.t, res.rate);
      pl.setLines({ vlines: [{ x: res.tReset, label: 'reset', color: '--bad', dash: [4, 3] }], hlines: [{ y: SM.enterRateDeg, label: SM.enterRateDeg + ' deg/s', color: '--line-thr' }] });
      const v = res.check.violations[0];
      set([NAMES[res.before], NAMES[res.boot], res.check.ok ? ui.badge('pass', 'no forbidden transition') : ui.badge('fail', res.check.violations.length + ' violation' + (res.check.violations.length > 1 ? 's' : '')),
        f(res.diff, { sig: 3, unit: 'deg/s' })]);
      verdict.textContent = '';
      if (!res.check.ok) {
        verdict.appendChild(ui.callout('warn', 'Forbidden transition through the back door', 'At t = ' + f(res.t[v.k], { fixed: 2, unit: 's' }) + ': ' + v.rule + '. The reset did it, not the guards.'));
      } else if (res.bypass) {
        verdict.appendChild(ui.callout('warn', 'Legal, but the guards were skipped', 'SAFE_HOLD → NOMINAL is allowed, but at the reset the return guards were not met (' + res.bypass.join(', ') + '). The reset returned to NOMINAL early.'));
      } else if (wal.value) {
        verdict.appendChild(ui.callout('info', 'The log restored the mode', 'The computer booted into ' + NAMES[res.boot] + ' with its timers and integral, and the joined run matches the uninterrupted one (largest rate difference ' + f(res.diff, { sig: 2, unit: 'deg/s' }) + ').'));
      } else {
        verdict.appendChild(ui.callout('info', 'No harm this time', 'The reset happened in NOMINAL, so booting into NOMINAL changed no mode and the trace checker sees nothing. The lost state is still visible: the zeroed integrator shifts the rate by up to ' + f(res.diff, { sig: 2, unit: 'deg/s' }) + '.'));
      }
      evBox.textContent = '';
      const rows = [{ t: res.tReset, order: 0, cells: [f(res.tReset, { fixed: 2 }), el('strong', null, 'reset: ' + NAMES[res.before] + ' → boots ' + NAMES[res.boot]), wal.value ? 'restored from the write-ahead log' : 'default boot mode'] }]
        .concat(res.events.map(function (e) { return { t: e.t, order: 1, cells: [f(e.t, { fixed: 2 }), NAMES[e.from] + ' → ' + NAMES[e.to], A.modes.reasonText(e.reason, SM)] }; }))
        .sort(function (a, b) { return a.t - b.t || a.order - b.order; });
      evBox.appendChild(ui.table([{ key: 't', label: 't (s)', num: true }, { key: 'c', label: 'Change' }, { key: 'w', label: 'Why' }],
        rows.map(function (x) { return x.cells; }), { caption: 'Mode changes in the joined run', compact: true }));
    }
    tr.on('change', ui.debounce(update, 120));
    wal.on('change', update);
    update();
  }

  /* ================================================================ W13.5 alarm fatigue (stretch) */

  function buildAlarms() {
    const w = parts('w-alarms');
    const base = ui.slider({ id: 'w135-b', label: 'Base rate: real faults per check', min: 1e-5, max: 0.1, log: true, value: 0.001, tag: 'illustrative' });
    const rec = ui.slider({ id: 'w135-r', label: 'Recall (detection rate)', min: 1, max: 100, step: 1, value: 80, unit: '%', tag: 'illustrative' });
    const far = ui.slider({ id: 'w135-f', label: 'False-alarm rate per check', min: 1e-5, max: 0.2, log: true, value: 0.005, tag: 'illustrative' });
    [base, rec, far].forEach(function (c) { w.controls.appendChild(c.el); });
    const set = readouts(w.out, ['Precision', 'Alarms per fault caught (1/precision)', 'Missed faults', 'Accuracy (misleading)']);
    const tbl = el('div');
    w.out.appendChild(tbl);
    const note = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(note);
    function update() {
      const b = base.value, r = rec.value / 100, fr = far.value;
      const N = 100000;
      const tp = N * b * r, fn = N * b * (1 - r), fp = N * (1 - b) * fr, tn = N * (1 - b) * (1 - fr);
      const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
      const acc = (tp + tn) / N;
      set([pct(prec, prec < 0.1 ? 1 : 0), prec > 0 ? f(1 / prec, { sig: 3 }) : '∞', pct(1 - r, 0) + ' of faults', pct(acc, 2)]);
      const n0 = function (x) { return f(x, { sig: 3 }); };
      tbl.textContent = '';
      const cell = function (v, what) { return el('span', { class: 'm13-cm' }, n0(v), el('span', { class: 'm13-cm-what' }, what)); };
      tbl.appendChild(ui.table([{ key: 'a', label: 'Detector' }, { key: 'f', label: 'Real fault', num: true }, { key: 'n', label: 'No fault', num: true }],
        [['Alarm', cell(tp, 'true alarms'), cell(fp, 'false alarms')], ['No alarm', cell(fn, 'missed'), cell(tn, 'quiet')]],
        { caption: 'Confusion matrix in natural frequencies, per 100,000 checks', rowHeaders: true, compact: true }));
      note.textContent = prec > 0
        ? 'An operator answering every alarm investigates ' + f(1 / prec, { sig: 3 }) + ' alarms for each real fault it catches' + (1 / prec >= 10 ? ': that is alarm fatigue. ' : '. ') + (acc >= 0.95 && b <= 0.01 ? 'Accuracy looks excellent (' + pct(acc, 2) + ') only because real faults are rare.' : 'Accuracy is ' + pct(acc, 2) + ', which says little about how useful the alarms are.')
        : 'With zero recall the detector never finds a fault.';
    }
    [base, rec, far].forEach(function (c) { c.on('change', update); });
    update();
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
    ui.mountChrome({ page: 'm13' });
    buildSwiss();
    buildAutomation();
    buildGap();
    buildReboot();
    buildAlarms();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'A reset during SAFE_DETUMBLE boots into NOMINAL. What has happened, logically?',
        options: ['Nothing; resets are allowed.', 'A liveness failure.', 'A forbidden SAFE_DETUMBLE → NOMINAL transition through the back door.'], correct: 2,
        explain: 'The mode log now shows SAFE_DETUMBLE followed by NOMINAL, which the safe-mode specification forbids: detumbling must pass through SAFE_HOLD. The guards never approved it; the reset did. A write-ahead mode log closes the back door.' },
      { q: 'In the Swiss-cheese model, an accident needs…',
        options: ['one bad layer.', 'holes in several independent layers to line up.', 'operator error.'], correct: 1,
        explain: 'Each layer has holes, but a hazard only gets through when the holes in every layer line up at once. That is why independent layers multiply their protection, and why a hazard stopped by only one layer is fragile.' },
      { q: 'Making the return to NOMINAL wait for a ground command mainly trades…',
        options: ['recovery time against the risk of an inappropriate return.', 'torque against rate.', 'accuracy against stability.'], correct: 0,
        explain: 'Waiting for a contact adds, on average, half the gap between contacts to each return (about 42 min in the widget) but lets a person refuse a return that the guards would have allowed for the wrong reason.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm13');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    recheckScrollable();
  });
})();
