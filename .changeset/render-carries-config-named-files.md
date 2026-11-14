---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` carries the page's own modules and JSON data whose names only look like configuration: `config.ts`, `lib/arc.ts`, `data/chart-config.json`, `data/config.json`. They were left out as tool configuration, so the page came back from `--reverse` with `exact: false` and without them. The names tools read stay refused: `tsconfig.json` and `tsconfig.*.json`, `jsconfig.json`, any `*.config.json` or `*.config.{js,ts,…}` module, manifests and lockfiles, and dotfiles such as `.eslintrc.js`.

@josephfarina
