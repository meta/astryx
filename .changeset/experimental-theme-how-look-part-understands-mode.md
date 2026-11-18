---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a whole look typed as one line ("a calm, Linear-like dark theme with a violet accent", "cream background, terracotta accent, serif headings", "a high-contrast compact enterprise theme in navy"):

- Each part it understands gets its own line: the theme's mode, a named color for the accent or the page, density, contrast and fonts. A color on its own ("navy") is the accent.
- Words that no setting covers ("calm", "Linear-like") are listed as not used.
- Design color names are understood (terracotta, sage, rust, mustard and others). A blue-gray is a gray with a little blue in it.
- A complaint describes how a part looks now ("the error toast is too bright red; make it calmer"). "calmer" makes a color less saturated. "the main content area" names the page's main panel.
- A status color on one part ("the info banner navy") also offers that status color for the whole theme.
- "sharper corners, almost square" gives small corners.
- "the accent text #0033aa" sets the accent text color, not the main text.
- "a rounded font" is a typeface and leaves corners alone. A color typed with "off-white" wins over it.
- "light only", "dark only" and "no dark mode" set the theme's mode.
- "a right-to-left app" explains that Core mirrors itself once the app sets `dir="rtl"`, and changes nothing.

@josephfarina
