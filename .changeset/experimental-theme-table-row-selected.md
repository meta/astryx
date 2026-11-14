---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a selected table row's fill is the token Core paints it with.

- The part data reads the paint Core writes inline when it sets a state at run time, so a table row in `selected` reads `--color-accent-muted`.
- `how "selected table row light blue"` answers `--color-accent-muted <color> --on table-row --state selected`, and a background on a selected table row, which Core's inline wash would hide, is refused with that command.

@josephfarina
