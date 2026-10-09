/**
 * landing.js: the "Big picture" page (index.html).
 *
 * - Hero: a wireframe replay of one engine run of preset HIGHRATE at 4× speed (a static frame
 *   under reduced motion), with a mode timeline and a pause button.
 * - Loop diagram (#loop): an inline SVG generated from ADCS.data.loopBlocks and loopEdges, a
 *   side panel (bottom sheet below 1100px, so the diagram keeps the full width) listing the subjects that feed the selected block, and
 *   a vertical list view below 640px. Both views share one set of handlers.
 * - Discipline lens (#lens): "strongest" parts by the atlas's weighted score, what a single selected
 *   discipline brings, and links into the atlas. Then the project in numbers (#numbers) and the
 *   entry-card counts.
 *
 * Everything is read from ADCS.data, ADCS.params, ADCS.presets and ADCS.tests; nothing about
 * courses, thresholds or gains is hard-coded here.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const D = A.data;
  const el = ui.el;
  const sv = ui.svg;

  /* Loop order: keyboard arrows, the list view and the panel's previous/next all use it. */
  const ORDER = ['req', 'arch', 'modes', 'ref', 'err', 'ctrl', 'act', 'env', 'dyn', 'int', 'sens', 'est', 'ver', 'sw', 'viz', 'pm', 'ops'];
  const ROLE = {
    req: 'Defines the loop', arch: 'Defines the loop',
    modes: 'In the loop', ref: 'In the loop', err: 'In the loop', ctrl: 'In the loop', act: 'In the loop',
    env: 'In the loop', dyn: 'In the loop', int: 'In the loop', sens: 'In the loop, extension', est: 'In the loop, extension',
    ver: 'Around the loop', sw: 'Around the loop', viz: 'Around the loop', pm: 'Around the loop', ops: 'Around the loop'
  };
  /* Coordinate nudges allowed by the plan (at most 20 units per coordinate, topology unchanged), so that
     every label and subtitle fits at a legible size:
     - the integrator drops 14 units to leave room for the "true state" bypass under the dynamics block,
       and grows 18 units to take its subtitle under the label;
     - system architecture (+18 high), the mode manager (20 left, +20 wide), reference attitude (10 up,
       +20 high, still centred on the error junction), environment (10 up, +20 wide, +12 high, still clear
       of the |ω| arrow above it), dynamics and the integrator (+20 wide, so the three stay centred on one
       vertical) and the estimator (20 left, +20 wide, so it clears the measurement label) grow to fit their subtitles;
     - the two short lifecycle blocks grow to fit their labels on two lines. */
  const NUDGE = {
    arch: { h: 64 },
    modes: { x: 310, w: 360 },
    ref: { y: 226, h: 84 },
    env: { y: 140, w: 190, h: 62 },
    dyn: { w: 210 },
    int: { y: 336, w: 210, h: 60 },
    est: { x: 380, w: 190 },
    pm: { x: 750, y: 520, w: 240, h: 48 },
    ops: { x: 750, w: 240, h: 48 }
  };
  const VIEW_W = 1000, VIEW_H = 640;
  const RICH_RE = /(^|[^A-Za-z])([A-Za-zτωθ])_(\{[^}]*\}|[a-z]+)/g;

  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function listText(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function onMedia(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
  }
  function courseDiscipline(id) { const c = D.course(id); return c ? c.discipline : null; }

  /* ================================================================ parameters in prose */

  function fillParams() {
    const P = A.params, def = P.DEFAULTS, sm = def.safeMode;
    const values = {
      dt: String(def.dt),
      enterRate: String(sm.enterRateDeg),
      faultPersist: String(sm.faultPersist),
      tauMax: String(Math.round(def.tauMax * 1e6) / 1e3)
    };
    ui.qsa('[data-param]').forEach(function (s) {
      const v = values[s.getAttribute('data-param')];
      if (v !== undefined) s.textContent = v;
    });
  }

  function fillCounts() {
    const st = D.stats();
    const minutes = D.modules.reduce(function (a, m) { return a + (m.minutes || 0); }, 0);
    const values = {
      modules: String(st.modules), courses: String(st.courses), disciplines: String(st.disciplines),
      links: String(st.links), terms: String(D.glossary.length), hours: ui.fmtTime(minutes * 60)
    };
    ui.qsa('[data-count]').forEach(function (s) {
      const v = values[s.getAttribute('data-count')];
      if (v !== undefined) s.textContent = v;
    });
  }

  /* ================================================================ the project in numbers */

  function buildNumbers() {
    const P = A.params, def = P.DEFAULTS, sm = def.safeMode;
    const grid = $('numbers-grid');
    const torque = Math.round(def.tauMax * 1e6) / 1e3;
    [
      { value: 'diag(' + def.J.map(function (v) { return v.toFixed(3); }).join(', ') + ')', label: 'inertia J in kg m², about the principal axes' },
      { value: '±' + torque + ' mN m', label: 'reaction-wheel torque limit on each axis' },
      { value: sm.enterRateDeg + ' deg/s', label: 'rate norm that sends NOMINAL into safe mode' },
      { value: '< ' + sm.exitRateDeg + ' deg/s for ' + sm.exitHold + ' s', label: 'detumble exit: the rate must stay below the threshold' },
      {
        value: '< ' + sm.returnErrDeg + '° after ≥ ' + sm.dwell + ' s',
        label: 'return to NOMINAL: pointing error after a dwell in SAFE_HOLD, with |ω| < ' + sm.returnRateDeg + ' deg/s and the fault clear'
      },
      { value: A.mc.DEFAULTS.n + ' trials', label: 'Monte Carlo campaign that checks REQ-L1' },
      { value: P.REQ.length + ' + ' + A.tests.matrix.length, label: 'requirements and tests, each requirement traced to a test' }
    ].forEach(function (s) { grid.appendChild(ui.stat({ value: s.value, label: s.label, tag: 'project' })); });
  }

  /* ================================================================ hero animation */

  function buildHero() {
    const fig = $('hero-anim');
    const canvas = $('hero-wire');
    let run;
    try {
      const cfg = A.presets.get('HIGHRATE');
      cfg.duration = 32;
      run = A.sim.run(cfg);
    } catch (err) {
      if (err instanceof RangeError) { ui.showError(fig, err); return; }
      throw err;
    }
    const T = run.t[run.n - 1];
    const SPEED = 4;
    const reduced = ui.prefersReducedMotion();
    const wire = A.wire.create(canvas, {
      aspect: 0.8, maxHeight: 400, trail: 420, autoLabel: false,
      ariaLabel: 'Wireframe of the spacecraft replaying the high-rate detumble; the dashed outline is the target attitude. ' +
        'Drag or use the arrow keys to turn the camera.'
    });
    wire.setGhost(run.config.qRef);

    // mode timeline under the canvas
    const bar = $('hero-timeline');
    const segs = A.modes.runLengths(run.mode, run.t);
    const cls = ['n', 'sd', 'sh'];
    segs.forEach(function (s) {
      const share = (s.t1 - s.t0) / T;
      bar.appendChild(el('span', { class: 'hero-seg ' + cls[s.mode], style: { flexGrow: String(share) } },
        share > 0.06 ? A.modes.SHORT[s.mode] : ''));
    });
    const cursor = el('span', { class: 'hero-cursor' });
    bar.appendChild(cursor);

    // facts from the run, for every reader
    const ev = run.events;
    const facts = el('p', { class: 'hero-facts' },
      'Starts at ' + ui.fmt(run.rateDeg[0], { fixed: 2, unit: 'deg/s' }) + '. ' +
      ev.map(function (e) { return A.modes.NAMES[e.to] + ' from ' + ui.fmt(e.t, { fixed: 2, unit: 's' }); }).join(', ') + '. ',
      ui.tag('derived'));
    $('hero-anim-caption').appendChild(facts);

    const tEl = $('hero-time'), modeEl = $('hero-mode'), rateEl = $('hero-rate');
    let shownMode = -1;
    function show(t) {
      const s = A.sim.sampleAt(run, t);
      wire.setQuat(s.q);
      wire.setArrows([
        { v: s.w.map(function (x) { return x * 1.2; }), frame: 'body', color: '--accent', label: 'ω' },
        { v: s.tau.map(function (x) { return x * 50; }), frame: 'body', color: '--warn', label: 'τ' }
      ]);
      wire.render();
      tEl.textContent = 't = ' + ui.fmt(s.t, { fixed: 1, unit: 's' });
      rateEl.textContent = '|ω| ' + ui.fmt(s.rateDeg, { fixed: 1, unit: 'deg/s' });
      if (s.mode !== shownMode) {
        shownMode = s.mode;
        modeEl.textContent = '';
        modeEl.appendChild(ui.modePill(s.mode));
      }
      cursor.style.left = (100 * Math.min(1, t / T)) + '%';
    }

    let t = 0, playing = !reduced, raf = 0, last = 0, visible = true;
    function frame(ts) {
      raf = 0;
      if (!playing || !visible) return;
      if (last) t += Math.min(0.1, (ts - last) / 1000) * SPEED;
      last = ts;
      if (t > T) { t = 0; wire.clearTrail(); }
      show(t);
      raf = window.requestAnimationFrame(frame);
    }
    function start() { if (!raf && playing && visible) { last = 0; raf = window.requestAnimationFrame(frame); } }
    function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

    // static frame (reduced motion, or before the first play): mid-detumble with its trail so far
    function staticFrame(tq) {
      wire.clearTrail();
      for (let k = 0; k <= 60; k++) wire.setQuat(A.sim.sampleAt(run, tq * k / 60).q);
      t = tq;
      show(tq);
    }

    const label = el('span', { class: 'btn-label' });
    const iconSlot = el('span', { class: 'hero-btn-icon', 'aria-hidden': 'true' });
    const toggle = el('button', { type: 'button', class: 'btn secondary sm', 'aria-controls': 'hero-wire' }, iconSlot, label);
    function paintToggle() {
      iconSlot.textContent = '';
      iconSlot.appendChild(ui.icon(playing ? 'pause' : 'play'));
      label.textContent = playing ? 'Pause replay' : 'Play replay';
    }
    toggle.addEventListener('click', function () {
      playing = !playing;
      paintToggle();
      if (playing) start(); else stop();
    });
    paintToggle();
    $('hero-toggle-slot').appendChild(toggle);
    $('hero-sim-slot').appendChild(ui.simLink('Open HIGHRATE in the simulator', 'preset=HIGHRATE'));

    if (typeof window.IntersectionObserver === 'function') {
      new window.IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) start(); else stop();
      }).observe(fig);
    }
    if (reduced) staticFrame(3);
    else { show(0); start(); }
  }

  /* ================================================================ loop diagram */

  function geometry() {
    const G = {};
    D.loopBlocks.forEach(function (b) {
      const n = Object.assign({}, b, NUDGE[b.id] || {});
      if (n.shape === 'circle') G[b.id] = { circle: true, cx: n.cx, cy: n.cy, r: n.r, x: n.cx - n.r, y: n.cy - n.r, w: 2 * n.r, h: 2 * n.r };
      else G[b.id] = { x: n.x, y: n.y, w: n.w, h: n.h, cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
    });
    return G;
  }

  /** Hand-routed orthogonal paths for the plan's edges, computed from the block geometry. */
  function routes(G) {
    const err = G.err, ref = G.ref, ctrl = G.ctrl, act = G.act, dyn = G.dyn, env = G.env, integ = G.int;
    const sens = G.sens, est = G.est, modes = G.modes, req = G.req, ver = G.ver;
    const y = err.cy;
    const xR = dyn.x + dyn.w;
    function circleBottom(x) { return err.cy + Math.sqrt(Math.max(0, err.r * err.r - (x - err.cx) * (x - err.cx))); }
    const xFb = err.cx - 12, xBy = err.cx + 12;            // feedback enters bottom-left, bypass bottom-right
    const yBy = ctrl.y + ctrl.h + 12;                      // bypass runs just under the controller and wheels
    const xDown = dyn.x + 10;
    return {
      'ref-err': [[ref.x + ref.w, y], [err.cx - err.r, y]],
      'err-ctrl': [[err.cx + err.r, y], [ctrl.x, y]],
      'ctrl-act': [[ctrl.x + ctrl.w, y], [act.x, y]],
      'act-dyn': [[act.x + act.w, y], [dyn.x, y]],
      'env-dyn': [[env.cx, env.y + env.h], [env.cx, dyn.y]],
      'dyn-int': [[dyn.cx, dyn.y + dyn.h], [dyn.cx, integ.y]],
      'dyn-sens': [[xR, dyn.y + 66], [xR + 40, dyn.y + 66], [xR + 40, sens.cy], [sens.x + sens.w, sens.cy]],
      'sens-est': [[sens.x, sens.cy], [est.x + est.w, est.cy]],
      'est-err': [[est.x, est.cy], [xFb, est.cy], [xFb, circleBottom(xFb)]],
      'dyn-err': [[xDown, dyn.y + dyn.h], [xDown, yBy], [xBy, yBy], [xBy, circleBottom(xBy)]],
      'modes-ctrl': [[ctrl.x + 85, modes.y + modes.h], [ctrl.x + 85, ctrl.y]],
      'dyn-modes': [[xR, dyn.y + 18], [xR + 80, dyn.y + 18], [xR + 80, modes.cy], [modes.x + modes.w, modes.cy]],
      'req-ver': [[req.x, req.y + 34], [8, req.y + 34], [8, ver.cy], [ver.x, ver.cy]]
    };
  }

  /** Edge label positions (text may use x_sub notation). */
  function edgeLabels(G) {
    const err = G.err, ctrl = G.ctrl, act = G.act, dyn = G.dyn, env = G.env, integ = G.int, sens = G.sens, est = G.est, modes = G.modes;
    const y = err.cy;
    return {
      'err-ctrl': { x: (err.cx + err.r + ctrl.x) / 2, y: y - 8, lines: ['q_e'] },
      'ctrl-act': { x: (ctrl.x + ctrl.w + act.x) / 2, y: y - 8, lines: ['τ_cmd'] },
      'act-dyn': { x: (act.x + act.w + dyn.x) / 2, y: y - 8, lines: ['τ'] },
      'env-dyn': { x: env.cx + 8, y: (env.y + env.h + dyn.y) / 2 + 5, anchor: 'start', lines: ['τ_d'] },
      'dyn-int': { x: dyn.cx + 8, y: (dyn.y + dyn.h + integ.y) / 2 + 5, anchor: 'start', lines: ['propagates'] },
      'dyn-sens': { x: dyn.x + dyn.w + 48, y: (dyn.y + 66 + sens.cy) / 2, anchor: 'start', lines: ['q, ω'] },
      'sens-est': { x: (est.x + est.w + sens.x) / 2, y: sens.cy - 9, lines: ['ω_m, q_m'] },
      'est-err': { x: (err.cx + est.x) / 2 + 10, y: est.cy - 9, lines: ['q̂, ω̂'] },
      'dyn-err': { x: (act.x + act.w + ctrl.x + ctrl.w) / 2 + 20, y: ctrl.y + ctrl.h + 30, lines: ['true state q, ω', '(original project)'] },
      'modes-ctrl': { x: ctrl.x + 93, y: (modes.y + modes.h + ctrl.y) / 2 + 5, anchor: 'start', lines: ['selects law'] },
      'dyn-modes': { x: dyn.x + dyn.w - 40, y: modes.cy - 8, lines: ['|ω|, error'] }
    };
  }

  function roundedPath(pts, r) {
    let d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (i === pts.length - 1) { d += 'L' + p[0] + ' ' + p[1]; break; }
      const a = pts[i - 1], b = pts[i + 1];
      const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const p1 = [p[0] - (p[0] - a[0]) / l1 * rr, p[1] - (p[1] - a[1]) / l1 * rr];
      const p2 = [p[0] + (b[0] - p[0]) / l2 * rr, p[1] + (b[1] - p[1]) / l2 * rr];
      d += 'L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'Q' + p[0] + ' ' + p[1] + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  function roundedPolygon(pts, r) {
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
      const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const p1 = [p[0] - (p[0] - a[0]) / l1 * rr, p[1] - (p[1] - a[1]) / l1 * rr];
      const p2 = [p[0] + (b[0] - p[0]) / l2 * rr, p[1] + (b[1] - p[1]) / l2 * rr];
      d += (i ? 'L' : 'M') + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'Q' + p[0] + ' ' + p[1] + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + 'Z';
  }
  /** SVG elements have no hidden property; toggle the attribute (base.css hides [hidden]). */
  function setHidden(node, on) { if (on) node.setAttribute('hidden', ''); else node.removeAttribute('hidden'); }

  /** HTML nodes for text with x_sub notation (subscripts as <sub>). */
  function richNodes(s) {
    const out = [];
    let last = 0, m;
    RICH_RE.lastIndex = 0;
    while ((m = RICH_RE.exec(s))) {
      const baseEnd = m.index + m[1].length + 1;
      out.push(s.slice(last, baseEnd));
      out.push(el('sub', null, m[3].replace(/[{}]/g, '')));
      last = m.index + m[0].length;
    }
    out.push(s.slice(last));
    return out.filter(function (x) { return x !== ''; });
  }

  /* ---------------------------------------------------------------- text fitting */

  let measureCtx = null, fontFamily = 'system-ui, sans-serif';
  function plainText(s) { return s.replace(RICH_RE, function (m, pre, base, sub) { return pre + base + sub.replace(/[{}]/g, ''); }); }
  function textWidth(s, size, weight) {
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      fontFamily = window.getComputedStyle(document.body).fontFamily || fontFamily;
    }
    if (!measureCtx) return s.length * size * 0.56;
    measureCtx.font = (weight || 400) + ' ' + size + 'px ' + fontFamily;
    return measureCtx.measureText(plainText(s)).width;
  }
  function wrapText(text, maxW, size, weight) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    words.forEach(function (w) {
      const t = cur ? cur + ' ' + w : w;
      if (!cur || textWidth(t, size, weight) <= maxW) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.map(function (l) { return l.replace(/^·\s+/, '').replace(/\s+·$/, ''); });
  }
  function fits(lines, maxW, size, weight) { return lines.every(function (l) { return textWidth(l, size, weight) <= maxW + 0.5; }); }

  /* Block text metrics, in viewBox units: inner padding, line heights (× font size) and the label–subtitle gap. */
  const PAD_X = 9, PAD_Y = 6, LINE_L = 1.12, LINE_S = 1.18, SUB_GAP = 3;
  function stackHeight(lab, ls, sub, ss) { return lab.length * ls * LINE_L + (sub.length ? SUB_GAP + sub.length * ss * LINE_S : 0); }
  function sizeSteps(hi, lo) {
    const out = [];
    for (let v = hi; v >= lo - 1e-6; v -= 0.5) out.push(v);
    return out.length ? out : [hi];
  }
  /** Lines of `text` wrapped to maxW, or null when it needs more than maxLines lines or a word is too wide. */
  function wrapIn(text, maxW, size, weight, maxLines) {
    const lines = wrapText(text, maxW, size, weight);
    return lines.length <= maxLines && fits(lines, maxW, size, weight) ? lines : null;
  }
  /**
   * Font sizes for a block's label and subtitle (each at most two lines) inside maxW × maxH.
   * Candidates are stacked (label above subtitle) or, in wide and short blocks, inline (side by side).
   * The winner keeps both sizes closest to their targets: it maximises the smaller of ls/LS and ss/SS,
   * preferring the stacked form on a tie. The search first respects the legibility floor `lim`, then a
   * hard floor; a subtitle is never dropped, so the last resort draws it on one line at the hard floor.
   */
  function fitBlock(b, maxW, maxH, LS, SS, lim) {
    const floors = [[lim.ls, lim.ss], [10, 9]];
    for (let f = 0; f < floors.length; f++) {
      const found = searchFit(b, maxW, maxH, LS, SS, Math.min(LS, floors[f][0]), Math.min(SS, floors[f][1]));
      if (found) return found;
    }
    return { mode: 'stack', lab: wrapText(b.label, maxW, 10, 650), ls: 10, sub: b.sub ? [b.sub] : [], ss: 9, fallback: true };
  }
  function searchFit(b, maxW, maxH, LS, SS, lsMin, ssMin) {
    const lsSteps = sizeSteps(LS, lsMin);
    const labs = lsSteps.map(function (ls) { return wrapIn(b.label, maxW, ls, 650, 2); });
    if (!b.sub) {
      for (let i = 0; i < lsSteps.length; i++) {
        if (labs[i] && stackHeight(labs[i], lsSteps[i], [], 0) <= maxH + 0.5) return { mode: 'stack', lab: labs[i], ls: lsSteps[i], sub: [], ss: SS };
      }
      return null;
    }
    const ssSteps = sizeSteps(SS, ssMin);
    const subs = ssSteps.map(function (ss) { return wrapIn(b.sub, maxW, ss, 400, 2); });
    const subW = ssSteps.map(function (ss) { return textWidth(b.sub, ss, 400); });
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < lsSteps.length; i++) {
      const ls = lsSteps[i], lab = labs[i];
      if (!lab) continue;
      const wl = lab.length === 1 ? textWidth(lab[0], ls, 650) : 0;
      for (let j = 0; j < ssSteps.length; j++) {
        const ss = ssSteps[j];
        if (ss > ls) continue;
        const score = Math.min(ls / LS, ss / SS) + 0.01 * (ls / LS + ss / SS);
        if (score + 0.001 > bestScore && subs[j] && stackHeight(lab, ls, subs[j], ss) <= maxH + 0.5) {
          best = { mode: 'stack', lab: lab, ls: ls, sub: subs[j], ss: ss };
          bestScore = score + 0.001;
        } else if (score > bestScore && lab.length === 1 && Math.max(ls, ss) * LINE_L <= maxH + 0.5) {
          const gap = ls * 0.75;
          if (wl + gap + subW[j] <= maxW + 0.5) {
            best = { mode: 'inline', lab: lab, ls: ls, sub: [b.sub], ss: ss, wl: wl, ws: subW[j], gap: gap };
            bestScore = score;
          }
        }
      }
    }
    return best;
  }

  /** Append text with x_sub notation rendered as subscripts. */
  function richText(parent, s, size) {
    const segs = [];
    let last = 0, m;
    RICH_RE.lastIndex = 0;
    while ((m = RICH_RE.exec(s))) {
      const baseEnd = m.index + m[1].length + 1;
      segs.push({ t: s.slice(last, baseEnd) });
      segs.push({ t: m[3].replace(/[{}]/g, ''), sub: true });
      last = m.index + m[0].length;
    }
    segs.push({ t: s.slice(last) });
    let shifted = false;
    const shift = (size * 0.28).toFixed(2);
    segs.forEach(function (seg) {
      if (!seg.t) return;
      if (seg.sub) { parent.appendChild(sv('tspan', { dy: shift, 'font-size': (size * 0.72).toFixed(2) }, seg.t)); shifted = true; }
      else if (shifted) { parent.appendChild(sv('tspan', { dy: '-' + shift }, seg.t)); shifted = false; }
      else parent.appendChild(document.createTextNode(seg.t));
    });
  }

  /* ---------------------------------------------------------------- the diagram */

  function buildLoop() {
    const G = geometry();
    const blocks = {};
    D.loopBlocks.forEach(function (b) { blocks[b.id] = b; });
    const ids = ORDER.filter(function (id) { return blocks[id]; })
      .concat(D.loopBlocks.map(function (b) { return b.id; }).filter(function (id) { return ORDER.indexOf(id) < 0; }));
    const rows = {}, discCount = {};
    ids.forEach(function (id) {
      rows[id] = D.matchBlock(id);
      discCount[id] = D.byDiscipline(rows[id]).length;
    });
    const edgesByBlock = {};
    ids.forEach(function (id) { edgesByBlock[id] = []; });

    const state = { sel: null, lens: new Set(), scale: 1, lastFocus: null };
    const panel = $('loop-panel');
    const stage = $('loop-stage');
    const mqSheet = window.matchMedia('(max-width: 1099px)');
    const mqList = window.matchMedia('(max-width: 639px)');

    /* ---------- svg skeleton */
    const svgRoot = sv('svg', {
      class: 'loop-svg', viewBox: '0 0 ' + VIEW_W + ' ' + VIEW_H, role: 'group',
      'aria-label': 'Attitude-control loop of the project', 'aria-describedby': 'loop-svg-desc'
    });
    svgRoot.appendChild(sv('desc', { id: 'loop-svg-desc' },
      ids.length + ' blocks. Use Tab to reach a block, the arrow keys to move along the loop, Enter or Space to show its details, ' +
      'Tab again to move into the details and Escape to close them.'));
    const defs = sv('defs');
    ['sig', 'ext', 'sup', 'trace', 'hot'].forEach(function (k) {
      defs.appendChild(sv('marker', {
        id: 'loop-m-' + k, viewBox: '0 0 10 10', refX: 9.5, refY: 5, markerWidth: 10, markerHeight: 10,
        markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse'
      }, sv('path', { d: 'M0 1L10 5L0 9z', class: 'marker marker-' + k })));
    });
    svgRoot.appendChild(defs);
    const layerGroups = sv('g', { class: 'loop-groups', 'aria-hidden': 'true' });
    const layerEdges = sv('g', { class: 'loop-edges', 'aria-hidden': 'true' });
    const layerBlocks = sv('g', { class: 'loop-blocks' });
    const layerLabels = sv('g', { class: 'loop-edge-labels', 'aria-hidden': 'true' });
    svgRoot.appendChild(layerGroups);
    svgRoot.appendChild(layerEdges);
    svgRoot.appendChild(layerBlocks);
    svgRoot.appendChild(layerLabels);

    /* ---------- group outlines: flight-software bracket and verification bracket */
    const swEdge = D.loopEdges.find(function (e) { return e.kind === 'bracket' && e.around; });
    let swShape = null;
    if (swEdge && G.ctrl && G.modes && G.est && G.sw) {
      const m = 8, md = G.modes, c = G.ctrl, e = G.est;
      const pts = [[md.x - m, md.y - m], [md.x + md.w + m, md.y - m], [md.x + md.w + m, md.y + md.h + m], [c.x + c.w + m, md.y + md.h + m],
        [c.x + c.w + m, e.y - m], [e.x + e.w + m, e.y - m], [e.x + e.w + m, e.y + e.h + m], [e.x - m, e.y + e.h + m],
        [e.x - m, c.y + c.h + m], [c.x - m, c.y + c.h + m], [c.x - m, c.y - m], [md.x - m, c.y - m]];
      swShape = sv('path', { d: roundedPolygon(pts, 8), class: 'group-sw' });
      layerGroups.appendChild(swShape);
      const cx = G.sw.x + 200, top = e.y + e.h + m;
      layerGroups.appendChild(sv('path', { d: 'M' + cx + ' ' + G.sw.y + 'L' + cx + ' ' + top, class: 'group-sw-link' }));
      layerGroups.appendChild(sv('text', { x: cx + 8, y: G.sw.y - 9, class: 'group-label group-sw-label' }, swEdge.label || 'runs on flight software'));
      edgesByBlock.sw.push({ node: swShape, sw: true });
    }
    const verEdge = D.loopEdges.find(function (e) { return e.kind === 'bracket' && e.to === '*'; });
    let verShape = null;
    if (verEdge && G.ver) {
      const yb = G.ver.y - 26;
      verShape = sv('g', { class: 'group-ver' },
        sv('path', { d: 'M20 ' + (yb - 10) + 'L20 ' + yb + 'L980 ' + yb + 'L980 ' + (yb - 10), class: 'group-ver-line' }),
        sv('path', { d: 'M' + G.ver.cx + ' ' + G.ver.y + 'L' + G.ver.cx + ' ' + yb, class: 'group-ver-line' }),
        sv('text', { x: 975, y: yb - 6, class: 'group-label', 'text-anchor': 'end' }, 'verification covers every block above'));
      layerGroups.appendChild(verShape);
      edgesByBlock.ver.push({ node: verShape, sw: true });
    }

    /* ---------- edges */
    const R = routes(G);
    const edgeNodes = [];
    function markerFor(e) {
      if (e.ext) return 'ext';
      if (e.kind === 'supervisory') return 'sup';
      if (e.kind === 'trace') return 'trace';
      return 'sig';
    }
    D.loopEdges.forEach(function (e) {
      if (e.kind === 'bracket') return;
      let pts = R[e.id];
      if (!pts && G[e.from] && G[e.to]) pts = [[G[e.from].cx, G[e.from].cy], [G[e.to].cx, G[e.to].cy]];
      if (!pts) return;
      const d = roundedPath(pts, 7);
      const mk = markerFor(e);
      const line = sv('path', { d: d, class: 'edge-line', 'marker-end': 'url(#loop-m-' + mk + ')' });
      const g = sv('g', { class: ['edge', 'kind-' + e.kind, 'style-' + e.style, e.ext ? 'is-ext' : ''].join(' ') }, line);
      if (e.kind === 'signal' && e.style === 'solid' || e.kind === 'feedback' || e.kind === 'bypass') {
        g.appendChild(sv('path', { d: d, class: 'edge-flow' }));
      }
      layerEdges.appendChild(g);
      const rec = { node: g, line: line, marker: mk, from: e.from, to: e.to };
      edgeNodes.push(rec);
      if (edgesByBlock[e.from]) edgesByBlock[e.from].push(rec);
      if (edgesByBlock[e.to]) edgesByBlock[e.to].push(rec);
    });

    /* ---------- edge labels and junction signs (laid out with the text, see layout()) */
    const LBL = edgeLabels(G);
    const labelNodes = [];
    Object.keys(LBL).forEach(function (id) {
      if (!D.loopEdges.some(function (e) { return e.id === id; })) return;
      const spec = LBL[id];
      const t = sv('text', { class: 'edge-label', 'text-anchor': spec.anchor || 'middle' });
      layerLabels.appendChild(t);
      labelNodes.push({ node: t, spec: spec });
    });
    const signs = [];
    D.loopEdges.forEach(function (e) {
      if (!e.sign || e.to !== 'err' || !G.err) return;
      const fromLeft = e.from === 'ref';
      const t = sv('text', { class: 'edge-sign', 'text-anchor': 'middle' }, e.sign);
      layerLabels.appendChild(t);
      signs.push({ node: t, x: fromLeft ? G.err.cx - G.err.r - 9 : G.err.cx - 24, y: fromLeft ? G.err.cy - 9 : G.err.cy + G.err.r + 16 });
    });

    /* ---------- blocks */
    const blockNodes = {};
    // descriptions referenced by aria-describedby (subject counts and lens information)
    const descBox = el('div', { class: 'loop-descs', hidden: true });
    ids.forEach(function (id) {
      const b = blocks[id], g = G[id];
      const node = sv('g', {
        class: ['loop-block', 'role-' + ROLE[id].split(',')[0].toLowerCase().replace(/\s+/g, '-'), b.ext ? 'is-ext' : '', b.dashed ? 'is-dashed' : ''].join(' '),
        role: 'button', tabindex: '0', 'aria-pressed': 'false', 'aria-controls': 'loop-panel', 'data-block': id,
        'aria-describedby': 'loop-desc-' + id
      });
      descBox.appendChild(el('span', { id: 'loop-desc-' + id }));
      if (g.circle) {
        node.appendChild(sv('circle', { cx: g.cx, cy: g.cy, r: g.r + 5, class: 'focus-ring' }));
        node.appendChild(sv('circle', { cx: g.cx, cy: g.cy, r: g.r, class: 'block-shape' }));
      } else {
        node.appendChild(sv('rect', { x: g.x - 5, y: g.y - 5, width: g.w + 10, height: g.h + 10, rx: 12, class: 'focus-ring' }));
        node.appendChild(sv('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 8, class: 'block-shape' }));
      }
      const label = sv('text', { class: 'block-label', 'text-anchor': 'middle' });
      const sub = sv('text', { class: 'block-sub', 'text-anchor': 'middle' });
      node.appendChild(label);
      node.appendChild(sub);
      let tab = null;
      if (b.ext) {
        tab = sv('g', { class: 'ext-tab' }, sv('rect', { rx: 4 }), sv('text', null, ' Extension'));
        node.appendChild(tab);
      }
      const badge = sv('g', { class: 'lens-badge', hidden: true, 'aria-hidden': 'true' }, sv('circle'), sv('text', { 'text-anchor': 'middle' }));
      node.appendChild(badge);
      layerBlocks.appendChild(node);
      blockNodes[id] = { node: node, label: label, sub: sub, tab: tab, badge: badge };
      node.addEventListener('click', function () { toggle(id); });
      node.addEventListener('keydown', function (e) { onKey(e, id, false); });
      node.addEventListener('mouseenter', function () { hot(id, true); });
      node.addEventListener('mouseleave', function () { hot(id, false); });
      node.addEventListener('focus', function () { hot(id, true); });
      node.addEventListener('blur', function () { hot(id, false); });
    });
    $('loop-svg').appendChild(svgRoot);
    $('loop-svg').appendChild(descBox);

    /* ---------- layout of every text element for the current rendered scale */
    function layout() {
      const wpx = svgRoot.getBoundingClientRect().width;
      if (!wpx) return;
      const s = wpx / VIEW_W;
      if (Math.abs(s - state.scale) < 0.015 && layout.done) return;
      state.scale = s;
      layout.done = true;
      const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
      // target sizes in viewBox units (about 14 px labels and 11.5 px subtitles and arrow labels on screen) …
      const LS = clamp(14 / s, 15, 26), SS = clamp(11.5 / s, 12.5, 20), ES = clamp(11.5 / s, 12, 19);
      // … and the legibility floor the fitting keeps to before it shrinks further (about 10.5 px and 9.5 px)
      const lim = { ls: Math.max(11, 10.5 / s), ss: Math.max(10, 9.5 / s) };
      ids.forEach(function (id) { layoutBlock(id, LS, SS, lim); });
      labelNodes.forEach(function (ln) {
        const t = ln.node;
        t.textContent = '';
        t.setAttribute('font-size', ES.toFixed(2));
        ln.spec.lines.forEach(function (line, i) {
          const ts = sv('tspan', { x: ln.spec.x, y: (ln.spec.y + i * ES * 1.15).toFixed(1) });
          richText(ts, line, ES);
          t.appendChild(ts);
        });
      });
      signs.forEach(function (sg) {
        sg.node.setAttribute('x', sg.x); sg.node.setAttribute('y', sg.y);
        sg.node.setAttribute('font-size', (ES * 1.25).toFixed(2));
      });
      ui.qsa('.group-label', svgRoot).forEach(function (t) { t.setAttribute('font-size', ES.toFixed(2)); });
    }

    function layoutBlock(id, LS, SS, lim) {
      const b = blocks[id], g = G[id], n = blockNodes[id];
      n.label.textContent = ''; n.sub.textContent = '';
      if (g.circle) {
        // the comparator: name above the junction, the error symbol inside it
        const maxW = 100;
        let size = LS * 0.9;
        let lines = wrapText(b.label, maxW, size, 650);
        while ((lines.length > 2 || !fits(lines, maxW, size, 650)) && size > 10) { size -= 0.5; lines = wrapText(b.label, maxW, size, 650); }
        n.label.setAttribute('font-size', size.toFixed(2));
        const bottom = g.cy - g.r - 8;
        lines.forEach(function (l, i) {
          n.label.appendChild(sv('tspan', { x: g.cx, y: (bottom - (lines.length - 1 - i) * size * 1.12).toFixed(1) }, (i ? ' ' : '') + l));
        });
        const inner = Math.min(SS * 1.1, 18);
        n.sub.setAttribute('font-size', inner.toFixed(2));
        const ts = sv('tspan', { x: g.cx - 2, y: (g.cy + inner * 0.32).toFixed(1) });
        ts.appendChild(document.createTextNode(' '));
        richText(ts, 'q_e', inner);
        n.sub.appendChild(ts);
      } else {
        const fit = fitBlock(b, g.w - 2 * PAD_X, g.h - 2 * PAD_Y, LS, SS, lim);
        n.fit = fit;
        const ls = fit.ls, ss = fit.ss;
        n.label.setAttribute('font-size', ls.toFixed(2));
        n.sub.setAttribute('font-size', ss.toFixed(2));
        if (fit.mode === 'inline') {
          // one line: the label, a gap, then the subtitle, centred as a pair on a shared baseline
          const x0 = g.cx - (fit.wl + fit.gap + fit.ws) / 2;
          const base = (g.cy + Math.max(ls, ss) * 0.32).toFixed(1);
          n.label.setAttribute('text-anchor', 'start');
          n.sub.setAttribute('text-anchor', 'start');
          n.label.appendChild(sv('tspan', { x: x0.toFixed(1), y: base }, fit.lab[0]));
          const ts = sv('tspan', { x: (x0 + fit.wl + fit.gap).toFixed(1), y: base });
          ts.appendChild(document.createTextNode(' '));
          richText(ts, fit.sub[0], ss);
          n.sub.appendChild(ts);
        } else {
          n.label.setAttribute('text-anchor', 'middle');
          n.sub.setAttribute('text-anchor', 'middle');
          const top = g.cy - stackHeight(fit.lab, ls, fit.sub, ss) / 2;
          fit.lab.forEach(function (l, i) {
            n.label.appendChild(sv('tspan', { x: g.cx, y: (top + i * ls * LINE_L + ls * 0.86).toFixed(1) }, (i ? ' ' : '') + l));
          });
          fit.sub.forEach(function (l, i) {
            const ts = sv('tspan', { x: g.cx, y: (top + fit.lab.length * ls * LINE_L + SUB_GAP + i * ss * LINE_S + ss * 0.86).toFixed(1) });
            ts.appendChild(document.createTextNode(' '));
            richText(ts, l, ss);
            n.sub.appendChild(ts);
          });
        }
      }
      if (n.tab) {
        const ts = Math.max(11, Math.min(15, 10 / state.scale));
        const tw = textWidth('Extension', ts, 650) + 12;
        const rect = n.tab.querySelector('rect'), text = n.tab.querySelector('text');
        rect.setAttribute('x', g.x + 10); rect.setAttribute('y', (g.y - ts * 0.7 - 3).toFixed(1));
        rect.setAttribute('width', tw.toFixed(1)); rect.setAttribute('height', (ts + 6).toFixed(1));
        text.setAttribute('x', g.x + 16); text.setAttribute('y', (g.y + ts * 0.3 + 0.5).toFixed(1));
        text.setAttribute('font-size', ts.toFixed(2));
      }
      const br = Math.max(10, Math.min(15, 9.5 / state.scale));
      const bc = n.badge.querySelector('circle'), bt = n.badge.querySelector('text');
      const bx = g.circle ? g.cx + g.r * 0.78 : g.x + g.w - 5, by = g.circle ? g.cy - g.r * 0.78 : g.y + 5;
      bc.setAttribute('cx', bx); bc.setAttribute('cy', by); bc.setAttribute('r', br.toFixed(1));
      bt.setAttribute('x', bx); bt.setAttribute('y', (by + br * 0.4).toFixed(1)); bt.setAttribute('font-size', (br * 1.1).toFixed(1));
    }

    /* ---------- list view (below 640px) */
    const list = $('loop-list');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Blocks of the loop, in loop order');
    const listNodes = {};
    const FLOW_SEP = {
      modes: '↓ supervises the loop below', ref: '↓ q_ref', err: '↓ q_e', ctrl: '↓ τ_cmd', act: '↓ τ, joined by', env: '↓ τ_d', dyn: '↓ propagated by',
      int: '↓ q, ω measured by', sens: '↓ ω_m, q_m'
    };
    const HEAD = { req: 'Defines the loop', modes: 'The control loop', ver: 'Around the loop' };
    ids.forEach(function (id) {
      const b = blocks[id];
      if (HEAD[id]) list.appendChild(el('p', { class: 'loop-list-head' }, HEAD[id]));
      const count = el('span', { class: 'loop-item-badge', hidden: true });
      const btn = el('button', {
        type: 'button', class: ['loop-item', b.ext ? 'is-ext' : ''].join(' '), 'aria-pressed': 'false', 'aria-controls': 'loop-panel', 'data-block': id
      },
      el('span', { class: 'loop-item-text' },
        el('span', { class: 'loop-item-label' }, b.label, b.ext ? ' ' : null, b.ext ? ui.tag('extension') : null),
        b.sub ? el('span', { class: 'loop-item-sub' }, richNodes(b.sub)) : null),
      el('span', { class: 'loop-item-meta' }, count, el('span', { class: 'loop-item-n' }, plural(rows[id].length, 'subject'))));
      btn.addEventListener('click', function () { toggle(id); });
      btn.addEventListener('keydown', function (e) { onKey(e, id, true); });
      list.appendChild(btn);
      listNodes[id] = { btn: btn, count: count };
      if (FLOW_SEP[id]) list.appendChild(el('p', { class: 'loop-sep', 'aria-hidden': 'true' }, richNodes(FLOW_SEP[id])));
      if (id === 'est') {
        const back = el('button', { type: 'button', class: 'loop-item loop-back' },
          el('span', { class: 'loop-item-text' },
            el('span', { class: 'loop-item-label' }, '↺ back to error'),
            el('span', { class: 'loop-item-sub' }, 'the estimate closes the loop in the extension; the original project fed the true state straight back')));
        back.addEventListener('click', function () { select('err', { focus: true }); });
        list.appendChild(back);
      }
    });

    /* ---------- legend */
    const legend = $('loop-legend');
    function swatch(kind) {
      const s = sv('svg', { viewBox: '0 0 40 14', width: 40, height: 14, 'aria-hidden': 'true', focusable: 'false', class: 'legend-swatch ' + kind });
      if (kind === 'sw') s.appendChild(sv('rect', { x: 2, y: 2, width: 36, height: 10, rx: 3, class: 'group-sw' }));
      else if (kind === 'ver') s.appendChild(sv('path', { d: 'M2 2V9H38V2', class: 'group-ver-line' }));
      else {
        s.appendChild(sv('path', { d: 'M2 7H31', class: 'edge-line' }));
        s.appendChild(sv('path', { d: 'M30 2.5L38 7L30 11.5z', class: 'marker marker-' + (kind === 'ext' ? 'ext' : kind === 'sup' ? 'sup' : 'sig') }));
      }
      return s;
    }
    [['sig', 'kind-signal style-solid', 'signal in the original project'],
      ['ext', 'kind-feedback is-ext', 'extension: sensors and estimator'],
      ['sup', 'kind-supervisory', 'supervision by the mode manager'],
      ['dot', 'kind-signal style-dotted', 'numerical propagation'],
      ['sw', '', 'runs on flight software'],
      ['ver', '', 'requirements traced to verification']].forEach(function (row) {
      const sw = swatch(row[0]);
      if (row[1]) sw.setAttribute('class', 'legend-swatch edge ' + row[1]);
      legend.appendChild(el('li', null, sw, el('span', null, row[2])));
    });

    /* ---------- flow animation control */
    const actions = $('loop-foot-actions');
    if (!ui.prefersReducedMotion()) {
      const flowBtn = ui.button({ label: 'Pause the flow animation', kind: 'ghost', small: true, icon: 'pause' });
      flowBtn.classList.add('loop-flow-btn');
      flowBtn.setAttribute('aria-pressed', 'false');
      flowBtn.addEventListener('click', function () {
        const paused = svgRoot.classList.toggle('flow-paused');
        flowBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
        flowBtn.textContent = '';
        flowBtn.appendChild(ui.icon(paused ? 'play' : 'pause'));
        flowBtn.appendChild(el('span', { class: 'btn-label' }, paused ? 'Resume the flow animation' : 'Pause the flow animation'));
      });
      actions.appendChild(flowBtn);
    }
    actions.appendChild(el('span', { class: 'tags' }, ui.tag('project'), ui.tag('extension')));

    /* ---------- aria labels (with lens information) */
    function describe(id) {
      const n = rows[id].length;
      let s = 'Fed by ' + plural(n, 'subject') + ' in ' + plural(discCount[id], 'discipline') + '.';
      if (state.lens.size) {
        const k = lensCount(id);
        s += k ? ' ' + plural(k, 'subject') + ' from the selected disciplines.' : ' None from the selected disciplines.';
      }
      return s;
    }
    function lensCount(id) {
      return rows[id].filter(function (r) { return state.lens.has(courseDiscipline(r.course)); }).length;
    }

    /* ---------- highlight */
    function hot(id, on) {
      const n = blockNodes[id];
      if (!n) return;
      n.node.classList.toggle('is-hot', on || state.sel === id);
      paintEdges();
    }
    function paintEdges() {
      const hotIds = ids.filter(function (id) { return blockNodes[id].node.classList.contains('is-hot') || state.sel === id; });
      edgeNodes.forEach(function (rec) { rec.node.classList.remove('is-hot'); rec.line.setAttribute('marker-end', 'url(#loop-m-' + rec.marker + ')'); });
      if (swShape) swShape.classList.remove('is-hot');
      if (verShape) verShape.classList.remove('is-hot');
      hotIds.forEach(function (id) {
        edgesByBlock[id].forEach(function (rec) {
          rec.node.classList.add('is-hot');
          if (rec.line) rec.line.setAttribute('marker-end', 'url(#loop-m-hot)');
        });
      });
    }

    /* ---------- selection and panel */
    function isSheet() { return mqSheet.matches; }
    function focusBlock(id) {
      const target = mqList.matches ? listNodes[id] && listNodes[id].btn : blockNodes[id] && blockNodes[id].node;
      if (target) target.focus();
    }
    function toggle(id) { if (state.sel === id) close(false); else select(id); }
    function select(id, o) {
      const opt = o || {};
      const wasHidden = panel.hidden;
      state.sel = id;
      ids.forEach(function (k) {
        const on = k === id;
        blockNodes[k].node.setAttribute('aria-pressed', on ? 'true' : 'false');
        blockNodes[k].node.classList.toggle('is-selected', on);
        blockNodes[k].node.classList.toggle('is-hot', on);
        listNodes[k].btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      paintEdges();
      panel.hidden = false;
      panel.classList.add('is-open');
      document.body.classList.add('lp-sheet-open');
      renderPanel(id);
      if (opt.focus) focusBlock(id);
      if (isSheet()) revealAboveSheet(id);
      if (wasHidden) ui.announce(blocks[id].label + ': details shown. ' + plural(rows[id].length, 'subject') + ' in ' + plural(discCount[id], 'discipline') + '.');
    }
    /** Keep the chosen block visible above the bottom sheet. */
    function revealAboveSheet(id) {
      window.requestAnimationFrame(function () {
        const target = mqList.matches ? listNodes[id].btn : blockNodes[id].node;
        const r = target.getBoundingClientRect(), top = panel.getBoundingClientRect().top;
        let dy = 0;
        if (r.bottom > top - 8) dy = r.bottom - top + 16;
        else if (r.top < 8) dy = r.top - 16;
        if (dy) window.scrollBy({ top: dy, behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
      });
    }
    function close(returnFocus) {
      const was = state.sel;
      state.sel = null;
      ids.forEach(function (k) {
        blockNodes[k].node.setAttribute('aria-pressed', 'false');
        blockNodes[k].node.classList.remove('is-selected', 'is-hot');
        listNodes[k].btn.setAttribute('aria-pressed', 'false');
      });
      paintEdges();
      panel.classList.remove('is-open');
      document.body.classList.remove('lp-sheet-open');
      if (isSheet()) panel.hidden = true; else renderIntro();
      if (returnFocus && was) focusBlock(was);
    }
    function move(id, d) {
      const i = ids.indexOf(id);
      const next = ids[(i + d + ids.length) % ids.length];
      if (state.sel) select(next);
      focusBlock(next);
    }
    function firstFocusable(scope) {
      return ui.qs('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', scope);
    }
    function onKey(e, id, isButton) {
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); move(id, 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); move(id, -1); }
      else if (k === 'Home') { e.preventDefault(); move(ids[ids.length - 1], 1); }
      else if (k === 'End') { e.preventDefault(); move(ids[0], -1); }
      else if (!isButton && (k === 'Enter' || k === ' ' || k === 'Spacebar')) { e.preventDefault(); toggle(id); }
      else if (k === 'Escape' && state.sel) { e.preventDefault(); close(false); }
      else if (k === 'Tab' && !e.shiftKey && state.sel === id && !panel.hidden) {
        const f = firstFocusable(panel);
        if (f) { e.preventDefault(); state.lastFocus = id; f.focus(); }
      }
    }
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.sel) { e.preventDefault(); close(true); return; }
      const a = document.activeElement;
      if (e.key === 'Tab' && e.shiftKey && state.sel && (a === firstFocusable(panel) || (a && a.id === 'loop-panel-title'))) {
        e.preventDefault();
        focusBlock(state.sel);
      }
    });

    // The panel keeps two children: a scroll area that is re-rendered, and a persistent close button.
    const scroller = el('div', { class: 'lp-scroll' });
    const closeBtn = el('button', { type: 'button', class: 'btn ghost sm icon-only lp-close', 'aria-label': 'Close the details', title: 'Close (Esc)' }, ui.icon('cross'));
    closeBtn.addEventListener('click', function () { close(true); });
    panel.appendChild(scroller);
    panel.appendChild(closeBtn);

    function truncate(s, n) {
      if (s.length <= n) return null;
      let cut = s.lastIndexOf(' ', n - 1);
      if (cut < n * 0.7) cut = n - 1;
      return s.slice(0, cut).replace(/[\s,;:(–-]+$/, '') + '…';
    }
    function subjectRow(r) {
      const c = D.course(r.course) || { id: r.course, name: r.course, evidence: 'outline' };
      const short = truncate(r.concept, 140);
      const concept = el('p', { class: 'lp-concept' });
      const textNode = el('span', null, short || r.concept);
      concept.appendChild(textNode);
      if (short) {
        const more = el('button', { type: 'button', class: 'link lp-more', 'aria-expanded': 'false' }, 'more', el('span', { class: 'visually-hidden' }, ' about ' + c.name));
        more.addEventListener('click', function () {
          const open = more.getAttribute('aria-expanded') !== 'true';
          more.setAttribute('aria-expanded', open ? 'true' : 'false');
          textNode.textContent = open ? r.concept : short;
          more.firstChild.textContent = open ? 'less' : 'more';
        });
        concept.appendChild(document.createTextNode(' '));
        concept.appendChild(more);
      }
      return el('li', { class: 'lp-row' },
        el('div', { class: 'lp-meta' },
          el('a', { href: 'atlas.html#c-' + c.id }, c.name),
          ui.pill(r.strength), ui.evidence(c.evidence), r.tag && r.tag !== 'direct' ? ui.tag(r.tag) : null),
        concept);
    }
    function moduleLinks(b) {
      const seen = {};
      const out = [];
      (b.match || []).forEach(function (m) {
        const mod = D.module(m.module);
        if (!mod || seen[mod.id]) return;
        seen[mod.id] = true;
        out.push(el('a', { class: 'lp-learn', href: mod.slug + (m.section ? '#' + m.section : '') },
          'Learn it: ' + pad2(mod.num) + ' ' + mod.title, ui.icon('arrow-right')));
      });
      return out;
    }
    function navButton(dir) {
      const i = ids.indexOf(state.sel);
      const id = ids[(i + dir + ids.length) % ids.length];
      const b = el('button', { type: 'button', class: 'btn secondary sm lp-step' },
        dir < 0 ? ui.icon('chevron-left') : null,
        el('span', { class: 'btn-label' }, (dir < 0 ? 'Previous: ' : 'Next: ') + blocks[id].label),
        dir > 0 ? ui.icon('chevron-right') : null);
      b.addEventListener('click', function () {
        select(id);
        // The re-render removed the pressed button, so focus moves to the new block's title (the panel is
        // scrolled to the top); Tab continues into its details and Shift+Tab returns to the diagram.
        const title = $('loop-panel-title');
        if (!title) return;
        title.focus({ preventScroll: true });
        revealPanelTop();
      });
      return b;
    }
    /** Beside the diagram the panel can be taller than the diagram, so it does not stick and, after a step
     *  from the foot of a long panel, its top (with the focused title) can sit above the viewport. */
    function revealPanelTop() {
      if (isSheet()) return;
      const top = panel.getBoundingClientRect().top;
      if (top >= 0 && top <= window.innerHeight - 120) return;
      window.scrollBy({ top: top - 12, behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    /** Stack a display equation at its top-level ",\qquad", "\qquad" and ",\quad" joins, so that each
     *  relation gets its own line in the narrow panel instead of a horizontal scroll. */
    function stackEquation(tex) {
      const re = /(,?)\s*\\(q?quad)(?![A-Za-z])\s*/g;
      const parts = [];
      let last = 0, m;
      while ((m = re.exec(tex))) {
        if (!m[1] && m[2] === 'quad') continue;            // a bare \quad is spacing inside one relation
        if (braceDepth(tex.slice(0, m.index)) !== 0) continue;
        parts.push(tex.slice(last, m.index));
        last = m.index + m[0].length;
      }
      parts.push(tex.slice(last));
      return parts.length > 1 ? '\\begin{gathered}' + parts.join(',\\\\ ') + '\\end{gathered}' : tex;
    }
    function braceDepth(s) {
      let d = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\') i += 1;
        else if (s[i] === '{') d += 1;
        else if (s[i] === '}') d -= 1;
      }
      return d;
    }
    function renderPanel(id) {
      const b = blocks[id];
      const groups = D.byDiscipline(rows[id]);
      scroller.textContent = '';
      scroller.scrollTop = 0;
      panel.scrollTop = 0;
      closeBtn.hidden = false;
      scroller.appendChild(el('div', { class: 'lp-head' },
        el('p', { class: 'lp-kicker' }, ROLE[id] + ' · block ' + (ids.indexOf(id) + 1) + ' of ' + ids.length),
        el('h3', { class: 'lp-title', id: 'loop-panel-title', tabindex: '-1' }, b.label, b.ext ? ' ' : null, b.ext ? ui.tag('extension') : null),
        b.sub ? el('p', { class: 'lp-sub' }, richNodes(b.sub)) : null,
        el('p', { class: 'lp-count' }, plural(rows[id].length, 'subject') + ' · ' + plural(groups.length, 'discipline'))));
      const body = el('div', { class: 'lp-body', 'aria-live': 'off' });
      if (b.desc) body.appendChild(el('p', { class: 'lp-desc' }, b.desc));
      if (b.eq) body.appendChild(el('div', { class: 'eq lp-eq' }, '\\[' + stackEquation(b.eq) + '\\]'));
      const links = el('div', { class: 'lp-links' }, moduleLinks(b));
      if (b.sim) links.appendChild(ui.simLink('Try it: ' + b.sim.label, b.sim.hash));
      body.appendChild(links);
      body.appendChild(el('h4', { class: 'lp-subjects-title' }, 'Subjects that feed this block'));
      groups.forEach(function (gr) {
        const inLens = state.lens.has(gr.discipline.id);
        body.appendChild(el('div', {
          class: ['lp-group', state.lens.size ? (inLens ? 'is-lens' : 'is-faded') : ''].join(' '),
          style: { '--dot': 'var(' + gr.discipline.color + ')' }, 'data-discipline': gr.discipline.id
        },
        el('h5', null, el('span', { class: 'prov-dot', 'aria-hidden': 'true' }), gr.discipline.name, ' ', el('span', { class: 'count' }, '(' + gr.rows.length + ')'),
          ' ', el('span', { class: 'lp-lens-mark' }, 'in the lens')),
        el('ul', { class: 'lp-rows' }, gr.rows.map(subjectRow))));
      });
      body.appendChild(el('div', { class: 'lp-nav' }, navButton(-1), navButton(1)));
      scroller.appendChild(body);
      ui.typeset(body);
      fitEquations(body);
    }
    /** Scale down (to at most 0.72 em) any panel equation that is still wider than the panel. */
    function fitEquations(scope) {
      ui.qsa('.katex-display', scope).forEach(function (d) {
        d.style.fontSize = '';
        const over = d.scrollWidth / Math.max(1, d.clientWidth);
        if (over > 1.01) d.style.fontSize = Math.max(0.72, 0.88 / (over * 1.02)).toFixed(3) + 'em';
      });
    }
    function renderIntro() {
      scroller.textContent = '';
      closeBtn.hidden = true;
      const st = D.stats();
      const starts = ['ctrl', 'dyn', 'modes'].filter(function (id) { return blocks[id]; }).map(function (id) {
        const b = el('button', { type: 'button', class: 'btn secondary sm' }, blocks[id].label);
        b.addEventListener('click', function () { select(id, { focus: true }); });
        return b;
      });
      scroller.appendChild(el('div', { class: 'lp-head' },
        el('p', { class: 'lp-kicker' }, plural(ids.length, 'block') + ' · ' + st.courses + ' subjects · ' + st.links + ' links'),
        el('h3', { class: 'lp-title', id: 'loop-panel-title' }, 'Pick a block')));
      scroller.appendChild(el('div', { class: 'lp-body', 'aria-live': 'off' },
        el('p', null, 'Each box is one part of the project. Select it to see what it does, its key equation, the module that teaches it and every subject whose material feeds it.'),
        el('p', { class: 'lp-start-title' }, 'Good places to start:'),
        el('div', { class: 'btn-row' }, starts),
        el('p', { class: 'lp-keys' }, 'Keyboard: ', el('kbd', null, 'Tab'), ' to a block, ', el('kbd', null, '←'), ' ', el('kbd', null, '→'),
          ' along the loop, ', el('kbd', null, 'Enter'), ' to open, ', el('kbd', null, 'Tab'), ' into the details, ', el('kbd', null, 'Esc'), ' to close.')));
    }

    function syncMode() {
      if (isSheet()) { if (!state.sel) panel.hidden = true; }
      else { panel.hidden = false; if (!state.sel) renderIntro(); }
      layout();
    }
    onMedia(mqSheet, syncMode);
    onMedia(mqList, function () { layout(); });
    if (isSheet()) panel.hidden = true; else renderIntro();
    ids.forEach(function (id) { $('loop-desc-' + id).textContent = describe(id); });
    layout();
    if (typeof window.ResizeObserver === 'function') {
      new window.ResizeObserver(ui.debounce(layout, 60)).observe(stage);
    } else window.addEventListener('resize', ui.debounce(layout, 120));

    /* ---------- lens API */
    function setLens(set) {
      state.lens = set;
      const dimmed = {};
      ids.forEach(function (id) {
        const n = blockNodes[id];
        const k = set.size ? lensCount(id) : 0;
        const dim = set.size > 0 && k === 0;
        dimmed[id] = dim;
        n.node.classList.toggle('is-dim', dim);
        setHidden(n.badge, !(set.size && k));
        n.badge.querySelector('text').textContent = String(k);
        $('loop-desc-' + id).textContent = describe(id);
        listNodes[id].btn.classList.toggle('is-dim', dim);
        listNodes[id].count.hidden = !(set.size && k);
        listNodes[id].count.textContent = set.size ? k + ' from the lens' : '';
        if (id === 'sw' && swShape) swShape.classList.toggle('is-dim', dim);
      });
      // an arrow fades only when both of its ends are outside the lens
      edgeNodes.forEach(function (rec) { rec.node.classList.toggle('is-dim', !!(dimmed[rec.from] && dimmed[rec.to])); });
      if (state.sel) {
        ui.qsa('.lp-group', panel).forEach(function (g) {
          const on = set.has(g.getAttribute('data-discipline'));
          g.classList.toggle('is-lens', set.size > 0 && on);
          g.classList.toggle('is-faded', set.size > 0 && !on);
        });
      }
    }

    return { select: select, focusBlock: focusBlock, setLens: setLens, stage: stage };
  }

  /* ================================================================ discipline lens */

  /*
   * LOCAL (request P0): ADCS.data.strongestParts(disciplineIds) and ADCS.data.disciplines[i].brings.
   * "Strongest" must mean the same here as in the atlas's Disciplines view (atlas.js scores() and
   * strongestOn()): the weighted score S = Σ w over the selected disciplines' links into a part,
   * with strong 3, moderate 2 and weak 1; the top three parts are named, ties kept, highest score first
   * (ties in module order).
   * The "what it brings" sentences are copied word for word from atlas.js BRINGS until P0 moves them
   * into ADCS.data; a `brings` string on the discipline record wins as soon as it exists.
   */
  const LINK_WEIGHT = { strong: 3, moderate: 2, weak: 1 };
  const BRINGS_LOCAL = {
    me: 'The physical plant: rigid-body dynamics and the inertia tensor, the reaction-wheel motor with its speed-dependent torque limit, and the habit of designing to a stated margin.',
    math: 'The language of the model: vectors, matrices and complex numbers grow into quaternions, Taylor series explain why RK4 is accurate, and probability turns sixty passing trials into a confidence bound.',
    phys: 'The physics under the equations: τ = dL/dt rewritten in the rotating body frame, the damped oscillator behind the controller’s damping ratio, and the thin upper atmosphere that sets the drag torque.',
    cs: 'The logic and the machine: the mode manager as a finite automaton that can be checked exhaustively, one simulation step as a dataflow graph, and the number formats, timers and watchdogs that flight code runs on.',
    sw: 'The code itself: controller and mode-manager classes, a reusable RK4 step, seeded and reproducible Monte Carlo trials, and automated tests that carry requirement IDs.',
    ai: 'Ways of reasoning about the loop: the spacecraft as an agent, LQR seen as a Bellman equation, Bayes’ rule as the root of the recursive filter that the sensor extension turns into a Kalman filter (the filter itself is not taught in these subjects), and the statistics of what sixty passing trials can prove.',
    av: 'Flight-proven analogues: instrument gyros and tail-rotor torque reaction for the wheels, failsafe state machines and decision thresholds for safe mode, and strapdown navigation for the sensor extension.',
    mhf: 'The work around the code: risk registers and planning, mode-confusion research for the interface, and the layered defences and just culture behind operating the spacecraft.'
  };
  function bringsOf(d) { return typeof d.brings === 'string' && d.brings ? d.brings : (BRINGS_LOCAL[d.id] || ''); }
  /** Parts ranked by weighted score for a set of discipline ids: [{ m, score }], top three with ties, highest score first (ties in module order). */
  function strongestParts(sel) {
    const s = {};
    D.modules.forEach(function (m) { s[m.id] = 0; });
    D.mappings.forEach(function (r) {
      if (sel.has(courseDiscipline(r.course)) && r.module in s) s[r.module] += LINK_WEIGHT[r.strength] || 0;
    });
    const sorted = D.modules.filter(function (m) { return s[m.id] > 0; })
      .sort(function (a, b) { return s[b.id] - s[a.id] || a.num - b.num; });
    if (!sorted.length) return [];
    const cut = s[sorted[Math.min(2, sorted.length - 1)].id];
    return sorted.filter(function (m) { return s[m.id] >= cut; })
      .map(function (m) { return { m: m, score: s[m.id] }; });
  }

  function buildLens(loop) {
    const chipsBox = $('lens-chips');
    const sentence = $('lens-sentence');
    const parts = $('lens-parts');
    const brings = $('lens-brings');
    const more = $('lens-more');
    const chips = [];
    D.disciplines.forEach(function (d) {
      const c = ui.chip({ label: d.name, dot: d.color, title: 'Show what ' + d.name + ' feeds' });
      c.discipline = d;
      c.on('change', update);
      chips.push(c);
      chipsBox.appendChild(c.el);
    });
    const clear = ui.button({ label: 'Clear the lens', kind: 'ghost', small: true, icon: 'reset' });
    clear.addEventListener('click', function () { chips.forEach(function (c) { c.set(false); }); update(); });
    $('lens-clear-slot').appendChild(clear);

    const partNodes = D.modules.map(function (m) {
      const n = el('span', { class: 'lens-part-n' });
      const hiddenN = el('span', { class: 'visually-hidden' });
      const a = el('a', { href: m.slug, class: 'lens-part', title: pad2(m.num) + ' ' + m.title },
        el('span', { class: 'lens-part-num' }, pad2(m.num)), ' ', el('span', { class: 'lens-part-name' }, m.short), ' ', n, hiddenN);
      parts.appendChild(el('li', null, a));
      return { m: m, a: a, n: n, hiddenN: hiddenN };
    });

    function update() {
      const sel = new Set(chips.filter(function (c) { return c.value; }).map(function (c) { return c.discipline.id; }));
      loop.setLens(sel);
      clear.disabled = !sel.size;
      const rows = D.mappings.filter(function (r) { return sel.has(courseDiscipline(r.course)); });
      const perModule = {};
      rows.forEach(function (r) {
        const p = perModule[r.module] || (perModule[r.module] = { courses: new Set() });
        p.courses.add(r.course);
      });
      partNodes.forEach(function (pn) {
        const p = perModule[pn.m.id];
        const total = D.mappingsFor(pn.m.id).length;
        const k = p ? p.courses.size : 0;
        pn.a.classList.toggle('is-dim', sel.size > 0 && !k);
        pn.n.textContent = sel.size ? String(k) : String(total);
        pn.hiddenN.textContent = sel.size ? (k === 1 ? ' subject' : ' subjects') + ' from the selected disciplines' : (total === 1 ? ' subject' : ' subjects');
      });
      parts.classList.toggle('is-active', sel.size > 0);
      updateMore(sel);
      updateBrings(sel);
      if (!sel.size) { sentence.textContent = 'Select a discipline to see which parts of the project it feeds.'; return; }
      const names = D.disciplines.filter(function (d) { return sel.has(d.id); }).map(function (d) { return d.name; });
      const mods = Object.keys(perModule);
      const top = strongestParts(sel);
      let detail = '';
      if (top.length) {
        // Ties are kept, as in the atlas; a long tie (only possible for several disciplines) is shortened.
        const shown = top.slice(0, top.length > 4 ? 3 : 4).map(function (t) { return pad2(t.m.num) + ' ' + t.m.short; });
        if (top.length > shown.length) shown.push(plural(top.length - shown.length, 'more part'));
        detail = ' (strongest by weighted score: ' + listText(shown) + ')';
      }
      sentence.textContent = listText(names) + (names.length === 1 ? ' feeds ' : ' feed ') + mods.length + ' of ' +
        D.modules.length + ' project parts' + detail + '.';
    }

    /* What the one selected discipline brings, with the atlas's honesty tags. */
    function updateBrings(sel) {
      brings.textContent = '';
      const d = sel.size === 1 ? D.disciplines.filter(function (x) { return sel.has(x.id); })[0] : null;
      const text = d ? bringsOf(d) : '';
      brings.hidden = !text;
      if (!text) return;
      const cs = D.courses.filter(function (c) { return c.discipline === d.id; });
      brings.appendChild(el('span', { class: 'lens-brings-label' }, 'What ' + d.name + ' brings'));
      brings.appendChild(el('span', { class: 'visually-hidden' }, ': '));
      brings.appendChild(document.createTextNode(text));
      // As in the atlas: a discipline whose subjects are all known only from outlines is typical content.
      if (cs.length && cs.every(function (c) { return c.evidence === 'outline'; })) brings.append(' ', ui.tag('typical'));
      if (/\bextension\b/.test(text)) brings.append(' ', ui.tag('extension'));
    }

    /* Routes into the atlas: the selected subjects as cards, and the discipline comparison. */
    const subjectsLink = el('a', { class: 'lens-link' });
    const subjectsText = el('span');
    subjectsLink.append(subjectsText, ui.icon('arrow-right'));
    const compareLink = el('a', { class: 'lens-link' }, 'Compare the disciplines', ui.icon('arrow-right'));
    more.append(subjectsLink, ' ', compareLink);
    function updateMore(sel) {
      const ids = D.disciplines.filter(function (d) { return sel.has(d.id); }).map(function (d) { return d.id; });
      const n = D.courses.filter(function (c) { return sel.has(c.discipline); }).length;
      const d = ids.length ? 'd=' + ids.join(',') : '';
      subjectsText.textContent = ids.length ? 'See ' + (n === 1 ? 'this subject' : 'these ' + n + ' subjects') + ' in the atlas'
        : 'Browse all ' + plural(D.courses.length, 'subject') + ' in the atlas';
      subjectsLink.setAttribute('href', 'atlas.html' + (d ? '#' + d : ''));
      compareLink.setAttribute('href', 'atlas.html#' + (d ? d + '&' : '') + 'v=disciplines');
    }
    update();
  }

  /* ================================================================ steps that point into the diagram */

  function bindSteps(loop) {
    ui.qsa('[data-select]').forEach(function (b) {
      b.addEventListener('click', function () { loop.select(b.getAttribute('data-select'), { focus: true }); });
    });
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'index' });
    fillParams();
    fillCounts();
    buildNumbers();
    const loop = buildLoop();
    buildLens(loop);
    bindSteps(loop);
    $('how-legend').appendChild(ui.legend(false));
    buildHero();
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
