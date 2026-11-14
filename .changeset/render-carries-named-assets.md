---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` carries every image, font and media file a carried module's strings or a carried stylesheet name by a relative path, also when the page did not show it in this render: a branch the page did not take, or a stylesheet rule no element uses. `--reverse` reads the same names, so such a page used to come back with `exact: false` and those files missing, and the restored page could not show them.

@josephfarina
