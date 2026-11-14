---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` carries every image, font and media file a carried module's strings or a carried stylesheet name by a relative path, also when the page did not show it in this render: a branch the page did not take, or a stylesheet rule no element uses. Such files now ship in the rendered file, up to 8 MB each, as a shown image does; a larger one, or one whose bytes are not an image, font or media file, is left out with a `not-embedded` warning that names the file that names it. `--reverse` reads the same names with the same scan, so such a page used to come back with `exact: false` and those files missing.

@josephfarina
