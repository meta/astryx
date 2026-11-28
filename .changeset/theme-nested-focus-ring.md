---
'@astryxdesign/core': patch
---

[fix] Theme: a Theme that applies a theme now declares its keyboard focus ring color again, as that theme's accent; a theme that sets `--focus-outline-color` still sets it. In every build, a Theme nested in a Theme of another theme no longer keeps the outer theme's focus color, and when its theme declares its own `--color-accent` its ring takes that accent instead of the outer one. Where a CSS build lowers `light-dark()` (browser targets older than Chrome 123, Firefox 120 or Safari 17.5), such a nested Theme of the other color mode also gets a ring in its own mode; before, it kept the outer accent and could match its surface, so keyboard users could not see focus. A theme that leaves `--color-accent` to Core or to the outer theme still takes the outer accent, in the outer mode where `light-dark()` is lowered. An app's page-root `--focus-outline-color`, or one set on another element above a Theme that applies a theme, no longer reaches inside it; set it in the theme or on the Theme's scope instead. The theme's color tokens already work this way.

@cixzhang
