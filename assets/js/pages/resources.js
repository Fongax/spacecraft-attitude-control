/**
 * resources.js: the further-reading page (resources.html).
 *
 * Every item of ADCS.resources as a card (ADCS.ui.renderReading), with a search (title, authors,
 * concepts and the reason to read; case- and accent-insensitive; 150 ms debounce; several words
 * must all match) and filters by module, kind of work, level and access, three sort orders, a
 * live result count, an empty state and "Copy all visible as BibTeX". The state lives in
 * location.hash, for example #m=m05&type=paper,book&level=intro&access=free&q=kalman&sort=year,
 * and is restored on load and on hashchange / back and forward. Parts of a hash the page does not
 * understand are dropped from the address, and a link that carries filters opens at the results.
 */
(function () { 'use strict';
  const ui = ADCS.ui;
  const el = ui.el;

  const SORTS = [
    { value: 'module', label: 'Module order' },
    { value: 'year', label: 'Newest first' },
    { value: 'title', label: 'Title (A to Z)' }
  ];
  const DEFAULTS = { m: 'all', type: [], level: 'all', access: 'all', q: '', sort: 'module' };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function copyState(s) { return { m: s.m, type: s.type.slice(), level: s.level, access: s.access, q: s.q, sort: s.sort }; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  ui.ready(function () {
    ui.mountChrome({ page: 'resources' });
    const D = ADCS.data;
    const R = ADCS.reading;
    if (!R || !R.items().length || typeof ui.renderReading !== 'function') {
      throw new Error('the bibliography (ADCS.resources) or its renderer (adcs-reading.js) did not load');
    }
    if (!D || !Array.isArray(D.modules)) throw new Error('the module data (ADCS.data) did not load');
    buildPage(D, R).start();
  });

  function buildPage(D, R) {
    const ITEMS = R.items();
    const MODS = D.modules;
    const ORDER = new Map(ITEMS.map(function (it, i) { return [it.id, i]; }));
    const TEXT = new Map(ITEMS.map(function (it) { return [it.id, R.searchText(it)]; }));
    let state = copyState(DEFAULTS);
    let routing = false;           // true while applying a URL: suppresses writing the hash back
    let lastHash = location.hash;
    let visible = [];

    /* ---------------------------------------------------------------- header facts */
    (function facts() {
      const typesUsed = R.TYPES.filter(function (t) { return ITEMS.some(function (it) { return it.type === t.id; }); });
      const free = ITEMS.filter(function (it) { return it.access === 'free'; }).length;
      const stats = document.getElementById('res-stats');
      stats.textContent = '';
      [[ITEMS.length, 'resources'], [MODS.length, 'modules'], [typesUsed.length, 'kinds of work'], [free, 'open without an account']]
        .forEach(function (s, i) {
          if (i) stats.appendChild(el('span', { class: 'res-sep', 'aria-hidden': 'true' }, '·'));
          stats.appendChild(el('span', { class: 'res-stat' }, el('strong', null, String(s[0])), ' ' + s[1]));
        });
      const checked = document.getElementById('res-checked');
      if (checked && R.checkedLabel()) checked.textContent = ' The whole list was last checked in ' + R.checkedLabel() + '.';
    })();

    /* ---------------------------------------------------------------- cards (built once) */
    const listHost = document.getElementById('res-list');
    ui.renderReading(listHost, { items: ITEMS, headingLevel: 3, showModules: true });
    const listEl = listHost.querySelector('.rd-list');
    const cardOf = {};
    ui.qsa('.rd-item', listEl).forEach(function (li) { cardOf[li.dataset.id] = li; });

    /* ---------------------------------------------------------------- filtering and sorting */
    function terms() { return R.fold(state.q).split(/\s+/).filter(Boolean); }
    function matches(it, words) {
      if (state.m !== 'all' && it.modules.indexOf(state.m) < 0) return false;
      if (state.type.length && state.type.indexOf(it.type) < 0) return false;
      if (state.level !== 'all' && it.level !== state.level) return false;
      if (state.access !== 'all' && it.access !== state.access) return false;
      const text = TEXT.get(it.id);
      for (let i = 0; i < words.length; i++) if (text.indexOf(words[i]) < 0) return false;
      return true;
    }
    function compareTitle(a, b) { return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }); }
    function moduleKey(it) {
      // With a module chosen every item shares it: order by level instead.
      return state.m !== 'all' ? 0 : R.firstModuleNum(it);
    }
    function sortItems(list) {
      const out = list.slice();
      if (state.sort === 'title') out.sort(function (a, b) { return compareTitle(a, b) || ORDER.get(a.id) - ORDER.get(b.id); });
      else if (state.sort === 'year') {
        out.sort(function (a, b) {
          const ya = R.yearNum(a), yb = R.yearNum(b);
          if (ya === null && yb === null) return compareTitle(a, b);
          if (ya === null) return 1;             // undated works last
          if (yb === null) return -1;
          return yb - ya || compareTitle(a, b);
        });
      } else {
        out.sort(function (a, b) {
          return moduleKey(a) - moduleKey(b) || R.levelRank(a) - R.levelRank(b) || ORDER.get(a.id) - ORDER.get(b.id);
        });
      }
      return out;
    }

    /* ---------------------------------------------------------------- hash */
    function parseHash(raw) {
      const h = String(raw || '').replace(/^#/, '');
      if (!h) return copyState(DEFAULTS);
      if (h.indexOf('=') < 0) return null;            // a plain anchor such as #browse
      const st = copyState(DEFAULTS);
      h.split('&').forEach(function (pair) {
        const i = pair.indexOf('=');
        if (i < 0) return;
        const k = pair.slice(0, i);
        let v;
        try { v = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { return; }
        if (k === 'm' && D.module(v)) st.m = v;
        else if (k === 'type') {
          v.split(',').forEach(function (t) { if (R.type(t) && st.type.indexOf(t) < 0) st.type.push(t); });
        } else if (k === 'level' && R.level(v)) st.level = v;
        else if (k === 'access' && R.access(v)) st.access = v;
        else if (k === 'q') st.q = v.trim().slice(0, 80);
        else if (k === 'sort' && SORTS.some(function (s) { return s.value === v; })) st.sort = v;
      });
      st.type = R.TYPES.map(function (t) { return t.id; }).filter(function (t) { return st.type.indexOf(t) >= 0; });
      return st;
    }
    function serialise(st) {
      const parts = [];
      if (st.m !== 'all') parts.push('m=' + st.m);
      if (st.type.length) parts.push('type=' + st.type.join(','));
      if (st.level !== 'all') parts.push('level=' + st.level);
      if (st.access !== 'all') parts.push('access=' + st.access);
      if (st.q) parts.push('q=' + encodeURIComponent(st.q));
      if (st.sort !== 'module') parts.push('sort=' + st.sort);
      return parts.join('&');
    }
    function setHash(want) {
      if (location.hash === want || (!want && !location.hash)) { lastHash = location.hash; return; }
      try {
        history.replaceState(history.state, '', want || (location.pathname + location.search));
      } catch (e) {
        // History API refused (some file:// set-ups): fall back to a plain fragment change.
        location.replace(want || '#sort=module');
      }
      lastHash = location.hash;
    }
    function writeHash() {
      if (routing) return;
      const h = serialise(state);
      setHash(h ? '#' + h : '');
    }

    /* ---------------------------------------------------------------- controls */
    const controls = document.getElementById('res-controls');
    const searchInput = el('input', {
      type: 'search', id: 'res-q', autocomplete: 'off', spellcheck: 'false', maxlength: '80',
      placeholder: 'Kalman, quaternion, safe mode…', 'aria-describedby': 'res-q-help'
    });
    const searchField = el('div', { class: 'field res-search' },
      el('label', { class: 'field-label', for: 'res-q' }, 'Search the list'),
      searchInput,
      el('p', { class: 'field-help', id: 'res-q-help' }, 'Matches titles, authors, concepts and the reasons to read. Several words must all match.'));

    const count = function (pred) { return ITEMS.filter(pred).length; };
    const modCtl = ui.select({
      id: 'res-m', label: 'Module',
      options: [{ value: 'all', label: 'All ' + MODS.length + ' modules' }].concat(MODS.map(function (m) {
        return { value: m.id, label: pad2(m.num) + ' ' + m.title + ' (' + count(function (it) { return it.modules.indexOf(m.id) >= 0; }) + ')' };
      })),
      value: 'all'
    });
    const typeBoxes = {};
    const typeList = el('div', { class: 'res-types' });
    R.TYPES.forEach(function (t) {
      const n = count(function (it) { return it.type === t.id; });
      if (!n) return;
      const box = el('input', { type: 'checkbox', value: t.id, id: 'res-type-' + t.id });
      box.addEventListener('change', function () {
        state.type = R.TYPES.map(function (x) { return x.id; }).filter(function (id) { return typeBoxes[id] && typeBoxes[id].checked; });
        apply();
      });
      typeBoxes[t.id] = box;
      typeList.appendChild(el('label', { class: 'res-check', for: 'res-type-' + t.id }, box, ui.icon(t.icon),
        el('span', null, t.label), el('span', { class: 'count' }, '(' + n + ')')));
    });
    const typeField = el('fieldset', { class: 'seg res-type-field' },
      el('legend', null, 'Kind of work ', el('span', { class: 'field-help-inline' }, '(none ticked shows all)')), typeList);
    const levelCtl = ui.segmented({
      id: 'res-level', label: 'Level',
      options: [{ value: 'all', label: 'All' }].concat(R.LEVELS.map(function (l) { return { value: l.id, label: l.label }; })),
      value: 'all'
    });
    const accessCtl = ui.segmented({
      id: 'res-access', label: 'Access',
      options: [{ value: 'all', label: 'All' }].concat(R.ACCESS.map(function (a) { return { value: a.id, label: a.label }; })),
      value: 'all'
    });
    modCtl.on('change', function () { state.m = modCtl.value; apply(); });
    levelCtl.on('change', function () { state.level = levelCtl.value; apply(); });
    accessCtl.on('change', function () { state.access = accessCtl.value; apply(); });

    const clearBtn = ui.button({ label: 'Clear filters', kind: 'secondary', icon: 'reset', small: true, onClick: function () { clearFilters(false); } });
    // Wide screens open the filters; phones keep them closed (the summary and the status line name
    // the active ones), so a deep link does not push the results several screens down.
    function isWide() {
      try { return window.matchMedia('(min-width: 900px)').matches; } catch (e) { return false; }
    }
    const activeCount = el('span', { class: 'count' });
    const filtersBox = el('details', { class: 'disclosure res-filters', open: isWide() },
      el('summary', null, 'Filters', activeCount),
      el('div', { class: 'details-body res-filter-body' },
        el('div', { class: 'res-filter-row' }, modCtl.el, levelCtl.el, accessCtl.el),
        typeField,
        el('div', { class: 'btn-row' }, clearBtn)));
    controls.appendChild(searchField);
    controls.appendChild(filtersBox);

    const sortCtl = ui.select({ id: 'res-sort', label: 'Sort by', options: SORTS, value: 'module' });
    sortCtl.on('change', function () { state.sort = sortCtl.value; apply(); });
    const copyAll = ui.button({ label: 'Copy all visible as BibTeX', kind: 'secondary', icon: 'copy', small: true });
    const bibOut = document.getElementById('res-bib-out');
    const bibText = document.getElementById('res-bib-text');
    copyAll.addEventListener('click', function () {
      if (!visible.length) return;
      const text = R.bibtexAll(visible);
      bibOut.hidden = true;
      R.copy(copyAll, text, 'BibTeX for ' + plural(visible.length, 'resource'), function () {
        // Copying is blocked: show the entries in a box the reader can copy from.
        bibText.value = text;
        bibOut.hidden = false;
        return bibText;
      });
    });
    document.getElementById('res-tools').appendChild(sortCtl.el);
    document.getElementById('res-tools').appendChild(copyAll);

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

    function activeFilters() {
      return (state.m !== 'all') + (state.type.length > 0) + (state.level !== 'all') + (state.access !== 'all');
    }
    function syncControls() {
      searchInput.value = state.q;
      modCtl.set(state.m);
      levelCtl.set(state.level);
      accessCtl.set(state.access);
      sortCtl.set(state.sort);
      Object.keys(typeBoxes).forEach(function (id) { typeBoxes[id].checked = state.type.indexOf(id) >= 0; });
      if (activeFilters() && !filtersBox.open && isWide()) filtersBox.open = true;
    }
    function clearFilters(focusSearch) {
      runSearch.cancel();
      const sort = state.sort;
      state = copyState(DEFAULTS);
      state.sort = sort;
      syncControls();
      apply();
      if (focusSearch) searchInput.focus();
    }
    document.getElementById('res-empty-clear').addEventListener('click', function () { clearFilters(true); });

    /* ---------------------------------------------------------------- apply */
    function describe() {
      const bits = [];
      if (state.m !== 'all') { const m = D.module(state.m); bits.push('for ' + pad2(m.num) + ' ' + m.title); }
      if (state.type.length) bits.push(state.type.map(function (t) { return R.type(t).label.toLowerCase(); }).join(' or '));
      if (state.level !== 'all') bits.push(R.level(state.level).label.toLowerCase());
      if (state.access !== 'all') bits.push(R.access(state.access).label.toLowerCase());
      if (state.q) bits.push('matching “' + state.q + '”');
      return bits.length ? ': ' + bits.join(', ') : '';
    }
    function apply() {
      const words = terms();
      visible = sortItems(ITEMS.filter(function (it) { return matches(it, words); }));
      const shown = new Set();
      visible.forEach(function (it) {
        const li = cardOf[it.id];
        li.hidden = false;
        listEl.appendChild(li);           // moving keeps open "Cite" boxes and focus
        shown.add(it.id);
      });
      ITEMS.forEach(function (it) { if (!shown.has(it.id)) cardOf[it.id].hidden = true; });
      const none = !visible.length;
      document.getElementById('res-empty').hidden = !none;
      listEl.hidden = none;
      copyAll.disabled = none;
      bibOut.hidden = true;               // its entries were for the previous selection
      const n = activeFilters();
      activeCount.textContent = n ? ' (' + n + ' active)' : '';
      document.getElementById('res-status').textContent = (visible.length === ITEMS.length
        ? 'Showing all ' + ITEMS.length + ' resources'
        : 'Showing ' + visible.length + ' of ' + ITEMS.length + ' resources' + describe()) + '.';
      writeHash();
    }

    /* ---------------------------------------------------------------- routing */
    /** Apply a URL's state; returns false for a plain anchor such as #browse. */
    function route(hash) {
      lastHash = hash;
      const st = parseHash(hash);
      if (!st) return false;
      routing = true;
      state = st;
      syncControls();
      apply();
      routing = false;
      // Unknown keys or values were ignored: write the state shown back, so a shared URL matches it.
      if (serialise(state) !== String(hash).replace(/^#/, '')) writeHash();
      return true;
    }
    function onNav() { if (location.hash !== lastHash) route(location.hash); }
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);

    return {
      start: function () {
        routing = true;
        apply();
        routing = false;
        // A link that carries filters (such as a module's "All resources for this module") opens at the results.
        if (route(location.hash) && serialise(state)) document.getElementById('browse').scrollIntoView();
      }
    };
  }
})();
