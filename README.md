# Attitude Control: The Big Picture

An educational reconstruction of a student ADCS project. This static, interactive website rebuilds
a student spacecraft attitude-control simulation in the browser: the rigid-body dynamics, the PID,
LQR and detumble controllers, the reaction-wheel limits, the safe-mode logic and the Monte Carlo
verification. It also shows how every subject studied feeds each part of the project.

Subjects are described by generic name and subject matter only. The site contains no personal
information.

## What is on the site

- **Big picture** (`index.html`): the guidance-and-control loop as an interactive diagram, with the
  subjects that feed each block.
- **Simulator** (`simulator.html`): the full simulation with a 3D view, plots, requirement checks
  and a Monte Carlo runner. Sensors and estimation are offered as a clearly labelled extension.
- **Learning path** (`learn.html`): 13 modules in project-lifecycle order, from requirements to
  operations (`m01-requirements.html` to `m13-operations.html`).
- **Atlas** (`atlas.html`): 70 subjects in 8 disciplines and their links to the 13 project parts.
- **Glossary** (`glossary.html`) and **About** (`about.html`).
- **Resources** (`resources.html`): 81 free papers, books, courses, standards and reports for further
  reading, with filters, search and APA and BibTeX references; each module page ends with its own list.

Every number carries an honesty label: Project, Derived, Site default, Illustrative, Extension or
Analogy. Subjects known only from an outline are shown as "Typical content of this subject".

## Run it

- **Offline:** open `index.html` directly in a browser. There is no build step and no server; all
  data and libraries are local classic scripts.
- **Local server (optional):** `python3 -m http.server 8000` in this folder, then open
  `http://localhost:8000/`.
- **GitHub Pages:** push this folder to a repository and enable Pages. Every link is relative, so
  the site works from a project subpath; `.nojekyll` stops Jekyll processing and `404.html` handles
  unknown addresses.

## Folder structure

```
index.html, simulator.html, learn.html, atlas.html, glossary.html, resources.html, about.html
m01-requirements.html … m13-operations.html     the 13 learning modules
404.html                                       self-contained not-found page
assets/css/       tokens.css (light/dark design tokens), base.css, components.css, pages/*.css
assets/js/        adcs-math.js, adcs-sim.js (simulation engine), adcs-data.js (subjects, modules,
                  mappings, glossary), adcs-ui.js (UI kit), adcs-plot.js (canvas plots),
                  adcs-wire.js (2D wireframe), adcs-resources.js and adcs-reading.js (the
                  further-reading list and its cards), pages/*.js (one script per page)
assets/vendor/    three.js r128 and KaTeX 0.16.9, unmodified, with LICENSES.md
assets/templates/ page-template.html and module-template.html for new pages
tests/            engine tests, the component kitchen sink, privacy and link checks
```

## Checks

- `node tests/run-node.js`: engine tests against the reference values.
- `tests/browser.html`: the same engine tests in a browser.
- `tests/components.html`: every shared component in one page, in both themes.
- `node tests/privacy-scan.js .` (optionally `--forbid <terms file>`): fails on identifying
  information.
- `node tests/link-check.js .`: fails on absolute paths, ES modules, missing files or missing anchors,
  and on a module page whose widget count differs from the module data.
- `node tests/budget.js .`: the landing-page weight budget (see Performance).

## Performance

The budget for the landing page is 300 KB of its own JavaScript and CSS (the vendored libraries
excluded), measured as **transfer size**: gzip-compressed, which is how GitHub Pages and any
ordinary web server deliver these files. `tests/budget.js` measures it (about 170 KB) and fails
above the limit; it also prints the raw size (about 590 KB), for information only. The shared
scripts stay readable, commented source because the site has no build step, and the data file is
mostly subject and glossary text.

Other budgets: a 120 s simulation at dt = 0.01 s runs in at most 150 ms, a 60-trial Monte Carlo
campaign in at most 4 s without any main-thread task over 100 ms, and a plot redraws in at most
16 ms when its cursor moves. The engine tests check the first two.

## Licences

The vendored libraries are MIT-licensed: three.js r128 and KaTeX 0.16.9. Their licence texts are in
`assets/vendor/LICENSES.md`.
