---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a build is judged by its content, never by file times, so a settings module saved again (a format-on-save, a checkout) no longer fails `compile --check`, and `preview app --theme` copies a build that matches its settings without building it again. `--state disabled` on a tab styles it the way Core marks it.

@josephfarina
