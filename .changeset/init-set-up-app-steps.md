---
'@astryxdesign/cli': patch
---

[feat] `astryx init` in a project whose Astryx agent-docs blocks are all current prints the `build` and `search` commands (and where the setup guide is) instead of the five install steps, since the app is already set up. It judges the files the run writes: the `--agent-docs-path` files, the `--agent` preset's file, or every agent file at the root. A first run, or a run that refreshes an outdated block, still prints the install steps. The `init.run` receipt adds `agentDocsStatus` (`missing` | `stale` | `current`, the agent docs before the run; null when agent docs were not installed or the write failed); `nextSteps` is false when the steps are left out.

@josephfarina
