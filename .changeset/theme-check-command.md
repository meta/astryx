---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme check <theme>` builds a theme and lists what a person would see as broken in light and dark: unreadable text, see-through menus, menus that blend into the page, faint control edges, half-painted pages, a bar's text inside its menus, an unpinned one-look theme, an unpainted app page, a hover that shows nothing and a font with no fallback. `--fix` writes the repair as normal lines in the theme file (and, for those two app problems, a mode on the app's `<Theme>` and a page rule); of the colors the theme sets, it changes only its text and icon colors, and names the old value of each. A sibling `<theme>.accepted.json` keeps contrast as designed.

@josephfarina
