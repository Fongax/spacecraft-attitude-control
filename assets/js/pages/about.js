/**
 * about.js: the About page (about.html).
 *
 * - The parameter provenance table, built from ADCS.params.PROVENANCE (tags via ADCS.ui.tag).
 * - The Monte Carlo comparison widget: re-runs ADCS.mc.run with its defaults (chunked, with
 *   progress and cancel) and fills the site column from the summary.
 * - The reference scenarios, each one ADCS.sim.run of a preset, computed one per task after load.
 * - Evidence counts and the legend, from ADCS.data.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const D = A.data;
  const el = ui.el;

  function $(id) { return document.getElementById(id); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function listText(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /* ================================================================ parameter provenance */

  function buildParams() {
    const P = A.params.PROVENANCE;
    const counts = {};
    P.forEach(function (p) { counts[p.tag] = (counts[p.tag] || 0) + 1; });
    const order = ['project', 'derived', 'site', 'option', 'extension'].filter(function (k) { return counts[k]; });
    $('param-counts').textContent = plural(P.length, 'parameter') + ': ' +
      listText(order.map(function (k) { return counts[k] + ' ' + ui.TAGS[k][0]; })) + '.';
    const rows = P.map(function (p) { return [p.label, el('span', { class: 'param-value' }, p.value), ui.tag(p.tag), p.note || null]; });
    $('param-table').appendChild(ui.table(
      [{ key: 'label', label: 'Parameter' }, { key: 'value', label: 'Value' }, { key: 'tag', label: 'Source' }, { key: 'note', label: 'Note' }],
      rows, { caption: 'Every engine parameter and where it comes from', rowHeaders: true }));
  }

  /* ================================================================ Monte Carlo comparison */

  function buildMC() {
    const M = A.mc.DEFAULTS;
    const box = ui.qs('#w-mc-compare .widget-body');
    const status = $('mc-status');
    const bar = $('mc-progress');
    const cells = {};
    ui.qsa('[data-mc]').forEach(function (c) { cells[c.getAttribute('data-mc')] = c; });
    if (cells.seed) cells.seed.textContent = String(M.baseSeed);
    if (cells.desc) {
      cells.desc.textContent = M.n + ' trials, a random axis with an angle up to ' + M.maxAngleDeg + '°, rates up to ' + M.rateBoundDeg +
        ' deg/s and a disturbance up to ' + ui.fmtSci(M.distBound, 1) + ' N m per axis, each run for ' + M.duration + ' s';
    }
    bar.setAttribute('aria-valuemax', String(M.n));

    const runBtn = ui.button({ label: 'Run the ' + M.n + ' trials now', kind: 'primary', icon: 'play' });
    const cancelBtn = ui.button({ label: 'Cancel', kind: 'secondary', icon: 'cross' });
    cancelBtn.hidden = true;
    $('mc-actions').appendChild(runBtn);
    $('mc-actions').appendChild(cancelBtn);
    let ctrl = null;
    let focusMoved = false;   // true when the run moved keyboard focus from Run to Cancel

    function setProgress(done, n) {
      bar.setAttribute('aria-valuenow', String(done));
      bar.setAttribute('aria-valuetext', done + ' of ' + n + ' trials');
      bar.firstElementChild.style.width = (100 * done / n) + '%';
    }
    function finish() {
      // Hiding a focused Cancel (or having disabled a focused Run) would drop focus to <body>: hand it back to Run.
      const a = document.activeElement;
      const onCancel = a === cancelBtn;
      const lost = !a || a === document.body;
      runBtn.disabled = false;
      cancelBtn.hidden = true;
      ctrl = null;
      if (onCancel || (lost && focusMoved)) runBtn.focus({ preventScroll: !onCancel });
      focusMoved = false;
    }
    runBtn.addEventListener('click', function () {
      if (ctrl) return;
      ui.clearError(box);
      ctrl = typeof window.AbortController === 'function' ? new window.AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
      // A disabled button loses focus, so move it to Cancel first when Run has it.
      const hadFocus = document.activeElement === runBtn;
      cancelBtn.hidden = false;
      if (hadFocus) cancelBtn.focus();
      focusMoved = hadFocus;
      runBtn.disabled = true;
      bar.hidden = false;
      setProgress(0, M.n);
      status.textContent = 'Running trial 1 of ' + M.n + '…';
      A.mc.run({}, {
        signal: ctrl.signal,
        onProgress: function (done, n, ms) {
          setProgress(done, n);
          status.textContent = 'Trial ' + done + ' of ' + n + ' · ' + ui.fmt(ms / 1000, { fixed: 1, unit: 's' });
        }
      }).then(function (res) {
        const s = res.summary;
        finish();
        if (res.cancelled || s.cancelled) {
          status.textContent = 'Cancelled after ' + plural(res.trials.length, 'trial') + '; the table still shows the engine’s full-campaign values.';
          ui.announce('Monte Carlo run cancelled.');
          return;
        }
        cells.l1.textContent = s.L1.pass + '/' + s.n;
        cells.final.textContent = s.final.pass + '/' + s.n;
        cells.safety.textContent = s.safety.pass + '/' + s.n;
        cells.worst.textContent = ui.fmt(s.worst.peakRate, { fixed: 2, unit: 'deg/s' });
        cells.cp.textContent = ui.fmt(s.L1.cpLower95, { fixed: 3 });
        ['l1', 'final', 'safety', 'worst', 'cp'].forEach(function (k) {
          cells[k].classList.remove('is-fresh');
          void cells[k].offsetWidth;
          cells[k].classList.add('is-fresh');
        });
        const msg = 'Done in your browser: ' + plural(s.n, 'trial') + ' in ' + ui.fmt(s.elapsedMs / 1000, { fixed: 2, unit: 's' }) + '. REQ-L1 ' +
          s.L1.pass + '/' + s.n + ', lower bound ' + ui.fmt(s.L1.cpLower95, { fixed: 3 }) + (s.L1.cpLower95 >= A.params.LIMITS.l1Rate ? ' (demonstrated)' : ' (not demonstrated)') +
          '; worst rate in trial ' + s.worst.i + ' (trials are numbered from 0, as in the simulator).';
        status.textContent = msg;
      }).catch(function (err) {
        finish();
        bar.hidden = true;
        status.textContent = '';
        if (err instanceof RangeError) { ui.showError(box, err); return; }
        ui.showError(box, 'The Monte Carlo run failed: ' + (err && err.message ? err.message : String(err)));
        window.console.error('[ADCS] Monte Carlo run failed:', err);
      });
    });
    cancelBtn.addEventListener('click', function () { if (ctrl) ctrl.abort(); });
  }

  /* ================================================================ reference scenarios */

  const SCENARIOS = ['T01', 'T02', 'LQRSAFE', 'T03', 'FAULT', 'HIGHRATE'];
  const STATUS_TEXT = { pass: 'pass', fail: 'fail', na: 'not applicable' };

  function reqBadges(req) {
    return el('span', { class: 'req-mini' }, req.map(function (q) {
      const b = ui.badge(q.status, q.key);
      b.setAttribute('title', q.id + ': ' + STATUS_TEXT[q.status] + (q.value ? ' (' + q.value + ')' : ''));
      b.appendChild(el('span', { class: 'visually-hidden' }, ' ' + STATUS_TEXT[q.status]));
      return b;
    }));
  }

  /** A mode's short name (N, SD, SH) with its full name as the abbreviation's expansion. */
  function modeAbbr(mode) { return el('abbr', { title: A.modes.NAMES[mode] }, A.modes.SHORT[mode]); }
  function modeKey() {
    return A.modes.SHORT.map(function (s, i) { return s + ' = ' + A.modes.NAMES[i]; }).join(', ') + '. ';
  }

  function scenarioRow(id) {
    const meta = A.presets.meta[id] || { label: id, purpose: '' };
    const first = el('span', { class: 'scn-name' }, ui.simLink(meta.label, 'preset=' + id),
      meta.purpose ? el('span', { class: 'scn-purpose' }, meta.purpose) : null);
    let r;
    try {
      r = A.sim.run(Object.assign(A.presets.get(id), { log: false }));
    } catch (err) {
      if (err instanceof RangeError) return [first, el('span', { class: 'field-error' }, err.message), null, null, null, null];
      throw err;
    }
    const m = r.metrics;
    const changes = r.events.length ? el('span', { class: 'scn-events' }, r.events.map(function (e) {
      return el('span', { class: 'scn-event' }, modeAbbr(e.from), '→', modeAbbr(e.to), ' ' + ui.fmt(e.t, { fixed: 2, unit: 's' }));
    })) : 'none';
    return [first, changes,
      m.settle === null || m.settle === undefined ? '–' : ui.fmt(m.settle, { fixed: 2, unit: 's' }),
      ui.fmt(m.peakRate, { fixed: 2, unit: 'deg/s' }),
      ui.fmt(m.final.errDeg, { fixed: 3 }) + '°',
      reqBadges(r.req)];
  }

  function buildScenarios() {
    const host = $('scenario-table');
    const status = $('scenario-status');
    const rows = [];
    let i = 0;
    function step() {
      if (i >= SCENARIOS.length) {
        host.textContent = '';
        host.appendChild(ui.table([
          { key: 's', label: 'Scenario' }, { key: 'e', label: 'Mode changes' }, { key: 't', label: 'Settling', num: true },
          { key: 'p', label: 'Peak rate', num: true }, { key: 'f', label: 'Final error', num: true }, { key: 'q', label: 'Requirements' }
        ], rows, { caption: 'Reference scenarios: dt 0.01 s, RK4, the site’s default gains', rowHeaders: true }));
        host.appendChild(el('p', { class: 'scn-note' },
          'Mode changes use the short mode names: ' + modeKey() +
          'Settling time is the moment from which the error stays below ' + A.params.LIMITS.errDeg + '° and the rate below ' + A.params.LIMITS.rateDeg +
          ' deg/s to the end of the run. A requirement shows N/A when the run does not exercise it: without a safe-mode entry there is no detumble to time. ',
          ui.tag('derived')));
        ui.markScrollable(host);
        return;
      }
      status.textContent = 'Computing scenario ' + (i + 1) + ' of ' + SCENARIOS.length + '…';
      rows.push(scenarioRow(SCENARIOS[i]));
      i += 1;
      setTimeout(step, 0);
    }
    setTimeout(step, 30);
  }

  /* ================================================================ labels */

  function buildLabels() {
    const ev = { notes: 0, partial: 0, outline: 0 };
    D.courses.forEach(function (c) { if (ev[c.evidence] !== undefined) ev[c.evidence] += 1; });
    const box = $('evidence-counts');
    box.appendChild(document.createTextNode('Of the ' + D.courses.length + ' subjects, ' + ev.notes + ' rest on their own notes '));
    box.appendChild(ui.evidence('notes'));
    box.appendChild(document.createTextNode(', ' + ev.partial + ' on partial notes '));
    box.appendChild(ui.evidence('partial'));
    box.appendChild(document.createTextNode(' and ' + ev.outline + ' only on their outline '));
    box.appendChild(ui.evidence('outline'));
    box.appendChild(document.createTextNode('.'));
    $('labels-legend').appendChild(withOptionEntry(ui.legend(true)));
  }

  // LOCAL (request P0): ui.legend() lists every honesty tag except 'option' ("Site option"), which this
  // page uses. Insert it after "Site default" unless the shared legend already has it.
  function withOptionEntry(legend) {
    const dl = ui.qs('.legend-list', legend);
    if (!dl || ui.qs('.tag-option', dl) || !ui.TAGS.option) return legend;
    const siteTag = ui.qs('.tag-site', dl);
    const siteDd = siteTag && siteTag.closest('dt') ? siteTag.closest('dt').nextElementSibling : null;
    const dt = el('dt', null, ui.tag('option'));
    const dd = el('dd', null, ui.TAGS.option[1].replace(/^[^:]+:\s*/, ''));
    const before = siteDd ? siteDd.nextSibling : null;
    dl.insertBefore(dt, before);
    dl.insertBefore(dd, before);
    return legend;
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'about' });
    buildParams();
    buildMC();
    buildLabels();
    buildScenarios();
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
