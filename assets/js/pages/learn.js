/**
 * learn.js: the learning path (learn.html).
 *
 * Builds the phase strip and a vertical lifecycle timeline of the 13 modules from ADCS.data:
 * number, title, summary, three key subjects (the strongest links, spread over disciplines),
 * reading time, widget count, prerequisites and a "Mark as read" tick. Ticks live in
 * localStorage['adcs-read'] as an array of module ids, through ADCS.ui.storage (which never
 * throws), so the module strip on every module page shows the same state.
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const D = A.data;
  const el = ui.el;
  const KEY = 'adcs-read';

  /* Short descriptions of the lifecycle phases (site text, not data about subjects). */
  const PHASE_BLURB = {
    Define: 'Decide what success means and how the parts of the system fit together.',
    Model: 'Describe the physics of the spacecraft and how a computer can simulate it.',
    Design: 'Choose the control laws and the actuators and, as an extension, the sensors.',
    Protect: 'Make the safe-mode logic exact enough to reason about and check.',
    Prove: 'Show with tests and statistics that the requirements hold, and how far.',
    Build: 'Turn the design into dependable software and displays people can trust.',
    Run: 'Plan the work, manage the risks and operate the spacecraft safely.'
  };
  const ROUTES = [
    { title: 'The control core', ids: ['m03', 'm05', 'm06', 'm08'],
      why: 'How the spacecraft moves, how the controller and the wheels push it, and how safe mode protects it.' },
    { title: 'Evidence and proof', ids: ['m01', 'm08', 'm09'],
      why: 'What the system must do, how the mode logic is checked, and what sixty passing trials can and cannot prove.' },
    { title: 'Software and people', ids: ['m02', 'm10', 'm11', 'm13'],
      why: 'How the loop becomes code and displays, and how people operate it safely.' }
  ];

  function $(id) { return document.getElementById(id); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function slugOf(phase) { return 'phase-' + String(phase).toLowerCase(); }
  function rangeOf(ids) {
    const nums = ids.map(function (id) { return D.module(id).num; });
    return nums.length > 1 ? pad2(nums[0]) + '–' + pad2(nums[nums.length - 1]) : pad2(nums[0]);
  }
  function minutesOf(ids) { return ids.reduce(function (a, id) { const m = D.module(id); return a + (m ? m.minutes || 0 : 0); }, 0); }

  /* ---------------------------------------------------------------- read state */
  const ALL = D.modules.map(function (m) { return m.id; });
  function readSet() {
    const v = ui.storage.get(KEY, null);
    const set = new Set();
    if (Array.isArray(v)) v.forEach(function (id) { set.add(String(id)); });
    else if (v && typeof v === 'object') Object.keys(v).forEach(function (id) { if (v[id]) set.add(id); });
    return new Set(ALL.filter(function (id) { return set.has(id); }));
  }
  function writeSet(set) { ui.storage.set(KEY, ALL.filter(function (id) { return set.has(id); })); }

  /* ---------------------------------------------------------------- key subjects */
  /** Three subjects with the strongest links, in data order, preferring new disciplines within each strength. */
  function keySubjects(m) {
    const rows = D.mappingsFor(m.id).map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      return D.strengthRank(b.r.strength) - D.strengthRank(a.r.strength) ||
        (a.r.tag === 'direct' ? 0 : 1) - (b.r.tag === 'direct' ? 0 : 1) || a.i - b.i;
    }).map(function (x) { return x.r; });
    const out = [], seenC = new Set(), seenD = new Set();
    ['strong', 'moderate', 'weak'].forEach(function (tier) {
      const t = rows.filter(function (r) { return r.strength === tier; });
      [true, false].forEach(function (newOnly) {
        t.forEach(function (r) {
          if (out.length >= 3 || seenC.has(r.course)) return;
          const c = D.course(r.course);
          const d = c ? c.discipline : '';
          if (newOnly && seenD.has(d)) return;
          out.push(r); seenC.add(r.course); seenD.add(d);
        });
      });
    });
    return { picks: out, total: new Set(rows.map(function (r) { return r.course; })).size };
  }

  /* ---------------------------------------------------------------- build */
  const steps = {};

  function buildPhases() {
    const ol = $('phase-strip');
    D.phases.forEach(function (ph, i) {
      const read = el('span', { class: 'phase-read' });
      const a = el('a', { href: '#' + slugOf(ph.id) },
        el('span', { class: 'phase-name' }, ph.id), ' ', el('span', { class: 'phase-range' }, rangeOf(ph.modules)), ' ', read,
        el('span', { class: 'visually-hidden' }, ' read'));
      ol.appendChild(el('li', null, a, i < D.phases.length - 1 ? el('span', { class: 'phase-arrow', 'aria-hidden': 'true' }, '→') : null));
      ph._read = read;
      ph._link = a;
    });
  }

  function buildStep(m) {
    const ks = keySubjects(m);
    const title = 'step-title-' + m.id;
    const cb = el('input', { type: 'checkbox', id: 'read-' + m.id });
    const use = el('p', { class: 'step-use' }, el('strong', null, 'You will use: '));
    ks.picks.forEach(function (r, i) {
      const c = D.course(r.course);
      if (i) use.appendChild(document.createTextNode(i === ks.picks.length - 1 && ks.total <= ks.picks.length ? ' and ' : ', '));
      use.appendChild(el('a', { href: 'atlas.html#c-' + c.id }, c.name));
    });
    if (ks.total > ks.picks.length) {
      use.appendChild(document.createTextNode(', '));
      use.appendChild(el('a', { href: m.slug + '#provenance' }, 'and ' + plural(ks.total - ks.picks.length, 'more subject')));
    }
    use.appendChild(document.createTextNode('.'));
    const meta = el('ul', { class: 'step-meta' },
      el('li', null, 'About ' + m.minutes + ' min'),
      el('li', null, plural(m.widgets.length, 'interactive widget')),
      el('li', null, m.prereqs.length ? ['Builds on ', m.prereqs.map(function (id, k) {
        const p = D.module(id);
        return [k ? (k === m.prereqs.length - 1 ? ' and ' : ', ') : '', el('a', { href: p.slug }, pad2(p.num) + ' ' + p.short)];
      })] : 'A good place to start'));
    const li = el('li', { class: ['step', m.extension ? 'is-ext' : ''].join(' '), id: 'step-' + m.id },
      el('span', { class: 'step-marker', 'aria-hidden': 'true' }, el('span', { class: 'step-num' }, pad2(m.num)), ui.icon('check')),
      el('article', { class: 'step-card', 'aria-labelledby': title },
        el('h3', { class: 'step-title', id: title },
          el('a', { href: m.slug }, el('span', { class: 'step-title-num' }, pad2(m.num)), ' ', m.title),
          m.extension ? ' ' : null, m.extension ? ui.tag('extension') : null),
        el('p', { class: 'step-summary' }, m.summary),
        use, meta,
        el('label', { class: 'step-read', for: 'read-' + m.id }, cb, el('span', null, 'Mark as read'),
          el('span', { class: 'visually-hidden' }, ': ' + pad2(m.num) + ' ' + m.title))));
    cb.addEventListener('change', function () {
      const set = readSet();
      if (cb.checked) set.add(m.id); else set.delete(m.id);
      writeSet(set);
      paint(set);
      $('progress-status').textContent = pad2(m.num) + ' ' + m.title + (cb.checked ? ' marked as read. ' : ' marked as not read. ') + countText(set) + '.';
    });
    steps[m.id] = { li: li, cb: cb };
    return li;
  }

  function buildPath() {
    const path = $('path');
    let n = 0;
    D.phases.forEach(function (ph) {
      n += 1;
      const id = slugOf(ph.id);
      const ol = el('ol', { class: 'steps', start: String(D.module(ph.modules[0]).num) });
      ph.modules.forEach(function (mid) { const m = D.module(mid); if (m) ol.appendChild(buildStep(m)); });
      path.appendChild(el('section', { class: 'phase', id: id, 'aria-labelledby': id + '-title' },
        el('h2', { class: 'phase-title', id: id + '-title' },
          el('span', { class: 'phase-kicker' }, 'Phase ' + n + ' of ' + D.phases.length), ' ',
          el('span', { class: 'phase-label' }, ph.id), ' ',
          el('span', { class: 'phase-span' }, (ph.modules.length === 1 ? 'module ' : 'modules ') + rangeOf(ph.modules) + ' · about ' + ui.fmtTime(minutesOf(ph.modules) * 60))),
        el('p', { class: 'phase-blurb' }, PHASE_BLURB[ph.id] || ''),
        ol));
    });
  }

  function buildRoutes() {
    const box = $('route-list');
    ROUTES.forEach(function (r) {
      const ids = r.ids.filter(function (id) { return D.module(id); });
      box.appendChild(el('article', { class: 'card route' },
        el('h3', null, r.title),
        el('p', { class: 'route-why' }, r.why),
        el('ol', { class: 'route-steps' }, ids.map(function (id) {
          const m = D.module(id);
          return el('li', null, el('a', { href: m.slug }, el('span', { class: 'route-num' }, pad2(m.num)), ' ', m.short));
        })),
        el('p', { class: 'route-time muted' }, plural(ids.length, 'module') + ', about ' + ui.fmtTime(minutesOf(ids) * 60))));
    });
  }

  /* ---------------------------------------------------------------- progress */
  let continueSlot = null, clearBtn = null, armed = 0;

  function countText(set) { return set.size + ' of ' + ALL.length + ' read'; }

  function paint(set) {
    ALL.forEach(function (id) {
      const s = steps[id];
      if (!s) return;
      const on = set.has(id);
      s.cb.checked = on;
      s.li.classList.toggle('is-read', on);
    });
    const n = set.size, total = ALL.length;
    $('progress-text').textContent = countText(set);
    const bar = $('progress-bar');
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(n));
    bar.setAttribute('aria-valuetext', countText(set));
    bar.firstElementChild.style.width = (100 * n / total) + '%';
    D.phases.forEach(function (ph) {
      const k = ph.modules.filter(function (id) { return set.has(id); }).length;
      ph._read.textContent = k + '/' + ph.modules.length;
      ph._link.classList.toggle('is-done', k === ph.modules.length);
    });
    continueSlot.textContent = '';
    const next = D.modules.find(function (m) { return !set.has(m.id); });
    if (next) {
      continueSlot.appendChild(el('a', { class: 'btn primary', href: next.slug },
        el('span', { class: 'btn-label' }, (n ? 'Continue: ' : 'Start: ') + pad2(next.num) + ' ' + next.title), ui.icon('arrow-right')));
    } else {
      continueSlot.appendChild(el('span', { class: 'learn-done' }, 'All ' + total + ' modules read. ',
        el('a', { href: 'simulator.html' }, 'Put it all together in the simulator'), '.'));
    }
    clearBtn.disabled = n === 0;
    disarm();
  }

  function disarm() {
    if (armed) { clearTimeout(armed); armed = 0; }
    clearBtn.querySelector('.btn-label').textContent = 'Clear all ticks';
  }

  function buildProgress() {
    const minutes = minutesOf(ALL);
    $('learn-total').textContent = plural(ALL.length, 'module') + ' · about ' + ui.fmtTime(minutes * 60) + ' in total';
    continueSlot = el('span', { class: 'learn-continue' });
    clearBtn = ui.button({ label: 'Clear all ticks', kind: 'ghost', small: true, icon: 'reset' });
    clearBtn.addEventListener('click', function () {
      const set = readSet();
      if (!set.size) return;
      if (!armed) {
        // two-step confirmation, so one stray click cannot wipe the ticks
        clearBtn.querySelector('.btn-label').textContent = 'Click again to clear ' + plural(set.size, 'tick');
        armed = setTimeout(disarm, 5000);
        return;
      }
      writeSet(new Set());
      paint(new Set());
      $('progress-status').textContent = 'All ticks cleared. ' + countText(new Set()) + '.';
    });
    const actions = $('progress-actions');
    actions.appendChild(continueSlot);
    actions.appendChild(clearBtn);
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'learn' });
    buildProgress();
    buildPhases();
    buildPath();
    buildRoutes();
    paint(readSet());
    // keep several open tabs in step
    window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) paint(readSet()); });
    ui.linkTerms(document.body);
  });
})();
