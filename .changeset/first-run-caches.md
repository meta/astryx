---
'@astryxdesign/cli': patch
---

[perf] A machine's first `search`, `build`, `component`, `template`, `theme`, `discover` or `docs` run now keeps what it gathers, and Node's compile cache is written from the first run, so the second command on a new machine (most often the same session's next one) reads them instead of gathering again: about 1.7 s faster for `search` and 0.8 s for `component` in a project with an integration. Output does not change.

@josephfarina
