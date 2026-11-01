---
'@astryxdesign/core': patch
---

[fix] Make onClick-only TopNav items keyboard accessible
@korkt-kim

Previously, onClick-only TopNav actions could be skipped by Tab or could not be activated from the keyboard. TopNavItem now provides button semantics and Enter/Space activation while preserving its anchor ref/event types and custom link rendering. Desktop TopNavMegaMenuItem actions and drawer TopNavMenu actions now use non-submitting native buttons.

This restores keyboard operation and action semantics for WCAG 2.2 A criteria 2.1.1 and 4.1.2. Disabled TopNavItem actions remain focusable but cannot activate; href navigation and the existing desktop menu keyboard model are unchanged.
