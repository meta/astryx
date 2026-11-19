---
'@astryxdesign/cli': patch
---

[docs] The icon-set guides (`astryx docs cli/experimental/icon-sets`, its icon meanings and file-field pages, and the template icons guide) call each entry of Astryx's shared list of what icons are for an "icon meaning" instead of a "definition", and a set's looks its "variants", as `--variant` and `experimental.iconVariant` already say. The theme guides say "built-in meaning" for Core's icon names and "icons module" for the module that holds a theme's icons. The guide now says exactly where a match's related meanings show: on every match in JSON (`relatives`), and only under the first match, at most four, in text. Commands, flags, config keys, JSON fields and file names do not change.

@josephfarina
