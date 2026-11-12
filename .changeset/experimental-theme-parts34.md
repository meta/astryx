---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the chat composer's box is reached as it is drawn.

- `padding` on chat-composer goes to the padding of the visible composer box, with no gap outside it. Background, border, shadow, a side padding or a padding for one density, which would land on the composer's transparent wrapper, are refused with the reason.

@josephfarina
