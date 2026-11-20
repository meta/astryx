---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an exact amount ("half", "double", "a quarter", "a third", "3 times", "25% bigger") of a part's font size, line height, letter spacing, opacity, width or border width is that factor of what the part has now, never a fixed step; "3 times bigger" is an amount, never a 3px value; "double the border width" doubles it (no double-line style, no width cap); "half as round" scales the radius there now; a quarter of a padding or gap with nothing to read is a step down, said to be a step; a group's own name ("checks") is read as that group; an amount with a state ("on hover") scales that state's value and keeps the state; a dialog's header is the dialog header, not the app's top bar (likewise a card's or a dialog's footer); and the part "everything except cards" leaves out keeps the value it has now.

@josephfarina
