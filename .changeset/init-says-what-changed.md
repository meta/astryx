---
'@astryxdesign/cli': patch
---

[feature] `astryx init` says what it did to each agent-doc file: `[ok] AI agent docs: AGENTS.md updated (Astryx 0.7.15 -> 0.7.16)`, `... created`, `... already current, nothing changed`, or `...: Astryx block removed, another agent file holds it`. The `init.run` receipt adds `docsChanges` (`{path, change, from, to}` per file, in `docsWritten` order); every earlier field keeps its name and value.

@josephfarina
