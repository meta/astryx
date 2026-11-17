---
'@astryxdesign/cli': patch
---

[experimental] Doctor's new `icon-imports` check names each icon import that no longer matches the app's icon sets after the list changes or a set is uninstalled: an icon from a set the list leaves out, or from a backup when an earlier set draws the same meaning, warns with the icon of the list that replaces it; an icon import or re-export of an npm package that is not installed, not declared, and not mapped by a `paths` or `baseUrl` entry in the app's tsconfig or jsconfig fails, since it breaks the build, even when that package is the main set itself. The check runs where icon features are on and a main set is decided.

@josephfarina
