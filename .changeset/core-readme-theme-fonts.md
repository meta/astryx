---
'@astryxdesign/core': patch
---

[docs] The README's stylesheet setup boxes (Next.js, Next.js + Tailwind, Next.js + StyleX) now import the theme's `fonts.css`, as `astryx theme add` does, placed first so bundlers keep its font `@import`. Before, a page set up from those boxes loaded no theme font and fell back to the system font stack.

@josephfarina
