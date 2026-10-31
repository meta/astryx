---
'@astryxdesign/core': patch
---

[feat] LayoutPanel gains a `hideBelow` prop (`'sm' | 'md' | 'lg' | 'xl'`) that hides the panel below the given viewport-width breakpoint with a compile-time CSS media query (sm = 640px, md = 768px, lg = 1024px, xl = 1280px, aligned with AppShell's breakpoints). The panel stays mounted, so server rendering and hydration always agree; this replaces the hand-rolled `useMediaQuery` + conditional-render pattern that frame-and-side-panel templates repeated for responsive panel hiding (#3339).

@jiunshinn
