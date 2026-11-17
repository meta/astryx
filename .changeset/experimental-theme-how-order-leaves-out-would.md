---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- An "all of it, in order" answer leaves out any step that would change nothing on its own. Writing such a step would lock that setting in place, so a later dial change would not reach it.
- "no heavy shadows" removes the shadows without also saying nothing was written. "Heavy" before shadows or borders is about their strength, not the font weight.
- Asking for a text color a part already has says it is already that color, instead of giving an unrelated reason.

@josephfarina
