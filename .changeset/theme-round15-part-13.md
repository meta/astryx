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

- `astryx experimental theme editor how` reads four more kinds of clause:

- A comparison of what is there now tells and writes nothing ("in dark mode the cards look darker than the page, like holes"). The fix said after it keeps that mode, so "make cards slightly lighter" writes dark mode only.
- What a part should mark is read in that part ("the date picker should circle today in #0969da"), as after a label, never as a fill on the part.
- A part's own items said after its name ("pagination pages in one bordered strip") are that part's, never a screen named by what it shows.
- A part's list said as a likeness ("alerts like Bootstrap 1: …") is that part's, every item. "a text shadow" in it is `text-shadow` on the part's letters, never a box shadow or a theme-wide one.

- `astryx experimental theme editor set` now refuses a text property that an element inside the part sets itself to a value the component's props choose, instead of saving a setting that never shows. `white-space pre-wrap --on code-block` is refused: the code lines keep `pre` (or `pre-wrap` when the app wraps them), so only the app's prop changes it.

- `astryx experimental theme editor set` now writes a text look where the part's text reads it, instead of refusing or writing what never shows:

- A color on a part that draws no text of its own (the app shell header, the top nav) also goes into `--color-text-primary` and `--color-text-secondary` on that part, so the labels inside it take the color. The contrast check measures them that way.
- A color on a link or a text goes into the token its color prop reads (`--color-text-accent` on links), on that part alone, as a heading's color already did.
- A text size, weight, line height or letter spacing on a part whose text is drawn by elements that read one token for it (`font-size` on a banner or a code block, `font-weight` on the top nav heading) goes into that token on the part. Where the text reads several tokens (a title and a subtitle), set still refuses and names each.
- A bare `0` on a padding read inside `calc()` is saved as `0px`.
- A token the part does not read, where the parts inside it do (`--text-body-size` on a tab list), is refused with those parts' token on the part. A part name with a piece after it (`top-nav-heading-title`) is refused with the part that holds it.

@josephfarina
