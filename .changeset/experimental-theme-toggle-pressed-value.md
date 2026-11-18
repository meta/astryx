---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a setting on toggle-button's own pressed state (`--state isPressed`) is built on the attribute value ToggleButton writes, `[data-is-pressed="true"]`, so it now applies; before, it was built on `[data-is-pressed="isPressed"]`, which never matches. A part's state that names a boolean prop of its component is built as that prop's "true" value; any other state is built as its own name, as before.

@josephfarina
