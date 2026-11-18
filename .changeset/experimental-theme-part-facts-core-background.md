---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: more part facts read from Core, color asks answered with colors, and refusals that point to the setting that shows.

- The part data reads a background a part inherits from the region it sits in (a side nav in an app shell), and the declarations of every target an element carries (an app shell's side nav region, which is a layout panel too).
- `how` answers a lighter or darker background with a color, never a brightness filter, which dims the text and icons too: from the page's color for "darker than the page", from each variant's own fill in a state, and from the part's resting fill otherwise.
- `how` answers striped or no striped rows with the token Core paints every other row with, on the row.
- The focus ring Core draws on a checkbox or radio indicator is read as tokens the indicator reads always: an outline property or a focus state there is refused, pointing to the focus outline token with no state.
- A font size, weight, line height or letter spacing on a part whose text is drawn by elements that set their own from a token (a top nav heading, a side nav heading, a banner) is refused, pointing to that token on the part; `how` answers with it and its current value.
- A border on a part that draws none of its own, whose edges its inner parts draw (a date-time input), is refused, pointing to those parts; `how` reads "date and time input" as that part and answers for its date and time boxes.
- A checkbox's indeterminate look is reachable with `--when checked:indeterminate`, and `how` adds it beside `--state checked`.
- A text property CSS inherits, set on a part, says which parts inside it also take it.

@josephfarina
