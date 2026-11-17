---
'@astryxdesign/cli': patch
---

[fix] With longer, translated labels at phone width, the form wizard, vertical form wizard, technical documentation, table and dashboard scorecard templates keep their buttons in full: their header, footer and toolbar rows wrap instead of cutting labels or pushing controls off screen. The canvas editor's header keeps its save note and Export at full width, and the badge and stack direction examples wrap their rows. In English at 1280 px nothing changes. At 390 px, labels that were already cut in English now show in full: the form wizard's last-step "Create workspace", and the technical documentation's "Copy prompt" (its collapse button moves to a second line). At 320 px the form wizard's Cancel, Back and Next, which were cut before, also show in full.

@josephfarina
