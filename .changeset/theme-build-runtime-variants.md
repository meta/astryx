---
'@astryxdesign/cli': patch
---

[fix] Built themes now export their custom component values as `themeVariants`, beside the theme object, so `astryx component` can star them with a theme footnote (#5059). Each value is shown as the `prop:value` key it was declared with, so components with two extensible props, such as Banner `container` and `status`, say which prop accepts it. The export and the `.variants.d.ts` augmentations come from the same classified values across root, `onDark`, and `onLight`, including custom Heading types. Built-in values and props without an augmentation point stay excluded. Themes without custom values build unchanged.

@jiunshinn
