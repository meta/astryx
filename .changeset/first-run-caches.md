---
'@astryxdesign/cli': patch
---

[perf] A machine's first `search` or `build` run, and its first `component`, `template`, `theme`, `discover` or `docs` run in a project where an integration can load, now keeps what it gathers, and Node's compile cache is written from the first run. With the CLI installed in the project, the second command on a new machine (most often the same session's next one) reads them instead of gathering again: about 1.7 s faster for `search` and 0.8 s for `component` in a project with an integration. A global copy with no Core beside it starts installing its Core after its first run, which changes what the next run reads, so it reads from its third run, as before. Answers do not change; `doctor`'s "Kept catalog cache" row counts the entries the first run now keeps.

@josephfarina
