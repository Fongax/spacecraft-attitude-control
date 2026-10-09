/**
 * glossary.js: the glossary (glossary.html).
 *
 * Renders ADCS.data.glossary as an A–Z list of <dl> entries with id="g-<term id>": term, one-sentence
 * definition, an optional key relation (KaTeX), "See:" links to the modules and related terms.
 * Search (term and definition, case-insensitive, 150 ms debounce, <mark> highlights), a module
 * filter and an A–Z jump bar narrow the list. A deep link #g-<id> scrolls to the entry and
 * flashes it; links between entries do the same.
 */
(function () { 'use strict';
  const ui = ADCS.ui;
  const el = ui.el;
  const FLASH_MS = 2400;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  /* The ten terms that walk once around the closed loop, with the role each one plays. */
  const LOOP = [
    ['requirement', 'What must be true, written so a test can check it.'],
    ['attitude', 'The quantity being controlled.'],
    ['error-quaternion', 'How far the attitude is from the target, as one rotation.'],
    ['pid', 'The law that turns attitude error and rate into a torque command.'],
    ['saturation', 'The wheels can deliver only so much torque.'],
    ['reaction-wheel', 'The actuator that applies it.'],
    ['euler-equation', 'How the spacecraft body answers that torque.'],
    ['rk4', 'How the simulation steps the motion forward in time.'],
    ['safe-mode', 'What the logic does when rates run away or a fault appears.'],
    ['monte-carlo', 'How the design is shown to work across many starting conditions.']
  ];

  /*
   * Key relations for terms where one line of maths says more than words. A value is TeX (no
   * delimiters) or [tex, note]. Relations that quote a project threshold, a limit, a gain or the
   * time step are built from ADCS.params in paramRelations() below, never written here.
   * Symbols follow the site's conventions: scalar-first quaternions, q_e = q_ref* ⊗ q, k_θ acting
   * on the angle θ ≈ 2 q_e,v, J = diag(J_x, J_y, J_z) in body axes, and φ, θ, ψ for roll, pitch
   * and yaw (so a quaternion's rotation angle is α).
   */
  const EQ = {
    'inertia-tensor': '\\mathbf H = J\\boldsymbol\\omega, \\qquad T = \\tfrac12\\,\\boldsymbol\\omega^{\\mathsf T} J\\boldsymbol\\omega',
    'principal-axes': ['J\\,\\mathbf e_i = J_i\\,\\mathbf e_i \\;\\Rightarrow\\; J = \\operatorname{diag}(J_x, J_y, J_z)', 'in body axes'],
    'euler-equation': 'J\\dot{\\boldsymbol\\omega} + \\boldsymbol\\omega \\times (J\\boldsymbol\\omega) = \\boldsymbol\\tau',
    'gyroscopic-term': '\\boldsymbol\\omega \\cdot \\big(\\boldsymbol\\omega \\times J\\boldsymbol\\omega\\big) = 0 \\;\\Rightarrow\\; \\dot T = \\boldsymbol\\omega^{\\mathsf T}\\boldsymbol\\tau',
    'intermediate-axis': ['\\ddot\\omega_y \\brk = \\frac{(J_x - J_z)(J_y - J_x)}{J_y J_z}\\,\\Omega^2\\,\\omega_y', 'for a spin Ω about x; x has the middle moment, so the coefficient is positive and a small wobble grows'],
    'quaternion': ['q = \\big[\\cos\\tfrac{\\alpha}{2},\\; \\hat{\\mathbf n}\\sin\\tfrac{\\alpha}{2}\\big], \\qquad \\dot q = \\tfrac12\\, q \\otimes [0,\\ \\boldsymbol\\omega]', 'α = rotation angle about the unit axis n̂'],
    'hamilton-product': 'p \\otimes q = \\big[\\,p_0 q_0 - \\mathbf p \\cdot \\mathbf q, \\brk p_0\\mathbf q + q_0\\mathbf p + \\mathbf p \\times \\mathbf q\\,\\big]',
    'error-quaternion': 'q_e = q_{\\text{ref}}^{*} \\otimes q, \\qquad \\theta_e \\brk = 2\\,\\operatorname{atan2}\\big(\\lVert \\mathbf q_{e,v} \\rVert,\\ q_{e,0}\\big)',
    'shortest-rotation': 'q_{e,0} < 0 \\;\\Rightarrow\\; q_e \\leftarrow -q_e',
    'dcm': '\\mathbf v_B = C(q)\\,\\mathbf v_I, \\qquad C = R^{\\mathsf T}, \\qquad C^{\\mathsf T} C = I',
    'euler-angles': ['q = q_z(\\psi) \\otimes q_y(\\theta) \\otimes q_x(\\phi)', 'yaw ψ about z, then pitch θ about y, then roll φ about x'],
    'gimbal-lock': ['\\dot\\psi = \\frac{\\omega_y \\sin\\phi + \\omega_z \\cos\\phi}{\\cos\\theta}', 'φ = roll, θ = pitch, ψ = yaw; the yaw rate blows up as θ → ±90°'],
    'disturbance-torque': 'J\\dot{\\boldsymbol\\omega} + \\boldsymbol\\omega \\times J\\boldsymbol\\omega = \\boldsymbol\\tau_c + \\boldsymbol\\tau_d',
    'rk4': 'x_{k+1} = x_k \\brk + \\tfrac{h}{6}\\,\\big(k_1 + 2k_2 + 2k_3 + k_4\\big)',
    'forward-euler': '\\lVert q_{k+1} \\rVert^2 \\brk = \\lVert q_k \\rVert^2 \\Big(1 + \\tfrac{h^2}{4}\\lVert\\boldsymbol\\omega\\rVert^2\\Big)',
    'renormalisation': 'q \\leftarrow q \\,/\\, \\lVert q \\rVert',
    'order-of-accuracy': 'e(h) \\approx C h^{p} \\;\\Rightarrow\\; e(h)\\,/\\,e(h/2) \\approx 2^{p}',
    'stability-region': ['\\lvert 1 + h\\lambda \\rvert \\le 1', 'forward Euler on the test equation ẋ = λx'],
    'machine-epsilon': ['\\varepsilon_{64} = 2^{-52}, \\qquad \\varepsilon_{32} = 2^{-23}', 'float64 and float32'],
    'double-integrator': 'J\\ddot\\theta = \\tau \\quad\\Longleftrightarrow\\quad G(s) = \\frac{1}{J s^{2}}',
    'detumble': '\\boldsymbol\\tau = -K_d\\,\\boldsymbol\\omega \\;\\Rightarrow\\; \\dot T = -K_d \\lVert\\boldsymbol\\omega\\rVert^{2} \\le 0',
    'rate-damping': ['J_i\\dot\\omega_i = -K_d\\,\\omega_i \\;\\Rightarrow\\; \\omega_i(t) = \\omega_i(0)\\,e^{-K_d t / J_i}', 'one axis, gyroscopic coupling neglected'],
    'pid': '\\boldsymbol\\tau = -K_p\\,\\mathbf q_{e,v} - K_d\\,\\boldsymbol\\omega \\brk - K_i \\!\\int \\mathbf q_{e,v}\\,dt',
    'integral-windup': ['I(t) = \\int_0^t \\mathbf q_{e,v}\\,dt', 'keeps growing while the command is clipped at \\(\\tau_{\\max}\\), then has to unwind'],
    'lqr': 'u = -Kx, \\qquad \\mathcal J \\brk = \\int_0^\\infty \\big(x^{\\mathsf T} Q x + u^{\\mathsf T} R u\\big)\\,dt',
    'riccati': 'A^{\\mathsf T}P + PA \\brk - PBR^{-1}B^{\\mathsf T}P + Q = 0, \\qquad K = R^{-1}B^{\\mathsf T}P',
    'bellman': 'V(x) \\brk = \\min_{u}\\big[\\,\\ell(x,u) + V\\big(f(x,u)\\big)\\big]',
    'natural-frequency': '\\omega_n = \\sqrt{k_\\theta / J_i}, \\qquad s^2 + 2\\zeta\\omega_n s + \\omega_n^2 = 0',
    'settling-time': ['t_s \\approx \\frac{4}{\\zeta\\,\\omega_n}',
      'the 2% estimate for an underdamped second-order loop (\\(\\zeta < 1\\)); for \\(\\zeta > 1\\) the slow real pole sets it, ' +
      // Braces keep KaTeX from breaking the inline formula at its minus sign.
      '\\({t_s \\approx 4/\\big(\\zeta\\omega_n - \\omega_n\\sqrt{\\zeta^2 - 1}\\big)}\\); the site measures the last entry into the band instead'],
    'saturation': '\\tau_i \\brk = \\operatorname{clip}\\big(\\tau_{\\text{cmd},i},\\ -\\tau_{\\max},\\ \\tau_{\\max}\\big)',
    'reaction-wheel': '\\boldsymbol\\tau_{\\text{body}} = -\\dot{\\mathbf h}_w',
    'momentum-exchange': ['\\mathbf H = J\\boldsymbol\\omega + \\mathbf h_w = \\text{const}', 'with no external torque'],
    'back-emf': 'V = iR + k_e\\,\\omega_w, \\qquad \\tau = k_t\\, i',
    'magnetorquer': '\\boldsymbol\\tau = \\mathbf m \\times \\mathbf B',
    'gyro': ['\\tilde{\\boldsymbol\\omega} = \\boldsymbol\\omega + \\mathbf b + \\boldsymbol\\eta', '\\(\\tilde{\\boldsymbol\\omega}\\) is the measured rate, \\(\\mathbf b\\) the bias and \\(\\boldsymbol\\eta\\) white noise'],
    'gyro-bias': '\\delta\\theta(t) \\approx b\\,t',
    'complementary-filter': ['\\hat\\theta_{k+1} = \\alpha\\big(\\hat\\theta_k + h\\,\\tilde\\omega_k\\big) \\brk + (1-\\alpha)\\,\\theta_{\\text{abs}}',
      'the weight \\(\\alpha\\) lies between 0 and 1: a large \\(\\alpha\\) trusts the integrated gyro rate \\(\\tilde\\omega\\), a small one the absolute sensor’s angle \\(\\theta_{\\text{abs}}\\); \\(h\\) is the time between updates'],
    'kalman-filter': ['K \\brk = P^{-}H^{\\mathsf T}\\big(HP^{-}H^{\\mathsf T} + R\\big)^{-1}, \\qquad \\hat x^{+} = \\hat x^{-} + K\\big(z - H\\hat x^{-}\\big)',
      '\\(\\hat x^{-}\\) and \\(P^{-}\\) are the predicted state and covariance, \\(H\\) the measurement matrix, \\(R\\) the measurement-noise covariance (not the LQR weight), \\(z\\) the measurement and \\(K\\) the gain'],
    'mekf': ['q^{+} = q^{-} \\otimes \\big[1,\\ \\tfrac12\\,\\delta\\boldsymbol\\theta\\big]', 'then normalise'],
    'dead-reckoning': '\\theta(t) = \\theta_0 + \\int_0^t \\tilde\\omega\\,dt',
    'invariant': '\\forall s \\in \\mathrm{Reach}:\\ P(s)',
    'dfa': '\\delta : Q \\times \\Sigma \\to Q',
    'monte-carlo': '\\hat p = k/n, \\qquad \\mathrm{SE}(\\hat p) = \\sqrt{\\hat p\\,(1-\\hat p)/n}',
    'rule-of-three': 'p_{\\text{fail}} \\lesssim \\frac{-\\ln 0.05}{n} \\approx \\frac{3}{n}',
    'rate-monotonic': 'U = \\sum_{i=1}^{n} \\frac{C_i}{T_i} \\brk \\le n\\big(2^{1/n} - 1\\big)',
    'slerp': '\\operatorname{slerp}(q_a, q_b; s) \\brk = \\frac{\\sin\\big((1-s)\\Omega\\big)}{\\sin\\Omega}\\,q_a \\brk + \\frac{\\sin(s\\Omega)}{\\sin\\Omega}\\,q_b, \\qquad \\cos\\Omega = q_a \\cdot q_b',
    'risk-register': ['\\text{score} = L \\times I', 'likelihood times impact'],
    'fmea': '\\mathrm{RPN} = S \\times O \\times D',
    'critical-path': 'T_{\\text{project}} = \\max_{\\text{paths}} \\sum_{i\\,\\in\\,\\text{path}} d_i',
    'swiss-cheese': ['P(\\text{accident}) = \\prod_i p_i', 'if the layers fail independently'],
    'bdp': '\\mathrm{BDP} \\brk = \\text{bandwidth} \\times \\mathrm{RTT}'
  };

  /*
   * Honesty tags for definitions (ADCS.data.glossary) that quote a number or make a claim about this
   * spacecraft. They follow the definition, so the page's promise that a tag follows such a number
   * holds for the definitions as well as the key relations.
   */
  const DEF_TAGS = {
    'inertia-tensor': ['project'],
    'intermediate-axis': ['derived'],
    'disturbance-torque': ['project'],
    'gravity-gradient': ['derived'],
    'damping-ratio': ['derived'],
    'settling-time': ['project'],
    'saturation': ['project'],
    'hysteresis': ['project'],
    'dwell-time': ['project'],
    'margin': ['project'],
    'clopper-pearson': ['derived'],
    'fixed-point': ['derived']
  };

  /* A number for TeX: plain to six significant figures, or m × 10^e below 1e-4. */
  function texNum(x, sig) {
    if (x !== 0 && Math.abs(x) < 1e-4) {
      const e = Math.floor(Math.log10(Math.abs(x)));
      return String(Number((x / Math.pow(10, e)).toPrecision(sig || 2))) + '\\times 10^{' + e + '}';
    }
    return String(Number(x.toPrecision(sig || 6)));
  }

  /*
   * Relations that quote the project's thresholds, limits, gains or the time step, read from
   * ADCS.params (and ADCS.mc for the trial count). Each is {parts: [TeX clause, …], note: [text or
   * {tag}, …]}. A clause that starts with ⇒, = or ≈ continues the one before it.
   */
  function paramRelations(P, mc) {
    if (!P || !P.DEFAULTS || !P.LIMITS) return {};
    const d = P.DEFAULTS, sm = d.safeMode, L = P.LIMITS;
    const deg = '^\\circ/\\mathrm s';
    const out = {};
    const nD = Math.round(sm.dwell / d.dt);
    out['dwell-time'] = {
      parts: ['n_D = \\frac{T_{\\text{dwell}}}{\\Delta t}', '= \\frac{' + texNum(sm.dwell) + '\\ \\mathrm s}{' + texNum(d.dt) + '\\ \\mathrm s} = ' + nD + '\\ \\text{steps}'],
      note: ['counted in whole steps, never as accumulated float time; \\(T_{\\text{dwell}}\\) is a project threshold', { tag: 'project' },
        '; \\(\\Delta t = ' + texNum(d.dt) + '\\) s is a site default', { tag: 'site' }]
    };
    out['hysteresis'] = {
      parts: ['\\lvert\\omega\\rvert > \\omega_{\\text{in}} \\Rightarrow \\text{enter},', '\\lvert\\omega\\rvert < \\omega_{\\text{out}} \\text{ for } T_{\\text{hold}} \\Rightarrow \\text{leave}'],
      note: ['enter and leave SAFE_DETUMBLE, with \\(\\omega_{\\text{out}} < \\omega_{\\text{in}}\\); here \\(\\omega_{\\text{in}} = ' + texNum(sm.enterRateDeg) +
        '\\) deg/s, \\(\\omega_{\\text{out}} = ' + texNum(sm.exitRateDeg) + '\\) deg/s and the rate must stay below \\(\\omega_{\\text{out}}\\) for \\(T_{\\text{hold}} = ' +
        texNum(sm.exitHold) + '\\) s', { tag: 'project' }]
    };
    out['safety-property'] = {
      parts: ['\\mathbf G\\,\\big(\\lvert\\omega\\rvert \\le ' + texNum(L.rateMaxDeg) + deg + '\\big)'],
      note: ['G = “always”; the bound is the REQ-S1 rate limit', { tag: 'project' }]
    };
    out['liveness-property'] = {
      parts: ['\\mathbf G\\,\\big(\\text{entry} \\rightarrow \\mathbf F\\,\\lvert\\omega\\rvert < ' + texNum(L.rateDeg) + deg + '\\big)'],
      note: ['G = “always”, F = “eventually”, entry = safe-mode entry; the threshold is the REQ-F1 rate', { tag: 'project' }]
    };
    out['margin'] = {
      parts: ['M = \\frac{\\text{capability}}{\\text{demand}}', '\\text{or}\\quad ' + texNum(L.rateMaxDeg) + deg + ' - \\max_t \\lvert\\omega\\rvert'],
      note: [texNum(L.rateMaxDeg) + ' deg/s is the REQ-S1 limit', { tag: 'project' }]
    };
    const q15 = 32767;
    out['fixed-point'] = {
      parts: ['\\tau = k\\,\\Delta,', '\\Delta = \\frac{\\tau_{\\max}}{' + q15 + '}', '\\approx ' + texNum(d.tauMax / q15) + '\\ \\mathrm{N\\,m},', '\\lvert k\\rvert \\le ' + q15],
      note: ['\\(k\\) is a signed 16-bit integer; \\(\\tau_{\\max} = ' + texNum(d.tauMax) + '\\) N m per axis', { tag: 'project' }, ' and \\(\\Delta\\) follows from it', { tag: 'derived' }]
    };
    const n = mc && mc.DEFAULTS && mc.DEFAULTS.n;
    if (n) {
      out['clopper-pearson'] = {
        parts: ['p_L = \\alpha^{1/n},', '0.05^{1/' + n + '} = ' + Math.pow(0.05, 1 / n).toFixed(3)],
        note: ['zero failures in \\(n\\) trials, one-sided, at significance level \\(\\alpha = 0.05\\); the project runs \\(n = ' + n + '\\)', { tag: 'project' },
          ' and the bound follows from it', { tag: 'derived' }]
      };
    }
    // Worst case of the gravity-gradient torque, 3μ/(2r³)·(J_max − J_min), at the 400 km circular
    // orbit that module 03 assumes (μ and the Earth radius as m03 uses them).
    const MU = 3.986e14, R_EARTH = 6371e3, ALT_KM = 400;
    const rOrb = R_EARTH + ALT_KM * 1e3;
    const ggMax = 3 * MU / (2 * Math.pow(rOrb, 3)) * (Math.max.apply(null, d.J) - Math.min.apply(null, d.J));
    out['gravity-gradient'] = {
      parts: ['\\boldsymbol\\tau_{gg} = \\frac{3\\mu}{r^3}\\; \\hat{\\mathbf r}_B \\times \\big(J\\,\\hat{\\mathbf r}_B\\big),',
        '\\lVert\\boldsymbol\\tau_{gg}\\rVert \\le \\frac{3\\mu}{2r^3}\\,\\big(J_{\\max} - J_{\\min}\\big)', '\\approx ' + texNum(ggMax) + '\\ \\mathrm{N\\,m}'],
      note: ['\\(\\mu\\) is Earth’s gravitational parameter, \\(r\\) the orbit radius and \\(\\hat{\\mathbf r}_B\\) the local vertical (nadir) direction in body axes. ' +
        'The number assumes a ' + ALT_KM + ' km circular orbit, as module 03 does, and the project’s inertia; the orbit is not a project parameter', { tag: 'derived' }]
    };
    const J = d.J[1], kTh = d.pid.Kp / 2, kW = d.pid.Kd;
    const wn = Math.sqrt(kTh / J), zeta = kW / (2 * Math.sqrt(kTh * J));
    out['damping-ratio'] = {
      parts: ['J_i\\ddot\\theta + k_\\omega\\dot\\theta + k_\\theta\\theta = 0', '\\Rightarrow\\; \\zeta = \\frac{k_\\omega}{2\\sqrt{k_\\theta J_i}}'],
      note: ['\\(k_\\theta\\) multiplies the angle \\(\\theta \\approx 2\\,q_{e,v}\\): for the PID law \\(k_\\theta = K_p/2\\) and \\(k_\\omega = K_d\\); for LQR they are the gains themselves. ' +
        'On the y axis the PID gains give \\(k_\\theta = ' + texNum(kTh) + '\\) N m/rad and \\(k_\\omega = ' + texNum(kW) + '\\) N m s/rad', { tag: 'site' },
        ', with \\(J_y = ' + texNum(J) + '\\) kg m²', { tag: 'project' },
        ', so \\(\\omega_n = ' + texNum(wn, 2) + '\\) rad/s and \\(\\zeta = ' + zeta.toFixed(1) + '\\)', { tag: 'derived' }]
    };
    return out;
  }

  /*
   * Split a relation at its top-level clause breaks, so a narrow screen wraps only between clauses.
   * \qquad separates two clauses. \;\Rightarrow\; and \quad\Longleftrightarrow\quad start a
   * continuation clause that keeps the arrow. \brk (consumed here, never seen by KaTeX) marks a
   * break after a left-hand side or before a top-level + or −.
   */
  const BREAKS = [
    ['\\qquad', ''],
    ['\\;\\Rightarrow\\;', '\\Rightarrow\\; '],
    ['\\quad\\Longleftrightarrow\\quad', '\\Longleftrightarrow\\quad '],
    ['\\brk', '']
  ];
  function splitClauses(tex) {
    const parts = [];
    let depth = 0, start = 0, prefix = '';
    for (let i = 0; i < tex.length; i++) {
      const ch = tex[i];
      if (ch === '\\' && (tex[i + 1] === '{' || tex[i + 1] === '}')) { i += 1; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (depth === 0 && ch === '\\') {
        const br = BREAKS.find(function (b) { return tex.startsWith(b[0], i); });
        if (br) {
          parts.push(prefix + tex.slice(start, i).trim());
          prefix = br[1];
          i += br[0].length - 1;
          start = i + 1;
        }
      }
    }
    parts.push(prefix + tex.slice(start).trim());
    return parts.filter(function (p) { return p.trim(); });
  }
  /* A clause that opens with a relation or a binary operator continues the one before it. */
  function continues(part) {
    return /^\s*(=|\+|-|\\le\b|\\approx|\\Rightarrow)/.test(part);
  }
  function relationFor(v) {
    if (!v) return null;
    if (v.parts) return v;
    const tex = Array.isArray(v) ? v[0] : v;
    return { parts: splitClauses(tex), note: Array.isArray(v) && v[1] ? [v[1]] : [] };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function letterOf(term) {
    const m = String(term).toUpperCase().match(/[A-Z]/);
    return m ? m[0] : '#';
  }

  ui.ready(function () {
    ui.mountChrome({ page: 'glossary' });
    const D = ADCS.data;
    if (!D || !Array.isArray(D.glossary) || typeof D.term !== 'function') {
      throw new Error('the glossary data (ADCS.data.glossary) did not load');
    }
    const g = buildGlossary(D);
    ui.typeset(document.body);
    ui.linkTerms(document.body);
    g.start();
  });

  function buildGlossary(D) {
    const TERMS = D.glossary.slice().sort(function (a, b) {
      return a.term.localeCompare(b.term, 'en', { sensitivity: 'base' });
    });
    const reduced = ui.prefersReducedMotion();
    const entries = {};
    let query = '';
    let mod = 'all';
    let lastHash = location.hash;
    let lastDeep = null;
    const P = ADCS.params;
    const REL = {};
    const fromParams = paramRelations(P, ADCS.mc);
    Object.keys(EQ).forEach(function (id) { REL[id] = relationFor(EQ[id]); });
    Object.keys(fromParams).forEach(function (id) { REL[id] = fromParams[id]; });

    /* ---------------------------------------------------------------- header parts */
    const nEq = TERMS.filter(function (t) { return REL[t.id]; }).length;
    const usedIn = new Set();
    TERMS.forEach(function (t) { (t.modules || []).forEach(function (m) { usedIn.add(m); }); });
    document.getElementById('g-count').textContent =
      TERMS.length + ' terms · ' + nEq + ' with a key relation · used across ' + usedIn.size + ' modules';
    // The note is a wrapping flex row, so each tag leads the words that explain it. The spaces
    // keep the accessible text readable; the flex layout trims them visually.
    const note = document.getElementById('g-note');
    note.appendChild(document.createTextNode('A tag after a number about this spacecraft says where it comes from: '));
    note.appendChild(ui.tag('project'));
    note.appendChild(document.createTextNode(' the project notes, '));
    note.appendChild(ui.tag('derived'));
    note.appendChild(document.createTextNode(' computed from the project’s parameters, '));
    note.appendChild(ui.tag('site'));
    note.appendChild(document.createTextNode(P && P.DEFAULTS
      ? ' chosen for this site, such as the ' + texNum(P.DEFAULTS.dt) + ' s time step.'
      : ' chosen for this site.'));

    const loop = document.getElementById('g-loop');
    LOOP.forEach(function (p) {
      const t = D.term(p[0]);
      if (!t) return;
      loop.appendChild(el('li', null, el('a', { href: '#g-' + t.id }, t.term), el('span', { class: 'g-loop-role' }, p[1])));
    });

    /* ---------------------------------------------------------------- controls */
    const filters = document.getElementById('g-filters');
    const qId = 'g-q';
    const input = el('input', {
      type: 'search', id: qId, autocomplete: 'off', spellcheck: 'false', maxlength: '60',
      placeholder: 'quaternion, windup, Kalman…', 'aria-describedby': qId + '-help'
    });
    filters.appendChild(el('div', { class: 'field g-search' },
      el('label', { class: 'field-label', for: qId }, 'Search terms'), input,
      el('p', { class: 'field-help', id: qId + '-help' }, 'Matches terms and definitions.')));
    const modCtl = ui.select({
      id: 'g-m', label: 'Used in module',
      options: [{ value: 'all', label: 'All modules' }].concat(D.modules.map(function (m) { return { value: m.id, label: pad2(m.num) + ' ' + m.title }; })),
      value: 'all'
    });
    filters.appendChild(modCtl.el);
    modCtl.on('change', function () { mod = modCtl.value; apply(); });

    const run = ui.debounce(function () {
      const q = input.value.trim().slice(0, 60);
      if (q === query) return;
      query = q;
      apply();
    }, 150);
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run.flush(); }
      else if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; run(); run.flush(); }
    });
    function clearAll(focus) {
      run.cancel();
      input.value = '';
      query = '';
      mod = 'all';
      modCtl.set('all');
      apply();
      if (focus) input.focus();
    }
    document.getElementById('g-empty-clear').addEventListener('click', function () { clearAll(true); });

    /* ---------------------------------------------------------------- the list */
    const list = document.getElementById('g-list');
    const sections = {};
    TERMS.forEach(function (t) {
      const L = letterOf(t.term);
      if (!sections[L]) {
        const titleId = 'letter-' + L.toLowerCase() + '-title';
        const dl = el('dl', { class: 'g-list' });
        const sec = el('section', { class: 'g-letter', id: 'letter-' + L.toLowerCase(), 'aria-labelledby': titleId },
          el('h3', { class: 'g-letter-head', id: titleId }, L), dl);
        sections[L] = { el: sec, dl: dl, n: 0 };
        list.appendChild(sec);
      }
      sections[L].dl.appendChild(buildEntry(t));
    });

    function buildEntry(t) {
      const termEl = el('span', null, t.term);
      const defEl = el('span', null, t.def);
      const box = el('div', { class: 'g-entry', id: 'g-' + t.id, tabindex: '-1' },
        el('dt', null, el('dfn', { class: 'g-term' }, termEl),
          el('a', { class: 'g-self', href: '#g-' + t.id, 'aria-label': 'Link to the entry for ' + t.term, title: 'Link to this entry' }, '#')),
        el('dd', { class: 'g-def' }, defEl, (DEF_TAGS[t.id] || []).map(function (k) {
          return [document.createTextNode(' '), ui.tag(k)];
        })));
      const rel = REL[t.id];
      if (rel) {
        // One KaTeX group per clause: the braces stop KaTeX breaking inside a clause, so a narrow
        // screen wraps only between clauses, and a clause that is still too wide scrolls.
        const math = el('span', { class: 'g-eq-math' }, rel.parts.map(function (part, i) {
          const tight = i + 1 < rel.parts.length && continues(rel.parts[i + 1]);
          // {} before a leading operator keeps KaTeX's binary or relation spacing in a continuation.
          const tex = (i && continues(part) ? '{}' : '') + part;
          return el('span', { class: tight ? 'g-eq-part is-tight' : 'g-eq-part', dataset: { term: t.term } }, '\\(\\displaystyle{' + tex + '}\\)');
        }));
        const noteEl = rel.note && rel.note.length ? el('span', { class: 'g-eq-note' }, rel.note.map(function (piece) {
          return typeof piece === 'string' ? document.createTextNode(piece) : [document.createTextNode(' '), ui.tag(piece.tag)];
        })) : null;
        box.appendChild(el('dd', { class: 'g-eq' }, el('span', { class: 'g-eq-label' }, 'Key relation'), math, noteEl));
      }
      const mods = (t.modules || []).map(function (id) { return D.module(id); }).filter(Boolean);
      if (mods.length) {
        const dd = el('dd', { class: 'g-see' }, el('span', { class: 'g-label' }, 'See: '));
        mods.forEach(function (m, i) {
          if (i) dd.appendChild(document.createTextNode(i === mods.length - 1 ? ' and ' : ', '));
          dd.appendChild(el('a', { href: m.slug }, pad2(m.num) + ' ' + m.title));
        });
        box.appendChild(dd);
      }
      const related = (t.see || []).map(function (id) { return D.term(id); }).filter(Boolean);
      if (related.length) {
        const dd = el('dd', { class: 'g-rel' }, el('span', { class: 'g-label' }, 'Related: '));
        related.forEach(function (r, i) {
          if (i) dd.appendChild(document.createTextNode(', '));
          dd.appendChild(el('a', { href: '#g-' + r.id }, r.term));
        });
        box.appendChild(dd);
      }
      entries[t.id] = {
        el: box, t: t, letter: letterOf(t.term), termEl: termEl, defEl: defEl,
        text: (t.term + '\n' + t.def).toLowerCase()
      };
      return box;
    }

    /* ---------------------------------------------------------------- A–Z bar */
    const az = document.getElementById('g-az');
    const azList = el('ul', { class: 'g-az-list' });
    const azItems = {};
    LETTERS.forEach(function (L) {
      const li = el('li');
      azItems[L] = li;
      azList.appendChild(li);
    });
    az.appendChild(azList);
    function renderAz(counts) {
      LETTERS.forEach(function (L) {
        const li = azItems[L];
        li.textContent = '';
        if (counts[L]) {
          li.appendChild(el('a', { href: '#letter-' + L.toLowerCase(), title: counts[L] + (counts[L] === 1 ? ' term' : ' terms') }, L));
        } else {
          li.appendChild(el('span', { class: 'g-az-off', 'aria-hidden': 'true' }, L));
        }
      });
    }

    /* ---------------------------------------------------------------- apply */
    const status = document.getElementById('g-status');
    const empty = document.getElementById('g-empty');
    function apply() {
      const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6) : [];
      const re = terms.length ? new RegExp(terms.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRe).join('|'), 'gi') : null;
      const counts = {};
      let n = 0;
      Object.keys(sections).forEach(function (L) { sections[L].n = 0; });
      TERMS.forEach(function (t) {
        const e = entries[t.id];
        const ok = terms.every(function (w) { return e.text.indexOf(w) >= 0; }) &&
          (mod === 'all' || (t.modules || []).indexOf(mod) >= 0);
        e.el.hidden = !ok;
        highlight(e.termEl, t.term, re);
        highlight(e.defEl, t.def, re);
        if (ok) { n += 1; sections[e.letter].n += 1; counts[e.letter] = (counts[e.letter] || 0) + 1; }
      });
      Object.keys(sections).forEach(function (L) { sections[L].el.hidden = sections[L].n === 0; });
      renderAz(counts);
      const filtered = !!query || mod !== 'all';
      status.textContent = filtered ? 'Showing ' + n + ' of ' + TERMS.length + ' terms.' : 'Showing all ' + TERMS.length + ' terms.';
      empty.hidden = n > 0;
      refreshEqScroll();
    }
    function highlight(node, text, re) {
      node.textContent = '';
      if (!re) { node.textContent = text; return; }
      re.lastIndex = 0;
      let last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
        node.appendChild(el('mark', null, m[0]));
        last = m.index + m[0].length;
      }
      if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    }

    /* ---------------------------------------------------------------- deep links */
    function flash(node) {
      node.classList.remove('is-flash');
      void node.offsetWidth;
      node.classList.add('is-flash');
      setTimeout(function () { node.classList.remove('is-flash'); }, FLASH_MS);
    }
    function goTo(id) {
      const e = entries[id];
      if (!e) return false;
      if (e.el.hidden) clearAll(false);
      e.el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      e.el.focus({ preventScroll: true });
      flash(e.el);
      lastDeep = { id: id, t: Date.now() };
      return true;
    }
    function route(hash) {
      lastHash = hash;
      const h = String(hash || '').replace(/^#/, '');
      if (!/^g-/.test(h)) return;
      let id = h.slice(2);
      try { id = decodeURIComponent(id); } catch (err) { /* keep the raw id */ }
      goTo(id);
    }
    function onNav() { if (location.hash !== lastHash) route(location.hash); }
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href^="#g-"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(3);
      if (!entries[id]) return;
      e.preventDefault();
      if (location.hash !== '#g-' + id) {
        try { history.pushState(null, '', '#g-' + id); } catch (err) { location.replace('#g-' + id); }
      }
      lastHash = location.hash;
      goTo(id);
    });

    // LOCAL (request P0): ui.markScrollable only knows .katex-display, .eq and .scroll-x and runs
    // before the KaTeX fonts load. A clause that still overflows on a narrow screen scrolls and
    // becomes a named, focusable region so keyboard users can scroll it. A few pixels of italic or
    // subscript overhang sit in the clause's end padding and do not count.
    function refreshEqScroll() {
      ui.qsa('.g-eq-part').forEach(function (n) {
        if (n.closest('[hidden]')) return;
        const over = n.scrollWidth - n.clientWidth > 4;
        if (over === n.classList.contains('is-scroll')) return;
        n.classList.toggle('is-scroll', over);
        if (over) {
          n.setAttribute('tabindex', '0');
          n.setAttribute('role', 'region');
          n.setAttribute('aria-label', 'Key relation for ' + n.dataset.term + ' (scrolls sideways)');
        } else {
          n.removeAttribute('tabindex');
          n.removeAttribute('role');
          n.removeAttribute('aria-label');
        }
      });
    }
    window.addEventListener('resize', ui.debounce(refreshEqScroll, 200));

    // The toolbar is sticky only where the screen has room for it (glossary.css); while it is,
    // an entry scrolled to by a deep link must clear it.
    const toolbar = document.getElementById('g-toolbar');
    function measureToolbar() {
      const sticky = getComputedStyle(toolbar).position === 'sticky';
      document.body.style.setProperty('--g-offset', sticky ? (toolbar.offsetHeight + 16) + 'px' : '12px');
    }
    window.addEventListener('resize', ui.debounce(measureToolbar, 150));

    return {
      start: function () {
        apply();
        measureToolbar();
        refreshEqScroll();
        route(location.hash);
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () {
            ui.markScrollable(document.body);
            refreshEqScroll();
            measureToolbar();
            if (lastDeep && Date.now() - lastDeep.t < 2000) entries[lastDeep.id].el.scrollIntoView({ block: 'start' });
          });
        }
      }
    };
  }
})();
