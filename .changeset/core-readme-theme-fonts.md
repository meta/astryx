---
'@astryxdesign/core': patch
---

[docs] The README's stylesheet setup boxes (Next.js, Next.js + Tailwind, Next.js + StyleX) now import the theme's `fonts.css`, as `astryx theme add` does. It holds `@font-face` rules for the font files the theme package ships, so the page requests nothing outside the app. Before, a page set up from those boxes loaded no theme font and fell back to the system font stack.

@josephfarina
