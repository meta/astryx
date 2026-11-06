---
'@astryxdesign/core': patch
---

[fix] A `DateInput` or `DateTimeInput` with `presentation="bottom-sheet"` no longer causes a hydration mismatch when the server and the browser are on different dates. The closed sheet's calendar now renders right after hydration, once the browser's today is known.

@cixzhang
