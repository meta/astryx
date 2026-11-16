---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor …`: a set of a property typed in other letters (`set t Background-Color green --on card`) is that property, so it fixes that property listed twice in the settings file, instead of a refusal that offers a swapped line back and forth. A top-level `base` in the settings file (the editor's word for it) is read as the base, with a note, instead of the theme building on no base, and any other top-level field the editor does not read is named, with the field it is a typo of. A saved setting with no source and its part under a field the editor does not read (`"part"`) names that field and offers the undo that removes it, instead of only a remake.

@josephfarina
