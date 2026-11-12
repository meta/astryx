---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a negated mode, the CSS cursor, device words beside an ask, and labels.

- "Don't touch dark mode, make the accent orange" changes light mode only.
- `cursor: pointer` sets the CSS cursor; only "caret" or "cursor color" is the text cursor's color.
- A device or print word ("cramped on mobile", "when printing") no longer drops the ask: the rest is answered, with a note that the editor has no such conditions.
- A question about one part's state or group ("which parts are in the inputs group", "how round are the cards now?") gets that part's lookup as well as `show`.
- "Not so round" is one step less; "avoid pure black text" picks a near-black; "flat cards, not flat buttons" changes only the cards.
- `NaNpx` and `Infinitypx` are refused as not numbers; `1e3px` is 1000px.
- Labels are the field label part (a checkbox's or switch's own label when named); "visited links" says a link has no visited state set can name.
- Tailwind `border-2` is a 2px border width and `rounded-full` a pill; `.btn-primary { … }` is the primary button only.
- "Remove all my changes" takes back every setting; a question in a script how cannot read gets no guess.

@josephfarina
