---
'@astryxdesign/core': patch
---

[chore] An internal `usePresentation` / `readPresentation` resolves a component's `presentation` prop into the surface to render and whether its touch input modes apply, keeping an omitted value distinct from an explicit `'popover'` so a caller's choice always wins over a touch default. Not exported from the package entry point.

@vjeux
