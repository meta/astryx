---
'@astryxdesign/cli': patch
---

[fix] In a Next.js app whose root layout imports `next/font/google`, `next/font/local` or a `geist/font` entry, `astryx doctor`'s theme-fonts fix for the app's own (local) themes and `astryx theme build`'s font notes now name the fix the app needs: set the theme's font family to the font's CSS variable, such as `var(--font-geist-sans)`. A package theme keeps its font stylesheet fix. next/font loads each family under a name of its own, so a theme that names the family (`'Geist'`) does not use the loaded font, and the warning stays. `astryx docs font-setup` adds the next/font recipe.

Reported by @phenomen.

@cixzhang
