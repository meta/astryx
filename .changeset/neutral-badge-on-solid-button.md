---
'@astryxdesign/core': patch
---

[fix] A neutral Badge in a primary or destructive Button now meets 4.5:1 contrast in light and dark mode. Solid Buttons scope the text and neutral roles to their own fill. The new `--color-neutral-on-<fill>` tokens (accent and each status) hold the neutral tint for content on a strong fill. Themes that do not set these tokens get a derived value.

@josephfarina
