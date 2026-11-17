---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the status roles a theme leaves unset (info, success, warning, danger) now follow its look. Each grows from the base theme's color for the role, at the accent's strength and the palette's vibrancy. It turns up to 40° away from the accent's hue when the two would sit together (info stays a blue, danger a red), and is kept apart from the accent. Text on each fill, on its tint and on the page reads at 4.5:1; warning stays a bright fill with near-black text. A role that cannot be drawn readable and apart keeps the base theme's colors and says why. A role the theme sets, or a token set exactly, wins. Badges, banners, status dots and field status follow.

@josephfarina
