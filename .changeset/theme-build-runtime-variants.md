---
'@astryxdesign/cli': patch
---

[fix] Built themes now export their custom component values as `themeVariants`, beside the theme object, so `astryx component` can star them with a theme footnote (#5059). Each value is shown as the `prop:value` key it was declared with, so components with two extensible props, such as Banner `container` and `status`, say which prop accepts it. The export and the `.variants.d.ts` augmentations come from the same classified values across root, `onDark`, and `onLight`, including custom Heading types. Built-in values and props without an augmentation point stay excluded. Every single-theme built module now exports `themeVariants` and declares it in its `.d.ts`; a theme without custom values exports an empty object, so a named import always resolves. A `--family` module exports none, and its type declarations name none.

@jiunshinn
