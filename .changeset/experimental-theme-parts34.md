---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one padding side stays logical, and the chat composer's box is reached as it is drawn.

- On chat-composer, dropdown-menu, context-menu and segmented-control, one logical padding side (`padding-inline-start`) stays logical, so a right-to-left app gets its own side, and still changes that side only.
- `padding` on chat-composer goes to the padding of the visible composer box, with no gap outside it. Background, border, shadow, a side padding or a padding for one density, which would land on the composer's transparent wrapper, are refused with the reason.

@josephfarina
