---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` installs a theme someone shared in one command: give it the theme's folder, a `.tgz` archive of it, or an https URL to a `.tgz` instead of a slug. It checks that the one theme folder it finds is a complete, built theme, copies it into the app's local themes root (`src/themes/<name>`), installs the Astryx packages the theme imports that the app lacks (its base theme package) with the app's package manager and install scripts off, and records the theme as the app's default, so an app wired to the generated module shows it at once. Nothing of the theme runs during the add. Any other package the theme imports is named with its install command, never installed. The result lists every file written and the record and dependency changed. It never replaces a file it did not write, and adding the same shared theme again replaces its own unchanged copy. `theme remove` undoes the add: it deletes the files the add wrote (keeping any you changed) and uninstalls the packages it installed. `theme add <slug>` is unchanged; the JSON gains `data.copy`, and a remove's gains `data.undo`.

@josephfarina
