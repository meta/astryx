---
'@astryxdesign/cli': patch
---

[fix] `astryx build` names where its start and each alternative go in the project it runs in, so the scaffold command runs as printed: the path `astryx template` names from the project's layout (in a Next app, its App Router folder, such as `app/<name>`; else `src/pages/<name>`), quoted when a shell would read it otherwise. In a folder with no package.json, the command keeps the `<path>` placeholder.

@josephfarina
