---
'@astryxdesign/core': patch
---

[fix] MobileNav with `side="auto"` opens from the opener's inline edge in right-to-left layouts. When the opener holds focus, that is used. When nothing is focused (such as the first open after a page load), the opener is found through its `aria-controls`, which AppShell's `MobileNavToggle` sets. A custom opener without `aria-controls` that never takes focus still opens from `end`.

@mahmed74
