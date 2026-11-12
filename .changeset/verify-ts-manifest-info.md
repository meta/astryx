---
'@astryxdesign/cli': patch
---

[feat] `integration verify` adds an information line, in text output only, after a successful pack whose manifest is `astryx.integration.ts`: the CLI transpiles it on first read on each machine, so shipping `astryx.integration.mjs` loads faster (pointing at `astryx docs authoring/ship/publishing keep-private-files-out`). It changes neither the result nor the exit code.

@josephfarina
