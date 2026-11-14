---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- `how`: a dialog's or drawer's title is colored, made bold or bigger through the text tokens on its title block, never on every heading; a title Core has no part for (a card's) is said so. A weight, size or color set on a part whose text is all in parts inside it that set their own is refused with those tokens.
- `how`: an alpha said of a shadow ("card shadows with 30% alpha", "50% transparent") sets its colors' alpha in every layer the part shows; a part's shadow in a state is read from that state at its default status (an input's own hover ring, never the error ring), never from a hidden layer; a ring with no blur softens through its alpha.
- `how`: "on-accent text" is the on-accent color; "heavy borders" are thicker borders; "pill buttons less round" steps the corners; a fully round part steps from half its height; "checkbox" is the box itself, not the checks group.
- The part data records a file input (a required prop that may be null is sampled as null), so a resting shadow that would wipe its hover ring is refused.

@josephfarina
