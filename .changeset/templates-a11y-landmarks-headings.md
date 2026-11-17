---
'@astryxdesign/cli': patch
---

[fix] 37 page templates (the tool templates other than `incident-console`, the content templates other than `work-item-detail`, the form, gallery and hero, login, settings and AI chat templates, plus `blank` and `theme-showcase`) give screen readers clearer structure: each marks its content area (`LayoutContent`, or the page's `Center` root where it has no content area) as the main landmark, has exactly one level-1 heading in each state it shows (a phone section view, a sign-in step, the signed-in state), and has a heading outline with no skipped levels. Titles keep their look (`accessibilityLevel`, or `Text` rendered as `h1`); pages without a visible title get a visually hidden one. Also: icon-only columns in `editor` and `theme-showcase` get visually hidden header names, and `documentation-design` names each example's tab list. No visual change.

@josephfarina
