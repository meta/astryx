---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` keeps each theme's chat corners now that `--radius-chat` follows the container radius: it adds `--radius-chat` to the tokens of each `defineTheme()` theme (28px, or the page step of its radius scale) and the page step to each adaptation rule with a radius scale. A theme that extends another and has no radius scale of its own inherits its base's value, which every Astryx theme and every migrated theme now sets. It leaves a TODO where it cannot read the theme, and reports a default-exported object shaped like a theme for manual migration.
@kentonquatman
