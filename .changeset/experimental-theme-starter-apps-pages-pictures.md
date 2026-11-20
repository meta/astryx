---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme …`: starter apps, pages and pictures say and write what is true.

- `preview app` with `--theme` given no value says so and offers only lines that work; with no folder, it offers a free folder name and its help.
- A starter on a variable Fontsource family no longer says it loads weight 400 only: the weights its stylesheet loads are read from the package, and no import of a file the package does not ship is offered.
- A starter leaves the theme folder's version control (`.git`) and installed packages (`node_modules`) out, with a note, and refuses before writing when an image url reaches its file through a link the copy does not follow.
- The overlays picture draws every example of a drawer, a bottom sheet and a lightbox.
- A file of yours at `preview.html`, `sheet.html` or a section's sheet is left alone and named, as one at `sheet-overlays.html` already was.
- `show` on a theme source that does not build offers the build failure's own way on.
- `set --png` names as removed only the pictures it did not take again, and `show --png --section` takes the open states too, as the help says.
- `preview remove` says when nothing was removed.

@josephfarina
