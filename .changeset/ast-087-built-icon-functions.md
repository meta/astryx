---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[feat] `astryx theme build` keeps function icon entries, so a built theme answers each `<Icon>` request with the size and variant it renders, exactly as the runtime theme does. This includes entries inherited from a built or package theme, and family builds. A built theme's `icons` field and the registry its module re-exports are React nodes, each function read at `{size: 'md'}`. A theme that lists `iconVariants` writes an `IconVariantMap` augmentation into `<theme>.variants.d.ts`, and its declaration carries the list, so a theme that extends the built theme types `variant` by those names. A function written in the theme file itself fails the build, as an inline registry always has. Themes without function entries or an icon variant list build the same output as before.
@imdreamrunner
