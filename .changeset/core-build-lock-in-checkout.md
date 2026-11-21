---
'@astryxdesign/cli': patch
---

[chore] Internal: the test helper that builds Core keeps its lock in the checkout's node_modules/.cache folder instead of the system temp folder. No installed command uses it.

@josephfarina
