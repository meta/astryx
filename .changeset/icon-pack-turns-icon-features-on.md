---
'@astryxdesign/cli': patch
---

[experimental] Installing an icon-set package turns icon features on, with or without `experimental.iconSet` in astryx.config. A project that installs no icon-set package and sets no `experimental.iconSet` sees no change in any command. In a project that installs one, these stable commands now read the installed sets, so their output changes there:

- `astryx discover`: lists each package's sets, and `--type icon-set` works.
- `astryx doctor`: runs the `icon-sets` and `icon-placeholders` checks and reports an invalid installed set. `doctor integration validate <package>` checks an installed package's sets.
- `astryx docs icons`: one section, added in the name of the package that ships your set, says how to find its icons (`astryx experimental icon <words>`). `astryx search` does not return it, and search output does not change.

Copied templates still follow a set only once `experimental.iconSet` names it.

@josephfarina
