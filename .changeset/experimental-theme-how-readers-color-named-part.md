---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- A color named after another part uses that part's color in the status or variant you name: "the color of the error banner", "the same color as the success banner", "the color of the danger buttons". The other part is no longer changed, and the reference doesn't decide what changes: "cards the button color" fills the cards.
- "the buttons as round as the inputs" says they already match instead of offering a line that set refuses.
- Value questions read a base theme's own colors and any of a part's own options: "what color are error toasts?".
- "the card text 25% of its opacity", "a third fainter" and "transparent by 40%" are read as amounts on the text or border color.
- "the secondary text on cards lighter" changes the cards' secondary text.
- "them" refers to the parts named just before it.
- "remove the shadow from everything" no longer reads "remove" as a part name.
- A mode with a typo is read wherever a mode is named, including before a comma and in "(drak)".
- "the open select" uses its open state.
- "the active toggle button darker" changes the toggle in that state.
- Keeping a status or a focus ring as it is works per input type and in one mode.

@josephfarina
