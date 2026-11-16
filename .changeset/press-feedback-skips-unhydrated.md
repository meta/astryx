---
'@astryxdesign/core': patch
---

[fix] A press on a pressable surface inside a React root that is still hydrating, such as a button in a Suspense boundary whose code is still loading, no longer paints. So the boundary hydrates without a hydration mismatch in development.

Reported by:

@duytbp
