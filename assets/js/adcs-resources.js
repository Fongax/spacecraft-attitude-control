/**
 * adcs-resources.js: ADCS.resources, the further-reading bibliography.
 *
 * Published works that explain each module's ideas in more depth. Every entry was found by a web
 * search and then independently re-checked by a second search (title, authors, year, URL and free
 * access); `checked` is the month of that check. Every entry is free to read online; access
 * 'free-registration' needs a free account. Links can move over time.
 *
 * Item: {id, title, authors[], year (string; may be a note such as "continuously updated"), venue,
 *   url, type: paper|report|book|course|video|standard|handbook|tutorial|software|case-study,
 *   access: free|free-registration, level: intro|intermediate|advanced, modules[] (m01…m13),
 *   concepts[] (slugs or short phrases), why (1–3 sentences)}.
 *
 * Data only: no DOM access, so the file also loads in Node (tests/run-node.js). Rendered by
 * ADCS.ui.renderReading (assets/js/adcs-reading.js) on the module pages and resources.html.
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};

  ADCS.resources = {
    checked: '2026-10',
    items: [
      {
        id: 'ariane-501-1996-inquiry-board',
        title: 'Ariane 5 Flight 501 Failure: Report by the Inquiry Board',
        authors: ['Jacques-Louis Lions (Chairman), Ariane 501 Inquiry Board'],
        year: '1996',
        venue: 'European Space Agency / CNES',
        url: 'https://sci.esa.int/web/cluster/-/38889-ariane-501-report-by-board-of-inquiry',
        type: 'case-study',
        access: 'free',
        level: 'intro',
        modules: ['m01', 'm09', 'm12', 'm13'],
        concepts: [
          'a margin holds only inside the verified envelope',
          'no extrapolation beyond the sampled range',
          'simulation and test coverage gaps',
          'worst credible case',
          'redundant layers with the same hole (common-mode failure)',
          'assumption that faults are random hardware failures',
          'reused software assumptions',
          'loss of guidance and attitude',
          'assumptions-scope',
          'requirement',
          'verification-methods',
          'lessons-learned'
        ],
        why: "Inertial reference software reused from Ariane 4 was never exercised with Ariane 5's own trajectory, and it failed outside the range it had been justified for. It is the classic warning behind m09's 'worst cases and margins' section: the peak-rate margin is conditional on the sampled initial conditions and says nothing beyond them."
      },
      {
        id: 'mco-1999-mishap-board-phase1',
        title: 'Mars Climate Orbiter Mishap Investigation Board Phase I Report',
        authors: ['Mars Climate Orbiter Mishap Investigation Board (Arthur G. Stephenson, Chairman)'],
        year: '1999',
        venue: 'NASA (hosted in the NASA Lessons Learned library)',
        url: 'https://llis.nasa.gov/llis_lib/pdf/1009464main1_0641-mr.pdf',
        type: 'case-study',
        access: 'free',
        level: 'intro',
        modules: ['m01', 'm12', 'm13'],
        concepts: [
          'navigation anomalies not escalated',
          'communication between ground teams',
          'formal anomaly reporting',
          'operations staffing and training',
          'contributing causes as layers',
          'requirement',
          'traceability',
          'verification-methods',
          'interface-requirements',
          'lessons-learned'
        ],
        why: "Beyond the units mix-up, most of the board's contributing causes are about operations. Navigators saw trajectory discrepancies in cruise, but the concern never went through the formal anomaly-reporting process. A possible correction manoeuvre was discussed and not performed, and the teams were thinly staffed. It supports m13's just-culture point that a worry raised informally is not yet safety data."
      },
      {
        id: 'nasa-2017-cubesat-101',
        title: 'CubeSat 101: Basic Concepts and Processes for First-Time CubeSat Developers',
        authors: ['NASA CubeSat Launch Initiative', 'Cal Poly CubeSat Systems Engineer Lab'],
        year: '2017',
        venue: 'NASA CubeSat Launch Initiative',
        url: 'https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf',
        type: 'handbook',
        access: 'free',
        level: 'intro',
        modules: ['m01', 'm12'],
        concepts: ['project-lifecycle', 'schedule', 'verification-methods', 'requirement', 'risk-register'],
        why: 'A plain-language guide to the full small-spacecraft project, from mission concept and team organisation through scheduling, launch requirements, verification testing and certification documents. It scales the NASA processes down to a small team like the one in this project.'
      },
      {
        id: 'sebok-vee-life-cycle-model',
        title: 'Vee Life Cycle Model (SEBoK article)',
        authors: ['Dick Fairley', 'Kevin Forsberg', 'Ray Madachy', 'Phyllis Marbach'],
        year: '2025',
        venue: 'Guide to the Systems Engineering Body of Knowledge (SEBoK), BKCASE / INCOSE',
        url: 'https://sebokwiki.org/wiki/Vee_Life_Cycle_Model',
        type: 'tutorial',
        access: 'free',
        level: 'intro',
        modules: ['m01'],
        concepts: ['v-model', 'verification-methods', 'traceability', 'requirement'],
        why: "A short, free explanation of the V-model, co-written by Kevin Forsberg, one of the model's originators. It shows how each specification on the left of the V is paired with the verification step on the right. It stands in for the original 1991 Forsberg and Mooz paper, which is paywalled."
      },
      {
        id: 'alpern-schneider-1985-defining-liveness',
        title: 'Defining Liveness',
        authors: ['Bowen Alpern', 'Fred B. Schneider'],
        year: '1985',
        venue: 'Information Processing Letters 21(4):181-185; Cornell CS Technical Report TR85-650',
        url: 'https://ecommons.cornell.edu/entities/publication/2ed32f4f-cc5c-413b-ba16-5498641f1939',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m01'],
        concepts: ['safety-property', 'liveness-property', 'requirement'],
        why: "The classic formal definition of safety ('nothing bad happens') and liveness ('something good eventually happens'), with the result that every property is the intersection of the two. It explains why one log sample can refute REQ-S1 while REQ-L1 needs a time bound to be testable."
      },
      {
        id: 'gotel-finkelstein-1994-traceability',
        title: 'An Analysis of the Requirements Traceability Problem',
        authors: ['Orlena C. Z. Gotel', 'Anthony C. W. Finkelstein'],
        year: '1994',
        venue: "Proceedings of the 1st IEEE International Conference on Requirements Engineering (ICRE '94), pp. 94-101",
        url: 'https://discovery.ucl.ac.uk/749/',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m01'],
        concepts: ['traceability', 'requirement'],
        why: 'The seminal paper on requirements traceability, based on interviews with over 100 practitioners. It separates pre-specification traceability (where a requirement came from) from post-specification traceability (where it goes: design, tests). That split explains why a requirement with no linked tests is a silent gap.'
      },
      {
        id: 'nasa-2010-ridm-handbook',
        title: 'NASA Risk-Informed Decision Making Handbook (NASA/SP-2010-576, Version 1.0)',
        authors: [
          'Homayoon Dezfuli',
          'Michael Stamatelatos',
          'Gaspare Maggio',
          'Christopher Everett',
          'Robert Youngblood',
          'Peter Rutledge',
          'Allan Benjamin',
          'Rodney Williams',
          'Curtis Smith',
          'Sergio Guarro'
        ],
        year: '2010',
        venue: 'NASA Special Publication (NTRS 20100021361)',
        url: 'https://ntrs.nasa.gov/citations/20100021361',
        type: 'handbook',
        access: 'free',
        level: 'advanced',
        modules: ['m01', 'm12'],
        concepts: ['trade-studies', 'decision-analysis', 'requirement', 'margin', 'risk-register'],
        why: 'Shows how to run a trade study between design alternatives under uncertainty and turn the chosen option into performance commitments that become baseline requirements. It links trade studies, margins and risk acceptance in one worked process.'
      },
      {
        id: 'leveson-2011-engineering-a-safer-world',
        title: 'Engineering a Safer World: Systems Thinking Applied to Safety',
        authors: ['Nancy G. Leveson'],
        year: '2011',
        venue: 'MIT Press (Engineering Systems series); open-access edition in the OAPEN Library',
        url: 'https://library.oapen.org/handle/20.500.12657/26043',
        type: 'book',
        access: 'free',
        level: 'advanced',
        modules: ['m01', 'm12', 'm13'],
        concepts: [
          'limits of chain-of-events and Swiss-cheese models',
          'STAMP and STPA',
          'safety culture and blame',
          'accidents from unsafe interactions',
          "operators' mental models",
          'hazard-analysis',
          'safety-constraints',
          'bow-tie',
          'lessons-learned',
          'risk-register'
        ],
        why: "A free, advanced counterpoint to m13's Swiss-cheese widget. Leveson argues that many accidents, especially software-intensive ones, come from flawed control and unsafe interactions between parts that each worked, not from failed layers lining up. Her treatment of operators' mental models and of blame in safety culture extends the annunciation and just-culture sections."
      },
      {
        id: 'mit-ocw-16-842-fundamentals-of-systems-engineering',
        title: '16.842 Fundamentals of Systems Engineering (Fall 2015)',
        authors: ['Olivier de Weck'],
        year: '2015',
        venue: 'MIT OpenCourseWare',
        url: 'https://ocw.mit.edu/courses/16-842-fundamentals-of-systems-engineering-fall-2015/',
        type: 'course',
        access: 'free',
        level: 'intermediate',
        modules: ['m01', 'm12'],
        concepts: [
          'requirement',
          'v-model',
          'verification-methods',
          'trade-studies',
          'stakeholder-analysis',
          'technical-risk-management'
        ],
        why: 'A full graduate course with lecture videos and notes that walks the V-model end to end. Session 2 (Requirements Definition) and Session 9 (Verification and Validation, with technical risk management and flight readiness review) line up with the requirements and risk modules.'
      },
      {
        id: 'nasa-2016-systems-engineering-handbook',
        title: 'NASA Systems Engineering Handbook (NASA/SP-2016-6105 Rev 2)',
        authors: ['NASA Office of the Chief Engineer'],
        year: '2016',
        venue: 'NASA Special Publication (NTRS 20170001761)',
        url: 'https://ntrs.nasa.gov/citations/20170001761',
        type: 'handbook',
        access: 'free',
        level: 'intermediate',
        modules: ['m01', 'm12'],
        concepts: [
          'requirement',
          'traceability',
          'verification-methods',
          'v-model',
          'trade-studies',
          'margin',
          'technical-risk-management',
          'lessons-learned'
        ],
        why: "The standard free reference for how NASA turns stakeholder needs into verifiable requirements and traces them through design, verification and validation; Appendix C gives a 'how to write a good requirement' checklist that matches the requirement linter. Section 6.4 links technical risk management back to the same life cycle."
      },
      {
        id: 'ecss-e-st-10-02c-rev1-verification',
        title: 'ECSS-E-ST-10-02C Rev.1: Space engineering - Verification',
        authors: ['European Cooperation for Space Standardization (ECSS)'],
        year: '2018',
        venue: 'ECSS standard (ESA / national agencies / industry)',
        url: 'https://ecss.nl/standard/ecss-e-st-10-02c-rev-1-verification-1-february-2018/',
        type: 'standard',
        access: 'free-registration',
        level: 'intermediate',
        modules: ['m01'],
        concepts: ['verification-methods', 'traceability', 'requirement', 'verification-control-document'],
        why: "The European space standard that defines the verification methods (test, analysis, review-of-design, inspection) and the verification control document that tracks each requirement to its close-out evidence. It is the industrial version of the module's requirement-to-test matrix."
      },
      {
        id: 'harel-2007-statecharts-in-the-making',
        title: 'Statecharts in the Making: A Personal Account',
        authors: ['David Harel'],
        year: '2007',
        venue: 'Third ACM SIGPLAN Conference on History of Programming Languages (HOPL III), San Diego; author-hosted copy at the Weizmann Institute (condensed version in Communications of the ACM, 2009)',
        url: 'https://weizmann.ac.il/math/harel/sites/math.harel/files/users/user50/Statecharts.History.pdf',
        type: 'paper',
        access: 'free',
        level: 'intro',
        modules: ['m02', 'm08'],
        concepts: [
          'finite state machines',
          'statecharts: hierarchy, concurrency, communication',
          'extended state machine',
          'modes as states with guarded transitions',
          'executable models and code generation'
        ],
        why: 'Harel tells how statecharts came out of avionics work with real systems engineers, and in doing so explains why flat state diagrams blow up and how hierarchy and concurrency tame them. It is a gentle way into the formalism behind the three-mode supervisor. The original technical paper is Science of Computer Programming 8 (1987) 231-274.'
      },
      {
        id: 'lee-seshia-2017-embedded-systems',
        title: 'Introduction to Embedded Systems: A Cyber-Physical Systems Approach (2nd edition)',
        authors: ['Edward A. Lee', 'Sanjit A. Seshia'],
        year: '2017',
        venue: 'MIT Press (free PDF edition from the authors at leeseshia.org)',
        url: 'https://leeseshia.org',
        type: 'book',
        access: 'free',
        level: 'intro',
        modules: ['m02', 'm08'],
        concepts: [
          'finite state machines',
          'extended state machines',
          'hysteresis (thermostat example)',
          'modal and hybrid models',
          'invariants and temporal logic',
          'reachability analysis and model checking'
        ],
        why: 'This free textbook builds from FSMs and extended state machines (with a thermostat that uses hysteresis and timers) through hybrid modal models to invariants, LTL and explicit-state model checking. That is the path m02 and m08 take, at undergraduate level.'
      },
      {
        id: 'hespanha-morse-1999-average-dwell-time',
        title: 'Stability of Switched Systems with Average Dwell-Time',
        authors: ['João P. Hespanha', 'A. Stephen Morse'],
        year: '1999',
        venue: 'Proceedings of the 38th IEEE Conference on Decision and Control, Phoenix, AZ (doi:10.1109/CDC.1999.831330); author-hosted PDF',
        url: 'https://web.ece.ucsb.edu/~hespanha/published/avedwell.pdf',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m02', 'm08'],
        concepts: [
          'dwell time',
          'anti-flapping',
          'switched controllers',
          'stability under mode switching',
          'hysteresis-based switching'
        ],
        why: 'This is the classic control-theory result behind dwell timers: switching among stable controllers keeps the closed loop stable as long as switching is slow on average. It gives a rigorous reason for the 8 s SAFE_HOLD dwell and the anti-flapping lemma.'
      },
      {
        id: 'dvorak-2009-flight-software-complexity',
        title: 'NASA Study on Flight Software Complexity: Final Report',
        authors: ['Daniel L. Dvorak (editor)'],
        year: '2009',
        venue: 'NASA Office of the Chief Engineer, Technical Excellence Program',
        url: 'https://www.nasa.gov/wp-content/uploads/2015/04/418878main_fswc_final_report.pdf',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m02', 'm08'],
        concepts: [
          'flight software architecture',
          'fault management complexity',
          'integrating fault protection with nominal control',
          'software layering and interfaces',
          'verification cost'
        ],
        why: "A multi-centre NASA study of why flight software keeps growing, with a dedicated fault management section that argues for integrating fault protection with nominal control. It supports m02's architectural point that the supervisor selects control laws through clean interfaces, and m08's warning that fault logic is where complexity hides."
      },
      {
        id: 'ecss-2013-aocs-requirements',
        title: 'ECSS-E-ST-60-30C: Space Engineering, Satellite Attitude and Orbit Control System (AOCS) Requirements',
        authors: ['European Cooperation for Space Standardization (ECSS)'],
        year: '2013',
        venue: 'ECSS standard (30 August 2013), ESA-ESTEC',
        url: 'https://ecss.nl/standard/ecss-e-st-60-30c-satellite-attitude-and-orbit-control-system-aocs-requirements/',
        type: 'standard',
        access: 'free-registration',
        level: 'advanced',
        modules: ['m02', 'm08'],
        concepts: [
          'AOCS architecture and functions',
          'AOCS mode management',
          'AOCS FDIR requirements',
          'requirements baseline for attitude control'
        ],
        why: "The European baseline for how an AOCS must be specified and verified, covering its functions, modes, FDIR, operations and performance. Reading it shows how the site's NOMINAL/SAFE_DETUMBLE/SAFE_HOLD architecture and fault flag would be written up as formal requirements on a real satellite project."
      },
      {
        id: 'jaxa-2016-hitomi-experience-report',
        title: 'Hitomi Experience Report: Investigation of Anomalies Affecting the X-ray Astronomy Satellite "Hitomi" (ASTRO-H)',
        authors: ['Japan Aerospace Exploration Agency (JAXA)'],
        year: '2016',
        venue: 'JAXA report (24 May 2016 version)',
        url: 'https://global.jaxa.jp/projects/sat/astro_h/files/topics_20160524.pdf',
        type: 'case-study',
        access: 'free',
        level: 'intermediate',
        modules: ['m02', 'm08', 'm13'],
        concepts: [
          'parameter upload without end-to-end check',
          'trusting a faulty rate estimate',
          'safe mode acting on wrong parameters',
          'operations and project-management reforms',
          'safe mode triggered by sensor error',
          'reaction-wheel momentum build-up',
          'thruster safe-mode with wrong parameters',
          'specification and configuration gaps',
          'loss of spacecraft'
        ],
        why: "Two m13 sections meet here. The thruster parameters that spun Hitomi up had been changed and uploaded without being checked against the real vehicle, which is why m13 wants gain uploads verified and atomic. The attitude system also trusted a wrong rate estimate between ground contacts. JAXA's report then lists the operations and management reforms that followed."
      },
      {
        id: 'mit-ocw-2009-16-07-dynamics',
        title: '16.07 Dynamics (Fall 2009): lecture notes L28-L30 on three-dimensional rigid-body dynamics',
        authors: ['Sheila Widnall', 'John Deyst', 'Edward Greitzer'],
        year: '2009',
        venue: 'MIT OpenCourseWare, MIT Department of Aeronautics and Astronautics',
        url: 'https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/pages/lecture-notes',
        type: 'course',
        access: 'free',
        level: 'intro',
        modules: ['m03'],
        concepts: [
          'angular momentum H = J omega',
          'inertia tensor and principal axes',
          "Euler's equations",
          'Euler angles',
          'torque-free motion',
          'gyroscopic motion and precession'
        ],
        why: "These notes, written for second-year aerospace students, derive the rigid-body equations step by step: angular momentum and the inertia tensor in L28, Euler angles and torque-free motion in L29, and Euler's equations with gyroscopic precession in L30. They cover the same ground as the rigid-body, euler and gyro sections of m03, so they are a good second explanation."
      },
      {
        id: 'likins-1966-energy-dissipation-jpl-tr-32-860',
        title: 'Effects of Energy Dissipation on the Free Body Motions of Spacecraft',
        authors: ['Peter W. Likins'],
        year: '1966',
        venue: 'Jet Propulsion Laboratory, California Institute of Technology, Technical Report 32-860 (NASA Technical Reports Server)',
        url: 'https://ntrs.nasa.gov/citations/19660020833',
        type: 'case-study',
        access: 'free',
        level: 'advanced',
        modules: ['m03'],
        concepts: [
          'major-axis rule',
          'energy dissipation at constant angular momentum',
          'Explorer 1 spin-axis departure',
          'energy-sink and modal models',
          'stability of spinning spacecraft'
        ],
        why: "The rigid-body theory in m03 says spin about the major or minor axis is stable. Explorer 1 (1958) showed that a slightly flexible spacecraft spinning about its minor axis ends up tumbling about its major axis. Likins' JPL report sets out how engineers modelled this energy dissipation, and it is the origin of the major-axis rule that sits alongside the intermediate-axis theorem."
      },
      {
        id: 'nasa-sp-8058-1971-aerodynamic-torques',
        title: 'Spacecraft Aerodynamic Torques (NASA SP-8058, Space Vehicle Design Criteria: Guidance and Control)',
        authors: ['NASA'],
        year: '1971',
        venue: 'NASA Special Publication SP-8058 (January 1971), NASA Technical Reports Server',
        url: 'https://ntrs.nasa.gov/citations/19710016459',
        type: 'standard',
        access: 'free',
        level: 'intermediate',
        modules: ['m03'],
        concepts: [
          'aerodynamic (drag) disturbance torque',
          'free-molecular flow',
          'drag coefficient',
          'centre-of-pressure to centre-of-mass offset',
          'atmospheric density variability'
        ],
        why: 'Drag is the torque that varies most with altitude and solar activity. This monograph shows how to estimate it for a spacecraft in a long-duration orbit, using free-molecular flow and the offset between the centre of pressure and the centre of mass. Use it with the drag inputs (C_D, area, offset, density) in the W3.5 estimator.'
      },
      {
        id: 'henderson-1977-euler-quaternions-shuttle',
        title: 'Euler Angles, Quaternions, and Transformation Matrices for Space Shuttle Analysis',
        authors: ['D. M. Henderson'],
        year: '1977',
        venue: 'NASA contractor report, McDonnell-Douglas Technical Services Co., Houston, for NASA Johnson Space Center (NASA Technical Reports Server)',
        url: 'https://ntrs.nasa.gov/citations/19770019231',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m03', 'm11'],
        concepts: [
          'twelve Euler-angle sequences',
          'Euler angles to DCM',
          'quaternion to DCM',
          'Euler angles from DCM elements',
          'quaternion from Euler angles'
        ],
        why: 'This NASA engineering report from the Shuttle programme writes out all twelve Euler transformation matrices and the conversions from quaternion to Euler angles and back. It is the place to check 3-2-1 extraction formulas such as roll = atan2(C23, C33) against another sequence, and it shows how flight software handled these conversions in practice.'
      },
      {
        id: 'markley-2002-attitude-error-representations',
        title: 'Attitude Error Representations for Kalman Filtering',
        authors: ['F. Landis Markley'],
        year: '2002',
        venue: 'NASA Goddard Space Flight Center (NASA Technical Reports Server document 20020060647)',
        url: 'https://ntrs.nasa.gov/citations/20020060647',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m03', 'm05', 'm07'],
        concepts: [
          'error quaternion',
          'three-parameter attitude error representations',
          'small-angle approximation theta ~ 2 q_v',
          'unit-norm constraint',
          'multiplicative extended Kalman filter'
        ],
        why: 'Markley explains why a globally nonsingular attitude needs four parameters, while a small attitude error is best described with three. He compares the usual choices (twice the vector part of the error quaternion, Rodrigues parameters, rotation vector). This is the background to the small-angle approximation in the m03 error section and to its use in the m05 controller and the m07 filter.'
      },
      {
        id: 'mit-ocw-2003-16-61-aerospace-dynamics',
        title: '16.61 Aerospace Dynamics (Spring 2003)',
        authors: ['Jonathan P. How', 'John Deyst'],
        year: '2003',
        venue: 'MIT OpenCourseWare',
        url: 'https://ocw.mit.edu/courses/16-61-aerospace-dynamics-spring-2003',
        type: 'course',
        access: 'free',
        level: 'intermediate',
        modules: ['m03'],
        concepts: [
          'aircraft flight dynamics',
          'spacecraft attitude dynamics',
          'attitude control and typical requirements',
          'rigid-body equations shared by aircraft and spacecraft'
        ],
        why: "This follow-on dynamics course applies the same rigid-body equations to aircraft flight dynamics and to spacecraft attitude, which is the comparison m03 makes when it reduces the aircraft moment equations to Euler's equations when Ixz = 0. The later lectures move on to spacecraft attitude motion and requirements."
      },
      {
        id: 'diebel-2006-representing-attitude',
        title: 'Representing Attitude: Euler Angles, Unit Quaternions, and Rotation Vectors',
        authors: ['James Diebel'],
        year: '2006',
        venue: 'Stanford University technical report (20 October 2006); copy hosted with the Kapteyn Package documentation, Kapteyn Astronomical Institute, University of Groningen',
        url: 'https://www.astro.rug.nl/software/kapteyn-beta/_downloads/attitude.pdf',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m03', 'm11'],
        concepts: [
          'rotation matrix (DCM)',
          'Euler angle sequences and their singularities',
          'unit quaternions',
          'rotation vectors',
          'conversions between representations',
          'kinematic rates for each representation'
        ],
        why: "A compact reference that covers, in one consistent notation, the rotation matrix, Euler-angle sequences, the unit quaternion and the rotation vector, with conversions and rate equations between them. It also shows why the rotation vector avoids both the Euler-angle singularity and the quaternion's unit-norm constraint. Use it to check the quaternion to DCM and Euler-angle formulas in m03, but compare its frame and ordering conventions with this site's before copying any formula."
      },
      {
        id: 'vanderha-shuster-2009-tutorial-vectors-attitude',
        title: 'A Tutorial on Vectors and Attitude',
        authors: ['Jozef C. van der Ha', 'Malcolm D. Shuster'],
        year: '2009',
        venue: 'IEEE Control Systems Magazine, vol. 29, no. 2 (April 2009); author preprint on malcolmdshuster.com',
        url: 'https://malcolmdshuster.com/Doorway_Preprints.htm',
        type: 'tutorial',
        access: 'free',
        level: 'intermediate',
        modules: ['m03'],
        concepts: [
          'physical vectors vs column representations',
          'reference frames',
          'attitude matrix (DCM)',
          'passive vs active rotations',
          'frame conventions'
        ],
        why: 'Shuster wrote the standard survey of attitude representations, and this tutorial covers the groundwork behind it: the difference between a vector and its components in a frame, and how the attitude matrix maps one to the other. It helps prevent the sign and transpose mistakes that come from mixing up frames when reading C(q) in m03.'
      },
      {
        id: 'sola-2017-quaternion-kinematics-eskf',
        title: 'Quaternion kinematics for the error-state Kalman filter',
        authors: ['Joan Solà'],
        year: '2017',
        venue: 'arXiv:1711.02508 [cs.RO]',
        url: 'https://arxiv.org/abs/1711.02508',
        type: 'tutorial',
        access: 'free',
        level: 'advanced',
        modules: ['m03', 'm07'],
        concepts: [
          'quaternion algebra and Hamilton product',
          'quaternion kinematics q_dot = 1/2 Omega(omega) q',
          'rotation group SO(3) and its Lie structure',
          'exponential map and rotation vector',
          'rotation perturbations and Jacobians',
          'error-state (multiplicative) Kalman filter'
        ],
        why: 'A long, self-contained treatment of quaternion algebra, the exponential map, time derivatives and integration of quaternions, with a careful discussion of the Hamilton and JPL conventions. It takes the quaternion kinematics of m03 through to the error-state filters that the m07 extension simplifies.'
      },
      {
        id: 'vandamme-2017-tennis-racket-effect',
        title: 'The tennis racket effect in a three-dimensional rigid body',
        authors: ['Léo Van Damme', 'Pavao Mardešić', 'Dominique Sugny'],
        year: '2017',
        venue: 'Physica D: Nonlinear Phenomena, vol. 338, pp. 17-25 (preprint arXiv:1606.08237)',
        url: 'https://arxiv.org/abs/1606.08237',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m03'],
        concepts: [
          'intermediate-axis theorem',
          'tennis racket (Dzhanibekov) effect',
          'torque-free Euler equations',
          'separatrix dynamics',
          'robustness to moments of inertia and initial conditions'
        ],
        why: "A modern analysis of the 'twist' that accompanies a flip about the intermediate axis, with a simple formula for estimating its size for any set of moments of inertia. It turns the flips seen in the tennis-racket lab into a quantitative result that holds for most rigid bodies."
      },
      {
        id: 'sommer-2018-flipped-quaternion-multiplication',
        title: 'Why and How to Avoid the Flipped Quaternion Multiplication',
        authors: [
          'Hannes Sommer',
          'Igor Gilitschenski',
          'Michael Bloesch',
          'Stephan Weiss',
          'Roland Siegwart',
          'Juan Nieto'
        ],
        year: '2018',
        venue: 'Aerospace (MDPI), vol. 5, no. 3, article 72 (open access); also arXiv:1801.07478',
        url: 'https://doi.org/10.3390/aerospace5030072',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m03'],
        concepts: [
          'Hamilton product',
          'JPL (flipped) quaternion multiplication',
          'passive world-to-body rotation',
          'scalar-first vs scalar-last ordering',
          "detecting a library's quaternion convention"
        ],
        why: 'Quaternion formulas copied between textbooks, papers and libraries often fail because they use different multiplication and ordering conventions. This open-access paper explains the Hamilton and JPL conventions and gives a recipe for working out which one a source uses. Read it before reusing any outside formula with the Hamilton-product, scalar-first quaternions taught in m03.'
      },
      {
        id: 'moler-2015-solving-odes-in-matlab',
        title: 'Solving ODEs in MATLAB (video series in RES.18-009 Learn Differential Equations: Up Close with Gilbert Strang and Cleve Moler)',
        authors: ['Cleve Moler', 'Gilbert Strang'],
        year: '2015',
        venue: 'MIT OpenCourseWare, RES.18-009, Fall 2015',
        url: 'https://www.ocw.mit.edu/courses/res-18-009-learn-differential-equations-up-close-with-gilbert-strang-and-cleve-moler-fall-2015/video_galleries/solving-odes-in-matlab',
        type: 'video',
        access: 'free',
        level: 'intro',
        modules: ['m04'],
        concepts: [
          'forward Euler (ODE1)',
          'midpoint method (ODE2)',
          'classical Runge-Kutta (ODE4)',
          'order of accuracy and naming conventions',
          'error estimation and adaptive step (ODE23, ODE45)',
          'stiffness and step-size stability'
        ],
        why: 'Short lectures by the author of MATLAB that build the solvers one at a time, starting with Euler and ending at RK4 and the adaptive codes. It is a good first pass at the m04 ideas of order and stiffness before you look at the stability algebra.'
      },
      {
        id: 'goldberg-1991-floating-point',
        title: 'What Every Computer Scientist Should Know About Floating-Point Arithmetic',
        authors: ['David Goldberg'],
        year: '1991',
        venue: 'ACM Computing Surveys 23(1), March 1991; reprinted by Sun/Oracle as Appendix D of the Numerical Computation Guide',
        url: 'https://docs.oracle.com/cd/E19957-01/816-2464/ncg_goldberg.html',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m04', 'm10'],
        concepts: [
          'IEEE 754 representation',
          'rounding error and machine epsilon',
          'ulps and relative error',
          'catastrophic cancellation',
          'why 0.1 is not exact in binary',
          'comparing floats with tolerances'
        ],
        why: 'This is the standard reference on how floating point actually behaves. It explains why summing 0.01 eight hundred times does not give exactly 8, and why acos loses precision near 1 while atan2 does not. Read it after the m04 float lab, when you want the full theory.'
      },
      {
        id: 'gao-1992-patriot-dhahran',
        title: 'Patriot Missile Defense: Software Problem Led to System Failure at Dhahran, Saudi Arabia (GAO/IMTEC-92-26)',
        authors: ['U.S. General Accounting Office'],
        year: '1992',
        venue: 'U.S. General Accounting Office report GAO/IMTEC-92-26, 4 February 1992',
        url: 'https://www.gao.gov/products/imtec-92-26',
        type: 'case-study',
        access: 'free',
        level: 'intermediate',
        modules: ['m04', 'm10', 'm13'],
        concepts: [
          'accumulated timer error',
          'fixed-point truncation of 0.1 in 24 bits',
          'error that grows with uptime',
          'integer tick counters vs summed float time',
          'fielding a software fix',
          'vague operational advisories',
          'degradation that grows with uptime',
          'fielding a fix during operations',
          "operators' knowledge of system limits"
        ],
        why: 'This is the official account of the failure in which a time counter, truncated to 24-bit fixed point and run for more than 100 hours, made the tracking gate drift until an intercept failed. It is the real-world version of the m04 dwell-timer lesson and the m10 word-size lesson.'
      },
      {
        id: 'moler-2004-numerical-computing-with-matlab',
        title: "Numerical Computing with MATLAB (electronic edition), chapter 'Ordinary Differential Equations'",
        authors: ['Cleve B. Moler'],
        year: '2004',
        venue: 'Society for Industrial and Applied Mathematics (SIAM); free chapter PDFs hosted by MathWorks',
        url: 'https://www.mathworks.com/moler/chapters.html',
        type: 'book',
        access: 'free',
        level: 'intermediate',
        modules: ['m04'],
        concepts: [
          'single-step methods and Runge-Kutta',
          'local vs global error and order',
          'step-size control',
          'stiffness',
          'floating-point arithmetic and machine epsilon'
        ],
        why: "The written companion to the videos. The ODE chapter derives the classical methods, shows how error scales with step size and explains stiffness through worked MATLAB examples. The introductory chapter's floating-point material gives background for the m04 precision lab."
      },
      {
        id: 'boyle-2017-integration-of-angular-velocity',
        title: 'The integration of angular velocity',
        authors: ['Michael Boyle'],
        year: '2017',
        venue: 'Advances in Applied Clifford Algebras 27 (2017), doi:10.1007/s00006-017-0793-z; preprint arXiv:1604.08139',
        url: 'https://arxiv.org/abs/1604.08139v2',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m04'],
        concepts: [
          'quaternion kinematics q-dot = 1/2 omega q',
          'integrating orientation from angular velocity',
          'quaternion norm drift and renormalisation',
          'general-purpose ODE integrators on rotations',
          'Lie-group integration'
        ],
        why: 'Boyle compares ways to recover attitude from a time-varying angular velocity and finds that integrating the quaternion directly with a standard integrator is the most accurate and efficient choice, with the norm handled separately. That is the argument behind the m04 renormalisation section.'
      },
      {
        id: 'driscoll-braun-fundamentals-of-numerical-computation',
        title: 'Fundamentals of Numerical Computation: Julia Edition',
        authors: ['Tobin A. Driscoll', 'Richard J. Braun'],
        year: '2022',
        venue: 'SIAM, 2022 (Julia edition; the MATLAB edition was 2017); free full online text at fncbook.com',
        url: 'https://fncbook.com/julia',
        type: 'book',
        access: 'free',
        level: 'intermediate',
        modules: ['m04'],
        concepts: [
          'initial-value problems',
          'Euler and Runge-Kutta methods',
          'convergence order measured by halving h',
          'absolute stability regions and stiffness',
          'adaptive step size',
          'floating-point error and conditioning'
        ],
        why: 'A modern open textbook that runs every algorithm as code you can try. Its initial-value-problem chapters cover the same steps as m04: check convergence order on a log-log plot, then use absolute stability to explain why a step that is too large blows up.'
      },
      {
        id: 'astrom-murray-feedback-systems-pid-windup',
        title: "Feedback Systems: An Introduction for Scientists and Engineers (chapter 'PID Control', section 'Integrator Windup')",
        authors: ['Karl Johan Åström', 'Richard M. Murray'],
        year: '2010',
        venue: 'Princeton University Press; free electronic edition v2.10c (third printing with corrections, March 2010) hosted on the Caltech CDS wiki',
        url: 'https://www.cds.caltech.edu/~murray/amwiki/PID_Control.html',
        type: 'book',
        access: 'free',
        level: 'intro',
        modules: ['m05'],
        concepts: [
          'PID control',
          'integral action and steady-state error',
          'integrator windup',
          'anti-windup',
          'actuator saturation'
        ],
        why: "This is the standard free introductory control textbook. Its PID chapter explains why integral action removes steady-state error, and why windup happens: once the actuator saturates, the loop is effectively open and the integral term keeps growing. It then gives anti-windup fixes. This is the theory behind the m05 windup demo and the site's 10% integral clamp."
      },
      {
        id: 'douglas-2018-understanding-pid-control',
        title: 'Understanding PID Control, Part 2: Expanding Beyond a Simple Integral (MATLAB Tech Talks series)',
        authors: ['Brian Douglas'],
        year: '2018',
        venue: 'MathWorks, MATLAB Tech Talks (Controls)',
        url: 'https://www.mathworks.com/videos/understanding-pid-control-part-2-expanding-beyond-a-simple-integral-1528310418260.html',
        type: 'video',
        access: 'free',
        level: 'intro',
        modules: ['m05'],
        concepts: [
          'P, I and D actions',
          'integral windup',
          'anti-windup (clamping, back-calculation)',
          'derivative filtering',
          'practical PID implementation'
        ],
        why: 'Brian Douglas explains control with clear sketches and no heavy algebra. Part 2 of this series covers integrator windup and how anti-windup schemes such as clamping work. That is the idea behind the m05 windup demo (W5.3) and its naive, clamp and conditional-integration variants. The same MathWorks page lists his other control Tech Talks, so it is also a good place to start for intuition on state space and LQR.'
      },
      {
        id: 'nasa-sst-soa-gnc-chapter',
        title: 'State-of-the-Art of Small Spacecraft Technology: Guidance, Navigation, and Control chapter',
        authors: ['NASA Small Spacecraft Systems Virtual Institute'],
        year: '2026',
        venue: 'NASA Ames Research Center, Small Spacecraft Systems Virtual Institute (online report, regularly updated; 2024 full-report PDF also available)',
        url: 'https://www.nasa.gov/smallsat-institute/sst-soa',
        type: 'report',
        access: 'free',
        level: 'intro',
        modules: ['m05', 'm06', 'm07'],
        concepts: [
          'small-spacecraft GNC and ADCS hardware',
          'reaction wheels and magnetorquers',
          'attitude sensors',
          'pointing and slew performance by spacecraft class',
          'technology readiness'
        ],
        why: "This is NASA's survey of what small-satellite GNC hardware in flight can actually do. Its summary table (Table 5-1) gives state-of-the-art performance for nano- to micro-class spacecraft. That helps readers judge whether the site's ±3 mN m torque limit, slew rates and pointing targets are realistic. Use it as a reference to dip into, not to read cover to cover."
      },
      {
        id: 'boyd-ee363-dlqr-lecture',
        title: 'EE363 Lecture 1: Linear quadratic regulator: Discrete-time finite horizon (with the companion lectures on steady-state and continuous-time LQR)',
        authors: ['Stephen Boyd'],
        year: '2008-09 (Winter quarter)',
        venue: 'Stanford University, EE363 lecture slides',
        url: 'https://web.stanford.edu/class/ee363/lectures/dlqr.pdf',
        type: 'course',
        access: 'free',
        level: 'advanced',
        modules: ['m05'],
        concepts: [
          'LQR cost function',
          'dynamic programming solution',
          'value function V_t(z) = z^T P_t z',
          'backward Riccati recursion',
          'steady-state LQR and convergence to the algebraic Riccati equation',
          'continuous-time LQR'
        ],
        why: "These slides are short and rigorous. They define the cost-to-go V_t(z), show that it is quadratic, and derive the backward Riccati recursion for P_t that gives the optimal gain. That is the m05 W5.4 'Bellman sweep' written out as mathematics. The companion lectures dlqr-ss.pdf and clqr.pdf show the recursion converging to the steady-state gain and cover the continuous-time CARE used for the closed-form per-axis gains."
      },
      {
        id: 'mit-ocw-2010-16-30-feedback-control-systems',
        title: '16.30 Feedback Control Systems (Fall 2010): lecture notes',
        authors: ['Jonathan How', 'Emilio Frazzoli'],
        year: '2010',
        venue: 'MIT OpenCourseWare, MIT Department of Aeronautics and Astronautics',
        url: 'https://ocw.mit.edu/courses/16-30-feedback-control-systems-fall-2010/pages/lecture-notes/',
        type: 'course',
        access: 'free',
        level: 'intermediate',
        modules: ['m05'],
        concepts: [
          'state-space design',
          'full-state feedback and pole placement',
          'deterministic LQR',
          'algebraic Riccati equation',
          'choosing the Q and R weights',
          'LQ servo (tracking with integral action)',
          'LQG'
        ],
        why: 'This is an aerospace undergraduate course in modern control. Lecture 18 covers deterministic LQR: the optimal control problem, the Riccati equation and how to choose the weights. That is exactly what m05 does when it builds per-axis gains from Q and R. Lectures 13 and 17 on the LQ servo show how integral action is added to state feedback, which links the pid and lqr sections. Lecture 19 on LQG links forward to estimation.'
      },
      {
        id: 'jensen-vinther-2010-aausat3-adcs-thesis',
        title: 'Attitude Determination and Control System for AAUSAT3',
        authors: ['Kasper Fuglsang Jensen', 'Kasper Vinther'],
        year: '2010',
        venue: "Master's thesis, Department of Electronic Systems, Aalborg University (June 2010)",
        url: 'https://projekter.aau.dk/projekter/files/32312420/thesis_10gr1035.pdf',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m05', 'm07', 'm04'],
        concepts: [
          'CubeSat ADCS design',
          'B-dot detumbling',
          'magnetorquers',
          'quaternion unscented Kalman filter',
          'Simulink simulation library',
          'ADCS hardware prototype'
        ],
        why: "This thesis is a complete student CubeSat ADCS design, written for a real satellite. It covers a reusable Simulink simulation library, a prototype with magnetometer, gyro, sun sensors and magnetorquers, a quaternion unscented Kalman filter for low-cost sensors, and a B-dot detumble law shown to work reliably. It shows how detumble, estimation and simulation fit into one flight design, much as the site's modules do."
      },
      {
        id: 'petit-sarras-2020-generalized-magnetic-detumbling',
        title: 'A generalized control law for uniform, global and exponential magnetic detumbling of rigid spacecraft',
        authors: ['Nicolas Petit', 'Ioannis Sarras'],
        year: '2020',
        venue: 'IFAC 2020 conference paper; open copy in the HAL archive of Mines ParisTech (hal-03021760)',
        url: 'https://hal-mines-paristech.archives-ouvertes.fr/hal-03021760v1',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m05', 'm06'],
        concepts: [
          'B-dot law',
          'magnetic detumbling',
          'strict Lyapunov function',
          'uniform global exponential stability',
          'time-varying systems'
        ],
        why: 'The paper shows that the well-known B-dot law is one member of a wider family of magnetic detumbling laws. It proves uniform, global, exponential convergence with an explicit time-varying strict Lyapunov function. Read it after the simple energy argument in m05 to see how much harder the proof gets when the actuator is a magnetorquer and the field changes around the orbit. The mathematics is graduate level.'
      },
      {
        id: 'astrom-murray-2021-feedback-systems',
        title: 'Feedback Systems: An Introduction for Scientists and Engineers, Second Edition (see the chapter "PID Control")',
        authors: ['Karl Johan Åström', 'Richard M. Murray'],
        year: '2021',
        venue: "Princeton University Press; chapter PDFs free on the authors' FBSwiki at Caltech (second-edition site now fbsbook.org)",
        url: 'https://www.cds.caltech.edu/~murray/amwiki/Second_Edition.html',
        type: 'book',
        access: 'free',
        level: 'intermediate',
        modules: ['m05'],
        concepts: [
          'PID control and PID tuning',
          'integrator windup and anti-windup',
          'derivative filtering and controller implementation',
          'state-space models and state feedback u = -Kx',
          'eigenvalue (pole) placement',
          'frequency response, Nyquist criterion, gain and phase margins'
        ],
        why: 'This is the standard free textbook on feedback, written for scientists and engineers as well as control specialists. The PID chapter covers what m05 sections pid and quaternion-pid teach: what the P, I and D actions do, tuning rules and why they need care, integrator windup and its fixes, and how to implement the controller. Other chapters give the state-space and state-feedback background behind the lqr section, and the gain and phase margins behind the pole viewer.'
      },
      {
        id: 'willis-2024-building-better-b-dot',
        title: 'Building a Better B-Dot: Fast Detumbling with Non-Monotonic Lyapunov Functions',
        authors: ['Jacob B. Willis', 'Paulo R. M. Fisch', 'Aleksei Seletskiy', 'Zachary Manchester'],
        year: '2024',
        venue: 'arXiv:2407.02724 (Robotic Exploration Lab, Robotics Institute, Carnegie Mellon University; author-hosted IEEE 2024 version on the lab site)',
        url: 'https://arxiv.org/abs/2407.02724',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m05', 'm06'],
        concepts: [
          'B-dot detumbling',
          'magnetorquer underactuation (no torque along B)',
          'Lyapunov functions',
          'non-monotonic Lyapunov functions',
          'detumble time and residual angular momentum'
        ],
        why: 'The paper starts from the classic B-dot law and explains why magnetorquer detumbling is underactuated: a coil cannot make torque along the local field. The authors then build a controller that predicts the field along the orbit, avoids configurations it cannot control, and detumbles faster to a lower final momentum. It pairs with the m05 Lyapunov proof that rate damping removes energy and with τ = m × B in m06. It shows what changes when the actuator cannot push in every direction.'
      },
      {
        id: 'tedrake-underactuated-lqr-chapter',
        title: 'Underactuated Robotics: Algorithms for Walking, Running, Swimming, Flying, and Manipulation, chapter "Linear Quadratic Regulators" (with the companion chapter "Dynamic Programming")',
        authors: ['Russ Tedrake'],
        year: 'continuously updated (course notes since 2009)',
        venue: 'Course notes for MIT 6.832 Underactuated Robotics, MIT CSAIL (free online textbook)',
        url: 'https://underactuated.csail.mit.edu/lqr.html',
        type: 'book',
        access: 'free',
        level: 'intermediate',
        modules: ['m05'],
        concepts: [
          'LQR for time-invariant linear systems',
          'Hamilton-Jacobi-Bellman sufficiency',
          'quadratic value function V(x) = x^T S x',
          'algebraic Riccati equation',
          'value iteration and dynamic programming',
          'double-integrator optimal control',
          'minimum-time bang-bang control with |u| <= 1'
        ],
        why: 'This free text derives LQR from dynamic programming. The cost-to-go is a quadratic form, and the Riccati equation follows from the Hamilton-Jacobi-Bellman condition. That is the same argument as the m05 bellman section, where V(x) = x^T P x and value iteration recovers the gain. The companion Dynamic Programming chapter works the double integrator with |u| <= 1, including the minimum-time bang-bang solution used in the m05 saturation section.'
      },
      {
        id: 'nasa-sst-soa-2021-gnc',
        title: 'State-of-the-Art of Small Spacecraft Technology: Guidance, Navigation, and Control chapter (2021 edition)',
        authors: ['NASA Small Spacecraft Systems Virtual Institute (NASA Ames Research Center)'],
        year: '2021',
        venue: 'NASA, Small Spacecraft Technology State-of-the-Art report (2021 edition), chapter PDF hosted on nasa.gov',
        url: 'https://www.nasa.gov/wp-content/uploads/2021/10/5.soa_gnc_2021.pdf',
        type: 'report',
        access: 'free',
        level: 'intro',
        modules: ['m06'],
        concepts: [
          'reaction wheels for small spacecraft',
          'magnetic torquers (magnetorquers)',
          'thrusters as attitude actuators',
          'momentum management',
          'CubeSat ADCS hardware and integrated ADCS units',
          'miniaturisation of GNC hardware for micro- and nano-spacecraft'
        ],
        why: "NASA's survey of the guidance, navigation and control hardware that small spacecraft actually fly. It covers the three actuator families in m06 (reaction wheels, magnetorquers and thrusters) and describes reaction wheels as providing both control torque and momentum management. Reading it next to the hardware and momentum sections shows readers how the module's Illustrative numbers (a 3 mN m torque limit, a 0.01 N m s wheel) compare with real CubeSat-class products. It also explains why three-axis control, once found only on 100 kg spacecraft, is now available on nanosatellites."
      },
      {
        id: 'kirtley-2013-mit-6685-electric-machines',
        title: '6.685 Electric Machines (Fall 2013): course notes',
        authors: ['James L. Kirtley Jr.'],
        year: '2013',
        venue: 'MIT OpenCourseWare (graduate course, Massachusetts Institute of Technology)',
        url: 'https://ocw.mit.edu/courses/6-685-electric-machines-fall-2013/pages/course-notes',
        type: 'course',
        access: 'free',
        level: 'advanced',
        modules: ['m06'],
        concepts: [
          'electromagnetic forces and torque production',
          'magnetic circuits',
          'permanent magnet motors (the family that includes brushless DC wheel motors)',
          'eddy currents and loss mechanisms',
          'machine models and design synthesis'
        ],
        why: "This is the deeper electrical background behind the m06 motor section. Kirtley's free course notes explain where the torque constant (τ = k_M I) and the back-EMF that limits wheel speed come from, and they include a chapter on permanent magnet motors, the type used in brushless reaction wheel motors. The chapter on losses explains why part of the input power ends up as heat. The course is graduate level and goes well beyond m06; readers who want the speed–torque line and back-EMF from first principles should start with the magnetic-circuit and permanent-magnet-motor chapters."
      },
      {
        id: 'howell-2014-k2-mission',
        title: 'The K2 Mission: Characterization and Early Results',
        authors: ['Steve B. Howell', 'et al.'],
        year: '2014',
        venue: 'Publications of the Astronomical Society of the Pacific (PASP); open preprint arXiv:1402.5163',
        url: 'https://arxiv.org/pdf/1402.5163',
        type: 'case-study',
        access: 'free',
        level: 'intermediate',
        modules: ['m06'],
        concepts: [
          'reaction wheel failure and loss of actuator authority',
          'three-axis pointing with only two reaction wheels',
          'solar radiation pressure as a disturbance torque',
          'balancing a disturbance torque by attitude choice',
          'momentum accumulation and thruster momentum dumping',
          'operational consequences of actuator loss'
        ],
        why: 'A real case study of what m06 teaches. After Kepler lost two of its four reaction wheels, NASA kept the telescope pointing in all three axes by combining the two remaining wheels with thrusters and by pointing so that solar pressure was balanced. Accumulated momentum was then dumped with thruster firings every two days. This is the momentum bucket of widget W6.3 working on an operational spacecraft: a steady disturbance fills the wheels at a known rate, and a separate actuator must empty them. The paper also shows how an actuator failure changes the mission itself, with the observing plan redesigned around campaigns of about 75 days.'
      },
      {
        id: 'baker-2020-cmg-skew-angle-singularity',
        title: 'Control Moment Gyroscope Skew Angle Variation and Singularity Penetration',
        authors: ['Kyle A. Baker'],
        year: '2020',
        venue: 'IntechOpen (open-access, peer-reviewed book chapter)',
        url: 'https://www.intechopen.com/chapters/70365',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m06'],
        concepts: [
          'control moment gyroscopes (CMGs) versus reaction wheels',
          'single-gimbal CMG arrays and skew (pyramid) angle',
          'CMG singularities',
          'steering laws and singularity penetration',
          'momentum envelope of an actuator array'
        ],
        why: "m06 covers only reaction wheels; control moment gyroscopes are the next step up. Instead of changing a wheel's speed, a CMG tilts a wheel that spins at constant speed, which gives much more torque for the same power. This open-access chapter starts with an introduction to CMGs and then looks at how the skew angle of the array changes its singularities, the gimbal configurations where the array cannot produce torque in some direction. It follows on from the allocation section: in the four-wheel pyramid, the body torque is the vector sum A·τ, and a CMG array is the case where that mapping can lose rank."
      },
      {
        id: 'welch-bishop-1995-intro-kalman-filter',
        title: 'An Introduction to the Kalman Filter',
        authors: ['Greg Welch', 'Gary Bishop'],
        year: '1995',
        venue: 'Technical Report TR 95-041, Department of Computer Science, University of North Carolina at Chapel Hill',
        url: 'https://techreports.cs.unc.edu/papers/95-041.pdf',
        type: 'report',
        access: 'free',
        level: 'intro',
        modules: ['m07'],
        concepts: [
          'discrete Kalman filter predict (time update) and correct (measurement update)',
          'process and measurement noise covariances Q and R',
          'a priori and a posteriori error covariance P- and P',
          'Kalman gain K = P- H^T (H P- H^T + R)^-1',
          'extended Kalman filter by linearisation',
          'effect of tuning Q and R (worked numerical example)'
        ],
        why: "This is the shortest free route from m07's Kalman equations to a working filter. It uses the same notation as the 'kalman' section (P-, K, H, R, and P = (I - KH)P-), separates the predict and correct steps the way W7.2 does, and its derivation of the extended Kalman filter connects the linear per-axis filter to the MEKF idea. Its small worked example shows what changing R does, which is the same effect learners see with the R slider in W7.2."
      },
      {
        id: 'labbe-kalman-bayesian-filters-python',
        title: 'Kalman and Bayesian Filters in Python',
        authors: ['Roger R. Labbe Jr.'],
        year: '2015',
        venue: 'Free online book (Jupyter notebooks) on GitHub, with the companion FilterPy library',
        url: 'https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python',
        type: 'book',
        access: 'free',
        level: 'intro',
        modules: ['m07'],
        concepts: [
          'g-h filter and discrete Bayes filter as first steps',
          'recursive Bayes estimation: predict with the process model, update with the likelihood',
          'Gaussians, variance and covariance',
          'univariate and multivariate Kalman filters',
          'designing Q and R and checking filter performance',
          'extended and unscented Kalman filters, particle filters',
          'FilterPy reference implementations'
        ],
        why: "Labbe builds the Kalman filter up from Bayes' rule, starting with a discrete Bayes filter and moving to the Gaussian case, which is the route m07's 'bayes' section takes. Every chapter is a runnable notebook, so a learner can rebuild the one-axis gyro plus absolute-sensor playground (W7.2) in Python and try Q/R tuning, filter divergence and EKF/UKF variants that the site only touches on."
      },
      {
        id: 'kalman-1960-new-approach-linear-filtering',
        title: 'A New Approach to Linear Filtering and Prediction Problems',
        authors: ['Rudolph E. Kalman'],
        year: '1960',
        venue: 'Journal of Basic Engineering, vol. 82, no. 1, pp. 35-45 (March 1960)',
        url: 'https://www.cs.unc.edu/~welch/kalman/media/pdf/Kalman1960.pdf',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m07', 'm05'],
        concepts: [
          'state-transition (state-space) model of a random process',
          'recursive optimal linear estimator',
          'orthogonal projection',
          'error-covariance (Riccati) recursion',
          'duality between optimal estimation and optimal regulation'
        ],
        why: "This is the paper that introduced the filter. m07 says the Kalman covariance recursion is the dual of the LQR Riccati recursion from m05, and the duality comes from this paper. The notation is from 1960 and the derivation uses orthogonal projection rather than Bayes' rule, so it is best read after Welch & Bishop or Labbe, as primary-source context rather than a first introduction."
      },
      {
        id: 'mahony-hamel-pflimlin-2008-nonlinear-complementary-so3',
        title: 'Nonlinear Complementary Filters on the Special Orthogonal Group',
        authors: ['Robert Mahony', 'Tarek Hamel', 'Jean-Michel Pflimlin'],
        year: '2008',
        venue: 'IEEE Transactions on Automatic Control (author manuscript on HAL, hal-00488376)',
        url: 'https://hal.archives-ouvertes.fr/hal-00488376',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m07'],
        concepts: [
          'complementary filter posed directly on SO(3)',
          'explicit complementary filter using gyro rates and vector measurements',
          'gyro bias estimation by an integral (adaptive) correction term',
          'Lyapunov analysis and almost-global stability',
          'deterministic observer as an alternative to the EKF'
        ],
        why: "This is the rigorous 3-D version of m07's complementary filter. The explicit complementary filter corrects the integrated gyro rate with a cross-product error built from vector measurements, the kind a sun sensor or magnetometer gives, and its integral term estimates gyro bias, which is the same role as the site's b_hat <- b_hat - k_b r. The Lyapunov stability proof explains why this design stays well behaved at large errors, where a linearised filter can fail."
      },
      {
        id: 'madgwick-2010-orientation-filter-report',
        title: 'An efficient orientation filter for inertial and inertial/magnetic sensor arrays',
        authors: ['Sebastian O. H. Madgwick'],
        year: '2010',
        venue: 'Internal report, University of Bristol (dated 30 April 2010)',
        url: 'https://courses.cs.washington.edu/courses/cse466/14au/labs/l4/madgwick_internal_report.pdf',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m07'],
        concepts: [
          'quaternion orientation estimation from gyro, accelerometer and magnetometer (IMU and MARG)',
          'integrating gyro rate and correcting it with vector measurements',
          'gradient-descent correction step',
          'gyroscope bias drift compensation',
          'magnetic distortion compensation',
          'one or two tunable gains tied to sensor error characteristics',
          'low computational cost and low sample rates'
        ],
        why: "Madgwick's filter is a 3-D, quaternion version of m07's complementary filter. It integrates the gyro rate and corrects it toward the attitude implied by gravity and magnetic-field vectors, using one gain in place of alpha, and it adds gyro-bias compensation as in m07's b_hat update. The report is short and practical and quotes operation counts, which makes clear why this kind of filter is common on small embedded flight computers as a cheaper alternative to a full Kalman filter."
      },
      {
        id: 'hashim-2020-attitude-determination-estimation-review',
        title: 'Attitude Determination and Estimation using Vector Observations: Review, Challenges and Comparative Results',
        authors: ['Hashim A. Hashim'],
        year: '2020',
        venue: 'arXiv:2001.03787',
        url: 'https://arxiv.org/abs/2001.03787',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m07'],
        concepts: [
          "attitude determination from vector observations (Wahba's problem)",
          'algebraic methods such as TRIAD and QUEST',
          'Gaussian attitude filters (KF, EKF, MEKF, UKF)',
          'nonlinear attitude filters and complementary observers on SO(3)',
          'comparison of transient and steady-state error in simulation'
        ],
        why: "One free, recent survey that covers everything in m07's estimation thread: building an attitude from vector sensors (star tracker, sun sensor, magnetometer) through Wahba's problem and the classic algebraic solutions, then Gaussian filters such as the MEKF, then nonlinear complementary filters, with a side-by-side simulation comparison. It is the free substitute for the Crassidis, Markley and Cheng 2007 survey and for Shuster and Oh's 1981 TRIAD/QUEST paper, for neither of which a free copy turned up."
      },
      {
        id: 'soho-1998-mission-interruption-report',
        title: 'SOHO Mission Interruption Joint NASA/ESA Investigation Board Final Report',
        authors: ['SOHO Mission Interruption Joint NASA/ESA Investigation Board'],
        year: '1998',
        venue: 'NASA/ESA (released 31 August 1998); SOHO mission website',
        url: 'https://soho.nascom.nasa.gov/operations/Recovery/docs/SOHO_final_report.html',
        type: 'case-study',
        access: 'free',
        level: 'intro',
        modules: ['m08', 'm13'],
        concepts: [
          'ground operations error chain',
          'disabling an on-board protection layer',
          'ground commanding under time pressure',
          'procedure changes without full review',
          'aligned holes in layered defences',
          'emergency Sun reacquisition safe mode',
          'disabling on-board fault detection',
          'repeated safe-mode entries',
          'operations and procedure errors',
          'loss of attitude'
        ],
        why: "The board traced the loss of attitude to a chain of ground decisions made on a compressed timeline with modified, under-reviewed procedures, which removed protections one at a time. It is m13's Swiss-cheese model on a real attitude-control loss: a gyro left off, a misdiagnosis and a disabled failure-detection function were each survivable alone."
      },
      {
        id: 'morgan-2005-jpl-fault-protection',
        title: 'Fault Protection Techniques in JPL Spacecraft',
        authors: ['Paula S. Morgan'],
        year: '2005',
        venue: 'First International Forum on Integrated System Health Engineering and Management in Aerospace (ISHEM), Napa, CA; JPL Open Repository',
        url: 'https://trs.jpl.nasa.gov/handle/2014/39531',
        type: 'paper',
        access: 'free',
        level: 'intro',
        modules: ['m08', 'm13'],
        concepts: [
          'on-board safe mode buys time for ground diagnosis',
          'division of labour between autonomy and ground',
          'fault protection monitors and responses',
          'spacecraft safe mode',
          'attitude control computer protection',
          'safe, predictable low-power state',
          'FDIR'
        ],
        why: "m13 compares the on-board safe mode to a pilot's memory item, with the ground working through the slower checklist. Morgan's short survey describes that split in JPL spacecraft: fault protection puts the vehicle into a safe, predictable state and then waits for the ground to diagnose."
      },
      {
        id: 'holzmann-1997-model-checker-spin',
        title: 'The Model Checker SPIN',
        authors: ['Gerard J. Holzmann'],
        year: '1997',
        venue: 'IEEE Transactions on Software Engineering 23(5):279-295, May 1997 (doi:10.1109/32.588521); free copy hosted in a Tufts CS257 course archive',
        url: 'https://www.cs.tufts.edu/~nr/cs257/archive/gerard-holzmann/ieee97.pdf',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m08'],
        concepts: [
          'explicit-state model checking',
          'LTL safety and liveness properties',
          'invariants',
          'automata-theoretic verification',
          'Promela models'
        ],
        why: 'The seminal description of SPIN: how it explores every reachable state of a concurrent model, checks invariants and LTL properties, and returns error traces. It is the industrial-strength version of the BFS reachability check in widget W8.4.'
      },
      {
        id: 'havelund-2000-remote-agent-formal-analysis',
        title: 'Formal Analysis of the Remote Agent Before and After Flight',
        authors: [
          'Klaus Havelund',
          'Mike Lowry',
          'SeungJoon Park',
          'Charles Pecheur',
          'John Penix',
          'Willem Visser',
          'Jon L. White'
        ],
        year: '2000',
        venue: 'Fifth NASA Langley Formal Methods Workshop (LFM 2000), Williamsburg, VA; NASA Technical Reports Server',
        url: 'https://ntrs.nasa.gov/api/citations/20000055731/downloads/20000055731.pdf',
        type: 'case-study',
        access: 'free',
        level: 'advanced',
        modules: ['m08'],
        concepts: [
          'model checking spacecraft autonomy software',
          'abstraction for model checking',
          'testing vs exhaustive verification',
          'in-flight deadlock',
          'SPIN/Promela'
        ],
        why: "Before flight, SPIN found five concurrency errors in the Deep Space 1 Remote Agent that testing would have missed. One of the same patterns then caused a deadlock in flight. This is the best spacecraft example of 'sampling finds bugs, exhaustive checking proves their absence'."
      },
      {
        id: 'lamport-2002-specifying-systems',
        title: 'Specifying Systems: The TLA+ Language and Tools for Hardware and Software Engineers',
        authors: ['Leslie Lamport'],
        year: '2002',
        venue: "Addison-Wesley (free personal-use PDF from the author's site)",
        url: 'https://lamport.org/tla/book.html',
        type: 'book',
        access: 'free',
        level: 'advanced',
        modules: ['m08'],
        concepts: [
          'state machines as specifications',
          'invariants',
          'safety vs liveness',
          'temporal logic of actions',
          'model checking with TLC'
        ],
        why: "Lamport's book treats any system as a state machine described by an initial predicate and a next-state relation, and checks invariants and temporal properties with the TLC model checker. The first seven chapters (about 83 pages) are a self-contained introduction for writing the m08 mode logic as a checkable specification."
      },
      {
        id: 'clarke-emerson-sifakis-2009-model-checking',
        title: 'Model Checking: Algorithmic Verification and Debugging (Turing Lecture)',
        authors: ['Edmund M. Clarke', 'E. Allen Emerson', 'Joseph Sifakis'],
        year: '2009',
        venue: 'Communications of the ACM 52(11):74-84',
        url: 'https://cacm.acm.org/magazines/2009/11/48424-turing-lecture-model-checking-algorithmic-verification-and-debugging/fulltext',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m08'],
        concepts: [
          'model checking',
          'temporal logic (CTL/LTL)',
          'counterexamples',
          'state explosion',
          'proving vs finding'
        ],
        why: 'The founders of model checking explain, in a readable magazine article, how exhaustively exploring a finite model proves temporal-logic properties or returns a counterexample, and why state explosion is the central obstacle. It is the conceptual background for the m08 384-state checker and the 30,618-state product automaton.'
      },
      {
        id: 'nasa-2012-fault-management-handbook',
        title: 'NASA Fault Management Handbook, NASA-HDBK-1002 (Draft 2)',
        authors: [
          'NASA Office of the Chief Engineer',
          'NASA Engineering and Safety Center (NESC)',
          'NASA Science Mission Directorate'
        ],
        year: '2012',
        venue: 'NASA Technical Handbook (Draft 2, 2 April 2012)',
        url: 'https://nasa.gov/wp-content/uploads/2015/04/636372main_NASA-HDBK-1002_Draft.pdf',
        type: 'handbook',
        access: 'free',
        level: 'intermediate',
        modules: ['m08', 'm13'],
        concepts: [
          'detection, isolation and response as layers',
          'safing as a designed fault response',
          'fault management across flight and ground',
          'fault management verification',
          'fault detection, isolation and recovery (FDIR)',
          'fault management as systems engineering',
          'safe mode as a fault response',
          'fault management terminology',
          'verification of fault management'
        ],
        why: "NASA's common vocabulary and lifecycle for fault management. It frames detection, isolation, response and safing as one designed system that spans the spacecraft and the ground. It is a good next step after m13's layers and alarms sections, for anyone who wants to see how real projects plan those defences and verify them."
      },
      {
        id: 'perez-2020-copilot-3',
        title: 'Copilot 3 (NASA/TM-2020-220587)',
        authors: ['Ivan Perez', 'Frank Dedden', 'Alwyn Goodloe'],
        year: '2020',
        venue: 'NASA Technical Memorandum, Langley Research Center; NASA Technical Reports Server',
        url: 'https://ntrs.nasa.gov/citations/20200003164',
        type: 'software',
        access: 'free',
        level: 'advanced',
        modules: ['m08'],
        concepts: [
          'runtime verification',
          'run-time monitors',
          'temporal-logic monitors compiled to C',
          'monitoring mode logs on embedded hardware'
        ],
        why: "Describes NASA's open-source Copilot framework, which turns temporal-logic monitor specifications into constant-memory C code for embedded flight computers. It is the flight-software counterpart of the m08 run-time DFA monitor that checks a mode log for illegal transitions."
      },
      {
        id: 'cavada-2024-nusmv-tutorial',
        title: 'NuSMV 2.7 Tutorial',
        authors: [
          'Roberto Cavada',
          'Alessandro Cimatti',
          'Gavin Keighren',
          'Emanuele Olivetti',
          'Marco Pistore',
          'Marco Roveri'
        ],
        year: '2024',
        venue: 'FBK-irst, NuSMV project documentation',
        url: 'https://nusmv.fbk.eu/tutorial/v27/tutorial.pdf',
        type: 'tutorial',
        access: 'free',
        level: 'intermediate',
        modules: ['m08'],
        concepts: [
          'symbolic model checking',
          'CTL and LTL specifications',
          'invariant checking',
          'counterexample traces',
          'bounded model checking'
        ],
        why: 'A hands-on, example-driven tutorial for the open-source NuSMV checker. Learners can encode the three-mode machine with its guards, check the forbidden-transition invariants as LTL/CTL formulas, and read the counterexample traces the tool produces.'
      },
      {
        id: 'openintro-statistics-4e',
        title: 'OpenIntro Statistics, Fourth Edition',
        authors: ['David M. Diez', 'Mine Çetinkaya-Rundel', 'Christopher D. Barr'],
        year: '2019 (4th edition)',
        venue: 'OpenIntro (free textbook under a Creative Commons licence); listed in the Open Textbook Library and AIM approved textbooks',
        url: 'https://open.umn.edu/opentextbooks/textbooks/openintro-statistics',
        type: 'book',
        access: 'free',
        level: 'intro',
        modules: ['m09'],
        concepts: [
          'binomial distribution for pass/fail trials',
          'sampling distribution of a proportion',
          'confidence interval for a proportion',
          'success-failure condition for the normal approximation',
          'simulation-based inference'
        ],
        why: 'A free, gentle introduction to the binomial model behind a pass/fail campaign and to confidence intervals for a proportion. Its normal-approximation interval needs enough successes and enough failures, and a 60/60 campaign has no failures. Seeing that check fail is the clearest way to understand why m09 uses the exact Clopper-Pearson bound.'
      },
      {
        id: 'nist-sematech-ehandbook-proportion-confidence',
        title: 'NIST/SEMATECH e-Handbook of Statistical Methods, section 7.2.4.1: Confidence intervals (for a proportion defective)',
        authors: ['NIST Statistical Engineering Division and SEMATECH'],
        year: 'online handbook (undated; cite with access date)',
        venue: 'NIST/SEMATECH e-Handbook of Statistical Methods, chapter 7 (Product and Process Comparisons), itl.nist.gov',
        url: 'https://itl.nist.gov/div898/handbook/prc/section2/prc241.htm',
        type: 'handbook',
        access: 'free',
        level: 'intro',
        modules: ['m09'],
        concepts: [
          'exact binomial (Clopper-Pearson) confidence limits',
          'when the normal approximation is not accurate enough',
          'few or zero failures',
          'testing whether a proportion meets a requirement'
        ],
        why: "The free NIST handbook asks the same question m09 does: does the observed proportion of defectives (here, failed trials) meet a requirement? It explains that with very few failures or small samples the symmetric normal-approximation limits are not accurate enough, and gives the exact binomial limits instead. Use it to check W9.3's Clopper-Pearson readouts by hand."
      },
      {
        id: 'brown-cai-dasgupta-2001-binomial-interval',
        title: 'Interval Estimation for a Binomial Proportion',
        authors: ['Lawrence D. Brown', 'T. Tony Cai', 'Anirban DasGupta'],
        year: '2001',
        venue: 'Statistical Science 16(2):101-133 (with discussion); doi:10.1214/ss/1009213286',
        url: 'https://doi.org/10.1214/ss/1009213286',
        type: 'paper',
        access: 'free',
        level: 'advanced',
        modules: ['m09'],
        concepts: [
          'coverage probability of a confidence interval',
          'erratic coverage of the standard Wald interval',
          'Wilson, Jeffreys and Agresti-Coull intervals',
          'conservatism of the exact Clopper-Pearson interval',
          'choosing an interval for a verification claim'
        ],
        why: "This well-known study shows that the textbook Wald interval's coverage is erratic, even for large samples. It compares the alternatives and recommends Wilson or Jeffreys intervals for estimation. Read it to see the trade-off behind m09's choice: Clopper-Pearson is conservative, but a verification claim needs guaranteed coverage, so being conservative is the safe direction."
      },
      {
        id: 'hanson-beard-2010-monte-carlo-lv-verification',
        title: 'Applying Monte Carlo Simulation to Launch Vehicle Design and Requirements Verification',
        authors: ['John M. Hanson', 'Bernard B. Beard'],
        year: '2010',
        venue: 'NASA technical report, Marshall Space Flight Center, September 2010 (NTRS 20100035661)',
        url: 'https://ntrs.nasa.gov/api/citations/20100035661/downloads/20100035661.pdf',
        type: 'report',
        access: 'free',
        level: 'intermediate',
        modules: ['m09'],
        concepts: [
          'Monte Carlo dispersion analysis',
          'classifying uncertainties by when they become known',
          'probabilistic requirements (a success probability at a stated confidence)',
          'order statistics for requirement verification',
          'how many Monte Carlo samples are needed'
        ],
        why: "Two NASA Marshall flight-mechanics and GN&C engineers explain how dispersed parameters go into a Monte Carlo campaign. They then show how order statistics decide whether a requirement stated as a probability is met, and how many runs that takes. It is the full-scale version of m09's 60-trial T04 campaign and its 'what does 60/60 prove' sample-size calculation."
      },
      {
        id: 'nesc-academy-hanson-statistical-verification',
        title: 'Launch Vehicle Design and Requirements Verification Using Statistical Methods',
        authors: ['John Hanson (NASA Marshall Space Flight Center), presenter'],
        year: 'n.d. (the search summary gave 21 Feb 2026, not confirmed)',
        venue: 'NASA Engineering and Safety Center (NESC) Academy, online video (about 73 min)',
        url: 'https://nescacademy.nasa.gov/video/1fee5789d3bf4e46aa1112123851ddee1d',
        type: 'video',
        access: 'free',
        level: 'intermediate',
        modules: ['m09'],
        concepts: [
          'statistical design and verification of a GN&C system',
          'Monte Carlo campaigns for probabilistic requirements',
          'order statistics and the number of runs needed',
          'how SLS probabilistic requirements are verified'
        ],
        why: "A recorded NASA lecture from the engineer who built the process used to verify the Space Launch System's probabilistic requirements. It covers the same ideas as the Hanson and Beard report, in a form that suits learners who would rather watch first. It shows that m09's pass-count-plus-confidence reasoning is how flight GN&C is signed off."
      },
      {
        id: 'numpy-random-parallel-seedsequence',
        title: 'Parallel random number generation (NumPy reference: numpy.random, SeedSequence and spawning)',
        authors: ['NumPy Developers'],
        year: 'since NumPy 1.17; maintained',
        venue: 'NumPy documentation (numpy.org reference guide)',
        url: 'https://numpy.org/devdocs/reference/random/parallel.html',
        type: 'software',
        access: 'free',
        level: 'intermediate',
        modules: ['m09'],
        concepts: [
          'seeded reproducibility',
          'SeedSequence: turning a logged base seed into a high-quality state',
          'spawning independent per-trial streams',
          'repeatable parallel Monte Carlo campaigns'
        ],
        why: "Shows how to derive independent, repeatable random streams for each trial from one logged base seed. Each Monte Carlo trial can then be rerun on its own, and the results do not depend on how trials are spread across workers. It is the Python version of m09's per-trial seeds, its 'Replay in simulator' link and the risk-register mitigation of a fixed seed."
      },
      {
        id: 'holzmann-2006-power-of-ten',
        title: 'The Power of 10: Rules for Developing Safety-Critical Code',
        authors: ['Gerard J. Holzmann'],
        year: '2006',
        venue: 'IEEE Computer 39(6):95-97, June 2006; author-hosted copy (NASA/JPL Laboratory for Reliable Software)',
        url: 'https://spinroot.com/gerard/pdf/P10.pdf',
        type: 'paper',
        access: 'free',
        level: 'intro',
        modules: ['m10'],
        concepts: [
          'simple control flow, no recursion',
          'fixed upper bounds on every loop',
          'no dynamic memory allocation after initialisation',
          'short functions and assertion density',
          'checking return values and parameters',
          'compiling with all warnings and static analysis'
        ],
        why: 'Ten short rules from JPL, each with its reason, that make flight code easy to analyse and give it a predictable worst case. This is the source of the m10 rules against heap use, recursion and unbounded loops.'
      },
      {
        id: 'lockheed-martin-2005-jsf-av-cpp-coding-standards',
        title: 'Joint Strike Fighter Air Vehicle C++ Coding Standards for the System Development and Demonstration Program (Document 2RDU00001 Rev C)',
        authors: ['Lockheed Martin Corporation'],
        year: '2005',
        venue: 'Lockheed Martin Corporation, December 2005; approved for public release, distribution unlimited; hosted by Bjarne Stroustrup',
        url: 'https://stroustrup.com/JSF-AV-rules.pdf',
        type: 'standard',
        access: 'free',
        level: 'advanced',
        modules: ['m10'],
        concepts: [
          'a safe C++ subset for flight code',
          'no exceptions or heap use in flight code',
          'class design, virtual functions and destructors',
          'numeric types, conversions and overflow',
          'rule rationale and traceability'
        ],
        why: 'This coding standard of more than 200 rules shows how a real avionics programme restricts C++ for flight code. Each rule comes with its rationale, so it shows the reasons behind the m10 controller-interface sketch and its status-code style of error handling.'
      },
      {
        id: 'mccomas-2016-cfs-community',
        title: 'The Core Flight System (cFS) Community: Providing Low Cost Solutions for Small Spacecraft',
        authors: ['David McComas', 'Jonathan Wilmot', 'Alan Cudmore'],
        year: '2016',
        venue: 'AIAA/USU Conference on Small Satellites (SmallSat 2016); NASA Technical Reports Server 20160010300',
        url: 'https://ntrs.nasa.gov/citations/20160010300',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m10'],
        concepts: [
          'layered flight software architecture',
          'OS and hardware abstraction',
          'reusable applications and product lines',
          'Class B process artifacts released as open source',
          'configuration control of shared flight code'
        ],
        why: "An overview of NASA Goddard's core Flight System by its developers. It covers the layered design that keeps applications independent of the operating system and hardware, and how a multi-centre board controls releases. Read it with F Prime to compare two open frameworks. The code is on GitHub under nasa/cFS."
      },
      {
        id: 'bocchino-2018-f-prime-framework',
        title: 'F Prime: An Open-Source Framework for Small-Scale Flight Software Systems',
        authors: [
          'Robert L. Bocchino Jr.',
          'Timothy K. Canham',
          'Garth J. Watney',
          'Leonard J. Reder',
          'Jeffrey W. Levison'
        ],
        year: '2018',
        venue: 'AIAA/USU Conference on Small Satellites (SmallSat 2018); NASA Technical Reports Server',
        url: 'https://ntrs.nasa.gov/citations/20210008573',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m10'],
        concepts: [
          'component-based flight software architecture',
          'ports and well-defined interfaces',
          'message queues and threads',
          'model-based code generation',
          'unit and integration testing of flight software'
        ],
        why: 'This JPL paper describes F Prime, the open-source framework flown on small missions. It shows how flight software is split into components with typed ports, run by queues and threads, and tested at unit and integration level. The live documentation is at fprime.jpl.nasa.gov if you want to build the tutorial project.'
      },
      {
        id: 'nasa-swehb-nasa-hdbk-2203',
        title: 'NASA Software Engineering and Assurance Handbook (NASA-HDBK-2203)',
        authors: ['National Aeronautics and Space Administration (NASA)'],
        year: 'continuously updated (software assurance content added 2020)',
        venue: 'NASA, online wiki handbook supporting NPR 7150.2 and NASA-STD-8739.8',
        url: 'https://swehb.nasa.gov/',
        type: 'handbook',
        access: 'free',
        level: 'intermediate',
        modules: ['m10'],
        concepts: [
          'NPR 7150.2 software engineering requirements',
          'software classification and safety-critical software',
          'configuration management and version control',
          'verification, validation and testing',
          'software assurance and software safety (NASA-STD-8739.8)'
        ],
        why: "NASA's own guidance on how flight and ground software must be planned, controlled, tested and assured, with the reasoning for each requirement. Use it to see how the m10 practices (regression baselines, version control, independent checks) appear as agency requirements."
      },
      {
        id: 'rougier-2014-ten-simple-rules-better-figures',
        title: 'Ten Simple Rules for Better Figures',
        authors: ['Nicolas P. Rougier', 'Michael Droettboom', 'Philip E. Bourne'],
        year: '2014',
        venue: 'PLOS Computational Biology, doi:10.1371/journal.pcbi.1003833 (open access; PubMed Central PMC4161295)',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4161295/',
        type: 'paper',
        access: 'free',
        level: 'intro',
        modules: ['m11'],
        concepts: [
          'knowing the audience and the message',
          'captions and annotations such as threshold lines',
          'avoiding default settings and chartjunk',
          'colour used deliberately',
          'choosing the right tool'
        ],
        why: 'A short open-access guide, partly written by a Matplotlib core developer, on making a plot say one clear thing. It supports the m11 approach of drawing requirement thresholds and mode bands on plots and using colour with intent.'
      },
      {
        id: 'shoemake-1985-quaternion-curves',
        title: 'Animating Rotation with Quaternion Curves',
        authors: ['Ken Shoemake'],
        year: '1985',
        venue: "ACM SIGGRAPH Computer Graphics 19(3):245-254 (SIGGRAPH '85), doi:10.1145/325165.325242",
        url: 'https://history.siggraph.org/?p=107413',
        type: 'paper',
        access: 'free',
        level: 'intermediate',
        modules: ['m11'],
        concepts: [
          'spherical linear interpolation (slerp)',
          'quaternions for animation',
          'interpolating attitude between samples',
          'why Euler-angle interpolation misbehaves',
          'spline curves on the rotation sphere'
        ],
        why: 'This paper brought quaternions into computer graphics and introduced slerp, the method m11 uses to play back attitude between logged samples. It is short, clearly illustrated and still the best explanation of why linear interpolation of Euler angles gives poor motion.'
      },
      {
        id: 'feynman-1986-rogers-appendix-f',
        title: 'Appendix F: Personal Observations on the Reliability of the Shuttle',
        authors: ['Richard P. Feynman'],
        year: '1986',
        venue: 'Report of the Presidential Commission on the Space Shuttle Challenger Accident, Volume 2 (NASA History)',
        url: 'https://www.nasa.gov/history/rogersrep/v2appf.htm',
        type: 'report',
        access: 'free',
        level: 'intro',
        modules: ['m12', 'm13'],
        concepts: [
          'honest worst-case discussion',
          'erosion of acceptance criteria',
          'engineering versus management risk perception',
          'safety culture',
          'likelihood-x-consequence',
          'risk-register',
          'margin',
          'lessons-learned'
        ],
        why: "The shortest route into m13's culture section. Engineers and managers held risk estimates three orders of magnitude apart, and damage that should have been an alarm became accepted because earlier flights had survived it. Feynman's closing line, that reality must take precedence over public relations, is the case for an honest worst-case discussion."
      },
      {
        id: 'nasa-lessons-learned-llis',
        title: 'NASA Lessons Learned Information System (LLIS)',
        authors: ['NASA Office of the Chief Engineer', 'NASA Engineering Network'],
        year: '1994',
        venue: 'NASA (public online database)',
        url: 'https://llis.nasa.gov/',
        type: 'case-study',
        access: 'free',
        level: 'intro',
        modules: ['m12', 'm13'],
        concepts: [
          'documented failures as safety data',
          'lessons-learned reporting',
          'searching past anomalies',
          'organisational learning',
          'lessons-learned',
          'iteration-log',
          'risk-register'
        ],
        why: "m13 says documented failures are safety data, and LLIS is NASA's public version of that idea. A search for 'safe mode', 'attitude control' or 'command' returns short, reviewed lessons from real missions, each giving the event, the lesson and a recommendation."
      },
      {
        id: 'nasa-2002-fault-tree-handbook',
        title: 'Fault Tree Handbook with Aerospace Applications (Version 1.1)',
        authors: [
          'Michael Stamatelatos',
          'William Vesely',
          'Joanne Dugan',
          'Joseph Fragola',
          'Joseph Minarick III',
          'Jan Railsback'
        ],
        year: '2002',
        venue: 'NASA Office of Safety and Mission Assurance',
        url: 'https://extapps.ksc.nasa.gov/reliability/Documents/Fault_Tree_Handbook_with_Aerospace_Applications_August_2002.pdf',
        type: 'handbook',
        access: 'free',
        level: 'advanced',
        modules: ['m12'],
        concepts: ['fault-tree', 'bow-tie', 'fmea', 'probabilistic-risk-assessment'],
        why: 'The standard free text on fault tree analysis for space systems. It works top-down from an undesired top event, such as loss of attitude control, through AND/OR gates to basic causes, and that is the threat side of a bow-tie. Read it after the FMEA and bow-tie widgets to see how the qualitative picture becomes a quantitative one.'
      },
      {
        id: 'ecss-m-st-80c-risk-management',
        title: 'ECSS-M-ST-80C: Space project management - Risk management',
        authors: ['European Cooperation for Space Standardization (ECSS)'],
        year: '2008',
        venue: 'ECSS standard (ESA / national agencies / industry)',
        url: 'https://ecss.nl/standard/ecss-m-st-80c-risk-management/',
        type: 'standard',
        access: 'free-registration',
        level: 'intermediate',
        modules: ['m12'],
        concepts: ['risk-register', 'likelihood-x-consequence', 'risk-index', 'residual-risk'],
        why: "The European space risk process in four steps and nine tasks. It includes worked severity and likelihood scoring schemes, a risk-index matrix with proposed actions, and an informative annex with an example risk register and ranked risk log, the same structure as the module's risk matrix widget."
      },
      {
        id: 'nasa-2024-risk-management-handbook-v2',
        title: 'NASA Risk Management Handbook, Version 2.0 (Part 1: NASA/SP-20240014019; Part 2: NASA/SP-20240014326)',
        authors: ['Homayoon Dezfuli', 'Sergio Guarro', 'Chris Everett'],
        year: '2024',
        venue: 'NASA Special Publication (NTRS 20240014019)',
        url: 'https://ntrs.nasa.gov/citations/20240014019',
        type: 'handbook',
        access: 'free',
        level: 'intermediate',
        modules: ['m12'],
        concepts: [
          'risk-register',
          'likelihood-x-consequence',
          'residual-risk',
          'continuous-risk-management',
          'risk-informed-decision-making'
        ],
        // privacy-scan: publication years (2011 is the year of the handbook's first version)
        why: "NASA's current guidance on identifying, analysing, mitigating, tracking and accepting risk on space projects, aligned with NPR 8000.4. It replaces the 2011 version 1.0 (NASA/SP-2011-3422) and gives the agency's own context for risk registers, likelihood and consequence scoring, and residual risk."
      }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
