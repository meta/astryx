---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: padding sides by direction, a failed show leaves the folder as it was, and `how` reads "not dark enough".

- On dropdown-menu, context-menu and segmented-control, one logical padding side is written for each direction (the left in a left-to-right box, the right in a right-to-left one), so it changes that side only; under a state it is one rule per direction (`:hover:dir(ltr)`), and a later padding or physical side replaces it.
- `show` whose render fails puts back every output it touched, removing one it made new and restoring the palette files in `tokens/`.
- `how "not dark enough"` / `"not light enough"` asks for darker or lighter, not for one mode.

@josephfarina
