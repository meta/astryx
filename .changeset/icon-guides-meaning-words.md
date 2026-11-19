---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: the icon-set guide (`astryx docs cli/experimental/icon-sets`), its icon meanings and file-field pages, and the fields of the icon meaning and icon set file types call each entry of Astryx's shared list of what icons are for an "icon meaning" instead of a "definition", and a set's looks its "variants", as `--variant` and `experimental.iconVariant` already say. The guide now says exactly where a match's related meanings show: on every match in JSON (`relatives`), and only under the first match, at most four, in text. Commands, flags, config keys, JSON fields and file names do not change.

@josephfarina
