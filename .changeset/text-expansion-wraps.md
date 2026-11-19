---
'@astryxdesign/cli': patch
---

[fix] With longer, translated labels at phone width, the form wizard, vertical form wizard, technical documentation and table templates keep their buttons in full: their header, footer and toolbar rows wrap instead of cutting labels or pushing controls off screen. The canvas editor's header keeps its save note and Export at full width, and the badge and stack direction examples wrap their rows. In English at 390 and 1280 px only the form wizard's last step changes: Back and "Create workspace", which were cut, now show in full. On narrower phones, English rows that were already tight wrap instead of cutting a label or running past the edge: the technical documentation's AI assistance row from about 375 px (its More options menu button moves to a second line), the vertical form wizard's header from about 330 px (Save & exit moves to a second line), and at 320 px the form wizard's Back and Next (its Cancel moves to a second line just below 320 px). The badge and stack direction examples wrap in columns narrower than about 295 and 335 px.

@josephfarina
