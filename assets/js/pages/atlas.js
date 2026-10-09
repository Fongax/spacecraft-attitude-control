/**
 * atlas.js: the subjects atlas (atlas.html).
 *
 * Three views of ADCS.data: cards grouped by discipline, a subject × project-part matrix and a
 * discipline × project-part heat table. Search (name, covered text, typical content, ideas and
 * link concepts; case-insensitive; 150 ms debounce; matches wrapped in <mark>) and the filters
 * (disciplines, evidence, project part, minimum strength) and the view are kept in
 * location.hash, for example #v=matrix&q=kalman&d=math,ai&ev=outline&m=m05&s=strong.
 * A deep link #c-<course id> opens that subject's card, scrolls to it and flashes its outline.
 */
(function () { 'use strict';
  const ui = ADCS.ui;
  const el = ui.el;

  const RANK = { weak: 1, moderate: 2, strong: 3 };
  const WEIGHT = { strong: 3, moderate: 2, weak: 1 };
  const MIN_RANK = { any: 1, moderate: 2, strong: 3 };
  const VIEWS = [
    { id: 'cards', label: 'Cards' },
    { id: 'matrix', label: 'Matrix' },
    { id: 'disciplines', label: 'Disciplines' }
  ];
  const EVIDENCE_OPTS = [
    { value: 'all', label: 'All' },
    { value: 'notes', label: 'Notes' },
    { value: 'partial', label: 'Partial notes' },
    { value: 'outline', label: 'Typical content' }
  ];
  const MIN_OPTS = [
    { value: 'any', label: 'Any' },
    { value: 'moderate', label: 'Moderate+' },
    { value: 'strong', label: 'Strong' }
  ];
  const DEFAULTS = { v: 'cards', q: '', d: [], ev: 'all', m: 'all', s: 'any' };
  const FLASH_MS = 2400;

  /*
   * One sentence per discipline summarising what its links carry into the project. Each sentence
   * paraphrases the link concepts recorded in ADCS.data.mappings for that discipline's subjects.
   * A sentence that mentions the sensor extension is shown with the Extension tag.
   */
  const BRINGS = {
    me: 'The physical plant: rigid-body dynamics and the inertia tensor, the reaction-wheel motor with its speed-dependent torque limit, and the habit of designing to a stated margin.',
    math: 'The language of the model: vectors, matrices and complex numbers grow into quaternions, Taylor series explain why RK4 is accurate, and probability turns sixty passing trials into a confidence bound.',
    phys: 'The physics under the equations: τ = dL/dt rewritten in the rotating body frame, the damped oscillator behind the controller’s damping ratio, and the thin upper atmosphere that sets the drag torque.',
    cs: 'The logic and the machine: the mode manager as a finite automaton that can be checked exhaustively, one simulation step as a dataflow graph, and the number formats, timers and watchdogs that flight code runs on.',
    sw: 'The code itself: controller and mode-manager classes, a reusable RK4 step, seeded and reproducible Monte Carlo trials, and automated tests that carry requirement IDs.',
    ai: 'Ways of reasoning about the loop: the spacecraft as an agent, LQR seen as a Bellman equation, Bayes’ rule as the root of the recursive filter that the sensor extension turns into a Kalman filter (the filter itself is not taught in these subjects), and the statistics of what sixty passing trials can prove.',
    av: 'Flight-proven analogues: instrument gyros and tail-rotor torque reaction for the wheels, failsafe state machines and decision thresholds for safe mode, and strapdown navigation for the sensor extension.',
    mhf: 'The work around the code: risk registers and planning, mode-confusion research for the interface, and the layered defences and just culture behind operating the spacecraft.'
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /*
   * A small visible A or E for an analogy or extension link. On a chip or a matrix dot it is hidden
   * from screen readers, whose label already names the tag; in a legend sentence it is read.
   */
  function tagMini(tag, inLegend) {
    if (tag !== 'analogy' && tag !== 'extension') return null;
    return el('span', { class: 'tag-mini tag-mini-' + tag, 'aria-hidden': inLegend ? null : 'true' }, tag === 'analogy' ? 'A' : 'E');
  }
  function tagNote(tag) { return tag && tag !== 'direct' ? ' (' + tag + ')' : ''; }
  function copyState(s) { return { v: s.v, q: s.q, d: s.d.slice(), ev: s.ev, m: s.m, s: s.s }; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function listJoin(items) {
    if (items.length <= 1) return items.slice();
    const out = [];
    items.forEach(function (it, i) {
      if (i) out.push(i === items.length - 1 ? ' and ' : ', ');
      out.push(it);
    });
    return out;
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'atlas' });
    const D = ADCS.data;
    if (!D || !Array.isArray(D.courses) || typeof D.mappingsForCourse !== 'function') {
      throw new Error('the subject data (ADCS.data) did not load');
    }
    const atlas = buildAtlas(D);
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    atlas.start();
  });

  /* ================================================================ the atlas */

  function buildAtlas(D) {
    const MODS = D.modules;
    const DISCS = D.disciplines;
    const COURSES = D.courses;
    const LINKS = {};
    const TEXT = {};
    COURSES.forEach(function (c) {
      LINKS[c.id] = D.mappingsForCourse(c.id);
      TEXT[c.id] = [c.name, c.covered].concat(c.typical || [], c.keyIdeas || [],
        LINKS[c.id].map(function (r) { return r.concept; })).join('\n').toLowerCase();
    });
    const TOTAL_LINKS = D.mappings.length;
    const reduced = ui.prefersReducedMotion();

    let state = copyState(DEFAULTS);
    let terms = [];
    let routing = false;        // true while applying a URL: suppresses writing the hash back
    let lastHash = location.hash;
    let activePop = null;
    let lastDeep = null;

    function modName(m) { return pad2(m.num) + ' ' + m.title; }
    function modShort(m) { return pad2(m.num) + ' ' + m.short; }
    function sectionTitle(m, id) {
      const s = (m.sections || []).find(function (x) { return x.id === id; });
      return s ? s.title : null;
    }
    function strengthLabel(s) { return (D.labels && D.labels.strength && D.labels.strength[s]) || s; }

    /* ---------------------------------------------------------------- filtering */
    function linkOk(r) {
      return (state.m === 'all' || r.module === state.m) && RANK[r.strength] >= MIN_RANK[state.s];
    }
    function matchesSearch(c) {
      for (let i = 0; i < terms.length; i++) if (TEXT[c.id].indexOf(terms[i]) < 0) return false;
      return true;
    }
    function passesEvidenceAndSearch(c) {
      return (state.ev === 'all' || c.evidence === state.ev) && matchesSearch(c);
    }
    function courseVisible(c) {
      if (state.d.length && state.d.indexOf(c.discipline) < 0) return false;
      if (!passesEvidenceAndSearch(c)) return false;
      return LINKS[c.id].some(linkOk);
    }
    function filtersActive(s) {
      const st = s || state;
      return !!(st.q || st.d.length || st.ev !== 'all' || st.m !== 'all' || st.s !== 'any');
    }
    function activeCount() {
      return (state.d.length ? 1 : 0) + (state.ev !== 'all' ? 1 : 0) + (state.m !== 'all' ? 1 : 0) + (state.s !== 'any' ? 1 : 0);
    }
    function searchRegex() {
      if (!terms.length) return null;
      const parts = terms.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRe);
      return new RegExp(parts.join('|'), 'gi');
    }
    function highlight(node, text, re) {
      node.textContent = '';
      if (!re) { node.textContent = text; return false; }
      re.lastIndex = 0;
      let last = 0, hit = false, m;
      while ((m = re.exec(text))) {
        if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
        node.appendChild(el('mark', null, m[0]));
        last = m.index + m[0].length;
        hit = true;
      }
      if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
      return hit;
    }

    /* ---------------------------------------------------------------- hash */
    function parseHash(raw) {
      const h = String(raw || '').replace(/^#/, '');
      if (!h) return { state: copyState(DEFAULTS) };
      if (/^c-/.test(h)) {
        let id = h.slice(2);
        try { id = decodeURIComponent(id); } catch (e) { /* keep the raw id */ }
        return { deep: id };
      }
      if (h.indexOf('=') < 0) return { anchor: h };
      const st = copyState(DEFAULTS);
      h.split('&').forEach(function (pair) {
        const i = pair.indexOf('=');
        if (i < 0) return;
        const k = pair.slice(0, i);
        let v;
        try { v = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { return; }
        if (k === 'v' && VIEWS.some(function (x) { return x.id === v; })) st.v = v;
        else if (k === 'q') st.q = v.trim().slice(0, 80);
        else if (k === 'd') {
          const want = v.split(',');
          st.d = DISCS.filter(function (d) { return want.indexOf(d.id) >= 0; }).map(function (d) { return d.id; });
        } else if (k === 'ev' && EVIDENCE_OPTS.some(function (x) { return x.value === v; })) st.ev = v;
        else if (k === 'm' && D.module(v)) st.m = v;
        else if (k === 's' && MIN_RANK[v]) st.s = v;
      });
      return { state: st };
    }
    function serialise(st) {
      const parts = [];
      if (st.v !== 'cards') parts.push('v=' + st.v);
      if (st.q) parts.push('q=' + encodeURIComponent(st.q));
      if (st.d.length) parts.push('d=' + st.d.join(','));
      if (st.ev !== 'all') parts.push('ev=' + st.ev);
      if (st.m !== 'all') parts.push('m=' + st.m);
      if (st.s !== 'any') parts.push('s=' + st.s);
      return parts.join('&');
    }
    function setHash(want, push) {
      if (location.hash === want || (!want && !location.hash)) { lastHash = location.hash; return; }
      try {
        const url = want || (location.pathname + location.search);
        if (push) history.pushState(null, '', url); else history.replaceState(history.state, '', url);
      } catch (e) {
        // History API refused (some file:// set-ups): fall back to a plain fragment change.
        location.replace(want || '#v=cards');
      }
      lastHash = location.hash;
    }
    function writeHash() {
      if (routing) return;
      const h = serialise(state);
      setHash(h ? '#' + h : '', false);
    }

    /* ---------------------------------------------------------------- page header parts */
    const stats = D.stats();
    const statsBox = document.getElementById('atlas-stats');
    statsBox.textContent = '';
    [[stats.courses, 'subjects'], [stats.disciplines, 'disciplines'], [stats.modules, 'project parts'], [stats.links, 'links']]
      .forEach(function (p, i) {
        if (i) statsBox.appendChild(el('span', { class: 'atlas-sep', 'aria-hidden': 'true' }, ' · '));
        statsBox.appendChild(el('span', { class: 'atlas-stat' }, el('strong', null, String(p[0])), ' ' + p[1]));
      });

    buildGlance();
    buildWorked();

    function buildGlance() {
      const host = document.getElementById('atlas-glance');
      if (!host) return;
      const ev = { notes: 0, partial: 0, outline: 0 };
      COURSES.forEach(function (c) { ev[c.evidence] += 1; });
      const st = { strong: 0, moderate: 0, weak: 0 };
      const tg = { direct: 0, analogy: 0, extension: 0 };
      D.mappings.forEach(function (r) { st[r.strength] += 1; tg[r.tag] += 1; });
      function bar(title, total, unit, parts) {
        return el('div', { class: 'glance' },
          el('p', { class: 'glance-title' }, el('strong', null, title), ' (' + total + ' ' + unit + ')'),
          el('div', { class: 'glance-bar', 'aria-hidden': 'true' }, parts.map(function (p) {
            return el('span', { class: 'glance-seg ' + p.cls, style: { flexGrow: String(p.n) }, title: p.label + ': ' + p.n });
          })),
          el('ul', { class: 'glance-legend' }, parts.map(function (p) {
            return el('li', null, el('span', { class: 'glance-key ' + p.cls, 'aria-hidden': 'true' }), p.label + ' ',
              el('strong', null, String(p.n)), el('span', { class: 'muted' }, ' (' + Math.round(100 * p.n / total) + '%)'));
          })));
      }
      host.appendChild(el('h3', { class: 'glance-head' }, 'All links at a glance'));
      host.appendChild(el('div', { class: 'grid-3 glance-grid' },
        bar('Evidence', COURSES.length, 'subjects', [
          { label: 'Notes', n: ev.notes, cls: 'ev-n' },
          { label: 'Partial notes', n: ev.partial, cls: 'ev-p' },
          { label: 'Typical content', n: ev.outline, cls: 'ev-o' }]),
        bar('Strength', TOTAL_LINKS, 'links', [
          { label: 'Strong', n: st.strong, cls: 'st-s' },
          { label: 'Moderate', n: st.moderate, cls: 'st-m' },
          { label: 'Weak', n: st.weak, cls: 'st-w' }]),
        bar('Tag', TOTAL_LINKS, 'links', [
          { label: 'Direct', n: tg.direct, cls: 'tg-d' },
          { label: 'Analogy', n: tg.analogy, cls: 'tg-a' },
          { label: 'Extension', n: tg.extension, cls: 'tg-e' }])));
      const outlineLinks = D.mappings.filter(function (r) { const c = D.course(r.course); return c && c.evidence === 'outline'; }).length;
      host.appendChild(el('p', { class: 'glance-note muted' },
        ev.outline + ' of ' + COURSES.length + ' subjects are known only from their outlines, so ' + outlineLinks + ' of the ' + TOTAL_LINKS + ' links (' +
        Math.round(100 * outlineLinks / TOTAL_LINKS) + '%) rest on the typical content of a subject of that name. ' +
        'Every card, matrix popover and module provenance box shows which kind of evidence stands behind a link.'));
    }

    /* Discipline scores S_{d,m} = Σ w(c,m), and the "strongest on" parts (top three, ties kept),
       highest score first and equal scores in module order. */
    function scores(dId) {
      const s = {};
      MODS.forEach(function (m) { s[m.id] = 0; });
      D.mappings.forEach(function (r) {
        const c = D.course(r.course);
        if (c && c.discipline === dId) s[r.module] += WEIGHT[r.strength];
      });
      return s;
    }
    function strongestOn(dId) {
      const s = scores(dId);
      const sorted = MODS.filter(function (m) { return s[m.id] > 0; })
        .sort(function (a, b) { return s[b.id] - s[a.id] || a.num - b.num; });
      if (!sorted.length) return [];
      const cut = s[sorted[Math.min(2, sorted.length - 1)].id];
      return sorted.filter(function (m) { return s[m.id] >= cut; })
        .map(function (m) { return { m: m, score: s[m.id] }; });
    }

    function buildWorked() {
      const host = document.getElementById('atlas-worked');
      if (!host) return;
      const d = D.discipline('math') || DISCS[0];
      const top = strongestOn(d.id);
      if (!top.length) return;
      const m = top[0].m;
      const rows = D.mappings.filter(function (r) { const c = D.course(r.course); return c && c.discipline === d.id && r.module === m.id; });
      const sum = rows.reduce(function (a, r) { return a + WEIGHT[r.strength]; }, 0);
      host.textContent = '';
      host.appendChild(el('strong', null, 'Worked example. '));
      host.appendChild(document.createTextNode(d.name + ' into ' + modShort(m) + ': '));
      host.appendChild(document.createTextNode(rows.map(function (r) {
        return D.course(r.course).name + ' (' + r.strength + ', ' + WEIGHT[r.strength] + ')';
      }).join(' + ') + ', so '));
      host.appendChild(document.createTextNode('\\(S = ' + rows.map(function (r) { return WEIGHT[r.strength]; }).join(' + ') + ' = ' + sum + '\\)'));
      const others = top.filter(function (t) { return t.m !== m; });
      const tied = others.filter(function (t) { return t.score === sum; });
      if (tied.length) {
        host.appendChild(document.createTextNode('. ' + listJoin(tied.map(function (t) { return pad2(t.m.num); })).join('') +
          (tied.length === 1 ? ' scores' : ' score') + ' the same, so ' + d.name + ' is strongest on ' +
          listJoin(top.map(function (t) { return pad2(t.m.num); })).join('') + '.'));
      } else {
        host.appendChild(document.createTextNode('.'));
      }
      // Tie the score to the heat table, which counts subjects rather than weights.
      host.appendChild(document.createTextNode(' With no filters, the heat table shows ' + rows.length + ' in that cell: it counts the ' +
        (rows.length === 1 ? 'subject' : rows.length + ' subjects') + ', not their weights.'));
    }

    /* ---------------------------------------------------------------- controls */
    const controls = document.getElementById('atlas-controls');
    const searchId = 'atlas-q';
    const searchInput = el('input', {
      type: 'search', id: searchId, autocomplete: 'off', spellcheck: 'false', maxlength: '80',
      placeholder: 'quaternion, Kalman, hysteresis…', 'aria-describedby': searchId + '-help'
    });
    const searchField = el('div', { class: 'field atlas-search' },
      el('label', { class: 'field-label', for: searchId }, 'Search subjects'),
      searchInput,
      el('p', { class: 'field-help', id: searchId + '-help' }, 'Matches subject names, what was covered, typical content, ideas and link concepts. Several words must all match.'));

    const chips = {};
    const chipBox = el('div', { class: 'chips atlas-chips' });
    DISCS.forEach(function (d) {
      const n = COURSES.filter(function (c) { return c.discipline === d.id; }).length;
      const chip = ui.chip({ label: d.name + ' (' + n + ')', dot: d.color, pressed: false, title: 'Show ' + d.name + ' subjects' });
      chip.on('change', function () {
        state.d = DISCS.filter(function (x) { return chips[x.id].value; }).map(function (x) { return x.id; });
        apply();
      });
      chips[d.id] = chip;
      chipBox.appendChild(chip.el);
    });
    const discField = el('fieldset', { class: 'seg atlas-disc' },
      el('legend', null, 'Disciplines ', el('span', { class: 'field-help-inline' }, '(none selected shows all)')), chipBox);

    const evCtl = ui.segmented({ id: 'atlas-ev', label: 'Evidence', options: EVIDENCE_OPTS, value: 'all' });
    const minCtl = ui.segmented({ id: 'atlas-s', label: 'Minimum strength', options: MIN_OPTS, value: 'any' });
    const modCtl = ui.select({
      id: 'atlas-m', label: 'Project part',
      options: [{ value: 'all', label: 'All ' + MODS.length + ' parts' }].concat(MODS.map(function (m) { return { value: m.id, label: modName(m) }; })),
      value: 'all'
    });
    evCtl.on('change', function () { state.ev = evCtl.value; apply(); });
    minCtl.on('change', function () { state.s = minCtl.value; apply(); });
    modCtl.on('change', function () { state.m = modCtl.value; apply(); });

    const clearBtn = ui.button({ label: 'Clear filters', kind: 'secondary', icon: 'reset', small: true, onClick: function () { clearFilters(false); } });
    const filtersSummary = el('summary', null, 'Filters');
    const filtersBody = el('div', { class: 'details-body atlas-filter-body' },
      discField,
      el('div', { class: 'atlas-filter-row' }, evCtl.el, minCtl.el, modCtl.el),
      el('div', { class: 'btn-row' }, clearBtn));
    let wide = false;
    try { wide = window.matchMedia('(min-width: 900px)').matches; } catch (e) { wide = false; }
    const filtersBox = el('details', { class: 'disclosure atlas-filters', open: wide }, filtersSummary, filtersBody);
    controls.appendChild(searchField);
    controls.appendChild(filtersBox);

    const runSearch = ui.debounce(function () {
      const q = searchInput.value.trim().slice(0, 80);
      if (q === state.q) return;
      state.q = q;
      apply();
    }, 150);
    searchInput.addEventListener('input', runSearch);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch.flush(); }
      else if (e.key === 'Escape' && searchInput.value) { e.preventDefault(); searchInput.value = ''; runSearch(); runSearch.flush(); }
    });

    function syncControls() {
      searchInput.value = state.q;
      DISCS.forEach(function (d) { chips[d.id].set(state.d.indexOf(d.id) >= 0); });
      evCtl.set(state.ev);
      minCtl.set(state.s);
      modCtl.set(state.m);
      if (activeCount() && !filtersBox.open) filtersBox.open = true;
    }
    function clearFilters(focusSearch) {
      runSearch.cancel();
      const v = state.v;
      state = copyState(DEFAULTS);
      state.v = v;
      syncControls();
      apply();
      if (focusSearch) searchInput.focus();
    }
    document.getElementById('atlas-empty-clear').addEventListener('click', function () { clearFilters(true); });

    /* ---------------------------------------------------------------- try / notice */
    (function buildTry() {
      const host = document.getElementById('atlas-try');
      const strongBy = MODS.map(function (m) {
        return { m: m, n: D.mappings.filter(function (r) { return r.module === m.id && r.strength === 'strong'; }).length };
      });
      const sorted = strongBy.slice().sort(function (a, b) { return b.n - a.n || a.m.num - b.m.num; });
      const minN = sorted[sorted.length - 1].n;
      const low = strongBy.filter(function (x) { return x.n === minN; });
      const outlineOnly = DISCS.filter(function (d) {
        const cs = COURSES.filter(function (c) { return c.discipline === d.id; });
        return cs.length && cs.every(function (c) { return c.evidence === 'outline'; });
      });
      host.textContent = '';
      host.appendChild(el('strong', null, 'Try: '));
      host.appendChild(document.createTextNode('set the minimum strength to Strong, then open the Matrix or Disciplines view. '));
      host.appendChild(el('strong', null, 'Notice: '));
      host.appendChild(document.createTextNode(modShort(sorted[0].m) + ' (' + sorted[0].n + ' strong links) and ' + modShort(sorted[1].m) +
        ' (' + sorted[1].n + ') gather the most, while ' + listJoin(low.map(function (x) { return modShort(x.m); })).join('') +
        (low.length === 1 ? ' has ' : ' have ') + minN + (low.length === 1 ? '.' : ' each.')));
      if (outlineOnly.length) {
        host.appendChild(document.createTextNode(' Then choose Typical content: every subject in ' +
          listJoin(outlineOnly.map(function (d) { return d.name; })).join('') + ' rests on its outline alone.'));
      }
    })();

    /* ---------------------------------------------------------------- cards view */
    const cards = {};
    const groups = {};
    const autoOpened = new Set();
    const cardsPanel = el('div', { class: 'atlas-cards-view' });
    const expandBtn = ui.button({ label: 'Expand all', kind: 'secondary', small: true, onClick: function () { setAllOpen(true); } });
    const collapseBtn = ui.button({ label: 'Collapse all', kind: 'secondary', small: true, onClick: function () { setAllOpen(false); } });
    cardsPanel.appendChild(el('div', { class: 'btn-row atlas-cards-tools' },
      el('p', { class: 'muted atlas-cards-hint' }, 'Each card lists the ideas a subject brings. Open it for the concept behind every project part it feeds and, where only an outline is available, the typical content of the subject. A small ',
        tagMini('analogy', true), ' or ', tagMini('extension', true), ' on a part marks an analogy or extension link.'),
      expandBtn, collapseBtn));

    function setAllOpen(open) {
      COURSES.forEach(function (c) {
        const k = cards[c.id];
        if (k.el.hidden) return;
        k.details.open = open;
        k.userClosed = !open;
      });
      autoOpened.clear();
      ui.announce(open ? 'All shown cards expanded' : 'All shown cards collapsed');
    }

    DISCS.forEach(function (d) {
      const cs = COURSES.filter(function (c) { return c.discipline === d.id; });
      if (!cs.length) return;
      const titleId = 'grp-' + d.id + '-title';
      const count = el('span', { class: 'count' });
      const grid = el('div', { class: 'atlas-card-grid' });
      const sec = el('section', { class: 'atlas-group', id: 'grp-' + d.id, 'aria-labelledby': titleId, style: { '--dot': 'var(' + d.color + ')' } },
        el('h3', { class: 'atlas-group-head', id: titleId },
          el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { class: 'atlas-group-name' }, d.name), count),
        grid);
      groups[d.id] = { el: sec, count: count, total: cs.length };
      cs.forEach(function (c) { grid.appendChild(buildCard(c, d)); });
      cardsPanel.appendChild(sec);
    });

    function buildCard(c, d) {
      const links = LINKS[c.id];
      const hl = [];
      const nameEl = el('span', null, c.name);
      hl.push([nameEl, c.name]);
      const kind = (D.labels && D.labels.kind && D.labels.kind[c.kind]) || c.kind;
      const isOutline = c.evidence === 'outline';
      const coveredEl = el('p', { class: 'course-covered' }, c.covered);
      hl.push([coveredEl, c.covered]);

      // The ideas a subject brings sit on the card face, so a reader scanning a discipline sees
      // its subject matter without opening every card.
      let ideas = null;
      if (c.keyIdeas && c.keyIdeas.length) {
        const ul = el('ul', { class: 'course-ideas' });
        c.keyIdeas.forEach(function (t) { const li = el('li', null, t); ul.appendChild(li); hl.push([li, t]); });
        ideas = [el('p', { class: 'course-label' }, D.notes.keyIdeasHeading || 'Ideas it brings to this project',
          isOutline ? [' ', ui.tag('typical')] : null), ul];
      }

      const chipList = el('ul', { class: 'feed-chips', role: 'list', 'aria-label': 'Project parts it feeds' });
      const chipItems = [];
      links.forEach(function (r) {
        const m = D.module(r.module);
        // The name comes from the content: the visible number, then hidden words for the module,
        // the strength, the tag and (when a filter dims the chip) that it is outside the filter.
        const desc = ' ' + m.title + ', ' + strengthLabel(r.strength).toLowerCase() + ' link' + tagNote(r.tag);
        const hidden = el('span', { class: 'visually-hidden' }, desc);
        const a = el('a', {
          class: 'feed-chip ' + r.strength, href: m.slug + '#provenance',
          title: modName(m) + ': ' + strengthLabel(r.strength).toLowerCase() + ' link' + tagNote(r.tag)
        }, el('span', { class: 'atlas-glyph ' + r.strength, 'aria-hidden': 'true' }), pad2(m.num), hidden, tagMini(r.tag));
        const li = el('li', null, a);
        chipItems.push({ li: li, r: r, hidden: hidden, desc: desc });
        chipList.appendChild(li);
      });

      const body = el('div', { class: 'details-body' });
      const deep = [];   // highlightable nodes inside the closed part of the card
      if (c.typical && c.typical.length) {
        const scope = c.typicalScope ? ' (' + c.typicalScope + ')' : '';
        const ul = el('ul', { class: 'course-typical' });
        c.typical.forEach(function (t) { const li = el('li', null, t); ul.appendChild(li); deep.push([li, t]); });
        body.appendChild(el('h5', { class: 'course-label' }, (D.notes.typicalHeading || 'Typical content of this subject') + scope, ' ', ui.tag('typical')));
        body.appendChild(el('p', { class: 'course-inferred' }, D.notes.typicalInferred || '(inferred from the subject outline, not from notes)'));
        body.appendChild(ul);
      }
      const rowList = el('ul', { class: 'feed-list' });
      const rowItems = [];
      links.forEach(function (r) {
        const m = D.module(r.module);
        const concept = el('p', { class: 'feed-concept' }, r.concept);
        deep.push([concept, r.concept]);
        const st = r.section ? sectionTitle(m, r.section) : null;
        const li = el('li', { class: 'feed-row' },
          el('div', { class: 'feed-meta' },
            el('a', { href: m.slug + '#provenance' }, modName(m)), ui.pill(r.strength),
            r.tag && r.tag !== 'direct' ? ui.tag(r.tag) : null,
            el('span', { class: 'feed-off' }, '')),
          concept,
          st ? el('p', { class: 'feed-where' }, 'In the module: ', el('a', { href: m.slug + '#' + r.section }, st)) : null);
        rowItems.push({ li: li, r: r, off: li.querySelector('.feed-off') });
        rowList.appendChild(li);
      });
      body.appendChild(el('h5', { class: 'course-label' }, 'Feeds these project parts'));
      body.appendChild(rowList);

      const feeds = 'how it feeds ' + plural(links.length, 'project part');
      const summary = el('summary', null, 'Details: ' + (c.typical && c.typical.length ? 'typical content, and ' + feeds : feeds));
      const details = el('details', { class: 'disclosure course-more' }, summary, body);
      // Activating the summary (click, Enter or Space) toggles the card: remember a close, so a
      // later filter change during the same search does not reopen it.
      summary.addEventListener('click', function () {
        const k = cards[c.id];
        if (!k) return;
        k.userClosed = details.open;
        if (details.open) autoOpened.delete(c.id);
      });

      const article = el('article', {
        class: 'card course-card', id: 'c-' + c.id, tabindex: '-1', 'aria-labelledby': 'c-' + c.id + '-name',
        dataset: { course: c.id, evidence: c.evidence }, style: { '--dot': 'var(' + d.color + ')' }
      },
        el('h4', { class: 'course-name', id: 'c-' + c.id + '-name' }, nameEl),
        el('p', { class: 'course-meta' },
          el('span', { class: 'disc-tag' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), d.name),
          el('span', { class: 'course-kind' }, kind), ui.evidence(c.evidence)),
        el('p', { class: 'course-label' }, isOutline ? 'What the subject outline shows' : 'What was covered'),
        coveredEl,
        ideas,
        el('div', { class: 'course-feeds' }, el('span', { class: 'course-label' }, 'Feeds'), chipList),
        details);
      cards[c.id] = { el: article, details: details, hl: hl, deep: deep, chips: chipItems, rows: rowItems, c: c, deepHit: false, userClosed: false };
      return article;
    }

    /* ---------------------------------------------------------------- matrix view */
    const matrixPanel = el('div', { class: 'atlas-matrix-view' });
    matrixPanel.appendChild(el('p', { class: 'atlas-panel-intro' },
      'Each row is a subject and each column a project part: ',
      el('span', { class: 'atlas-glyph strong', 'aria-hidden': 'true' }), ' strong, ',
      el('span', { class: 'atlas-glyph moderate', 'aria-hidden': 'true' }), ' moderate, ',
      el('span', { class: 'atlas-glyph weak', 'aria-hidden': 'true' }), ' weak; a small ', tagMini('analogy', true), ' or ', tagMini('extension', true),
      ' marks an analogy or extension link. Select a dot for the concept and links. ',
      'In the table, the arrow keys move between dots and Enter opens one. Small grey dots fall outside the current project-part or strength filter.'));
    const mxRows = {};
    const mxCols = {};
    const mxTotals = {};
    const mxGroups = {};
    const matrix = el('table', { class: 'matrix atlas-matrix' });
    matrix.appendChild(el('caption', { class: 'visually-hidden' },
      'Links between subjects (rows) and the thirteen project parts (columns), grouped by discipline.'));
    const mxHead = el('tr', null, el('th', { scope: 'col', class: 'sticky-col mx-corner' }, 'Subject'));
    MODS.forEach(function (m) {
      const th = el('th', { scope: 'col', class: 'mx-col', dataset: { mod: m.id } },
        el('a', { href: m.slug + '#provenance', title: modName(m) }, el('span', { class: 'mx-num' }, pad2(m.num)), ' ' + m.short));
      mxCols[m.id] = [th];
      mxHead.appendChild(th);
    });
    matrix.appendChild(el('thead', null, mxHead));
    let rowNo = 0;
    DISCS.forEach(function (d) {
      const cs = COURSES.filter(function (c) { return c.discipline === d.id; });
      if (!cs.length) return;
      const tb = el('tbody', { style: { '--dot': 'var(' + d.color + ')' } });
      const gr = el('tr', { class: 'group-row' },
        el('th', { scope: 'rowgroup', class: 'sticky-col' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), ' ' + d.name));
      MODS.forEach(function (m) {
        const td = el('td', { class: 'mx-rep', 'aria-hidden': 'true', dataset: { mod: m.id } }, pad2(m.num));
        mxCols[m.id].push(td);
        gr.appendChild(td);
      });
      tb.appendChild(gr);
      mxGroups[d.id] = gr;
      cs.forEach(function (c) {
        const name = el('a', { href: '#c-' + c.id, class: 'mx-name' }, c.name);
        const tr = el('tr', { dataset: { course: c.id } }, el('th', { scope: 'row' }, name));
        const cells = [];
        MODS.forEach(function (m, j) {
          const r = LINKS[c.id].find(function (x) { return x.module === m.id; });
          const td = el('td', { dataset: { mod: m.id } });
          mxCols[m.id].push(td);
          if (r) {
            const label = c.name + ', ' + modName(m) + ': ' + strengthLabel(r.strength).toLowerCase() + ' link' +
              (r.tag !== 'direct' ? ' (' + r.tag + ')' : '') + '. ' + r.concept;
            const b = el('button', {
              type: 'button', class: 'mx-cell', tabindex: '-1', dataset: { r: String(rowNo), c: String(j) }, 'aria-label': label
            }, el('span', { class: 'cell-dot ' + r.strength, 'aria-hidden': 'true' }), tagMini(r.tag));
            const pop = ui.popover(b, function () { return cellPopover(c, m, r); }, { label: c.name + ' and ' + modShort(m) });
            b.addEventListener('click', function () { activePop = pop.isOpen() ? pop : null; });
            td.appendChild(b);
            cells.push({ td: td, r: r, b: b, label: label });
          }
          tr.appendChild(td);
        });
        tb.appendChild(tr);
        mxRows[c.id] = { tr: tr, name: name, cells: cells, d: d.id };
        rowNo += 1;
      });
      matrix.appendChild(tb);
    });
    const totalRow = el('tr', { class: 'mx-total' }, el('th', { scope: 'row', class: 'sticky-col' }, 'Subjects shown'));
    MODS.forEach(function (m) {
      const td = el('td', { class: 'num', dataset: { mod: m.id } }, '0');
      mxTotals[m.id] = td;
      mxCols[m.id].push(td);
      totalRow.appendChild(td);
    });
    matrix.appendChild(el('tfoot', null, totalRow));
    const firstCell = matrix.querySelector('button.mx-cell');
    if (firstCell) firstCell.setAttribute('tabindex', '0');
    matrixPanel.appendChild(el('div', { class: 'scroll-x atlas-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Subjects by project part' }, matrix));
    gridNav(matrix, 'button.mx-cell');

    function cellPopover(c, m, r) {
      const st = r.section ? sectionTitle(m, r.section) : null;
      return el('div', { class: 'atlas-pop' },
        el('p', { class: 'atlas-pop-title' }, el('strong', null, c.name), ' → ', modName(m)),
        el('p', { class: 'atlas-pop-meta' }, ui.pill(r.strength), r.tag !== 'direct' ? ui.tag(r.tag) : null, ui.evidence(c.evidence)),
        el('p', null, r.concept),
        el('ul', { class: 'atlas-pop-links' },
          st ? el('li', null, el('a', { href: m.slug + '#' + r.section }, 'Where it is used: ' + st)) : null,
          el('li', null, el('a', { href: m.slug + '#provenance' }, 'Every subject behind ' + modShort(m))),
          el('li', null, el('a', { href: '#c-' + c.id }, 'Open the ' + c.name + ' card'))));
    }

    /* ---------------------------------------------------------------- disciplines view */
    const discPanel = el('div', { class: 'atlas-disc-view' });
    discPanel.appendChild(el('p', { class: 'atlas-panel-intro' },
      'Each cell counts the subjects of one discipline that link to one project part, under the current evidence, strength and search filters; a deeper shade means more. ' +
      'Selected disciplines and the selected part are outlined. Select a cell to list those subjects as cards.'));
    const heat = el('table', { class: 'atlas-heat' });
    heat.appendChild(el('caption', { class: 'visually-hidden' }, 'Number of subjects per discipline (rows) linking to each project part (columns).'));
    const heatHead = el('tr', null, el('th', { scope: 'col', class: 'sticky-col' }, 'Discipline'));
    const heatCols = {};
    MODS.forEach(function (m) {
      const th = el('th', { scope: 'col', class: 'mx-col', dataset: { mod: m.id } },
        el('a', { href: m.slug + '#provenance', title: modName(m) }, el('span', { class: 'mx-num' }, pad2(m.num)), ' ' + m.short));
      heatCols[m.id] = [th];
      heatHead.appendChild(th);
    });
    heatHead.appendChild(el('th', { scope: 'col', class: 'heat-total-head' }, 'Subjects'));
    heat.appendChild(el('thead', null, heatHead));
    const heatBody = el('tbody');
    const heatCells = {};
    const heatRowTotals = {};
    const heatRows = {};
    DISCS.forEach(function (d, i) {
      const tr = el('tr', { style: { '--dot': 'var(' + d.color + ')' } },
        el('th', { scope: 'row', class: 'sticky-col' }, el('span', { class: 'dot', 'aria-hidden': 'true' }), ' ' + d.name));
      heatCells[d.id] = {};
      MODS.forEach(function (m, j) {
        const num = el('span', { class: 'heat-num' }, '0');
        const b = el('button', { type: 'button', class: 'heat-cell', tabindex: '-1', dataset: { r: String(i), c: String(j) } }, num);
        b.addEventListener('click', function () { showSubset(d, m); });
        const td = el('td', { dataset: { mod: m.id } }, b);
        heatCols[m.id].push(td);
        heatCells[d.id][m.id] = { b: b, num: num, td: td };
        tr.appendChild(td);
      });
      const tot = el('td', { class: 'num heat-total' }, '0');
      heatRowTotals[d.id] = tot;
      tr.appendChild(tot);
      heatRows[d.id] = tr;
      heatBody.appendChild(tr);
    });
    heat.appendChild(heatBody);
    const heatFoot = el('tr', { class: 'heat-foot' }, el('th', { scope: 'row', class: 'sticky-col' }, 'All disciplines'));
    const heatColTotals = {};
    MODS.forEach(function (m) {
      const td = el('td', { class: 'num', dataset: { mod: m.id } }, '0');
      heatColTotals[m.id] = td;
      heatCols[m.id].push(td);
      heatFoot.appendChild(td);
    });
    const heatGrand = el('td', { class: 'num heat-total' }, '0');
    heatFoot.appendChild(heatGrand);
    heat.appendChild(el('tfoot', null, heatFoot));
    discPanel.appendChild(el('div', { class: 'scroll-x atlas-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Disciplines by project part' }, heat));
    gridNav(heat, 'button.heat-cell:not(:disabled)');

    discPanel.appendChild(el('h3', { class: 'atlas-disc-head' }, 'What each discipline brings'));
    discPanel.appendChild(el('p', { class: 'muted atlas-disc-note' },
      'These summaries always count every subject, whatever the filters, and paraphrase its link concepts. Where a sentence draws on subjects known only from their outlines, ' +
      'it describes the typical content of those subjects; a discipline whose subjects all rest on outlines carries the Typical content tag, and the evidence line gives the mix. ' +
      '“Strongest on” ranks parts by the weighted score \\(S_{d,m}\\) explained above, highest first, so its order can differ from the subject counts in the table: one strong link weighs as much as three weak ones.'));
    const discList = el('div', { class: 'grid-2 atlas-disc-list' });
    DISCS.forEach(function (d) {
      const cs = COURSES.filter(function (c) { return c.discipline === d.id; });
      if (!cs.length) return;
      const rows = D.mappings.filter(function (r) { const c = D.course(r.course); return c && c.discipline === d.id; });
      const ev = { notes: 0, partial: 0, outline: 0 };
      cs.forEach(function (c) { ev[c.evidence] += 1; });
      const st = { strong: 0, moderate: 0, weak: 0 };
      rows.forEach(function (r) { st[r.strength] += 1; });
      const ranked = cs.map(function (c) { return { c: c, n: LINKS[c.id].length }; })
        .sort(function (a, b) { return b.n - a.n || a.c.name.localeCompare(b.c.name); });
      const most = ranked.filter(function (x) { return x.n === ranked[0].n; }).slice(0, 3);
      const top = strongestOn(d.id).map(function (t) {
        return [el('a', { href: t.m.slug + '#provenance', title: modName(t.m) }, modShort(t.m)), ' ', el('span', { class: 'atlas-score' }, '(\\(S = ' + t.score + '\\))')];
      });
      const evParts = [];
      if (ev.notes) evParts.push(ev.notes + ' with notes');
      if (ev.partial) evParts.push(ev.partial + ' with partial notes');
      if (ev.outline) evParts.push(ev.outline + ' known only from outlines (typical content)');
      const evText = evParts.length === 1 && cs.length > 1 ? 'all ' + evParts[0] : evParts.join(', ');
      // A discipline whose subjects are all known only from outlines: its sentence is typical content.
      const allOutline = cs.every(function (c) { return c.evidence === 'outline'; });
      const bringTags = [];
      if (allOutline) bringTags.push(' ', ui.tag('typical'));
      if (/\bextension\b/.test(BRINGS[d.id] || '')) bringTags.push(' ', ui.tag('extension'));
      const listBtn = ui.button({ label: 'List its ' + plural(cs.length, 'subject'), kind: 'secondary', small: true, icon: 'arrow-right',
        onClick: function () { showSubset(d, null); } });
      discList.appendChild(el('article', { class: 'card atlas-disc-card', style: { '--dot': 'var(' + d.color + ')' } },
        el('h4', null, el('span', { class: 'dot', 'aria-hidden': 'true' }), ' ' + d.name),
        el('p', { class: 'atlas-disc-summary' }, d.name + ': ' + plural(cs.length, 'subject') + '; strongest on ', listJoin(top), '.'),
        el('p', null, BRINGS[d.id] || '', bringTags),
        el('p', { class: 'atlas-disc-meta muted' },
          'Evidence: ' + evText + '. ' + plural(rows.length, 'link') + ' (' + st.strong + ' strong, ' + st.moderate + ' moderate, ' + st.weak + ' weak). ' +
          'Most connected: ', listJoin(most.map(function (x) { return el('a', { href: '#c-' + x.c.id }, x.c.name); })),
          ' (' + plural(most[0].n, 'part') + (most.length > 1 ? ' each' : '') + ').'),
        el('div', { class: 'btn-row' }, listBtn)));
    });
    discPanel.appendChild(discList);

    /*
     * List a discipline's subjects as cards. From a heat cell (m given) the evidence, strength and
     * search filters stay, because the cell's count already applies them. From a discipline's
     * "List its N subjects" button (m null) they are cleared, so the list holds all N.
     */
    function showSubset(d, m) {
      runSearch.cancel();
      routing = true;
      state.d = [d.id];
      state.m = m ? m.id : 'all';
      if (!m) { state.ev = 'all'; state.s = 'any'; state.q = ''; }
      state.v = 'cards';
      syncControls();
      tabs.select('cards');
      apply();
      routing = false;
      // The view and the filters both change, so push: Back returns to the Disciplines view.
      setHash('#' + serialise(state), true);
      const n = COURSES.filter(courseVisible).length;
      ui.announce('Showing ' + plural(n, d.name + ' subject') + (m ? ' that feed ' + modName(m) : ''));
      const panel = tabs.panel('cards');
      panel.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      panel.focus({ preventScroll: true });
    }

    /* ---------------------------------------------------------------- tabs */
    const viewsHost = document.getElementById('atlas-views');
    const tabs = ui.tabs(viewsHost, [
      { id: 'cards', label: 'Cards', content: cardsPanel },
      { id: 'matrix', label: 'Matrix', content: matrixPanel },
      { id: 'disciplines', label: 'Disciplines', content: discPanel }
    ], { selected: 'cards', label: 'Atlas views' });
    tabs.on('change', function (id) {
      if (activePop) { activePop.close(false); activePop = null; }
      state.v = id;
      writeHash();
    });

    /* ---------------------------------------------------------------- keyboard grid */
    function gridNav(table, selector) {
      function visibleButtons() {
        return ui.qsa(selector, table).filter(function (b) { const tr = b.closest('tr'); return tr && !tr.hidden; });
      }
      function rove(target) {
        ui.qsa(selector.replace(':not(:disabled)', ''), table).forEach(function (b) { b.setAttribute('tabindex', b === target ? '0' : '-1'); });
      }
      table.addEventListener('focusin', function (e) {
        const b = e.target.closest && e.target.closest(selector);
        if (b && table.contains(b)) rove(b);
      });
      table.addEventListener('keydown', function (e) {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (keys.indexOf(e.key) < 0 || e.altKey || e.metaKey) return;
        const cur = e.target.closest && e.target.closest(selector);
        if (!cur || !table.contains(cur)) return;
        const all = visibleButtons().map(function (b) { return { b: b, r: Number(b.dataset.r), c: Number(b.dataset.c) }; });
        const me = { r: Number(cur.dataset.r), c: Number(cur.dataset.c) };
        let pick = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          all.filter(function (x) { return x.r === me.r && (x.c - me.c) * dir > 0; }).forEach(function (x) {
            if (!pick || Math.abs(x.c - me.c) < Math.abs(pick.c - me.c)) pick = x;
          });
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          let rowTarget = null;
          all.forEach(function (x) {
            if ((x.r - me.r) * dir > 0 && (rowTarget === null || Math.abs(x.r - me.r) < Math.abs(rowTarget - me.r))) rowTarget = x.r;
          });
          if (rowTarget !== null) {
            all.filter(function (x) { return x.r === rowTarget; }).forEach(function (x) {
              if (!pick || Math.abs(x.c - me.c) < Math.abs(pick.c - me.c)) pick = x;
            });
          }
        } else {
          const row = all.filter(function (x) { return e.ctrlKey || x.r === me.r; });
          pick = e.key === 'Home' ? row[0] : row[row.length - 1];
        }
        e.preventDefault();
        if (pick && pick.b !== cur) { rove(pick.b); pick.b.focus(); }
      });
    }
    const mxNav = { reset: function () { resetRoving(matrix, 'button.mx-cell'); } };
    const heatNav = { reset: function () { resetRoving(heat, 'button.heat-cell'); } };
    function resetRoving(table, sel) {
      const all = ui.qsa(sel, table);
      const vis = all.filter(function (b) { const tr = b.closest('tr'); return tr && !tr.hidden && !b.disabled; });
      if (vis.some(function (b) { return b.getAttribute('tabindex') === '0'; })) return;
      all.forEach(function (b) { b.setAttribute('tabindex', '-1'); });
      if (vis.length) vis[0].setAttribute('tabindex', '0');
    }

    /* ---------------------------------------------------------------- apply */
    const statusEl = document.getElementById('atlas-status');
    const emptyEl = document.getElementById('atlas-empty');
    let lastQuery = null;

    function apply() {
      terms = state.q ? state.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8) : [];
      const queryChanged = state.q !== lastQuery;
      lastQuery = state.q;
      const re = searchRegex();
      const vis = {};
      let nVis = 0, nLinks = 0;
      COURSES.forEach(function (c) {
        vis[c.id] = courseVisible(c);
        if (vis[c.id]) { nVis += 1; nLinks += LINKS[c.id].filter(linkOk).length; }
      });
      const placeFilter = state.m !== 'all' || state.s !== 'any';

      /* cards */
      const perGroup = {};
      COURSES.forEach(function (c) {
        const k = cards[c.id];
        k.el.hidden = !vis[c.id];
        if (vis[c.id]) perGroup[c.discipline] = (perGroup[c.discipline] || 0) + 1;
        k.chips.forEach(function (x) {
          const off = placeFilter && !linkOk(x.r);
          if (x.li.classList.contains('is-dim') === off) return;
          x.li.classList.toggle('is-dim', off);
          x.hidden.textContent = x.desc + (off ? '. Outside the current filter.' : '');
        });
        k.rows.forEach(function (x) {
          const off = placeFilter && !linkOk(x.r);
          x.li.classList.toggle('is-dim', off);
          x.off.textContent = off ? 'outside the current filter' : '';
        });
        if (queryChanged) {
          k.hl.forEach(function (p) { highlight(p[0], p[1], re); });
          let deepHit = false;
          k.deep.forEach(function (p) { if (highlight(p[0], p[1], re)) deepHit = true; });
          k.deepHit = deepHit;
          k.userClosed = false;
          // A card the search opened closes again once the search no longer matches inside it.
          if (!deepHit && autoOpened.has(c.id)) { k.details.open = false; autoOpened.delete(c.id); }
        }
        // Open a matching card whenever it becomes visible, also after a filter change, unless the
        // reader closed it during this search.
        if (re && k.deepHit && vis[c.id] && !k.details.open && !k.userClosed) { k.details.open = true; autoOpened.add(c.id); }
      });
      DISCS.forEach(function (d) {
        const g = groups[d.id];
        if (!g) return;
        const n = perGroup[d.id] || 0;
        g.el.hidden = n === 0;
        g.count.textContent = n === g.total ? plural(g.total, 'subject') : n + ' of ' + plural(g.total, 'subject');
      });

      /* matrix */
      const colTotals = {};
      MODS.forEach(function (m) { colTotals[m.id] = 0; });
      const groupVis = {};
      COURSES.forEach(function (c) {
        const row = mxRows[c.id];
        row.tr.hidden = !vis[c.id];
        if (queryChanged) highlight(row.name, c.name, re);
        if (!vis[c.id]) return;
        groupVis[row.d] = true;
        row.cells.forEach(function (x) {
          const ok = linkOk(x.r);
          if (x.td.classList.contains('is-dim') === ok) {
            x.td.classList.toggle('is-dim', !ok);
            x.b.setAttribute('aria-label', x.label + (ok ? '' : ' Outside the current filter.'));
          }
          if (ok) colTotals[x.r.module] += 1;
        });
      });
      DISCS.forEach(function (d) { if (mxGroups[d.id]) mxGroups[d.id].hidden = !groupVis[d.id]; });
      MODS.forEach(function (m) {
        mxTotals[m.id].textContent = String(colTotals[m.id]);
        mxCols[m.id].forEach(function (cell) { cell.classList.toggle('is-col', state.m === m.id); });
        heatCols[m.id].forEach(function (cell) { cell.classList.toggle('is-col', state.m === m.id); });
      });
      mxNav.reset();

      /* disciplines heat table */
      const counts = {};
      let max = 0;
      DISCS.forEach(function (d) {
        counts[d.id] = {};
        MODS.forEach(function (m) { counts[d.id][m.id] = 0; });
      });
      const rowTotal = {};
      const weighted = {};   // S_{d,m} over the same links as the counts
      DISCS.forEach(function (d) { weighted[d.id] = {}; MODS.forEach(function (m) { weighted[d.id][m.id] = 0; }); });
      COURSES.forEach(function (c) {
        if (!passesEvidenceAndSearch(c)) return;
        const ok = LINKS[c.id].filter(function (r) { return RANK[r.strength] >= MIN_RANK[state.s]; });
        if (!ok.length) return;
        rowTotal[c.discipline] = (rowTotal[c.discipline] || 0) + 1;
        ok.forEach(function (r) { counts[c.discipline][r.module] += 1; weighted[c.discipline][r.module] += WEIGHT[r.strength]; });
      });
      DISCS.forEach(function (d) { MODS.forEach(function (m) { max = Math.max(max, counts[d.id][m.id]); }); });
      const colSum = {};
      let grand = 0;
      MODS.forEach(function (m) { colSum[m.id] = 0; });
      DISCS.forEach(function (d) {
        const sel = state.d.indexOf(d.id) >= 0;
        heatRows[d.id].classList.toggle('is-sel', sel);
        MODS.forEach(function (m) {
          const n = counts[d.id][m.id];
          const cell = heatCells[d.id][m.id];
          colSum[m.id] += n;
          cell.num.textContent = n ? String(n) : '–';
          cell.b.disabled = n === 0;
          cell.b.style.setProperty('--heat', max ? (n / max).toFixed(3) : '0');
          const desc = d.name + ' and ' + modName(m) + ': ' + plural(n, 'subject') + (n ? ' (weighted score ' + weighted[d.id][m.id] + ')' : '');
          cell.b.setAttribute('aria-label', desc + (n ? '. Show them.' : '.'));
          cell.b.title = desc;
        });
        heatRowTotals[d.id].textContent = String(rowTotal[d.id] || 0);
        grand += rowTotal[d.id] || 0;
      });
      MODS.forEach(function (m) { heatColTotals[m.id].textContent = String(colSum[m.id]); });
      heatGrand.textContent = String(grand);
      heatNav.reset();

      /* status, empty state, filter summary */
      const active = filtersActive();
      statusEl.textContent = !active
        ? 'Showing all ' + COURSES.length + ' subjects and ' + TOTAL_LINKS + ' links.'
        : 'Showing ' + nVis + ' of ' + COURSES.length + ' subjects and ' + nLinks + ' of ' + TOTAL_LINKS + ' links.';
      emptyEl.hidden = nVis > 0;
      const nf = activeCount();
      filtersSummary.textContent = nf ? 'Filters (' + nf + ' active)' : 'Filters';
      writeHash();
    }

    /* ---------------------------------------------------------------- deep links */
    function flash(node) {
      node.classList.remove('is-flash');
      // restart the animation on repeated deep links to the same card
      void node.offsetWidth;
      node.classList.add('is-flash');
      setTimeout(function () { node.classList.remove('is-flash'); }, FLASH_MS);
    }
    function openCard(id) {
      const c = D.course(id);
      const k = c && cards[c.id];
      if (!k) return false;
      if (activePop) { activePop.close(false); activePop = null; }
      routing = true;
      if (!courseVisible(c)) { state = copyState(DEFAULTS); syncControls(); }
      state.v = 'cards';
      tabs.select('cards');
      apply();
      routing = false;
      k.details.open = true;
      k.userClosed = false;
      k.el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      k.el.focus({ preventScroll: true });
      flash(k.el);
      lastDeep = { id: c.id, t: Date.now() };
      ui.announce('Showing the ' + c.name + ' card');
      return true;
    }
    function route(hash) {
      lastHash = hash;
      const p = parseHash(hash);
      if (p.deep) { openCard(p.deep); return; }
      if (p.anchor) return;
      routing = true;
      state = p.state;
      syncControls();
      tabs.select(state.v);
      apply();
      routing = false;
    }
    function onNav() { if (location.hash !== lastHash) route(location.hash); }
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);

    // In-page links to a card (matrix row names, popovers, discipline summaries).
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href^="#c-"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(3);
      if (!D.course(id)) return;
      e.preventDefault();
      setHash('#c-' + id, true);
      openCard(id);
    });

    return {
      start: function () {
        routing = true;
        apply();
        routing = false;
        route(location.hash);
        // Web fonts can shift the layout after the first scroll; re-align a fresh deep link once.
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () {
            ui.markScrollable(document.body);
            if (lastDeep && Date.now() - lastDeep.t < 2000) cards[lastDeep.id].el.scrollIntoView({ block: 'start' });
          });
        }
      }
    };
  }
})();
