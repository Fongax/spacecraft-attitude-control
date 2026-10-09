/**
 * m01.js: module 01, Requirements and systems engineering.
 * Widgets: requirement linter (W1.1), traceability matrix (W1.2), generalised AC-3 over design
 * parameters (W1.3) and the PEAS sorter (W1.4). Every threshold, requirement text and trace link
 * is read from ADCS.params, ADCS.tests, ADCS.presets and ADCS.data.
 */
(function () { 'use strict';
  const ADCS = window.ADCS;
  const ui = ADCS.ui;
  const el = ui.el;
  const P = ADCS.params;
  const LIM = P.LIMITS;
  const D2R = ADCS.units.D2R;
  const MINUS = '−';

  function $(id) { return document.getElementById(id); }
  function short(id) { return String(id).replace(/^REQ-/, ''); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function num(x) { return String(x).replace('-', MINUS); }

  /* ================================================================ requirement table */

  function buildReqTable() {
    const host = $('req-table');
    const rows = P.REQ.map(function (r) {
      return [
        el('span', { class: 'req-id' }, r.id),
        el('span', { class: 'req-class req-class-' + r.class }, cap(r.class)),
        el('span', null, r.text),
        el('span', null, r.method),
        el('span', null, r.check)
      ];
    });
    const t = ui.table([
      { key: 'id', label: 'ID' }, { key: 'cls', label: 'Class' }, { key: 'text', label: 'Requirement (verbatim)' },
      { key: 'm', label: 'Verification method' }, { key: 'c', label: 'How this site checks it' }
    ], rows, { caption: 'The five project requirements', rowHeaders: true });
    const head = t.table.querySelector('thead tr');
    head.children[2].appendChild(document.createTextNode(' '));
    head.children[2].appendChild(ui.tag('project'));
    head.children[3].appendChild(document.createTextNode(' '));
    head.children[3].appendChild(ui.tag('project'));
    head.children[4].appendChild(document.createTextNode(' '));
    head.children[4].appendChild(ui.tag('site'));
    t.table.classList.add('req-table');
    host.textContent = '';
    host.appendChild(t);
  }

  /* ================================================================ W1.1 requirement linter */

  const UNIT_RE = /\d+(?:\.\d+)?\s*(?:deg\/s|°\/s|deg\b|°|rad\/s|rad\b|mN\s?m\b|N\s?m\b|Nm\b|%|Hz\b|sec(?:onds?)?\b|ms\b|s\b)/i;
  const TIME_RE = /\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds?|min|minutes?|h|hours?)\b/i;
  const VAGUE_RE = /\b(quick(?:ly)?|fast|rapid(?:ly)?|prompt(?:ly)?|timely|adequate(?:ly)?|appropriate(?:ly)?|sufficient(?:ly)?|robust(?:ly)?|well|good|minimal|minimi[sz]e|maximi[sz]e|optimal(?:ly)?|optimi[sz]e|user-friendly|easy|easily|efficient(?:ly)?|flexible|reliabl[ey]|as possible|as needed|as required|if possible|and\/or|etc)\b/gi;
  const CONJ_RE = /\b(?:and|or)\s+(?:also\s+)?shall\b|\band\s+also\b|\band\s+then\b/i;
  const LIVE_RE = /\b(stabili[sz](?:e|es|ed|ing)|reach(?:es|ed)?|recover(?:s|ed|y)?|detumbl(?:e|es|ed|ing)|converg(?:e|es|ed)|settl(?:e|es|ed)|return(?:s|ed)?)\b/i;

  /**
   * Lint one requirement sentence.
   * @param {string} text @param {string} method '' when no verification method is chosen
   * @returns {{ok:boolean, title:string, detail:string}[]}
   */
  function lint(text, method) {
    const t = String(text || '');
    const out = [];
    const shalls = (t.match(/\bshall\b/gi) || []).length;
    const modal = t.match(/\b(should|will|must|may)\b/i);
    out.push(shalls === 1
      ? { ok: true, title: 'One “shall”', detail: 'One obligation, so it can pass or fail on its own.' }
      : shalls === 0
        ? { ok: false, title: 'No “shall”', detail: modal ? '“' + modal[1] + '” states a wish or a prediction, not an obligation. Requirements use “shall”.' : 'Without “shall” the sentence is a description, not an obligation.' }
        : { ok: false, title: shalls + ' “shall”s', detail: 'Two obligations in one sentence cannot pass or fail separately. Split it into ' + shalls + ' requirements.' });
    out.push(UNIT_RE.test(t)
      ? { ok: true, title: 'Measurable threshold', detail: 'A number with a unit gives the tester a pass line.' }
      : { ok: false, title: 'No number with a unit', detail: 'Nothing to measure against. Add a threshold such as 15 deg/s, ±2 deg or 3 mN m.' });
    const vague = [];
    let m;
    VAGUE_RE.lastIndex = 0;
    while ((m = VAGUE_RE.exec(t)) !== null) { if (vague.indexOf(m[1].toLowerCase()) < 0) vague.push(m[1].toLowerCase()); }
    out.push(!vague.length
      ? { ok: true, title: 'No vague words', detail: 'Every word can be checked.' }
      : { ok: false, title: 'Vague: ' + vague.map(function (v) { return '“' + v + '”'; }).join(', '), detail: 'Two reviewers would disagree about what this means. Replace it with a number.' });
    const after = shalls ? t.slice(t.search(/\bshall\b/i)) : t;
    out.push(!CONJ_RE.test(after)
      ? { ok: true, title: 'One action', detail: 'No second verb joined on with “and shall” or “and also”.' }
      : { ok: false, title: 'Two actions joined', detail: '“and shall”, “and also” or “and then” hides a second requirement. Give it its own ID.' });
    out.push(method
      ? { ok: true, title: 'Verification method: ' + method, detail: 'The reader knows how the requirement will be proved.' }
      : { ok: false, title: 'No verification method', detail: 'Choose test, analysis, inspection or demonstration, or nobody owns the proof.' });
    const live = t.match(LIVE_RE);
    out.push(!live || TIME_RE.test(t)
      ? { ok: true, title: live ? 'Time bound on “' + live[1] + '”' : 'No unbounded “eventually”', detail: live ? 'An “eventually” word with a time limit can fail in a finite test.' : 'No liveness word that needs a deadline.' }
      : { ok: false, title: 'No time bound on “' + live[1] + '”', detail: 'It says something must eventually happen but not by when, so no finite test can ever fail it.' });
    return out;
  }

  function buildLinter() {
    const controls = $('lint-controls');
    const output = $('lint-output');
    const reqText = function (key) { return P.reqById(key).text; };
    const PRESETS = [
      { id: 'vague', label: 'Vague need', text: 'The spacecraft should point well.', method: '', note: 'The need as it is first spoken.' },
      { id: 'F1', label: 'REQ-F1', text: reqText('F1'), method: 'Test', note: 'Project method: ' + P.reqById('F1').method + ' Its time bound is stated in REQ-L1.' },
      { id: 'F2', label: 'REQ-F2', text: reqText('F2'), method: 'Test', note: 'Project method: ' + P.reqById('F2').method },
      { id: 'S1', label: 'REQ-S1', text: reqText('S1'), method: 'Test', note: 'Project method: ' + P.reqById('S1').method },
      { id: 'S2', label: 'REQ-S2', text: reqText('S2'), method: 'Test', note: 'Project method: ' + P.reqById('S2').method + ' The number lives in the actuator description (±3 mN m).' },
      { id: 'L1', label: 'REQ-L1', text: reqText('L1'), method: 'Test', note: 'Project method: ' + P.reqById('L1').method },
      { id: 'quick', label: 'Quickly and robustly', text: 'The controller shall quickly and robustly detumble the spacecraft.', method: 'Test', note: 'A common first draft of a detumble requirement.' }
    ];
    const area = el('textarea', { id: 'lint-text', rows: '3', spellcheck: 'false', 'aria-describedby': 'lint-note' });
    area.value = PRESETS[0].text;
    const field = el('div', { class: 'field lint-field' },
      el('div', { class: 'field-head' }, el('label', { for: 'lint-text', class: 'field-label' }, 'Requirement text')), area);
    const method = ui.select({ id: 'lint-method', label: 'Verification method', value: '', options: [
      { value: '', label: '(none chosen)' }, { value: 'Test', label: 'Test' }, { value: 'Analysis', label: 'Analysis' },
      { value: 'Inspection', label: 'Inspection' }, { value: 'Demonstration', label: 'Demonstration' }] });
    const presetRow = el('div', { class: 'btn-row lint-presets', role: 'group', 'aria-label': 'Load an example' });
    const note = el('p', { class: 'field-help', id: 'lint-note' }, PRESETS[0].note);
    PRESETS.forEach(function (p) {
      const b = ui.button({ label: p.label, kind: 'secondary', small: true, onClick: function () {
        area.value = p.text; method.set(p.method); note.textContent = p.note; run();
        ui.announce('Loaded ' + p.label + '.');
      } });
      presetRow.appendChild(b);
    });
    controls.classList.add('lint-controls');
    controls.appendChild(field);
    controls.appendChild(method.el);
    output.appendChild(el('p', { class: 'lint-presets-label field-label' }, 'Load an example'));
    output.appendChild(presetRow);
    output.appendChild(note);
    const summary = el('p', { class: 'lint-summary', 'aria-live': 'polite' });
    const list = el('ul', { class: 'lint-list', role: 'list' });
    output.appendChild(summary);
    output.appendChild(list);
    function run() {
      const res = lint(area.value, method.value);
      const flags = res.filter(function (r) { return !r.ok; }).length;
      list.textContent = '';
      res.forEach(function (r) {
        list.appendChild(el('li', { class: 'lint-item ' + (r.ok ? 'is-ok' : 'is-flag') },
          ui.icon(r.ok ? 'check' : 'warn', { label: r.ok ? 'Passes' : 'Flag' }),
          el('span', null, el('strong', null, r.title), ' ', el('span', { class: 'lint-detail' }, r.detail))));
      });
      summary.textContent = '';
      summary.appendChild(el('span', { class: 'lint-count ' + (flags ? 'has-flags' : 'clean') }, flags === 0 ? 'No flags' : flags + (flags === 1 ? ' flag' : ' flags')));
      summary.appendChild(document.createTextNode(flags === 0 ? ': testable as written.' : ' out of 6 checks.'));
    }
    area.addEventListener('input', ui.debounce(run, 120));
    method.on('change', run);
    run();
  }

  /* ================================================================ W1.2 traceability matrix */

  function buildTrace() {
    const out = $('trace-output');
    const reqs = P.REQ.map(function (r) { return r.id; });
    const tests = ADCS.data.tests.map(function (t) { return t.id; });
    const testInfo = {};
    ADCS.data.tests.forEach(function (t) { testInfo[t.id] = t; });
    const PROJECT = ADCS.tests.trace;
    let links = {};
    function reset() {
      links = {};
      reqs.forEach(function (r) { links[r] = (PROJECT[r] || []).slice(); });
    }
    reset();
    function has(r, t) { return links[r].indexOf(t) >= 0; }
    function toggle(r, t) {
      if (has(r, t)) links[r] = links[r].filter(function (x) { return x !== t; });
      else { links[r].push(t); links[r].sort(); }
    }
    function postings(r) { return links[r].slice().sort(); }
    function degree(t) { return reqs.filter(function (r) { return has(r, t); }).length; }

    const table = el('table', { class: 'table compact trace-matrix' });
    table.appendChild(el('caption', null, 'Requirements × tests (incidence matrix)'));
    const hr = el('tr', null, el('th', { scope: 'col' }, 'Requirement'));
    tests.forEach(function (t) { hr.appendChild(el('th', { scope: 'col', class: 'trace-test', title: testInfo[t].scenario }, t)); });
    hr.appendChild(el('th', { scope: 'col' }, 'Postings'));
    table.appendChild(el('thead', null, hr));
    const tb = el('tbody');
    const cells = {}, postCells = {}, degCells = {};
    reqs.forEach(function (r) {
      const rec = P.reqById(r);
      const tr = el('tr', null, el('th', { scope: 'row' }, el('span', { class: 'req-id' }, r), el('span', { class: 'req-class req-class-' + rec.class }, rec.class)));
      tests.forEach(function (t) {
        const b = el('button', { type: 'button', class: 'trace-cell', 'aria-pressed': 'false', 'aria-label': r + ' verified by ' + t, title: r + ' verified by ' + t + ': ' + testInfo[t].scenario },
          ui.icon('check'));
        b.addEventListener('click', function () {
          toggle(r, t); render();
          ui.announce(r + (has(r, t) ? ' now verified by ' : ' no longer verified by ') + t + '.');
        });
        cells[r + '|' + t] = b;
        tr.appendChild(el('td', { class: 'trace-td' }, b));
      });
      postCells[r] = el('td', { class: 'trace-post' });
      tr.appendChild(postCells[r]);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const fr = el('tr', null, el('th', { scope: 'row' }, 'Degree'));
    tests.forEach(function (t) { degCells[t] = el('td', { class: 'trace-deg' }); fr.appendChild(degCells[t]); });
    fr.appendChild(el('td'));
    table.appendChild(el('tfoot', null, fr));
    out.appendChild(el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Traceability matrix' }, table));

    const status = el('p', { class: 'trace-status', 'aria-live': 'polite' });
    out.appendChild(status);

    const opts = reqs.map(function (r) { return { value: r, label: r }; });
    const selA = ui.select({ id: 'trace-a', label: 'Requirement A', options: opts, value: 'REQ-S1' });
    const selB = ui.select({ id: 'trace-b', label: 'Requirement B', options: opts, value: 'REQ-F1' });
    const interOut = el('p', { class: 'trace-inter', 'aria-live': 'polite' });
    const resetBtn = ui.button({ label: 'Reset to project', icon: 'reset', onClick: function () { reset(); render(); ui.announce('Matrix reset to the project test plan.'); } });
    out.appendChild(el('div', { class: 'trace-tools' },
      el('div', { class: 'trace-inter-box' }, el('h4', null, 'Intersect two postings lists'), el('div', { class: 'trace-selects' }, selA.el, selB.el), interOut),
      el('div', { class: 'btn-row' }, resetBtn)));
    selA.on('change', renderInter);
    selB.on('change', renderInter);

    function renderInter() {
      const a = selA.value, b = selB.value;
      const pa = postings(a), pb = postings(b);
      const common = pa.filter(function (t) { return pb.indexOf(t) >= 0; });
      interOut.textContent = '';
      interOut.appendChild(el('code', null, 'postings(' + short(a) + ') ∩ postings(' + short(b) + ') = {' + common.join(', ') + '}'));
      interOut.appendChild(document.createTextNode(' ' + (a === b ? 'The same list twice: choose two different requirements.'
        : common.length === 0 ? 'No test proves both. Each needs its own evidence.'
          : common.length === 1 ? 'One scenario proves both, so a failure of ' + common[0] + ' puts both in doubt.'
            : common.length + ' tests prove both.')));
    }
    function render() {
      reqs.forEach(function (r) {
        tests.forEach(function (t) {
          const on = has(r, t);
          const b = cells[r + '|' + t];
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('is-project', (PROJECT[r] || []).indexOf(t) >= 0);
        });
        const p = postings(r);
        const c = postCells[r];
        c.textContent = '';
        if (p.length) c.appendChild(el('span', { class: 'trace-ok' }, ui.icon('check'), p.join(', ')));
        else c.appendChild(el('span', { class: 'trace-gap' }, ui.icon('warn'), 'silent gap'));
      });
      tests.forEach(function (t) {
        const d = degree(t), c = degCells[t];
        c.textContent = '';
        c.appendChild(el('span', { class: 'trace-degnum' }, String(d)));
        // Each test is an edge joining the requirements it verifies; it is a hyperedge only when it
        // joins more than two of them (T03 joins three), as the prose and the quiz define it.
        if (d === 0) c.appendChild(el('span', { class: 'trace-flag trace-orphan' }, 'orphan'));
        else if (d >= 3) c.appendChild(el('span', { class: 'trace-flag trace-hyper' }, 'hyperedge'));
      });
      const gaps = reqs.filter(function (r) { return !links[r].length; });
      const orphans = tests.filter(function (t) { return degree(t) === 0; });
      status.textContent = '';
      status.appendChild(el('span', { class: gaps.length || orphans.length ? 'trace-bad' : 'trace-good' },
        ui.icon(gaps.length || orphans.length ? 'warn' : 'check'),
        'Coverage: ' + (reqs.length - gaps.length) + ' of ' + reqs.length + ' requirements have a test; ' +
        orphans.length + (orphans.length === 1 ? ' orphan test.' : ' orphan tests.')));
      if (gaps.length) status.appendChild(document.createTextNode(' ' + gaps.join(', ') + (gaps.length === 1 ? ' has' : ' have') + ' no test: nothing would fail and nothing would warn.'));
      if (orphans.length) status.appendChild(document.createTextNode(' ' + orphans.join(', ') + (orphans.length === 1 ? ' verifies' : ' verify') + ' nothing: why does it exist?'));
      renderInter();
    }
    render();
  }

  /* ================================================================ margins (live runs) */

  function buildMargins() {
    const host = $('margin-table');
    const cases = ['T01', 'T02', 'T03', 'HIGHRATE'];
    const cap = LIM.rateMaxDeg;
    function rateCells(peak) { return [ui.fmt(peak, { fixed: 2 }), ui.fmt(cap - peak, { fixed: 2 }), ui.fmt(cap / peak, { fixed: 2 })]; }
    function labelled(text, kind) { return el('span', null, text, ' ', ui.tag(kind)); }
    // Scenario rows start as same-sized placeholders and are filled one engine run per task.
    const rows = cases.map(function (id) { return [el('span', null, ADCS.presets.meta[id].label), '…', '…', '…', '…', '…']; });
    const PROJECT_WORST = 13.22; // project results summary: worst Monte Carlo rate norm over its 60 trials
    const SITE_WORST = 12.468;   // §8.3 reference value: this site's worst trial (seed 42, 60 trials)
    rows.push([labelled('Project-reported Monte Carlo worst (60 trials)', 'project')].concat(rateCells(PROJECT_WORST), ['–', '–']));
    rows.push([labelled('This site’s Monte Carlo worst (60 trials, seed 42)', 'derived')].concat(rateCells(SITE_WORST), ['–', '–']));
    const t = ui.table([
      { key: 'c', label: 'Verification case' }, { key: 'p', label: 'Peak |ω| (deg/s)', num: true },
      { key: 'm', label: '15 − peak (deg/s)', num: true }, { key: 'n', label: 'n = 15 / peak', num: true },
      { key: 'ta', label: 'Max applied |τᵢ| (mN m)', num: true }, { key: 'tc', label: 'Max commanded |τᵢ| (mN m)', num: true }
    ], rows, { caption: 'REQ-S1 and REQ-S2 margins (scenario rows use the site-default gains)', rowHeaders: true, compact: true });
    const cap2 = t.table.querySelector('caption');
    cap2.appendChild(document.createTextNode(' '));
    cap2.appendChild(ui.tag('derived'));
    host.appendChild(t);
    const body = t.table.tBodies[0];
    let i = 0;
    (function next() {
      if (i >= cases.length) return;
      setTimeout(function () {
        try {
          const cfg = ADCS.presets.get(cases[i]);
          cfg.log = false;
          const m = ADCS.sim.run(cfg).metrics;
          const vals = rateCells(m.peakRate).concat([ui.fmt(ADCS.units.toMilli(m.maxTau), { fixed: 2 }), ui.fmt(ADCS.units.toMilli(m.maxTauCmd), { fixed: 2 })]);
          const cells = body.rows[i].cells;
          vals.forEach(function (v, j) { cells[j + 1].textContent = v; });
        } catch (e) {
          ui.showError(host, e);
          if (!(e instanceof RangeError)) console.error('[ADCS] widget setup failed:', e);
          return;
        }
        i += 1;
        next();
      }, 0);
    })();
  }

  /* ================================================================ W1.3 generalised AC-3 */

  function buildAC3() {
    const controls = $('ac3-controls');
    const out = $('ac3-output');
    const sm = P.DEFAULTS.safeMode;
    const Jmax = Math.max.apply(null, P.DEFAULTS.J);
    // REQ-F1 and the exit guard test the rate norm, and every axis may sit at the per-axis bound at once.
    const dNorm = Math.sqrt(3) * ADCS.mc.DEFAULTS.distBound;
    const VARS = [
      { id: 'kd', name: 'K_d', html: 'K<sub>d</sub>', unit: 'N m s', values: [0.0005, 0.001, 0.0015, 0.002, 0.003, 0.005, 0.01, 0.02, 0.05, 0.1], project: P.DEFAULTS.detumble.Kd, tag: 'site', note: 'detumble gain' },
      { id: 'en', name: 'ω_enter', html: 'ω<sub>enter</sub>', unit: 'deg/s', values: [3, 4, 6, 10, 15, 20], project: sm.enterRateDeg, tag: 'project', note: 'safe-mode entry rate' },
      { id: 'ex', name: 'ω_exit', html: 'ω<sub>exit</sub>', unit: 'deg/s', values: [0.25, 0.5, 1, 2, 6, 8], project: sm.exitRateDeg, tag: 'project', note: 'detumble exit rate' }
    ];
    const VAR = {};
    VARS.forEach(function (v) { VAR[v.id] = v; });
    const CONS = [
      { id: 'C1', from: 'REQ-L1', scope: ['kd', 'en', 'ex'], tex: '\\frac{J_{max}}{K_d}\\ln\\frac{\\omega_{enter}}{\\omega_{exit}} \\le ' + LIM.detumbleS + '\\ \\mathrm{s}',
        test: function (a) { return (Jmax / a.kd) * Math.log(a.en / a.ex) <= LIM.detumbleS; } },
      { id: 'C2', from: 'REQ-F1', scope: ['kd', 'ex'], tex: '\\frac{2\\sqrt{3}\\times10^{-5}}{K_d} < \\omega_{exit}\\ (\\mathrm{rad/s})',
        test: function (a) { return dNorm / a.kd < a.ex * D2R; } },
      { id: 'C3', from: 'REQ-S1', scope: ['en'], tex: '\\omega_{enter} < ' + LIM.rateMaxDeg + '^\\circ/\\mathrm{s}',
        test: function (a) { return a.en < LIM.rateMaxDeg; } },
      { id: 'C4', from: 'Risk register (hysteresis)', scope: ['ex', 'en'], tex: '\\omega_{exit} < \\omega_{enter}',
        test: function (a) { return a.ex < a.en; } },
      { id: 'C5', from: 'REQ-F1 text', scope: ['ex'], tex: '\\omega_{exit} \\le ' + LIM.rateDeg + '^\\circ/\\mathrm{s}',
        test: function (a) { return a.ex <= LIM.rateDeg; } }
    ];
    const enabled = {};
    CONS.forEach(function (c) { enabled[c.id] = true; });

    let dom, removedBy, queue, steps, lastMsg;
    function active() { return CONS.filter(function (c) { return enabled[c.id]; }); }
    function reset() {
      dom = {}; removedBy = {};
      VARS.forEach(function (v) { dom[v.id] = v.values.slice(); removedBy[v.id] = {}; });
      queue = [];
      active().forEach(function (c) { c.scope.forEach(function (v) { queue.push({ v: v, c: c }); }); });
      steps = 0;
      lastMsg = 'Ready: ' + queue.length + ' arcs in the queue. Each arc (variable, constraint) asks: does every value of the variable still have support in that constraint?';
    }
    /** Does value x of variable v have a supporting tuple in constraint c, given the current domains? */
    function supported(v, x, c, domains) {
      const others = c.scope.filter(function (z) { return z !== v; });
      const a = {}; a[v] = x;
      function rec(i) {
        if (i === others.length) return c.test(a);
        const z = others[i];
        const d = domains[z];
        for (let k = 0; k < d.length; k++) { a[z] = d[k]; if (rec(i + 1)) return true; }
        return false;
      }
      return rec(0);
    }
    function qName(item) { return '(' + VAR[item.v].name + ', ' + item.c.id + ')'; }
    function inQueue(v, c) { return queue.some(function (q) { return q.v === v && q.c === c; }); }
    function step() {
      if (!queue.length) return false;
      const item = queue.shift();
      steps += 1;
      const v = item.v, c = item.c;
      const removed = dom[v].filter(function (x) { return !supported(v, x, c, dom); });
      if (!removed.length) {
        lastMsg = 'Step ' + steps + ': revise' + qName(item) + ' removed nothing. Every ' + VAR[v].name + ' value still has support in ' + c.id + '.';
        return true;
      }
      dom[v] = dom[v].filter(function (x) { return removed.indexOf(x) < 0; });
      removed.forEach(function (x) { removedBy[v][x] = c.id; });
      const added = [];
      active().forEach(function (c2) {
        if (c2 === c || c2.scope.indexOf(v) < 0) return;
        c2.scope.forEach(function (z) {
          if (z !== v && !inQueue(z, c2)) { queue.push({ v: z, c: c2 }); added.push(qName({ v: z, c: c2 })); }
        });
      });
      lastMsg = 'Step ' + steps + ': revise' + qName(item) + ' removed ' + VAR[v].name + ' = ' + removed.map(num).join(', ') + ' (no support in ' + c.id + ', from ' + c.from + ').' +
        (added.length ? ' Re-queued ' + added.join(', ') + ' because their support may have used those values.' : ' Nothing new to re-queue.');
      return true;
    }
    /** At the fixed point, list every enabled constraint that alone rules out a removed value. */
    function allReasons(v, x) {
      const first = removedBy[v][x];
      const list = [first];
      if (queue.length) return list;
      active().forEach(function (c) {
        if (c.id === first || c.scope.indexOf(v) < 0) return;
        if (!supported(v, x, c, dom)) list.push(c.id);
      });
      return list;
    }

    // ---- controls
    const consBox = el('fieldset', { class: 'ac3-cons' }, el('legend', null, 'Constraints in force'));
    CONS.forEach(function (c) {
      const id = 'ac3-' + c.id;
      const cb = el('input', { type: 'checkbox', id: id, checked: true });
      cb.addEventListener('change', function () { enabled[c.id] = cb.checked; reset(); render(); ui.announce(c.id + (cb.checked ? ' switched on.' : ' switched off.') + ' Domains reset.'); });
      consBox.appendChild(el('div', { class: 'ac3-con' },
        cb, el('label', { for: id },
          el('span', { class: 'ac3-cid' }, c.id), el('span', { class: 'ac3-tex' }, '\\(' + c.tex + '\\)'),
          el('span', { class: 'ac3-from' }, 'from ' + c.from))));
    });
    const stepBtn = ui.button({ label: 'Step', kind: 'primary', icon: 'step-fwd', onClick: function () { step(); render(); ui.announce(lastMsg); } });
    const allBtn = ui.button({ label: 'Prune all', icon: 'play', onClick: function () {
      let guard = 0;
      while (queue.length && guard < 1000) { step(); guard += 1; }
      lastMsg = 'Fixed point after ' + steps + ' steps: no arc can remove anything more.';
      render(); ui.announce(lastMsg);
    } });
    const resetBtn = ui.button({ label: 'Reset', kind: 'ghost', icon: 'reset', onClick: function () { reset(); render(); ui.announce('Domains reset.'); } });
    controls.classList.add('ac3-controls');
    controls.appendChild(consBox);

    const domBox = el('div', { class: 'ac3-domains' });
    const btns = el('div', { class: 'btn-row ac3-buttons' }, stepBtn, allBtn, resetBtn);
    const log = el('p', { class: 'ac3-log', 'aria-live': 'polite' });
    const queueBox = el('div', { class: 'ac3-queue-box' });
    const summary = el('p', { class: 'ac3-summary' });
    out.appendChild(domBox);
    out.appendChild(btns);
    out.appendChild(log);
    out.appendChild(queueBox);
    out.appendChild(summary);

    function render() {
      domBox.textContent = '';
      VARS.forEach(function (v) {
        const list = el('ul', { class: 'ac3-values', role: 'list' });
        v.values.forEach(function (x) {
          const alive = dom[v.id].indexOf(x) >= 0;
          const isProj = x === v.project;
          const li = el('li', { class: ['ac3-val', alive ? 'is-in' : 'is-out', isProj ? 'is-project' : ''] },
            el('span', { class: 'ac3-num' }, num(x)));
          if (isProj) li.appendChild(el('span', { class: 'ac3-star' }, el('span', { 'aria-hidden': 'true' }, '★'), el('span', { class: 'visually-hidden' }, ' (project choice)')));
          if (!alive) {
            const reasons = allReasons(v.id, x);
            li.appendChild(el('span', { class: 'visually-hidden' }, ' removed by '));
            li.appendChild(el('span', { class: 'ac3-why' }, reasons.join(' ')));
            li.title = 'Removed by ' + reasons.join(', ');
          }
          list.appendChild(li);
        });
        domBox.appendChild(el('div', { class: 'ac3-var' },
          el('p', { class: 'ac3-var-name' }, el('span', { html: v.html }), ' ', el('span', { class: 'unit' }, '(' + v.unit + ')'), ' ', ui.tag(v.tag),
            el('span', { class: 'ac3-var-note' }, v.note)),
          list));
      });
      log.textContent = lastMsg;
      queueBox.textContent = '';
      queueBox.appendChild(el('p', { class: 'ac3-qhead' }, 'Queue: ' + queue.length + (queue.length === 1 ? ' arc' : ' arcs') + (steps ? ' · ' + steps + (steps === 1 ? ' step' : ' steps') + ' taken' : '')));
      if (queue.length) {
        const ol = el('ol', { class: 'ac3-queue' });
        queue.forEach(function (q, i) { ol.appendChild(el('li', { class: i === 0 ? 'is-next' : null }, qName(q), i === 0 ? el('span', { class: 'ac3-next' }, ' next') : null)); });
        queueBox.appendChild(ol);
      } else {
        queueBox.appendChild(el('p', { class: 'ac3-done' }, ui.icon('check'), 'Queue empty: the domains are arc-consistent.'));
      }
      stepBtn.disabled = !queue.length;
      allBtn.disabled = !queue.length;
      summary.textContent = '';
      if (!queue.length) {
        const proj = VARS.every(function (v) { return dom[v.id].indexOf(v.project) >= 0; });
        summary.appendChild(el('strong', null, 'Surviving values: '));
        summary.appendChild(document.createTextNode(VARS.map(function (v) { return v.name + ' ∈ {' + dom[v.id].map(num).join(', ') + '}'; }).join('; ') + '. '));
        summary.appendChild(document.createTextNode(proj
          ? 'The project choice (K_d ' + num(VAR.kd.project) + ', ' + VAR.en.project + ' and ' + VAR.ex.project + ' deg/s) survives every constraint in force.'
          : 'The project choice was removed: check which constraint is switched off or changed.'));
      }
    }
    reset();
    render();
  }

  /* ================================================================ W1.4 PEAS sorter */

  function buildPEAS() {
    const out = $('peas-output');
    const BUCKETS = [
      { id: 'P', label: 'P: Performance' }, { id: 'E', label: 'E: Environment' },
      { id: 'A', label: 'A: Actuators' }, { id: 'S', label: 'S: Sensors' }
    ];
    const ITEMS = [
      { id: 'dist', label: 'Disturbance torque', ans: 'E', why: 'Switch the controller off and the disturbance is still there, so it belongs to the environment.' },
      { id: 'wheel', label: 'Reaction wheel', ans: 'A', why: 'It disappears with the attitude-control system and is how the agent acts on the body: an actuator.' },
      { id: 'gyro', label: 'Rate gyro', ans: 'S', why: 'Part of the agent, and it measures ω: a sensor (an extension here, because the project fed back the true state).' },
      { id: 'st', label: 'Star tracker', ans: 'S', why: 'Part of the agent, and it measures attitude: a sensor (an extension here, like the gyro).' },
      { id: 'sun', label: 'The Sun', ans: 'E', why: 'It exists whether or not the agent does: environment (and a source of radiation-pressure torque).' },
      { id: 'point', label: '±2° pointing', ans: 'P', why: 'A goal the agent is scored on, not a thing in the world: performance (REQ-F2).' },
      { id: 'limit', label: '15 deg/s limit', ans: 'P', why: 'A bound the agent is scored against: performance (REQ-S1).' },
      { id: 'body', label: 'Rigid body', ans: 'E', why: 'Switch the controller off and the body is still there. To the agent it is the world it acts on: environment.' },
      { id: 'detumble', label: '60 s detumble', ans: 'P', why: 'A deadline the agent is scored on: performance (REQ-L1).' }
    ];
    const place = {};
    ITEMS.forEach(function (it) { place[it.id] = null; });
    let selected = null;
    let checked = false;

    const pool = el('div', { class: 'peas-pool' });
    const bucketsBox = el('div', { class: 'peas-buckets' });
    const status = el('p', { class: 'status-line peas-status', 'aria-live': 'polite' }, 'Pick an item first.');
    const feedback = el('ul', { class: 'peas-feedback', role: 'list' });
    const checkBtn = ui.button({ label: 'Check', kind: 'primary', icon: 'check', onClick: function () { checked = true; render(); announceScore(); } });
    const resetBtn = ui.button({ label: 'Reset', kind: 'ghost', icon: 'reset', onClick: function () {
      ITEMS.forEach(function (it) { place[it.id] = null; }); selected = null; checked = false; status.textContent = 'Pick an item first.'; render();
    } });
    out.appendChild(el('p', { class: 'field-label' }, 'To sort'));
    out.appendChild(pool);
    out.appendChild(bucketsBox);
    out.appendChild(el('div', { class: 'btn-row' }, checkBtn, resetBtn));
    out.appendChild(status);
    out.appendChild(feedback);

    function itemBtn(it) {
      const b = el('button', { type: 'button', class: 'peas-item', 'aria-pressed': selected === it.id ? 'true' : 'false' }, it.label);
      if (checked && place[it.id]) {
        const ok = place[it.id] === it.ans;
        b.classList.add(ok ? 'is-right' : 'is-wrong');
        b.insertBefore(ui.icon(ok ? 'check' : 'cross', { label: ok ? 'correct' : 'wrong' }), b.firstChild);
      }
      b.addEventListener('click', function () {
        selected = selected === it.id ? null : it.id;
        status.textContent = selected ? '“' + it.label + '” selected. Now choose its letter.' : 'Selection cleared.';
        render();
        const again = out.querySelector('.peas-item[data-id="' + it.id + '"]');
        if (again) again.focus();
      });
      b.dataset.id = it.id;
      return b;
    }
    function render() {
      pool.textContent = '';
      const left = ITEMS.filter(function (it) { return !place[it.id]; });
      left.forEach(function (it) { pool.appendChild(itemBtn(it)); });
      if (!left.length) pool.appendChild(el('span', { class: 'muted' }, 'All nine placed. Press Check.'));
      bucketsBox.textContent = '';
      BUCKETS.forEach(function (bk) {
        const target = el('button', { type: 'button', class: 'btn secondary sm peas-target', disabled: !selected, 'aria-label': 'Place selected here: ' + bk.label }, 'Place selected here');
        target.addEventListener('click', function () {
          if (!selected) return;
          const it = ITEMS.find(function (x) { return x.id === selected; });
          place[selected] = bk.id; selected = null; checked = false;
          status.textContent = '“' + it.label + '” placed in ' + bk.label + '.';
          render();
          target.focus();
        });
        const list = el('div', { class: 'peas-in' });
        ITEMS.filter(function (it) { return place[it.id] === bk.id; }).forEach(function (it) { list.appendChild(itemBtn(it)); });
        bucketsBox.appendChild(el('div', { class: 'peas-bucket', role: 'group', 'aria-label': bk.label }, el('p', { class: 'peas-bucket-name' }, bk.label), list, target));
      });
      checkBtn.disabled = ITEMS.some(function (it) { return !place[it.id]; });
      feedback.textContent = '';
      if (checked) {
        ITEMS.forEach(function (it) {
          const ok = place[it.id] === it.ans;
          feedback.appendChild(el('li', { class: ok ? 'is-right' : 'is-wrong' }, ui.icon(ok ? 'check' : 'cross'),
            el('span', null, el('strong', null, it.label + ': ' + it.ans + '. '), ok ? '' : '(You chose ' + place[it.id] + '.) ', it.why)));
        });
      }
    }
    function announceScore() {
      const right = ITEMS.filter(function (it) { return place[it.id] === it.ans; }).length;
      status.textContent = right + ' of ' + ITEMS.length + ' in the right letter.' + (right === ITEMS.length ? ' The switch-off test agrees with every placement.' : ' Read the reasons below, then move any item and check again.');
    }
    render();
  }

  /* ================================================================ page setup */

  ui.ready(function () {
    ui.mountChrome({ page: 'm01' });
    buildReqTable();
    buildLinter();
    buildTrace();
    buildMargins();
    buildAC3();
    buildPEAS();

    ui.quiz($('quiz'), [
      { q: 'Which kind of evidence can refute REQ-S1?',
        options: ['A Monte Carlo pass rate below 95%.', 'A single log sample above 15 deg/s.', 'The absence of a detumble within 60 s.'], correct: 1,
        explain: 'REQ-S1 is a safety property (“never above 15 deg/s”). One sample above the limit refutes it, however long the log continues. The other two are evidence about the liveness requirements, L1 and F1.' },
      { q: 'REQ-L1 is…',
        options: ['a safety requirement.', 'an assumption.', 'a bounded, probabilistic liveness requirement.'], correct: 2,
        explain: 'It promises that something good happens (|ω| below 0.5 deg/s) within a bound (60 s) in at least 95% of trials. The bound makes it testable on a finite log; the 95% makes it a statistical claim over many trials.' },
      { q: 'In the traceability matrix, which test is a hyperedge?',
        options: ['T03.', 'T04.', 'T06.'], correct: 0,
        explain: 'T03 verifies three requirements (F1, S1 and S2) in one scenario, so it is one edge joining three nodes. T04 verifies only L1 and T06 only S2.' }
    ]);
    ui.renderProvenance($('provenance'), 'm01');
    ui.typeset(document.body);
    ui.linkTerms(document.body);
  });
})();
