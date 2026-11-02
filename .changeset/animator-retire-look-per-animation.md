---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator keeps each animation's frame-callback recheck of its curve's end its own, so a recheck still waiting for a replaced animation no longer stands in for the next animation's, which then fell back to its timer. Not exported from the package entry point.

@vjeux
