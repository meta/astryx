---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads which corners an ask names: a side ("the top corners", "rounded on top", "square on the right side"), one corner ("the top-left corner 12px"), "only" and "except" ("tab corners 4px except the bottom", "round only the bottom corners of menus 6px"). A part's own words name no corner, so "bottom sheet top corners 16px" sets the top corners only. When an ask settles every corner, the answer is one radius of four (`border-radius '4px 4px 0 0'`); rounded with no size keeps the radius the part reads, so the corners dial still moves it.

@josephfarina
