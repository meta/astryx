---
'@astryxdesign/core': patch
---

[fix] Overlay, AppShell and MobileNav work in a DOM with no `matchMedia`, such as an app's jsdom test. Before, Overlay threw on its first render, AppShell as it mounted (with React 19.2 or later), and MobileNav as it closed. Where `matchMedia` exists, nothing changes.

@vjeux
