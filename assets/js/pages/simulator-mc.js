/**
 * simulator-mc.js: the simulator's Monte Carlo panel (#mc, package P2).
 *
 * ADCS.simPage.createMC(host, {onReplay(trial, opts)}) builds the campaign inputs, a chunked
 * Run/Cancel with progress, summary cards (REQ-L1 with its Clopper–Pearson bound, final
 * stability, safety, worst rate, detumble times), a histogram with a metric picker and
 * quantile or fixed bins, a scatter of initial angle against |ω0| coloured by peak rate, the
 * ten worst trials with Replay buttons, and a CSV download. Campaigns use ADCS.mc.run with the
 * site-default gains, so results stay comparable with the project's.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const page = A.simPage = A.simPage || {};

  function pct(x) { const v = 100 * x; return ui.fmt(v, { fixed: Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1, unit: '%' }); }
  function sec(x) { return x === null || x === undefined || !isFinite(x) ? '–' : ui.fmt(x, { fixed: 2, unit: 's' }); }

  const METRICS = [
    { id: 'detumble', label: 'Detumble time', unit: 's', per: 'safe-mode entries', dp: 2,
      values: function (trials) { const v = []; trials.forEach(function (t) { t.detumble.forEach(function (d) { if (d !== null) v.push(d); }); }); return v; },
      limit: { x: 60, label: 'REQ-L1 limit 60 s' },
      skipped: function (trials) { const n = trials.filter(function (t) { return t.entries === 0; }).length; return n ? n + ' trial' + (n === 1 ? '' : 's') + ' never entered safe mode, so ' + (n === 1 ? 'it has' : 'they have') + ' no detumble time.' : ''; } },
    { id: 'peak', label: 'Peak rate', unit: 'deg/s', per: 'trials', dp: 2,
      values: function (trials) { return trials.map(function (t) { return t.peakRate; }); },
      limit: { x: 15, label: 'REQ-S1 limit 15 deg/s' } },
    { id: 'settle', label: 'Settling time', unit: 's', per: 'trials', dp: 2,
      values: function (trials) { return trials.filter(function (t) { return t.settle !== null; }).map(function (t) { return t.settle; }); },
      skipped: function (trials) { const n = trials.filter(function (t) { return t.settle === null; }).length; return n ? n + ' trial' + (n === 1 ? '' : 's') + ' never settled.' : ''; } },
    { id: 'finalErr', label: 'Final error', unit: 'deg', per: 'trials', dp: 3,
      values: function (trials) { return trials.map(function (t) { return t.finalErr; }); },
      limit: { x: 2, label: 'REQ-F2 limit 2°' } },
    { id: 'return', label: 'Time to return to NOMINAL', unit: 's', per: 'trials', dp: 2,
      values: function (trials) { return trials.filter(function (t) { return t.entries > 0 && t.tReturn !== null; }).map(function (t) { return t.tReturn; }); },
      skipped: function (trials) {
        const never = trials.filter(function (t) { return t.entries === 0; }).length;
        const stuck = trials.filter(function (t) { return t.entries > 0 && t.tReturn === null; }).length;
        const parts = [];
        if (never) parts.push(never + ' never entered safe mode');
        if (stuck) parts.push(stuck + ' never returned');
        return parts.length ? 'Not shown: ' + parts.join(' and ') + '.' : '';
      } }
  ];

  /**
   * Build the Monte Carlo panel inside host.
   * @param {HTMLElement} host
   * @param {{onReplay:function(Object, Object):void}} hooks onReplay(trial, campaignOptions)
   * @returns {{run:function():void, cancel:function():void, setInputs:function({n?:number, baseSeed?:number}):void, el:HTMLElement}}
   */
  page.createMC = function (host, hooks) {
    const D = A.mc.DEFAULTS;
    const card = el('div', { class: 'mc-card' });
    host.appendChild(card);

    /* ------------------------------------------------ inputs */
    const inputs = el('div', { class: 'mc-inputs' });
    const inN = ui.slider({ id: 'mc-n', label: 'Number of trials', min: 10, max: 500, step: 1, value: D.n, tag: 'project',
      help: 'The project ran 60. More trials tighten the lower bound but take longer.' });
    const seedId = 'mc-seed';
    const seedInput = el('input', { type: 'number', id: seedId, min: 0, max: 4294967295, step: 1, inputmode: 'numeric', value: String(D.baseSeed), 'aria-describedby': seedId + '-help' });
    const seedErr = el('p', { class: 'field-error', id: seedId + '-err', 'aria-live': 'polite' });
    const seedField = el('div', { class: 'field sim-number-field' },
      el('div', { class: 'field-head' }, el('label', { for: seedId, class: 'field-label' }, 'Base seed'), ui.tag('site')),
      seedInput,
      el('p', { class: 'field-help', id: seedId + '-help' }, 'Trial i uses its own seed derived from this one, so the same base seed always gives the same campaign.'),
      seedErr);
    const inCtl = ui.segmented({ id: 'mc-ctl', label: 'Nominal controller', value: D.controller, tag: 'project',
      options: [{ value: 'PID', label: 'PID' }, { value: 'LQR', label: 'LQR' }] });
    const inSamp = ui.segmented({ id: 'mc-sampling', label: 'Attitude sampling', value: D.sampling,
      options: [{ value: 'project', label: 'Random axis, uniform angle' }, { value: 'uniform', label: 'Uniform rotation' }] });
    inSamp.el.appendChild(el('p', { class: 'field-help' }, ui.tag('project'), ' a random axis with an angle uniform between 0 and the maximum. ',
      ui.tag('option'), ' rotations uniform over all attitudes within the maximum angle, which puts more trials at large angles.'));
    const inAng = ui.slider({ id: 'mc-ang', label: 'Maximum initial angle', min: 0, max: 180, step: 1, value: D.maxAngleDeg, unit: 'deg', tag: 'project' });
    const inRate = ui.slider({ id: 'mc-rate', label: 'Initial rate bound, per axis', min: 0, max: 15, step: 0.1, value: D.rateBoundDeg, unit: 'deg/s', tag: 'project',
      help: 'Each axis is drawn uniformly between minus and plus this bound.' });
    const inDist = ui.slider({ id: 'mc-dist', label: 'Disturbance bound, per axis', min: 0, max: 0.05, step: 0.001, value: D.distBound * 1000, unit: 'mN m', tag: 'project',
      help: 'The project bound is 2 × 10⁻⁵ N m = 0.02 mN m per axis.' });
    const inDur = ui.slider({ id: 'mc-dur', label: 'Trial duration', min: 30, max: 300, step: 10, value: D.duration, unit: 's', tag: 'site' });
    [inN.el, seedField, inCtl.el, inSamp.el, inAng.el, inRate.el, inDist.el, inDur.el].forEach(function (n) { inputs.appendChild(n); });
    card.appendChild(inputs);
    card.appendChild(el('p', { class: 'sim-note mc-fixed-note' }, 'Safe mode is always on in a campaign and the fault is off. Trials use the site-default gains and the project thresholds, not the controls of the simulator above, so every campaign is comparable with the project’s.'));

    /* ------------------------------------------------ run row */
    const runBtn = ui.button({ label: 'Run campaign', kind: 'primary', icon: 'play' });
    const cancelBtn = ui.button({ label: 'Cancel', icon: 'cross' });
    cancelBtn.disabled = true;
    const bar = el('span');
    const progress = el('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': 'Campaign progress' }, bar);
    const status = el('p', { class: 'status-line' }, 'Not run yet.');
    card.appendChild(el('div', { class: 'mc-run-row' }, runBtn, cancelBtn, el('div', { class: 'mc-progress' }, progress, status)));
    const errBox = el('div');
    card.appendChild(errBox);

    /* ------------------------------------------------ results */
    const results = el('div', { class: 'mc-results' });
    results.hidden = true;
    const resultNote = el('p', { class: 'mc-caption', 'aria-live': 'polite' });
    const statsBox = el('div', { class: 'stats mc-stats' });
    const histTools = el('div', { class: 'mc-plot-tools' });
    const histBox = el('div');
    const histCaption = el('p', { class: 'mc-caption' });
    const scatterBox = el('div');
    const pickLine = el('div', { class: 'mc-pick', 'aria-live': 'polite' });
    const worstBox = el('div', { class: 'mc-worst' });
    const csvBtn = ui.button({ label: 'Download MC CSV', icon: 'download' });
    results.appendChild(el('h3', null, 'Results'));
    results.appendChild(resultNote);
    results.appendChild(statsBox);
    results.appendChild(el('div', { class: 'mc-plots' },
      el('div', null, histTools, histBox, histCaption),
      el('div', null, scatterBox, el('p', { class: 'mc-caption' }, 'Each dot is one trial. Select a dot (or focus the plot and use the arrow keys, then Enter) to see it and replay it in the simulator.'), pickLine)));
    results.appendChild(worstBox);
    results.appendChild(el('div', { class: 'mc-actions' }, csvBtn));
    card.appendChild(results);

    const note = el('p', { class: 'mc-note' },
      'The original project reported 100% pass and a worst rate of 13.22 deg/s with its own gains and seed ', ui.tag('project'),
      '. With this site’s defaults and seed 42: 60/60, worst 12.47 deg/s ', ui.tag('derived'), '.');
    card.appendChild(note);

    const metricSel = ui.select({ id: 'mc-metric', label: 'Histogram of', value: 'detumble',
      options: METRICS.map(function (m) { return { value: m.id, label: m.label + ' (' + m.unit + ')' }; }) });
    const fixedT = ui.toggle({ id: 'mc-fixed', label: 'Fixed-width bins', checked: false,
      help: 'Off: quantile bins, each holding about the same number of values, drawn as a density so the area is the count.' });
    histTools.appendChild(metricSel.el);
    histTools.appendChild(fixedT.el);

    let busy = false, signal = null, last = null, hist = null, scatter = null;

    function readOpts() {
      const seed = Number(seedInput.value);
      if (!(seedInput.value.trim() !== '' && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295)) {
        seedInput.setAttribute('aria-invalid', 'true');
        seedErr.textContent = 'Use a whole number between 0 and 4294967295.';
        return null;
      }
      seedInput.removeAttribute('aria-invalid');
      seedErr.textContent = '';
      return {
        n: Math.round(inN.value), baseSeed: seed, controller: inCtl.value, sampling: inSamp.value,
        maxAngleDeg: inAng.value, rateBoundDeg: inRate.value, distBound: inDist.value / 1000, duration: inDur.value
      };
    }
    seedInput.addEventListener('input', function () { if (seedInput.getAttribute('aria-invalid')) readOpts(); });

    function setBusy(b) {
      busy = b;
      runBtn.disabled = b;
      cancelBtn.disabled = !b;
      [inN, inCtl, inSamp, inAng, inRate, inDist, inDur].forEach(function (c) { c.disable(b); });
      seedInput.disabled = b;
    }
    function setProgress(done, n, ms) {
      const p = n ? Math.round(100 * done / n) : 0;
      bar.style.width = p + '%';
      progress.setAttribute('aria-valuenow', String(p));
      progress.setAttribute('aria-valuetext', 'trial ' + done + ' of ' + n);
      status.textContent = 'trial ' + done + '/' + n + ' · ' + ui.fmtTime(ms / 1000);
    }

    function run() {
      if (busy) return;
      const opts = readOpts();
      if (!opts) { seedInput.focus(); return; }
      ui.clearError(errBox);
      setBusy(true);
      setProgress(0, opts.n, 0);
      status.textContent = 'trial 0/' + opts.n + ' · starting';
      signal = { aborted: false };
      A.mc.run(opts, { signal: signal, onProgress: setProgress }).then(function (res) {
        setBusy(false);
        last = { res: res, opts: opts };
        show(res, opts);
        const s = res.summary;
        const msg = (res.cancelled ? 'Campaign cancelled after ' + s.n + ' of ' + opts.n + ' trials. ' : 'Campaign complete: ') +
          s.L1.pass + ' of ' + s.n + ' trials pass REQ-L1; worst peak rate ' + ui.fmt(s.worst.peakRate, { fixed: 2 }) + ' deg/s.';
        status.textContent = (res.cancelled ? 'cancelled at ' : 'done: ') + s.n + '/' + opts.n + ' · ' + ui.fmtTime(s.elapsedMs / 1000);
        ui.announce(msg);
      }, function (err) {
        setBusy(false);
        ui.showError(errBox, err);
        status.textContent = 'Not run.';
        if (!(err instanceof RangeError)) throw err;
      });
    }
    function cancel() { if (signal) signal.aborted = true; }
    runBtn.addEventListener('click', run);
    cancelBtn.addEventListener('click', cancel);

    /* ------------------------------------------------ results rendering */
    function statCard(value, label, tag, badge, extra) {
      // word joiners inside |x| stop a line break straight after the opening bar
      const s = ui.stat({ value: value, label: label.replace(/\|([^|\s]+)\|/g, '|\u2060$1\u2060|'), tag: tag });
      if (badge) s.appendChild(badge);
      if (extra) s.appendChild(el('span', { class: 'stat-note' }, extra));
      return s;
    }

    function show(res, opts) {
      const s = res.summary, n = s.n;
      const L = A.params.LIMITS;
      results.hidden = false;
      resultNote.textContent = (res.cancelled ? 'Partial results: cancelled after ' + n + ' of ' + opts.n + ' trials. ' : '') +
        n + ' trials, base seed ' + opts.baseSeed + ', ' + opts.controller + ', ' + (opts.sampling === 'project' ? 'random axis with uniform angle' : 'uniform rotations') +
        ' up to ' + opts.maxAngleDeg + '°, rates up to ±' + opts.rateBoundDeg + ' deg/s per axis, ' + opts.duration + ' s each.';
      statsBox.textContent = '';
      if (!n) { statsBox.appendChild(el('p', { class: 'muted' }, 'No trial finished before the campaign was cancelled.')); return; }
      const meets = s.L1.rate >= L.l1Rate;
      statsBox.appendChild(statCard(s.L1.pass + '/' + n + ' (' + pct(s.L1.rate) + ')', 'REQ-L1: every safe-mode entry detumbled within ' + L.detumbleS + ' s', 'derived',
        ui.badge(meets ? 'pass' : 'fail', meets ? 'meets the ' + pct(L.l1Rate) + ' target' : 'below the ' + pct(L.l1Rate) + ' target')));
      const lb = s.L1.cpLower95;
      const demo = lb >= L.l1Rate;
      const oneLess = s.L1.pass > 0 ? A.stats.cpLower(n, s.L1.pass - 1, 0.95) : NaN;
      statsBox.appendChild(statCard(ui.fmt(lb, { fixed: 3 }), 'One-sided 95% lower bound on the REQ-L1 pass probability (Clopper–Pearson)', 'derived',
        ui.badge(demo ? 'pass' : 'fail', demo ? 'demonstrated at 95% confidence' : 'not demonstrated at 95% confidence'),
        isFinite(oneLess) ? 'One more failure would give ' + ui.fmt(oneLess, { fixed: 3 }) + '.' : null));
      statsBox.appendChild(statCard(s.final.pass + '/' + n + ' (' + pct(s.final.rate) + ')', 'Final nominal stability: NOMINAL, error < ' + L.errDeg + '° and |ω| < ' + L.rateDeg + ' deg/s at the end', 'derived'));
      statsBox.appendChild(statCard(s.safety.pass + '/' + n + ' (' + pct(s.safety.rate) + ')', 'Safety: REQ-S1 (rate ≤ ' + L.rateMaxDeg + ' deg/s) and REQ-S2 (torque within limits) in every trial', 'derived'));
      const worst = res.trials.find(function (t) { return t.i === s.worst.i; });
      // the worst peak can simply be the sampled starting rate; count the trials the controller did spin up
      const atInitialRate = !!worst && Math.abs(worst.peakRate - worst.w0NormDeg) < 1e-9;
      const spunUp = res.trials.filter(function (t) { return t.peakRate > t.w0NormDeg + 1e-9; });
      const spunUpMax = spunUp.reduce(function (m, t) { return Math.max(m, t.peakRate); }, -Infinity);
      statsBox.appendChild(statCard(ui.fmt(s.worst.peakRate, { fixed: 2, unit: 'deg/s' }), 'Worst peak rate (trial ' + s.worst.i + ')', 'derived', null,
        'Margin to REQ-S1: ' + ui.fmt(L.rateMaxDeg - s.worst.peakRate, { fixed: 2, unit: 'deg/s' }) + '.' +
        (atInitialRate ? ' It equals that trial’s initial rate, so the worst case is set by the sampled starting rate, not by the controller.' : '') +
        (spunUp.length
          ? ' ' + spunUp.length + ' of ' + n + ' trials peaked above their initial rate' + (atInitialRate ? ', the highest at ' + ui.fmt(spunUpMax, { fixed: 2, unit: 'deg/s' }) : '') + '.'
          : ' No trial peaked above its initial rate.')));
      statsBox.appendChild(statCard(s.detumble.count ? 'mean ' + sec(s.detumble.mean) : 'none', 'Detumble time over ' + s.detumble.count + ' safe-mode entries', 'derived', null,
        s.detumble.count ? '95th percentile ' + sec(s.detumble.p95) + ' · max ' + sec(s.detumble.max) + '.' : 'No trial entered safe mode.'));
      drawHist();
      drawScatter(res.trials);
      drawWorst(res.trials, opts);
      pickLine.textContent = '';
    }

    function drawHist() {
      if (!last) return;
      const trials = last.res.trials;
      const m = METRICS.find(function (x) { return x.id === metricSel.value; }) || METRICS[0];
      const vals = m.values(trials).filter(function (v) { return isFinite(v); });
      if (hist) { hist.destroy(); hist = null; }
      histBox.textContent = '';
      const skipped = m.skipped ? m.skipped(trials) : '';
      if (!vals.length) { histCaption.textContent = 'No values to show. ' + skipped; return; }
      const fixed = fixedT.value;
      const raw = A.stats.histogram(vals, { bins: 'auto', mode: fixed ? 'fixed' : 'quantile' });
      const bins = fixed ? raw : raw.map(function (b) {
        const w = b.x1 - b.x0;
        return { x0: b.x0, x1: b.x1, count: w > 0 ? Number((b.count / w).toPrecision(3)) : b.count };
      });
      const sorted = vals.slice().sort(function (a, b) { return a - b; });
      const mean = A.stats.mean(vals), p95 = A.stats.quantile(sorted, 0.95), max = sorted[sorted.length - 1];
      // markers use the same rounding as the summary cards (mean 2.00 s, not 2)
      function fx(v) { return ui.fmt(v, { fixed: m.dp }); }
      const markers = [{ x: mean, label: 'mean ' + fx(mean), color: '--text-2' }, { x: p95, label: '95th pct ' + fx(p95), color: '--warn' }];
      let limitNote = '', limitShown = false;
      if (m.limit) {
        if (m.limit.x <= Math.max(1.5 * max, 1e-12)) { markers.push({ x: m.limit.x, label: m.limit.label, color: '--line-req' }); limitShown = true; }
        else limitNote = ' Every value is far below the ' + m.limit.label.replace(/ limit /, ' limit of ') + ', which is off the scale.';
      }
      const yLabel = fixed ? m.per : m.per + ' per ' + m.unit;
      hist = A.plot.histogram(histBox, { title: m.label + ' (' + vals.length + ' ' + m.per + ')', xLabel: m.label.toLowerCase() + ' (' + m.unit + ')', yLabel: yLabel,
        bins: bins, markers: markers, label: fixed ? m.per : 'density', height: 220 });
      hist.summary(histSummary(m, raw, fixed, yLabel, fx, { mean: mean, p95: p95, limitShown: limitShown }) + limitNote);
      histCaption.textContent = (fixed ? 'Fixed-width bins: bar height is the count.' : 'Quantile bins: each bar holds about the same number of values, so the height is a density (' + yLabel + ') and the area is the count.') +
        limitNote + (skipped ? ' ' + skipped : '');
    }
    /**
     * Text alternative for the histogram, built from the raw counts. The shared summary adds up the
     * bar heights, which in quantile mode are densities (count per unit), not counts.
     */
    function histSummary(m, raw, fixed, yLabel, fx, st) {
      const n = raw.reduce(function (a, b) { return a + b.count; }, 0), k = raw.length;
      const span = 'from ' + fx(raw[0].x0) + ' to ' + fx(raw[k - 1].x1) + ' ' + m.unit;
      const bins = k === 1 ? 'bin' : 'bins';
      let text;
      if (fixed) {
        let top = 0;
        raw.forEach(function (b, i) { if (b.count > raw[top].count) top = i; });
        text = n + ' ' + m.per + ' in ' + k + ' equal-width ' + bins + ' ' + span + '; the tallest bin, ' +
          fx(raw[top].x0) + ' to ' + fx(raw[top].x1) + ' ' + m.unit + ', holds ' + raw[top].count + '.';
      } else {
        let lo = Infinity, hi = -Infinity;
        raw.forEach(function (b) { lo = Math.min(lo, b.count); hi = Math.max(hi, b.count); });
        text = n + ' ' + m.per + ' in ' + k + ' quantile ' + bins + ' of ' + (lo === hi ? lo : lo + ' to ' + hi) + ' values each, ' + span +
          '. Bar height is a density (' + yLabel + '), so the tall, narrow bars are where the values crowd together.';
      }
      return text + ' Mean ' + fx(st.mean) + ' ' + m.unit + ', 95th percentile ' + fx(st.p95) + ' ' + m.unit +
        (st.limitShown ? '; the ' + m.limit.label + ' is marked' : '') + '.';
    }
    metricSel.on('change', drawHist);
    fixedT.on('change', drawHist);

    function drawScatter(trials) {
      if (scatter) { scatter.destroy(); scatter = null; }
      scatterBox.textContent = '';
      let lo = Infinity, hi = -Infinity;
      trials.forEach(function (t) { lo = Math.min(lo, t.peakRate); hi = Math.max(hi, t.peakRate); });
      if (!(hi > lo)) { hi = lo + 1; }
      scatter = A.plot.scatter(scatterBox, {
        title: 'Initial angle against initial rate', xLabel: 'initial angle (deg)', yLabel: '|ω0| (deg/s)', height: 240,
        points: trials.map(function (t) { return { x: t.angleDeg, y: t.w0NormDeg, c: t.peakRate, id: t.i, label: 'Trial ' + t.i }; }),
        colorScale: { min: lo, max: hi, label: 'peak rate (deg/s)' },
        onPick: function (id) { pick(id); }
      });
    }

    function replayButton(t, opts, small) {
      return ui.button({ label: 'Replay', icon: 'sim', small: !!small, title: 'Load trial ' + t.i + ' into the simulator above',
        onClick: function () { hooks.onReplay(t, opts); } });
    }
    function pick(id) {
      if (!last) return;
      const t = last.res.trials.find(function (x) { return x.i === id; });
      if (!t) return;
      pickLine.textContent = '';
      pickLine.appendChild(el('span', null, el('strong', null, 'Trial ' + t.i + ': '),
        'initial angle ' + ui.fmt(t.angleDeg, { fixed: 1, unit: '°' }) + ', |ω₀| ' + ui.fmt(t.w0NormDeg, { fixed: 2, unit: 'deg/s' }) +
        ', peak ' + ui.fmt(t.peakRate, { fixed: 2, unit: 'deg/s' }) + ', ' + (t.entries ? 'detumbled in ' + sec(t.maxDetumble) : 'never entered safe mode') +
        ', REQ-L1 ' + (t.L1 ? 'pass' : 'fail') + '.'));
      pickLine.appendChild(replayButton(t, last.opts, true));
    }

    function drawWorst(trials, opts) {
      worstBox.textContent = '';
      const worst = trials.slice().sort(function (a, b) { return b.peakRate - a.peakRate || a.i - b.i; }).slice(0, 10);
      const cols = [{ key: 'i', label: 'Trial', num: true }, { key: 'a', label: 'Initial angle', num: true }, { key: 'w', label: '|ω₀|', num: true },
        { key: 'p', label: 'Peak rate', num: true }, { key: 'd', label: 'Max detumble', num: true }, { key: 'e', label: 'Final error', num: true },
        { key: 'l', label: 'REQ-L1' }, { key: 'r', label: 'Replay' }];
      const rows = worst.map(function (t) {
        return [String(t.i), ui.fmt(t.angleDeg, { fixed: 1, unit: '°' }), ui.fmt(t.w0NormDeg, { fixed: 2, unit: 'deg/s' }), ui.fmt(t.peakRate, { fixed: 2, unit: 'deg/s' }),
          t.entries ? sec(t.maxDetumble) : 'no entry', ui.fmt(t.finalErr, { fixed: 3, unit: '°' }), ui.badge(t.L1 ? 'pass' : 'fail'), replayButton(t, opts, true)];
      });
      worstBox.appendChild(ui.table(cols, rows, { caption: 'Ten worst trials by peak rate', rowHeaders: true, compact: true }));
    }

    function csv() {
      const head = ['trial', 'seed', 'angle_deg', 'w0x_deg_s', 'w0y_deg_s', 'w0z_deg_s', 'w0_norm_deg_s', 'tau_d_x_Nm', 'tau_d_y_Nm', 'tau_d_z_Nm',
        'q0', 'q1', 'q2', 'q3', 'safe_mode_entries', 'max_detumble_s', 'peak_rate_deg_s', 'settle_s', 'final_err_deg', 'final_rate_deg_s',
        'final_mode', 'sat_percent', 'return_to_nominal_s', 'L1_pass', 'final_ok', 'safety_ok'];
      function c(x) { return x === null || x === undefined || !isFinite(x) ? '' : String(Number(Number(x).toPrecision(10))); }
      const lines = [head.join(',')];
      last.res.trials.forEach(function (t) {
        lines.push([t.i, t.seed, c(t.angleDeg), c(t.w0Deg[0]), c(t.w0Deg[1]), c(t.w0Deg[2]), c(t.w0NormDeg), c(t.tauD[0]), c(t.tauD[1]), c(t.tauD[2]),
          c(t.q0[0]), c(t.q0[1]), c(t.q0[2]), c(t.q0[3]), t.entries, c(t.maxDetumble), c(t.peakRate), c(t.settle), c(t.finalErr), c(t.finalRate),
          A.modes.NAMES[t.finalMode] || '', c(100 * t.satFrac), c(t.tReturn), t.L1 ? 1 : 0, t.finalOK ? 1 : 0, t.safetyOK ? 1 : 0].join(','));
      });
      return lines.join('\n') + '\n';
    }
    csvBtn.addEventListener('click', function () {
      if (!last) return;
      ui.download('adcs-monte-carlo-seed' + last.opts.baseSeed + '-n' + last.res.summary.n + '.csv', csv());
      ui.announce('Monte Carlo CSV download started.');
    });

    return {
      el: card,
      run: run,
      cancel: cancel,
      /** Set the trial count and base seed (for #mc=n,seed links). */
      setInputs: function (o) {
        if (o && isFinite(o.n)) inN.set(Math.max(10, Math.min(500, Math.round(o.n))));
        if (o && isFinite(o.baseSeed)) { seedInput.value = String(Math.max(0, Math.round(o.baseSeed))); readOpts(); }
      }
    };
  };
})();
