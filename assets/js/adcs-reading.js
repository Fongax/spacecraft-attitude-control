/**
 * adcs-reading.js: ADCS.reading (formatting helpers) and ADCS.ui.renderReading (the shared
 * "Further reading" cards), used by every module page and by resources.html.
 *
 * Needs adcs-ui.js (ADCS.ui) at call time and the bibliography ADCS.resources
 * (adcs-resources.js). Like the other shared files it touches `document` only inside functions.
 *
 * A card shows the title as a plain external link, the authors ("First et al." beyond three),
 * the year and venue, type, level and access badges (icon and text), the reason to read it,
 * concept chips (on phones the first four and a "+n more" button) and a "Cite" disclosure with an APA 7 style reference and a BibTeX entry (title
 * protected from case changes, LaTeX specials and accents escaped, so it works with classic
 * BibTeX as well as biblatex), each with a Copy button (Clipboard API; if that is blocked the text is selected for Ctrl+C) that
 * confirms through the shared polite live region. All text goes in through textContent.
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  const R = ADCS.reading = ADCS.reading || {};
  // adcs-ui.js fills the rest of ADCS.ui; either file may load first, and Node tests load only this one.
  const UI = ADCS.ui = ADCS.ui || {};

  /* ================================================================ vocabularies */

  /** Publication kinds in display order: [id, label, icon, BibTeX entry type, BibTeX venue field]. */
  const TYPES = [
    ['paper', 'Paper', 'doc', 'article', 'journal'],
    ['book', 'Book', 'book', 'book', 'publisher'],
    ['handbook', 'Handbook', 'handbook', 'techreport', 'institution'],
    ['report', 'Report', 'report', 'techreport', 'institution'],
    ['standard', 'Standard', 'standard', 'techreport', 'institution'],
    ['case-study', 'Case study', 'search', 'techreport', 'institution'],
    ['course', 'Course', 'course', 'misc', 'howpublished'],
    ['video', 'Video', 'video', 'misc', 'howpublished'],
    ['tutorial', 'Tutorial', 'tutorial', 'online', 'howpublished'],
    ['software', 'Software', 'code', 'online', 'howpublished']
  ].map(function (t) { return { id: t[0], label: t[1], icon: t[2], bib: t[3], venueField: t[4] }; });
  const LEVELS = [
    { id: 'intro', label: 'Introductory', rank: 1, note: 'Start here: plain-language guides, overviews and the stories behind famous failures.' },
    { id: 'intermediate', label: 'Intermediate', rank: 2, note: 'Textbook chapters, courses and handbooks that work through the method.' },
    { id: 'advanced', label: 'Advanced', rank: 3, note: 'Research papers and specialist references for going all the way down.' }
  ];
  const ACCESS = [
    { id: 'free', label: 'Free', icon: 'check', title: 'Free to read online, no account needed.' },
    { id: 'free-registration', label: 'Free with registration', icon: 'key', title: 'Free to read after creating a free account.' }
  ];
  R.TYPES = TYPES;
  R.LEVELS = LEVELS;
  R.ACCESS = ACCESS;
  function find(list, id) { return list.find(function (x) { return x.id === id; }) || null; }
  R.type = function (id) { return find(TYPES, id); };
  R.level = function (id) { return find(LEVELS, id); };
  R.access = function (id) { return find(ACCESS, id); };

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** The month the bibliography was checked as 'Month YYYY' (from ADCS.resources.checked 'YYYY-MM'). */
  R.checkedLabel = function () {
    const c = String((ADCS.resources && ADCS.resources.checked) || '');
    const m = c.match(/^(\d{4})-(\d{2})$/);
    return m ? MONTHS[Number(m[2]) - 1] + ' ' + m[1] : c;
  };

  /** All bibliography items (an empty array when adcs-resources.js is not loaded). */
  R.items = function () { return (ADCS.resources && Array.isArray(ADCS.resources.items)) ? ADCS.resources.items : []; };

  function moduleNum(id) { const m = /^m(\d\d)$/.exec(String(id)); return m ? Number(m[1]) : 99; }
  function levelRank(it) { const l = R.level(it.level); return l ? l.rank : 9; }
  R.levelRank = levelRank;

  /**
   * Items for one module, by level (introductory first); within a level, works whose first module
   * is this one come first, then the bibliography order.
   * @param {string} moduleId e.g. 'm05' @returns {Object[]}
   */
  R.forModule = function (moduleId) {
    const all = R.items();
    return all.filter(function (it) { return (it.modules || []).indexOf(moduleId) >= 0; })
      .map(function (it) { return { it: it, i: all.indexOf(it) }; })
      .sort(function (a, b) {
        return levelRank(a.it) - levelRank(b.it) ||
          ((a.it.modules[0] === moduleId ? 0 : 1) - (b.it.modules[0] === moduleId ? 0 : 1)) || a.i - b.i;
      })
      .map(function (x) { return x.it; });
  };
  /** Earliest module (by number) an item belongs to, for "module order" sorting. */
  R.firstModuleNum = function (it) {
    return (it.modules || []).reduce(function (lo, id) { return Math.min(lo, moduleNum(id)); }, 99);
  };

  /* ================================================================ years */

  /** Publication year as a number, or null when the entry is undated or continuously updated. */
  R.yearNum = function (it) {
    const m = /^\s*(\d{4})\b/.exec(String(it.year || ''));
    return m ? Number(m[1]) : null;
  };
  /** Year for the byline: '1996', or 'updated continuously' / 'n.d.' for undated works. */
  R.yearLabel = function (it) {
    const y = R.yearNum(it);
    if (y !== null) return String(y);
    return /continuously|regularly updated|maintained/i.test(String(it.year || '')) ? 'updated continuously' : 'n.d.';
  };

  /* ================================================================ concepts */

  // Concept slugs that need more than "hyphens become spaces".
  const CONCEPT_LABELS = {
    'anti-flapping': 'anti-flapping',
    'anti-windup': 'anti-windup',
    'assumptions-scope': 'assumptions and scope',
    'bow-tie': 'bow-tie',
    'fmea': 'FMEA',
    'likelihood-x-consequence': 'likelihood × consequence',
    'risk-informed-decision-making': 'risk-informed decision making',
    'v-model': 'V-model'
  };
  /**
   * Human-readable concept: slugs ('fault-tree') become words ('fault tree'); phrases stay as written.
   * @param {string} c @returns {string}
   */
  R.conceptLabel = function (c) {
    const s = String(c || '').trim();
    if (Object.prototype.hasOwnProperty.call(CONCEPT_LABELS, s)) return CONCEPT_LABELS[s];
    return /^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) ? s.replace(/-/g, ' ') : s;
  };
  /** Concept labels of an item without repeats. */
  R.concepts = function (it) {
    const seen = new Set();
    return (it.concepts || []).map(R.conceptLabel).filter(function (c) {
      const k = c.toLowerCase();
      if (!c || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  /** Lower-case text without accents, so "sola" finds "Solà" and "astrom" finds "Åström". */
  R.fold = function (s) {
    let t = String(s || '').toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* no normalize(): keep accents */ }
    return t;
  };
  /** Searchable text of an item: title, authors, concepts (as written and readable) and why. */
  R.searchText = function (it) {
    return R.fold([it.title].concat(it.authors || [], it.concepts || [], R.concepts(it), [it.why]).join('\n'));
  };

  /* ================================================================ authors */

  const ET_AL = /^et al\.?$/i;
  const SUFFIX = /^(Jr\.?|Sr\.?|II|III|IV)$/;
  const PARTICLES = ['de', 'del', 'della', 'den', 'der', 'di', 'da', 'das', 'dos', 'du', 'la', 'le', 'ten', 'ter', 'van', 'von'];
  const ROLE = /^(.*?)\s*\((editor|ed\.|eds\.|chair|chairman|presenter)\)$/i;    // "Name (editor)"
  const ROLE_AFTER = /^(.*?),\s*(editor|ed\.|presenter)$/i;                    // "Name (affiliation), presenter"
  const CHAIR = '(?:chair|chairman|chairwoman|chairperson)';
  const CHAIR_THEN_BODY = new RegExp('^(.+?)\\s*\\(' + CHAIR + '\\),\\s*(.+)$', 'i');      // "Name (Chairman), Board"
  const BODY_THEN_CHAIR = new RegExp('^(.+?)\\s*\\(([^()]+),\\s*' + CHAIR + '\\)$', 'i');  // "Board (Name, Chairman)"
  const AFFILIATION = /^(.*?)\s*\([^()]*\)$/;
  // Words that mark an organisation rather than a person (prefixes also catch other languages).
  const ORG_WORDS = /^(Administration|Aeronautics|Association|Board|Center|Centre|College|Committee|Consortium|Cooperation|Corporation|Council|Developers|Directorate|Division|Engineering|Foundation|General|Group|Initiative|Lab|Library|Mission|National|Network|Office|Press|Program|Programme|Project|School|Society|Space|Standardization|Statistical|Systems|Team|Virtual)$/;
  const ORG_PREFIX = /^(Agen[cz]|Institut|Laborator|Universi)/;

  /**
   * The creator to cite from an `authors` entry, and its role. A parenthesised affiliation after a
   * personal name is dropped ("John Hanson (NASA Marshall Space Flight Center), presenter" gives
   * "John Hanson", role 'presenter'), and an inquiry board named with its chair is cited as the
   * board ("Jacques-Louis Lions (Chairman), Ariane 501 Inquiry Board" and "Mars Climate Orbiter
   * Mishap Investigation Board (Arthur G. Stephenson, Chairman)" give the board). The card's byline
   * keeps the entry as written.
   * @param {string} entry @returns {{name:string, role:''|'editor'|'presenter'}}
   */
  R.creator = function (entry) {
    let s = String(entry || '').trim(), role = '', m;
    if ((m = CHAIR_THEN_BODY.exec(s))) return { name: m[2].trim(), role: '' };
    if ((m = BODY_THEN_CHAIR.exec(s))) return { name: m[1].trim(), role: '' };
    if ((m = ROLE_AFTER.exec(s))) { s = m[1]; role = /^ed/i.test(m[2]) ? 'editor' : 'presenter'; }
    if ((m = ROLE.exec(s))) {
      s = m[1];
      if (/^ed/i.test(m[2])) role = 'editor';
      else if (/^presenter$/i.test(m[2])) role = 'presenter';
    }
    if ((m = AFFILIATION.exec(s)) && personName(m[1])) s = m[1];
    return { name: s.trim(), role: role };
  };

  /**
   * Split a personal name into given names, family name and suffix, after R.creator has removed
   * any role or affiliation; null for an organisation or for a name the parser cannot read safely
   * (it is then used as R.creator gives it).
   * @param {string} name
   * @returns {{given:string[], family:string, suffix:string, editor:boolean, role:string}|null}
   */
  R.parseName = function (name) {
    const c = R.creator(name);
    const p = personName(c.name);
    if (!p) return null;
    p.role = c.role;
    p.editor = c.role === 'editor';
    return p;
  };
  function personName(name) {
    const s = String(name || '').trim();
    if (!s || /[(),/&;:\d]/.test(s)) return null;
    const toks = s.split(/\s+/);
    if (toks.length < 2 || toks.length > 5) return null;
    let suffix = '';
    if (SUFFIX.test(toks[toks.length - 1])) suffix = toks.pop();
    if (toks.length < 2) return null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (ORG_WORDS.test(t) || ORG_PREFIX.test(t)) return null;
      if (/^\p{Lu}{2,}$/u.test(t.replace(/[.-]/g, ''))) return null;           // NASA, ECSS, JAXA …
      if (!/^\p{Lu}/u.test(t) && PARTICLES.indexOf(t.toLowerCase()) < 0) return null;
    }
    // family name: the last word plus any particles just before it ("van der Ha", "Van Damme", "de Weck")
    let k = toks.length - 1;
    while (k > 1 && PARTICLES.indexOf(toks[k - 1].toLowerCase()) >= 0) k--;
    return { given: toks.slice(0, k), family: toks.slice(k).join(' '), suffix: suffix };
  }
  function initial(word) {
    if (/^\p{Lu}\.$/u.test(word)) return word;
    return word.split('-').map(function (part) {
      const ch = Array.from(part)[0] || '';
      return ch ? ch.toUpperCase() + '.' : '';
    }).join('-');
  }
  /** APA name of a creator from R.creator: "Family, G. I." for a person, the name as given for a group. */
  function apaName(c) {
    const p = personName(c.name);
    if (!p) return c.name;
    return p.family + ', ' + p.given.map(initial).join(' ') + (p.suffix ? ', ' + p.suffix : '');
  }
  function realAuthors(it) { return (it.authors || []).filter(function (a) { return !ET_AL.test(String(a).trim()); }); }
  function hasEtAl(it) { return (it.authors || []).some(function (a) { return ET_AL.test(String(a).trim()); }); }

  /**
   * Byline authors: up to three names joined with "and", otherwise "First et al.".
   * @param {Object} it @returns {string}
   */
  R.authorsShort = function (it) {
    const a = realAuthors(it);
    if (!a.length) return '';
    if (a.length > 3 || hasEtAl(it)) return a[0] + ' et al.';
    if (a.length === 1) return a[0];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  };

  /* ================================================================ APA 7 */

  function endWith(s, mark) { const t = String(s || '').trim(); return /[.?!]$/.test(t) ? t : t + mark; }
  const APA_ROLE = { editor: ['Ed.', 'Eds.'], presenter: ['Presenter', 'Presenters'] };
  function apaAuthors(it) {
    const cs = realAuthors(it).map(R.creator);
    const names = cs.map(apaName);
    let s;
    if (!names.length) return '';
    // A role every creator shares goes once after the list ("(Eds.)"); otherwise after each name.
    const shared = cs.every(function (c) { return c.role === cs[0].role; }) ? cs[0].role : null;
    if (shared === null) cs.forEach(function (c, i) { if (c.role) names[i] += ' (' + APA_ROLE[c.role][0] + ')'; });
    if (hasEtAl(it)) s = names.join(', ') + ', et al.';
    else if (names.length === 1) s = names[0];
    else if (names.length <= 20) s = names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
    else s = names.slice(0, 19).join(', ') + ', … ' + names[names.length - 1];
    if (shared) s += ' (' + APA_ROLE[shared][names.length > 1 || hasEtAl(it) ? 1 : 0] + ')';
    return endWith(s, '.');
  }
  /**
   * APA 7 style reference as parts, so the page can italicise the title of a stand-alone work.
   * Undated works get "(n.d.)" and "Retrieved <checked month>, from <url>".
   * @param {Object} it @returns {{author:string, date:string, title:string, italic:boolean, source:string, url:string, text:string}}
   */
  R.apaParts = function (it) {
    const y = R.yearNum(it);
    const author = apaAuthors(it);
    const date = '(' + (y === null ? 'n.d.' : y) + ').';
    const title = endWith(it.title, '.');
    const first = realAuthors(it)[0];
    // APA leaves out the publisher when it is the same body as the author.
    const sameBody = first && String(it.venue || '').trim().toLowerCase() === R.creator(first).name.toLowerCase();
    const source = it.venue && !sameBody ? endWith(it.venue, '.') : '';
    const url = (y === null ? 'Retrieved ' + R.checkedLabel() + ', from ' : '') + it.url;
    const head = author ? author + ' ' + date + ' ' + title : title + ' ' + date;
    return {
      author: author, date: date, title: title, italic: it.type !== 'paper', source: source, url: url,
      text: [head, source, url].filter(Boolean).join(' ')
    };
  };
  /** APA 7 style reference as plain text. @param {Object} it @returns {string} */
  R.apa = function (it) { return R.apaParts(it).text; };

  /* ================================================================ BibTeX */

  // LaTeX for the characters BibTeX text cannot hold as they are. Braces become \textbraceleft{} and
  // \textbraceright{} rather than \{ and \}, because BibTeX counts every brace, even after a
  // backslash, so a lone escaped brace would end the field early.
  const BIB_CHAR = {
    '\\': '\\textbackslash{}', '{': '\\textbraceleft{}', '}': '\\textbraceright{}', '&': '\\&', '%': '\\%', '$': '\\$',
    '#': '\\#', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}',
    ' ': '~', '–': '--', '—': '---', '‘': '`', '’': '\'', '“': '``', '”': '\'\'',
    '…': '\\ldots{}', 'Å': '{\\AA}', 'å': '{\\aa}', 'Æ': '{\\AE}', 'æ': '{\\ae}',
    'Ø': '{\\O}', 'ø': '{\\o}', 'Œ': '{\\OE}', 'œ': '{\\oe}', 'ß': '{\\ss}',
    'Ł': '{\\L}', 'ł': '{\\l}', 'ı': '{\\i}'
  };
  // Combining accents (after NFD) and their LaTeX accent commands; a letter command takes braces.
  const BIB_ACCENT = {
    '̀': '`', '́': '\'', '̂': '^', '̃': '~', '̄': '=', '̇': '.', '̈': '"',
    '̆': 'u', '̊': 'r', '̋': 'H', '̌': 'v', '̣': 'd', '̧': 'c', '̨': 'k'
  };
  /** An accented Latin letter as a BibTeX special character ("ö" → {\"o}, "š" → {\v{s}}), else unchanged. */
  function bibAccent(ch) {
    let d;
    try { d = ch.normalize('NFD'); } catch (e) { return ch; }
    const base = d.charAt(0), marks = Array.from(d.slice(1));
    if (!/^[A-Za-z]$/.test(base) || !marks.length || !marks.every(function (m) { return BIB_ACCENT[m]; })) return ch;
    // i and j lose their dot under an accent above them (\i, \j)
    let inner = (base === 'i' || base === 'j') && 'dck'.indexOf(BIB_ACCENT[marks[0]]) < 0 ? '\\' + base : base;
    marks.forEach(function (m) {
      const cmd = BIB_ACCENT[m];
      inner = /[a-z]/i.test(cmd) ? '\\' + cmd + '{' + inner + '}' : '\\' + cmd + (inner.length === 1 ? inner : '{' + inner + '}');
    });
    return '{' + inner + '}';
  }
  /**
   * Text for a BibTeX field, in one pass so nothing is escaped twice: LaTeX specials escaped,
   * accented letters as accent commands (so 8-bit BibTeX sorts and prints them as well as biber),
   * straight quotes as `` '' and ` ' (an apostrophe or "'94" stays), typographic dashes and quotes
   * as their LaTeX ligatures. Other characters outside ASCII stay as UTF-8.
   */
  function bibEscape(s) {
    return String(s || '').replace(/[\\{}&%$#_^~"']|[^\x00-\x7f]/gu, function (c, at, str) {
      const opens = at === 0 || /[\s([]/.test(str.charAt(at - 1));
      if (c === '"') return opens ? '``' : '\'\'';
      if (c === '\'') return opens && /[A-Za-z]/.test(str.charAt(at + 1)) ? '`' : '\'';
      return Object.prototype.hasOwnProperty.call(BIB_CHAR, c) ? BIB_CHAR[c] : bibAccent(c);
    });
  }
  /** BibTeX name of a creator from R.creator: "Family, Suffix, Given" or a braced group name. */
  function bibName(c) {
    const p = personName(c.name);
    if (!p) return '{' + bibEscape(c.name) + '}';   // braces keep an organisation in one piece
    return bibEscape(p.family) + ', ' + (p.suffix ? bibEscape(p.suffix) + ', ' : '') + bibEscape(p.given.join(' '));
  }
  /** BibTeX citation key from the item id. */
  R.bibKey = function (it) { return String(it.id || 'item').replace(/[^A-Za-z0-9_:-]+/g, '-'); };
  /**
   * BibTeX entry: @article, @book, @techreport, @misc or @online by type, keyed by the item id,
   * with title (in a second pair of braces, so styles that lower-case titles keep acronyms and
   * proper nouns), author and editor (joined with " and "), year, the venue as journal /
   * publisher / institution / howpublished, and url.
   * @param {Object} it @returns {string}
   */
  R.bibtex = function (it) {
    const t = R.type(it.type) || TYPES[0];
    const y = R.yearNum(it);
    const cs = realAuthors(it).map(R.creator);
    const authors = cs.filter(function (c) { return c.role !== 'editor'; }).map(bibName);
    const editors = cs.filter(function (c) { return c.role === 'editor'; }).map(bibName);
    if (hasEtAl(it)) (authors.length || !editors.length ? authors : editors).push('others');
    const fields = [['title', '{' + bibEscape(it.title) + '}']];
    if (authors.length) fields.push(['author', authors.join(' and ')]);
    if (editors.length) fields.push(['editor', editors.join(' and ')]);
    if (y !== null) fields.push(['year', String(y)]);
    if (it.venue) fields.push([t.venueField, bibEscape(it.venue)]);
    fields.push(['url', String(it.url || '')]);
    if (y === null) fields.push(['note', 'Undated; accessed ' + R.checkedLabel()]);
    return '@' + t.bib + '{' + R.bibKey(it) + ',\n' +
      fields.map(function (f) { return '  ' + f[0] + ' = {' + f[1] + '}'; }).join(',\n') + '\n}';
  };
  /** Several entries separated by blank lines. @param {Object[]} items @returns {string} */
  R.bibtexAll = function (items) { return (items || []).map(R.bibtex).join('\n\n') + '\n'; };

  /* ================================================================ copy with feedback */

  /**
   * Copy text and confirm it politely. If the clipboard is blocked, select `selectNode` (when
   * given) so the reader can press Ctrl+C, and say so. Focus returns to the button.
   * @param {HTMLButtonElement} btn @param {string} text @param {string} what e.g. 'APA reference'
   * @param {Node|function():Node} [selectNode] the visible text to select, or a function that
   *   reveals and returns it (called only when copying is blocked)
   * @returns {Promise<boolean>}
   */
  R.copy = function (btn, text, what, selectNode) {
    const ui = ADCS.ui;
    return ui.copyText(text).then(function (ok) {
      if (btn && btn.isConnected) btn.focus({ preventScroll: true });
      if (ok) {
        ui.announce(what + ' copied to the clipboard.');
        flashLabel(btn, 'Copied');
      } else {
        let selected = false;
        const node = typeof selectNode === 'function' ? selectNode() : selectNode;
        if (node) {
          try {
            const sel = root.getSelection();
            sel.removeAllRanges();
            if (node.select) { node.focus(); node.select(); } else sel.selectAllChildren(node);
            selected = true;
          } catch (e) { selected = false; }
        }
        ui.announce(selected ? 'Copying is blocked here. The ' + what + ' is selected: press Ctrl+C, or Command+C on a Mac, to copy it.'
          : 'Copying is blocked here. Select the ' + what + ' and copy it by hand.');
        flashLabel(btn, selected ? 'Selected' : 'Not copied');
      }
      return ok;
    });
  };
  function flashLabel(btn, text) {
    const lab = btn && btn.querySelector('.btn-label');
    if (!lab) return;
    if (!lab.dataset.label) lab.dataset.label = lab.textContent;
    lab.textContent = text;
    clearTimeout(btn._rdTimer);
    btn._rdTimer = setTimeout(function () { lab.textContent = lab.dataset.label; }, 2000);
  }

  /* ================================================================ cards */

  function levelGlyph(rank) {
    const ui = ADCS.ui;
    const s = ui.svg('svg', { viewBox: '0 0 24 24', class: 'icon rd-bars', 'aria-hidden': 'true', focusable: 'false' });
    [[4, 15, 4, 5], [10, 10, 4, 10], [16, 5, 4, 15]].forEach(function (b, i) {
      s.appendChild(ui.svg('rect', {
        x: b[0], y: b[1] - 0.5, width: b[2], height: b[3] + 1, rx: 1,
        fill: i < rank ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 1.5
      }));
    });
    return s;
  }
  function badge(cls, icon, text, title) {
    const ui = ADCS.ui;
    return ui.el('span', { class: 'rd-badge ' + cls, title: title || null },
      typeof icon === 'string' ? ui.icon(icon) : icon, ui.el('span', null, text));
  }

  // Concept chips shown on phones before "+n more" (components.css hides the rest below 600 px;
  // wider screens show every chip and no button). One extra chip is shown rather than folded.
  const CHIPS_NARROW = 4;
  function moreChips(list, extra) {
    const ui = ADCS.ui, el = ui.el;
    list.classList.add('rd-concepts-fold');
    const label = el('span', null, '+' + extra + ' more');
    const btn = el('button', { type: 'button', class: 'rd-more', 'aria-expanded': 'false' },
      label, el('span', { class: 'visually-hidden' }, ' concepts'));
    btn.addEventListener('click', function () {
      const all = list.classList.toggle('rd-concepts-all');
      btn.setAttribute('aria-expanded', String(all));
      label.textContent = all ? 'Fewer' : '+' + extra + ' more';
    });
    return el('li', { class: 'rd-concept-more' }, btn);
  }

  function citeBlock(it, titleText) {
    const ui = ADCS.ui, el = ui.el;
    const apa = R.apaParts(it);
    const apaP = el('p', { class: 'rd-apa' });
    if (apa.author) apaP.appendChild(document.createTextNode(apa.author + ' ' + apa.date + ' '));
    apaP.appendChild(apa.italic ? el('i', null, apa.title) : document.createTextNode(apa.title));
    if (!apa.author) apaP.appendChild(document.createTextNode(' ' + apa.date));
    if (apa.source) apaP.appendChild(document.createTextNode(' ' + apa.source));
    apaP.appendChild(document.createTextNode(' ' + apa.url));
    const bib = R.bibtex(it);
    const bibPre = el('pre', { class: 'rd-bib' }, el('code', null, bib));
    // Visible "Copy"; the accessible name adds what is copied ("Copy APA reference for …").
    const copyApa = ui.button({ label: 'Copy', icon: 'copy', kind: 'secondary', small: true });
    copyApa.appendChild(el('span', { class: 'visually-hidden' }, ' APA reference for ' + titleText));
    copyApa.addEventListener('click', function () { R.copy(copyApa, apa.text, 'APA reference', apaP); });
    const copyBib = ui.button({ label: 'Copy', icon: 'copy', kind: 'secondary', small: true });
    copyBib.appendChild(el('span', { class: 'visually-hidden' }, ' BibTeX entry for ' + titleText));
    copyBib.addEventListener('click', function () { R.copy(copyBib, bib, 'BibTeX entry', bibPre); });
    const d = el('details', { class: 'disclosure rd-cite' },
      el('summary', null, 'Cite', el('span', { class: 'visually-hidden' }, ' ' + titleText)),
      el('div', { class: 'details-body' },
        el('div', { class: 'rd-cite-row' },
          el('div', { class: 'rd-cite-head' }, el('p', { class: 'rd-cite-label' }, 'APA 7'), copyApa), apaP),
        el('div', { class: 'rd-cite-row' },
          el('div', { class: 'rd-cite-head' }, el('p', { class: 'rd-cite-label' }, 'BibTeX'), copyBib), bibPre)));
    return d;
  }

  /**
   * One card (<li class="rd-item"> holding <article class="rd-card">).
   * @param {Object} it bibliography item
   * @param {{headingLevel?:number, showModules?:boolean, currentModule?:string}} [o]
   * @returns {HTMLLIElement}
   */
  R.card = function (it, o) {
    const ui = ADCS.ui, el = ui.el;
    const opt = o || {};
    const hl = Math.min(6, Math.max(2, opt.headingLevel || 3));
    const tid = ui.uid('rd');
    const t = R.type(it.type) || { label: it.type, icon: 'doc' };
    const lv = R.level(it.level) || { label: it.level, rank: 0 };
    const ac = R.access(it.access) || ACCESS[0];
    // the last word keeps the external-link icon on its line
    const words = String(it.title).split(' ');
    const last = words.pop();
    const link = el('a', { href: it.url, rel: 'noopener', class: 'rd-link' },
      words.length ? words.join(' ') + ' ' : null,
      el('span', { class: 'rd-last' }, last, el('span', { class: 'visually-hidden' }, ' (external site)'), ui.icon('external')));
    const authors = R.authorsShort(it);
    const parts = [authors ? el('span', { class: 'rd-authors' }, authors) : null,
      el('span', { class: 'rd-year' }, R.yearLabel(it)),
      it.venue ? el('span', { class: 'rd-venue' }, it.venue) : null].filter(Boolean);
    const by = el('p', { class: 'rd-byline' });
    parts.forEach(function (p, i) {
      if (i) by.appendChild(el('span', { class: 'rd-sep', 'aria-hidden': 'true' }, ' · '));
      by.appendChild(p);
    });
    const badges = el('p', { class: 'rd-badges' },
      badge('rd-type', t.icon, t.label, 'Kind of work: ' + t.label.toLowerCase()),
      badge('rd-level rd-level-' + it.level, levelGlyph(lv.rank), lv.label, 'Level: ' + lv.label.toLowerCase()),
      badge('rd-access rd-access-' + ac.id, ac.icon, ac.label, ac.title));
    const concepts = R.concepts(it);
    const chips = concepts.length ? el('ul', { class: 'rd-concepts', 'aria-label': 'Concepts' },
      concepts.map(function (c) { return el('li', { class: 'rd-concept' }, c); })) : null;
    if (concepts.length > CHIPS_NARROW + 1) chips.appendChild(moreChips(chips, concepts.length - CHIPS_NARROW));
    let mods = null;
    if (opt.showModules && ADCS.data && typeof ADCS.data.module === 'function') {
      const list = (it.modules || []).map(function (id) { return ADCS.data.module(id); }).filter(Boolean)
        .sort(function (a, b) { return a.num - b.num; });
      if (list.length) {
        mods = el('p', { class: 'rd-modules' }, el('span', { class: 'rd-modules-label' }, list.length === 1 ? 'Module: ' : 'Modules: '));
        list.forEach(function (m, i) {
          if (i) mods.appendChild(document.createTextNode(', '));
          const a = el('a', { href: ui.base() + m.slug + '#further-reading' }, (m.num < 10 ? '0' : '') + m.num + ' ' + m.short);
          if (m.id === opt.currentModule) a.setAttribute('aria-current', 'page');
          mods.appendChild(a);
        });
      }
    }
    const art = el('article', { class: 'rd-card', 'aria-labelledby': tid },
      el('h' + hl, { class: 'rd-title', id: tid }, link),
      by, badges,
      el('p', { class: 'rd-why' }, it.why),
      chips, mods,
      citeBlock(it, it.title));
    return el('li', { class: 'rd-item', dataset: { id: it.id } }, art);
  };

  /* ================================================================ the renderer */

  /**
   * Render reading cards into a container (its content is replaced).
   * @param {HTMLElement} container
   * @param {{items?:Object[], module?:string, group?:'level'|null, headingLevel?:number,
   *          showModules?:boolean, emptyText?:string}} [options]
   *   items: what to show (default: the module's items when `module` is set, else every item);
   *   group 'level': Introductory → Intermediate → Advanced, each under a heading of
   *   `headingLevel` (default 3) with card titles one level lower; otherwise one list whose card
   *   titles use `headingLevel`.
   * @returns {{el:HTMLElement, count:number, items:Object[]}}
   */
  UI.renderReading = function (container, options) {
    const ui = ADCS.ui, el = ui.el;
    const o = options || {};
    const items = Array.isArray(o.items) ? o.items : (o.module ? R.forModule(o.module) : R.items());
    const hl = o.headingLevel || 3;
    container.textContent = '';
    container.classList.add('reading');
    const cardOpts = { headingLevel: o.group === 'level' ? hl + 1 : hl, showModules: !!o.showModules, currentModule: o.module || null };
    if (!items.length) {
      container.appendChild(el('p', { class: 'rd-empty' }, o.emptyText || 'No reading is listed here yet.'));
      return { el: container, count: 0, items: items };
    }
    if (o.group === 'level') {
      LEVELS.forEach(function (lv) {
        const rows = items.filter(function (it) { return it.level === lv.id; });
        if (!rows.length) return;
        const hid = ui.uid('rd-group');
        container.appendChild(el('section', { class: 'rd-group rd-group-' + lv.id, 'aria-labelledby': hid },
          el('h' + hl, { class: 'rd-group-title', id: hid }, levelGlyph(lv.rank), el('span', null, lv.label),
            el('span', { class: 'count' }, '(' + rows.length + ')')),
          el('p', { class: 'rd-group-note' }, lv.note),
          el('ul', { class: 'rd-list', role: 'list' }, rows.map(function (it) { return R.card(it, cardOpts); }))));
      });
    } else {
      container.appendChild(el('ul', { class: 'rd-list', role: 'list' }, items.map(function (it) { return R.card(it, cardOpts); })));
    }
    return { el: container, count: items.length, items: items };
  };
})(typeof window !== 'undefined' ? window : globalThis);
