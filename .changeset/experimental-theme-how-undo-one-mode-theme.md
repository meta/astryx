---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: on a theme with one mode that sets the thing, an undo that names a mode ("reset the dark mode accent" on a dark-only theme with an accent) takes nothing back and says it is not read on such a theme yet, with the undo that names no mode to use instead. One that sets nothing still says so. It no longer answers that a setting is saved the same for both modes when the theme shows only one. A change said earlier in the same ask for the mode the undo names is still taken back; one said with no mode stays written.

@josephfarina
