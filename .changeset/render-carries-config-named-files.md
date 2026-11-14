---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` carries the page's own modules and JSON data whose names only look like configuration: `config.ts`, `lib/arc.ts`, `data/chart-config.json`, `data/config.json`. They were left out as tool configuration, so the page came back from `--reverse` with `exact: false` and without them. These names stay refused: `tsconfig.json` and `tsconfig.*.json`, `jsconfig.json`, any `*.config.json` or `*.config.{js,ts,…}` module, manifests and lockfiles, and dotfiles such as `.eslintrc.js`. A file that carries one says render format 2, so a CLI that reads render formats names the CLI that reads it; 0.7.16 and earlier refuse it as damaged.

@josephfarina
