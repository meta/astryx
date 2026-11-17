---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, "controls 4px corners, overlays 8px corners" sets the two corner sizes Core keeps apart: `--radius-element` for controls (buttons, inputs, selectors), and `--radius-container` for surfaces and overlays (cards, dialogs, popovers, menus). Before, they were offered as two answers that contradict each other. On a light-only theme, a color written for its one mode now names the dark media surfaces (the lightbox, and what sits on the overlay scrim) that still read the token's dark half, with that half's value now. The light value is never written into it.

@josephfarina
