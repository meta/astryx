---
'@astryxdesign/core': patch
---

[fix] Importing `@astryxdesign/core` no longer loads `react-dom/client`. `useToast` loads it on the first toast shown with no `LayerProvider`, to mount the fallback viewport. A test run or a Node script that imports the package, for example for `createAnimator`, no longer evaluates `react-dom/client`, so a suite that mocks it no longer deadlocks. With no `LayerProvider`, the first toast renders once `react-dom/client` has loaded, after the `act()` that showed it returns, so a test waits for it with `findBy…` or `waitFor`. If that load fails, the error is logged and the next toast loads it again.

@cixzhang
