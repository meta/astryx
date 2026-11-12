---
'@astryxdesign/cli': patch
---

[perf] The stored doc exports now cover Core's docs and the CLI's own command and API docs too, and a read parses only the docs it needs. Any doc file whose text matches a stored doc reads the stored exports, since such a doc's exports depend on its text alone. `search` and `build` print the same output faster.

@josephfarina
