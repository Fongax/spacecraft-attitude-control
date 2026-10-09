/**
 * m09.js: Module 09, verification and Monte Carlo statistics (package P5).
 * Widgets: W9.1 test-matrix runner, W9.2 mini Monte Carlo, W9.3 what does n/k prove,
 * W9.4 sampling bias, W9.5 choosing a metric (Kd sweep), plus the live metrics table.
 * Tests, presets, limits, campaign settings and statistics come from ADCS.tests, ADCS.presets,
 * ADCS.params, ADCS.mc and ADCS.stats; every number is computed in the browser.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const DEF = A.params.DEFAULTS;
  const LIM = A.params.LIMITS;
  const SM = DEF.safeMode;
  const MC = A.mc.DEFAULTS;
  const RATE_BOUND = MC.rateBoundDeg * Math.sqrt(3);

  /* ---------------------------------------------------------------- helpers */

  function parts(id) {
    const fig = document.getElementById(id);
    return { fig: fig, controls: fig.querySelector('.widget-controls'), out: fig.querySelector('.widget-output') };
  }
  function f(x, o) { return ui.fmt(x, o); }
  /** ui.fmtTime, rounded to whole seconds above a minute. LOCAL (request P0): fmtTime(719.9999) gives "11 min 60 s". */
  function fmtT(t) { return ui.fmtTime(isFinite(t) && Math.abs(t) >= 60 ? Math.round(t) : t); }
  function secs(x) { return x === null || x === undefined || !isFinite(x) ? '–' : f(x, { fixed: 2, unit: 's' }); }
  function pct(p, sig) { return isFinite(p) ? f(100 * p, { sig: sig || 4 }) + '%' : '–'; }
  function titleTags(scope) {
    ui.qsa('.tag', scope).forEach(function (t) {
      if (t.title) return;
      const m = /tag-([a-z]+)/.exec(t.className);
      if (m && ui.TAGS[m[1]]) t.title = ui.TAGS[m[1]][1];
    });
  }
  /*
   * LOCAL (request P0): histogram marker labels can overprint each other and the bars.
   * plot.histogram draws marker i's label in row i % 3 (rows 14 px apart from the top of the plot area),
   * right of its line, or left of it in the right 30% of the plot. layoutMarkers mirrors that layout
   * (the histogram's margins and label font) and gives each marker, in priority order, the first row where
   * its label clears the labels and lines already placed and every bar beneath it, trying the short label
   * after the full one. Spacer markers with x = NaN, which the plot skips, move a marker to its row. A
   * marker that fits nowhere is left out (the note under the plot gives every value); one flagged keep is
   * placed in row 0 with its short label regardless.
   */
  const MARK_FONT = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  let measurer = null;
  function labelWidth(s) {
    if (measurer === null) {
      const c = document.createElement('canvas');
      measurer = (c.getContext && c.getContext('2d')) || false;
    }
    if (!measurer) return 7.5 * s.length;
    measurer.font = MARK_FONT;
    return measurer.measureText(s).width;
  }
  function layoutMarkers(box, bins, cands) {
    const plain = function (c, text) { return { x: c.x, label: text, color: c.color }; };
    const cv = box.querySelector('canvas');
    const cw = cv ? cv.clientWidth : 0, ch = cv ? cv.clientHeight : 0;
    if (!cw || !ch || !bins.length) return cands.filter(function (c) { return c.keep; }).map(function (c) { return plain(c, c.short || c.label); });
    let x0 = Infinity, x1 = -Infinity, top = 0;
    bins.forEach(function (b) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); top = Math.max(top, b.count); });
    cands.forEach(function (c) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); });
    const pad = (x1 - x0) * 0.02 || 0.5;
    x0 -= pad; x1 += pad;
    // plot.histogram's box: 10 px above, 38 px below (tick labels and the axis title), 12 px right, and
    // a left margin wide enough for the count tick labels plus the y-axis title.
    const T = 10, H = ch - T - 38, L = Math.max(40, Math.ceil(7.3 * String(Math.ceil(1.1 * top)).length) + 26), W = cw - L - 12;
    const X = function (v) { return L + (v - x0) / (x1 - x0) * W; };
    const barTop = function (n) { return T + H - n / (1.1 * (top || 1)) * H; };
    const placed = [], out = [];
    function spotFor(xp, text, row) {
      const w = labelWidth(text), flip = xp > L + 0.7 * W;
      const a = flip ? xp - 7 - w : xp + 1, b = flip ? xp - 1 : xp + 7 + w;
      const yB = T + 2 + 14 * row + 12;
      const clash = placed.some(function (p) {
        return Math.abs(p.x - xp) < 6 || (p.row === row && a < p.b && b > p.a) || (p.x > a && p.x < b) || (xp > p.a && xp < p.b);
      });
      if (clash) return null;
      if (bins.some(function (bn) { return X(bn.x0) < b && X(bn.x1) > a && barTop(bn.count) < yB; })) return null;
      return { x: xp, a: a, b: b, row: row };
    }
    cands.forEach(function (c) {
      const xp = X(c.x), texts = c.short ? [c.label, c.short] : [c.label];
      let spot = null, text = c.label;
      for (let k = 0; k < texts.length && !spot; k++) {
        for (let r = 0; r < 3 && !spot; r++) spot = spotFor(xp, texts[k], r);
        if (spot) text = texts[k];
      }
      if (!spot && c.keep) {
        text = c.short || c.label;
        const w = labelWidth(text), flip = xp > L + 0.7 * W;
        spot = { x: xp, a: flip ? xp - 7 - w : xp + 1, b: flip ? xp - 1 : xp + 7 + w, row: 0 };
      }
      if (!spot) return;
      while (out.length % 3 !== spot.row) out.push({ x: NaN });
      out.push(plain(c, text));
      placed.push(spot);
    });
    return out;
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
  /** Progress bar plus a status line; set(fraction, text); hide()/show(). */
  function progress(container, label) {
    const bar = el('span');
    const pb = el('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': label }, bar);
    const text = el('p', { class: 'status-line', 'aria-live': 'polite' });
    const box = el('div', { class: 'm09-progress' }, pb, text);
    container.appendChild(box);
    return {
      el: box,
      set: function (frac, msg) {
        const v = Math.max(0, Math.min(100, 100 * frac));
        bar.style.width = v.toFixed(1) + '%';
        pb.setAttribute('aria-valuenow', v.toFixed(0));
        if (msg !== undefined) text.textContent = msg;
      },
      text: function (msg) { text.textContent = msg; }
    };
  }
  function newSignal() {
    return (typeof AbortController === 'function') ? new AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
  }
  /** Report an unexpected (non-RangeError) failure inside a promise chain, once, as ui.ready does. */
  function reportAsync(box, err) {
    if (err instanceof RangeError) { ui.showError(box, err); return; }
    ui.showError(box, 'Something went wrong while running this widget: ' + (err && err.message ? err.message : String(err)));
    console.error('[ADCS] m09 widget failed:', err);
  }
  function replayHash(tr, controller) {
    return A.hash.encode({ q0: tr.q0, w0Deg: tr.w0Deg, disturbance: tr.tauD, controller: controller, safeMode: { enabled: true } });
  }

  /* ================================================================ live metrics table */

  function buildMetricsTable() {
    const host = document.querySelector('[data-auto-table="metrics"]');
    if (!host) return;
    const ids = ['T01', 'T02', 'T03', 'FAULT', 'HIGHRATE', 'LQRSAFE'];
    const rows = [];
    ids.forEach(function (id) {
      try {
        const r = A.sim.run(A.params.merge(A.presets.get(id), { log: false }));
        const m = r.metrics;
        rows.push([el('span', { title: A.presets.meta[id] ? A.presets.meta[id].label : id }, id),
          m.settle === null ? 'not settled' : secs(m.settle), f(m.peakRate, { fixed: 2, unit: 'deg/s' }), f(LIM.rateMaxDeg - m.peakRate, { fixed: 2, unit: 'deg/s' }),
          f(m.maxTau * 1000, { fixed: 2, unit: 'mN m' }), ui.fmtSci(m.effort, 3), String(m.transitions)]);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        rows.push([id, err.message, '–', '–', '–', '–', '–']);
      }
    });
    host.appendChild(ui.table([{ key: 'p', label: 'Preset' }, { key: 's', label: 'Settling time', num: true }, { key: 'w', label: 'Peak |ω|', num: true },
      { key: 'm', label: 'Margin to ' + LIM.rateMaxDeg + ' deg/s', num: true }, { key: 't', label: 'Max |τ|', num: true }, { key: 'e', label: 'Effort (N² m² s)', num: true },
      { key: 'n', label: 'Transitions', num: true }], rows, { caption: 'Metrics computed from six preset logs (site gains, dt = ' + DEF.dt + ' s)', rowHeaders: true }));
    host.appendChild(el('p', { class: 'm09-note' }, 'Computed live with ADCS.metrics on the true state ', ui.tag('derived'),
      '. T02 shows why the margin matters: LQR from the T01 attitude with safe mode off peaks at over 14 deg/s, within 1 deg/s of the limit.'));
  }

  /* ================================================================ W9.1 test-matrix runner */

  function buildTestMatrix() {
    const w = parts('w-test-matrix');
    const runAll = ui.button({ label: 'Run all', kind: 'primary', icon: 'play' });
    const cancel = ui.button({ label: 'Cancel campaign', kind: 'secondary', icon: 'cross' });
    cancel.disabled = true;
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Test matrix'), el('div', { class: 'btn-row' }, runAll, cancel)));
    const prog = progress(w.out, 'Monte Carlo campaign progress');
    prog.set(0, 'The campaign (T04, shared with T05 and T06) has not run yet.');
    const results = {};
    const rowsUi = {};
    const table = el('table', { class: 'table m09-matrix' },
      el('caption', null, 'Test matrix T01–T06 (scenarios and expected results verbatim from the project)'),
      el('thead', null, el('tr', null, ['Test', 'Result', 'Requirements', 'Scenario', 'Expected result'].map(function (h) {
        return el('th', { scope: 'col' }, h);
      }))));
    const tbody = el('tbody');
    A.tests.matrix.forEach(function (row) {
      const chips = el('span', { class: 'm09-reqs' }, row.reqs.map(function (id) {
        const r = A.params.reqById(id);
        return el('span', { class: 'm09-req', title: r ? r.text : id }, id);
      }));
      const res = el('td', { class: 'm09-result' }, ui.badge('na', 'NOT RUN'));
      const btn = ui.button({ label: 'Run ' + row.id, small: true, icon: 'play' });
      btn.addEventListener('click', function () { runRow(row).catch(function (err) { reportAsync(w.out, err); }); });
      tbody.appendChild(el('tr', null, el('th', { scope: 'row' }, el('span', { class: 'm09-test-id' }, row.id), btn), res, el('td', null, chips), el('td', null, row.scenario), el('td', null, row.expected)));
      rowsUi[row.id] = { res: res, btn: btn };
    });
    table.appendChild(tbody);
    w.out.appendChild(el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Test matrix' }, table));
    const traceBox = el('div', { class: 'm09-trace' });
    w.out.appendChild(traceBox);

    let ctrl = null;
    function hooks() {
      if (!ctrl) ctrl = newSignal();
      cancel.disabled = false;
      return {
        signal: ctrl.signal,
        onProgress: function (done, n, ms) { prog.set(done / n, 'Monte Carlo campaign: ' + done + ' of ' + n + ' trials (' + fmtT(ms / 1000) + ')'); }
      };
    }
    function show(id, out) {
      results[id] = out;
      const ui0 = rowsUi[id];
      ui0.res.textContent = '';
      ui0.res.appendChild(ui.badge(out.status));
      ui0.res.appendChild(el('span', { class: 'm09-val' }, out.value));
      renderTrace();
    }
    function runRow(row) {
      const ui0 = rowsUi[row.id];
      ui0.res.textContent = '';
      ui0.res.appendChild(ui.badge('na', 'RUNNING'));
      const camp = ['T04', 'T05', 'T06'].indexOf(row.id) >= 0;
      return row.run(camp ? hooks() : undefined).then(function (out) {
        show(row.id, out);
        if (camp) campaignDone(out);
        return out;
      });
    }
    function campaignDone(out) {
      cancel.disabled = true;
      ctrl = null;
      if (out.status === 'na') prog.text('Campaign cancelled: ' + out.value + '. Run again to complete it.');
      else prog.set(1, 'Campaign complete: ' + MC.n + ' trials, seed ' + MC.baseSeed + '. T05 and T06 reuse its trials.');
    }
    function renderTrace() {
      traceBox.textContent = '';
      const rows = A.params.REQ.map(function (r) {
        const tests = A.tests.trace[r.id] || [];
        const cells = el('span', { class: 'm09-trace-tests' }, tests.map(function (t) {
          const res = results[t];
          return el('span', { class: 'm09-trace-test' }, t, ' ', ui.badge(res ? res.status : 'na', res ? undefined : 'NOT RUN'));
        }));
        const st = tests.every(function (t) { return results[t] && results[t].status === 'pass'; }) ? 'pass'
          : tests.some(function (t) { return results[t] && results[t].status === 'fail'; }) ? 'fail' : 'na';
        return [r.id, ui.badge(st, st === 'pass' ? 'VERIFIED' : st === 'fail' ? 'NOT MET' : 'PENDING'), cells, r.text];
      });
      traceBox.appendChild(ui.table([{ key: 'r', label: 'Requirement' }, { key: 'v', label: 'Verdict' }, { key: 'x', label: 'Traced tests' }, { key: 't', label: 'Text (verbatim)' }], rows,
        { caption: 'Trace: requirement → tests (ADCS.tests.trace)', rowHeaders: true, compact: true }));
    }
    runAll.addEventListener('click', function () {
      runAll.disabled = true;
      A.tests.clearCache();
      Object.keys(results).forEach(function (k) { delete results[k]; });
      prog.set(0, 'Starting…');
      let chain = Promise.resolve();
      A.tests.matrix.forEach(function (row) {
        chain = chain.then(function () {
          const t04 = results.T04;
          if ((row.id === 'T05' || row.id === 'T06') && t04 && t04.status === 'na') {
            show(row.id, { status: 'na', value: 'skipped: the campaign was cancelled' });
            return null;
          }
          return runRow(row);
        });
      });
      chain.then(function () {
        runAll.disabled = false;
        const all = A.tests.matrix.every(function (r) { return results[r.id] && results[r.id].status === 'pass'; });
        ui.announce('Test matrix finished: ' + (all ? 'all six tests pass.' : 'not every test passed.'));
      }, function (err) { runAll.disabled = false; reportAsync(w.out, err); });
    });
    cancel.addEventListener('click', function () { if (ctrl) ctrl.abort(); });
    renderTrace();
  }

  /* ================================================================ W9.2 mini Monte Carlo */

  function buildMiniMC() {
    const w = parts('w-mini-mc');
    const nS = ui.slider({ id: 'w92-n', label: 'Trials n', min: 10, max: 300, step: 10, value: MC.n, tag: 'project' });
    const seedId = 'w92-seed';
    const seedIn = el('input', { type: 'number', id: seedId, min: '0', max: '2147483647', step: '1', value: String(MC.baseSeed), inputmode: 'numeric', class: 'm09-seed' });
    const seedField = el('div', { class: 'field' }, el('label', { class: 'field-label', for: seedId }, 'Base seed ', ui.tag('site')), seedIn);
    const samp = ui.segmented({ id: 'w92-samp', label: 'Attitude sampling', value: 'project', options: [{ value: 'project', label: 'Project (uniform angle)' }, { value: 'uniform', label: 'Uniform rotation' }] });
    const ctl = ui.segmented({ id: 'w92-ctl', label: 'Nominal controller', value: 'PID', options: [{ value: 'PID', label: 'PID' }, { value: 'LQR', label: 'LQR' }] });
    const runB = ui.button({ label: 'Run campaign', kind: 'primary', icon: 'play' });
    const cancel = ui.button({ label: 'Cancel', kind: 'secondary', icon: 'cross' });
    cancel.disabled = true;
    [nS.el, seedField, samp.el, ctl.el].forEach(function (n) { w.controls.appendChild(n); });
    w.controls.appendChild(el('div', { class: 'field m09-actions' }, el('span', { class: 'field-label' }, 'Campaign'), el('div', { class: 'btn-row' }, runB, cancel)));

    const prog = progress(w.out, 'Mini Monte Carlo progress');
    const stats = el('div', { class: 'stats m09-stats' });
    w.out.appendChild(stats);
    const metric = ui.segmented({ id: 'w92-metric', label: 'Histogram metric', value: 'detumble', options: [
      { value: 'detumble', label: 'Detumble time' }, { value: 'peak', label: 'Peak rate' }, { value: 'settle', label: 'Settling time' }, { value: 'return', label: 'Time to NOMINAL' }] });
    w.out.appendChild(el('div', { class: 'm09-metric' }, metric.el));
    const histBox = el('div', { class: 'm09-hist' });
    w.out.appendChild(histBox);
    let hist = null, histKey = null, histW = 0;
    const histNote = el('p', { class: 'status-line m09-hist-note' });
    w.out.appendChild(histNote);
    // LOCAL (request P0): plot.scatter draws line labels before the points. The 6 deg/s line runs through
    // the densest band of trials, where its label would sit under the points, so it is named in the key below.
    // The two upper lines keep their labels: no trial can start above the 8√3 bound.
    const scatter = A.plot.scatter(w.out, { title: 'Initial angle against initial rate, coloured by peak rate', xLabel: 'initial angle (deg)', yLabel: '|ω₀| (deg/s)', points: [],
      colorScale: { min: 0, max: LIM.rateMaxDeg, label: 'peak rate (deg/s)' }, height: 280, xMin: 0, xMax: MC.maxAngleDeg, yMin: 0, yMax: LIM.rateMaxDeg + 2,
      hlines: [{ y: SM.enterRateDeg, color: '--line-thr' }, { y: RATE_BOUND, label: '8√3 = ' + f(RATE_BOUND, { fixed: 2 }) + ' deg/s sampling bound', color: '--text-2' },
        { y: LIM.rateMaxDeg, label: 'REQ-S1 ' + LIM.rateMaxDeg + ' deg/s', color: '--line-req' }] });
    w.out.appendChild(el('p', { class: 'm09-note m09-scatter-key' }, el('span', { class: 'm09-key-line', 'aria-hidden': 'true' }),
      'The lowest dashed line, at |ω₀| = ' + SM.enterRateDeg + ' deg/s, is the safe-mode entry threshold: a trial that starts above it enters SAFE_DETUMBLE at t = 0.'));
    window.addEventListener('resize', ui.debounce(function () { if (last && histBox.clientWidth !== histW) drawHist(); }, 200));
    const pick = el('div', { class: 'm09-pick', 'aria-live': 'polite' }, el('p', { class: 'muted' }, 'Click a point (or focus the plot and use the arrow keys) to inspect a trial and replay it in the simulator.'));
    w.out.appendChild(pick);
    const worstBox = el('div', { class: 'm09-worst' });
    w.out.appendChild(worstBox);

    let ctrl = null, last = null;
    function opts() {
      const seed = Math.max(0, Math.min(2147483647, Math.round(Number(seedIn.value) || 0)));
      seedIn.value = String(seed);
      return { n: nS.value, baseSeed: seed, sampling: samp.value, controller: ctl.value };
    }
    function statTiles(res, o) {
      const s = res.summary;
      stats.textContent = '';
      stats.appendChild(ui.stat({ value: s.L1.pass + '/' + s.n, label: 'REQ-L1: detumbled within 60 s; 95% lower bound ' + pct(s.L1.cpLower95), tag: 'derived' }));
      stats.appendChild(ui.stat({ value: s.final.pass + '/' + s.n, label: 'finally stable in NOMINAL', tag: 'derived' }));
      stats.appendChild(ui.stat({ value: s.safety.pass + '/' + s.n, label: 'safe (S1 and S2)', tag: 'derived' }));
      stats.appendChild(ui.stat({ value: f(s.worst.peakRate, { fixed: 2, unit: 'deg/s' }), label: 'worst peak rate (trial ' + s.worst.i + '), margin ' + f(LIM.rateMaxDeg - s.worst.peakRate, { fixed: 2 }), tag: 'derived' }));
      stats.appendChild(ui.stat({ value: String(s.entries), label: 'safe-mode entries; longest detumble ' + secs(s.detumble.max), tag: 'derived' }));
      stats.appendChild(ui.stat({ value: s.tReturnMax === null ? '–' : secs(s.tReturnMax), label: 'last return to NOMINAL', tag: 'derived' }));
    }
    function values(trials, key) {
      if (key === 'detumble') {
        const v = [];
        trials.forEach(function (t) { t.detumble.forEach(function (d) { if (d !== null) v.push(d); }); });
        return { v: v, label: 'detumble time per safe-mode entry (s)', note: trials.filter(function (t) { return t.entries === 0; }).length + ' trials never entered safe mode.' };
      }
      if (key === 'peak') return { v: trials.map(function (t) { return t.peakRate; }), label: 'peak rate |ω| (deg/s)', note: 'The dashed marker is the REQ-S1 limit.' };
      if (key === 'settle') {
        const v = trials.map(function (t) { return t.settle; }).filter(function (x) { return x !== null; });
        return { v: v, label: 'settling time (s)', note: (trials.length - v.length) + ' trials did not settle within the run.' };
      }
      const v = trials.filter(function (t) { return t.entries > 0 && t.tReturn !== null; }).map(function (t) { return t.tReturn; });
      const never = trials.filter(function (t) { return t.entries > 0 && t.tReturn === null; }).length;
      return { v: v, label: 'time of the last return to NOMINAL (s)', note: trials.filter(function (t) { return t.entries === 0; }).length + ' trials never left NOMINAL; ' + never + ' never returned.' };
    }
    function drawHist() {
      if (!last) return;
      const d = values(last.trials, metric.value);
      if (histKey !== metric.value) {
        if (hist) hist.destroy();
        histBox.textContent = '';
        hist = A.plot.histogram(histBox, { title: 'Distribution: ' + d.label, xLabel: d.label, yLabel: metric.value === 'detumble' ? 'entries' : 'trials', label: metric.value === 'detumble' ? 'entries' : 'trials', bins: [], height: 210 });
        histKey = metric.value;
      }
      if (!d.v.length) { hist.set({ bins: [], markers: [] }); histNote.textContent = 'No values for this metric. ' + d.note; return; }
      const bins = A.stats.histogram(d.v, { bins: 'auto' });
      const sorted = d.v.slice().sort(function (a, b) { return a - b; });
      const mean = A.stats.mean(d.v), p95 = A.stats.quantile(sorted, 0.95), mx = sorted[sorted.length - 1];
      const fx = function (x) { return f(x, { fixed: 2 }); };
      // Markers in priority order: the maximum first (drawn in the text colour so it never matches the bars),
      // then the REQ-S1 limit on the peak-rate plot, the 95th percentile and the mean. layoutMarkers leaves
      // out any label that would print over another label, a line or a bar; the note below gives all values.
      const cands = [{ x: mx, label: 'max ' + fx(mx), color: '--text', keep: true }];
      if (metric.value === 'peak') cands.push({ x: LIM.rateMaxDeg, label: 'REQ-S1 ' + LIM.rateMaxDeg, short: 'S1 ' + LIM.rateMaxDeg, color: '--line-req', keep: true });
      cands.push({ x: p95, label: '95th pct ' + fx(p95), short: 'p95 ' + fx(p95), color: '--warn' }, { x: mean, label: 'mean ' + fx(mean), color: '--text-2' });
      histW = histBox.clientWidth;
      hist.set({ bins: bins, markers: layoutMarkers(histBox, bins, cands) });
      histNote.textContent = d.v.length + ' values: mean ' + fx(mean) + ', 95th percentile ' + fx(p95) + ' (linear interpolation, "type 7"), maximum ' + fx(mx) + '. ' + d.note;
      hist.summary('Histogram of ' + d.label + ' over ' + d.v.length + ' values; mean ' + f(mean, { sig: 3 }) + ', 95th percentile ' + f(p95, { sig: 3 }) + ', maximum ' + f(mx, { sig: 3 }) + '.');
    }
    function showTrial(tr) {
      pick.textContent = '';
      if (!tr) return;
      pick.appendChild(el('h4', null, 'Trial ' + tr.i + ' (seed ' + tr.seed + ')'));
      const dl = el('dl', { class: 'readouts' });
      [['Initial angle', f(tr.angleDeg, { fixed: 1, unit: '°' })], ['|ω₀|', f(tr.w0NormDeg, { fixed: 2, unit: 'deg/s' })], ['Peak rate', f(tr.peakRate, { fixed: 2, unit: 'deg/s' })],
        ['Safe-mode entries', String(tr.entries)], ['Detumble', tr.detumble.length ? tr.detumble.map(secs).join(', ') : 'none needed'],
        ['Settling', tr.settle === null ? 'not settled' : secs(tr.settle)], ['Final error', f(tr.finalErr, { sig: 3, unit: '°' })]].forEach(function (p) {
        dl.appendChild(el('div', null, el('dt', null, p[0]), el('dd', null, p[1])));
      });
      pick.appendChild(dl);
      pick.appendChild(el('p', { class: 'm09-pick-badges' }, ui.badge(tr.L1 ? 'pass' : 'fail', 'L1'), ' ', ui.badge(tr.finalOK ? 'pass' : 'fail', 'Final'), ' ', ui.badge(tr.safetyOK ? 'pass' : 'fail', 'Safety')));
      pick.appendChild(el('p', null, ui.simLink('Replay trial ' + tr.i + ' in the simulator', replayHash(tr, last.opts.controller))));
    }
    function drawWorst() {
      worstBox.textContent = '';
      const top = last.trials.slice().sort(function (a, b) { return b.peakRate - a.peakRate || a.i - b.i; }).slice(0, 5);
      worstBox.appendChild(ui.table([{ key: 'i', label: 'Trial' }, { key: 'a', label: 'Initial angle', num: true }, { key: 'w', label: '|ω₀|', num: true }, { key: 'p', label: 'Peak rate', num: true },
        { key: 'd', label: 'Longest detumble', num: true }, { key: 'r', label: 'Replay' }],
        top.map(function (t) {
          return [String(t.i), f(t.angleDeg, { fixed: 1, unit: '°' }), f(t.w0NormDeg, { fixed: 2, unit: 'deg/s' }), f(t.peakRate, { fixed: 2, unit: 'deg/s' }),
            t.maxDetumble === null || t.maxDetumble === undefined || !t.entries ? 'none' : secs(t.maxDetumble), ui.simLink('Replay ' + t.i, replayHash(t, last.opts.controller))];
        }), { caption: 'Five worst trials by peak rate', rowHeaders: true, compact: true }));
    }
    function render(res, o) {
      last = { trials: res.trials, summary: res.summary, opts: o };
      statTiles(res, o);
      drawHist();
      const pts = res.trials.map(function (t) { return { x: t.angleDeg, y: t.w0NormDeg, c: t.peakRate, id: t.i, label: 'trial ' + t.i }; });
      scatter.set({ points: pts });
      scatter.summary(res.trials.length + ' trials: initial angle from ' + f(Math.min.apply(null, pts.map(function (p) { return p.x; })), { fixed: 1 }) + ' to ' +
        f(Math.max.apply(null, pts.map(function (p) { return p.x; })), { fixed: 1 }) + '°, |ω₀| up to ' + f(Math.max.apply(null, pts.map(function (p) { return p.y; })), { fixed: 2 }) + ' deg/s.');
      drawWorst();
      showTrial(res.trials[res.summary.worst.i] || res.trials[0]);
    }
    function run() {
      if (ctrl) ctrl.abort();
      const o = opts();
      const c = ctrl = newSignal();
      runB.disabled = true; cancel.disabled = false;
      ui.clearError(w.out);
      prog.set(0, 'Running ' + o.n + ' trials…');
      A.mc.run(o, {
        signal: c.signal,
        onProgress: function (done, n, ms) { if (c === ctrl) prog.set(done / n, 'Trial ' + done + ' of ' + n + ' (' + fmtT(ms / 1000) + ')'); }
      }).then(function (res) {
        if (c !== ctrl) return;
        ctrl = null; runB.disabled = false; cancel.disabled = true;
        if (!res.trials.length) { prog.text('Cancelled before any trial finished.'); return; }
        render(res, o);
        const s = res.summary;
        const msg = (res.cancelled ? 'Cancelled after ' + res.trials.length + ' trials (partial results). ' : 'Done: ' + s.n + ' trials in ' + fmtT(s.elapsedMs / 1000) + ', longest chunk ' + f(s.maxChunkMs, { sig: 2 }) + ' ms. ') +
          'REQ-L1 ' + s.L1.pass + '/' + s.n + ', lower bound ' + pct(s.L1.cpLower95) + (s.L1.cpLower95 >= LIM.l1Rate ? ' ≥ ' : ' < ') + pct(LIM.l1Rate, 3) + '.';
        prog.set(res.cancelled ? res.trials.length / o.n : 1, msg);
        ui.announce(msg);
      }, function (err) {
        if (c === ctrl) { ctrl = null; runB.disabled = false; cancel.disabled = true; }
        reportAsync(w.out, err);
      });
    }
    runB.addEventListener('click', run);
    cancel.addEventListener('click', function () { if (ctrl) ctrl.abort(); });
    metric.on('change', drawHist);
    scatter.onPick(function (id) { if (last) showTrial(last.trials.find(function (t) { return t.i === id; })); });
    seedIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    return { run: run };
  }

  /* ================================================================ W9.3 what does n/k prove? */

  function buildNProof() {
    const w = parts('w-np-proof');
    const ZERO = { id: 'z', label: 'zero failures', color: '--text-2', dash: [5, 4] };
    const nS = ui.slider({ id: 'w93-n', label: 'Trials n', min: 1, max: 500, step: 1, value: MC.n });
    const kS = ui.slider({ id: 'w93-k', label: 'Failures k', min: 0, max: 10, step: 1, value: 0 });
    const cS = ui.segmented({ id: 'w93-c', label: 'Confidence', value: '0.95', options: [{ value: '0.9', label: '90%' }, { value: '0.95', label: '95%' }, { value: '0.99', label: '99%' }] });
    [nS, kS, cS].forEach(function (c) { w.controls.appendChild(c.el); });
    const verdict = el('p', { class: 'm09-verdict', 'aria-live': 'polite' });
    w.out.appendChild(verdict);
    const set = readouts(w.out, ['Observed pass rate', 'One-sided lower bound', 'P(all pass | p = 95%)', 'Zero-failure n for 95% / 99% / 99.9%']);
    const p = A.plot.line(w.out, { height: 210, title: 'Lower bound on the pass rate against the number of trials', xLabel: 'n (trials)', yLabel: 'lower bound', margin: { left: 56 },
      x: { min: 1, max: 500 }, y: { min: 0.6, max: 1, auto: false },
      series: [{ id: 'k', label: 'with k failures', color: '--accent', width: 2 }],
      hlines: [{ y: LIM.l1Rate, label: 'REQ-L1 ' + pct(LIM.l1Rate, 3), color: '--line-req', dash: [5, 4] }] });

    // binomial luck
    const luckH = el('h4', { class: 'm09-sub' }, 'Binomial luck: 1,000 virtual campaigns');
    w.out.appendChild(luckH);
    const luckCtl = el('div', { class: 'widget-controls m09-luck-controls' });
    w.out.appendChild(luckCtl);
    const pS = ui.slider({ id: 'w93-p', label: 'True pass probability p', min: 0.8, max: 0.999, step: 0.001, value: 0.95 });
    const luckB = ui.button({ label: 'Run 1,000 campaigns of n trials', kind: 'secondary', icon: 'play' });
    luckCtl.appendChild(pS.el);
    luckCtl.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Virtual campaigns'), el('div', { class: 'btn-row' }, luckB)));
    const luckOut = el('p', { class: 'status-line m09-luck', 'aria-live': 'polite' }, 'Press the button to simulate 1,000 campaigns at the true pass probability.');
    w.out.appendChild(luckOut);
    const luckHist = A.plot.histogram(w.out, { title: 'Failures per campaign', xLabel: 'failures in a campaign', yLabel: 'campaigns', bins: [], height: 190, label: 'campaigns' });
    let curveKey = '', luckSeed = 7;
    // Both depend only on (k, confidence), so each is computed once per pair and reused:
    // the n slider then costs one cpLower call per step (§7.6: no main-thread task > 100 ms).
    const curveCache = new Map(), needCache = new Map();
    const NEED_MAX = 5000;

    function conf() { return Number(cS.value); }
    /** Bound-against-n curve for k failures, sampled every trial to 100 and every 4th above. */
    function curveFor(k, C) {
      const key = k + '|' + C;
      let c = curveCache.get(key);
      if (c) return c;
      const xs = [], ys = [], zx = [], zy = [];
      for (let n = 1; n <= 500; n += (n < 100 ? 1 : 4)) {
        zx.push(n); zy.push(Math.pow(1 - C, 1 / n));
        if (n > k) { xs.push(n); ys.push(A.stats.cpLower(n, n - k, C)); }
      }
      c = { xs: Float64Array.from(xs), ys: Float64Array.from(ys), zx: Float64Array.from(zx), zy: Float64Array.from(zy) };
      curveCache.set(key, c);
      return c;
    }
    /**
     * Smallest number of trials m with k failures whose lower bound reaches REQ-L1, or null
     * beyond NEED_MAX. For fixed k the bound cpLower(m, m - k, C) rises with m, so bisect.
     */
    function needFor(k, C) {
      const key = k + '|' + C;
      if (needCache.has(key)) return needCache.get(key);
      let lo = k + 1, hi = NEED_MAX, res = null;
      if (A.stats.cpLower(hi, hi - k, C) >= LIM.l1Rate) {
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (A.stats.cpLower(m, m - k, C) >= LIM.l1Rate) hi = m; else lo = m + 1;
        }
        res = lo;
      }
      needCache.set(key, res);
      return res;
    }
    function curve() {
      const k = kS.value, C = conf(), key = k + '|' + C;
      if (key === curveKey) return;
      curveKey = key;
      const c = curveFor(k, C);
      p.set('k', c.xs, c.ys);
      if (k > 0) { p.addSeries(ZERO); p.set('z', c.zx, c.zy); } else p.removeSeries('z');
    }
    function update() {
      const n = nS.value, C = conf();
      let k = kS.value;
      ui.clearError(w.out);
      if (k > n) { kS.set(n); k = n; }
      curve();
      p.setCursor(n);
      const lb = A.stats.cpLower(n, n - k, C);
      const ok = lb >= LIM.l1Rate;
      verdict.textContent = '';
      verdict.appendChild(ui.badge(ok ? 'pass' : 'fail', ok ? 'DEMONSTRATED' : 'NOT DEMONSTRATED'));
      verdict.appendChild(document.createTextNode(' ' + (n - k) + '/' + n + ' passes: the pass rate is at least ' + pct(lb) + ' with ' + pct(C, 3) + ' confidence, ' +
        (ok ? 'which meets' : 'which falls short of') + ' REQ-L1’s ' + pct(LIM.l1Rate, 3) + '.'));
      const n0 = needFor(k, C);
      const need = n0 === null ? null : Math.max(n, n0);
      const nz = [0.95, 0.99, 0.999].map(function (R) { return A.stats.zeroFailureN(R, C).toLocaleString('en-GB'); }).join(' / ');
      set([pct((n - k) / n, 3), pct(lb), pct(Math.pow(LIM.l1Rate, n), 3), nz]);
      if (!ok && need !== null) verdict.appendChild(document.createTextNode(' With ' + k + ' failure' + (k === 1 ? '' : 's') + ', about ' + need + ' trials in total are needed.'));
      p.summary('Lower bound ' + pct(lb) + ' for ' + (n - k) + ' of ' + n + ' at ' + pct(C, 3) + ' confidence; ' + (ok ? 'REQ-L1 demonstrated.' : 'REQ-L1 not demonstrated.'));
    }
    function luck() {
      const n = nS.value, pp = pS.value;
      const rnd = A.rng.mulberry32(1000 + luckSeed++);
      const counts = new Map();
      let clean = 0;
      for (let c = 0; c < 1000; c++) {
        let fails = 0;
        for (let i = 0; i < n; i++) if (rnd() >= pp) fails++;
        if (!fails) clean++;
        counts.set(fails, (counts.get(fails) || 0) + 1);
      }
      const mx = Math.max.apply(null, Array.from(counts.keys()));
      const bins = [];
      for (let k = 0; k <= mx; k++) bins.push({ x0: k - 0.5, x1: k + 0.5, count: counts.get(k) || 0 });
      luckHist.set({ bins: bins, markers: [] });
      const expct = Math.pow(pp, n);
      luckOut.textContent = clean + ' of 1,000 campaigns of ' + n + ' trials (' + pct(clean / 1000, 3) + ') showed a perfect ' + n + '/' + n + ' at a true pass rate of ' + pct(pp, 4) +
        '; the expected fraction is p^n = ' + pct(expct, 3) + '.';
      luckHist.summary('Failures per campaign over 1,000 campaigns of ' + n + ' trials at p = ' + pp + ': ' + clean + ' campaigns had no failure.');
    }
    const go = ui.debounce(update, 40);
    nS.on('change', go);
    kS.on('change', go);
    cS.on('change', go);
    luckB.addEventListener('click', luck);
    update();
    luck();
  }

  /* ================================================================ W9.4 sampling bias */

  function buildSamplingBias() {
    const w = parts('w-sampling-bias');
    const N = 3000, W = 5, MAX = MC.maxAngleDeg;
    const reseed = ui.button({ label: 'Draw new samples', kind: 'secondary', icon: 'reset' });
    w.controls.appendChild(el('div', { class: 'field' }, el('span', { class: 'field-label' }, N.toLocaleString('en-GB') + ' samples each way'), el('div', { class: 'btn-row' }, reseed)));
    const set = readouts(w.out, ['Below 30°, uniform angle (project)', 'Below 30°, uniform rotation', 'Median angle, uniform angle', 'Median angle, uniform rotation']);
    const hist = A.plot.histogram(w.out, { title: 'Initial rotation angle', xLabel: 'rotation angle (deg)', yLabel: 'samples', bins: [], height: 230, label: 'uniform angle (project)', color: '--accent' });
    const D2R = A.units.D2R;
    const Z = (MAX * D2R - Math.sin(MAX * D2R)) / Math.PI;      // mass of (1 - cos θ)/π on [0, MAX]
    function cdfU(thDeg) { const t = thDeg * D2R; return (t - Math.sin(t)) / Math.PI / Z; }
    let seed = MC.baseSeed;
    function run() {
      const nb = Math.round(MAX / W);
      const bp = [], bu = [];
      for (let b = 0; b < nb; b++) { bp.push({ x0: b * W, x1: (b + 1) * W, count: 0 }); bu.push({ x0: b * W, x1: (b + 1) * W, count: 0 }); }
      const ap = [], au = [];
      for (let i = 0; i < N; i++) {
        const a = A.mc.sampleTrial(seed, i, { sampling: 'project' }).angleDeg;
        const u = A.mc.sampleTrial(seed, i, { sampling: 'uniform' }).angleDeg;
        ap.push(a); au.push(u);
        bp[Math.min(nb - 1, Math.floor(a / W))].count++;
        bu[Math.min(nb - 1, Math.floor(u / W))].count++;
      }
      const curveP = [[0, N * W / MAX], [MAX, N * W / MAX]];
      const curveU = [];
      for (let b = 0; b < nb; b++) { const x = (b + 0.5) * W; curveU.push([x, N * (cdfU((b + 1) * W) - cdfU(b * W))]); }
      hist.set({ bins: bp, series: [{ label: 'uniform rotation (≤ ' + MAX + '°)', bins: bu, color: '--warn', dash: [] }],
        curves: [{ label: 'theory, uniform angle', points: curveP, color: '--text-2', dash: [5, 4] }, { label: 'theory, (1 − cos θ)/π', points: curveU, color: '--text', dash: [2, 3] }],
        markers: [{ x: 30, label: '30°', color: '--text-2' }] });
      const below = function (arr) { return arr.filter(function (x) { return x < 30; }).length / arr.length; };
      const med = function (arr) { return A.stats.quantile(arr.slice().sort(function (a, b) { return a - b; }), 0.5); };
      set([pct(below(ap), 3) + ' (theory ' + pct(30 / MAX, 3) + ')', pct(below(au), 3) + ' (theory ' + pct(cdfU(30), 3) + ')', f(med(ap), { fixed: 1, unit: '°' }), f(med(au), { fixed: 1, unit: '°' })]);
      hist.summary('Rotation angles from ' + N + ' samples each: ' + pct(below(ap), 3) + ' of uniform-angle samples and ' + pct(below(au), 3) + ' of uniform-rotation samples fall below 30°.');
    }
    reseed.addEventListener('click', function () { seed += 1; run(); });
    run();
  }

  /* ================================================================ W9.5 choosing a metric (Kd sweep) */

  function buildPlateau() {
    const w = parts('w-plateau');
    const KD = [0.005, 0.01, 0.02, 0.05, 0.1];
    const SEED_A = MC.baseSeed, SEED_B = 4242, NT = 30, DUR = 60;
    const runB = ui.button({ label: 'Run sweep (5 × ' + NT + ' trials)', kind: 'primary', icon: 'play' });
    const cancel = ui.button({ label: 'Cancel', kind: 'secondary', icon: 'cross' });
    cancel.disabled = true;
    const fresh = ui.toggle({ id: 'w95-fresh', label: 'Evaluate on fresh seed set B', checked: false });
    w.controls.appendChild(el('div', { class: 'field m09-actions' }, el('span', { class: 'field-label' }, 'Detumble-gain sweep'), el('div', { class: 'btn-row' }, runB, cancel)));
    w.controls.appendChild(fresh.el);
    const prog = progress(w.out, 'Gain sweep progress');
    prog.set(0, 'Press "Run sweep" to simulate ' + KD.length * NT + ' trials of ' + DUR + ' s on seed set A.');
    const tableBox = el('div');
    w.out.appendChild(tableBox);
    const grid = el('div', { class: 'grid-2' });
    const g1 = el('div'), g2 = el('div');
    grid.appendChild(g1); grid.appendChild(g2);
    w.out.appendChild(grid);
    const bars1 = A.plot.bars(g1, { title: 'REQ-L1 pass rate (seed set A)', items: [], unit: '%', xLabel: 'pass rate (%)' });
    const bars2 = A.plot.bars(g2, { title: 'Mean detumble time (seed set A)', items: [], unit: 's', xLabel: 'mean detumble time (s)' });
    const gap = el('p', { class: 'status-line m09-gap', 'aria-live': 'polite' });
    w.out.appendChild(gap);
    const res = { A: null, B: null };
    let ctrl = null;

    function sweep(seed, label, offset, total) {
      const out = [];
      let chain = Promise.resolve();
      KD.forEach(function (kd, j) {
        chain = chain.then(function () {
          if (ctrl && ctrl.signal.aborted) return null;
          return A.mc.run({ n: NT, baseSeed: seed, duration: DUR, config: { detumble: { Kd: kd } } }, {
            signal: ctrl.signal,
            onProgress: function (done) { prog.set((offset + j * NT + done) / total, 'Seed set ' + label + ': Kd = ' + kd + ', trial ' + done + ' of ' + NT); }
          }).then(function (r) { if (!r.cancelled) out.push({ kd: kd, s: r.summary }); });
        });
      });
      return chain.then(function () { return out.length === KD.length ? out : null; });
    }
    function draw() {
      tableBox.textContent = '';
      if (!res.A) return;
      const withB = fresh.value && res.B;
      const cols = [{ key: 'k', label: 'Kd (N m s/rad)' }, { key: 'p', label: 'L1 pass, A', num: true }, { key: 'm', label: 'Mean detumble, A', num: true }, { key: 'x', label: 'Max detumble, A', num: true }];
      if (withB) cols.push({ key: 'pb', label: 'L1 pass, B', num: true }, { key: 'mb', label: 'Mean detumble, B', num: true }, { key: 'd', label: 'Shift B − A', num: true });
      const rows = res.A.map(function (a, j) {
        const r = [String(a.kd), a.s.L1.pass + '/' + a.s.n, secs(a.s.detumble.mean), secs(a.s.detumble.max)];
        if (withB) {
          const b = res.B[j];
          r.push(b.s.L1.pass + '/' + b.s.n, secs(b.s.detumble.mean), f(b.s.detumble.mean - a.s.detumble.mean, { fixed: 2, unit: 's', sign: true }));
        }
        return r;
      });
      tableBox.appendChild(ui.table(cols, rows, { caption: 'Detumble-gain sweep: ' + NT + ' trials of ' + DUR + ' s per gain', rowHeaders: true, compact: true }));
      bars1.set({ items: res.A.map(function (a) { return { label: 'Kd ' + a.kd, value: 100 * a.s.L1.rate, color: '--accent', text: pct(a.s.L1.rate, 3) }; }) });
      bars2.set({ items: res.A.map(function (a) { return { label: 'Kd ' + a.kd, value: a.s.detumble.mean, color: '--warn', text: secs(a.s.detumble.mean) }; }) });
      let best = 0;
      res.A.forEach(function (a, j) { if (a.s.detumble.mean < res.A[best].s.detumble.mean) best = j; });
      const flat = res.A.every(function (a) { return a.s.L1.pass === res.A[0].s.L1.pass; });
      let msg = (flat ? 'The pass rate is identical for every gain (' + res.A[0].s.L1.pass + '/' + NT + '), so it cannot rank them; ' : 'The pass rate varies; ') +
        'the mean detumble time ranges from ' + secs(Math.min.apply(null, res.A.map(function (a) { return a.s.detumble.mean; }))) + ' to ' + secs(Math.max.apply(null, res.A.map(function (a) { return a.s.detumble.mean; }))) +
        '. Best on set A: Kd = ' + res.A[best].kd + ' with a mean of ' + secs(res.A[best].s.detumble.mean) + '.';
      if (withB) {
        // Report the A-to-B change for every gain, not only the winner's: a shift common to all gains is
        // seed-set variation; selection optimism would show as the winner shifting more than the rest.
        const shifts = res.A.map(function (a, j) { return res.B[j].s.detumble.mean - a.s.detumble.mean; });
        const meanShift = A.stats.mean(shifts);
        const order = function (set) { return set.map(function (x, j) { return j; }).sort(function (i, j) { return set[i].s.detumble.mean - set[j].s.detumble.mean; }).join(','); };
        const sameRank = order(res.A) === order(res.B);
        const fs = function (x) { return f(x, { fixed: 2, unit: 's', sign: true }); };
        const rel = shifts[best] - meanShift;
        msg += ' On fresh set B the mean detumble time shifts by ' + fs(Math.min.apply(null, shifts)) + ' to ' + fs(Math.max.apply(null, shifts)) + ' across the gains (mean ' + fs(meanShift) + '); the set-A winner shifts by ' +
          fs(shifts[best]) + ', ' + f(Math.abs(rel), { fixed: 2, unit: 's' }) + (rel < 0 ? ' less' : ' more') + ' than the mean shift. ' +
          (sameRank ? 'The ranking is unchanged, so this is seed-set variation, not selection optimism: the pass-rate plateau, not selection, is the lesson here.'
            : 'The ranking changes on set B, so the choice made on set A does not carry over: evaluate on more trials before choosing.');
      }
      else if (fresh.value) msg += ' Run the sweep again to evaluate set B.';
      gap.textContent = msg;
    }
    runB.addEventListener('click', function () {
      if (ctrl) ctrl.abort();
      ctrl = newSignal();
      runB.disabled = true; cancel.disabled = false;
      const needB = fresh.value;
      const total = KD.length * NT * (needB ? 2 : 1);
      sweep(SEED_A, 'A', 0, total).then(function (a) {
        if (!a) return null;
        res.A = a;
        if (!needB) return null;
        return sweep(SEED_B, 'B', KD.length * NT, total).then(function (b) { if (b) res.B = b; });
      }).then(function () {
        const cancelled = ctrl && ctrl.signal.aborted;
        ctrl = null; runB.disabled = false; cancel.disabled = true;
        prog.set(cancelled ? 0 : 1, cancelled ? 'Sweep cancelled.' : 'Sweep complete.');
        draw();
      }, function (err) { ctrl = null; runB.disabled = false; cancel.disabled = true; reportAsync(w.out, err); });
    });
    cancel.addEventListener('click', function () { if (ctrl) ctrl.abort(); });
    fresh.on('change', function () {
      draw();
      if (fresh.value && res.A && !res.B && !ctrl) gap.textContent += ' Press "Run sweep" to add set B.';
    });
  }

  /* ================================================================ page */

  ui.ready(function () {
    ui.mountChrome({ page: 'm09' });
    buildMetricsTable();
    buildTestMatrix();
    const mini = buildMiniMC();
    buildNProof();
    buildSamplingBias();
    buildPlateau();

    ui.quiz(document.getElementById('quiz'), [
      { q: '60 of 60 trials pass. What is the one-sided 95% lower bound on the pass rate?',
        options: ['100%.', 'About 99%.', 'About 95.1%.'], correct: 2,
        explain: 'With zero failures the Clopper–Pearson bound is \\(\\alpha^{1/n}=0.05^{1/60}=0.9513\\). Observing 100% does not mean the true rate is 100%; a design that passes 95.1% of the time would still produce 60/60 one time in twenty.' },
      { q: 'One failure in 60 trials. Is “at least 95% at 95% confidence” demonstrated?',
        options: ['Yes: 59/60 = 98.3% > 95%.', 'No: the lower bound drops to about 92.3%.', 'Only with LQR.'], correct: 1,
        explain: 'The point estimate is 98.3%, but the exact one-sided bound for 59/60 is 0.9234, below 0.95. With that single failure it takes 93 trials in total, 33 more, to demonstrate 95% again.' },
      { q: 'Why report the worst case and not only the mean?',
        options: ['The mean is biased.', 'Safety requirements are “never” statements about the tail.', 'The histogram is too wide.'], correct: 1,
        explain: 'REQ-S1 says the rate shall never exceed 15 deg/s. One trial over the limit fails it however good the average is, so the evidence is the maximum (and a high percentile), reported with its sampling envelope.' }
    ]);
    ui.renderProvenance(document.getElementById('provenance'), 'm09');
    titleTags(document.getElementById('main'));
    ui.typeset(document.body);
    // LOCAL (request P0): equations can overflow only after the KaTeX fonts load, so mark the scroll boxes again then.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ui.markScrollable(document.body); });
    ui.linkTerms(document.body);
    setTimeout(mini.run, 0);
  });
})();
