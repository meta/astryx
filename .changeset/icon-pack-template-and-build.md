---
'@astryxdesign/cli': patch
---

[experimental] With exactly one icon-set package installed, copied templates draw their icons from it without `experimental.iconSet`, and `astryx build` no longer asks you to install an icon library the set replaces: one note names the set and how to find its icons (`astryx experimental icon <words>`). With more than one set installed and no `experimental.iconSet`, templates keep their icons and report that no set is the main set, and `astryx doctor` fails its `icon-sets` check with the `astryx experimental icon use` command that picks the main set and backups. A project that installs no icon-set package sees no change.

@josephfarina
