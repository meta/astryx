---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] The Tailwind guide (`astryx docs styling-libraries/tailwind`) adds a recipe for an app that already uses Tailwind: keep the app's own `@import "tailwindcss"`, put the `@layer` line above it, and add the Astryx stylesheets after it. It explains why the `@layer` line must come before the Tailwind import: below it, the Astryx reset outranks every utility class, and nothing reports it. The Core README's Next.js + Tailwind section points to it.

@cixzhang
