---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` measures its answer before it gives it: each suggested command is built in memory with the theme (the same build `set` makes; nothing is written), and the values the touched parts show, in light and dark, must change the kind of thing the question asks, the way it asks (a lighter fill is lighter in both modes, while text and borders step for contrast, so in dark mode they go the other way; a removal reaches none), while parts it excepts, compares against or forbids show the same values. A command that does not is left out, and the answer says plainly why. It also reads "besides", "save for", "but keep X as they are", "X excepted" and "without changing X" as except; "as well as" as and; "compared to" and "versus" as comparisons; "don't let X get smaller" and "never round the inputs" as keeping X; "X shouldn't be so small" as an ask; "remove the padding and border" as two removals; "black on secondary buttons" as text; "less sharp" and "less thick" as their opposites; value questions about space, gap, shadow, background and font size, and a question followed by an ask; a setting pasted with a colon as its lookup; "heading text lighter"; "the focus ring lighter" as its color; and a lighter or darker accent in both modes.

@josephfarina
