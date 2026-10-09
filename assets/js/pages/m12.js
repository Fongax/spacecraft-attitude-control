/**
 * m12.js: Module 12, project management and risk (package P6).
 * Builds the iteration log, register and lessons tables from ADCS.data (verbatim), and the widgets
 * W12.1 interactive risk matrix, W12.2 critical path and PERT, W12.3 FMEA builder and
 * W12.4 bow-tie builder (stretch). Residual risk positions, PERT estimates and FMEA scores are
 * illustrative and tagged so on the page.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el, svg = ui.svg;
  const D = A.data;
  const LEVEL = ['', 'Low', 'Medium', 'High'];
  const LEVEL1 = ['', 'L', 'M', 'H'];
  // soft hyphens let the risk tokens break inside long words in the narrow phone grid
  const SHY = { 'Saturation': 'Satu\u00adration', 'Instability': 'Insta\u00adbility', 'Mode flapping': 'Mode flap\u00adping',
    'Sign ambiguity': 'Sign ambi\u00adguity', 'Toolbox dependency': 'Tool\u00adbox depen\u00addency', 'Reproducibility': 'Repro\u00adduci\u00adbility' };

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, body: fig.querySelector('.widget-body'), controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
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
  function modLink(id, text) {
    const m = D.module(id);
    return m ? el('a', { href: m.slug }, text || (String(m.num).padStart(2, '0') + ' ' + m.short)) : document.createTextNode(text || id);
  }
  function exposureClass(e) { return e >= 6 ? 'hi' : e >= 3 ? 'mid' : 'lo'; }
  function reduced() { return ui.prefersReducedMotion(); }

  /* ================================================================ data tables */

  function buildTables() {
    const logBox = document.getElementById('m12-log');
    if (logBox) {
      const cols = D.logColumns.map(function (c, i) { return { key: 'c' + i, label: c }; });
      const logT = ui.table(cols, D.log.map(function (r) { return [r.label, r.work, r.problems, r.decisions, r.lessons]; }),
        { caption: 'The six-iteration log (verbatim)', rowHeaders: true });
      logT.table.classList.add('m12-text-table');
      logBox.appendChild(logT);
    }
    const regBox = document.getElementById('m12-register');
    if (regBox) {
      regBox.appendChild(ui.table([{ key: 'r', label: 'Risk' }, { key: 'l', label: 'Likelihood' }, { key: 'i', label: 'Impact' }, { key: 'e', label: 'L × I', num: true }, { key: 'm', label: 'Mitigation' }, { key: 'f', label: 'Where it lives' }],
        D.risks.map(function (r) { return [r.risk, r.likelihood, r.impact, el('span', { class: 'm12-exp ' + exposureClass(r.score) }, String(r.score)), r.mitigation, el('span', null, r.feature + ' · ', modLink(r.module))]; }),
        { caption: 'Risk register (risk, likelihood, impact and mitigation verbatim; score derived)', rowHeaders: true }));
      regBox.lastChild.table.classList.add('m12-text-table', 'm12-register-table');
    }
    const lesBox = document.getElementById('m12-lessons');
    if (lesBox) {
      const WHERE = {
        1: ['The assumptions list fixes what the model leaves out, so every check knows its limits.', 'm01'],
        2: ['RK4 with renormalisation after every step, and integer step counters for the timers.', 'm04'],
        3: ['The stored fallback LQR gain: no optional toolbox needed to reproduce a result.', 'm10'],
        4: ['Hysteresis, a minimum dwell and forbidden transitions, checked like any other requirement.', 'm08'],
        5: ['A seeded 60-trial Monte Carlo campaign instead of one clean plot.', 'm09'],
        6: ['Every result tied to a requirement ID through the test matrix.', 'm01']
      };
      lesBox.appendChild(ui.table([{ key: 'i', label: 'Iteration' }, { key: 'l', label: 'Lesson (verbatim)' }, { key: 'p', label: 'The practice on this site' }],
        D.log.map(function (r) { const w = WHERE[r.iteration] || ['', null]; return [r.label, '“' + r.lessons + '”', el('span', null, w[0] + ' ', w[1] ? modLink(w[1], 'Module ' + String(D.module(w[1]).num).padStart(2, '0')) : '')]; }),
        { caption: 'Six lessons and where they show', rowHeaders: true }));
      lesBox.lastChild.table.classList.add('m12-text-table', 'm12-lessons-table');
    }
  }

  /* ================================================================ W12.1 risk matrix */

  function buildRiskMatrix() {
    const w = parts('w-risk-matrix');
    const pos = {};
    D.risks.forEach(function (r) { pos[r.id] = { L: r.L, I: r.I }; });
    let mitigated = false, selected = null;
    const applyBtn = ui.button({ label: 'Apply mitigations', kind: 'primary', icon: 'play' });
    const resetBtn = ui.button({ label: 'Reset to the register', kind: 'ghost', icon: 'reset', small: true });
    w.controls.appendChild(el('div', { class: 'btn-row m12-wide' }, applyBtn, resetBtn));
    const set = readouts(w.controls, ['Total exposure now', 'Register total', 'Highest exposure']);
    const layout = el('div', { class: 'm12-rm-layout' });
    w.out.appendChild(layout);
    const grid = el('div', { class: 'm12-rm', role: 'group', 'aria-label': 'Risk matrix: likelihood by impact' });
    const cells = {};
    grid.appendChild(el('div', { class: 'm12-rm-ylab', 'aria-hidden': 'true' }, 'Likelihood'));
    for (let L = 3; L >= 1; L--) {
      grid.appendChild(el('div', { class: 'm12-rm-rowlab', 'aria-hidden': 'true' }, el('span', { class: 'm12-long' }, LEVEL[L]), el('span', { class: 'm12-short' }, LEVEL1[L])));
      for (let I = 1; I <= 3; I++) {
        const e = L * I;
        const c = el('div', { class: 'm12-cell ' + exposureClass(e), dataset: { l: String(L), i: String(I) } },
          el('span', { class: 'm12-cell-lab' }, LEVEL1[L] + '×' + LEVEL1[I] + ' = ' + e),
          el('div', { class: 'm12-cell-tokens' }));
        cells[L + '-' + I] = c;
        grid.appendChild(c);
      }
    }
    grid.appendChild(el('div', { class: 'm12-rm-corner', 'aria-hidden': 'true' }));
    grid.appendChild(el('div', { class: 'm12-rm-corner', 'aria-hidden': 'true' }));
    for (let I = 1; I <= 3; I++) grid.appendChild(el('div', { class: 'm12-rm-collab', 'aria-hidden': 'true' }, LEVEL[I]));
    grid.appendChild(el('div', { class: 'm12-rm-corner', 'aria-hidden': 'true' }));
    grid.appendChild(el('div', { class: 'm12-rm-corner', 'aria-hidden': 'true' }));
    grid.appendChild(el('div', { class: 'm12-rm-xlab', 'aria-hidden': 'true' }, 'Impact'));
    const gridWrap = el('div', { class: 'm12-rm-wrap' }, grid, el('p', { class: 'm12-small' }, 'Cell labels give L × I. Bands: 1–2 low, 3–4 medium, 6–9 high.'));
    const list = el('ul', { class: 'm12-rlist' });
    layout.appendChild(gridWrap); layout.appendChild(list);
    const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    w.out.appendChild(live);

    const tokens = {}, descs = {};
    // each token is named by its visible text (name and exposure); its position and the key help
    // live in a hidden description, so the accessible name always contains the visible label
    const descBox = el('div', { hidden: true });
    w.out.appendChild(descBox);
    D.risks.forEach(function (r) {
      const dId = 'm12-tok-' + r.id;
      descs[r.id] = el('span', { id: dId });
      descBox.appendChild(descs[r.id]);
      const b = el('button', { type: 'button', class: 'm12-token', dataset: { id: r.id }, 'aria-pressed': 'false', 'aria-describedby': dId }, el('span', { class: 'm12-token-name' }, SHY[r.short] || r.short), el('span', { class: 'm12-token-score' }));
      tokens[r.id] = b;
      b.addEventListener('click', function () { if (b.dataset.dragged === '1') { b.dataset.dragged = ''; return; } select(r.id); });
      b.addEventListener('keydown', function (ev) {
        const p = pos[r.id];
        let L = p.L, I = p.I;
        if (ev.key === 'ArrowUp') L++; else if (ev.key === 'ArrowDown') L--; else if (ev.key === 'ArrowRight') I++; else if (ev.key === 'ArrowLeft') I--; else return;
        ev.preventDefault();
        L = Math.max(1, Math.min(3, L)); I = Math.max(1, Math.min(3, I));
        if (L === p.L && I === p.I) return;
        selected = r.id;
        move([[r.id, L, I]]);
        b.focus();
      });
      // pointer drag
      let start = null;
      b.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return;
        start = { x: ev.clientX, y: ev.clientY, moved: false };
        b.setPointerCapture(ev.pointerId);
      });
      b.addEventListener('pointermove', function (ev) {
        if (!start) return;
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 6) return;
        start.moved = true;
        b.classList.add('is-dragging');
        b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      function end(ev) {
        if (!start) return;
        const moved = start.moved;
        start = null;
        b.classList.remove('is-dragging');
        b.style.transform = '';
        if (!moved) return;
        b.dataset.dragged = '1';
        b.style.pointerEvents = 'none';
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        b.style.pointerEvents = '';
        const cell = target && target.closest ? target.closest('.m12-cell') : null;
        selected = r.id;
        if (cell) move([[r.id, +cell.dataset.l, +cell.dataset.i]], true);
        else render();
      }
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', function () { start = null; b.classList.remove('is-dragging'); b.style.transform = ''; });
    });

    function select(id) { selected = selected === id ? null : id; render(); }
    function move(changes, noAnim) {
      const before = {};
      Object.keys(tokens).forEach(function (id) { before[id] = tokens[id].getBoundingClientRect(); });
      changes.forEach(function (c) { pos[c[0]] = { L: c[1], I: c[2] }; });
      render();
      if (!reduced() && !noAnim && typeof Element.prototype.animate === 'function') {
        Object.keys(tokens).forEach(function (id) {
          const a = before[id], b = tokens[id].getBoundingClientRect();
          const dx = a.left - b.left, dy = a.top - b.top;
          if (Math.abs(dx) + Math.abs(dy) < 1) return;
          tokens[id].animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' });
        });
      }
      if (changes.length === 1) {
        const r = D.risks.find(function (x) { return x.id === changes[0][0]; });
        live.textContent = r.short + ' moved to likelihood ' + LEVEL[changes[0][1]] + ', impact ' + LEVEL[changes[0][2]] + ': exposure ' + changes[0][1] * changes[0][2] + '.';
      }
    }
    function render() {
      Object.keys(cells).forEach(function (k) { cells[k].querySelector('.m12-cell-tokens').textContent = ''; });
      D.risks.forEach(function (r) {
        const p = pos[r.id], b = tokens[r.id], e = p.L * p.I;
        b.querySelector('.m12-token-score').textContent = String(e);
        b.setAttribute('aria-pressed', selected === r.id ? 'true' : 'false');
        descs[r.id].textContent = 'Likelihood ' + LEVEL[p.L] + ', impact ' + LEVEL[p.I] + ', exposure ' + e + '. Arrow keys move it: up and down change likelihood, left and right change impact.';
        b.className = 'm12-token ' + exposureClass(e);
        cells[p.L + '-' + p.I].querySelector('.m12-cell-tokens').appendChild(b);
      });
      const now = D.risks.reduce(function (a, r) { return a + pos[r.id].L * pos[r.id].I; }, 0);
      const reg = D.risks.reduce(function (a, r) { return a + r.score; }, 0);
      const top = D.risks.reduce(function (a, r) { const e = pos[r.id].L * pos[r.id].I; return e > a.e ? { e: e, n: r.short } : a; }, { e: 0, n: '' });
      set([String(now), String(reg), top.e + ' (' + top.n + ')']);
      list.textContent = '';
      D.risks.slice().sort(function (a, b) { return pos[b.id].L * pos[b.id].I - pos[a.id].L * pos[a.id].I; }).forEach(function (r) {
        const p = pos[r.id], e = p.L * p.I;
        const res = r.residual;
        const li = el('li', { class: selected === r.id ? 'is-selected' : null },
          el('p', { class: 'm12-rl-head' }, el('strong', null, r.short), ' ', el('span', { class: 'm12-exp ' + exposureClass(e) }, LEVEL1[p.L] + '×' + LEVEL1[p.I] + ' = ' + e),
            e !== r.score ? el('span', { class: 'muted' }, ' (register ' + LEVEL1[r.L] + '×' + LEVEL1[r.I] + ' = ' + r.score + ')') : null),
          el('p', { class: 'm12-rl-mit' }, r.mitigation),
          el('p', { class: 'm12-rl-feat' }, r.feature + ' · ', modLink(r.module), ' · illustrative residual ' + LEVEL1[res.L] + '×' + LEVEL1[res.I] + ' = ' + res.score, ' ', ui.tag('illustrative')));
        list.appendChild(li);
      });
      applyBtn.textContent = '';
      applyBtn.appendChild(ui.icon(mitigated ? 'reset' : 'play'));
      applyBtn.appendChild(el('span', { class: 'btn-label' }, mitigated ? 'Show the register before mitigation' : 'Apply mitigations'));
    }
    applyBtn.addEventListener('click', function () {
      mitigated = !mitigated;
      move(D.risks.map(function (r) { return mitigated ? [r.id, r.residual.L, r.residual.I] : [r.id, r.L, r.I]; }));
      const tot = D.risks.reduce(function (a, r) { return a + (mitigated ? r.residual.score : r.score); }, 0);
      live.textContent = mitigated ? 'Mitigations applied: total exposure ' + tot + '.' : 'Register restored: total exposure ' + tot + '.';
    });
    resetBtn.addEventListener('click', function () { mitigated = false; selected = null; move(D.risks.map(function (r) { return [r.id, r.L, r.I]; })); });
    render();
  }

  /* ================================================================ W12.2 critical path and PERT */

  function erf(x) {   // Abramowitz and Stegun 7.1.26 (|error| < 1.5e-7)
    const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  /** CPM over tasks [{id, deps, te}] in topological order. */
  function cpm(tasks) {
    const by = {};
    tasks.forEach(function (t) { by[t.id] = t; t.succ = []; });
    tasks.forEach(function (t) { t.deps.forEach(function (d) { by[d].succ.push(t.id); }); });
    tasks.forEach(function (t) { t.ES = t.deps.reduce(function (a, d) { return Math.max(a, by[d].EF); }, 0); t.EF = t.ES + t.te; });
    const end = tasks.reduce(function (a, t) { return Math.max(a, t.EF); }, 0);
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      t.LF = t.succ.length ? t.succ.reduce(function (a, s) { return Math.min(a, by[s].LS); }, Infinity) : end;
      t.LS = t.LF - t.te;
      t.float = t.LS - t.ES;
      t.crit = Math.abs(t.float) < 1e-9;
    }
    return { end: end, by: by };
  }

  function buildCpm() {
    const w = parts('w-cpm');
    const BASE = [
      { id: 'REQ', name: 'Requirements', deps: [], o: 1, m: 1, p: 2, lv: 0, row: 1.5 },
      { id: 'DYN', name: 'Dynamics model', deps: ['REQ'], o: 1, m: 1, p: 2, lv: 1, row: 1.5 },
      { id: 'CTL', name: 'Controllers', deps: ['DYN'], o: 1, m: 1, p: 2, lv: 2, row: 1.5 },
      { id: 'SM', name: 'Safe-mode logic', deps: ['CTL'], o: 1, m: 1, p: 2, lv: 3, row: 0 },
      { id: 'UI', name: 'Interface and animation', deps: ['CTL'], o: 1, m: 2, p: 3, lv: 3, row: 1 },
      { id: 'MIR', name: 'Python mirror', deps: ['CTL'], o: 1, m: 2, p: 3, lv: 3, row: 2 },
      { id: 'STUB', name: 'C++ stub', deps: ['CTL'], o: 1, m: 2, p: 3, lv: 3, row: 3 },
      { id: 'VER', name: 'Verification', deps: ['SM'], o: 1, m: 1, p: 2, lv: 4, row: 0 },
      { id: 'REP', name: 'Results and report', deps: ['VER', 'UI', 'MIR', 'STUB'], o: 1, m: 1, p: 2, lv: 5, row: 1.5 }
    ];
    const SHORT = { REQ: 'Requirements', DYN: 'Dynamics', CTL: 'Controllers', SM: 'Safe mode', UI: 'Interface', MIR: 'Py mirror', STUB: 'C++ stub', VER: 'Verification', REP: 'Report' };
    const inputs = [];
    const tb = el('tbody');
    BASE.forEach(function (t, i) {
      const tr = el('tr', null, el('th', { scope: 'row' }, t.name));
      ['o', 'm', 'p'].forEach(function (k) {
        const inp = el('input', { type: 'number', min: '0.5', max: '20', step: '0.5', value: String(t[k]), inputmode: 'decimal', 'aria-label': t.name + ' ' + { o: 'optimistic', m: 'most likely', p: 'pessimistic' }[k] + ' duration (iterations)' });
        inp.dataset.i = String(i); inp.dataset.k = k;
        inputs.push(inp);
        tr.appendChild(el('td', null, inp));
      });
      tb.appendChild(tr);
    });
    const est = el('div', { class: 'scroll-x m12-wide', tabindex: '0', role: 'region', 'aria-label': 'Duration estimates' },
      el('table', { class: 'table compact m12-est' }, el('caption', null, 'Estimates in iterations (edit any cell)'),
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Work package'), el('th', { scope: 'col' }, 'o'), el('th', { scope: 'col' }, 'm'), el('th', { scope: 'col' }, 'p'))), tb));
    const errBox = el('p', { class: 'field-error m12-wide', 'aria-live': 'polite' });
    const plus = ui.toggle({ id: 'w122-plus', label: 'Verification takes +2 iterations', checked: false });
    const target = ui.slider({ id: 'w122-target', label: 'Deadline for the probability readout', min: 4, max: 16, step: 0.5, value: 8, unit: 'iterations' });
    const reset = ui.button({ label: 'Reset estimates', kind: 'ghost', icon: 'reset', small: true });
    w.controls.appendChild(est); w.controls.appendChild(errBox);
    w.controls.appendChild(plus.el); w.controls.appendChild(target.el);
    w.controls.appendChild(el('div', { class: 'btn-row' }, reset));
    const set = readouts(w.out, ['Expected duration', 'σ on the critical path', 'P(done by the deadline)', 'Slip vs the baseline', 'Critical path']);
    const dagBox = el('div', { class: 'm12-dag' });
    w.out.appendChild(dagBox);
    w.out.appendChild(el('p', { class: 'm12-small m12-dag-key' },
      el('span', { class: 'm12-key-crit', 'aria-hidden': 'true' }), ' critical (zero float, solid thick outline)   ',
      el('span', { class: 'm12-key-free', 'aria-hidden': 'true' }), ' has float (dashed outline)'));
    const tblBox = el('div');
    w.out.appendChild(tblBox);
    let last = null, baseline = null;

    function read() {
      const tasks = BASE.map(function (t) { return { id: t.id, name: t.name, deps: t.deps.slice(), o: t.o, m: t.m, p: t.p, lv: t.lv, row: t.row }; });
      let bad = null;
      inputs.forEach(function (inp) {
        const v = parseFloat(inp.value), ok = isFinite(v) && v >= 0.5 && v <= 20;
        inp.toggleAttribute('aria-invalid', !ok);
        if (ok) tasks[+inp.dataset.i][inp.dataset.k] = v; else if (!bad) bad = 'Every estimate must be between 0.5 and 20 iterations.';
      });
      tasks.forEach(function (t) { if (!bad && !(t.o <= t.m && t.m <= t.p)) bad = t.name + ': the estimates must satisfy o ≤ m ≤ p.'; });
      if (bad) throw new RangeError(bad);
      return tasks;
    }
    function compute(tasks, extra) {
      tasks.forEach(function (t) {
        const add = extra && t.id === 'VER' ? 2 : 0;
        t.te = (t.o + 4 * t.m + t.p) / 6 + add;
        t.sd = (t.p - t.o) / 6;
      });
      const r = cpm(tasks);
      // the critical path: walk from the start through critical tasks
      const path = [];
      let cur = tasks.find(function (t) { return t.crit && !t.deps.length; });
      while (cur) {
        path.push(cur);
        const nx = cur.succ.map(function (s) { return r.by[s]; }).filter(function (s) { return s.crit && Math.abs(s.ES - cur.EF) < 1e-9; });
        cur = nx[0] || null;
      }
      const sd = Math.sqrt(path.reduce(function (a, t) { return a + t.sd * t.sd; }, 0));
      return { tasks: tasks, end: r.end, path: path, sd: sd };
    }
    function update() {
      errBox.textContent = '';
      let tasks;
      try { tasks = read(); } catch (err) { if (err instanceof RangeError) { errBox.textContent = err.message; return; } throw err; }
      const res = compute(tasks, plus.value);
      baseline = compute(read(), false);
      last = res;
      const z = res.sd > 0 ? (target.value - res.end) / res.sd : (target.value >= res.end ? Infinity : -Infinity);
      const prob = isFinite(z) ? Phi(z) : (z > 0 ? 1 : 0);
      const slip = res.end - baseline.end;
      set([f(res.end, { fixed: 2 }) + ' iterations', f(res.sd, { fixed: 2 }), f(100 * prob, { fixed: 0, unit: '%' }) + ' by ' + f(target.value, { sig: 3 }),
        plus.value ? '+' + f(slip, { fixed: 2 }) + ' iterations' : 'none (baseline)', res.path.map(function (t) { return SHORT[t.id]; }).join(' → ')]);
      drawDag();
      tblBox.textContent = '';
      // the critical flag comes second so it stays in view when a phone scrolls the table sideways
      tblBox.appendChild(ui.table([{ key: 'n', label: 'Work package' }, { key: 'c', label: 'Critical' }, { key: 'te', label: 'tₑ', num: true }, { key: 's', label: 'σ', num: true }, { key: 'es', label: 'ES', num: true }, { key: 'ef', label: 'EF', num: true },
        { key: 'ls', label: 'LS', num: true }, { key: 'lf', label: 'LF', num: true }, { key: 'fl', label: 'Float', num: true }],
      res.tasks.map(function (t) {
        return [t.name, t.crit ? ui.badge('fail', 'critical') : ui.badge('pass', 'float'), f(t.te, { fixed: 2 }), f(t.sd, { fixed: 2 }), f(t.ES, { fixed: 2 }), f(t.EF, { fixed: 2 }), f(t.LS, { fixed: 2 }), f(t.LF, { fixed: 2 }), f(Math.max(0, t.float), { fixed: 2 })];
      }), { caption: 'Forward and backward passes (iterations)', rowHeaders: true, compact: true }));
    }
    function drawDag() {
      if (!last) return;
      const vertical = (dagBox.clientWidth || 600) < 560;
      const NW = vertical ? 76 : 116, NH = vertical ? 50 : 62;
      const GX = vertical ? 82 : 136, GY = vertical ? 84 : 76;
      const W = vertical ? 4 * GX + 8 : 6 * GX + 8, H = vertical ? 6 * GY + 8 : 4 * GY + 8;
      const P = function (t) {
        const a = vertical ? { x: 4 + t.row * GX + (GX - NW) / 2, y: 4 + t.lv * GY + (GY - NH) / 2 } : { x: 4 + t.lv * GX + (GX - NW) / 2, y: 4 + t.row * GY + (GY - NH) / 2 };
        return a;
      };
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'm12-dag-svg' + (vertical ? ' is-vertical' : ''), role: 'img', 'aria-label': 'Task network. Critical path: ' + last.path.map(function (t) { return t.name; }).join(', then ') + '.' });
      s.appendChild(svg('defs', null, svg('marker', { id: 'm12-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0L10 5L0 10z', class: 'm12-arrowhead' }))));
      const by = {};
      last.tasks.forEach(function (t) { by[t.id] = t; });
      last.tasks.forEach(function (t) {
        t.deps.forEach(function (d) {
          const a = P(by[d]), b = P(t);
          const crit = by[d].crit && t.crit && Math.abs(t.ES - by[d].EF) < 1e-9;
          const x1 = vertical ? a.x + NW / 2 : a.x + NW, y1 = vertical ? a.y + NH : a.y + NH / 2;
          const x2 = vertical ? b.x + NW / 2 : b.x, y2 = vertical ? b.y : b.y + NH / 2;
          s.appendChild(svg('line', { x1: x1, y1: y1, x2: x2, y2: y2, class: 'm12-edge' + (crit ? ' crit' : ''), 'marker-end': 'url(#m12-arrow)' }));
        });
      });
      last.tasks.forEach(function (t) {
        const a = P(t);
        const g = svg('g', { class: 'm12-node' + (t.crit ? ' crit' : '') });
        g.appendChild(svg('rect', { x: a.x, y: a.y, width: NW, height: NH, rx: 8 }));
        g.appendChild(svg('text', { x: a.x + NW / 2, y: a.y + 19, class: 'm12-node-name' }, vertical ? SHORT[t.id] : t.name.length > 16 ? SHORT[t.id] : t.name));
        g.appendChild(svg('text', { x: a.x + NW / 2, y: a.y + 36, class: 'm12-node-val' }, 'te ' + f(t.te, { fixed: 2 })));
        if (!vertical) g.appendChild(svg('text', { x: a.x + NW / 2, y: a.y + 52, class: 'm12-node-val' }, 'float ' + f(Math.max(0, t.float), { fixed: 2 })));
        s.appendChild(g);
      });
      dagBox.textContent = '';
      dagBox.appendChild(s);
    }
    inputs.forEach(function (inp) { inp.addEventListener('input', ui.debounce(update, 200)); inp.addEventListener('change', update); });
    plus.on('change', update);
    target.on('change', update);
    reset.addEventListener('click', function () { inputs.forEach(function (inp) { inp.value = String(BASE[+inp.dataset.i][inp.dataset.k]); inp.removeAttribute('aria-invalid'); }); update(); });
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = 0;
      new ResizeObserver(function () { const cw = dagBox.clientWidth; if (Math.abs(cw - lastW) > 2) { lastW = cw; drawDag(); } }).observe(dagBox);
    }
    update();
  }

  /* ================================================================ W12.3 FMEA */

  function buildFmea() {
    const w = parts('w-fmea');
    const BASE = [
      { id: 'bias', name: 'Gyro bias', ext: true, S: 5, O: 6, D: 9, effect: 'The rate the controller sees drifts from the true rate; pointing error grows slowly.',
        detect: [['Not tested: the project feeds back the true state', null], ['estimation extension', 'm07-sensors.html']] },
      { id: 'wheel', name: 'Stuck reaction wheel', ext: true, S: 9, O: 2, D: 8, effect: 'One axis loses its control torque; the craft can tumble about it.',
        detect: [['Not tested: the actuator is an ideal torque box', null], ['hardware notes', 'm06-actuators.html#hardware']] },
      { id: 'repro', name: 'Irreproducible results', S: 6, O: 3, D: 5, effect: 'Published evidence cannot be regenerated or checked.',
        detect: [['Re-run with seed 42 and compare the CSV files', null], ['Monte Carlo, seed 42', 'sim:mc=60,42']] },
      { id: 'flap', name: 'Mode flapping', S: 7, O: 4, D: 3, effect: 'Repeated mode switches; detumble never completes cleanly.',
        detect: [['T03 transition log', 'sim:preset=T03'], ['Monte Carlo entry count', 'm09-verification.html']] },
      { id: 'gain', name: 'Excessive gain', S: 8, O: 3, D: 3, effect: 'Oscillation or instability; rates can approach the 15 deg/s limit.',
        detect: [['T01 and T02 settling', 'sim:preset=T02'], ['T05 peak rate across all runs', 'm09-verification.html']] },
      { id: 'sign', name: 'Quaternion sign ambiguity', S: 6, O: 4, D: 2, effect: 'A large apparent error; the controller takes the long way round.',
        detect: [['T01 and T02 final error', 'sim:preset=T01'], ['shortest-rotation error', 'm03-dynamics.html']] },
      { id: 'toolbox', name: 'LQR toolbox missing', S: 4, O: 5, D: 1, effect: 'The LQR design step cannot run on that machine.',
        detect: [['Any run without the toolbox (it fails at once)', null], ['stored fallback gain', 'm10-software.html#reproducibility']] }
    ];
    let rows = BASE.map(function (r) { return Object.assign({}, r); });
    const pick = ui.select({ id: 'w123-pick', label: 'Failure mode to score', value: 'bias', options: rows.map(function (r) { return { value: r.id, label: r.name + (r.ext ? ' (extension)' : '') }; }) });
    const sS = ui.slider({ id: 'w123-s', label: 'Severity S', min: 1, max: 10, step: 1, value: 5, tag: 'illustrative' });
    const sO = ui.slider({ id: 'w123-o', label: 'Occurrence O', min: 1, max: 10, step: 1, value: 6, tag: 'illustrative' });
    const sD = ui.slider({ id: 'w123-d', label: 'Detection D (10 = never caught)', min: 1, max: 10, step: 1, value: 9, tag: 'illustrative' });
    const reset = ui.button({ label: 'Reset all scores', kind: 'ghost', icon: 'reset', small: true });
    [pick, sS, sO, sD].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'btn-row' }, reset));
    const effect = el('p', { class: 'status-line m12-effect', 'aria-live': 'polite' });
    w.out.appendChild(effect);
    const barBox = el('div');
    w.out.appendChild(barBox);
    const bars = A.plot.bars(barBox, { title: 'Risk priority numbers, highest first', xLabel: 'RPN = S × O × D', items: [] });
    const tbl = el('div');
    w.out.appendChild(tbl);
    function cur() { return rows.find(function (r) { return r.id === pick.value; }); }
    function syncSliders() { const r = cur(); sS.set(r.S); sO.set(r.O); sD.set(r.D); }
    function detectCell(r) {
      const span = el('span', { class: 'm12-detect' });
      r.detect.forEach(function (d, i) {
        if (i) span.appendChild(document.createTextNode('; '));
        if (!d[1]) span.appendChild(document.createTextNode(d[0]));
        else if (d[1].indexOf('sim:') === 0) span.appendChild(ui.simLink(d[0], d[1].slice(4)));
        else span.appendChild(el('a', { href: d[1] }, d[0]));
      });
      return span;
    }
    function update() {
      const ranked = rows.slice().sort(function (a, b) { return b.S * b.O * b.D - a.S * a.O * a.D || b.S - a.S; });
      bars.set({ items: ranked.map(function (r) { const rpn = r.S * r.O * r.D; return { label: r.name, value: rpn, text: String(rpn), color: r.id === pick.value ? '--accent' : (r.ext ? '--ext' : '--axis-z') }; }) });
      const c = cur();
      effect.textContent = c.name + ': S ' + c.S + ' × O ' + c.O + ' × D ' + c.D + ' = RPN ' + c.S * c.O * c.D + ', rank ' + (ranked.indexOf(c) + 1) + ' of ' + rows.length + '. Effect: ' + c.effect;
      tbl.textContent = '';
      tbl.appendChild(ui.table([{ key: 'k', label: 'Rank', num: true }, { key: 'n', label: 'Failure mode' }, { key: 's', label: 'S', num: true }, { key: 'o', label: 'O', num: true }, { key: 'd', label: 'D', num: true }, { key: 'r', label: 'RPN', num: true }, { key: 'x', label: 'Detected by' }],
        ranked.map(function (r, i) {
          return [String(i + 1), el('span', null, r.name, r.ext ? ' ' : '', r.ext ? ui.tag('extension') : null), String(r.S), String(r.O), String(r.D), el('strong', null, String(r.S * r.O * r.D)), detectCell(r)];
        }), { caption: 'FMEA ranked by RPN (scores illustrative)', compact: true }));
      const trs = ui.qsa('tbody tr', tbl);
      ranked.forEach(function (r, i) { if (r.id === pick.value && trs[i]) trs[i].classList.add('is-selected'); });
    }
    pick.on('change', function () { syncSliders(); update(); });
    sS.on('change', function (v) { cur().S = v; update(); });
    sO.on('change', function (v) { cur().O = v; update(); });
    sD.on('change', function (v) { cur().D = v; update(); });
    reset.addEventListener('click', function () { rows = BASE.map(function (r) { return Object.assign({}, r); }); syncSliders(); update(); });
    syncSliders();
    update();
  }

  /* ================================================================ W12.4 bow-tie (stretch) */

  function buildBowtie() {
    const w = parts('w-bowtie');
    const BARRIERS = [
      // `short` labels the bar in the wide diagram, `tiny` in the phone layout
      { id: 'tune', side: 'pre', label: 'Conservative tuning', module: 'm05', on: true },
      { id: 'sat', side: 'pre', label: 'Saturation in every simulation', short: 'Saturation in every run', tiny: 'Saturation in sims', module: 'm06', on: true },
      { id: 'short', side: 'pre', label: 'Shortest-rotation error', tiny: 'Shortest rotation', module: 'm03', on: true },
      { id: 'est', side: 'pre', label: 'Sensor filtering and checks', short: 'Sensor checks', module: 'm07', on: false, ext: true },
      { id: 'entry', side: 'rec', label: 'Safe-mode entry (6 deg/s or 0.5 s fault)', module: 'm08', on: true },
      { id: 'det', side: 'rec', label: 'Detumble', module: 'm05', on: true },
      { id: 'hold', side: 'rec', label: 'Hold', module: 'm08', on: true }
    ];
    const THREATS = [
      { label: 'Excessive gain', barrier: 'tune' },
      { label: 'Torque saturation', barrier: 'sat' },
      { label: 'Quaternion sign flips', barrier: 'short' },
      { label: 'Sensor faults (extension)', barrier: 'est' }
    ];
    const CONS = [
      { label: 'Tumbling spacecraft', chain: ['entry', 'det'] },
      { label: 'Power-negative attitude', chain: ['entry', 'det', 'hold'] },
      { label: 'Lost communications', chain: ['entry', 'det', 'hold'] }
    ];
    const toggles = {};
    const pre = el('fieldset', { class: 'm12-bt-set' }, el('legend', null, 'Preventive barriers'));
    const rec = el('fieldset', { class: 'm12-bt-set' }, el('legend', null, 'Recovery barriers'));
    BARRIERS.forEach(function (b) {
      const t = ui.toggle({ id: 'w124-' + b.id, label: b.label, checked: b.on });
      toggles[b.id] = t;
      const row = el('div', { class: 'm12-bt-row' }, t.el,
        el('span', { class: 'm12-small m12-bt-meta' }, ui.tag(b.ext ? 'extension' : 'project'), ' Module ', modLink(b.module, String(D.module(b.module).num).padStart(2, '0'))));
      (b.side === 'pre' ? pre : rec).appendChild(row);
    });
    w.controls.appendChild(pre); w.controls.appendChild(rec);
    const summary = el('p', { class: 'status-line m12-bt-sum', 'aria-live': 'polite' });
    w.out.appendChild(summary);
    const box = el('div', { class: 'scroll-x m12-bt-wrap', tabindex: '0', role: 'region', 'aria-label': 'Bow-tie diagram' });
    w.out.appendChild(box);
    const listBox = el('div');
    w.out.appendChild(listBox);
    function on(id) { return toggles[id].value; }
    function barrier(id) { return BARRIERS.find(function (x) { return x.id === id; }); }
    // The state sits on a surface-coloured pill, so its colour keeps 4.5:1 on the tinted boxes,
    // and carries a tick or a cross so it does not rely on colour alone.
    function stateLabel(s, x, y, ok, okText, badText) {
      const text = (ok ? '✓ ' : '✗ ') + (ok ? okText : badText);
      const wPill = 12 + text.length * 6.4;
      s.appendChild(svg('rect', { x: x - wPill / 2, y: y - 10, width: wPill, height: 14, rx: 7, class: 'm12-bt-pill ' + (ok ? 'ok' : 'open') }));
      s.appendChild(svg('text', { x: x, y: y + 1, class: 'm12-bt-state ' + (ok ? 'ok' : 'open') }, text));
    }
    function drawWide(s, tStat, cStat) {
      const yT = [50, 120, 190, 260], yC = [80, 165, 250];
      const cx = 430, cy = 155;
      THREATS.forEach(function (t, i) {
        const ok = tStat[i], b = barrier(t.barrier);
        s.appendChild(svg('path', { d: 'M150 ' + yT[i] + ' L 300 ' + yT[i] + ' L ' + (cx - 70) + ' ' + cy, class: 'm12-bt-line ' + (ok ? 'ok' : 'open') }));
        s.appendChild(svg('rect', { x: 6, y: yT[i] - 24, width: 144, height: 48, rx: 6, class: 'm12-bt-threat' }));
        s.appendChild(svg('text', { x: 78, y: yT[i] - 3, class: 'm12-bt-txt' }, t.label));
        stateLabel(s, 78, yT[i] + 13, ok, 'blocked', 'open path');
        s.appendChild(svg('rect', { x: 214, y: yT[i] - 16, width: 12, height: 32, class: 'm12-bt-bar ' + (on(b.id) ? 'on' : 'off') }));
        s.appendChild(svg('text', { x: 220, y: yT[i] - 21, class: 'm12-bt-blab' }, b.short || b.label));
      });
      CONS.forEach(function (c, j) {
        const ok = cStat[j];
        s.appendChild(svg('path', { d: 'M' + (cx + 70) + ' ' + cy + ' L 520 ' + yC[j] + ' L 712 ' + yC[j], class: 'm12-bt-line ' + (ok ? 'ok' : 'open') }));
        s.appendChild(svg('rect', { x: 712, y: yC[j] - 24, width: 142, height: 48, rx: 6, class: 'm12-bt-cons' }));
        s.appendChild(svg('text', { x: 783, y: yC[j] - 3, class: 'm12-bt-txt' }, c.label));
        stateLabel(s, 783, yC[j] + 13, ok, 'protected', 'exposed');
      });
      // recovery barrier bars crossing the consequence lines
      [['entry', 560, [0, 1, 2]], ['det', 615, [0, 1, 2]], ['hold', 670, [1, 2]]].forEach(function (b) {
        b[2].forEach(function (j) { s.appendChild(svg('rect', { x: b[1] - 6, y: yC[j] - 16, width: 12, height: 32, class: 'm12-bt-bar ' + (on(b[0]) ? 'on' : 'off') })); });
      });
      s.appendChild(svg('text', { x: 560, y: 30, class: 'm12-bt-blab' }, 'Entry'));
      s.appendChild(svg('text', { x: 615, y: 30, class: 'm12-bt-blab' }, 'Detumble'));
      s.appendChild(svg('text', { x: 670, y: 30, class: 'm12-bt-blab' }, 'Hold'));
      // top event
      s.appendChild(svg('circle', { cx: cx, cy: cy, r: 70, class: 'm12-bt-top' }));
      s.appendChild(svg('text', { x: cx, y: cy - 6, class: 'm12-bt-toptxt' }, 'Loss of'));
      s.appendChild(svg('text', { x: cx, y: cy + 12, class: 'm12-bt-toptxt' }, 'attitude control'));
      s.appendChild(svg('text', { x: 78, y: 16, class: 'm12-bt-head' }, 'Threats'));
      s.appendChild(svg('text', { x: 783, y: 46, class: 'm12-bt-head' }, 'Consequences'));
    }
    // Phone layout: the bow-tie turned on its side. Threat rows sit above the top event and
    // consequence rows below it. Every path has its own lane, ordered so no two paths cross or
    // share a line, which keeps each path's colour and dash readable.
    function drawCompact(s, tStat, cStat) {
      const yT = [50, 110, 170, 230], laneT = [296, 288, 280, 272], topY = 298;
      const enterT = [topY + 12, topY + 4, topY - 4, topY - 12];
      const yC = [392, 452, 512], laneC = [22, 14, 6], leaveC = [topY + 10, topY, topY - 10];
      s.appendChild(svg('text', { x: 84, y: 16, class: 'm12-bt-head' }, 'Threats'));
      THREATS.forEach(function (t, i) {
        const ok = tStat[i], b = barrier(t.barrier);
        s.appendChild(svg('path', { d: 'M162 ' + yT[i] + ' H ' + laneT[i] + ' V ' + enterT[i] + ' H 262', class: 'm12-bt-line ' + (ok ? 'ok' : 'open') }));
        s.appendChild(svg('rect', { x: 6, y: yT[i] - 24, width: 156, height: 48, rx: 6, class: 'm12-bt-threat' }));
        s.appendChild(svg('text', { x: 84, y: yT[i] - 3, class: 'm12-bt-txt' }, t.label));
        stateLabel(s, 84, yT[i] + 13, ok, 'blocked', 'open path');
        s.appendChild(svg('rect', { x: 216, y: yT[i] - 16, width: 12, height: 32, class: 'm12-bt-bar ' + (on(b.id) ? 'on' : 'off') }));
        s.appendChild(svg('text', { x: 222, y: yT[i] - 21, class: 'm12-bt-blab' }, b.tiny || b.short || b.label));
      });
      s.appendChild(svg('rect', { x: 30, y: topY - 22, width: 232, height: 44, rx: 22, class: 'm12-bt-top' }));
      s.appendChild(svg('text', { x: 146, y: topY + 5, class: 'm12-bt-toptxt' }, 'Loss of attitude control'));
      const xb = { entry: 52, det: 88, hold: 122 };
      s.appendChild(svg('text', { x: xb.entry, y: yC[0] - 30, class: 'm12-bt-blab' }, 'Entry'));
      s.appendChild(svg('text', { x: xb.det, y: yC[0] - 42, class: 'm12-bt-blab' }, 'Detumble'));
      s.appendChild(svg('text', { x: xb.hold, y: yC[0] - 30, class: 'm12-bt-blab' }, 'Hold'));
      s.appendChild(svg('text', { x: 216, y: yC[0] - 32, class: 'm12-bt-head' }, 'Consequences'));
      CONS.forEach(function (c, j) {
        const ok = cStat[j];
        s.appendChild(svg('path', { d: 'M30 ' + leaveC[j] + ' H ' + laneC[j] + ' V ' + yC[j] + ' H 138', class: 'm12-bt-line ' + (ok ? 'ok' : 'open') }));
        c.chain.forEach(function (id) { s.appendChild(svg('rect', { x: xb[id] - 6, y: yC[j] - 16, width: 12, height: 32, class: 'm12-bt-bar ' + (on(id) ? 'on' : 'off') })); });
        s.appendChild(svg('rect', { x: 138, y: yC[j] - 24, width: 156, height: 48, rx: 6, class: 'm12-bt-cons' }));
        s.appendChild(svg('text', { x: 216, y: yC[j] - 3, class: 'm12-bt-txt' }, c.label));
        stateLabel(s, 216, yC[j] + 13, ok, 'protected', 'exposed');
      });
    }
    let compact = false;
    function update() {
      compact = (box.clientWidth || 700) < 560;
      const W = compact ? 300 : 860, H = compact ? 546 : 330;
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'm12-bt' + (compact ? ' is-compact' : ''), role: 'img' });
      const tStat = THREATS.map(function (t) { return on(t.barrier); });
      const cStat = CONS.map(function (c) { return c.chain.every(on); });
      if (compact) drawCompact(s, tStat, cStat); else drawWide(s, tStat, cStat);
      const nT = tStat.filter(Boolean).length, nC = cStat.filter(Boolean).length;
      s.setAttribute('aria-label', 'Bow-tie: ' + nT + ' of 4 threat lines blocked, ' + nC + ' of 3 consequences protected.');
      box.textContent = '';
      box.appendChild(s);
      summary.textContent = nT + ' of ' + THREATS.length + ' threats blocked before the top event; ' + nC + ' of ' + CONS.length + ' consequences protected after it.';
      listBox.textContent = '';
      // the status comes second so it stays in view when a phone scrolls the table sideways
      listBox.appendChild(ui.table([{ key: 'p', label: 'Path' }, { key: 's', label: 'Status' }, { key: 'b', label: 'Barriers on the path' }],
        THREATS.map(function (t, i) { const b = barrier(t.barrier); return [t.label + ' → top event', ui.badge(tStat[i] ? 'pass' : 'fail', tStat[i] ? 'blocked' : 'open'), b.label]; })
          .concat(CONS.map(function (c, j) { return ['Top event → ' + c.label.toLowerCase(), ui.badge(cStat[j] ? 'pass' : 'fail', cStat[j] ? 'protected' : 'exposed'), c.chain.map(function (id) { return barrier(id).label.replace(/ \(.*\)$/, ''); }).join(', then ')]; })),
        { caption: 'Every path and its barriers', rowHeaders: true, compact: true }));
    }
    Object.keys(toggles).forEach(function (k) { toggles[k].on('change', update); });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function () { if (((box.clientWidth || 700) < 560) !== compact) update(); }).observe(box);
    }
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
    ui.mountChrome({ page: 'm12' });
    buildTables();
    buildRiskMatrix();
    buildCpm();
    buildFmea();
    buildBowtie();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'Mode flapping was mitigated by…',
        options: ['a fixed random seed.', 'hysteresis thresholds and minimum dwell times.', 'storing the LQR gain.'], correct: 1,
        explain: 'The register’s mitigation for flapping is “use hysteresis thresholds and minimum dwell times”: enter detumble above 6 deg/s, leave only after 2 s below 0.5 deg/s, and wait 8 s before returning to NOMINAL. The seed and the stored gain mitigate other risks.' },
      { q: 'Exposure for a High-likelihood, Medium-impact risk on a 1–3 scale is…',
        options: ['5.', '9.', '6.'], correct: 2,
        explain: 'High is 3 and Medium is 2, and exposure is the product: 3 × 2 = 6. That is torque saturation in the project’s register.' },
      { q: 'Leaving estimation out of the first scope was…',
        options: ['a reversible scope decision that became a planned extension.', 'an oversight.', 'a requirement.'], correct: 0,
        explain: 'Iteration 1 recorded the decision on purpose: “keep estimator/noise model out of first project scope”. It is cheap to reverse because the controller only needs a state, so it became the extension in module 07.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm12');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    recheckScrollable();
  });
})();
