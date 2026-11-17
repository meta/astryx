---
'@astryxdesign/cli': patch
---

[fix] With longer, translated labels at phone width, the form wizard, vertical form wizard, technical documentation, table and dashboard scorecard templates keep their buttons in full: their header, footer and toolbar rows wrap instead of cutting labels or pushing controls off screen. The canvas editor's header keeps its save note and Export at full width, and the badge and stack direction examples wrap their rows. In English at 1280 px nothing changes. On narrow phone screens, labels that were already cut in English now show in full: the form wizard's last-step "Create workspace" at 390 px; the technical documentation's "Copy prompt" below about 370 px (from about 375 px down its collapse button moves to a second line); and the form wizard's Back and Next at 320 px, and its Cancel below about 310 px.

@josephfarina
