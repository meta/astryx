---
'@astryxdesign/cli': patch
---

[experimental] More fixes in `astryx experimental theme editor how` for colors asked of parts with variants, states and modes:

- **Button fills:** when the ask gives a whole look, a fill and its text ("gold buttons with black text"), the destructive button keeps its red, and the answer says so. A bare color that every button's text reads on still reaches every button.
- **Button text:** a text color asked of every button ("buttons with white text") skips the variants whose own fill would hide it (a ghost button drawn on the page), and the answer says so.
- **Grays on surfaces:** a gray on a surface (a table's header cells, inputs, a card, a dialog's header) is the theme's own gray step in light mode and its mirrored step in dark mode, instead of one gray for both. A control's fill, such as a button's, is still the gray asked.
- **Text on a ground:** "the text on the gradient white" changes the text only. It no longer also writes the page background.
- **Toggle buttons:** "toggle buttons" now means Core's toggle button, not a switch.

@josephfarina
