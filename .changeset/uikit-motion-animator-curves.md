---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator plays any closed-form curve (such as a spring chasing a moving target), drives a pseudo-element such as a dialog's ::backdrop, fades on a presentation's own spring under Reduce Motion (with an entrance or exit role for a slide that changes no opacity), and starts a call from rest when the browser commits it, as Core Animation does. Not exported from the package entry point.

@vjeux
