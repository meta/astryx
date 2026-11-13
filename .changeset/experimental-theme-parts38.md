---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a part's padding replaces the base theme's, and every padding writes a length Core can calculate with.

- A padding on a card, section, dialog, drawer, bottom-sheet or number-input replaces the base theme's padding there, whichever sides the base theme set: the editor writes it as padding properties Core works out together with the base theme's, where the later one wins.
- A clickable or selectable card's padding wins over a card's left or right padding in each text direction.
- A plain part nested in a narrower one is reset only on the sides its own rule leaves unset, so a padding in your own theme source on that part still applies.
- A zero written any way (`0e0`, `0.0`) is written as `0px`; `initial` and `unset` name the part's own default padding from Core.
- A hand-edited padding on one part is reported when a `set` changes padding on another part too.

@josephfarina
