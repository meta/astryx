---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` warns when the `@astryxdesign/core` peer range of a loaded integration, other than the packages of added themes, which `theme-core-peers` already checks, excludes the installed Core (`integration-core-range`). A package made for another Core installs with only a package manager warning, and its components, themes and docs may not work; the warning names the package, its version and range, and the installed Core, and the fix names the release to look for. A project whose other integrations all declare a range that includes its Core gets a passing row naming them; a project where none of them declares one sees no new row. It is a warning, so no project that passed before fails.
@josephfarina
