---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads which corners an ask names: a side ("the top corners", "rounded on top", "square on the right side"), one corner ("the top-left corner 12px"), "only" and "except" ("tab corners 4px except the bottom", "round only the bottom corners of menus 6px"). A part's own words name no corner, so "bottom sheet top corners 16px" sets the top corners only. Only the corners an ask names are written, and the others stay as the theme has them (rounded corners said on a side beside another change to the same part, "cards rounded at the bottom and right side padding 12px", round every corner, as before); "only" said of rounding ("rounded top corners only on tabs") or an except squares them. When every corner is written and the corners named are the top, the bottom or all four, the answer is one radius of four (`border-radius '4px 4px 0 0'`); for other corners it writes their logical longhands, so a right-to-left page mirrors them; rounded with no size keeps the radius the part reads, so the corners dial still moves it. A corner ask said in the negative ("no rounding on the bottom corners") squares those corners.

@josephfarina
