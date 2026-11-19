---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> font <family>` says when the theme file covers the setting. A `typography` family or a `--font-family-*` token in the theme's own file wins over its settings, so set now names the roles that keep the file's family, the line that gives it, and how to change it, in text output as well as `--json`.

@josephfarina
