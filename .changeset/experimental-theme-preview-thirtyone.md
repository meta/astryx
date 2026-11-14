---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: `add` rebuilds the theme whenever its build is not current (an output missing, or a build that does not match the settings), the same rule `preview app` uses, so the route never imports a missing file. A pasted `--theme 'theme: t'` names the theme t. A `distDir` with a subfolder blocks only that folder. `remove --path` on a folder with no preview names the preview there is, with its remove. The `preview app` help says that with `--theme` Core and the base theme are pinned to the project's versions.

@josephfarina
