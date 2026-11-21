---
'@astryxdesign/core': patch
---

[docs] In `astryx component Icon` and `astryx component IconButton`, the `icon` prop now says first how to draw an icon that is not built in: pass any SVG component from your icon library, such as `icon={TrashIcon}`. Prop text in the component docs uses one set of icon words: a name such as `close` is a "built-in meaning" (was "semantic icon name"), and the drawings a theme gives those names are its "theme icons" (was "icon registry"; a complete set is still typed `IconRegistry`). No API changes.

@josephfarina
