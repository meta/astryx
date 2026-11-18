---
'@astryxdesign/cli': patch
---

[fix] The dashboard page templates give screen readers clearer structure: each page marks its content area (`LayoutContent`) as the main landmark, has exactly one level-1 heading, and has a heading outline with no skipped levels (set with `accessibilityLevel`, so the look is unchanged). `dashboard` gains a visually hidden "Dashboard" title, and `dashboard-comparison`'s decorative sparklines no longer take keyboard focus inside hidden content. No visual change.

@josephfarina
