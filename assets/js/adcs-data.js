/**
 * adcs-data.js — ADCS.data, the single source of truth for subjects and project structure.
 *
 * What lives here:
 *   disciplines  8 records {id, name, color}; color is a CSS custom-property name.
 *   courses      70 subject records {id, name, discipline, kind, evidence, covered, typical,
 *                typicalScope, keyIdeas}.
 *   modules      13 lifecycle modules {id, num, slug, title, short, phase, summary, minutes,
 *                extension, prereqs, objectives, sections, widgets, simLinks}. `sections` lists
 *                the page's section anchors in order, ending with 'further-reading' (the reading
 *                list from adcs-resources.js); link-check.js verifies each one exists.
 *   mappings     280 subject → module rows {course, module, strength, tag, concept, section}.
 *   loopBlocks / loopEdges  the landing-page loop diagram (viewBox 0 0 1000 640).
 *   trace, tests the requirement → test traceability and the T01–T06 test labels.
 *   risks, log   the six risk-register rows and the six iteration-log rows.
 *   glossary     90 terms {id, term, def, modules, see}.
 *   phases, labels, notes, expected  display labels and the counts validate() asserts.
 *
 * Writing rules for this file:
 *   - Subjects appear by generic subject name and subject matter only.
 *   - evidence 'outline' means only a subject outline exists: its `typical` list is the
 *     typical content of a subject of that name, inferred from the outline, not from notes.
 *   - `keyIdeas` are the ideas a subject brings to this project (drawn from its mappings);
 *     they are not a record of what the subject taught.
 *   - Mapping tags: 'direct' (the subject's own content), 'analogy' (a teaching bridge),
 *     'extension' (beyond the original project scope).
 *
 * The file never touches the DOM, so it also loads in Node via vm.runInThisContext.
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  const data = ADCS.data = {};

  /* ------------------------------------------------------------------ disciplines */

  data.disciplines = [
    { id: 'me',   name: 'Mechanical Engineering',         color: '--d-me' },
    { id: 'math', name: 'Mathematics',                    color: '--d-math' },
    { id: 'phys', name: 'Physics & Science',              color: '--d-phys' },
    { id: 'cs',   name: 'Computer Science',               color: '--d-cs' },
    { id: 'sw',   name: 'Programming & Software',         color: '--d-sw' },
    { id: 'ai',   name: 'Artificial Intelligence & Data', color: '--d-ai' },
    { id: 'av',   name: 'Aviation',                       color: '--d-av' },
    { id: 'mhf',  name: 'Management & Human Factors',     color: '--d-mhf' },
  ];

  /* ------------------------------------------------------------------ display labels */

  data.labels = {
    kind: {
      'subject': 'Subject',
      'self-study': 'Self-study practice',
      'topic-notes': 'Topic notes',
      'exercise': 'Short exercise',
    },
    evidence: { notes: 'Notes', partial: 'Partial notes', outline: 'Typical content' },
    strength: { strong: 'Strong', moderate: 'Moderate', weak: 'Weak' },
    tag: { direct: 'Direct', analogy: 'Analogy', extension: 'Extension' },
  };

  data.notes = {
    typicalHeading: 'Typical content of this subject',
    typicalInferred: '(inferred from the subject outline, not from notes)',
    typicalLegend: 'Typical content = standard syllabus for a subject of that name, inferred from its outline, not from notes.',
    keyIdeasHeading: 'Ideas it brings to this project',
  };

  /** Lifecycle phases in order, with the modules each one groups (learn.html strip). */
  data.phases = [
    { id: 'Define',  modules: ['m01', 'm02'] },
    { id: 'Model',   modules: ['m03', 'm04'] },
    { id: 'Design',  modules: ['m05', 'm06', 'm07'] },
    { id: 'Protect', modules: ['m08'] },
    { id: 'Prove',   modules: ['m09'] },
    { id: 'Build',   modules: ['m10', 'm11'] },
    { id: 'Run',     modules: ['m12', 'm13'] },
  ];

  /* ------------------------------------------------------------------ courses (70) */

  data.courses = [
    // ---- Mechanical Engineering (16)
    { id: 'electromech', name: 'Electromechanics', discipline: 'me', kind: 'subject', evidence: 'notes',
      covered: 'Circuit fundamentals and electrical safety; op-amps, signal conditioning and rotary sensors (encoders, Gray code, Hall sensors, tachogenerators); electromagnetism, DC motors and generators (torque constant, back-EMF, speed–torque line, efficiency); closed-loop control (P/I/D actions, windup, on–off control with hysteresis, Ziegler–Nichols); BLDC, stepper and servo motors; AC circuits, transformers and AC machines. Practical work on DC-motor characterisation and analogue PID position control.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        "Torque constant and back-EMF: why the wheel's torque limit depends on speed",
        'P, I and D actions, integral windup and derivative on measurement',
        'Hysteresis bands, Schmitt triggers and persistence timers',
        'Rotary sensors and the block-diagram vocabulary of a control loop',
      ] },
    { id: 'machine-elements', name: 'Design of Machine Elements', discipline: 'me', kind: 'subject', evidence: 'notes',
      covered: "The design process, safety factors and series reliability; stress analysis and failure theories; tolerances and fits; gear trains and tooth forces; fatigue (S-N curves, Marin factors, Goodman, Miner's rule); shafts, keys and couplings; rolling bearings (L10 life, Weibull reliability, preload); gear-tooth strength; belts, chains, brakes and clutches; bolted joints; lubrication, tribology and seals; logbook practice and failure case studies, all built around one gear-reducer design.",
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Margins as capability over demand, with a stated rationale',
        'Momentum capacity, Stribeck friction and imbalance in a wheel',
        'Life as a distribution: L10 and Weibull reliability',
        'Logbook discipline: decision, reason and source',
      ] },
    { id: 'kin-dyn', name: 'Kinematics and Dynamics', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with vector-mechanics dynamics material, a formula sheet and gyroscopic motion as a practical topic.',
      typical: [
        "Particle kinematics and kinetics (Newton's laws, work–energy, impulse–momentum)",
        'Planar rigid-body kinematics and kinetics, rotating frames and the Coriolis term',
        "3-D rigid-body dynamics (inertia tensor, principal axes, Euler's equations)",
        'Gyroscopic and torque-free motion',
        'Often mechanisms and single-degree-of-freedom vibration',
      ],
      typicalScope: null,
      keyIdeas: [
        "Euler's equations and the gyroscopic term",
        'Torque-free motion and intermediate-axis instability',
        'The work–energy proof that detumble removes energy',
        'Total angular momentum with wheels: H = Jω + h_w',
      ] },
    { id: 'control-sys', name: 'Control Systems', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with root-locus material, simulation-based and Python-based control workshops, and laboratory work.',
      typical: [
        'Laplace transforms, transfer functions and block-diagram reduction',
        'Time response, poles and zeros, Routh–Hurwitz stability',
        'Steady-state error and disturbance rejection',
        'Root locus and PID/lead–lag design',
        'Frequency response (Bode, Nyquist, margins)',
        'State space (controllability, pole placement, observers)',
        'Introductory digital control',
      ],
      typicalScope: null,
      keyIdeas: [
        'The 1/(Js²) plant: poles, damping and steady error',
        'Closed-loop block diagrams and T(s)',
        'State feedback u = −Kx as the bridge to LQR',
        'Sampling rate against closed-loop bandwidth',
      ] },
    { id: 'mom-2', name: 'Mechanics of Materials 2', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: "Subject outline showing Mohr's-circle work (including a small self-built calculator), an introduction to the finite element method and frame analysis.",
      typical: [
        'Stress and strain transformation and principal stresses',
        'Failure theories and combined loading',
        'Energy methods (Castigliano)',
        'Indeterminate beams and frames',
        'Column buckling',
        'Unsymmetric bending and shear centre',
        'Pressure vessels',
        'Matrix stiffness method and FEM',
      ],
      typicalScope: null,
      keyIdeas: [
        'The inertia tensor transforms like the stress tensor',
        "Principal moments as eigenvalues (Mohr's circle)",
        'Hoop stress shows small wheels are not strength-limited',
      ] },
    { id: 'mech-design', name: 'Mechanical Engineering Design', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline built around the structured mechanical design process, with two project-based design-and-build exercises.',
      typical: [
        'Design process and planning',
        'Customer needs to engineering specifications (QFD)',
        'Functional decomposition and concept generation',
        'Pugh and weighted decision matrices',
        'Embodiment design, DFM/DFA, FMEA and robust design',
        'Prototyping, testing and design reviews',
      ],
      typicalScope: null,
      keyIdeas: [
        'Needs → specifications → tests (QFD) as traceability',
        'Functional decomposition of the control loop',
        'Weighted decision matrices and FMEA',
        'Robust design across noise factors',
      ] },
    { id: 'digital-design', name: 'Digital Design and Modelling', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline showing parametric CAD part and assembly modelling and formal engineering drawings.',
      typical: [
        'Constrained sketching and features',
        'Design intent and parametric modelling',
        'Assemblies and mates',
        'Engineering drawings and introductory tolerancing',
        'Mass properties and rendering',
      ],
      typicalScope: null,
      keyIdeas: [
        'CAD mass properties as the proper source for J',
        'Assembly mates as a model for subsystem interfaces',
        'Exported geometry for the 3-D view',
      ] },
    { id: 'cad-practice', name: 'Parametric CAD Practice (self-study)', discipline: 'me', kind: 'self-study', evidence: 'outline',
      covered: 'An 18-level graded set of CAD problems, building from sketching and features through patterns, sweeps, shells and ribs to assemblies, configurations and equations, at associate and professional certification level.',
      typical: [
        'Mass-property evaluation of parts and assemblies',
        'Configurations and global equations for parametric design families',
      ],
      typicalScope: null,
      keyIdeas: [
        'Mass-property evaluation of parts and assemblies',
        'Parametric families giving J as a function of design changes',
      ] },
    { id: 'mom-1', name: 'Mechanics of Materials 1', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with laboratory work and a formula sheet.',
      typical: [
        "Stress, strain, Hooke's law and Poisson's ratio",
        'Axial loading and thermal stress',
        'Torsion of shafts and power transmission',
        'Shear-force and bending-moment diagrams, flexure and transverse shear',
        'Beam deflection',
        'Stress concentration',
      ],
      typicalScope: null,
      keyIdeas: [
        'A notation clash: polar J versus the inertia tensor J',
        'Shaft power P = Tω and torsional stiffness',
      ] },
    { id: 'statics', name: 'Engineering Mechanics (Statics)', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with beam and truss project work.',
      typical: [
        'Force vectors, moments (M = r × F) and couples',
        'Free-body diagrams and equilibrium in 2-D and 3-D',
        'Trusses, frames and machines',
        'Distributed loads and internal forces',
        'Friction',
        'Centroids, centres of mass and area moments of inertia',
      ],
      typicalScope: null,
      keyIdeas: [
        'Every disturbance torque has the form τ = r × F',
        'A wheel applies a pure couple; wheel torques add as vectors',
      ] },
    { id: 'eng-materials', name: 'Engineering Materials', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with laboratory work in materials science.',
      typical: [
        'Bonding and crystal structures',
        'Imperfections and diffusion',
        'Mechanical properties, dislocations and strengthening',
        'Fracture, fatigue and creep',
        'Phase diagrams and heat treatment',
        'Metals, ceramics, polymers and composites',
        'Corrosion',
        'Thermal, electrical and magnetic properties',
      ],
      typicalScope: null,
      keyIdeas: [
        'Residual magnetic dipoles as a disturbance source',
        'Outgassing, low-CTE mounts and rotor material choice',
      ] },
    { id: 'design-practice', name: 'Engineering Design Practice', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline built around a team design project, with progressive CAD labs and professional documentation.',
      typical: [
        'The engineering design process (problem definition, constraints, concept selection)',
        'Teamwork and project planning',
        'Technical communication (reports, presentations, drawings)',
        'Introductory CAD',
        'Sustainability, ethics, safety and professional responsibility',
      ],
      typicalScope: null,
      keyIdeas: [
        'Problem definition with explicit constraints and assumptions',
        'Team planning and milestone tracking',
        'The ethics behind a "fail to safe mode" philosophy',
      ] },
    { id: 'mat-manuf', name: 'Materials and Manufacturing', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline covering materials and manufacturing processes with project-based work.',
      typical: [
        'Material selection with property charts and performance indices',
        'Heat treatment and surface engineering',
        'Polymer and composite processing',
        'Powder metallurgy and additive manufacturing',
        'Joining',
        'Process selection, cost and quality control (NDT)',
        'Life-cycle thinking',
      ],
      typicalScope: null,
      keyIdeas: [
        'Inspection and non-destructive testing as verification by test',
        'Manufacturing variation makes the real J uncertain',
      ] },
    { id: 'manuf-tech', name: 'Manufacturing Technology', discipline: 'me', kind: 'subject', evidence: 'partial',
      covered: "Full notes on metal casting: solidification and grain structure, gating systems and risers, fluidity, Chvorinov's rule, shrinkage, casting defects, and sand, investment, permanent-mould and die casting.",
      typical: [
        'Bulk deformation (rolling, forging, extrusion, drawing)',
        'Sheet-metal forming',
        'Machining mechanics, tool life and surface finish',
        'Non-traditional machining, welding and joining',
        'Metrology, tolerances and CNC',
      ],
      typicalScope: 'rest of the subject',
      keyIdeas: [
        'Rotor imbalance from casting porosity or density variation',
        'Machining tolerances set wheel-axis misalignment',
        'Misalignment and imbalance as extra Monte Carlo variables',
      ] },
    { id: 'thermo', name: 'Engineering Thermodynamics', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with weekly tutorial problems, laboratory work and property-table practice.',
      typical: [
        'Properties of pure substances and ideal gases',
        'First law for closed systems and control volumes',
        'Second law, entropy and Carnot limits',
        'Power and refrigeration cycles',
        'Conduction, convection and radiation',
      ],
      typicalScope: null,
      keyIdeas: [
        'Wheel losses leave only by conduction and radiation',
        'Cold raises lubricant viscosity',
      ] },
    { id: 'fluids', name: 'Fluid Mechanics and Hydraulics', discipline: 'me', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with laboratory work including Venturi-meter flow measurement.',
      typical: [
        'Fluid properties and viscosity',
        'Hydrostatics and centre of pressure',
        'Continuity and Bernoulli, flow measurement',
        'Energy equation with pipe losses',
        'Momentum equation and dimensional analysis',
        'Boundary layers and drag (F = ½ρv²C_D A)',
      ],
      typicalScope: null,
      keyIdeas: [
        'The drag equation and the centre of pressure',
        'Viscous plus Coulomb bearing friction',
        'Where continuum and rigid-body assumptions break down',
      ] },
    // ---- Mathematics (5)
    { id: 'eng-math-1', name: 'Engineering Mathematics 1', discipline: 'math', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with many short topic videos on vectors, complex numbers, matrices, probability and functions, plus practice on 3 × 3 matrices and probability.',
      typical: [
        'Vectors (dot and cross products, lines and planes)',
        'Matrices, determinants, inverses and linear systems, with an introduction to eigenvalues',
        "Complex numbers (polar form, Euler's formula, De Moivre)",
        "Probability, conditional probability and Bayes' rule",
        'Discrete and continuous distributions',
        'Elementary functions',
      ],
      typicalScope: null,
      keyIdeas: [
        'Cross products, skew matrices and orthogonal matrices',
        'Complex numbers as 2-D rotations, generalised by quaternions',
        'Probability: binomial pass/fail models and covariance',
      ] },
    { id: 'calculus-2', name: 'Calculus II', discipline: 'math', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with lecture sets and topic videos; the outline names no topics.',
      typical: [
        'Sequences and series, Taylor series with remainder',
        'Partial derivatives, gradient, chain rule, Jacobians and linearisation',
        'Optimisation and Lagrange multipliers',
        'Multiple integrals and change of variables',
        'Possibly vector calculus or second-order ODEs',
      ],
      typicalScope: null,
      keyIdeas: [
        "Taylor series behind RK4's order of accuracy",
        'Jacobian linearisation and quadratic forms',
        'Inertia as a triple integral; change of variables for sampling',
      ] },
    { id: 'eng-math-2', name: 'Engineering Mathematics 2', discipline: 'math', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with workbook chapters in two strands (functions and calculus) and a trigonometric-identities sheet.',
      typical: [
        'Polynomial, exponential, logarithmic, trigonometric and inverse trigonometric functions',
        'Limits and continuity',
        "Differentiation and its applications (linear approximation, Newton's method)",
        'Integration techniques',
        'Numerical integration (trapezoid, Simpson)',
        'Possibly first-order ODEs',
      ],
      typicalScope: null,
      keyIdeas: [
        'Half-angle identities and atan2 error angles',
        'The small-angle model θ ≈ 2q_v',
        "Simpson's rule inside RK4",
      ] },
    { id: 'discrete', name: 'Discrete Structures', discipline: 'math', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with eight topic areas running from sets to counting.',
      typical: [
        'Sets, propositional logic, predicates and quantifiers',
        'Proof techniques including induction',
        'Sequences and recursion',
        'Functions and relations',
        'Graphs and trees',
        'Counting (permutations, combinations, pigeonhole)',
        'Often finite-state machines',
      ],
      typicalScope: null,
      keyIdeas: [
        'Safety versus bounded liveness',
        'Modes as a set and transitions as a relation',
        'De Morgan and proof by induction for guards',
      ] },
    { id: 'quant-reasoning', name: 'Quantitative Reasoning', discipline: 'math', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with lectures and workshops.',
      typical: [
        'Units, ratios, percentages, scientific notation and estimation',
        'Exponential growth and decay, logarithms',
        'Descriptive statistics and probability',
        'Binomial and normal distributions',
        'Sampling and confidence intervals',
        'Hypothesis testing, correlation and simple regression',
      ],
      typicalScope: null,
      keyIdeas: [
        'What 60 passes in 60 trials can prove',
        'Zero-failure sample sizes',
        'Unit discipline',
      ] },
    // ---- Physics & Science (3)
    { id: 'intro-physics', name: 'Introductory Physics', discipline: 'phys', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline for calculus-based first-year physics.',
      typical: [
        "Units and vectors, kinematics and Newton's laws",
        'Work, energy and power',
        'Momentum and collisions',
        'Rotation (torque, moment of inertia, rolling)',
        'Angular momentum and its conservation',
        'Gravitation',
        'Simple harmonic, damped and driven oscillations',
      ],
      typicalScope: null,
      keyIdeas: [
        "τ = dL/dt leads to Euler's equation",
        'The damped oscillator: ωn, ζ and settling time',
        'Minimum braking time J·ω0/τmax',
      ] },
    { id: 'aviation-science', name: 'Aviation Science', discipline: 'phys', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline for concept-first physics with aviation examples and Peer Instruction concept questions.',
      typical: [
        'Motion, forces and conservation laws',
        'Rotation and angular momentum',
        'Oscillations, waves and sound',
        'Fluids, gas laws and thermodynamics',
        'Introductory electricity and magnetism',
      ],
      typicalScope: null,
      keyIdeas: [
        'The tennis-racket theorem and the major-axis rule',
        'Conservation of T and |H| as an integrator check',
        'Predict, then reveal',
      ] },
    { id: 'atmos-science', name: 'Atmospheric Science', discipline: 'phys', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Composition and vertical structure of the atmosphere',
        'Hydrostatic balance, ideal gas law and lapse rates',
        'Solar and terrestrial radiation and energy balance',
        'Clouds, precipitation and circulation',
        'The upper atmosphere',
      ],
      typicalScope: null,
      keyIdeas: [
        'Low-orbit density sets the drag torque',
        'Radiative equilibrium temperature',
        'Solar-cycle density variation',
      ] },
    // ---- Computer Science (10)
    { id: 'comp-algorithms', name: 'Computing Algorithms', discipline: 'cs', kind: 'subject', evidence: 'notes',
      covered: 'Notes on arrays, linked lists, stacks and queues (including ring buffers and amortised analysis); binary search and hashing; trees, traversals and binary search trees; graph terminology and representations; problem topics on balanced trees and heaps.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Per-step dataflow as a DAG in topological order',
        'Adjacency-matrix guards and BFS reachability',
        'Binary search for playback; preallocation for deadlines',
      ] },
    { id: 'logic-ar', name: 'Logic and Automated Reasoning', discipline: 'cs', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline and practical tooling: a first-order sequent prover and interactive theorem proving with automated provers and counterexample finders, proving list properties by structural induction.',
      typical: [
        'Propositional logic, normal forms and SAT solving',
        'Natural deduction and sequent calculus (soundness, completeness)',
        'First-order logic, unification and resolution',
        'Higher-order logic and interactive proof',
        'Specification and invariants',
        'Temporal logic and model checking, safety vs liveness',
      ],
      typicalScope: null,
      keyIdeas: [
        'Temporal-logic forms of the requirements',
        'Exhaustive model checking of finite mode logic',
        'Testing shows bugs, not their absence',
      ] },
    { id: 'theory-comp', name: 'Theory of Computing', discipline: 'cs', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only (automata, computability and complexity).',
      typical: [
        'Finite automata, regular expressions and the pumping lemma',
        'Context-free grammars and pushdown automata',
        'Turing machines',
        "Decidability, reductions and Rice's theorem",
        'P, NP and NP-completeness',
      ],
      typicalScope: null,
      keyIdeas: [
        'The mode logic as a DFA with a complete δ table',
        'A monitor automaton over the mode log',
        'Product-automaton state explosion',
      ] },
    { id: 'comp-net-arch', name: 'Computer and Network Architecture', discipline: 'cs', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with digital-logic circuit simulation exercises.',
      typical: [
        "Number representation (two's complement, fixed point, IEEE 754)",
        'Boolean algebra and logic gates',
        'Combinational and sequential circuits and finite-state machines',
        'CPU organisation',
        'Memory hierarchy, I/O, interrupts and timers',
        'Network layers and error detection (parity, checksums, CRC)',
      ],
      typicalScope: null,
      keyIdeas: [
        'Number representation: float32, fixed point and Q15',
        'The mode machine as a hardware FSM',
        'Watchdogs, timers and CRC on frames',
      ] },
    { id: 'cyber-sec', name: 'Cyber Security', discipline: 'cs', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with security-standards material and a public critical-infrastructure ransomware case study.',
      typical: [
        'The CIA triad and security-management standards',
        'Risk assessment (likelihood × impact, treatment, residual risk)',
        'Cybersecurity framework functions',
        'The incident-response lifecycle and security operations',
        'Industrial control-system security',
        'Business continuity',
      ],
      typicalScope: null,
      keyIdeas: [
        'Likelihood × impact risk matrices and residual risk',
        'Incident response and defence in depth',
        'Authenticated commands that still cannot bypass guards',
      ] },
    { id: 'data-structures', name: 'Data Structures', discipline: 'cs', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on integers and IEEE 754 floating point, booleans and bit operations; arrays, linked lists, stacks, queues, ring buffers and deques; trees (BST, AVL, red-black, segment and Fenwick trees, B-trees); graphs and their representations; heaps, priority queues and hashing; probabilistic structures.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'IEEE 754 traps: acos versus atan2, float timers',
        'Incidence matrices and the one-step-delay DAG',
        'Ring buffers, sliding windows and bit-packed flags',
        'Row-major versus column-major porting bugs',
      ] },
    { id: 'algorithms', name: 'Algorithms', discipline: 'cs', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on complexity and Big-O, binary and ternary search, recursion and sorting; greedy methods and string matching; graph algorithms (Dijkstra, Bellman–Ford, Floyd–Warshall, spanning trees, topological sort, strongly connected components, max-flow); dynamic programming and backtracking; simulated annealing, tabu search and genetic algorithms against honest baselines.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Order of accuracy from error ratios',
        'LQR as dynamic programming',
        'Exhaustive model checking and strongly connected components',
        'Confidence bounds and order statistics',
      ] },
    { id: 'sys-prog', name: 'Systems Programming and Memory', discipline: 'cs', kind: 'topic-notes', evidence: 'notes',
      covered: "Topic notes on stack vs heap, allocators and manual memory management, reference counting and garbage collection, virtual memory and paging, concurrency control, threads and event loops, parallelism and Amdahl's law, locks, semaphores and deadlocks.",
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'No heap after initialisation, no recursion',
        'Torn reads, lock ordering and priority inversion',
        "Event loops and Amdahl's law",
      ] },
    { id: 'networking', name: 'Networking', discipline: 'cs', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on OSI vs TCP/IP layering, routing algorithms, flow and congestion control (bandwidth-delay product, AIMD), DNS, HTTP/HTTPS, WebSockets and schema-first RPC.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Layer replacement from software-in-the-loop to hardware-in-the-loop',
        'Bandwidth-delay product and selective repeat',
        'Congestion control as a feedback loop (analogy)',
      ] },
    { id: 'db-os', name: 'Database Infrastructure and OS Internals', discipline: 'cs', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on database indexing, inverted indexes, write-ahead logging and ACID transactions; CPU scheduling and context switching; inter-process communication; file systems; concurrency primitives.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Traceability as an inverted index',
        'Write-ahead logging of the mode across resets',
        'Fixed-priority scheduling and WCET',
      ] },
    // ---- Programming & Software (7)
    { id: 'py-search-csp', name: 'Python Programming for Search and Constraint Satisfaction', discipline: 'sw', kind: 'subject', evidence: 'notes',
      covered: 'A from-zero Python course taught through two complete programs: a grid-maze solver (IDS, IDA*, A*) and a crossword generator (a CSP solved with AC-3 and backtracking). It covers the language from values and types to classes, recursion and comprehensions, plus debugging discipline.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Transition dicts and forbidden-pair sets',
        'Backtracking with undo as an exhaustive checker',
        'Classes, dicts and modules for a validation mirror',
      ] },
    { id: 'oop-cpp', name: 'Object-Oriented Programming (C++)', discipline: 'sw', kind: 'subject', evidence: 'notes',
      covered: 'Notes on inheritance, exceptions, smart pointers, multithreading and the standard random-number library (seeded Mersenne Twister), with UML class diagrams and flowcharts.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'A controller base class with a virtual torque()',
        'An encapsulated mode manager',
        'Seeded random-number streams per trial',
      ] },
    { id: 'software-projects', name: 'Software Projects', discipline: 'sw', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline on software technologies, with a team Python web application developed over several versions and automated testing with pytest.',
      typical: [
        'The software lifecycle, agile and Scrum',
        'Version control and code review',
        'Requirements and acceptance criteria',
        'Architecture and separation of concerns (MVC)',
        'Unit, integration and system testing, test-driven development and continuous integration',
      ],
      typicalScope: null,
      keyIdeas: [
        'Acceptance criteria and tests that carry requirement IDs',
        'Golden-file regression and dependency pinning',
        'Separation of concerns (MVC)',
      ] },
    { id: 'prog-eng', name: 'Programming and Computing for Engineers', discipline: 'sw', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with weekly lab sheets and tutorial code in introductory Python.',
      typical: [
        'Python fundamentals (decisions, loops, functions)',
        'Files, exceptions, collections, classes and recursion',
        'GUI programming and simple graphics',
        'NumPy arrays and plotting',
        'Simple numerical methods (root finding, quadrature, Euler and Runge–Kutta time stepping)',
      ],
      typicalScope: null,
      keyIdeas: [
        'Hand-coded Euler and Runge–Kutta time stepping',
        'NumPy, plots and slider GUIs',
        'Reproducible random generators',
      ] },
    { id: 'prog-principles', name: 'Programming Principles', discipline: 'sw', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with Python workshop exercises checked by automated tests.',
      typical: [
        'Problem decomposition and pseudocode',
        'Variables, control flow, functions and scope',
        'Strings, collections and file I/O',
        'Exceptions, modules, introductory classes and recursion',
        'Testing with assert and pytest',
        'Debugging and code style',
      ],
      typicalScope: null,
      keyIdeas: [
        'Small, single-purpose, tested functions',
        'Unit tests for quaternion and DCM helpers',
      ] },
    { id: 'cpp-exercise', name: 'C++ Inheritance and Polymorphism (short exercise)', discipline: 'sw', kind: 'exercise', evidence: 'outline',
      covered: 'A short guided exercise: a base class with protected members and a virtual function, derived classes that override it, and a test program.',
      typical: [
        'Virtual functions and dynamic dispatch',
        'The override and final specifiers',
        'Base-class constructor calls',
        'Virtual destructors and abstract classes',
      ],
      typicalScope: null,
      keyIdeas: [
        'The override keyword and virtual destructors',
        'Dynamic dispatch through a base class',
      ] },
    { id: 'soft-eng-arch', name: 'Software Engineering and Architecture', discipline: 'sw', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on abstraction, encapsulation, inheritance and polymorphism; SOLID; DRY, KISS and YAGNI; MVC; monolith vs microservices; event-driven architecture; caching and eviction.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'A strategy interface for controllers',
        'One model, many views (MVC)',
        'Single-source constants (DRY) and YAGNI',
      ] },
    // ---- Artificial Intelligence & Data (7)
    { id: 'intel-sys', name: 'Intelligent Systems', discipline: 'ai', kind: 'subject', evidence: 'notes',
      covered: 'Agents and PEAS; uninformed and informed search (A*, admissible and consistent heuristics), and local search; constraint satisfaction (backtracking, AC-3); machine-learning foundations, linear models and gradient descent, multilayer perceptrons, model selection and decision trees; probability and Bayes nets; Markov decision processes and value iteration; reinforcement learning (TD learning, Q-learning).',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'PEAS: start from the performance measure',
        'Constraint satisfaction with AC-3',
        'Search, BFS reachability and "prove vs find"',
        'Bellman equations and value iteration as the bridge to LQR',
      ] },
    { id: 'data-mining', name: 'Data Mining', discipline: 'ai', kind: 'subject', evidence: 'partial',
      covered: 'An introductory lecture on the knowledge-discovery process and the data-mining functions: characterisation, association rules (support, confidence), classification, clustering, outlier detection and time-series analysis.',
      typical: [
        'Preprocessing and normalisation',
        'Frequent patterns (Apriori, lift)',
        'Decision trees, naive Bayes and k-NN',
        'Evaluation (confusion matrix, precision, recall, cross-validation)',
        'Clustering (k-means, hierarchical, DBSCAN) and outlier detection',
      ],
      typicalScope: 'later topics',
      keyIdeas: [
        'Outlier detection on telemetry',
        'Mining the trial table to explain worst cases',
      ] },
    { id: 'ai-methods', name: 'AI Methodologies', discipline: 'ai', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on rule-based expert systems (forward and backward chaining), logic programming, knowledge representation, constraint satisfaction, evolutionary algorithms against honest baselines, and neural-network fundamentals.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Forward-chaining rule engines',
        '"Symbolic systems fail by silence"',
        'Genetic algorithms against honest baselines',
      ] },
    { id: 'supervised', name: 'Supervised Learning and Model Evaluation', discipline: 'ai', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on logistic regression, ridge and lasso, decision trees, support vector machines, naive Bayes, bagging, random forests and boosting, evaluation metrics, and cross-validation and leakage.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Detection as precision versus recall',
        'Tuning versus verification leakage',
        'Ridge-style regularised least squares',
      ] },
    { id: 'unsup-rl', name: 'Unsupervised and Reinforcement Learning', discipline: 'ai', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on k-means, hierarchical clustering, DBSCAN, PCA, t-SNE and UMAP, Isolation Forest, Q-learning and SARSA, deep Q-networks, policy gradients, actor-critic methods and preference-based fine-tuning.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'Principal axes as a PCA-style eigen-decomposition',
        'LQR as the baseline for learned policies',
        'Q-learning versus SARSA, and safety shields',
      ] },
    { id: 'deep-learning', name: 'Deep Learning and Generative AI', discipline: 'ai', kind: 'topic-notes', evidence: 'notes',
      covered: 'Topic notes on convolutional and recurrent networks (LSTMs), self-attention and positional encodings, encoder–decoder models, large language models, context windows and KV caches, retrieval-augmented generation, and the reliability arithmetic of multi-step workflows.',
      typical: null,
      typicalScope: null,
      keyIdeas: [
        'A residual block as an Euler step (analogy)',
        'Gated integrators and anti-windup (analogy)',
        'Chained reliability p^n',
      ] },
    { id: 'business-is', name: 'Business Information Systems', discipline: 'ai', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with weekly spreadsheet and desktop-database exercises.',
      typical: [
        'Information systems in organisations',
        'Spreadsheets (formulas, lookups, pivot tables, what-if analysis)',
        'Relational databases (keys, relationships, normalisation, queries)',
        'Data quality and business-process modelling',
      ],
      typicalScope: null,
      keyIdeas: [
        'Requirements, tests and results as relational tables',
        'Pivot-style summaries of trials',
      ] },
    // ---- Aviation (14)
    { id: 'av-meteo-1', name: 'Aviation Meteorology Part I', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with weather-related accident case material.',
      typical: [
        'The International Standard Atmosphere and altimetry',
        'Pressure, density altitude and wind (Coriolis, geostrophic balance)',
        'Stability, clouds, fog and precipitation',
        'Air masses, fronts, thunderstorms, turbulence and icing',
        'Weather reports and forecasts',
      ],
      typicalScope: null,
      keyIdeas: [
        'The Coriolis term as a rotating-frame operator (analogy)',
        'Space weather as a drag and upset driver',
      ] },
    { id: 'aero-1', name: 'Aerodynamics Part I', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Properties of air, continuity, Bernoulli and airspeeds',
        'Airfoils (lift, drag, pitching moment)',
        'Boundary layers, Reynolds number and stall',
        'Induced drag and the drag polar',
        'Forces in straight, climbing and turning flight',
      ],
      typicalScope: null,
      keyIdeas: [
        'The drag equation with free-molecular C_D',
        'Aircraft get damping and stiffness from the air; spacecraft must supply them',
      ] },
    { id: 'aero-2', name: 'Aerodynamics Part II', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with an extended lecture set on the aerodynamics of flight.',
      typical: [
        'Manoeuvring flight',
        'Static and dynamic stability',
        'Control surfaces and trim',
        'Dynamic modes (short period, phugoid, Dutch roll)',
        'Aircraft rigid-body moment equations and Euler-angle kinematics',
        'High-speed flight',
        'Spins and centre-of-gravity effects',
      ],
      typicalScope: null,
      keyIdeas: [
        "Aircraft moment equations reduce to Euler's equations",
        'Gimbal lock in Euler-angle kinematics',
        'Handling qualities as (ζ, ωn) targets',
      ] },
    { id: 'rotary-wing', name: 'Rotary Wing Operations', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with helicopter handbook and flight-manual material.',
      typical: [
        'Rotor aerodynamics and momentum theory',
        'Hover and ground effect',
        'Gyroscopic precession and the 90° phase lag',
        'Torque reaction and anti-torque',
        'Autorotation, retreating-blade stall and vortex ring state',
        'Weight and balance',
        'Helicopter operations',
      ],
      typicalScope: null,
      keyIdeas: [
        'Torque reaction: the reaction-wheel principle',
        'Gyroscopic precession',
        'Autorotation as a rehearsed safe state',
      ] },
    { id: 'flight-proc-1', name: 'Flight Procedures I', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Standard operating procedures and normal checklists',
        'Circuit, departure and arrival procedures',
        'Radio phraseology',
        'Emergency procedures and memory items',
        'Threat-and-error-management briefings',
      ],
      typicalScope: null,
      keyIdeas: [
        'Checklists as Boolean guards',
        'Memory items before checklists',
        'Phases with entry and exit criteria',
      ] },
    { id: 'light-aircraft', name: 'Light Aircraft Systems', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline, supported by general pilot-theory and instrument-flying reference material.',
      typical: [
        'Piston engines, propellers and fuel systems',
        'Electrical systems',
        'Pitot-static instruments and their errors',
        'Gyroscopic instruments (rigidity, precession, attitude and heading indicators, turn coordinator)',
        'Magnetic compass',
        'System failures and partial-panel flying',
      ],
      typicalScope: null,
      keyIdeas: [
        'Gyro instruments: rigidity in space and precession',
        'The attitude indicator as a mechanical complementary filter',
        'Partial-panel flying as degraded-mode operation',
      ] },
    { id: 'navigation', name: 'Navigation', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'The Earth, charts and projections',
        'True, magnetic and compass directions',
        'Time, speed and distance and the wind triangle',
        'Dead reckoning and the 1-in-60 rule',
        'Flight planning, fuel, critical point and point of no return',
      ],
      typicalScope: null,
      keyIdeas: [
        'Dead reckoning drifts until a fix',
        'The 1-in-60 rule as a small-angle approximation',
        'Frame bookkeeping for headings',
      ] },
    { id: 'nav-systems', name: 'Navigational Systems', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Radio navigation aids and their errors',
        'GNSS principles, error budgets and integrity monitoring',
        'Inertial navigation (gyros, accelerometers, strapdown attitude update, error growth)',
        'AHRS and integrated GNSS/INS with Kalman filtering',
        'Flight management, autopilot and surveillance',
      ],
      typicalScope: null,
      keyIdeas: [
        'The strapdown attitude update with renormalisation',
        'Gyro error models and Kalman-filtered GNSS/INS',
      ] },
    { id: 'rpas', name: 'Remotely Piloted Aircraft Systems', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with chart and multirotor reference material and remote-pilot licence theory.',
      typical: [
        'RPAS components and command-and-control links',
        'Multirotor and fixed-wing principles',
        'Flight controllers and sensor fusion',
        'Brushless motors, ESCs and batteries',
        'Failsafes and geofencing',
        'Regulation',
        'Operational risk assessment and mission planning',
      ],
      typicalScope: null,
      keyIdeas: [
        'Cascaded angle and rate loops with anti-windup',
        'Failsafe state machines with timers',
        'BLDC motors and reaction torque for yaw',
      ] },
    { id: 'av-perf-1', name: 'Aircraft Performance and Planning I', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with take-off and landing performance material.',
      typical: [
        'Weight and balance and the CG envelope',
        'Take-off and landing performance charts and corrections',
        'Climb, cruise, range and endurance',
        'Fuel planning and reserves',
        'Flight planning',
      ],
      typicalScope: null,
      keyIdeas: [
        'Requirement plus margin from performance charts',
        'Fuel reserves as a momentum budget',
      ] },
    { id: 'av-perf-2', name: 'Aircraft Performance and Planning II', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with modules on transport-category take-off, en-route and landing performance, aeroplane loading, cruise, planning requirements, normal and abnormal operations (critical point, point of no return) and extended-diversion planning.',
      typical: [
        'V-speeds and balanced field length',
        'One-engine-inoperative climb and drift-down',
        'Landing distance factors and load sheets',
        'Cruise schedules, fuel policy and alternates',
        'Critical point and point of no return',
      ],
      typicalScope: null,
      keyIdeas: [
        'V1 and the point of no return as decision thresholds',
        'Certification against the worst credible case',
      ] },
    { id: 'airspace-atm', name: 'Airspace and Air Traffic Management', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only (airspace, air traffic management and CNS).',
      typical: [
        'Airspace classes and air traffic management',
        'CNS/ATM systems (communications, navigation, surveillance)',
        'Aerodrome planning and obstacle surfaces',
        'Instrument procedure design basics',
        'Separation standards and capacity',
      ],
      typicalScope: null,
      keyIdeas: [
        'CNS layering for command, determination and monitoring',
        'Contact windows decide how quickly operators see a safe-mode entry',
      ] },
    { id: 'intro-aviation', name: 'Introduction to Aviation', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'History of aviation',
        'Structure of the aviation industry',
        'International bodies and national regulators',
        'Aircraft categories and principles of flight',
        'Airspace basics',
        'Academic writing',
      ],
      typicalScope: null,
      keyIdeas: [
        'Regulatory flow-down as requirement flow-down',
        'From gyro autopilots to spacecraft attitude control',
      ] },
    { id: 'aviation-law', name: 'Aviation Law', discipline: 'av', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with lecture modules, workshops and tutorials.',
      typical: [
        'The Chicago Convention, ICAO and Standards and Recommended Practices',
        'Freedoms of the air and bilateral agreements',
        'National legislation, licensing, airworthiness and operator certification',
        'Carrier and surface-damage liability',
        'Security conventions',
        'Accident investigation',
        'RPAS regulation',
      ],
      typicalScope: null,
      keyIdeas: [
        'Convention → national rule → procedure as flow-down',
        'Space-law liability and debris mitigation',
      ] },
    // ---- Management & Human Factors (8)
    { id: 'pm-principles', name: 'Project Management Principles', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Project life cycle, governance and charter',
        'Scope and work breakdown structure',
        'Scheduling (networks, critical path, Gantt, PERT)',
        'Cost management and earned value',
        'Risk management and the risk register',
        'Quality, stakeholders and communication',
        'Agile vs waterfall',
        'Change control and lessons learned',
      ],
      typicalScope: null,
      keyIdeas: [
        'Risk registers scored by likelihood × impact',
        'Work breakdown, critical path and PERT',
        'Scope management and lessons learned',
      ] },
    { id: 'hf-pilots', name: 'Human Factors for Pilots', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with an extensive human-factors resource kit and accident case material.',
      typical: [
        'The SHELL model and the Swiss-cheese model',
        'Threat and error management and error types',
        'Situational awareness, workload and decision-making',
        'Communication and crew resource management',
        'Fatigue, stress, vision and spatial disorientation',
        'Automation and mode awareness',
      ],
      typicalScope: null,
      keyIdeas: [
        'Swiss-cheese layers of defence',
        'Mode confusion and mode annunciation',
        'Threat and error management',
      ] },
    { id: 'av-hf', name: 'Aviation Human Factors', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Human–automation interaction (levels of automation, trust, complacency)',
        'HFACS',
        'Just culture and reporting systems',
        'Fatigue risk management and line operations safety audits',
        'Human-centred design and resilience engineering',
      ],
      typicalScope: null,
      keyIdeas: [
        'Levels of automation for the return to NOMINAL',
        'Just culture and HFACS',
      ] },
    { id: 'av-medicine', name: 'Aviation Medicine', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with respiratory-physiology reference material.',
      typical: [
        'Respiratory and circulatory physiology',
        'Gas laws applied to the body (hypoxia, trapped gas, decompression)',
        'The vestibular system and spatial disorientation',
        'Vision, acceleration effects, noise and vibration',
        'Fatigue, circadian rhythm and fitness to fly',
      ],
      typicalScope: null,
      keyIdeas: [
        'The vestibular system as a biological IMU',
        'Disorientation recovery: rates first, then attitude',
      ] },
    { id: 'safety-mgmt', name: 'Safety Management', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline with weekly lecture material.',
      typical: [
        'Safety management systems and their four components',
        'Hazard identification and risk matrices (ALARP)',
        'Safety performance indicators and management of change',
        'Bow-tie analysis, FMEA and fault trees',
        'Just culture, reporting, safety cases and investigation',
      ],
      typicalScope: null,
      keyIdeas: [
        'Bow-tie analysis with preventive and recovery barriers',
        'Risk matrices with residual risk',
        'Reporting and just culture',
      ] },
    { id: 'av-mgmt', name: 'Aviation Management', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Airline business models',
        'Strategy tools (SWOT, PESTLE, five forces)',
        'Airline economics (unit costs, yield, load factor)',
        'Fleet and network planning, alliances and airports',
        'Stakeholders, sustainability, change and crisis management',
      ],
      typicalScope: null,
      keyIdeas: [
        'Weighted-criteria trade studies',
        'Cost–capability trade-offs and stakeholders',
      ] },
    { id: 'sci-comm', name: 'Scientific Communication', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only.',
      typical: [
        'Scientific and technical writing',
        'Report structure (introduction, method, results, discussion)',
        'Academic register, paraphrasing, summarising and citation',
        'Describing data and writing figure captions',
        'Oral presentation and writing for audiences',
      ],
      typicalScope: null,
      keyIdeas: [
        'Singular, unambiguous, verifiable "shall" statements',
        'Clear technical writing about results',
      ] },
    { id: 'intl-relations', name: 'International Relations', discipline: 'mhf', kind: 'subject', evidence: 'outline',
      covered: 'Subject outline only (theories of international relations and international organisations).',
      typical: [
        'Realism, liberalism and constructivism',
        'Sovereignty and the state system',
        'International organisations including the UN Security Council',
        'Diplomacy and negotiation',
        'International law, cooperation and security',
      ],
      typicalScope: null,
      keyIdeas: [
        'UN-based governance of space and spectrum',
        'Debris as a shared-resource problem',
      ] },
  ];

  /* ------------------------------------------------------------------ modules (13) */

  data.modules = [
    {
      id: 'm01', num: 1, slug: 'm01-requirements.html',
      title: 'Requirements and systems engineering', short: 'Requirements',
      phase: 'Define', minutes: 20, extension: false, prereqs: [],
      summary: 'Turn the mission need into five measurable requirements, classify each as safety or liveness, and trace every one to a test.',
      objectives: [
        'Turn a vague need into measurable "shall" requirements.',
        'Classify requirements as safety or liveness and pick the matching check.',
        'Read and extend a requirement→test traceability matrix.',
        'Use margins (n = capability/demand) and derive child requirements.',
        'Treat requirements as constraints on design parameters.',
      ],
      sections: [
        { id: 'need', title: 'From mission need to "shall"' },
        { id: 'table', title: 'The five requirements' },
        { id: 'assumptions', title: 'Assumptions and scope' },
        { id: 'classes', title: 'Safety vs liveness' },
        { id: 'trace', title: 'Traceability' },
        { id: 'margins', title: 'Margins and derived requirements' },
        { id: 'constraints', title: 'Requirements as constraints' },
        { id: 'peas', title: 'Performance measure first (PEAS)' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W1.1', title: 'Requirement linter', core: true, anchor: 'w-linter' },
        { id: 'W1.2', title: 'Traceability matrix', core: true, anchor: 'w-trace' },
        { id: 'W1.3', title: 'Requirements → constraints (generalised AC-3)', core: true },
        { id: 'W1.4', title: 'PEAS sorter', core: false },
      ],
      simLinks: [
        { label: 'T01 PID nominal', hash: 'preset=T01' },
        { label: 'T02 LQR nominal', hash: 'preset=T02' },
        { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' },
        { label: 'Monte Carlo: 60 trials, seed 42', hash: 'mc=60,42' },
      ],
    },
    {
      id: 'm02', num: 2, slug: 'm02-architecture.html',
      title: 'System architecture and modes', short: 'Architecture',
      phase: 'Define', minutes: 20, extension: false, prereqs: ['m01'],
      summary: 'Draw the closed loop, see how the mode manager selects one of three control laws, and order one simulation step correctly.',
      objectives: [
        'Draw the closed loop and name every signal.',
        'Explain how three modes select three control laws.',
        'Order one simulation step correctly as a DAG.',
        'Explain layer replacement (SIL → PIL → HIL) and "one specification, several implementations".',
      ],
      sections: [
        { id: 'loop', title: 'The closed loop' },
        { id: 'blocks', title: 'Block by block' },
        { id: 'modes', title: 'Three modes, three controllers' },
        { id: 'dataflow', title: 'One time step as a DAG' },
        { id: 'interfaces', title: 'Interfaces and layering' },
        { id: 'agent', title: 'One specification, several programs' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W2.1', title: 'Live block diagram with signal probes', core: true },
        { id: 'W2.2', title: 'Execution-order puzzle', core: true },
        { id: 'W2.3', title: 'Swap the layer', core: true },
        { id: 'W2.4', title: 'Mode cards', core: false },
      ],
      simLinks: [
        { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' },
        { label: 'FAULT fault-triggered entry', hash: 'preset=FAULT' },
      ],
    },
    {
      id: 'm03', num: 3, slug: 'm03-dynamics.html',
      title: 'Dynamics, quaternions and the environment', short: 'Dynamics',
      phase: 'Model', minutes: 35, extension: false, prereqs: ['m02'],
      summary: "Model the spacecraft as a rigid body with Euler's equation and quaternions, and size the disturbance torques it must reject.",
      objectives: [
        "Derive Euler's rotational equation from τ = dH/dt.",
        'Size the gyroscopic term.',
        "Predict intermediate-axis instability for the project's J.",
        'Build, compose and invert quaternions, and convert them to a DCM and to 3-2-1 Euler angles.',
        'Compute the shortest-rotation error.',
        'Estimate environmental disturbance torques against the ±2e-5 N m bound.',
      ],
      sections: [
        { id: 'rigid-body', title: 'Rigid body and inertia' },
        { id: 'euler', title: "Euler's equation" },
        { id: 'gyro', title: 'The gyroscopic term' },
        { id: 'intermediate', title: 'Intermediate-axis theorem' },
        { id: 'rotations', title: 'Representing attitude' },
        { id: 'quaternions', title: 'Quaternion algebra' },
        { id: 'error', title: 'Attitude error and the shortest rotation' },
        { id: 'dcm', title: 'Quaternion → DCM' },
        { id: 'environment', title: 'Where the disturbance comes from' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W3.1', title: 'Gyroscopic coupling explorer', core: true },
        { id: 'W3.2', title: 'Tennis-racket lab', core: true },
        { id: 'W3.3', title: 'Quaternion builder', core: true },
        { id: 'W3.4', title: 'Gimbal-lock explorer', core: true },
        { id: 'W3.5', title: 'Disturbance-torque estimator', core: true },
        { id: 'W3.6', title: 'Build-a-box inertia', core: false },
      ],
      simLinks: [
        { label: 'SPINX torque-free spin about x', hash: 'preset=SPINX' },
        { label: 'SPINY torque-free spin about y', hash: 'preset=SPINY' },
        { label: 'SPINZ torque-free spin about z', hash: 'preset=SPINZ' },
        { label: 'HIGHRATE high-rate upset', hash: 'preset=HIGHRATE' },
      ],
    },
    {
      id: 'm04', num: 4, slug: 'm04-integration.html',
      title: 'Numerical integration', short: 'Integration',
      phase: 'Model', minutes: 25, extension: false, prereqs: ['m03'],
      summary: 'Integrate the attitude equations with RK4, see why forward Euler inflates |q|, and avoid step-size and floating-point traps.',
      objectives: [
        'Write the state ODE and one RK4 step.',
        'Explain why forward Euler inflates |q| and why the project renormalises.',
        'Measure the order of accuracy from error ratios.',
        'Choose a stable step size.',
        'Avoid floating-point traps in thresholds, timers and error angles.',
      ],
      sections: [
        { id: 'ode', title: 'The state and its ODE' },
        { id: 'euler-method', title: 'Forward Euler' },
        { id: 'rk4', title: 'RK4 and Simpson' },
        { id: 'norm', title: 'Why |q| drifts and renormalisation' },
        { id: 'order', title: 'Order of accuracy' },
        { id: 'stability', title: 'Step size and stability' },
        { id: 'float', title: 'Floating point and timers' },
        { id: 'events', title: 'Locating a threshold crossing' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W4.1', title: 'Euler vs RK4 vs exact', core: true },
        { id: 'W4.2', title: 'Order-of-accuracy detective', core: true },
        { id: 'W4.3', title: 'Stability region', core: true },
        { id: 'W4.4', title: 'Float precision lab', core: true },
        { id: 'W4.5', title: 'Event location by bisection', core: false },
      ],
      simLinks: [
        { label: 'SPINX with RK4 (project integrator)', hash: 'preset=SPINX' },
        { label: 'SPINX with forward Euler', hash: 'preset=SPINX&method=euler' },
      ],
    },
    {
      id: 'm05', num: 5, slug: 'm05-control.html',
      title: 'Control design', short: 'Control',
      phase: 'Design', minutes: 40, extension: false, prereqs: ['m03', 'm04'],
      summary: "Design detumble, PID and LQR controllers for a torque-limited double integrator and compare them on the project's criteria.",
      objectives: [
        'Model each axis as a double integrator.',
        'Prove that detumble removes energy.',
        'Choose PD gains from ωn and ζ.',
        'Explain integral action, steady error and windup.',
        'Compute LQR gains from Q and R in closed form and as value iteration.',
        'Explain why saturation limits the linear analysis.',
        'Compare controllers against weighted criteria.',
      ],
      sections: [
        { id: 'plant', title: 'The plant' },
        { id: 'detumble', title: 'Detumble' },
        { id: 'pd', title: 'Stiffness and damping' },
        { id: 'pid', title: 'Integral action and windup' },
        { id: 'quaternion-pid', title: 'The quaternion-error PID' },
        { id: 'lqr', title: 'LQR' },
        { id: 'bellman', title: 'LQR as dynamic programming' },
        { id: 'saturation', title: 'When linear analysis stops' },
        { id: 'compare', title: 'Comparing controllers' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W5.1', title: 'Single-axis step-response lab', core: true },
        { id: 'W5.2', title: 'Pole viewer', core: true },
        { id: 'W5.3', title: 'Windup demo', core: true },
        { id: 'W5.4', title: 'LQR tuner and Bellman sweep', core: true },
        { id: 'W5.5', title: 'Controller decision matrix', core: true },
        { id: 'W5.6', title: 'Energy during a detumble', core: false },
      ],
      simLinks: [
        { label: 'T01 PID nominal', hash: 'preset=T01' },
        { label: 'T02 LQR nominal', hash: 'preset=T02' },
        { label: 'LQRSAFE LQR with safe mode on', hash: 'preset=LQRSAFE' },
      ],
    },
    {
      id: 'm06', num: 6, slug: 'm06-actuators.html',
      title: 'Actuators: reaction wheels, motors and power', short: 'Actuators',
      phase: 'Design', minutes: 30, extension: false, prereqs: ['m05'],
      summary: 'Turn the ±3 mN m torque limit into reaction-wheel physics: momentum exchange, motor limits, momentum budgets and saturation.',
      objectives: [
        'Explain momentum exchange and why wheel torque is a reaction.',
        'Interpret the ±3 mN m box physically (current limit, back-EMF).',
        "Size a wheel's momentum budget and time to saturation.",
        'Compare clipping and direction-preserving scaling.',
        'Name the main non-idealities (friction, imbalance, misalignment) and hardware limits.',
      ],
      sections: [
        { id: 'reaction', title: 'Reaction torque and momentum exchange' },
        { id: 'limit', title: 'The ±3 mN m box' },
        { id: 'motor', title: 'Inside the wheel motor' },
        { id: 'momentum', title: 'Momentum budget and unloading' },
        { id: 'allocation', title: 'Clipping vs scaling' },
        { id: 'friction', title: 'Non-idealities' },
        { id: 'hardware', title: 'Hardware extension' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W6.1', title: 'Torque-reaction turntable', core: true },
        { id: 'W6.2', title: 'Wheel torque envelope', core: true },
        { id: 'W6.3', title: 'Momentum bucket', core: true },
        { id: 'W6.4', title: 'Clip vs scale', core: true },
        { id: 'W6.5', title: 'Stribeck zero-crossing', core: false },
      ],
      simLinks: [
        { label: 'HIGHRATE with per-axis clipping', hash: 'preset=HIGHRATE' },
        { label: 'HIGHRATE with direction-preserving scaling (site option)', hash: 'preset=HIGHRATE&sat=scale' },
      ],
    },
    {
      id: 'm07', num: 7, slug: 'm07-sensors.html',
      title: 'Sensors and estimation', short: 'Sensors',
      phase: 'Design', minutes: 35, extension: true, prereqs: ['m03', 'm05'],
      summary: 'Extension: replace the true state with a gyro and a star tracker, and estimate attitude with complementary and Kalman-style filters.',
      objectives: [
        'Model a rate gyro (bias plus noise) and an absolute attitude sensor.',
        'Explain dead-reckoning drift.',
        'Build a complementary filter.',
        "Derive the Kalman predict/update steps from Bayes' rule.",
        'Run a per-axis Kalman-style attitude filter in the full simulation.',
        'See how noise interacts with safe-mode thresholds.',
      ],
      sections: [
        { id: 'why', title: 'Why estimate?' },
        { id: 'gyros', title: 'Rate gyros' },
        { id: 'absolute', title: 'Absolute sensors' },
        { id: 'dead-reckoning', title: 'Dead reckoning and drift' },
        { id: 'complementary', title: 'Complementary filter' },
        { id: 'bayes', title: "From Bayes' rule to the Kalman filter" },
        { id: 'kalman', title: 'A Kalman-style attitude filter' },
        { id: 'thresholds', title: 'Noise meets thresholds' },
        { id: 'fdir', title: 'Residuals and fault detection' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W7.1', title: 'Gyro-only drift', core: true },
        { id: 'W7.2', title: 'One-axis Kalman playground', core: true },
        { id: 'W7.3', title: 'Full-simulation extension', core: true },
        { id: 'W7.4', title: 'Fault-alarm base rate', core: true },
        { id: 'W7.5', title: 'Sensor fusion à la vestibular system', core: false },
      ],
      simLinks: [
        { label: 'ESTKF Kalman-style estimator (extension)', hash: 'preset=ESTKF' },
        { label: 'ESTNOISY high-noise lock-up (extension)', hash: 'preset=ESTNOISY' },
        { label: 'T03 with a complementary filter (extension)', hash: 'preset=T03&sens=complementary' },
      ],
    },
    {
      id: 'm08', num: 8, slug: 'm08-safe-mode.html',
      title: 'Safe-mode logic and formal reasoning', short: 'Safe mode',
      phase: 'Protect', minutes: 35, extension: false, prereqs: ['m02', 'm05'],
      summary: 'Specify the three-mode safe-mode machine exactly, then check its guards, hysteresis and forbidden transitions with formal reasoning.',
      objectives: [
        'State the three modes, their guards and timers exactly.',
        'Explain hysteresis and dwell as anti-flapping.',
        'Express the forbidden transitions as invariants and check them exhaustively.',
        'Monitor a mode log with a DFA.',
        'Find the specification gap.',
        'Relate the fault flag to fault detection.',
      ],
      sections: [
        { id: 'why', title: 'Why a safe mode' },
        { id: 'modes', title: 'The three modes' },
        { id: 'guards', title: 'Guards, timers and the transition table' },
        { id: 'hysteresis', title: 'Hysteresis and anti-flapping' },
        { id: 'forbidden', title: 'Forbidden transitions as invariants' },
        { id: 'checking', title: 'Proving vs finding' },
        { id: 'monitor', title: 'A run-time monitor' },
        { id: 'gap', title: 'A specification gap' },
        { id: 'faults', title: 'Where the fault flag comes from' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W8.1', title: 'Live state machine', core: true },
        { id: 'W8.2', title: 'Hysteresis vs chatter', core: true },
        { id: 'W8.3', title: 'Transition-relation matrix', core: true },
        { id: 'W8.4', title: 'Prove vs find', core: true },
        { id: 'W8.5', title: 'Mode-trace monitor', core: true },
        { id: 'W8.6', title: 'Mode logic as a rule engine', core: false },
      ],
      simLinks: [
        { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' },
        { label: 'FAULT fault-triggered entry', hash: 'preset=FAULT' },
        { label: 'T03 with the spec gap closed (site option)', hash: 'preset=T03&gap=1' },
      ],
    },
    {
      id: 'm09', num: 9, slug: 'm09-verification.html',
      title: 'Verification and Monte Carlo statistics', short: 'Verification',
      phase: 'Prove', minutes: 35, extension: false, prereqs: ['m01', 'm08'],
      summary: 'Run the T01–T06 test matrix and a seeded Monte Carlo campaign, and work out what 60 passes in 60 trials can and cannot prove.',
      objectives: [
        'Run the T01–T06 test matrix and trace it to requirements.',
        'Compute settling time, effort and margins from logs.',
        'Run a seeded Monte Carlo campaign and interpret its histogram.',
        'Compute what 60/60 proves (Clopper–Pearson).',
        'Spot sampling bias and tuning leakage.',
        'Explain what sampling can and cannot show.',
      ],
      sections: [
        { id: 'matrix', title: 'The test matrix' },
        { id: 'metrics', title: 'Metrics from logs' },
        { id: 'mc', title: 'The Monte Carlo campaign' },
        { id: 'sampling', title: 'Sampling the initial conditions' },
        { id: 'confidence', title: 'What 60/60 proves' },
        { id: 'worst', title: 'Worst cases and margins' },
        { id: 'discipline', title: 'Seeds, reproducibility and leakage' },
        { id: 'proof-vs-sampling', title: 'What sampling can and cannot show' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W9.1', title: 'Test-matrix runner', core: true },
        { id: 'W9.2', title: 'Mini Monte Carlo', core: true },
        { id: 'W9.3', title: 'What does n/k prove?', core: true },
        { id: 'W9.4', title: 'Sampling bias', core: true },
        { id: 'W9.5', title: 'Choosing a metric that can tell designs apart', core: false },
      ],
      simLinks: [
        { label: 'Monte Carlo: 60 trials, seed 42', hash: 'mc=60,42' },
      ],
    },
    {
      id: 'm10', num: 10, slug: 'm10-software.html',
      title: 'Software engineering and embedded code', short: 'Software',
      phase: 'Build', minutes: 30, extension: false, prereqs: ['m02', 'm04'],
      summary: 'Structure the controller as embedded-style code that meets hard deadlines, avoids number and concurrency traps, and is tested several ways.',
      objectives: [
        'Structure controller code behind one interface with a table-driven mode manager.',
        'Meet a hard real-time deadline (scheduling, WCET, no heap, no recursion).',
        'Avoid number-representation and concurrency traps.',
        'Test with property tests, regression baselines and cross-implementation validation.',
      ],
      sections: [
        { id: 'three-implementations', title: 'One specification, several programs' },
        { id: 'structure', title: 'Controller interface and mode manager' },
        { id: 'loop', title: 'The real-time loop' },
        { id: 'memory', title: 'No heap, no recursion, fixed buffers' },
        { id: 'numbers', title: 'Units, word sizes and fixed point' },
        { id: 'concurrency', title: 'Shared state: the torn quaternion' },
        { id: 'testing', title: 'Testing' },
        { id: 'reproducibility', title: 'Reproducibility and tool independence' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W10.1', title: 'Deadline budget', core: true },
        { id: 'W10.2', title: 'Torn quaternion', core: true },
        { id: 'W10.3', title: 'Unit-test the helpers', core: true },
        { id: 'W10.4', title: 'Gain-matrix porting bug', core: true },
        { id: 'W10.5', title: 'Mode-sequence diff', core: false },
      ],
      simLinks: [
        { label: 'T03, then Download CSV to see the logging format', hash: 'preset=T03' },
      ],
    },
    {
      id: 'm11', num: 11, slug: 'm11-visualisation.html',
      title: 'Visualisation and UI', short: 'Visualisation',
      phase: 'Build', minutes: 20, extension: false, prereqs: ['m03', 'm10'],
      summary: 'Follow a quaternion to pixels, interpolate attitude for playback, and design plots and mode annunciation that check requirements at a glance.',
      objectives: [
        'Follow a quaternion all the way to pixels.',
        'Interpolate attitude for playback.',
        'Design plots that check requirements at a glance.',
        'Separate model and views.',
        'Design mode annunciation that prevents confusion.',
      ],
      sections: [
        { id: 'animation', title: 'From quaternion to pixels' },
        { id: 'frames', title: 'Inertial vs body frames on screen' },
        { id: 'plots', title: 'Plots that check requirements' },
        { id: 'playback', title: 'Time, interpolation and binary search' },
        { id: 'mvc', title: 'One model, many views' },
        { id: 'annunciation', title: 'Mode annunciation' },
        { id: 'performance', title: 'Performance budget' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W11.1', title: 'Quaternion-to-pixels pipeline', core: true },
        { id: 'W11.2', title: 'Playback interpolation', core: true },
        { id: 'W11.3', title: 'Annunciator design lab', core: true },
        { id: 'W11.4', title: 'One model, many views', core: false },
        { id: 'W11.5', title: 'Anatomy of a requirement plot', core: false },
      ],
      simLinks: [
        { label: 'The simulator with T03: playback, plots and annunciator', hash: 'preset=T03' },
      ],
    },
    {
      id: 'm12', num: 12, slug: 'm12-project-risk.html',
      title: 'Project management and risk', short: 'Project & risk',
      phase: 'Run', minutes: 20, extension: false, prereqs: ['m01'],
      summary: 'Read the project as a work breakdown with six iterations, schedule it, and score its risks with a register, an FMEA and a bow-tie.',
      objectives: [
        'Read the project as a WBS with iterations.',
        'Compute a critical path and PERT estimates.',
        'Score and mitigate risks (L × I, FMEA RPN).',
        'Draw a bow-tie for loss of attitude control.',
        "Turn the log's lessons into practice.",
      ],
      sections: [
        { id: 'wbs', title: 'Work breakdown and the iteration log' },
        { id: 'schedule', title: 'Dependencies and the critical path' },
        { id: 'risk', title: 'The risk register' },
        { id: 'fmea', title: 'FMEA' },
        { id: 'bowtie', title: 'Bow-tie: loss of attitude control' },
        { id: 'lessons', title: 'Lessons from the log' },
        { id: 'scope', title: 'Scope decisions' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W12.1', title: 'Interactive risk matrix', core: true },
        { id: 'W12.2', title: 'Critical path and PERT', core: true },
        { id: 'W12.3', title: 'FMEA builder', core: true },
        { id: 'W12.4', title: 'Bow-tie builder', core: false },
      ],
      simLinks: [],
    },
    {
      id: 'm13', num: 13, slug: 'm13-operations.html',
      title: 'Operations, human factors and safety culture', short: 'Operations',
      phase: 'Run', minutes: 25, extension: false, prereqs: ['m08', 'm12'],
      summary: 'Operate the spacecraft safely: layered defences, automation levels, the ground link, resets, alarms, learning controllers and the legal context.',
      objectives: [
        'Explain layered defences.',
        'Choose an automation level for leaving safe mode.',
        'Budget the ground link.',
        'Keep the mode across resets.',
        'Tune alarms against fatigue.',
        'Recognise when learning controllers need a shield.',
        'Place the mission in its legal and shared-orbit context.',
      ],
      sections: [
        { id: 'layers', title: 'Layers of defence' },
        { id: 'automation', title: 'Levels of automation' },
        { id: 'annunciation', title: 'Mode awareness for operators' },
        { id: 'ground-link', title: 'Commanding across the gap' },
        { id: 'persistence', title: 'Surviving resets' },
        { id: 'monitoring', title: 'Alarms' },
        { id: 'learning', title: 'Learning controllers and shields' },
        { id: 'context', title: 'Mission context' },
        { id: 'culture', title: 'Safety culture' },
        { id: 'further-reading', title: 'Further reading' },
      ],
      widgets: [
        { id: 'W13.1', title: 'Swiss-cheese stack', core: true },
        { id: 'W13.2', title: 'Automation level', core: true },
        { id: 'W13.3', title: 'Commanding across the gap', core: true },
        { id: 'W13.4', title: 'Reboot into the right mode', core: true },
        { id: 'W13.5', title: 'Alarm fatigue', core: false },
      ],
      simLinks: [
        { label: 'FAULT fault-triggered entry', hash: 'preset=FAULT' },
        { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' },
      ],
    },
  ];

  /* ------------------------------------------------------------------ mappings (280) */

  // Per module: [course, strength S/M/W, tag D/A/E, section anchor, concept].
  const STRENGTH_CODE = { S: 'strong', M: 'moderate', W: 'weak' };
  const TAG_CODE = { D: 'direct', A: 'analogy', E: 'extension' };
  const MAPPING_TABLE = {
    m01: [
      ['mech-design', 'S', 'D', 'need', 'Measurable "shall" specifications with a target value and test method; needs → specifications → tests mapping (QFD) as the model for the traceability matrix'],
      ['design-practice', 'M', 'D', 'assumptions', "Problem definition with explicit constraints and assumptions, mirrored by the project's assumption list"],
      ['sci-comm', 'M', 'D', 'need', 'Technical-writing rules for requirements: singular, unambiguous, verifiable, using "shall"; REQ-F1 critiqued for its missing time bound'],
      ['discrete', 'S', 'D', 'classes', 'Safety ("always", refuted by a finite log) vs bounded liveness ("eventually, within 60 s") decides max-over-log vs time-to-threshold checks'],
      ['logic-ar', 'S', 'D', 'classes', 'Temporal-logic formalisation: S1 = G(|ω| ≤ 15 deg/s), F1 = G(enterSafe → F |ω| < 0.5), L1 as a bounded probabilistic property'],
      ['intel-sys', 'S', 'D', 'constraints', 'PEAS (performance measure first) and requirements as CSP constraints on design parameters, pruned by AC-3 with a requirement tag on each pruned value'],
      ['software-projects', 'M', 'D', 'trace', 'User stories with acceptance criteria; pytest markers carrying requirement IDs make traceability machine-readable'],
      ['comp-algorithms', 'M', 'D', 'trace', 'Requirements and tests as a bipartite graph; coverage means every requirement vertex has degree ≥ 1; hash lookup by requirement ID'],
      ['data-structures', 'M', 'D', 'trace', 'The verification matrix as an incidence matrix; T03 as a hyperedge verifying {F1, S1, S2} together; derived requirements form a DAG'],
      ['db-os', 'S', 'D', 'trace', 'Traceability as an inverted index: requirement → postings; "covers S1 and F1" is a postings intersection; an empty postings list is the silent gap'],
      ['ai-methods', 'M', 'D', 'trace', 'Traceability as a knowledge graph of triples; a missing triple is not a failing check, so coverage needs an explicit closed-world query'],
      ['business-is', 'M', 'D', 'trace', 'Requirements ⋈ Tests ⋈ Results as relational tables with keys proves every requirement has a test and every test a result'],
      ['machine-elements', 'M', 'D', 'margins', 'Margin n = strength/stress generalised to capability/demand; reliability allocation R_i = R_sys^(1/k); design factor with a stated rationale'],
      ['electromech', 'M', 'D', 'margins', 'Derived wheel-motor requirements from REQ-S2: k_M·I_lim ≥ 3 mN m, V_bus ≥ k_e·ω_max + I_lim·R, and a continuous I²R thermal limit'],
      ['aviation-law', 'M', 'D', 'need', 'The hierarchy convention → national rule → operator procedure as a model of requirement flow-down and traceability'],
      ['av-perf-2', 'M', 'D', 'margins', 'Certification against the worst credible single failure; time-limited degraded-mode rules (ETOPS) as the pattern behind REQ-L1'],
      ['aero-2', 'M', 'D', 'classes', 'Handling-quality criteria as bounds on modal parameters (ζ, ωn): the aircraft equivalent of REQ-F2 and the settling-time metric'],
      ['av-perf-1', 'M', 'D', 'margins', 'Performance charts with corrections and margins: "requirement + margin" thinking'],
      ['pm-principles', 'M', 'D', 'assumptions', 'Scope management: declaring sensors and estimation out of scope prevents scope creep and makes them a planned extension'],
      ['intro-aviation', 'W', 'D', 'need', 'Regulatory structure (standards → national rules → procedures) as requirement flow-down'],
      ['av-mgmt', 'W', 'D', 'margins', 'Cost–capability trade-offs: a larger torque limit detumbles faster but costs mass and power'],
      ['mat-manuf', 'W', 'D', 'trace', 'Inspection and non-destructive testing parallel verification by test: both prove the built item meets its specification'],
      ['cyber-sec', 'W', 'E', 'need', 'Security requirements beside safety ones: authenticated mode-change telecommands that cannot bypass the SAFE_HOLD guards'],
    ],
    m02: [
      ['control-sys', 'S', 'D', 'loop', 'Closed-loop block diagrams and T(s) = CG/(1+CGH): reference → error → controller → saturation → plant → feedback; mode switching as a switched controller'],
      ['electromech', 'S', 'D', 'blocks', 'Block-diagram vocabulary (setpoint, comparator, controller, actuator, plant, sensor); comparator, summer and difference amplifier as hardware blocks; BLDC six-state commutation as a sensor-gated state machine'],
      ['intel-sys', 'S', 'D', 'agent', 'The agent loop (sensors → program → actuators) is the ADCS loop; agent function vs agent program = one specification, three implementations; state representation caps capability'],
      ['comp-algorithms', 'S', 'D', 'dataflow', 'Per-step dataflow as a DAG whose topological order is read → mode logic → controller → saturation → RK4 → renormalise; the off-by-one-step bug'],
      ['data-structures', 'S', 'D', 'dataflow', "The one-step delay breaks the feedback cycle; an algebraic loop is a cycle within one step's graph (Kahn's algorithm detects it); the run pipeline as a build DAG"],
      ['soft-eng-arch', 'S', 'D', 'interfaces', 'Controller strategy interface (dependency inversion, open/closed); composition: a Spacecraft has-a Dynamics, Actuator, Controller and ModeManager; event-driven ModeChanged bus'],
      ['oop-cpp', 'M', 'D', 'modes', 'A ModeManager class with private timers aggregating one controller object per mode, so forbidden transitions are impossible by construction'],
      ['mech-design', 'M', 'D', 'blocks', 'Functional decomposition: sense state → decide mode → compute torque → limit torque → propagate dynamics'],
      ['discrete', 'M', 'D', 'modes', 'Modes as a set and allowed transitions as a relation drawn as a directed graph; timers make it an extended state machine'],
      ['theory-comp', 'M', 'D', 'modes', 'The mode logic as a finite automaton δ(state, input); filling the whole δ table forces a decision for every pair'],
      ['comp-net-arch', 'M', 'D', 'modes', 'The three-mode machine as a Moore FSM: a 2-bit state register, comparators and counters with terminal-count outputs'],
      ['networking', 'M', 'D', 'interfaces', 'A layer can be replaced by anything that keeps its contract: the route from software-in-the-loop to hardware-in-the-loop'],
      ['rpas', 'M', 'D', 'loop', 'Cascaded attitude control (outer angle loop, inner rate loop) and failsafe mode machines in drone flight controllers'],
      ['airspace-atm', 'W', 'D', 'blocks', 'CNS layering (communications, navigation, surveillance) as a model for command/telemetry, attitude determination and health monitoring'],
      ['flight-proc-1', 'W', 'D', 'modes', 'Phases of flight as an ordered state sequence with explicit entry and exit criteria'],
      ['digital-design', 'W', 'D', 'interfaces', 'Assembly mates as kinematic constraints: a mental model for subsystem interfaces'],
      ['machine-elements', 'W', 'D', 'dataflow', 'The design chain (power → geometry → forces → shafts → bearings) as a dependency graph'],
    ],
    m03: [
      ['kin-dyn', 'S', 'D', 'euler', "Transport theorem, H = Jω, Euler's equations in principal axes, the gyroscopic term and torque-free motion with intermediate-axis instability"],
      ['intro-physics', 'S', 'D', 'euler', "τ = dL/dt in the inertial frame, rewritten in the rotating body frame, gives Euler's equation; L = Iω and the parallel-axis theorem"],
      ['aviation-science', 'S', 'D', 'intermediate', 'Conservation of angular momentum, the tennis-racket theorem and the major-axis rule; predict-then-reveal concept questions'],
      ['aero-2', 'S', 'D', 'rotations', "Aircraft moment equations reduce to Euler's equations when Ixz = 0 (inertia coupling); Euler-angle kinematics are singular at ±90° pitch; 3-2-1 Euler → quaternion"],
      ['eng-math-1', 'S', 'D', 'quaternions', 'Cross product and skew matrix [ω×]; diagonal inverse; unit complex numbers as 2-D rotations generalised to quaternions; Hamilton product from dot and cross; orthogonal matrices'],
      ['eng-math-2', 'S', 'D', 'error', 'Half-angle identities build q = [cos(α/2), n sin(α/2)]; error angle 2·atan2(|q_v|, q0); atan2/asin Euler-angle extraction; small-angle approximation'],
      ['calculus-2', 'M', 'D', 'rigid-body', 'Inertia as triple integrals (box: Ixx = m(b²+c²)/12); products of inertia vanish by symmetry'],
      ['mom-2', 'M', 'D', 'dcm', "The inertia tensor transforms like the stress tensor (J' = C J Cᵀ); Mohr's circle for inertia; principal moments as eigenvalues"],
      ['machine-elements', 'M', 'D', 'rigid-body', 'Principal stresses as eigenvalues of a symmetric tensor mirror principal axes of J; T = Iα and ½Iω² as single-axis special cases'],
      ['mom-1', 'W', 'D', 'rigid-body', 'Notation clash: J as the polar second moment of area (m⁴) vs J as the mass inertia tensor (kg m²)'],
      ['digital-design', 'M', 'D', 'rigid-body', 'CAD mass properties (mass, centre of mass, inertia tensor, principal axes) are the proper source for J'],
      ['cad-practice', 'W', 'D', 'rigid-body', 'Mass-property evaluation of parts and assemblies; parametric families of a bus giving J as a function of design changes'],
      ['intel-sys', 'M', 'D', 'error', '(q, ω) is a complete Markov state for the rigid body; q and −q as one state but two nodes, fixed by sign canonicalisation'],
      ['supervised', 'M', 'E', 'rigid-body', "Inertia identification as linear least squares on Euler's equation (linear in J), with ridge regularisation for poorly excited manoeuvres"],
      ['unsup-rl', 'M', 'D', 'dcm', 'Principal axes as PCA-style eigen-decomposition: J = R diag(J1, J2, J3) Rᵀ with R a rotation matrix (DCM)'],
      ['deep-learning', 'W', 'A', 'quaternions', 'Sinusoidal positional encodings and rotary embeddings are exact 2-D rotations; unit quaternions are the 3-D generalisation'],
      ['electromech', 'W', 'A', 'quaternions', 'Cross products F = Il×B and τ = r×F are the same operator as ω×(Jω); phasor multiplication as the 2-D precedent of quaternion composition'],
      ['navigation', 'M', 'D', 'error', 'Frame bookkeeping (true, magnetic, compass) as the 2-D version of attitude error: "where I am relative to where I want to be"'],
      ['rotary-wing', 'M', 'D', 'gyro', 'Rotor-disc precession (Ω_p = M/H): the gyroscopic term that appears once wheel momentum is included'],
      ['statics', 'M', 'D', 'environment', 'Every environmental disturbance torque has the form τ = r × F; couples; centre of mass sets the lever arms'],
      ['atmos-science', 'M', 'D', 'environment', 'Residual-atmosphere density at LEO and its exponential fall-off set the drag torque (~1e-7 N m, well under the 2e-5 N m bound)'],
      ['aero-1', 'M', 'D', 'environment', 'The drag equation with free-molecular C_D and the centre-of-pressure offset; orbit has no natural pitch damping or stiffness'],
      ['fluids', 'W', 'D', 'environment', 'Drag F = ½ρv²C_D A and centre of pressure; continuum assumptions break down in free-molecular flow; slosh breaks the rigid-body assumption'],
      ['eng-materials', 'W', 'D', 'environment', 'Ferromagnetic parts leave a residual dipole, giving τ = m × B: a realistic disturbance source'],
      ['av-meteo-1', 'W', 'A', 'environment', 'The Coriolis term 2Ω×v is the same rotating-frame operator as ω×Jω; space weather raises thermospheric density and drag'],
    ],
    m04: [
      ['calculus-2', 'S', 'D', 'rk4', "Taylor series behind RK4's O(h⁵) local and O(h⁴) global error; Euler multiplies |q| by √(1+h²|ω|²/4) per step; matrix-exponential closed-form step as a cross-check"],
      ['eng-math-2', 'S', 'D', 'rk4', "RK4 reduces to Simpson's rule when f depends only on t (the 1-2-2-1 weights); trapezoid and Simpson quadrature for logged metrics"],
      ['eng-math-1', 'M', 'D', 'norm', 'Ω(ω) is skew-symmetric, so the exact solution keeps |q| = 1: the matrix reason for renormalising'],
      ['prog-eng', 'S', 'D', 'euler-method', 'Hand-coded ODE time-stepping (Euler, Runge–Kutta) and vectorised NumPy maths; the norm-growth example as a first numerical-methods lesson'],
      ['prog-principles', 'M', 'D', 'rk4', 'Writing the RK4 loop and quaternion helpers as small, single-purpose, tested functions before vectorising'],
      ['data-structures', 'S', 'D', 'float', 'IEEE 754: renormalise with a tolerance check; acos vs atan2 precision collapse in float32; dwell timers as integer counters (801 vs 800 steps)'],
      ['algorithms', 'S', 'D', 'order', 'The doubling-ratio test identifies the order of accuracy (Euler ≈ 2, RK4 ≈ 16); cost model per trial; event location by bisection within a step'],
      ['nav-systems', 'S', 'D', 'norm', 'The strapdown attitude update integrates gyro rates with q̇ = ½Ω(ω)q and renormalises; higher-order (coning) algorithms limit commutation error'],
      ['intel-sys', 'M', 'A', 'stability', 'Gradient descent is forward Euler on the gradient flow; learning-rate stability η < 2/λ is step-size stability'],
      ['ai-methods', 'M', 'A', 'stability', 'Vanishing/exploding gradients are products of per-step Jacobians: the same spectral-radius test as discrete-time stability; the RK4 amplification polynomial'],
      ['deep-learning', 'M', 'A', 'euler-method', 'A residual block x + F(x) is one explicit-Euler step ("depth" and "time step" are the same idea)'],
      ['oop-cpp', 'M', 'D', 'rk4', 'A generic RK4 step that takes the dynamics as a lambda, reusable for the attitude model, a wheel model or an estimator'],
      ['comp-net-arch', 'M', 'D', 'float', 'Number representation: float32 machine epsilon (1.19e-7) and why renormalisation matters even more in single precision'],
      ['aviation-science', 'M', 'D', 'norm', 'Torque-free motion conserves T and |H| exactly, so their drift is a direct test of integrator accuracy'],
      ['sys-prog', 'W', 'D', 'stability', 'Fixed-step integration with bounded loops gives deterministic worst-case execution time; cross-language results agree to tolerance, not bitwise'],
      ['electromech', 'W', 'D', 'euler-method', 'The discrete integral Σe·dt and finite-difference derivative of a digital PID; exponential time constants (63% after one τ)'],
      ['machine-elements', 'W', 'D', 'order', 'Only fixed-point design loops and log-linear interpolation; ODE methods were not part of this subject'],
    ],
    m05: [
      ['control-sys', 'S', 'D', 'pd', 'The 1/(Js²) plant, root locus, PD ωn and ζ, disturbance steady error and the final value theorem, Routh–Hurwitz (Kd·Kp > J·Ki), state space u = −Kx extended to LQR'],
      ['electromech', 'S', 'D', 'pid', 'P, I and D actions; steady error under a constant load; integral windup and its fixes; derivative on measurement; step-response metrics; why Ziegler–Nichols fails on a double integrator'],
      ['intel-sys', 'S', 'D', 'bellman', 'LQR is the Bellman equation for linear dynamics and quadratic cost: value iteration = Riccati recursion, the gain = policy extraction; gain tuning as local search'],
      ['algorithms', 'S', 'D', 'bellman', 'LQR as dynamic programming (backward Riccati as tabulation filled from the horizon); gain search by bisection or golden section; random-restart baselines'],
      ['comp-algorithms', 'M', 'D', 'lqr', 'Divide and conquer: diagonal J, Q and R split the 6-state LQR into three 2-state problems with closed-form gains'],
      ['unsup-rl', 'S', 'D', 'lqr', 'LQR as the exact Bellman solution and provable-optimum baseline for learned policies; continuous bounded torque suits actor-critic methods'],
      ['ai-methods', 'M', 'D', 'compare', 'Genetic algorithm vs hill-climbing gain tuning; a tuner that "beats" LQR on LQR\'s own cost signals an evaluation bug'],
      ['deep-learning', 'M', 'A', 'pid', 'The LSTM cell as a gated integrator: anti-windup is input gating, and a leaky integrator cannot remove steady error'],
      ['kin-dyn', 'S', 'D', 'detumble', 'The work–energy argument for detumble: the gyroscopic term does no work, so dT/dt = ω·τ. Unsaturated that is −Kd|ω|² ≤ 0; under per-axis clipping each term ωᵢ·sat(−Kd ωᵢ) is still ≤ 0, apart from the small work done by the disturbance torque'],
      ['calculus-2', 'S', 'D', 'lqr', 'Jacobian linearisation (the gyroscopic term vanishes to first order at ω = 0), quadratic forms and the Lyapunov chain rule'],
      ['eng-math-2', 'S', 'D', 'lqr', 'The small-angle model θ ≈ 2q_v (0.8% error at 25°, 17% at 120°) and exponential detumble decay'],
      ['eng-math-1', 'M', 'D', 'pd', 'Closed-loop poles as complex numbers (s ≈ −0.68 ± 0.66j on the LQR x axis)'],
      ['intro-physics', 'S', 'D', 'pd', 'The damped oscillator (ωn, ζ, t_s ≈ 4/(ζωn)) reproduces the LQR ζ ≈ 0.72; minimum braking time J·ω0/τmax'],
      ['aero-1', 'M', 'A', 'pd', 'Aircraft have natural pitch damping and stiffness from airflow; in orbit Kd and Kp must supply both'],
      ['aero-2', 'M', 'A', 'pd', 'Static and dynamic stability as stiffness and damping; short-period handling qualities as a (ζ, ωn) target region'],
      ['rpas', 'S', 'D', 'quaternion-pid', 'Drone flight controllers: angle/quaternion-error PID with anti-windup and output limits in cascaded loops'],
      ['navigation', 'M', 'D', 'lqr', 'The 1-in-60 rule is the small-angle approximation the LQR model depends on'],
      ['mech-design', 'M', 'D', 'compare', 'Controller comparison criteria as a weighted decision matrix (Pugh or weighted scores)'],
      ['machine-elements', 'M', 'D', 'saturation', 'Saturation as a designed, predictable limit; backlash and friction as nonlinearities that cause limit cycling with integral action'],
      ['networking', 'M', 'A', 'saturation', 'TCP congestion control as a delayed feedback loop: AIMD as a control law; min(rwnd, cwnd) mirrors actuator saturation'],
      ['av-mgmt', 'W', 'D', 'compare', 'Weighted-criteria trade studies: weights express what the mission values'],
    ],
    m06: [
      ['electromech', 'S', 'D', 'motor', 'Torque = k_M·I; back-EMF makes the torque limit speed-dependent; speed–torque line, stall, efficiency and power curves; BLDC; four-quadrant and regenerative operation; L/R justifies the ideal torque source; magnetorquer τ = m × B'],
      ['machine-elements', 'S', 'D', 'momentum', 'Momentum exchange T = Iα on the wheel; P = Tω; KE = ½Iω²; momentum capacity and time to saturation; Stribeck friction and the zero-crossing; direct drive vs gearbox; imbalance F = Uω²'],
      ['kin-dyn', 'S', 'D', 'reaction', 'Total angular momentum H = Jω + h_w with τ_c = −ḣ_w; the ω × h_w wheel-gyroscopic term; impulse–momentum gives the per-orbit accumulation'],
      ['rotary-wing', 'S', 'D', 'reaction', 'Torque reaction (anti-torque tail rotor) is the reaction-wheel principle; loss of tail-rotor effectiveness as an actuator-authority limit'],
      ['rpas', 'S', 'D', 'motor', 'Multirotor yaw from differential rotor reaction torque; BLDC τ = K_t·i with back-EMF limiting top speed'],
      ['light-aircraft', 'S', 'D', 'reaction', 'Instrument gyros and reaction wheels both carry a fast-spinning rotor but use it differently: a gyro relies on rigidity in space and precession (Ωₚ = τ/H), while the wheel torques the body by changing its spin rate (τ_c = −ḣ_w). Electrical bus limits cap the available torque'],
      ['statics', 'M', 'D', 'allocation', 'A wheel produces a pure couple; for a four-wheel pyramid the body torque is the vector resultant A·τ_wheels'],
      ['algorithms', 'M', 'D', 'allocation', 'Per-axis clipping is the nearest feasible torque (a separable greedy projection) but rotates the vector; direction-preserving scaling keeps it'],
      ['intel-sys', 'M', 'A', 'limit', 'The torque limit as a relaxed-problem bound: time-optimal bang-bang slews give an admissible heuristic; a saturated P law has the shape of the Huber gradient'],
      ['mom-1', 'M', 'D', 'motor', 'Shaft power P = Tω (1.9 W at 3 mN m and 6000 rpm) and torsional stiffness of wheel shafts'],
      ['mom-2', 'W', 'D', 'hardware', 'Thin-rim hoop stress σ = ρω²r² is negligible for small wheels: they are limited by motor and bearings, not rotor strength'],
      ['manuf-tech', 'M', 'D', 'friction', 'Rotor imbalance from casting porosity or density variation; machining tolerances set wheel-axis misalignment (1° ≈ 1.7% cross-coupling)'],
      ['comp-net-arch', 'M', 'D', 'limit', 'Saturating fixed-point (Q15) torque commands instead of wrap-around; wheel commands over serial buses as a fault source'],
      ['av-perf-1', 'M', 'D', 'momentum', 'Fuel planning and reserves map onto a wheel momentum budget: "momentum endurance" h_max/|τ_d|'],
      ['av-perf-2', 'M', 'D', 'momentum', 'Point-of-no-return thinking for finite momentum: after a point the wheels cannot absorb more disturbance without dumping'],
      ['intro-physics', 'M', 'D', 'limit', 'Minimum braking time t = J·ω0/τmax (1.4 s from 6 deg/s on y; about 3 s from 13 deg/s)'],
      ['thermo', 'W', 'D', 'hardware', 'Wheel losses become heat, removable only by conduction and radiation; lubricant viscosity rises in the cold; radiative equilibrium temperature; cold-gas thrusters for unloading'],
      ['atmos-science', 'W', 'D', 'hardware', 'Radiative energy balance gives a first-cut equilibrium temperature (~278 K) for bearing-lubricant and battery limits'],
      ['eng-materials', 'W', 'D', 'hardware', 'Rotor material choice (density vs stress); outgassing limits for polymers and lubricants; low-CTE mounts'],
      ['mat-manuf', 'W', 'D', 'hardware', 'Material performance indices for panels and brackets; manufacturing variation makes the real J uncertain by a few percent'],
      ['fluids', 'W', 'D', 'friction', 'Viscous bearing friction τ_f = c·ω plus a Coulomb term: the standard wheel-friction model'],
      ['unsup-rl', 'M', 'D', 'limit', 'Continuous bounded wheel torque suits continuous-action learners; discrete thrusters and magnetorquer polarity suit discrete-action ones'],
      ['eng-math-2', 'W', 'D', 'momentum', 'Momentum as the integral of torque over time; for a constant disturbance the time to saturation is h_max/|τ_d|'],
      ['aviation-science', 'W', 'D', 'motor', 'Force on a current in a magnetic field: the physics behind the motor torque τ = k_M I and its back-EMF'],
    ],
    m07: [
      ['nav-systems', 'S', 'E', 'kalman', 'Gyro error model (rate + bias + noise), strapdown propagation, Kalman predict/update and integrated GNSS/INS navigation map onto a spacecraft attitude filter (MEKF)'],
      ['light-aircraft', 'S', 'E', 'complementary', "The attitude indicator's erection mechanism is a mechanical complementary filter; heading-gyro drift reset to the compass is bias correction against an absolute reference"],
      ['navigation', 'M', 'E', 'dead-reckoning', 'Dead reckoning: open-loop integration of rate drifts until a fix resets it, just as gyro-only attitude does'],
      ['av-medicine', 'M', 'E', 'why', 'The vestibular system as a biological IMU: high-pass canals and tilt/acceleration ambiguity show why sensor fusion is needed'],
      ['electromech', 'M', 'D', 'absolute', 'Sensor hardware: Hall sensors, encoders and Gray code, tachogenerators, photodiode sun sensors (I ∝ cos θ), bridge magnetometers; differentiator noise gain favours gyro rate feedback'],
      ['intel-sys', 'S', 'E', 'bayes', "The recursive Bayes filter is Bayes' rule applied every step under the Markov and conditional-independence assumptions; its linear-Gaussian case is the Kalman filter; the TD running average is a first-order filter"],
      ['supervised', 'S', 'E', 'kalman', 'The Kalman measurement update as ridge-style MAP regularised least squares; calibrated fault probabilities with logistic regression'],
      ['algorithms', 'M', 'E', 'kalman', 'The Kalman covariance recursion is the LQR Riccati recursion run forward in time; star identification by binary-search range queries'],
      ['data-structures', 'M', 'E', 'gyros', 'A single-producer single-consumer ring buffer for gyro samples and an O(1) moving-average prefilter'],
      ['control-sys', 'M', 'E', 'kalman', 'Observers (x̂̇ = Ax̂ + Bu + L(y − Cx̂)) and the separation principle as the stepping stone to Kalman filtering'],
      ['eng-math-1', 'M', 'E', 'kalman', 'Gaussian noise, means, variances and covariance matrices: the language of the Kalman filter'],
      ['kin-dyn', 'M', 'E', 'gyros', 'MEMS rate gyros sense rotation through the Coriolis acceleration 2ω × v_rel'],
      ['data-mining', 'M', 'E', 'fdir', 'Outlier detection and classification on telemetry for fault detection, isolation and recovery'],
      ['unsup-rl', 'M', 'E', 'fdir', 'Anomaly detection on dynamics residuals turns contextual anomalies into magnitude anomalies a detector can see'],
      ['deep-learning', 'W', 'E', 'absolute', 'CNNs for star-tracker image processing; recurrent networks vs the Kalman filter as recurrent estimators; voting reliability 3p² − 2p³'],
      ['comp-net-arch', 'W', 'E', 'gyros', 'ADC quantisation adds noise of variance Δ²/12, one of the terms a Kalman filter models'],
      ['machine-elements', 'W', 'E', 'absolute', 'Pointing-error budgets as tolerance stack-ups (worst case vs root-sum-square), with independence as the key assumption'],
      ['eng-materials', 'W', 'E', 'absolute', 'Low-CTE sensor mounts keep alignment through thermal cycles; non-magnetic alloys near magnetometers'],
      ['quant-reasoning', 'M', 'E', 'fdir', 'Base rates and probability: why a rare fault needs a confirmed, persistent residual before a single alarm is trusted'],
    ],
    m08: [
      ['discrete', 'S', 'D', 'guards', 'Modes as a set and transitions as a relation; guards as predicates; De Morgan for the stay-in-hold condition; invariants by induction; transition coverage and boundary-value tests'],
      ['logic-ar', 'S', 'D', 'forbidden', 'Forbidden transitions as next-step temporal-logic invariants; exhaustive model checking of finite mode logic; the anti-flapping lemma as a provable property'],
      ['theory-comp', 'S', 'D', 'monitor', 'The mode logic as a DFA; completing the δ table exposes the SAFE_HOLD re-upset gap; a monitor automaton over the mode log; product-automaton state counts'],
      ['comp-algorithms', 'S', 'D', 'forbidden', 'A 3×3 adjacency-matrix guard with O(1) lookup; BFS shows SAFE_HOLD is reachable only through SAFE_DETUMBLE; a counter vs ring buffer for "below 0.5 deg/s for 2 s"'],
      ['data-structures', 'S', 'D', 'hysteresis', '"Below 0.5 deg/s for 2 s" as a sliding-window maximum (counter or monotonic deque); De Morgan on the return guard; fault flags as a bit-packed word'],
      ['algorithms', 'S', 'D', 'checking', 'Recoverability from strongly connected components; exhaustive abstract model checking (384 states); forbidden-pair pattern scans of logs; run-length dwell checks'],
      ['intel-sys', 'S', 'D', 'checking', 'BFS reachability as model checking; complete vs incomplete search ("prove vs find"); the mode table as a decision tree; a switching-cost MDP produces hysteresis'],
      ['py-search-csp', 'M', 'D', 'checking', 'A transition dict plus a forbidden-pair set that raises an exception; backtracking with undo as an exhaustive checker; testing a condition at the right point in the loop'],
      ['ai-methods', 'S', 'D', 'faults', 'The supervisor as a forward-chaining production system; non-monotonic rule priority; "symbolic systems fail by silence"; naive reachability loops on a cyclic mode graph'],
      ['supervised', 'S', 'D', 'faults', 'Safe-mode entry as a binary classifier: threshold and persistence trade precision against recall; F_β with β > 1 because missed faults cost more'],
      ['electromech', 'S', 'D', 'hysteresis', 'The differential gap (hysteresis band), Schmitt trigger and persistence timers; hardware overcurrent trips beneath software modes; residual (RCD-style) fault detection'],
      ['sys-prog', 'M', 'D', 'hysteresis', 'Mode flapping as a livelock-like liveness failure; safety vs liveness failure taxonomy'],
      ['db-os', 'M', 'D', 'faults', 'Write-ahead logging of mode changes so a reset cannot become a back-door SAFE_DETUMBLE → NOMINAL; watchdogs as supervisor inputs'],
      ['comp-net-arch', 'M', 'D', 'modes', 'A watchdog timer that resets the processor into a safe mode; wrap-safe unsigned elapsed-time arithmetic'],
      ['deep-learning', 'M', 'D', 'faults', "Per-step checking beats end-only checking; a verifier's recall is the ceiling; majority voting amplifies but cannot repair common-mode faults"],
      ['data-mining', 'M', 'D', 'faults', 'Telemetry outlier detection raising the fault flag, with the 0.5 s persistence as a debounce'],
      ['machine-elements', 'W', 'D', 'guards', 'Exact failure definitions (a measured spall area) and zone diagrams (Goodman regions) mirror precise thresholds and mode regions'],
      ['av-perf-2', 'S', 'D', 'why', 'V1 and the point of no return: predefined decision thresholds that turn a continuous situation into a discrete decision'],
      ['rpas', 'S', 'D', 'why', 'Failsafe state machines (link loss → return to home) with trigger timers and hysteresis'],
      ['rotary-wing', 'M', 'D', 'why', 'Autorotation as a rehearsed safe state entered on a defined trigger'],
      ['flight-proc-1', 'M', 'D', 'guards', 'The return-to-NOMINAL guard as a checklist; the on-board safe mode as a memory item done before the checklist'],
      ['light-aircraft', 'M', 'D', 'why', 'Partial-panel flying as degraded-mode operation using only robust information'],
      ['safety-mgmt', 'M', 'D', 'why', 'A bow-tie for "loss of attitude control": preventive barriers and recovery barriers (safe-mode entry, detumble, hold)'],
      ['hf-pilots', 'M', 'D', 'forbidden', 'Forbidden transitions and dwell times make the automation predictable, the human-factors fix for automation surprise'],
      ['cyber-sec', 'W', 'D', 'why', 'Safe mode as incident response (detect, contain, recover only when verified) and defence in depth'],
    ],
    m09: [
      ['quant-reasoning', 'S', 'D', 'confidence', 'The zero-failure binomial bound (60/60 → 95.1% lower bound), sample size n = ln(1−C)/ln R (299 for 99%), P(60/60 | p = 0.95) ≈ 4.6%, and unit discipline'],
      ['eng-math-1', 'S', 'D', 'sampling', 'Uniform per-axis rates bound |ω0| by 8√3 = 13.86 deg/s; binomial pass/fail model; U(a,b) mean and variance for the disturbance draws'],
      ['calculus-2', 'M', 'D', 'sampling', 'Change of variables: uniform rotation angles have density (1 − cos θ)/π, so a uniform angle over-weights small errors'],
      ['mech-design', 'M', 'D', 'mc', 'Robust design: initial attitude, rate and disturbance as noise factors the design must pass across'],
      ['machine-elements', 'S', 'D', 'confidence', 'Life as a distribution (L10 is a percentile claim like REQ-L1); Weibull sampling for Monte Carlo; series reliability; worst case vs root-sum-square'],
      ['algorithms', 'S', 'D', 'confidence', '60/60 → 0.9513 and one failure → 0.923; order statistics and the ECDF via prefix sums; the uniform-angle sampling bias; adversarial search for worst cases'],
      ['data-structures', 'M', 'D', 'discipline', 'Deterministic output order and hashed run IDs for provenance; top-k worst trials with a heap'],
      ['supervised', 'S', 'D', 'discipline', 'The campaign as a binomial experiment; bootstrap intervals; tuning/verification leakage; the envelope is the evidence (no extrapolation); common random numbers'],
      ['intel-sys', 'S', 'D', 'discipline', 'What 60/60 proves; train/validation/test discipline applied to seed sets; bias vs variance of the verification estimate; the pass-rate plateau trap'],
      ['data-mining', 'S', 'D', 'worst', 'Mining the trial table (decision trees, association rules) to explain worst cases; the peak-rate margin is conditional on the sampling range'],
      ['oop-cpp', 'S', 'D', 'discipline', 'Seeded mt19937 streams per trial, random_device used only to choose and log the base seed; parallel trials with an atomic pass counter'],
      ['software-projects', 'S', 'D', 'matrix', 'Test-matrix rows as automated pytest tests; golden-file regression with tolerances'],
      ['prog-eng', 'M', 'D', 'mc', 'Reproducible NumPy random generators and the histogram of detumble times'],
      ['logic-ar', 'M', 'D', 'proof-vs-sampling', 'Testing shows the presence of bugs, not their absence; signal temporal-logic robustness equals the safety margin (1.78 deg/s)'],
      ['av-perf-2', 'M', 'D', 'worst', 'Certification against the worst case: report the worst Monte Carlo case (13.2 vs 15 deg/s), not just the mean'],
      ['business-is', 'M', 'D', 'metrics', 'Pivot-style grouping of trials (pass rate per controller, worst case per band) turns 60 rows into a summary'],
      ['sys-prog', 'M', 'D', 'mc', "Independent trials are embarrassingly parallel; Amdahl's law; vectorise before parallelising; independent RNG streams"],
      ['unsup-rl', 'W', 'D', 'worst', "Clustering trial outcomes exposes failure regimes; the winner's curse when picking the best gain set from noisy scores"],
      ['electromech', 'W', 'D', 'metrics', 'The settling time as the last entry into the band; cross-checking a result by two independent routes'],
      ['mat-manuf', 'W', 'E', 'mc', 'Manufacturing variation makes J uncertain: sampling J_i × U(0.9, 1.1) is a natural Monte Carlo extension'],
      ['cad-practice', 'W', 'E', 'mc', 'Parametric model families giving J as a function of a design variable to feed an inertia-uncertainty study'],
      ['db-os', 'W', 'D', 'discipline', 'One row per trial with indexed pass flags; one transaction per campaign'],
      ['av-hf', 'W', 'D', 'worst', 'HFACS-style tiers to structure the review of failed trials (act, precondition, supervision, organisation)'],
      ['manuf-tech', 'W', 'E', 'mc', 'Actuator misalignment and rotor imbalance as additional Monte Carlo variables'],
      ['atmos-science', 'W', 'D', 'mc', 'Solar-cycle variation of thermospheric density is a physical reason to randomise the disturbance'],
    ],
    m10: [
      ['oop-cpp', 'S', 'D', 'structure', 'An AttitudeController base class with a virtual torque(); protected sat() shared by all laws; an encapsulated ModeManager; exceptions on the ground vs status codes in flight'],
      ['cpp-exercise', 'M', 'D', 'structure', 'override and virtual destructors stop a drifted signature from silently calling the base behaviour'],
      ['soft-eng-arch', 'S', 'D', 'structure', 'Encapsulate the unit-norm invariant behind one propagate(); DRY means single-source constants; YAGNI vs expensive-to-reverse conventions; a modular monolith'],
      ['sys-prog', 'S', 'D', 'memory', 'No heap after initialisation and no recursion; leaks exit 0; sanitizers; the torn-quaternion race; lock ordering; priority inversion (extension)'],
      ['db-os', 'S', 'D', 'loop', 'Fixed-priority preemptive scheduling and the convoy effect; WCET with cold caches; latest-value mailbox vs FIFO; atomic gain-table uploads'],
      ['data-structures', 'S', 'D', 'numbers', 'No allocation in the loop; ring buffers; the row-major vs column-major gain porting bug; array aliasing in the Python mirror; fixed-width timer wrap; ISR races'],
      ['algorithms', 'S', 'D', 'testing', 'Worst-case (not average) bounds; no recursion and bounded loops; lookup tables with careful binary search; validating implementations by edit distance on mode sequences'],
      ['comp-algorithms', 'M', 'D', 'memory', 'Amortised O(1) is the wrong guarantee for a hard deadline: preallocate time histories and buffers'],
      ['comp-net-arch', 'S', 'D', 'numbers', 'Word size and overflow; Q15 torque commands; timer interrupts for a fixed dt; watchdogs; CRC on frames'],
      ['prog-principles', 'M', 'D', 'testing', 'Small single-purpose testable functions with clear contracts; unit tests for quaternion and DCM helpers'],
      ['prog-eng', 'M', 'D', 'three-implementations', "The Python validation mirror's skills: CSV reading, functions, loops, exceptions and NumPy"],
      ['py-search-csp', 'M', 'D', 'testing', 'Classes, dicts and modules for the mirror; canonicalise hashable state; never mutate a collection while iterating'],
      ['software-projects', 'S', 'D', 'reproducibility', 'Version control, automated tests, regression baselines and dependency pinning (tool independence, like the stored fallback LQR gain)'],
      ['networking', 'M', 'D', 'three-implementations', 'A schema-first interface for hardware-in-the-loop; tiny per-step messages that should not be compressed'],
      ['control-sys', 'M', 'D', 'loop', 'Discretisation: sample at 10–30× the bandwidth; zero-order-hold phase lag ωT/2'],
      ['electromech', 'M', 'D', 'loop', 'The digital scan loop; scan time as dead time (10× rule); output clamping; the fast inner current loop living in the motor driver'],
      ['rpas', 'M', 'D', 'loop', 'Fixed-rate flight-controller firmware on microcontrollers: the target the C++ stub imitates'],
      ['logic-ar', 'M', 'D', 'testing', 'Machine-checked contracts for small functions: |sat(u)| ≤ 0.003 and sat(sat(u)) = sat(u)'],
      ['cyber-sec', 'W', 'D', 'testing', 'Input validation in the UI (range checks, NaN, fault-window order) and hashes of result files for integrity'],
      ['intel-sys', 'W', 'D', 'memory', 'Memory-bounded search for on-board planners; small neural-network inference has a fixed, predictable footprint'],
      ['machine-elements', 'W', 'D', 'numbers', 'Unit discipline (rev/min vs rad/s, N m vs N mm) and a sanity check by a second route'],
      ['business-is', 'W', 'D', 'reproducibility', 'Tabular data design with one row per trial and explicit units'],
      ['discrete', 'W', 'D', 'reproducibility', 'Counting and the birthday bound: how many bits a run hash needs before two different runs are likely to collide'],
    ],
    m11: [
      ['digital-design', 'M', 'D', 'animation', 'Exported CAD geometry can replace the simplified bus, each vertex rotated by the quaternion-derived matrix every frame'],
      ['kin-dyn', 'M', 'D', 'frames', 'Watching a body frame rotate relative to an inertial frame makes 3-D rigid-body kinematics intuitive'],
      ['soft-eng-arch', 'S', 'D', 'mvc', 'MVC: one simulation model with several views (the project\'s modern and legacy UIs); the test "if checking a rule needs the UI, separation failed"'],
      ['software-projects', 'M', 'D', 'mvc', 'Separation of concerns and a web front end driving the same simulation core'],
      ['prog-eng', 'M', 'D', 'plots', "Plots with requirement threshold lines and a slider GUI mirroring the project's interface"],
      ['comp-algorithms', 'M', 'D', 'playback', 'Binary search on the sorted time column for playback, then interpolation'],
      ['algorithms', 'M', 'D', 'animation', "Painter's algorithm with insertion sort exploiting frame-to-frame coherence; converting q to a matrix once per frame; the in-browser compute budget"],
      ['data-structures', 'M', 'D', 'plots', 'A sparse table for windowed peak queries vs prefix sums for windowed effort; a ring-buffer attitude trail'],
      ['sys-prog', 'M', 'D', 'mvc', 'A single-threaded UI event loop: long simulations inside a callback freeze the interface'],
      ['networking', 'M', 'D', 'mvc', 'Streaming live attitude to a dashboard: persistent sockets vs polling, one-way server events'],
      ['hf-pilots', 'S', 'D', 'annunciation', 'Mode-confusion research: always show the current mode, why it changed and the remaining dwell before return'],
      ['aviation-science', 'M', 'D', 'annunciation', 'Peer Instruction "predict, then reveal" as a teaching pattern for the animations'],
      ['design-practice', 'W', 'D', 'plots', 'Technical communication: plots and animations exist to make results understandable to others'],
      ['electromech', 'W', 'D', 'plots', 'Annotated step-response, speed–torque and phasor diagrams as models for result plots'],
      ['unsup-rl', 'W', 'D', 'plots', 'Low-dimensional maps of Monte Carlo trials (PCA vs t-SNE/UMAP) and their caveats'],
      ['machine-elements', 'W', 'D', 'plots', 'Chart-reading culture (S-N, Goodman, Mohr) suits interactive plots'],
      ['py-search-csp', 'W', 'D', 'plots', 'Rendering result images from programs as a small precedent for figure generation'],
      ['aero-2', 'M', 'D', 'frames', 'The gimbal-lock argument behind entering Euler angles in the UI but simulating with quaternions'],
      ['eng-math-1', 'M', 'D', 'animation', 'q → R once per frame: orthogonal matrices, matrix–vector products and dot-product projection onto the camera axes'],
    ],
    m12: [
      ['pm-principles', 'S', 'D', 'risk', 'Risk registers scored by likelihood × impact; work breakdown structure; critical path and PERT; change control and lessons learned'],
      ['safety-mgmt', 'S', 'D', 'bowtie', 'Risk matrices with residual risk and owners; bow-tie analysis; fault trees for combined events'],
      ['mech-design', 'M', 'D', 'fmea', 'FMEA with RPN = severity × occurrence × detection mapped onto the risk register'],
      ['design-practice', 'M', 'D', 'wbs', 'Team planning and milestone tracking, as in the iteration log'],
      ['cyber-sec', 'M', 'D', 'risk', 'The qualitative likelihood × impact risk matrix and residual risk after treatment'],
      ['software-projects', 'M', 'D', 'wbs', 'The iteration log as sprint retrospectives; each iteration delivers a usable increment'],
      ['machine-elements', 'M', 'D', 'lessons', 'Logbook discipline (decision + reason, number + source, old and new values) and "name the doubt instead of inflating the factor"'],
      ['algorithms', 'M', 'D', 'schedule', 'The critical path as the longest path in a DAG (linear time); scope selection as a 0/1 knapsack; risk triage as a priority queue with ageing'],
      ['comp-algorithms', 'W', 'D', 'schedule', 'Work packages as a precedence DAG whose topological order is a valid schedule'],
      ['db-os', 'M', 'D', 'wbs', 'The iteration log and risk register as append-only event logs: current status is a fold over entries'],
      ['intel-sys', 'W', 'D', 'schedule', 'Scheduling as a constraint-satisfaction problem; small Bayes nets for correlated risks; information-gain prioritisation'],
      ['deep-learning', 'W', 'D', 'schedule', 'Chained success p^n (10 steps at 0.9 → 35%) argues for schedule margin and checkpoints'],
      ['hf-pilots', 'M', 'D', 'risk', "Threat and error management (anticipate threats, trap errors, manage undesired states) matches the register's layout"],
      ['rpas', 'M', 'D', 'risk', 'Operational risk assessment: ground and air risk, mitigations and residual risk'],
      ['av-mgmt', 'W', 'D', 'risk', 'Stakeholder analysis and weighted-criteria decisions'],
      ['electromech', 'W', 'D', 'fmea', 'Risk items suggested by actuator hardware: wheel stall and overheating, Hall-sensor failure, momentum saturation, aggressive tuning tests'],
      ['quant-reasoning', 'M', 'D', 'schedule', 'Three-point estimates, means and variances: independent task spreads add in quadrature along the critical path'],
    ],
    m13: [
      ['hf-pilots', 'S', 'D', 'layers', 'The Swiss-cheese model of layered defences; situational awareness; threat and error management; mode confusion'],
      ['av-hf', 'S', 'D', 'automation', 'Levels of automation (should the return to NOMINAL be autonomous?); just culture; HFACS'],
      ['av-medicine', 'M', 'D', 'culture', 'Disorientation recovery (stabilise rates first, then attitude) mirrors SAFE_DETUMBLE then SAFE_HOLD; vacuum gas-law effects on hardware'],
      ['safety-mgmt', 'S', 'D', 'culture', 'Safety management systems: reporting and just culture, safety performance indicators, honest anomaly records'],
      ['av-meteo-1', 'W', 'D', 'monitoring', 'Go/no-go discipline from weather case studies; space weather as an upset and drag driver'],
      ['flight-proc-1', 'M', 'D', 'automation', 'The on-board safe mode acts like a memory item while the ground works the slower diagnostic checklist'],
      ['design-practice', 'M', 'D', 'culture', 'Engineering ethics and safety thinking behind the conservative "fail to safe mode" philosophy'],
      ['mech-design', 'W', 'D', 'culture', 'Design reviews and documented rationale'],
      ['machine-elements', 'M', 'D', 'culture', 'Fastener and gear failure case studies; condition monitoring (trend wheel current and temperature to catch bearing degradation)'],
      ['electromech', 'M', 'D', 'culture', 'Electrical safety for hardware-in-the-loop benches; precautions for closed-loop tests that can oscillate'],
      ['cyber-sec', 'M', 'D', 'ground-link', 'The incident-response lifecycle; authenticated telecommands that still cannot bypass on-board guards'],
      ['comp-net-arch', 'M', 'D', 'ground-link', 'Telemetry framing and CRC-16 on telecommands: corrupted commands are discarded, not executed'],
      ['networking', 'S', 'D', 'ground-link', 'Bandwidth-delay product, selective repeat, header overhead and a command-loss timer feeding the mode machine'],
      ['db-os', 'S', 'D', 'persistence', 'Write-ahead mode logging across resets; atomic, checked gain uploads; batching writes to flash'],
      ['supervised', 'M', 'D', 'monitoring', 'Alarm fatigue in numbers; calibrated probabilities; shallow trees as readable operator rules'],
      ['deep-learning', 'M', 'D', 'monitoring', 'Retrieval over procedures and logs should advise, not command; exact-term retrieval suits IDs like "REQ-L1"'],
      ['ai-methods', 'M', 'D', 'monitoring', 'Rule-based monitors fail silently and learned monitors fail confidently; operators must know which'],
      ['intel-sys', 'M', 'D', 'learning', 'Reward misspecification as a design-review question; mistakes while learning are real; the safe mode as a learning shield'],
      ['unsup-rl', 'M', 'D', 'learning', 'Q-learning vs SARSA: exploring in simulation vs on orbit; the supervisor as a shield'],
      ['data-mining', 'M', 'D', 'monitoring', 'In-flight telemetry anomaly detection with persistence before raising the fault flag'],
      ['aviation-law', 'M', 'D', 'context', 'Space-law structure: state responsibility, absolute vs fault-based liability, registration and debris mitigation as top-level requirements'],
      ['intl-relations', 'W', 'D', 'context', 'UN-based governance of space, spectrum and orbital-slot coordination, debris as a shared-resource problem (context only)'],
      ['airspace-atm', 'W', 'D', 'ground-link', 'Ground-segment design and contact windows decide how quickly operators see a safe-mode entry'],
      ['intro-aviation', 'W', 'D', 'context', 'The lineage from aircraft gyro autopilots and inertial guidance to spacecraft attitude control'],
      ['eng-math-1', 'M', 'D', 'monitoring', "Conditional probability and Bayes' rule: alarm precision and the base-rate fallacy"],
    ],
  };

  data.mappings = [];
  Object.keys(MAPPING_TABLE).sort().forEach(function (moduleId) {
    MAPPING_TABLE[moduleId].forEach(function (r) {
      data.mappings.push({
        course: r[0],
        module: moduleId,
        strength: STRENGTH_CODE[r[1]] || r[1],
        tag: TAG_CODE[r[2]] || r[2],
        concept: r[4],
        section: r[3],
      });
    });
  });

  /* ------------------------------------------------------------------ loop diagram */

  // Coordinates are in the SVG viewBox 0 0 1000 640. `match` selects the mappings that
  // feed a block. Blocks that share a module are split by section (one clause per section, so the
  // first clause's section is also the block's "Learn it" anchor): m02 into Reference attitude and
  // System architecture, m03 into Error quaternion, Dynamics and Environment, m07 into Sensors and
  // Estimator. No two blocks feed from the same set of subjects (tests/engine.test.js).
  data.loopBlocks = [
    { id: 'req', label: 'Requirements', sub: 'REQ-F1 F2 S1 S2 L1', x: 20, y: 16, w: 960, h: 46,
      match: [{ module: 'm01' }],
      eq: 'G(|\\omega|\\le 15^\\circ/s)',
      desc: 'Five measurable requirements define success: hold the target within ±2° (REQ-F2), bring the rate below 0.5 deg/s after a safe-mode entry (REQ-F1), never exceed 15 deg/s (REQ-S1) or the torque limit (REQ-S2), and detumble within 60 s in at least 95% of Monte Carlo trials (REQ-L1). Each requirement is traced to at least one test.',
      sim: { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' } },
    { id: 'arch', label: 'System architecture', sub: 'the closed loop', x: 20, y: 84, w: 220, h: 46,
      match: [{ module: 'm02' }],
      eq: 'T(s)=\\frac{C(s)G(s)}{1+C(s)G(s)H(s)}',
      desc: "The project arranges the system as one closed loop: reference attitude, controller, torque-limited actuator, rigid-body model, state feedback and a safe-mode supervisor. Each simulation step runs these in a fixed order, and the controller's contract is a body torque in N m per axis." },
    { id: 'modes', label: 'Mode manager', sub: 'NOMINAL · SAFE_DETUMBLE · SAFE_HOLD', x: 330, y: 84, w: 340, h: 62,
      match: [{ module: 'm08' }],
      eq: 'N\\to SD:\\ \\lVert\\omega\\rVert>6^\\circ/s\\ \\lor\\ \\text{fault}\\ge 0.5\\,s',
      desc: 'A three-mode supervisor watches the rate, the attitude error and the fault flag, and selects which control law runs. Separate entry and exit thresholds (6 and 0.5 deg/s), persistence timers and an 8 s dwell stop it flapping, and SAFE_DETUMBLE → NOMINAL and NOMINAL → SAFE_HOLD are forbidden.',
      sim: { label: 'T03 safe-mode upset and fault', hash: 'preset=T03' } },
    { id: 'ref', label: 'Reference attitude', sub: 'q_ref', x: 20, y: 236, w: 130, h: 64,
      match: [{ module: 'm02', section: 'loop' }, { module: 'm02', section: 'agent' }],
      eq: 'q_{ref}=[1,0,0,0]',
      desc: 'The target attitude, supplied as a scalar-first quaternion. On this site the target is aligned with the inertial frame (Site default).' },
    { id: 'err', label: 'Error quaternion', sub: 'q_e = q_ref* ⊗ q', shape: 'circle', cx: 200, cy: 268, r: 26,
      match: [{ module: 'm03', section: 'rotations' }, { module: 'm03', section: 'quaternions' }, { module: 'm03', section: 'error' }, { module: 'm03', section: 'dcm' }],
      eq: 'q_e=q_{ref}^{*}\\otimes q,\\qquad \\theta=2\\,\\mathrm{atan2}(\\lVert q_{e,v}\\rVert,\\,q_{e0})',
      desc: 'The comparator of the loop: the error quaternion from the target to the current attitude. Its sign is flipped when q_e0 < 0, because q and −q are the same attitude, so the controller always takes the shorter rotation; its angle is the attitude error that REQ-F2 checks.',
      sim: { label: 'T01 PID nominal', hash: 'preset=T01' } },
    { id: 'ctrl', label: 'Controller', sub: 'PID · LQR · detumble', x: 260, y: 226, w: 170, h: 84,
      match: [{ module: 'm05' }],
      eq: '\\tau=-K_p\\,q_{e,v}-K_d\\,\\omega-K_i\\!\\int q_{e,v}\\,dt',
      desc: 'NOMINAL uses a quaternion-error PID or an LQR designed on the small-angle model; SAFE_DETUMBLE uses rate damping τ = −Kd ω, and SAFE_HOLD a low-gain PD. The controller only computes a torque command: the mode manager decides which law runs.',
      sim: { label: 'T01 PID nominal', hash: 'preset=T01' } },
    { id: 'act', label: 'Reaction wheels', sub: '±3 mN m saturation', x: 470, y: 226, w: 170, h: 84,
      match: [{ module: 'm06' }],
      eq: '\\tau_i=\\min\\bigl(\\max(\\tau_{cmd,i},-\\tau_{max}),\\,\\tau_{max}\\bigr),\\quad \\tau_{max}=0.003\\ \\mathrm{N\\,m}',
      desc: 'Three reaction wheels, modelled as ideal torque sources limited to ±3 mN m per axis. Per-axis clipping keeps every command within REQ-S2 but can rotate the torque vector, and saturation is included in every simulation.',
      sim: { label: 'HIGHRATE high-rate upset', hash: 'preset=HIGHRATE' } },
    { id: 'dyn', label: 'Spacecraft dynamics', sub: 'Euler + quaternion kinematics', x: 680, y: 226, w: 190, h: 84,
      match: [{ module: 'm03', section: 'rigid-body' }, { module: 'm03', section: 'euler' }, { module: 'm03', section: 'gyro' }, { module: 'm03', section: 'intermediate' }],
      eq: 'J\\dot\\omega+\\omega\\times(J\\omega)=\\tau_c+\\tau_d,\\qquad \\dot q=\\tfrac12\\,q\\otimes[0,\\omega]',
      desc: "The spacecraft is a rigid body with J = diag(0.035, 0.040, 0.025) kg m². Euler's equation couples the axes through the gyroscopic term ω × Jω, and scalar-first quaternion kinematics propagate the attitude without gimbal lock.",
      sim: { label: 'SPINX torque-free spin about x', hash: 'preset=SPINX' } },
    { id: 'env', label: 'Environment', sub: 'disturbance torque', x: 690, y: 150, w: 170, h: 50,
      match: [{ module: 'm03', section: 'environment' }],
      eq: '\\tau=r\\times F,\\qquad |\\tau_{d,i}|\\le 2\\times10^{-5}\\ \\mathrm{N\\,m}',
      desc: 'A bounded, constant disturbance torque stands in for drag, gravity gradient, solar pressure and residual magnetism. Order-of-magnitude low-orbit torques for a craft of this size are about 1e-8 to 3e-7 N m, so the project bound of 2e-5 N m is roughly 100× conservative.' },
    { id: 'int', label: 'Integrator', sub: 'RK4 + renormalise', x: 680, y: 322, w: 190, h: 42,
      match: [{ module: 'm04' }],
      eq: 'x_{n+1}=x_n+\\tfrac{h}{6}(k_1+2k_2+2k_3+k_4),\\qquad q\\leftarrow q/\\lVert q\\rVert',
      desc: 'A fixed-step RK4 integrator advances the state, and q is renormalised after every step. Forward Euler would inflate |q| on every step, and integer step counters keep the mode timers exact.',
      sim: { label: 'SPINX with forward Euler', hash: 'preset=SPINX&method=euler' } },
    { id: 'sens', label: 'Sensors', sub: 'gyro · star tracker', dashed: true, ext: true, x: 650, y: 420, w: 170, h: 62,
      match: [{ module: 'm07', section: 'gyros' }, { module: 'm07', section: 'absolute' }, { module: 'm07', section: 'why' }, { module: 'm07', section: 'fdir' }],
      eq: '\\omega_m=\\omega+b+n',
      desc: 'Extension: a rate gyro with bias and noise, and a star tracker that measures absolute attitude a few times per second. The original project fed the controller the true simulated state instead.',
      sim: { label: 'ESTKF Kalman-style estimator (extension)', hash: 'preset=ESTKF' } },
    { id: 'est', label: 'Estimator', sub: 'complementary · Kalman', dashed: true, ext: true, x: 400, y: 420, w: 170, h: 62,
      match: [{ module: 'm07', section: 'dead-reckoning' }, { module: 'm07', section: 'complementary' }, { module: 'm07', section: 'bayes' }, { module: 'm07', section: 'kalman' }, { module: 'm07', section: 'thresholds' }],
      eq: 'K=P^{-}H^{\\mathsf T}\\bigl(HP^{-}H^{\\mathsf T}+R\\bigr)^{-1}',
      desc: 'Extension: a complementary filter or a per-axis Kalman-style filter fuses gyro rate with star-tracker fixes to estimate attitude and gyro bias. Noisy estimates interact with the safe-mode thresholds, so filtering and hysteresis both matter.',
      sim: { label: 'ESTNOISY high-noise lock-up (extension)', hash: 'preset=ESTNOISY' } },
    { id: 'ver', label: 'Verification', sub: 'T01–T06 · Monte Carlo', x: 20, y: 536, w: 230, h: 66,
      match: [{ module: 'm09' }],
      eq: 'p_L=\\alpha^{1/n}:\\quad 60/60\\ \\Rightarrow\\ p_L=0.951',
      desc: 'The T01–T06 test matrix traces every requirement to evidence, and a seeded 60-trial Monte Carlo campaign checks REQ-L1. Sixty passes in sixty trials give a one-sided 95% lower bound of 0.951 on the pass rate: only just enough to demonstrate 95%.',
      sim: { label: 'Monte Carlo: 60 trials, seed 42', hash: 'mc=60,42' } },
    { id: 'sw', label: 'Flight software', sub: 'C++ stub · Python mirror', x: 270, y: 536, w: 230, h: 66,
      match: [{ module: 'm10' }],
      eq: 'U\\le n\\,(2^{1/n}-1)',
      desc: "One specification, several programs: the project's MATLAB simulation, a Python validation mirror and an embedded-style C++ controller stub, plus this site's JavaScript engine. Flight-style code needs fixed deadlines, no heap after initialisation and careful number handling.",
      sim: { label: 'T03, then Download CSV to see the logging format', hash: 'preset=T03' } },
    { id: 'viz', label: 'Visualisation & UI', sub: '3D animation · plots', x: 520, y: 536, w: 220, h: 66,
      match: [{ module: 'm11' }],
      eq: 'v_I=R(q)\\,v_B',
      desc: 'The 3-D animation turns each quaternion into a rotation matrix and then into pixels, and the plots carry the requirement thresholds as lines. Mode annunciation shows the current mode, why it changed and the remaining dwell, which prevents mode confusion.',
      sim: { label: 'The simulator with T03: playback, plots and annunciator', hash: 'preset=T03' } },
    { id: 'pm', label: 'Project management & risk', x: 760, y: 536, w: 220, h: 30,
      match: [{ module: 'm12' }],
      eq: '\\text{exposure}=\\text{likelihood}\\times\\text{impact}',
      desc: 'The project ran as six iterations with a work breakdown, an iteration log and a six-row risk register scored by likelihood × impact. Each mitigation maps to a design feature, from rate damping first to a fixed Monte Carlo seed.' },
    { id: 'ops', label: 'Operations & human factors', x: 760, y: 572, w: 220, h: 30,
      match: [{ module: 'm13' }],
      eq: '\\text{BDP}=\\text{bandwidth}\\times\\text{RTT}',
      desc: 'Running the mission: layered defences, the level of automation for leaving safe mode, commanding across the ground link, keeping the mode across resets and tuning alarms. Safety culture and the legal context of a shared orbit complete the lifecycle.',
      sim: { label: 'FAULT fault-triggered entry', hash: 'preset=FAULT' } },
  ];

  /**
   * Arrows of the loop diagram. kind: 'signal' (forward path), 'feedback', 'bypass',
   * 'supervisory', 'trace' or 'bracket'; style: 'solid' | 'dashed' | 'dotted'.
   * `signal` names the quantity on the wire; `label` is text drawn on the arrow.
   * A bracket edge with to:'*' spans every block; `around` lists the blocks a bracket encloses.
   */
  data.loopEdges = [
    { id: 'ref-err',   from: 'ref',   to: 'err',   kind: 'signal',      style: 'solid',  sign: '+', signal: 'q_ref' },
    { id: 'err-ctrl',  from: 'err',   to: 'ctrl',  kind: 'signal',      style: 'solid',  signal: 'q_e' },
    { id: 'ctrl-act',  from: 'ctrl',  to: 'act',   kind: 'signal',      style: 'solid',  signal: 'τ_cmd' },
    { id: 'act-dyn',   from: 'act',   to: 'dyn',   kind: 'signal',      style: 'solid',  signal: 'τ' },
    { id: 'env-dyn',   from: 'env',   to: 'dyn',   kind: 'signal',      style: 'solid',  signal: 'τ_d' },
    { id: 'dyn-int',   from: 'dyn',   to: 'int',   kind: 'signal',      style: 'dotted', label: 'propagates' },
    { id: 'dyn-sens',  from: 'dyn',   to: 'sens',  kind: 'feedback',    style: 'dashed', ext: true, signal: 'q, ω' },
    { id: 'sens-est',  from: 'sens',  to: 'est',   kind: 'feedback',    style: 'dashed', ext: true, signal: 'ω_m, q_m' },
    { id: 'est-err',   from: 'est',   to: 'err',   kind: 'feedback',    style: 'dashed', ext: true, sign: '−', signal: 'q̂, ω̂' },
    { id: 'dyn-err',   from: 'dyn',   to: 'err',   kind: 'bypass',      style: 'solid',  label: 'true state (original project)', signal: 'q, ω' },
    { id: 'modes-ctrl', from: 'modes', to: 'ctrl', kind: 'supervisory', style: 'solid',  label: 'selects law', signal: 'mode' },
    { id: 'dyn-modes', from: 'dyn',   to: 'modes', kind: 'supervisory', style: 'solid',  label: '|ω|, error' },
    { id: 'req-ver',   from: 'req',   to: 'ver',   kind: 'trace',       style: 'dashed' },
    { id: 'ver-all',   from: 'ver',   to: '*',     kind: 'bracket',     style: 'dashed', note: 'Verification covers every block of the loop.' },
    { id: 'sw-bracket', from: 'sw',   to: null,    kind: 'bracket',     style: 'dashed', around: ['ctrl', 'modes', 'est'], label: 'runs on flight software' },
  ];

  /* ------------------------------------------------------------------ requirements and tests */

  /** Requirement → tests (verbatim from the project's test matrix). */
  data.trace = [
    { req: 'REQ-F1', tests: ['T03'] },
    { req: 'REQ-F2', tests: ['T01', 'T02'] },
    { req: 'REQ-S1', tests: ['T03', 'T05'] },
    { req: 'REQ-S2', tests: ['T03', 'T06'] },
    { req: 'REQ-L1', tests: ['T04'] },
  ];

  /** Test labels (verbatim from the project's test plan). `preset` is the matching simulator preset. */
  data.tests = [
    { id: 'T01', reqs: ['REQ-F2'], preset: 'T01',
      scenario: 'Nominal PID pointing from 25 deg, -15 deg, 20 deg initial Euler attitude.',
      expected: 'Final attitude error < 2 deg and final rate < 0.5 deg/s.' },
    { id: 'T02', reqs: ['REQ-F2'], preset: 'T02',
      scenario: 'Nominal LQR pointing from same initial condition as T01.',
      expected: 'Final attitude error < 2 deg and final rate < 0.5 deg/s.' },
    { id: 'T03', reqs: ['REQ-F1', 'REQ-S1', 'REQ-S2'], preset: 'T03',
      scenario: 'Safe-mode upset with high initial rate and temporary fault.',
      expected: 'Enters safe mode, detumbles below 0.5 deg/s, torque remains saturated within limits.' },
    { id: 'T04', reqs: ['REQ-L1'], preset: null,
      scenario: '60-trial Monte Carlo with random attitude, rate, and disturbance.',
      expected: 'At least 95% of trials reach detumble threshold within 60 s.' },
    { id: 'T05', reqs: ['REQ-S1'], preset: null,
      scenario: 'All simulations.',
      expected: 'Maximum angular rate remains <= 15 deg/s.' },
    { id: 'T06', reqs: ['REQ-S2'], preset: null,
      scenario: 'All controller outputs.',
      expected: 'Torque commands remain within +/-0.003 Nm.' },
  ];

  /* ------------------------------------------------------------------ risk register */

  /**
   * The six risk-register rows. risk, likelihood, impact and mitigation are verbatim from the
   * project notes; L and I are the 1–3 scores (Low/Medium/High) and score = L × I.
   * module/feature trace each mitigation to the design feature that implements it.
   * `residual` is an Illustrative post-mitigation position for the m12 risk-matrix widget
   * (chosen for this site, not stated in the notes).
   */
  data.risks = [
    { id: 'instability', short: 'Instability',
      risk: 'Controller instability from excessive gain', likelihood: 'Medium', impact: 'High', L: 2, I: 3, score: 6,
      mitigation: 'Start with rate damping, tune gains conservatively, verify nonlinear response.',
      module: 'm05', feature: 'Rate damping first and conservative gains',
      residual: { likelihood: 'Low', impact: 'High', L: 1, I: 3, score: 3 } },
    { id: 'saturation', short: 'Saturation',
      risk: 'Torque saturation causes slow convergence', likelihood: 'High', impact: 'Medium', L: 3, I: 2, score: 6,
      mitigation: 'Include actuator saturation in all simulations and evaluate settling time honestly.',
      module: 'm06', feature: 'Saturation in every simulation',
      residual: { likelihood: 'High', impact: 'Low', L: 3, I: 1, score: 3 } },
    { id: 'sign', short: 'Sign ambiguity',
      risk: 'Quaternion sign ambiguity causes large apparent error', likelihood: 'Medium', impact: 'Medium', L: 2, I: 2, score: 4,
      mitigation: 'Force quaternion error to the shortest-rotation representation.',
      module: 'm03', feature: 'Shortest-rotation error quaternion',
      residual: { likelihood: 'Low', impact: 'Medium', L: 1, I: 2, score: 2 } },
    { id: 'flapping', short: 'Mode flapping',
      risk: 'Safe-mode mode-flapping', likelihood: 'Medium', impact: 'High', L: 2, I: 3, score: 6,
      mitigation: 'Use hysteresis thresholds and minimum dwell times.',
      module: 'm08', feature: 'Hysteresis thresholds and minimum dwell',
      residual: { likelihood: 'Low', impact: 'Medium', L: 1, I: 2, score: 2 } },
    { id: 'toolbox', short: 'Toolbox dependency',
      risk: 'MATLAB toolbox dependency', likelihood: 'Medium', impact: 'Medium', L: 2, I: 2, score: 4,
      mitigation: 'Store fallback LQR gain in parameters.m; avoid mandatory Simulink/toolbox dependency.',
      module: 'm10', feature: 'Stored fallback LQR gain',
      residual: { likelihood: 'Low', impact: 'Low', L: 1, I: 1, score: 1 } },
    { id: 'reproducibility', short: 'Reproducibility',
      risk: 'Results not reproducible', likelihood: 'Low', impact: 'High', L: 1, I: 3, score: 3,
      mitigation: 'Fix random seed for Monte Carlo and write all outputs to CSV.',
      module: 'm09', feature: 'Fixed Monte Carlo seed and CSV outputs',
      residual: { likelihood: 'Low', impact: 'Low', L: 1, I: 1, score: 1 } },
  ];

  /* ------------------------------------------------------------------ iteration log */

  /** Column headings of the iteration log (rows are numbered as iterations). */
  data.logColumns = ['Iteration', 'Work implemented', 'Problems encountered', 'Decisions made', 'Lessons learned'];

  /** The six log rows, verbatim from the project notes. */
  data.log = [
    { iteration: 1, label: 'Iteration 1',
      work: 'Defined requirements and assumptions.',
      problems: 'Scope could expand into estimator design.',
      decisions: 'Keep estimator/noise model out of first project scope.',
      lessons: 'Clear assumptions make verification easier.' },
    { iteration: 2, label: 'Iteration 2',
      work: 'Built quaternion rigid-body dynamics model.',
      problems: 'Quaternion drift can occur numerically.',
      decisions: 'Renormalize quaternion after every RK4 step.',
      lessons: 'Numerical housekeeping matters in attitude simulation.' },
    { iteration: 3, label: 'Iteration 3',
      work: 'Implemented PID, LQR, and detumble controllers.',
      problems: 'LQR may require toolbox support.',
      decisions: 'Save fallback gain matrix in the parameter file.',
      lessons: 'Tool independence improves reproducibility.' },
    { iteration: 4, label: 'Iteration 4',
      work: 'Added safe-mode state machine.',
      problems: 'Threshold-only logic can flap.',
      decisions: 'Add hysteresis and minimum dwell times.',
      lessons: 'Logic design is part of safety, not an afterthought.' },
    { iteration: 5, label: 'Iteration 5',
      work: 'Added test matrix and Monte Carlo harness.',
      problems: 'Some cases saturate early.',
      decisions: 'Treat saturation as expected and verify limits explicitly.',
      lessons: 'Robustness needs many cases, not one clean plot.' },
    { iteration: 6, label: 'Iteration 6',
      work: 'Produced figures, tables, and final report draft.',
      problems: 'Report can become too theoretical.',
      decisions: 'Tie each result back to requirement IDs.',
      lessons: 'Traceability makes the project look professional.' },
  ];

  /* ------------------------------------------------------------------ glossary (90) */

  // [id, term, definition, modules, see (related term ids)]
  const GLOSSARY_TABLE = [
    ['adcs', 'ADCS',
      'Attitude determination and control system: the sensors, estimator, controller and actuators that point a spacecraft.',
      ['m02'], ['attitude', 'safe-mode', 'reaction-wheel', 'star-tracker']],
    ['attitude', 'Attitude',
      "The orientation of the spacecraft's body frame relative to a reference frame.",
      ['m03'], ['quaternion', 'body-frame', 'inertial-frame']],
    ['body-frame', 'Body frame',
      'Axes fixed to the spacecraft; here they are the principal axes of J.',
      ['m03'], ['inertial-frame', 'principal-axes', 'dcm']],
    ['inertial-frame', 'Inertial frame',
      "A non-rotating reference frame; this site's target attitude is aligned with it.",
      ['m03'], ['body-frame', 'attitude']],
    ['inertia-tensor', 'Inertia tensor (J)',
      'The 3×3 matrix relating angular velocity to angular momentum, H = Jω; diag(0.035, 0.040, 0.025) kg m² in the project.',
      ['m03'], ['principal-axes', 'euler-equation']],
    ['principal-axes', 'Principal axes',
      'Body axes in which the inertia tensor is diagonal: its eigenvectors.',
      ['m03'], ['inertia-tensor', 'intermediate-axis']],
    ['euler-equation', "Euler's rotational equation",
      "J ω̇ + ω × (Jω) = τ: Newton's second law for rotation, written in the rotating body frame.",
      ['m03'], ['gyroscopic-term', 'inertia-tensor']],
    ['gyroscopic-term', 'Gyroscopic term',
      "ω × (Jω), the term in Euler's equation that couples the axes; it does no work.",
      ['m03'], ['euler-equation', 'intermediate-axis']],
    ['intermediate-axis', 'Intermediate-axis theorem',
      'Torque-free spin about the axis with the middle moment of inertia is unstable (x for this spacecraft).',
      ['m03'], ['principal-axes', 'gyroscopic-term']],
    ['quaternion', 'Quaternion',
      'A four-number attitude representation q = [cos(α/2), n sin(α/2)] for a rotation by α about the unit axis n, written scalar-first in this project.',
      ['m03'], ['hamilton-product', 'error-quaternion', 'renormalisation']],
    ['hamilton-product', 'Hamilton product',
      'The quaternion multiplication ⊗ that composes rotations; the order matters.',
      ['m03'], ['quaternion', 'error-quaternion']],
    ['error-quaternion', 'Error quaternion',
      'q_e = conj(q_ref) ⊗ q: the rotation from the target attitude to the current one.',
      ['m03', 'm05'], ['shortest-rotation', 'quaternion', 'pid']],
    ['shortest-rotation', 'Shortest rotation',
      'Choosing the sign of q_e so its scalar part is non-negative, because q and −q describe the same attitude.',
      ['m03'], ['error-quaternion', 'quaternion']],
    ['dcm', 'Direction cosine matrix (DCM)',
      'A 3×3 rotation matrix; C(q) maps inertial-frame vectors into the body frame.',
      ['m03', 'm11'], ['quaternion', 'euler-angles']],
    ['euler-angles', 'Euler angles (3-2-1)',
      'The yaw–pitch–roll sequence used for input in the interface; singular at ±90° pitch.',
      ['m03'], ['gimbal-lock', 'dcm']],
    ['gimbal-lock', 'Gimbal lock',
      'Loss of a degree of freedom in Euler-angle kinematics at ±90° pitch.',
      ['m03'], ['euler-angles', 'quaternion']],
    ['disturbance-torque', 'Disturbance torque',
      'Torque the controller did not command (drag, solar pressure, gravity gradient, magnetic); bounded and constant in the project.',
      ['m03'], ['gravity-gradient', 'momentum-unloading']],
    ['gravity-gradient', 'Gravity-gradient torque',
      'Torque from the variation of gravity across the body; about 3e-8 N m for this spacecraft in low orbit.',
      ['m03'], ['disturbance-torque', 'inertia-tensor']],
    ['rk4', 'Runge–Kutta 4 (RK4)',
      'A four-stage fixed-step integrator with global error proportional to h⁴.',
      ['m04'], ['forward-euler', 'order-of-accuracy', 'stability-region']],
    ['forward-euler', 'Forward Euler',
      'The first-order integrator x⁺ = x + h·f(x); on quaternion kinematics it always inflates |q|.',
      ['m04'], ['rk4', 'renormalisation', 'stability-region']],
    ['renormalisation', 'Renormalisation',
      'Dividing q by |q| after each step to remove numerical drift from unit length.',
      ['m04'], ['quaternion', 'forward-euler']],
    ['order-of-accuracy', 'Order of accuracy',
      'The exponent p in error ∝ h^p, measured by halving the step.',
      ['m04'], ['rk4', 'forward-euler']],
    ['stability-region', 'Stability region',
      'The step sizes for which an integrator does not amplify a decaying mode.',
      ['m04'], ['rk4', 'forward-euler']],
    ['machine-epsilon', 'Machine epsilon',
      'The gap between 1 and the next larger representable number: 2⁻⁵² ≈ 2.2e-16 in float64 and 2⁻²³ ≈ 1.2e-7 in float32.',
      ['m04'], ['fixed-point', 'renormalisation']],
    ['double-integrator', 'Double integrator',
      'The per-axis small-angle plant J·θ̈ = τ, with transfer function 1/(Js²).',
      ['m05'], ['pid', 'lqr']],
    ['detumble', 'Detumble',
      'Removing angular rate with the rate-damping law τ = −Kd·ω.',
      ['m05', 'm08'], ['rate-damping', 'safe-detumble']],
    ['rate-damping', 'Rate damping',
      'Feedback proportional to angular velocity; the detumble law.',
      ['m05'], ['detumble', 'damping-ratio']],
    ['pid', 'PID controller',
      'Proportional–integral–derivative feedback; here τ = −Kp·q_e,v − Kd·ω − Ki·∫q_e,v dt.',
      ['m05'], ['integral-windup', 'anti-windup', 'error-quaternion']],
    ['integral-windup', 'Integral windup',
      'Growth of the integral term while the actuator is saturated, causing overshoot.',
      ['m05'], ['anti-windup', 'saturation']],
    ['anti-windup', 'Anti-windup',
      'Measures that prevent windup: mode gating, clamping, conditional integration or reset.',
      ['m05'], ['integral-windup', 'pid']],
    ['lqr', 'LQR',
      'Linear–quadratic regulator: state feedback u = −Kx that minimises ∫(xᵀQx + uᵀRu) dt.',
      ['m05'], ['riccati', 'bellman', 'double-integrator']],
    ['riccati', 'Riccati equation',
      'The matrix equation whose solution P gives the LQR gain K = R⁻¹BᵀP.',
      ['m05'], ['lqr', 'kalman-filter']],
    ['bellman', 'Bellman equation',
      'The recursive optimality condition of dynamic programming; LQR is its linear-quadratic case.',
      ['m05'], ['lqr', 'riccati']],
    ['damping-ratio', 'Damping ratio (ζ)',
      'Dimensionless damping of a second-order response; the project LQR gives ζ ≈ 0.72.',
      ['m05'], ['natural-frequency', 'lqr']],
    ['natural-frequency', 'Natural frequency (ωn)',
      'The undamped oscillation frequency of a second-order system.',
      ['m05'], ['damping-ratio', 'double-integrator']],
    ['settling-time', 'Settling time',
      'The time after which attitude error < 2° and rate < 0.5 deg/s remain satisfied (the last entry into the band).',
      ['m05', 'm09'], ['margin', 'damping-ratio']],
    ['saturation', 'Torque saturation',
      'Clamping commanded torque to the actuator limit, ±0.003 N m per axis in the project.',
      ['m06'], ['reaction-wheel', 'integral-windup']],
    ['reaction-wheel', 'Reaction wheel',
      'A motor-driven flywheel; changing its speed applies an equal and opposite torque to the spacecraft.',
      ['m06'], ['momentum-exchange', 'saturation', 'back-emf']],
    ['momentum-exchange', 'Momentum exchange',
      'Wheel torque moves angular momentum between wheel and body; the total is conserved without external torque.',
      ['m06'], ['reaction-wheel', 'momentum-unloading']],
    ['back-emf', 'Back-EMF',
      'Voltage generated by a spinning motor that limits current, and so torque, at high speed.',
      ['m06'], ['reaction-wheel', 'saturation']],
    ['momentum-unloading', 'Momentum unloading',
      'Removing accumulated wheel momentum with an external torque from magnetorquers or thrusters.',
      ['m06'], ['magnetorquer', 'momentum-exchange']],
    ['magnetorquer', 'Magnetorquer',
      "A coil whose magnetic dipole m produces torque τ = m × B in the Earth's field.",
      ['m06'], ['momentum-unloading', 'disturbance-torque']],
    ['gyro', 'Rate gyro',
      'A sensor that measures angular velocity, with errors that include bias and noise.',
      ['m07'], ['gyro-bias', 'dead-reckoning']],
    ['gyro-bias', 'Gyro bias',
      'A slowly varying offset in gyro output that makes integrated attitude drift linearly.',
      ['m07'], ['gyro', 'kalman-filter']],
    ['star-tracker', 'Star tracker',
      'A camera-based sensor that measures absolute attitude from star patterns.',
      ['m07'], ['complementary-filter', 'kalman-filter']],
    ['complementary-filter', 'Complementary filter',
      'An estimator that trusts integrated gyro rate in the short term and an absolute sensor in the long term.',
      ['m07'], ['kalman-filter', 'gyro', 'star-tracker']],
    ['kalman-filter', 'Kalman filter',
      'A recursive estimator that predicts with a model and updates with measurements weighted by their covariances.',
      ['m07'], ['mekf', 'complementary-filter', 'riccati']],
    ['mekf', 'Multiplicative EKF',
      'An attitude Kalman filter that applies its corrections as small rotations to the quaternion.',
      ['m07'], ['kalman-filter', 'quaternion']],
    ['dead-reckoning', 'Dead reckoning',
      'Propagating position or attitude by integrating rates, with no absolute fixes.',
      ['m07'], ['gyro', 'gyro-bias']],
    ['fdir', 'FDIR',
      'Fault detection, isolation and recovery.',
      ['m07', 'm08'], ['safe-mode', 'watchdog']],
    ['safe-mode', 'Safe mode',
      'A conservative operating mode entered automatically after an upset or fault.',
      ['m08'], ['safe-detumble', 'safe-hold', 'nominal']],
    ['nominal', 'NOMINAL',
      'The mode that tracks the target attitude with PID or LQR.',
      ['m08'], ['safe-mode', 'pid', 'lqr']],
    ['safe-detumble', 'SAFE_DETUMBLE',
      'The mode that removes angular rate with rate damping.',
      ['m08'], ['detumble', 'safe-hold']],
    ['safe-hold', 'SAFE_HOLD',
      'The mode that holds a coarse attitude with a low-gain PD until a return to NOMINAL is allowed.',
      ['m08'], ['dwell-time', 'nominal']],
    ['guard', 'Guard',
      'A Boolean condition that must be true for a mode transition to happen.',
      ['m08'], ['hysteresis', 'dwell-time', 'forbidden-transition']],
    ['hysteresis', 'Hysteresis',
      'Using different entry and exit thresholds (6 vs 0.5 deg/s) so the logic does not chatter.',
      ['m08'], ['mode-flapping', 'dwell-time']],
    ['dwell-time', 'Dwell time',
      'The minimum time in SAFE_HOLD (8 s) before the spacecraft may return to NOMINAL.',
      ['m08'], ['hysteresis', 'safe-hold']],
    ['mode-flapping', 'Mode flapping',
      'Rapid, repeated switching between modes when a signal hovers near a threshold.',
      ['m08'], ['hysteresis', 'dwell-time']],
    ['forbidden-transition', 'Forbidden transition',
      'A mode change the design never allows: SAFE_DETUMBLE → NOMINAL, NOMINAL → SAFE_HOLD, or a return to NOMINAL while a fault is active.',
      ['m08'], ['invariant', 'guard']],
    ['invariant', 'Invariant',
      'A property that holds in every reachable state of a system.',
      ['m08'], ['forbidden-transition', 'model-checking']],
    ['model-checking', 'Model checking',
      'Exhaustive exploration of a finite model to prove a property or find a counterexample.',
      ['m08'], ['invariant', 'dfa']],
    ['dfa', 'Finite automaton (DFA)',
      'A state machine driven by input symbols; used here to monitor mode logs.',
      ['m08'], ['model-checking', 'forbidden-transition']],
    ['safety-property', 'Safety property',
      '"Nothing bad ever happens"; a single bad sample refutes it (REQ-S1, REQ-S2).',
      ['m01', 'm08'], ['liveness-property', 'invariant']],
    ['liveness-property', 'Liveness property',
      '"Something good eventually happens"; a time bound makes it testable (REQ-F1, REQ-L1).',
      ['m01'], ['safety-property', 'requirement']],
    ['requirement', 'Requirement',
      'A verifiable "shall" statement with a measurable threshold and a verification method.',
      ['m01'], ['traceability', 'safety-property', 'margin']],
    ['traceability', 'Traceability',
      'Links from each requirement to the tests and evidence that verify it.',
      ['m01', 'm09'], ['requirement', 'monte-carlo']],
    ['margin', 'Margin',
      'Capability divided by demand, or the distance from a limit (for example 15 deg/s minus the peak rate).',
      ['m01', 'm09'], ['requirement', 'settling-time']],
    ['peas', 'PEAS',
      'Performance measure, Environment, Actuators, Sensors: a way to specify an agent, starting from what success means.',
      ['m01'], ['requirement', 'adcs']],
    ['monte-carlo', 'Monte Carlo verification',
      'Running many randomised trials to estimate performance across the range of conditions.',
      ['m09'], ['seed', 'clopper-pearson']],
    ['seed', 'Random seed',
      'The number that fixes a pseudo-random sequence so a campaign can be reproduced exactly.',
      ['m09'], ['monte-carlo']],
    ['clopper-pearson', 'Clopper–Pearson bound',
      'An exact binomial confidence bound; 60 passes in 60 trials give a one-sided 95% lower bound of 0.951.',
      ['m09'], ['rule-of-three', 'monte-carlo']],
    ['rule-of-three', 'Rule of three',
      'With zero failures in n trials, the 95% upper bound on the failure rate is about 3/n.',
      ['m09'], ['clopper-pearson']],
    ['wcet', 'WCET',
      'Worst-case execution time of a task, which must fit within its deadline.',
      ['m10'], ['rate-monotonic', 'watchdog']],
    ['rate-monotonic', 'Rate-monotonic scheduling',
      'Fixed priorities assigned by period; schedulable when utilisation U ≤ n(2^(1/n) − 1).',
      ['m10'], ['wcet']],
    ['watchdog', 'Watchdog timer',
      'A hardware timer that resets the processor if software stops responding.',
      ['m10', 'm13'], ['fdir', 'wcet']],
    ['sil-hil', 'SIL / PIL / HIL',
      'Software-, processor- and hardware-in-the-loop testing.',
      ['m02', 'm10'], ['adcs', 'fixed-point']],
    ['fixed-point', 'Fixed-point (Q15)',
      'Integer representation of fractional values with a fixed scale; resolution 0.003/32767 N m for a ±3 mN m torque.',
      ['m10'], ['machine-epsilon', 'saturation']],
    ['torn-read', 'Torn read',
      'A reader seeing part-old, part-new values of a multi-word variable such as a quaternion.',
      ['m10'], ['quaternion', 'wcet']],
    ['slerp', 'Slerp',
      'Spherical linear interpolation between two quaternions at constant angular rate.',
      ['m11'], ['quaternion']],
    ['mvc', 'MVC',
      'Model–view–controller: separating the simulation core from the interfaces that display it.',
      ['m11'], ['mode-confusion']],
    ['mode-confusion', 'Mode confusion',
      "When an operator's belief about the automation's mode differs from its actual mode.",
      ['m11', 'm13'], ['levels-of-automation', 'safe-mode']],
    ['risk-register', 'Risk register',
      'A table of risks with their likelihood, impact and mitigation.',
      ['m12'], ['fmea', 'bow-tie']],
    ['fmea', 'FMEA',
      'Failure modes and effects analysis; risk priority number = severity × occurrence × detection.',
      ['m12'], ['risk-register', 'bow-tie']],
    ['critical-path', 'Critical path',
      'The longest chain of dependent tasks through a project schedule.',
      ['m12'], ['risk-register']],
    ['bow-tie', 'Bow-tie',
      'A diagram linking threats through preventive barriers to a top event, then through recovery barriers to consequences.',
      ['m12'], ['risk-register', 'swiss-cheese']],
    ['swiss-cheese', 'Swiss-cheese model',
      'Accidents happen when holes in several layers of defence line up.',
      ['m13'], ['bow-tie', 'just-culture']],
    ['levels-of-automation', 'Levels of automation',
      'A scale from fully manual to fully autonomous decision-making.',
      ['m13'], ['mode-confusion', 'safe-hold']],
    ['bdp', 'Bandwidth-delay product',
      'The amount of data in flight on a link: bandwidth × round-trip time.',
      ['m13'], ['levels-of-automation']],
    ['write-ahead-log', 'Write-ahead log',
      'Recording an intended change durably before applying it, so any crash point has a defined outcome.',
      ['m13'], ['forbidden-transition', 'safe-mode']],
    ['just-culture', 'Just culture',
      'A safety culture that encourages reporting by not blaming people for honest errors.',
      ['m13'], ['swiss-cheese']],
  ];

  data.glossary = GLOSSARY_TABLE.map(function (r) {
    return { id: r[0], term: r[1], def: r[2], modules: r[3], see: r[4] };
  });

  /* ------------------------------------------------------------------ expected counts */

  /** Counts asserted by validate(). */
  data.expected = {
    courses: 70,
    disciplines: 8,
    modules: 13,
    mappings: 280,
    glossary: 90,
    loopBlocks: 17,
    risks: 6,
    log: 6,
    byDiscipline: { me: 16, math: 5, phys: 3, cs: 10, sw: 7, ai: 7, av: 14, mhf: 8 },
    byEvidence: { notes: 16, partial: 2, outline: 52 },
  };

  /* ------------------------------------------------------------------ indexes */

  const RANK = { strong: 3, moderate: 2, weak: 1 };

  function indexBy(list) {
    const m = new Map();
    list.forEach(function (x) { m.set(x.id, x); });
    return m;
  }
  const courseIndex = indexBy(data.courses);
  const moduleIndex = indexBy(data.modules);
  const disciplineIndex = indexBy(data.disciplines);
  const blockIndex = indexBy(data.loopBlocks);
  const termIndex = indexBy(data.glossary);

  function asList(v) {
    if (v === undefined || v === null || v === '') return null;
    return Array.isArray(v) ? v : [v];
  }

  /* ------------------------------------------------------------------ query helpers */

  /**
   * Look up a subject record by id.
   * @param {string} id  course id, e.g. 'control-sys'
   * @returns {object|null} the course record, or null if unknown
   */
  data.course = function (id) { return courseIndex.get(id) || null; };

  /**
   * Look up a module record by id.
   * @param {string} id  module id, e.g. 'm05'
   * @returns {object|null} the module record, or null if unknown
   */
  data.module = function (id) { return moduleIndex.get(id) || null; };

  /**
   * Look up a discipline record by id.
   * @param {string} id  discipline id, e.g. 'math'
   * @returns {object|null}
   */
  data.discipline = function (id) { return disciplineIndex.get(id) || null; };

  /**
   * Look up a loop-diagram block by id.
   * @param {string} id  block id, e.g. 'ctrl'
   * @returns {object|null}
   */
  data.block = function (id) { return blockIndex.get(id) || null; };

  /**
   * Look up a glossary term by id.
   * @param {string} id  term id, e.g. 'lqr'
   * @returns {object|null}
   */
  data.term = function (id) { return termIndex.get(id) || null; };

  /**
   * Numeric rank of a strength (strong 3, moderate 2, weak 1, unknown 0).
   * @param {string} strength
   * @returns {number}
   */
  data.strengthRank = function (strength) { return RANK[strength] || 0; };

  /**
   * Comparator for mapping rows: strongest first, then subject name, then module number.
   * @param {object} a  mapping row
   * @param {object} b  mapping row
   * @returns {number}
   */
  function compareRows(a, b) {
    const d = (RANK[b.strength] || 0) - (RANK[a.strength] || 0);
    if (d) return d;
    const ca = courseIndex.get(a.course), cb = courseIndex.get(b.course);
    const n = (ca ? ca.name : a.course).localeCompare(cb ? cb.name : b.course, 'en');
    if (n) return n;
    const ma = moduleIndex.get(a.module), mb = moduleIndex.get(b.module);
    return (ma ? ma.num : 0) - (mb ? mb.num : 0);
  }
  data.compareRows = compareRows;

  /**
   * Mapping rows that feed one module.
   * @param {string} moduleId  e.g. 'm03'
   * @param {{section?: string|string[], exclude?: string|string[]}} [opts]
   *   section: keep only rows anchored to this section (or any of these sections);
   *   exclude: drop rows anchored to this section (or any of these sections).
   * @returns {object[]} a new array of mapping rows, in table order
   */
  data.mappingsFor = function (moduleId, opts) {
    const o = opts || {};
    const only = asList(o.section);
    const drop = asList(o.exclude);
    return data.mappings.filter(function (r) {
      if (r.module !== moduleId) return false;
      if (only && only.indexOf(r.section) < 0) return false;
      if (drop && drop.indexOf(r.section) >= 0) return false;
      return true;
    });
  };

  /**
   * Mapping rows of one subject, in module order.
   * @param {string} courseId
   * @returns {object[]} a new array of mapping rows
   */
  data.mappingsForCourse = function (courseId) {
    return data.mappings.filter(function (r) { return r.course === courseId; })
      .sort(function (a, b) {
        const ma = moduleIndex.get(a.module), mb = moduleIndex.get(b.module);
        return (ma ? ma.num : 0) - (mb ? mb.num : 0);
      });
  };

  /**
   * Group mapping rows by the discipline of their subject.
   * Groups follow the order of ADCS.data.disciplines and empty groups are omitted;
   * rows inside a group are sorted strong > moderate > weak, then by subject name.
   * @param {object[]} mappings  rows from mappingsFor, matchBlock or ADCS.data.mappings
   * @returns {{discipline: object, rows: object[]}[]}
   */
  data.byDiscipline = function (mappings) {
    const groups = new Map();
    (mappings || []).forEach(function (r) {
      const c = courseIndex.get(r.course);
      if (!c) return;
      if (!groups.has(c.discipline)) groups.set(c.discipline, []);
      groups.get(c.discipline).push(r);
    });
    return data.disciplines.filter(function (d) { return groups.has(d.id); })
      .map(function (d) { return { discipline: d, rows: groups.get(d.id).sort(compareRows) }; });
  };

  /**
   * Mapping rows that feed a loop-diagram block: the union of its `match` clauses,
   * de-duplicated by subject with the strongest row kept (the first one on a tie).
   * @param {object|string} block  a loopBlocks record or its id
   * @returns {object[]} rows sorted strongest first, then by subject name
   */
  data.matchBlock = function (block) {
    const b = typeof block === 'string' ? blockIndex.get(block) : block;
    if (!b || !Array.isArray(b.match)) return [];
    const best = new Map();
    b.match.forEach(function (clause) {
      data.mappingsFor(clause.module, { section: clause.section, exclude: clause.exclude })
        .forEach(function (r) {
          const prev = best.get(r.course);
          if (!prev || (RANK[r.strength] || 0) > (RANK[prev.strength] || 0)) best.set(r.course, r);
        });
    });
    return Array.from(best.values()).sort(compareRows);
  };

  /**
   * Headline counts for the atlas and landing page.
   * @returns {{courses: number, disciplines: number, modules: number, links: number}}
   */
  data.stats = function () {
    return {
      courses: data.courses.length,
      disciplines: data.disciplines.length,
      modules: data.modules.length,
      links: data.mappings.length,
    };
  };

  /**
   * Check the internal consistency of the data. Collects every problem and throws one
   * Error listing them all. Checks: unique ids; known disciplines, kinds and evidence;
   * `typical` present for outline and partial subjects (and null for notes); every
   * mapping names a known subject, module and section with a valid strength and tag;
   * no duplicate subject–module pair; every subject and module has at least one mapping;
   * m07 rows are 'extension' except for subjects that teach the hardware itself;
   * glossary modules and see-links resolve; loop blocks and edges resolve; trace and
   * test labels agree; and the counts in ADCS.data.expected hold.
   * @returns {{ok: true, courses: number, disciplines: number, modules: number, links: number, glossary: number}}
   * @throws {Error} when any check fails
   */
  data.validate = function () {
    const errs = [];
    const E = data.expected;
    function count(name, actual, expected) {
      if (actual !== expected) errs.push(name + ': expected ' + expected + ', found ' + actual);
    }
    function unique(name, list) {
      const seen = new Set();
      list.forEach(function (x) {
        if (!x || typeof x.id !== 'string' || !x.id) { errs.push(name + ': record without an id'); return; }
        if (seen.has(x.id)) errs.push(name + ': duplicate id "' + x.id + '"');
        seen.add(x.id);
      });
    }
    function nonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }

    unique('disciplines', data.disciplines);
    unique('courses', data.courses);
    unique('modules', data.modules);
    unique('loopBlocks', data.loopBlocks);
    unique('loopEdges', data.loopEdges);
    unique('glossary', data.glossary);
    unique('risks', data.risks);

    count('disciplines', data.disciplines.length, E.disciplines);
    count('courses', data.courses.length, E.courses);
    count('modules', data.modules.length, E.modules);
    count('mappings', data.mappings.length, E.mappings);
    count('glossary terms', data.glossary.length, E.glossary);
    count('loop blocks', data.loopBlocks.length, E.loopBlocks);
    count('risks', data.risks.length, E.risks);
    count('log rows', data.log.length, E.log);

    // Courses.
    const KINDS = Object.keys(data.labels.kind);
    const EVID = Object.keys(data.labels.evidence);
    const perDisc = {}, perEv = {};
    data.courses.forEach(function (c) {
      const where = 'course "' + c.id + '"';
      if (!disciplineIndex.has(c.discipline)) errs.push(where + ': unknown discipline "' + c.discipline + '"');
      if (KINDS.indexOf(c.kind) < 0) errs.push(where + ': unknown kind "' + c.kind + '"');
      if (EVID.indexOf(c.evidence) < 0) errs.push(where + ': unknown evidence "' + c.evidence + '"');
      if (!nonEmpty(c.name)) errs.push(where + ': missing name');
      if (!nonEmpty(c.covered)) errs.push(where + ': missing covered text');
      const hasTypical = Array.isArray(c.typical) && c.typical.length > 0 && c.typical.every(nonEmpty);
      if ((c.evidence === 'outline' || c.evidence === 'partial') && !hasTypical) {
        errs.push(where + ': ' + c.evidence + ' evidence needs a non-empty typical list');
      }
      if (c.evidence === 'notes' && c.typical !== null) errs.push(where + ': notes evidence must have typical: null');
      if (c.evidence === 'partial' && !nonEmpty(c.typicalScope)) errs.push(where + ': partial evidence needs typicalScope');
      if (c.evidence !== 'partial' && c.typicalScope !== null) errs.push(where + ': typicalScope is only for partial evidence');
      if (!Array.isArray(c.keyIdeas) || !c.keyIdeas.length || !c.keyIdeas.every(nonEmpty)) {
        errs.push(where + ': keyIdeas must be a non-empty list of strings');
      }
      perDisc[c.discipline] = (perDisc[c.discipline] || 0) + 1;
      perEv[c.evidence] = (perEv[c.evidence] || 0) + 1;
    });
    Object.keys(E.byDiscipline).forEach(function (d) { count('courses in ' + d, perDisc[d] || 0, E.byDiscipline[d]); });
    Object.keys(E.byEvidence).forEach(function (v) { count('courses with ' + v + ' evidence', perEv[v] || 0, E.byEvidence[v]); });

    // Modules.
    const PHASES = data.phases.map(function (p) { return p.id; });
    data.modules.forEach(function (m, i) {
      const where = 'module "' + m.id + '"';
      if (m.num !== i + 1) errs.push(where + ': num should be ' + (i + 1));
      if (m.id !== 'm' + (m.num < 10 ? '0' : '') + m.num) errs.push(where + ': id does not match num');
      if (typeof m.slug !== 'string' || m.slug.indexOf(m.id + '-') !== 0 || !/\.html$/.test(m.slug)) {
        errs.push(where + ': bad slug "' + m.slug + '"');
      }
      if (PHASES.indexOf(m.phase) < 0) errs.push(where + ': unknown phase "' + m.phase + '"');
      if (!nonEmpty(m.title) || !nonEmpty(m.short) || !nonEmpty(m.summary)) errs.push(where + ': missing title, short or summary');
      if (!(m.minutes > 0)) errs.push(where + ': minutes must be positive');
      if (!Array.isArray(m.sections) || !m.sections.length) errs.push(where + ': no sections');
      const secSeen = new Set();
      (m.sections || []).forEach(function (s) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) errs.push(where + ': bad section anchor "' + s.id + '"');
        if (secSeen.has(s.id)) errs.push(where + ': duplicate section "' + s.id + '"');
        secSeen.add(s.id);
        if (!nonEmpty(s.title)) errs.push(where + ': section "' + s.id + '" has no title');
      });
      (m.prereqs || []).forEach(function (p) {
        const pm = moduleIndex.get(p);
        if (!pm) errs.push(where + ': unknown prerequisite "' + p + '"');
        else if (pm.num >= m.num) errs.push(where + ': prerequisite "' + p + '" does not come earlier');
      });
      (m.simLinks || []).forEach(function (l) {
        if (!nonEmpty(l.label) || !nonEmpty(l.hash) || l.hash.charAt(0) === '#') errs.push(where + ': bad simLink');
      });
      if (!Array.isArray(m.widgets) || !m.widgets.some(function (w) { return w.core; })) errs.push(where + ': no core widget');
    });
    data.phases.forEach(function (p) {
      p.modules.forEach(function (id) {
        const m = moduleIndex.get(id);
        if (!m) errs.push('phase ' + p.id + ': unknown module "' + id + '"');
        else if (m.phase !== p.id) errs.push('phase ' + p.id + ': module ' + id + ' has phase ' + m.phase);
      });
    });

    // Mappings.
    const STR = Object.keys(data.labels.strength);
    const TAGS = Object.keys(data.labels.tag);
    const pairs = new Set();
    const perCourse = {}, perModule = {};
    const HARDWARE_IN_M07 = ['electromech'];
    data.mappings.forEach(function (r, i) {
      const where = 'mapping #' + i + ' (' + r.course + ' → ' + r.module + ')';
      const m = moduleIndex.get(r.module);
      if (!courseIndex.has(r.course)) errs.push(where + ': unknown course');
      if (!m) errs.push(where + ': unknown module');
      if (STR.indexOf(r.strength) < 0) errs.push(where + ': bad strength "' + r.strength + '"');
      if (TAGS.indexOf(r.tag) < 0) errs.push(where + ': bad tag "' + r.tag + '"');
      if (!nonEmpty(r.concept)) errs.push(where + ': missing concept');
      if (r.section !== undefined && r.section !== null && m &&
          !m.sections.some(function (s) { return s.id === r.section; })) {
        errs.push(where + ': unknown section "' + r.section + '"');
      }
      const key = r.course + '|' + r.module;
      if (pairs.has(key)) errs.push(where + ': duplicate subject–module pair');
      pairs.add(key);
      if (r.module === 'm07' && r.tag !== 'extension' && HARDWARE_IN_M07.indexOf(r.course) < 0) {
        errs.push(where + ': m07 rows must be tagged extension');
      }
      perCourse[r.course] = (perCourse[r.course] || 0) + 1;
      perModule[r.module] = (perModule[r.module] || 0) + 1;
    });
    data.courses.forEach(function (c) { if (!perCourse[c.id]) errs.push('course "' + c.id + '" has no mappings'); });
    data.modules.forEach(function (m) { if (!perModule[m.id]) errs.push('module "' + m.id + '" has no mappings'); });

    // Loop diagram.
    data.loopBlocks.forEach(function (b) {
      const where = 'loop block "' + b.id + '"';
      if (!nonEmpty(b.label) || !nonEmpty(b.desc) || !nonEmpty(b.eq)) errs.push(where + ': needs label, desc and eq');
      const geomOk = b.shape === 'circle'
        ? [b.cx, b.cy, b.r].every(isFinite)
        : [b.x, b.y, b.w, b.h].every(isFinite);
      if (!geomOk) errs.push(where + ': bad geometry');
      if (!Array.isArray(b.match) || !b.match.length) errs.push(where + ': empty match');
      (b.match || []).forEach(function (cl) {
        const m = moduleIndex.get(cl.module);
        if (!m) { errs.push(where + ': unknown module "' + cl.module + '"'); return; }
        [cl.section, cl.exclude].forEach(function (s) {
          (asList(s) || []).forEach(function (sid) {
            if (!m.sections.some(function (x) { return x.id === sid; })) errs.push(where + ': unknown section "' + sid + '"');
          });
        });
      });
      if (!data.matchBlock(b).length) errs.push(where + ': matches no mappings');
    });
    // Each block must show its own subjects: two blocks with the same subject set tell the learner nothing.
    const blockSets = new Map();
    data.loopBlocks.forEach(function (b) {
      const key = data.matchBlock(b).map(function (r) { return r.course; }).sort().join(',');
      if (key && blockSets.has(key)) errs.push('loop blocks "' + blockSets.get(key) + '" and "' + b.id + '" feed from the same subjects');
      else blockSets.set(key, b.id);
    });
    data.loopEdges.forEach(function (e) {
      const where = 'loop edge "' + e.id + '"';
      if (!blockIndex.has(e.from)) errs.push(where + ': unknown from "' + e.from + '"');
      if (e.to !== '*' && e.to !== null && !blockIndex.has(e.to)) errs.push(where + ': unknown to "' + e.to + '"');
      (e.around || []).forEach(function (id) { if (!blockIndex.has(id)) errs.push(where + ': unknown block "' + id + '"'); });
      if (['solid', 'dashed', 'dotted'].indexOf(e.style) < 0) errs.push(where + ': bad style');
    });

    // Trace and tests.
    const testIds = data.tests.map(function (t) { return t.id; });
    data.trace.forEach(function (row) {
      row.tests.forEach(function (t) {
        const test = data.tests.find(function (x) { return x.id === t; });
        if (!test) errs.push('trace ' + row.req + ': unknown test ' + t);
        else if (test.reqs.indexOf(row.req) < 0) errs.push('trace ' + row.req + ': test ' + t + ' does not list it');
      });
    });
    data.tests.forEach(function (t) {
      t.reqs.forEach(function (req) {
        const row = data.trace.find(function (x) { return x.req === req; });
        if (!row || row.tests.indexOf(t.id) < 0) errs.push('test ' + t.id + ': ' + req + ' missing from trace');
      });
    });
    count('tests', testIds.length, 6);

    // Risks and log.
    const LEVEL = { Low: 1, Medium: 2, High: 3 };
    data.risks.forEach(function (r) {
      const where = 'risk "' + r.id + '"';
      if (LEVEL[r.likelihood] !== r.L || LEVEL[r.impact] !== r.I || r.score !== r.L * r.I) errs.push(where + ': inconsistent scores');
      if (!moduleIndex.has(r.module)) errs.push(where + ': unknown module');
      const res = r.residual;
      if (!res || LEVEL[res.likelihood] !== res.L || LEVEL[res.impact] !== res.I || res.score !== res.L * res.I) {
        errs.push(where + ': inconsistent residual');
      }
    });
    data.log.forEach(function (row, i) {
      if (row.iteration !== i + 1 || row.label !== 'Iteration ' + (i + 1)) errs.push('log row ' + i + ': bad iteration label');
    });

    // Glossary.
    data.glossary.forEach(function (g) {
      const where = 'glossary "' + g.id + '"';
      if (!nonEmpty(g.term) || !nonEmpty(g.def)) errs.push(where + ': needs term and def');
      if (!Array.isArray(g.modules) || !g.modules.length) errs.push(where + ': needs modules');
      (g.modules || []).forEach(function (m) { if (!moduleIndex.has(m)) errs.push(where + ': unknown module "' + m + '"'); });
      (g.see || []).forEach(function (s) {
        if (s === g.id) errs.push(where + ': links to itself');
        else if (!termIndex.has(s)) errs.push(where + ': unknown see-term "' + s + '"');
      });
    });

    if (errs.length) {
      throw new Error('ADCS.data.validate: ' + errs.length + ' problem(s)\n - ' + errs.join('\n - '));
    }
    const s = data.stats();
    return { ok: true, courses: s.courses, disciplines: s.disciplines, modules: s.modules,
      links: s.links, glossary: data.glossary.length };
  };
})(typeof window !== 'undefined' ? window : globalThis);
