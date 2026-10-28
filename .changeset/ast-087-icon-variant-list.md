---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] A theme lists the icon variant names it supports once with `defineTheme({iconVariants})`, and reads them back from `theme.iconVariants`. A child theme that sets the list replaces the inherited one; a child that omits it inherits it. `astryx theme build` keeps the list in the built theme, so a theme extending a built theme inherits it too. Inside `defineTheme`, icon entry functions receive `variant` typed as the theme's listed names. `@astryxdesign/core/Icon` exports the augmentable `IconVariantMap` and its `IconVariant` names, which type `variant` in `registerIcons()` entries. Themes without `iconVariants` are unchanged.
@imdreamrunner
