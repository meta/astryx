---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor how`:

- **Status text weight:** a status part's text weight ("the error banner's text bold") is set under that status.
- **A part inside another part:** "the dialog buttons" and "the toast buttons" mean the buttons inside that part. A part kept to a place ("menu items in the dialog", "tabs in the card") writes nothing and says why, unless a token on the place holds the change.
- **One size named:** "the medium buttons 36px tall" sets only that size's own control height. If the part data shows no control height for the size named, nothing is written. An icon's size is reported as unreachable, and the button is left untouched.
- **More sizes and heights:** "The small buttons taller" steps that size's own height. "The selectors 4px taller" moves each size's height. A height on the inputs ("24px tall") is set through the heights the inputs read, so they can shrink, while a text area keeps its rows. Parts inside another part ("inputs in cards") are kept to that part or not written at all.
- **Borders:** a thicker radio or checkbox border no longer offers one color for every state.

@josephfarina
