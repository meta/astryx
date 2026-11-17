---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` keeps every whole-theme look in a long ask:

- A dial or whole-theme look said after a part's clause, out of that part's reach, is the whole theme's by its meaning: "no shadows", "flat surfaces", "bold system type", "gray borders", "rounded corners". Only a part's own look, such as a fill or a text color, is named instead.
- Every item of a with-list belongs to its head: "primary buttons #303030 with white text and 8px corners". A comma ends the list.
- A size word of the part said before ("small rounded corners" after buttons) reaches it across clauses that name no part.
- "menus and popovers look like Slack's: white, rounded, …" applies each item to every part in the head.
- A fill said with its own text ("navy #0f172a with white text") stays a fill.
- "soft glows and shadows" is one ask, not two that clash.
- The answer that runs a whole ask in order carries a tint ("blue-tinted glass") as the tint, never the solid color.
- "selected tab #171717 with a 2px underline, other tabs #666666": the selected label keeps its color, the underline its state, and the other tabs their text color.
- "active item #0d6efd with white text": the text token stays in the item's state.
- "make headings semibold and make the text a bit larger": "the text" is the app's text size, never the headings'.
- "fab: #eaddff background": a label that names no part is named, never painted on the page.
- White links on a bar this ask fills dark are measured on that bar and written for both modes.
- A box word in a part's list ("menus: plain white boxes") is that part's box, never every container.
- A corner or edge look said of a side ("cards square on top, 6px rounded at the bottom") stays on the part before, never the whole theme.

@josephfarina
