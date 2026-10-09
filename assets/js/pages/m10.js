/**
 * m10.js: Module 10, software engineering and embedded code (package P6).
 * Widgets: W10.1 deadline budget (discrete-event scheduler), W10.2 torn quaternion,
 * W10.3 property tests against the real helpers and broken copies, W10.4 gain-matrix porting bug,
 * W10.5 mode-sequence diff (stretch).
 * Project numbers come from ADCS.params / ADCS.presets; the task set and attitudes used by the
 * scheduler and race widgets are illustrative and tagged so on the page.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const R2D = A.units.R2D, D2R = A.units.D2R;
  const DEF = A.params.DEFAULTS;
  const TAU_MAX = DEF.tauMax;
  const MODE_SHORT = A.modes.SHORT;
  const MODE_NAMES = A.modes.NAMES;

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
  function field(label, control) { return el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), control); }

  /**
   * A responsive canvas that redraws on resize and theme change.
   * draw(ctx, width, height, colour) is called with CSS-pixel sizes; colour('--token') reads the theme.
   */
  function canvasView(container, o) {
    const canvas = el('canvas', { class: 'm10-canvas', role: 'img', tabindex: '0', 'aria-label': o.label || '' });
    const wrap = el('div', { class: 'm10-canvas-wrap' }, canvas);
    container.appendChild(wrap);
    let w = 0, h = 0, raf = 0;
    const api = { canvas: canvas, el: wrap, draw: o.draw, height: o.height };
    function colour(name) { return getComputedStyle(canvas).getPropertyValue(name).trim() || '#808080'; }
    function render() {
      raf = 0;
      const cw = Math.max(200, Math.floor(wrap.clientWidth || 300));
      const ch = typeof api.height === 'function' ? api.height(cw) : api.height;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (cw !== w || ch !== h || canvas.width !== Math.round(cw * dpr)) {
        w = cw; h = ch;
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
        canvas.style.width = '100%'; canvas.style.height = ch + 'px';
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      api.draw(ctx, w, h, colour);
    }
    api.render = function () { if (!raf) raf = requestAnimationFrame(render); };
    api.renderNow = render;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { api.render(); }).observe(wrap);
    else window.addEventListener('resize', api.render);
    window.addEventListener('adcs:themechange', api.render);
    render();
    return api;
  }

  /* ================================================================ W10.1 deadline budget */

  /**
   * Discrete-event scheduler for one processor.
   * tasks [{name, period, wcet, prio}] in ms (prio 1 = highest); deadlines equal periods.
   * opt {policy:'fcfs'|'rr'|'fp'|'rm', quantum, horizon, gc:{t,len}|null, pf:{t,extra,task}|null, cold:1|2}.
   * A late job keeps running until it finishes. A GC pause stops the whole processor.
   * @returns {{jobs:Object[], slices:{task:number, job:Object|null, t0:number, t1:number}[], prio:number[]}}
   */
  function schedule(tasks, opt) {
    const H = opt.horizon, Q = opt.quantum || 10, cold = opt.cold || 1, EPS = 1e-9;
    const prio = tasks.map(function (t) { return t.prio; });
    if (opt.policy === 'rm') {
      tasks.map(function (t, i) { return i; })
        .sort(function (a, b) { return tasks[a].period - tasks[b].period || a - b; })
        .forEach(function (ti, r) { prio[ti] = r + 1; });
    }
    const jobs = [];
    tasks.forEach(function (t, ti) {
      for (let r = 0; r < H - EPS; r += t.period) {
        const c = t.wcet * cold;
        jobs.push({ task: ti, release: r, deadline: r + t.period, rem: c, c: c, done: null, missed: false, pf: false });
      }
    });
    if (opt.pf) {
      const cand = jobs.filter(function (j) { return j.task === opt.pf.task && j.release >= opt.pf.t; })
        .sort(function (a, b) { return a.release - b.release; })[0];
      if (cand) { cand.rem += opt.pf.extra; cand.c += opt.pf.extra; cand.pf = true; }
    }
    jobs.sort(function (a, b) { return a.release - b.release || prio[a.task] - prio[b.task] || a.task - b.task; });
    const slices = [], ready = [], gc = opt.gc;
    const preemptive = opt.policy === 'fp' || opt.policy === 'rm';
    let t = 0, cur = null, qLeft = Q, next = 0, guard = 0;
    function admit(time) { while (next < jobs.length && jobs[next].release <= time + EPS) ready.push(jobs[next++]); }
    function pick() {
      if (!ready.length) return null;
      if (!preemptive) return ready[0];
      let best = ready[0];
      for (let i = 1; i < ready.length; i++) {
        const j = ready[i];
        if (prio[j.task] < prio[best.task] || (prio[j.task] === prio[best.task] && j.release < best.release)) best = j;
      }
      return best;
    }
    function push(task, job, a, b) {
      if (b - a < EPS) return;
      const last = slices[slices.length - 1];
      if (last && last.job === job && last.task === task && Math.abs(last.t1 - a) < EPS) last.t1 = b;
      else slices.push({ task: task, job: job, t0: a, t1: b });
    }
    while (t < H - EPS && guard++ < 200000) {
      admit(t);
      if (gc && t >= gc.t - EPS && t < gc.t + gc.len - EPS) { push(-1, null, t, Math.min(H, gc.t + gc.len)); t = gc.t + gc.len; continue; }
      if (preemptive) cur = pick();
      else if (!cur) { cur = pick(); qLeft = Q; }
      if (!cur) {
        let tn = next < jobs.length ? jobs[next].release : H;
        if (gc && gc.t > t + EPS && gc.t < tn) tn = gc.t;
        t = Math.min(tn, H);
        continue;
      }
      let tEnd = t + cur.rem;
      if (preemptive && next < jobs.length) tEnd = Math.min(tEnd, jobs[next].release);
      if (opt.policy === 'rr') tEnd = Math.min(tEnd, t + qLeft);
      if (gc && gc.t > t + EPS) tEnd = Math.min(tEnd, gc.t);
      tEnd = Math.min(tEnd, H);
      push(cur.task, cur, t, tEnd);
      cur.rem -= tEnd - t;
      if (opt.policy === 'rr') qLeft -= tEnd - t;
      t = tEnd;
      if (cur.rem <= EPS) {
        cur.done = t;
        ready.splice(ready.indexOf(cur), 1);
        cur = null; qLeft = Q;
      } else if (opt.policy === 'rr' && qLeft <= EPS) {
        admit(t);
        ready.splice(ready.indexOf(cur), 1); ready.push(cur);
        cur = null; qLeft = Q;
      }
    }
    jobs.forEach(function (j) {
      if (j.done !== null) j.missed = j.done > j.deadline + EPS;
      else j.missed = j.deadline <= H + EPS;
    });
    return { jobs: jobs, slices: slices, prio: prio };
  }

  function rmBound(n) { return n * (Math.pow(2, 1 / n) - 1); }

  function buildDeadline() {
    const w = parts('w-deadline');
    const TASKS0 = [
      { name: 'Control', period: 100, wcet: 8, prio: 1 },
      { name: 'Estimator', period: 50, wcet: 6, prio: 2 },
      { name: 'Telemetry', period: 1000, wcet: 60, prio: 3 },
      { name: 'Logging', period: 500, wcet: 20, prio: 4 }
    ];
    const COLORS = ['--axis-x', '--axis-y', '--axis-z', '--ext'];
    const GC = { t: 300, len: 40 }, PF = { t: 300, extra: 15, task: 0 };
    let tasks = TASKS0.map(function (t) { return Object.assign({}, t); });

    // Editable task table
    const inputs = [];
    const tbody = el('tbody');
    tasks.forEach(function (t, i) {
      const sw = el('span', { class: 'm10-swatch', style: { '--sw': 'var(' + COLORS[i] + ')' }, 'aria-hidden': 'true' });
      const mk = function (key, min, max, step) {
        const inp = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(t[key]), inputmode: 'decimal',
          'aria-label': t.name + ' ' + (key === 'wcet' ? 'WCET (ms)' : key === 'period' ? 'period (ms)' : 'priority (1 is highest)') });
        inp.dataset.task = String(i); inp.dataset.key = key;
        inputs.push(inp);
        return el('td', null, inp);
      };
      tbody.appendChild(el('tr', null, el('th', { scope: 'row' }, sw, t.name), mk('period', 10, 1000, 1), mk('wcet', 0.5, 1000, 0.5), mk('prio', 1, 9, 1)));
    });
    const table = el('table', { class: 'table compact m10-tasks' },
      el('caption', null, 'Task set (edit any cell)'),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Task'), el('th', { scope: 'col' }, 'Period (ms)'), el('th', { scope: 'col' }, 'WCET (ms)'), el('th', { scope: 'col' }, 'Priority'))),
      tbody);
    const tableWrap = el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Task set' }, table);
    const taskErr = el('p', { class: 'field-error', 'aria-live': 'polite' });

    const policy = ui.segmented({ id: 'w101-policy', label: 'Scheduling policy', value: 'fcfs', options: [
      { value: 'fcfs', label: 'FCFS' }, { value: 'rr', label: 'Round-robin' }, { value: 'fp', label: 'Fixed priority' }, { value: 'rm', label: 'Rate-monotonic' }] });
    const gcT = ui.toggle({ id: 'w101-gc', label: 'GC pause: 40 ms at t = 300 ms', checked: false, tag: 'illustrative' });
    const pfT = ui.toggle({ id: 'w101-pf', label: 'Page-fault burst: +15 ms on the next control job', checked: false, tag: 'illustrative' });
    const ccT = ui.toggle({ id: 'w101-cold', label: 'Cold cache: every WCET ×2', checked: false, tag: 'illustrative' });
    const view = ui.segmented({ id: 'w101-view', label: 'Chart window', value: 'all', options: [{ value: 'all', label: '0–1000 ms' }, { value: 'zoom', label: '250–450 ms' }] });
    const reset = ui.button({ label: 'Reset the task set', kind: 'ghost', icon: 'reset', small: true });
    w.controls.appendChild(el('div', { class: 'm10-taskbox' }, tableWrap, taskErr));
    [policy, gcT, pfT, ccT, view].forEach(function (c) { w.controls.appendChild(c.el); });
    w.controls.appendChild(el('div', { class: 'btn-row' }, reset));

    const set = readouts(w.out, ['Utilisation U', 'RM bound for ' + tasks.length + ' tasks', 'Deadline misses in 1 s', 'Priorities used']);
    const verdict = el('p', { class: 'status-line m10-verdict', 'aria-live': 'polite' });
    w.out.appendChild(verdict);
    let res = null;
    const gantt = canvasView(w.out, { label: 'Gantt chart', height: function () { return 30 + 28 * (tasks.length + 1) + 30; }, draw: drawGantt });
    const legend = el('p', { class: 'm10-legend' },
      el('span', null, el('span', { class: 'm10-key m10-key-rel', 'aria-hidden': 'true' }), 'release'),
      el('span', null, el('span', { class: 'm10-key m10-key-miss', 'aria-hidden': 'true' }, '×'), 'deadline missed'),
      el('span', null, el('span', { class: 'm10-key m10-key-late', 'aria-hidden': 'true' }), 'running late'),
      el('span', null, el('span', { class: 'm10-key m10-key-gc', 'aria-hidden': 'true' }), 'processor stalled'));
    w.out.appendChild(legend);
    const detail = el('div');
    w.out.appendChild(detail);

    function drawGantt(ctx, W, Hc, colour) {
      if (!res) return;
      const zoom = view.value === 'zoom';
      const x0 = zoom ? 250 : 0, x1 = zoom ? 450 : 1000;
      const narrow = W < 420;
      const L = narrow ? 62 : 96, R = 16, T = 22, rowH = 28;
      const rows = tasks.length + 1;
      const PW = W - L - R;
      const X = function (tm) { return L + (tm - x0) / (x1 - x0) * PW; };
      ctx.fillStyle = colour('--plot-bg'); ctx.fillRect(0, 0, W, Hc);
      ctx.font = '12px ' + colour('--font-sans');
      ctx.textBaseline = 'middle';
      // grid and axis
      const step = zoom ? 25 : 100;
      ctx.strokeStyle = colour('--grid'); ctx.lineWidth = 1;
      ctx.fillStyle = colour('--text-2'); ctx.textAlign = 'center';
      for (let tm = x0; tm <= x1 + 1e-9; tm += step) {
        const x = Math.round(X(tm)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, T - 4); ctx.lineTo(x, T + rows * rowH); ctx.stroke();
        ctx.textAlign = tm >= x1 - 1e-9 ? 'right' : 'center';
        if (!(W < 420 && !zoom && (tm / step) % 2 === 1)) ctx.fillText(String(tm), tm >= x1 - 1e-9 ? x + 3 : x, T + rows * rowH + 12);
      }
      ctx.textAlign = 'right';
      ctx.fillText('time (ms)', W - R, T + rows * rowH + 26);
      ctx.textAlign = 'left';
      ctx.fillStyle = colour('--text-2');
      ctx.fillText(narrow ? { fcfs: 'FCFS', rr: 'Round-robin', fp: 'Fixed priority', rm: 'Rate-monotonic' }[policy.value] : policyLabel(), L, 10);
      // row labels
      for (let i = 0; i < rows; i++) {
        const y = T + i * rowH;
        ctx.fillStyle = colour('--text');
        ctx.textAlign = 'left';
        const SHORT = { Control: 'Ctrl', Estimator: 'Est', Telemetry: 'Tlm', Logging: 'Log' };
        const name = i < tasks.length ? (narrow ? SHORT[tasks[i].name] || tasks[i].name.slice(0, 4) : tasks[i].name) + ' P' + res.prio[i] : 'Stall';
        ctx.fillText(name, 4, y + rowH / 2);
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(L, 0, PW, Hc); ctx.clip();
      // execution slices
      res.slices.forEach(function (s) {
        if (s.t1 < x0 || s.t0 > x1) return;
        const row = s.task < 0 ? tasks.length : s.task;
        const y = T + row * rowH + 6, hh = rowH - 12;
        if (s.task < 0) {
          hatch(ctx, X(s.t0), y, X(s.t1) - X(s.t0), hh, colour('--text-2'));
          return;
        }
        ctx.fillStyle = colour(COLORS[s.task]);
        const a = X(s.t0), b = X(s.t1);
        ctx.fillRect(a, y, Math.max(1, b - a), hh);
        if (s.job && s.job.missed && s.t1 > s.job.deadline) {
          const la = X(Math.max(s.t0, s.job.deadline));
          hatch(ctx, la, y, Math.max(1, b - la), hh, colour('--bad'));
          ctx.strokeStyle = colour('--bad'); ctx.lineWidth = 1.5;
          ctx.strokeRect(la + 0.5, y + 0.5, Math.max(1, b - la) - 1, hh - 1);
        }
      });
      // releases and misses
      res.jobs.forEach(function (j) {
        if (j.release >= x0 && j.release <= x1) {
          const x = X(j.release), y = T + j.task * rowH + 2;
          ctx.fillStyle = colour('--text-2');
          ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill();
        }
        if (j.missed && j.deadline >= x0 && j.deadline <= x1) {
          const x = X(j.deadline), y = T + j.task * rowH + rowH / 2;
          ctx.strokeStyle = colour('--bad'); ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        }
      });
      ctx.restore();
    }
    function hatch(ctx, x, y, wd, hh, c) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, wd, hh); ctx.clip();
      ctx.strokeStyle = c; ctx.lineWidth = 1.5;
      for (let k = -hh; k < wd + hh; k += 6) { ctx.beginPath(); ctx.moveTo(x + k, y + hh); ctx.lineTo(x + k + hh, y); ctx.stroke(); }
      ctx.restore();
    }
    function policyLabel() {
      return { fcfs: 'First come, first served (no preemption)', rr: 'Round-robin, 10 ms quantum', fp: 'Fixed priority, preemptive (your priorities)', rm: 'Rate-monotonic (shorter period = higher priority)' }[policy.value];
    }

    function readTasks() {
      const out = tasks.map(function (t) { return Object.assign({}, t); });
      let bad = null;
      inputs.forEach(function (inp) {
        const v = parseFloat(inp.value), i = +inp.dataset.task, key = inp.dataset.key;
        const min = parseFloat(inp.min), max = parseFloat(inp.max);
        const ok = isFinite(v) && v >= min && v <= max && (key !== 'prio' || Math.round(v) === v);
        inp.toggleAttribute('aria-invalid', !ok);
        if (ok) out[i][key] = v;
        else if (!bad) bad = out[i].name + ' ' + (key === 'wcet' ? 'WCET' : key) + ' must be ' + (key === 'prio' ? 'a whole number from ' : 'between ') + min + (key === 'prio' ? ' to ' : ' and ') + max + '.';
      });
      out.forEach(function (t) { if (!bad && t.wcet > t.period) bad = t.name + ': the WCET cannot be longer than the period.'; });
      if (bad) throw new RangeError(bad);
      return out;
    }

    function update() {
      taskErr.textContent = '';
      let tk;
      try { tk = readTasks(); } catch (err) { if (err instanceof RangeError) { taskErr.textContent = err.message; return; } throw err; }
      tasks = tk;
      const cold = ccT.value ? 2 : 1;
      res = schedule(tasks, { policy: policy.value, quantum: 10, horizon: 1000, gc: gcT.value ? GC : null, pf: pfT.value ? PF : null, cold: cold });
      const U = tasks.reduce(function (a, t) { return a + cold * t.wcet / t.period; }, 0);
      const B = rmBound(tasks.length);
      const misses = res.jobs.filter(function (j) { return j.missed; });
      set([pct(U), pct(B), String(misses.length), tasks.map(function (t, i) { return t.name.charAt(0) + res.prio[i]; }).join(' ')]);
      let msg;
      if (U > 1) msg = 'U > 100%: no policy can meet every deadline; the processor is simply overloaded.';
      else if (U <= B) msg = 'U ≤ the bound, so rate-monotonic priorities are guaranteed to meet every deadline when nothing unexpected happens (the bound is sufficient, not necessary).';
      else msg = 'U is above the bound: rate-monotonic may still work, but the simple test can no longer promise it.';
      verdict.textContent = (misses.length ? misses.length + ' deadline miss' + (misses.length === 1 ? '' : 'es') + ' with ' + policyLabel().toLowerCase() + '. ' : 'Every deadline met with ' + policyLabel().toLowerCase() + '. ') + msg;
      // per-task table
      const rows = tasks.map(function (t, i) {
        const js = res.jobs.filter(function (j) { return j.task === i; });
        const done = js.filter(function (j) { return j.done !== null; });
        const worst = done.reduce(function (a, j) { return Math.max(a, j.done - j.release); }, 0);
        const miss = js.filter(function (j) { return j.missed; });
        const first = miss[0];
        // misses come second so they stay in view when a phone scrolls the table sideways
        return [t.name, miss.length ? el('span', { class: 'm10-miss' }, ui.badge('fail', String(miss.length)), first ? el('span', { class: 'm10-first' }, ' first: released ' + f(first.release, { sig: 4 }) + ' ms') : '') : ui.badge('pass', '0'),
          String(res.prio[i]), f(cold * t.wcet, { sig: 3 }), String(js.length), done.length ? f(worst, { sig: 3 }) : '–', f(t.period, { sig: 4 })];
      });
      detail.textContent = '';
      detail.appendChild(ui.table([{ key: 'n', label: 'Task' }, { key: 'm', label: 'Misses' }, { key: 'p', label: 'Priority', num: true }, { key: 'c', label: 'C (ms)', num: true }, { key: 'j', label: 'Jobs', num: true },
        { key: 'r', label: 'Worst response (ms)', num: true }, { key: 'd', label: 'Deadline (ms)', num: true }], rows,
      { caption: 'Per-task results over 1 s', rowHeaders: true, compact: true }));
      gantt.canvas.setAttribute('aria-label', 'Gantt chart, ' + policyLabel() + ': ' + (misses.length ? misses.map(function (j) { return tasks[j.task].name + ' job released at ' + f(j.release, { sig: 4 }) + ' ms missed its deadline'; }).slice(0, 6).join('; ') : 'no deadline misses') + '.');
      gantt.render();
    }
    inputs.forEach(function (inp) { inp.addEventListener('input', ui.debounce(update, 200)); inp.addEventListener('change', update); });
    [policy, gcT, pfT, ccT].forEach(function (c) { c.on('change', update); });
    view.on('change', function () { gantt.render(); });
    reset.addEventListener('click', function () {
      inputs.forEach(function (inp) { inp.value = String(TASKS0[+inp.dataset.task][inp.dataset.key]); inp.removeAttribute('aria-invalid'); });
      update();
    });
    update();
  }

  /* ================================================================ W10.2 torn quaternion */

  function tornRun(mode, seed) {
    const QA = [1, 0, 0, 0], QB = [0.5, 0.5, 0.5, 0.5];
    const TICKS = 400, PERIOD = 8, WRITE = 4, P_READ = 0.3;
    const rnd = A.rng.mulberry32(seed);
    const mem = QA.slice();
    const bufs = [QA.slice(), QA.slice()];
    let front = 0, back = 1, seq = 0, locked = false, writes = 0, target = QB;
    let pending = false;
    const reads = [];
    let waits = 0, retries = 0, stale = 0;
    for (let tick = 0; tick < TICKS; tick++) {
      const phase = tick % PERIOD;
      let writing = false;
      if (phase < WRITE) {
        if (phase === 0) { target = writes % 2 === 0 ? QB : QA; seq++; locked = true; back = 1 - front; }
        if (mode === 'double') bufs[back][phase] = target[phase]; else mem[phase] = target[phase];
        writing = phase < WRITE - 1;
        if (phase === WRITE - 1) { seq++; locked = false; if (mode === 'double') { front = back; } writes++; }
      }
      const issue = pending || rnd() < P_READ;
      if (!issue) continue;
      if (mode === 'mutex' && locked) { pending = true; waits++; continue; }
      if (mode === 'seqlock' && (seq % 2 === 1)) { pending = true; retries++; continue; }
      const q = mode === 'double' ? bufs[front].slice() : mem.slice();
      if (mode === 'double' && writing) stale++;
      pending = false;
      const n = Math.hypot(q[0], q[1], q[2], q[3]);
      reads.push({ tick: tick, phase: phase, q: q, norm: n, torn: Math.abs(n - 1) > 1e-12 });
    }
    return { reads: reads, waits: waits, retries: retries, stale: stale };
  }

  function buildTorn() {
    const w = parts('w-torn');
    const mode = ui.segmented({ id: 'w102-mode', label: 'Protection', value: 'none', options: [
      { value: 'none', label: 'No protection' }, { value: 'mutex', label: 'Mutex' }, { value: 'double', label: 'Double buffer' }, { value: 'seqlock', label: 'Sequence lock' }] });
    const again = ui.button({ label: 'New interleaving', icon: 'reset', kind: 'secondary', small: true });
    w.controls.appendChild(mode.el);
    w.controls.appendChild(el('div', { class: 'btn-row' }, again));
    let seed = 7;
    const set = readouts(w.out, ['Reads', 'Torn (‖q‖ ≠ 1)', 'Worst |‖q‖ − 1|', 'Reader paid']);
    const plotBox = el('div');
    w.out.appendChild(plotBox);
    const sc = A.plot.scatter(plotBox, { title: 'Norm of every quaternion the reader saw', xLabel: 'tick', yLabel: '‖q‖ read', height: 220,
      points: [], colorScale: { min: 0, max: 0.5, label: '|‖q‖ − 1|' }, yMin: 0.4, yMax: 1.45,
      hlines: [{ y: 1, label: 'valid: ‖q‖ = 1', color: '--ok' }] });
    const first = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(first);

    function comps(q) { return '[' + q.map(function (x) { return f(x, { fixed: 2 }); }).join(', ') + ']'; }
    function update() {
      const r = tornRun(mode.value, seed);
      const torn = r.reads.filter(function (x) { return x.torn; });
      const worst = r.reads.reduce(function (a, x) { return Math.max(a, Math.abs(x.norm - 1)); }, 0);
      const paid = { none: 'nothing (but wrong data)', mutex: r.waits + ' ticks waiting for the lock', double: r.stale + ' reads one write old (still valid)', seqlock: r.retries + ' retries' }[mode.value];
      set([String(r.reads.length), torn.length ? el('span', null, ui.badge('fail', String(torn.length)), ' ' + pct(torn.length / r.reads.length, 0) + ' of reads') : ui.badge('pass', '0'),
        worst < 1e-12 ? '0' : f(worst, { sig: 3 }), paid]);
      sc.set({ points: r.reads.map(function (x, i) { return { x: x.tick, y: x.norm, c: Math.abs(x.norm - 1), id: i + 1, label: 'tick ' + x.tick + ': ' + comps(x.q) }; }) });
      if (torn.length) {
        const x = torn[0];
        const fresh = [], old = [];
        for (let i = 0; i < 4; i++) (i <= x.phase ? fresh : old).push('q' + i);
        first.textContent = 'First torn read at tick ' + x.tick + ': ' + comps(x.q) + ', with ' + fresh.join(', ') + ' from the new attitude and ' + old.join(', ') + ' from the old one, so ‖q‖ = ' + f(x.norm, { fixed: 3 }) + '.';
      } else {
        first.textContent = mode.value === 'none' ? 'No read happened to land inside a write this time; try another interleaving.' : 'Every read returned a complete attitude, A or B.';
      }
    }
    mode.on('change', update);
    again.addEventListener('click', function () { seed = (seed * 7919 + 13) % 100003; update(); });
    update();
  }

  /* ================================================================ W10.3 property tests */

  function buildPropTests() {
    const w = parts('w-proptest');
    const Q = A.quat, J = DEF.J;
    const N_CASES = 200;

    function mulSignBug(a, b) {   // the cross-product term with the wrong sign: computes b ⊗ a
      return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] - (a[2] * b[3] - a[3] * b[2]),
        a[0] * b[2] + a[2] * b[0] - (a[3] * b[1] - a[1] * b[3]),
        a[0] * b[3] + a[3] * b[0] - (a[1] * b[2] - a[2] * b[1])];
    }
    function step(renorm) {
      return function (q, w0) {
        let x = [q[0], q[1], q[2], q[3], w0[0], w0[1], w0[2]];
        for (let i = 0; i < 100; i++) x = A.dynamics.propagate(x, [0, 0, 0], [0, 0, 0], J, 0.1, { method: 'rk4', renormalise: renorm });
        return x.slice(0, 4);
      };
    }
    function satReal(u) { return A.ctrl.saturate([u, 0, 0], TAU_MAX, 'clip')[0]; }
    function satGe(u) { return u >= TAU_MAX ? TAU_MAX : (u <= -TAU_MAX ? -TAU_MAX : u); }
    const realImpl = { mul: Q.mul, toR: Q.toR, toDCM: Q.toDCM, step: step(true), sat: satReal };
    const IMPLS = [
      // `short` is the column head on a phone, where the five result columns must fit side by side
      { id: 'real', label: 'Real', short: 'Real', long: 'the site’s real helpers', impl: realImpl },
      { id: 'sign', label: 'Sign error', short: 'Sign', long: 'Hamilton product with the cross-product sign flipped', impl: Object.assign({}, realImpl, { mul: mulSignBug }) },
      { id: 'dcm', label: 'DCM transposed', short: 'DCMᵀ', long: 'toDCM returning R instead of Rᵀ', impl: Object.assign({}, realImpl, { toDCM: Q.toR }) },
      { id: 'renorm', label: 'No renormalise', short: 'No norm', long: 'propagate without the renormalisation step', impl: Object.assign({}, realImpl, { step: step(false) }) },
      { id: 'sat', label: '>= in sat', short: '≥', long: 'saturation written with >= and <= instead of > and <', impl: Object.assign({}, realImpl, { sat: satGe }) }
    ];
    function vec(rnd) { return [2 * rnd() - 1, 2 * rnd() - 1, 2 * rnd() - 1]; }
    function qs(q) { return '[' + q.map(function (x) { return f(x, { fixed: 4 }); }).join(', ') + ']'; }
    function vs(v) { return '[' + v.map(function (x) { return f(x, { sig: 4 }); }).join(', ') + ']'; }
    function matErr(M, Nm) { let e = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) e = Math.max(e, Math.abs(M[i][j] - Nm[i][j])); return e; }
    const mm = A.vec.matMul, mv = A.vec.matVec, tr = A.vec.transpose, I3 = A.vec.eye();
    function satInput(rnd, i) {
      const edge = [TAU_MAX, -TAU_MAX, 0, 2 * TAU_MAX, -2 * TAU_MAX, TAU_MAX * (1 - 1e-12)];
      return i < edge.length ? edge[i] : (20 * rnd() - 10) * TAU_MAX;
    }
    const PROPS = [
      { id: 'norm', label: 'Product keeps ‖q‖ = 1', tex: '\\(\\lVert a\\otimes b\\rVert=1\\)',
        run: function (im, rnd) { const a = Q.randomUniform(rnd), b = Q.randomUniform(rnd); const p = im.mul(a, b); const e = Math.abs(Math.hypot(p[0], p[1], p[2], p[3]) - 1);
          return { ok: e < 1e-12, cx: 'a = ' + qs(a) + ', b = ' + qs(b) + ': ‖a ⊗ b‖ − 1 = ' + f(e, { sig: 3 }) }; } },
      { id: 'rot', label: 'Product rotation matches R', tex: '\\(a\\otimes[0,v]\\otimes a^{*}=R(a)\\,v\\)',
        run: function (im, rnd) { const a = Q.randomUniform(rnd), v = vec(rnd); const p = im.mul(im.mul(a, [0, v[0], v[1], v[2]]), Q.conj(a)); const r = mv(im.toR(a), v);
          const e = Math.max(Math.abs(p[1] - r[0]), Math.abs(p[2] - r[1]), Math.abs(p[3] - r[2]));
          return { ok: e < 1e-12, cx: 'a = ' + qs(a) + ', v = ' + vs(v) + ': product gives ' + vs([p[1], p[2], p[3]]) + ' but R(a)v = ' + vs(r) }; } },
      { id: 'comp', label: 'Composition', tex: '\\(R(a\\otimes b)=R(a)\\,R(b)\\)',
        run: function (im, rnd) { const a = Q.randomUniform(rnd), b = Q.randomUniform(rnd); const e = matErr(im.toR(im.mul(a, b)), mm(im.toR(a), im.toR(b)));
          return { ok: e < 1e-12, cx: 'a = ' + qs(a) + ', b = ' + qs(b) + ': largest element difference ' + f(e, { sig: 3 }) }; } },
      { id: 'ortho', label: 'DCM is orthonormal', tex: '\\(C^{\\top}C=I,\\ \\det C=+1\\)',
        run: function (im, rnd) { const q = Q.randomUniform(rnd); const C = im.toDCM(q); const e = Math.max(matErr(mm(tr(C), C), I3), Math.abs(A.vec.det(C) - 1));
          return { ok: e < 1e-12, cx: 'q = ' + qs(q) + ': error ' + f(e, { sig: 3 }) }; } },
      { id: 'cover', label: 'q and −q give one DCM', tex: '\\(C(q)=C(-q)\\)',
        run: function (im, rnd) { const q = Q.randomUniform(rnd); const e = matErr(im.toDCM(q), im.toDCM(q.map(function (x) { return -x; })));
          return { ok: e < 1e-12, cx: 'q = ' + qs(q) + ': difference ' + f(e, { sig: 3 }) }; } },
      { id: 'passive', label: 'DCM maps inertial to body', tex: '\\(C(q)\\,(q\\otimes v\\otimes q^{*})=v\\)',
        run: function (im, rnd) { const q = Q.randomUniform(rnd), v = vec(rnd); const back = mv(im.toDCM(q), Q.rotate(q, v));
          const e = Math.max(Math.abs(back[0] - v[0]), Math.abs(back[1] - v[1]), Math.abs(back[2] - v[2]));
          return { ok: e < 1e-12, cx: 'q = ' + qs(q) + ', v = ' + vs(v) + ': got back ' + vs(back) }; } },
      { id: 'prop', label: 'Propagation keeps ‖q‖ = 1', tex: '100 RK4 steps of 0.1 s',
        run: function (im, rnd) { const q = Q.randomUniform(rnd), wd = vec(rnd).map(function (x) { return 30 * x * D2R; }); const p = im.step(q, wd);
          const e = Math.abs(Math.hypot(p[0], p[1], p[2], p[3]) - 1);
          return { ok: e < 1e-12, cx: 'ω = ' + vs(wd.map(function (x) { return x * R2D; })) + ' deg/s: after 10 s, ‖q‖ − 1 = ' + f(e, { sig: 3 }) }; } },
      { id: 'bound', label: 'Saturation bound', tex: '\\(|\\mathrm{sat}(u)|\\le\\tau_{max}\\)',
        run: function (im, rnd, i) { const u = satInput(rnd, i); const s = im.sat(u);
          return { ok: Math.abs(s) <= TAU_MAX, cx: 'u = ' + f(u, { sig: 4 }) + ' N m: sat(u) = ' + f(s, { sig: 4 }) }; } },
      { id: 'idem', label: 'Saturation is idempotent', tex: '\\(\\mathrm{sat}(\\mathrm{sat}(u))=\\mathrm{sat}(u)\\)',
        run: function (im, rnd, i) { const u = satInput(rnd, i); const s = im.sat(u), s2 = im.sat(s);
          return { ok: s === s2, cx: 'u = ' + f(u, { sig: 4 }) + ': ' + f(s, { sig: 4 }) + ' then ' + f(s2, { sig: 4 }) }; } },
      { id: 'pass', label: 'In-range values untouched', tex: '\\(|u|\\le\\tau_{max}\\Rightarrow\\mathrm{sat}(u)=u\\)',
        run: function (im, rnd, i) { const u = i < 2 ? (i ? -TAU_MAX : TAU_MAX) : (2 * rnd() - 1) * TAU_MAX; const s = im.sat(u);
          return { ok: s === u, cx: 'u = ' + f(u, { sig: 4 }) + ': sat(u) = ' + f(s, { sig: 4 }) }; } }
    ];

    const runBtn = ui.button({ label: 'Run all tests', kind: 'primary', icon: 'play' });
    const seedNote = el('span', { class: 'muted m10-seed' }, 'Predict first: which tests will catch each broken copy?');
    w.controls.appendChild(el('div', { class: 'btn-row m10-wide' }, runBtn, seedNote));
    const legend = el('ul', { class: 'm10-impl-list m10-wide' }, IMPLS.map(function (m) {
      return el('li', null, el('strong', null, m.label, m.short !== m.label ? el('span', { class: 'm10-short-key' }, ' (column “' + m.short + '”)') : null, ': '), m.long);
    }));
    w.controls.appendChild(legend);

    // One tbody per property. Wide screens show the property as the row header; narrow screens
    // (m10.css) hide that column and show the property as a full-width row above its five
    // results, with short column heads, so every result column fits without scrolling.
    const head = el('tr', null, el('th', { scope: 'col', class: 'm10-prop-col' }, 'Property (200 inputs each)'),
      IMPLS.map(function (m) { return el('th', { scope: 'col', class: 'm10-col' }, el('span', { class: 'm10-head-long' }, m.label), el('span', { class: 'm10-head-short', 'aria-hidden': 'true' }, m.short)); }));
    const groups = [];
    const cells = PROPS.map(function (p) {
      const propLabel = function () { return [el('span', { class: 'm10-prop' }, p.label), el('span', { class: 'm10-prop-tex' }, p.tex)]; };
      const labelRow = el('tr', { class: 'm10-prop-row' }, el('th', { scope: 'rowgroup', colspan: String(IMPLS.length) }, propLabel()));
      const row = el('tr', null, el('th', { scope: 'row', class: 'm10-prop-col' }, propLabel()));
      const cs = IMPLS.map(function (m) {
        const b = el('button', { type: 'button', class: 'm10-cell', 'aria-label': p.label + ', ' + m.label + ': not run yet' }, el('span', { class: 'muted' }, '–'));
        row.appendChild(el('td', null, b));
        return b;
      });
      groups.push(el('tbody', null, labelRow, row));
      return cs;
    });
    const tableWrap = el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Property tests by implementation' },
      el('table', { class: 'table compact m10-matrix' }, el('caption', null, 'Which test catches which bug?'), el('thead', null, head), groups));
    w.out.appendChild(tableWrap);
    const detail = el('div', { class: 'm10-detail', 'aria-live': 'polite' }, el('p', { class: 'muted' }, 'Run the tests, then select a cell to see its counterexample.'));
    const summary = el('p', { class: 'status-line' });
    w.out.appendChild(summary);
    w.out.appendChild(detail);

    let results = null, seed = 1, selected = null;
    function runAll() {
      results = PROPS.map(function (p) {
        return IMPLS.map(function (m) {
          const rnd = A.rng.mulberry32(seed * 1000 + PROPS.indexOf(p));
          let fails = 0, cx = null;
          for (let i = 0; i < N_CASES; i++) {
            const r = p.run(m.impl, rnd, i);
            if (!r.ok) { fails++; if (!cx) cx = { i: i, text: r.cx }; }
          }
          return { fails: fails, cx: cx };
        });
      });
      PROPS.forEach(function (p, i) {
        IMPLS.forEach(function (m, j) {
          const r = results[i][j], b = cells[i][j];
          b.textContent = '';
          b.appendChild(ui.badge(r.fails ? 'fail' : 'pass', r.fails ? 'FAIL' : 'PASS'));
          // the accessible name starts with the visible badge text (WCAG 2.5.3, label in name)
          b.setAttribute('aria-label', (r.fails ? 'FAIL' : 'PASS') + ': ' + p.label + ', ' + m.label + ', ' + (r.fails ? 'fails on ' + r.fails + ' of ' + N_CASES + ' inputs; show the counterexample' : 'passes all ' + N_CASES + ' inputs'));
          b.classList.toggle('is-fail', !!r.fails);
        });
      });
      const caught = IMPLS.slice(1).map(function (m, jj) {
        const j = jj + 1;
        const n = PROPS.filter(function (p, i) { return results[i][j].fails; }).length;
        return m.label + ' caught by ' + n + ' of ' + PROPS.length;
      });
      summary.textContent = 'Seed ' + seed + '. ' + caught.join('; ') + '.';
      runBtn.textContent = '';
      runBtn.appendChild(ui.icon('reset'));
      runBtn.appendChild(el('span', { class: 'btn-label' }, 'Run again with a new seed'));
      if (!selected) {
        for (let i = 0; i < PROPS.length && !selected; i++) for (let j = 1; j < IMPLS.length; j++) if (results[i][j].fails) { selected = [i, j]; break; }
      }
      showDetail();
      ui.typeset(tableWrap);
    }
    function showDetail() {
      if (!results || !selected) return;
      const i = selected[0], j = selected[1], p = PROPS[i], m = IMPLS[j], r = results[i][j];
      cells.forEach(function (row) { row.forEach(function (b) { b.removeAttribute('aria-pressed'); }); });
      cells[i][j].setAttribute('aria-pressed', 'true');
      detail.textContent = '';
      detail.appendChild(el('p', null, el('strong', null, p.label), ' on ', el('strong', null, m.label), ' (' + m.long + '): ', ui.badge(r.fails ? 'fail' : 'pass'), ' ', r.fails ? r.fails + ' of ' + N_CASES + ' inputs fail.' : 'all ' + N_CASES + ' inputs pass.'));
      if (r.cx) detail.appendChild(el('p', { class: 'm10-cx' }, 'First counterexample (input ' + (r.cx.i + 1) + '): ' + r.cx.text + '.'));
      else if (j > 0) detail.appendChild(el('p', { class: 'muted' }, 'This test cannot see this bug: ' + blindReason(p.id, m.id)));
    }
    function blindReason(pid, mid) {
      if (mid === 'sat') return 'clamping a value that equals the limit to the limit changes nothing, so > and >= give identical outputs for every input. No test can tell them apart; it is an equivalent mutant.';
      if (mid === 'sign' && pid === 'norm') return 'with the sign flipped the function computes b ⊗ a, which is still a unit quaternion. The norm test is blind to the order of a product.';
      if (mid === 'dcm' && (pid === 'ortho' || pid === 'cover')) return 'the transpose of a rotation matrix is also a rotation matrix, orthonormal with determinant +1 and the same for q and −q. Only a test that uses the DCM’s direction catches the bug.';
      return 'this property does not use the broken function.';
    }
    cells.forEach(function (row, i) { row.forEach(function (b, j) { b.addEventListener('click', function () { if (!results) return; selected = [i, j]; showDetail(); }); }); });
    runBtn.addEventListener('click', function () { if (results) seed++; runAll(); });
  }

  /* ================================================================ W10.4 gain-matrix porting bug */

  function buildGainPort() {
    const w = parts('w-gainport');
    const K = A.lqr.gains3(DEF.J, DEF.lqr);
    const flat = [];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) flat.push(K[i][j]);      // column-major, as MATLAB stores it
    const bug = [flat.slice(0, 6), flat.slice(6, 12), flat.slice(12, 18)];          // read row by row (the bug)
    const port = ui.segmented({ id: 'w104-port', label: 'Port the flat array as', value: 'bug', options: [
      { value: 'good', label: 'Transpose first (correct)' }, { value: 'bug', label: 'Read as row-major (bug)' }] });
    w.controls.appendChild(port.el);

    const COLS = ['θx', 'θy', 'θz', 'ωx', 'ωy', 'ωz'], ROWS = ['τx', 'τy', 'τz'];
    const flatBox = el('pre', { class: 'code-block m10-flat', tabindex: '0', role: 'region', 'aria-label': 'The flat column-major array' });
    flatBox.appendChild(el('code', null, '// MATLAB writes K(:) column by column: 18 numbers\nK_flat = [' +
      flat.map(function (v, i) { return (i % 3 === 0 && i ? '\n           ' : '') + (v === 0 ? '0' : v.toFixed(4)); }).join(', ') + ']'));
    const matBox = el('div');
    const top = el('div', { class: 'm10-k-top' }, el('div', null, el('p', { class: 'm10-k-head' }, 'The design: K = [diag(K', el('sub', null, 'θ'), ') | diag(K', el('sub', null, 'ω'), ')]'), mat(K, null, 'Correct 3 × 6 gain matrix')),
      el('div', null, el('p', { class: 'm10-k-head' }, 'What crosses the language boundary'), flatBox), matBox);
    w.out.appendChild(top);
    function mat(M, ref, caption) {
      const rows = M.map(function (row, i) {
        return [ROWS[i]].concat(row.map(function (v, j) {
          const diff = ref && Math.abs(v - ref[i][j]) > 1e-15;
          return el('span', { class: diff ? 'm10-diff' : null }, (v === 0 ? '0' : v.toFixed(4)) + (diff ? ' *' : ''));
        }));
      });
      const t = ui.table([{ key: 'r', label: 'Torque' }].concat(COLS.map(function (c) { return { key: c, label: c, num: true }; })), rows, { caption: caption, rowHeaders: true, compact: true });
      return t;
    }

    const set = readouts(w.out, ['Run', 'Settling time', 'Peak rate', 'Final error']);
    const grid = el('div', { class: 'grid-2' });
    const b1 = el('div'), b2 = el('div');
    grid.appendChild(b1); grid.appendChild(b2);
    w.out.appendChild(grid);
    const badgeBox = el('div');
    w.out.appendChild(badgeBox);
    const badges = ui.reqBadges(badgeBox, { notes: { F1: '', L1: '' } });
    const LIM = A.params.LIMITS;
    const M = { left: 52 };
    const pE = A.plot.line(b1, { height: 190, title: 'Attitude error', xLabel: 't (s)', yLabel: 'error (deg)', margin: M,
      series: [{ id: 'good', label: 'transposed (correct)', color: '--accent', width: 2, unit: 'deg' }, { id: 'bug', label: 'row-major (bug)', color: '--bad', dash: [6, 4], width: 2, unit: 'deg' }],
      hlines: [{ y: LIM.errDeg, label: 'REQ-F2 ' + LIM.errDeg + '°', color: '--line-req' }] });
    const pW = A.plot.line(b2, { height: 190, title: 'Rate norm', xLabel: 't (s)', yLabel: '|ω| (deg/s)', margin: M,
      series: [{ id: 'good', label: 'transposed (correct)', color: '--accent', width: 2, unit: 'deg/s' }, { id: 'bug', label: 'row-major (bug)', color: '--bad', dash: [6, 4], width: 2, unit: 'deg/s' }],
      hlines: [{ y: LIM.rateMaxDeg, label: 'REQ-S1 ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req' }] });
    const note = el('p', { class: 'status-line', 'aria-live': 'polite' });
    w.out.appendChild(note);
    const runs = {};
    guarded(w.out, function () {
      const base = A.presets.get('T02');
      runs.good = A.sim.run(A.params.merge(base, { lqr: { K: K } }));
      runs.bug = A.sim.run(A.params.merge(base, { lqr: { K: bug } }));
      ['good', 'bug'].forEach(function (k) { pE.set(k, runs[k].t, runs[k].errDeg); pW.set(k, runs[k].t, runs[k].rateDeg); });
    });
    function update() {
      const k = port.value;
      matBox.textContent = '';
      matBox.appendChild(el('p', { class: 'm10-k-head' }, k === 'good' ? 'What the C++ code builds after transposing' : 'What the C++ code builds reading row by row'));
      matBox.appendChild(mat(k === 'good' ? K : bug, K, k === 'good' ? 'Identical to the design' : '* differs from the design'));
      const r = runs[k];
      if (!r) return;
      const m = r.metrics;
      set([k === 'good' ? 'transposed (correct)' : 'row-major (bug)', m.settle === null ? 'never settles' : f(m.settle, { fixed: 2, unit: 's' }), f(m.peakRate, { fixed: 2, unit: 'deg/s' }), f(m.final.errDeg, { sig: 3, unit: '°' })]);
      badges.update(r.req);
      note.textContent = k === 'good'
        ? 'Correct port: each torque axis uses its own angle and rate, the normal T02 response settles in ' + f(m.settle, { fixed: 2, unit: 's' }) + '.'
        : 'Bug: τx now depends on θx and ωy, τy on θz and ωx, τz on θy and ωz. Nothing damps the roll rate ωx, so the loop never settles and the rate peaks at ' + f(m.peakRate, { fixed: 1, unit: 'deg/s' }) + '.';
    }
    port.on('change', update);
    update();
  }

  /* ================================================================ W10.5 mode-sequence diff (stretch) */

  function buildModeDiff() {
    const w = parts('w-modediff');
    const sm = DEF.safeMode;
    const OPTIONS = {
      half: { label: 'Half step: dt = 0.005 s', delta: { dt: 0.005 } },
      euler: { label: 'Forward Euler at dt = 0.01 s', delta: { method: 'euler' } },
      units: { label: 'Re-implementation with a units bug (thresholds read as rad/s)', delta: { safeMode: { enterRateDeg: sm.enterRateDeg * R2D, exitRateDeg: sm.exitRateDeg * R2D, returnRateDeg: sm.returnRateDeg * R2D, returnErrDeg: sm.returnErrDeg * R2D } } }
    };
    const pick = ui.select({ id: 'w105-pick', label: 'Compare the reference T03 run with', value: 'half', options: Object.keys(OPTIONS).map(function (k) { return { value: k, label: OPTIONS[k].label }; }) });
    w.controls.appendChild(pick.el);
    const set = readouts(w.out, ['Reference tokens', 'Comparison tokens', 'Edit distance', 'Largest Δt on matched changes']);
    const tok = el('div', { class: 'm10-tokens' });
    w.out.appendChild(tok);
    const tbl = el('div');
    w.out.appendChild(tbl);
    let ref = null;
    const cache = {};
    function rle(r) { return A.modes.runLengths(r.mode, r.t); }
    function tokens(segs) { return segs.map(function (s) { return MODE_SHORT[s.mode]; }).join(' → '); }
    function update() {
      guarded(w.out, function () {
        if (!ref) ref = A.sim.run(A.presets.get('T03'));
        const k = pick.value;
        if (!cache[k]) cache[k] = A.sim.run(A.params.merge(A.presets.get('T03'), OPTIONS[k].delta));
        const a = rle(ref), b = rle(cache[k]);
        const lev = A.stats.levenshtein(a.map(function (s) { return s.mode; }), b.map(function (s) { return s.mode; }));
        let maxDt = 0;
        const rows = lev.ops.map(function (op, n) {
          const sa = op.i >= 0 ? a[op.i] : null, sb = op.j >= 0 ? b[op.j] : null;
          const dt = sa && sb && op.op === 'keep' ? Math.abs(sa.t0 - sb.t0) : null;
          if (dt !== null) maxDt = Math.max(maxDt, dt);
          const opText = { keep: 'match', sub: 'substitute', del: 'missing in comparison', ins: 'extra in comparison' }[op.op] || op.op;
          return [String(n + 1), sa ? MODE_NAMES[sa.mode] + ' from ' + f(sa.t0, { fixed: 3, unit: 's' }) : '–', sb ? MODE_NAMES[sb.mode] + ' from ' + f(sb.t0, { fixed: 3, unit: 's' }) : '–',
            dt === null ? '–' : f(dt, { fixed: 3, unit: 's' }), op.op === 'keep' ? ui.badge('pass', opText) : ui.badge('fail', opText)];
        });
        set([String(a.length), String(b.length), String(lev.distance), f(maxDt, { fixed: 3, unit: 's' })]);
        tok.textContent = '';
        tok.appendChild(el('p', null, el('strong', null, 'Reference: '), tokens(a)));
        tok.appendChild(el('p', null, el('strong', null, 'Comparison: '), tokens(b)));
        tbl.textContent = '';
        tbl.appendChild(ui.table([{ key: 'n', label: '#', num: true }, { key: 'a', label: 'Reference segment' }, { key: 'b', label: 'Comparison segment' }, { key: 'd', label: 'Δt', num: true }, { key: 'o', label: 'Edit operation' }], rows,
          { caption: 'Tokens aligned by edit distance', compact: true }));
      });
    }
    pick.on('change', update);
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
    ui.mountChrome({ page: 'm10' });
    buildDeadline();
    buildTorn();
    buildPropTests();
    buildGainPort();
    buildModeDiff();

    ui.quiz(document.getElementById('quiz'), [
      { q: 'Why ban heap allocation after initialisation in the control loop?',
        options: ['The heap is slower than registers.', 'Allocation time and failure are unpredictable, and leaks surface only after days.', 'C++ forbids it.'], correct: 1,
        explain: 'A hard deadline needs a worst case. An allocation is cheap when recycled but slow and failure-prone when the heap must grow, and a small leak per cycle passes every short test, then exhausts memory days later. Allocating everything at start-up removes both risks by construction.' },
      { q: 'Porting a column-major 3 × 6 gain matrix as row-major without transposing…',
        options: ['throws a compile error.', 'just scales the gains.', 'silently mixes attitude and rate gains across axes.'], correct: 2,
        explain: 'The 18 numbers are all still there, so nothing fails to compile; they just land in the wrong places. In the widget, τx loses its ωx term and the T02 run never settles.' },
      { q: 'A rate-monotonic task set with U = 0.6 and 3 tasks is…',
        options: ['schedulable (bound ≈ 0.78).', 'unschedulable.', 'undetermined.'], correct: 0,
        explain: 'The rate-monotonic bound for three tasks is \\(3(2^{1/3}-1)\\approx0.780\\). Since 0.6 is below it, rate-monotonic priorities are guaranteed to meet every deadline.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm10');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    recheckScrollable();
  });
})();
