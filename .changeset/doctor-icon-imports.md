---
'@astryxdesign/cli': patch
---

[experimental] Doctor's new `icon-imports` check names each icon import that no longer matches the app's icon sets after the list changes or a set is uninstalled: an icon from a set the list leaves out, or from a backup when an earlier set draws the same meaning, warns with the icon of the list that replaces it; an icon import of a package that is not installed fails, since it breaks the build. Only an app that sets `experimental.iconSet` gets the check.

@josephfarina
