---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that names what it takes back and says a mode ("make the accent red in light mode. undo the light mode accent change", "in dark mode, reset the card background") reads that mode as its own. It no longer reads the undo as ruling that mode out, which wrote the change for the other mode instead.

- It takes back only a change said earlier in the ask for that mode, before any saved setting. A change said for the other mode, or for both modes, stays written, and the answer says so. A look that is the same in both modes (corners, spacing, type) is taken back whatever mode the undo says. Changes said before it that clash, one of them for its mode, are taken back with the choice between them.
- With no such change, it takes back the setting the theme saves for that mode only. A setting saved the same for both modes is named, with how to take it back in both; when the theme saves nothing for that mode, the answer says so; when a mode has its own setting beside one for both modes, the answer says what the mode falls back to.
- Its mode is its own: no clause before or after it takes its mode, and a mode said for an earlier change does not limit it.
- After a change said earlier in the ask, an undo that names several changes takes nothing back, saved settings included, and says so.

@josephfarina
