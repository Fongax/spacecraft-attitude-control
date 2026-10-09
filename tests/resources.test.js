/*
 * resources.test.js: checks for the further-reading bibliography (assets/js/adcs-resources.js)
 * and its formatters (assets/js/adcs-reading.js). Load after engine.test.js, which defines
 * ADCSTests and its runner; the cases are skipped when the files are not loaded.
 *
 * Runs unchanged in Node (tests/run-node.js) and in a browser (tests/browser.html).
 */
(function (root) {
  'use strict';
  const T = root.ADCSTests;
  const A = root.ADCS;
  if (!T || !A) return;

  function test(name, fn) { T.cases.push({ group: 'Resources', name: name, fn: fn }); }
  function fail(msg) { throw new Error(msg); }
  function ok(cond, label) { if (!cond) fail(label || 'assertion failed'); }
  function eq(actual, expected, label) {
    if (actual !== expected) fail((label || 'value') + ': expected ' + expected + ', got ' + actual);
  }
  function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }
  function items() { return A.resources && Array.isArray(A.resources.items) ? A.resources.items : null; }
  const SKIP = { skip: 'adcs-resources.js not loaded' };

  const TYPES = ['paper', 'report', 'book', 'course', 'video', 'standard', 'handbook', 'tutorial', 'software', 'case-study'];
  const ACCESS = ['free', 'free-registration'];
  const LEVELS = ['intro', 'intermediate', 'advanced'];
  const EXPECTED_ITEMS = 81;
  const MIN_PER_MODULE = 4;

  test('81 items, checked month given as YYYY-MM', function () {
    const L = items();
    if (!L) return SKIP;
    eq(L.length, EXPECTED_ITEMS, 'item count');
    ok(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(A.resources.checked)), 'checked "' + A.resources.checked + '" is YYYY-MM');
    return L.length + ' items, checked ' + A.resources.checked;
  });

  test('every item has its required fields with valid values', function () {
    const L = items();
    if (!L) return SKIP;
    const errs = [];
    L.forEach(function (it, i) {
      const where = 'item ' + i + ' (' + (it && it.id) + ')';
      ['id', 'title', 'year', 'venue', 'url', 'type', 'access', 'level', 'why'].forEach(function (k) {
        if (!nonEmpty(it[k])) errs.push(where + ': missing ' + k);
      });
      if (nonEmpty(it.id) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.id)) errs.push(where + ': id is not a slug');
      if (!Array.isArray(it.authors) || !it.authors.length || !it.authors.every(nonEmpty)) errs.push(where + ': authors must be a non-empty list of names');
      if (!Array.isArray(it.modules) || !it.modules.length) errs.push(where + ': modules must be a non-empty list');
      if (!Array.isArray(it.concepts) || !it.concepts.length || !it.concepts.every(nonEmpty)) errs.push(where + ': concepts must be a non-empty list');
      if (TYPES.indexOf(it.type) < 0) errs.push(where + ': unknown type "' + it.type + '"');
      if (ACCESS.indexOf(it.access) < 0) errs.push(where + ': unknown access "' + it.access + '"');
      if (LEVELS.indexOf(it.level) < 0) errs.push(where + ': unknown level "' + it.level + '"');
    });
    if (errs.length) fail(errs.length + ' problem(s): ' + errs.slice(0, 8).join('; '));
    return L.length + ' items complete';
  });

  test('ids are unique', function () {
    const L = items();
    if (!L) return SKIP;
    const seen = new Set();
    const dups = [];
    L.forEach(function (it) { if (seen.has(it.id)) dups.push(it.id); seen.add(it.id); });
    eq(dups.length, 0, 'duplicate ids (' + dups.join(', ') + ')');
    return seen.size + ' unique ids';
  });

  test('every url is an absolute http(s) address', function () {
    const L = items();
    if (!L) return SKIP;
    const bad = L.filter(function (it) { return !/^https?:\/\/[^\s"'<>]+$/.test(String(it.url)); }).map(function (it) { return it.id; });
    eq(bad.length, 0, 'bad urls (' + bad.join(', ') + ')');
    const https = L.filter(function (it) { return /^https:\/\//.test(it.url); }).length;
    return https + ' of ' + L.length + ' use https';
  });

  test('every module listed exists in ADCS.data.modules, and every module has at least 4 items', function () {
    const L = items();
    if (!L) return SKIP;
    if (!A.data || !Array.isArray(A.data.modules)) return { skip: 'adcs-data.js not loaded' };
    const ids = A.data.modules.map(function (m) { return m.id; });
    const per = {};
    const unknown = [];
    L.forEach(function (it) {
      const seen = new Set();
      it.modules.forEach(function (m) {
        if (ids.indexOf(m) < 0) unknown.push(it.id + ' → ' + m);
        if (seen.has(m)) unknown.push(it.id + ' lists ' + m + ' twice');
        seen.add(m);
        per[m] = (per[m] || 0) + 1;
      });
    });
    eq(unknown.length, 0, 'unknown module references (' + unknown.join(', ') + ')');
    const thin = ids.filter(function (id) { return (per[id] || 0) < MIN_PER_MODULE; });
    eq(thin.length, 0, 'modules with fewer than ' + MIN_PER_MODULE + ' items (' + thin.map(function (id) { return id + ': ' + (per[id] || 0); }).join(', ') + ')');
    return ids.map(function (id) { return id + ' ' + per[id]; }).join(', ');
  });

  test('every module page lists the further-reading section anchor', function () {
    if (!A.data || !Array.isArray(A.data.modules)) return { skip: 'adcs-data.js not loaded' };
    const missing = A.data.modules.filter(function (m) {
      return !(m.sections || []).some(function (s) { return s.id === 'further-reading'; });
    }).map(function (m) { return m.id; });
    eq(missing.length, 0, 'modules without the further-reading anchor (' + missing.join(', ') + ')');
    return A.data.modules.length + ' modules';
  });

  test('APA and BibTeX: one well-formed entry per item, unique keys', function () {
    const L = items();
    if (!L) return SKIP;
    const R = A.reading;
    if (!R || typeof R.bibtex !== 'function') return { skip: 'adcs-reading.js not loaded' };
    const keys = new Set();
    L.forEach(function (it) {
      const b = R.bibtex(it);
      ok(/^@(article|book|techreport|misc|online)\{[A-Za-z0-9_:-]+,\n/.test(b), it.id + ': entry header');
      // BibTeX counts every brace, even one after a backslash, so this does too.
      let depth = 0;
      for (let i = 0; i < b.length; i++) {
        if (b[i] === '{') depth++;
        else if (b[i] === '}') { depth--; ok(depth >= 0, it.id + ': unbalanced braces'); }
      }
      eq(depth, 0, it.id + ': brace depth at the end');
      // the title sits in a second pair of braces, so styles that lower-case titles keep its capitals
      ok(/\n {2}title = \{\{.*\}\},\n/.test(b) && /\n {2}url = \{https?:\/\//.test(b) && /\n {2}(author|editor) = \{/.test(b),
        it.id + ': title, author or editor, and url fields');
      ok(!/[^\x00-\x7f]/.test(b.replace(/\n {2}url = \{[^\n]*/, '')), it.id + ': accents written as LaTeX commands');
      const key = R.bibKey(it);
      ok(!keys.has(key), it.id + ': duplicate key ' + key);
      keys.add(key);
      const apa = R.apa(it);
      ok(apa.indexOf(it.url) >= 0, it.id + ': APA ends with the url');
      ok(/\((\d{4}|n\.d\.)\)\./.test(apa), it.id + ': APA date');
    });
    return L.length + ' BibTeX entries and APA references';
  });

  test('BibTeX text: protected titles, one-pass escaping, accents, quotes and editors', function () {
    const L = items();
    if (!L) return SKIP;
    const R = A.reading;
    if (!R || typeof R.bibtex !== 'function') return { skip: 'adcs-reading.js not loaded' };
    function byId(id) { const it = L.find(function (x) { return x.id === id; }); if (!it) fail('no item ' + id); return it; }
    function has(text, part, label) { ok(text.indexOf(part) >= 0, label + ': expected "' + part + '" in ' + JSON.stringify(text)); }
    has(R.bibtex(byId('ecss-e-st-10-02c-rev1-verification')), 'title = {{ECSS-E-ST-10-02C Rev.1: Space engineering - Verification}},', 'protected title');
    const base = { id: 'x', year: '2001', venue: 'V', url: 'example.org/a_b~c', type: 'paper', authors: ['Ann Bee'] };
    function bib(extra) { return R.bibtex(Object.assign({}, base, extra)); }
    has(bib({ title: 'R&D {braces} 50% #1 a_b "quoted" \\back ~tilde ^caret $x$' }),
      'title = {{R\\&D \\textbraceleft{}braces\\textbraceright{} 50\\% \\#1 a\\_b ``quoted\'\' \\textbackslash{}back ' +
      '\\textasciitilde{}tilde \\textasciicircum{}caret \\$x\\$}},', 'specials escaped once');
    has(bib({ title: 'T' }), 'url = {example.org/a_b~c}', 'url verbatim');
    has(bib({ title: 'chapter \'PID Control\' of ICRE \'94, the authors\' notes' }),
      'title = {{chapter `PID Control\' of ICRE \'94, the authors\' notes}}', 'single quotes and apostrophes');
    has(bib({ title: 'T', authors: ['Karl Johan Åström', 'Joan Solà', 'João P. Hespanha', 'Pavao Mardešić', 'Mine Çetinkaya-Rundel', 'Ïda Wøn'] }),
      'author = {{\\AA}str{\\"o}m, Karl Johan and Sol{\\`a}, Joan and Hespanha, Jo{\\~a}o P. and Marde{\\v{s}}i{\\\'c}, Pavao and ' +
      '{\\c{C}}etinkaya-Rundel, Mine and W{\\o}n, {\\"I}da}', 'accents');
    has(bib({ title: 'T', authors: ['Ann Bee (editor)', 'Cy Dee (editor)'] }), 'editor = {Bee, Ann and Dee, Cy}', 'editors');
    const dv = R.bibtex(byId('dvorak-2009-flight-software-complexity'));
    has(dv, 'editor = {Dvorak, Daniel L.}', 'Dvorak is an editor');
    ok(dv.indexOf('author = ') < 0, 'Dvorak: no author field');
    has(R.bibtex(byId('nesc-academy-hanson-statistical-verification')), 'author = {Hanson, John}', 'presenter without affiliation');
    has(R.bibtex(byId('ariane-501-1996-inquiry-board')), 'author = {{Ariane 501 Inquiry Board}}', 'board as group author');
    return 'ok';
  });

  test('author formatting: "First et al." beyond three; APA initials and particles', function () {
    const R = A.reading;
    if (!R || typeof R.apa !== 'function') return { skip: 'adcs-reading.js not loaded' };
    const base = { id: 'x', title: 'T', year: '2001', venue: 'V', url: 'U', type: 'paper' };
    function w(authors, extra) { return Object.assign({}, base, { authors: authors }, extra || {}); }
    eq(R.authorsShort(w(['Leslie Lamport', 'Richard M. Murray', 'Gerard J. Holzmann', 'Cleve B. Moler'])), 'Leslie Lamport et al.', 'four authors');
    eq(R.authorsShort(w(['Leslie Lamport', 'Richard M. Murray', 'Gerard J. Holzmann'])), 'Leslie Lamport, Richard M. Murray and Gerard J. Holzmann', 'three authors');
    eq(R.authorsShort(w(['Steve B. Howell', 'et al.'])), 'Steve B. Howell et al.', 'explicit et al.');
    eq(R.apa(w(['Jozef C. van der Ha', 'Karl Johan Åström'])), 'van der Ha, J. C., & Åström, K. J. (2001). T. V. U', 'particles and two authors');
    eq(R.apa(w(['James L. Kirtley Jr.'], { type: 'book', year: 'continuously updated' })),
      'Kirtley, J. L., Jr. (n.d.). T. V. Retrieved ' + R.checkedLabel() + ', from U', 'suffix and undated');
    eq(R.apa(w(['NASA Office of the Chief Engineer'])), 'NASA Office of the Chief Engineer. (2001). T. V. U', 'group author');
    ok(R.bibtex(w(['NASA Office of the Chief Engineer', 'Jacques-Louis Lions'])).indexOf('author = {{NASA Office of the Chief Engineer} and Lions, Jacques-Louis}') >= 0, 'BibTeX authors');
    eq(R.apa(w(['Daniel L. Dvorak (editor)'])), 'Dvorak, D. L. (Ed.). (2001). T. V. U', 'editor');
    eq(R.apa(w(['Ann Bee (editor)', 'Cy Dee (editor)'])), 'Bee, A., & Dee, C. (Eds.). (2001). T. V. U', 'two editors');
    eq(R.apa(w(['John Hanson (NASA Marshall Space Flight Center), presenter'])), 'Hanson, J. (Presenter). (2001). T. V. U', 'presenter with affiliation');
    eq(R.apa(w(['Jacques-Louis Lions (Chairman), Ariane 501 Inquiry Board'])), 'Ariane 501 Inquiry Board. (2001). T. V. U', 'chair, then board');
    eq(R.apa(w(['Mars Climate Orbiter Mishap Investigation Board (Arthur G. Stephenson, Chairman)'])),
      'Mars Climate Orbiter Mishap Investigation Board. (2001). T. V. U', 'board, then chair');
    eq(R.apa(w(['European Cooperation for Space Standardization (ECSS)'])),
      'European Cooperation for Space Standardization (ECSS). (2001). T. V. U', 'organisation keeps its abbreviation');
    eq(R.authorsShort(w(['John Hanson (NASA Marshall Space Flight Center), presenter'])), 'John Hanson (NASA Marshall Space Flight Center), presenter', 'byline as written');
    eq(R.yearLabel(w([], { year: 'n.d. (note)' })), 'n.d.', 'undated label');
    eq(R.conceptLabel('likelihood-x-consequence'), 'likelihood × consequence', 'concept label');
    eq(R.conceptLabel('fault-tree'), 'fault tree', 'slug concept');
    eq(R.conceptLabel('error-state (multiplicative) Kalman filter'), 'error-state (multiplicative) Kalman filter', 'phrase concept');
    return 'ok';
  });
})(typeof window !== 'undefined' ? window : globalThis);
