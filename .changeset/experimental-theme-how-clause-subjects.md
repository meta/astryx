---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now writes to the whole theme only when a clause names nothing, or says the whole theme. A clause whose subject matches no part ("command palette 8px corners", "FAB 16px corners") writes nothing, names the words, and lists any parts that contain them. Font names, brand labels and look words still read as before.

A part's list keeps its items on that part:

- Looks after a part said first ("tooltips 4px corners and 12px text", "popovers 8px corners, 1px border, no shadow", "table header text uppercase, gray, 12px, bold") all go to that part.
- A word naming a piece of the part ("progress bar: blue fill and gray track") goes to that piece.
- An item led by a variant ("buttons: primary #…, hover #…") goes to that variant, along with the states after it.
- A part named inside another part's list ("toasts: …, an action button text color") counts as inside it.
- A mode said alone after a look ("pure white page, light only") or at the end of a color with-item applies to that look. Corners and sizes beside it stay the same in both modes.
- A size beside a state's line ("32px tall with a 2px border when focused") keeps no state.

Other readings fixed:

- "under" and "below" mean the bottom side. A side word inside a part's name ("top nav") is no longer read as a side.
- Lines said of a part are its line, not its fill.
- "valid" reads as the success status, and "in error" as the error status.
- An inset ring is a ring, not a drop shadow.
- "0 7px" padding keeps its 0.
- A ring and a shadow together are one layered shadow.
- A text color asked with a fill goes where that fill goes.
- See-through said of a part affects its fill only, not the whole part.
- "bold colors" no longer bolds the text.
- A "white with a black check in dark mode" checkbox keeps the white it was given.

@josephfarina
