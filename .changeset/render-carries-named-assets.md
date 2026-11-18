---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` carries every image, font and media file a carried module's strings or a carried stylesheet name by a relative path inside the folder that holds the carried files, also when the page did not show it in this render: a branch the page did not take, or a stylesheet rule no element uses. Such files now ship in the rendered file, up to 8 MB each, as a shown image does; a larger one, one whose bytes are not an image, font or media file, or one it cannot read, is left out with a `not-embedded` warning that names the file that names it. A name that climbs above that folder is not the page's file and is not carried, as `--reverse` reads it too. `--reverse` reads the same names with the same scan, so such a page used to come back with `exact: false` and those files missing.

@josephfarina
