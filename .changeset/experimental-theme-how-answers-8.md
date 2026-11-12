---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: typed values win without a colon, and words read the right way round.

- A percent inside a gradient or after a color is never an opacity; "50% opacity" still is. A typed gradient with stops ("#2563eb 0% to #9333ea 100%") is kept.
- A typed value after a property word is used whole, colon or not: gradients, `opacity 0.5`, `border 0`, `border color transparent`, `light-dark()`, `var()`, `margin 16px`, `filter: blur(2px)`, `backdrop-filter blur(8px)`, two-layer shadows. A property name never picks a part ("backdrop-filter" is not the backdrop). A value the property cannot take ("padding NaNpx") is refused by name, and so is a font size of 0.
- `drop-shadow()` is kept as typed.
- "halve", "half", "cut in half" and "x0.8" mean less; "twice" and "double" mean more. "0.5 rem", "1.5 em", "14 px" are one length.
- "reset", "revert", "back to default", "what it was", "clear the override" with a setting take it back with `undo <theme> <setting>`, or say the theme does not set it.
- "lighten up" is lighter, "tighten" is tighter tracking, "knock the contrast down" is less contrast, "open up the leading" is line height, and "the gray text fails contrast, darken it" darkens the secondary text. A clause that only describes the problem ("the hierarchy is flat") is not a change; "or maybe not. actually yes" keeps the ask.
- "heading color" is the text color. Accordions, comboboxes and notifications name their parts; a part list with no match lists the parts of components that use the word. "error toasts" adds `--when type:error`, "read-only" is the readonly state, and "loading" or "unchecked" say the part has no such state.
- CSS named colors such as tomato are read.

@josephfarina
