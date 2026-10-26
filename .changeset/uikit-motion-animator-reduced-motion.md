---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator follows design:reduced-motion (under Reduce Motion, an opacity-only cross-fade of 200 ms on a coarse pointer or after a touch release and an immediate change on any other pointer, with no option or theme value that keeps travel or lengthens the fade; an entrance or exit role orients a slide that changes no opacity), decided by its own planner module, and starts a call from rest when the browser commits it, as Core Animation does. Not exported from the package entry point.

@vjeux
