---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- `editor show`'s `missed` list frames only what draws a box: a part with no filled box at rest in any variant (a ghost toggle button, a menu row) is borderless on purpose, and with the border width at zero nothing is missed for want of a border.
- `preview app`'s font note names only weight sheets a Fontsource package can have: a weight between two hundreds (650) is drawn from the two around it.
- `preview app` refuses a theme that imports a Sass, Less or Stylus file, which the new app does not build, naming the import, before writing anything.
- `preview app` names an entry called node_modules or a version-control folder as left out whether it is a folder, a file or a link, and the note on a link says to copy what it leads to.

@josephfarina
