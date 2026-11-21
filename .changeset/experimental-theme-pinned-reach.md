---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a saved setting's reach is pinned. A setting that reaches beyond its own part records the parts it reached when it was made (`reached` in the settings file, by the setting's identity), and the build, `show` and the previews keep it there. Parts its family gains later (an editor that widens a group, a member Core adds) are offered, never applied: the result says each once with the same line, which sets it again at its whole reach (`offered`), and `show` lists them in its notes. A setting an earlier editor saved, with no record, keeps the reach that editor gave it (its own part; the group, for a setting named on a group; the members that drew the same value, for one on a member of inputs or checks), is recorded at its next build, and the rest of its family is offered. `set … --only` on a setting the theme already holds replaces it, so the look leaves the group.

@josephfarina
