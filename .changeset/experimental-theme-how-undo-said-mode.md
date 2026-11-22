---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that names what it takes back and says a mode ("make the accent red in light mode. undo the light mode accent change") takes back only a change said earlier in the ask for that mode, and on a theme that saves nothing for it, nothing is written. It no longer reads the undo as ruling that mode out, which wrote the change for the other mode instead.

- A change said for the other mode, or for both modes, stays written, and the answer says so. A look that is the same in both modes (corners, spacing, type) is taken back whatever mode the undo says.
- The undo's mode is its own: no clause before or after it takes its mode, and a mode said for an earlier change does not limit it.

@josephfarina
