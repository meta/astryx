---
'@astryxdesign/cli': patch
---

[fix] `astryx build` names where its start and each alternative go in the project it runs in, so the scaffold command runs as printed: the path `astryx template` names for that template from the project's layout and the template's own id (not the Core id an integration replacement stands in for): in a Next app, its App Router folder (`app/<name>` or `src/app/<name>`) or, with only the Pages Router, the page file `pages/<name>.tsx` or `src/pages/<name>.tsx`; else `src/pages/<name>`. The path is quoted when a shell would read it otherwise. In a folder with no package.json, the command keeps the `<path>` placeholder.

@josephfarina
