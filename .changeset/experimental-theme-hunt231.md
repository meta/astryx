---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a part's own state written as the part names it (`--state isPressed` on toggle-button) is saved and read back as that state. Before, the next command read the saved `isPressed` as `is-pressed`, a state the part does not have, and refused every change to the theme. A theme already holding such a state is refused with its undo and a `set` line that writes the setting in its place, so the theme loads again.

@josephfarina
