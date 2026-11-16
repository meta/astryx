---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor …`: for a setting the settings file lists twice by hand, undo accepts either value it holds (`undo t accent red` or `blue`), removes every entry, and its result names each value removed (`alsoRemoved` in `--json`); a value it does not hold is refused naming the one the build reads. `show` notes a field the settings file writes twice (`like` and `Like`), as a change does. A token name whose word is a part the editor knows (`--color-text-link`) is no longer repaired by spelling to another token (`--color-text-pink`).

@josephfarina
