---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: padding that stays where it is set, and one length wherever Core reads it inside calc().

- Padding set on a clickable or selectable card, or on a card's variant or state, no longer reaches plain cards nested inside it: each side the narrower rule writes is reset on a plain card inside it, so Core's own fallback holds, and the narrower rule writes each side rather than the whole padding.
- Every part whose padding Core reads inside calc() (found from Core's own stylesheet: chat-composer, dropdown-menu, context-menu, segmented-control, and an item's inline padding) takes one length there, as chat-composer does, also through a group (`--on menus`).
- A padding with `--state` on a card, dialog or a group of containers is now taken: the padding model writes the state's own sides.

@josephfarina
