---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` keeps each theme's chat corners now that `--radius-chat` follows the container radius: it adds `--radius-chat` to the tokens of each `defineTheme()` theme (28px, or the page step of its radius scale) and the page step to each adaptation rule with a radius scale. A theme that extends an Astryx theme, or a theme this project defines (a relative or aliased import is trusted to be one), and has no radius scale of its own inherits its base's value; one that extends another theme, such as one from another package, gets a TODO that also covers that theme's adaptation rules. It leaves a TODO where it cannot read the theme, and reports a default-exported object shaped like a theme for manual migration. The token it writes is declared at the theme root, so a value a project sets on an ancestor such as `:root` no longer reaches the theme's chat surfaces: set the token in the theme instead.
@kentonquatman
