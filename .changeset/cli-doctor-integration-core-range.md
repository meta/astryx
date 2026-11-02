---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` warns when a loaded integration's `@astryxdesign/core` peer range excludes the project's Core (`integration-core-range`). A package made for another Core installs with only a package manager warning, and its components, themes and docs may not work; the warning names the package, its version and range, and the installed Core, and the fix names the release to look for. A project whose integrations all declare a range that includes its Core gets a passing row naming them; a project where none declares one sees no new row. It is a warning, so no project that passed before fails.
@josephfarina
