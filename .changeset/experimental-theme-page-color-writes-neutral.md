---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> --color-background-body <color>` no longer moves the neutral color's other surfaces. A mid-tone page such as teal used to turn cards, popovers, menus and dialogs near-black in light mode (with dark text on them), because the neutral shades followed the written page color instead of the page the base theme's surfaces were made for. The written page color is now that one color, in light-only and two-mode themes alike.

@josephfarina
