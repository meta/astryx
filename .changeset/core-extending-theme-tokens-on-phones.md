---
'@astryxdesign/core': patch
---

[fix] A theme that `extends` another keeps the tokens it sets itself on every screen: an inherited adaptation (such as a base theme's rule for touch screens below `lg`, which sets the type tokens again) no longer writes a token the extending theme sets, unless that rule names the token itself. Before, a font family or weight set in an extending theme's `tokens` went back to the base theme's on phones.

@josephfarina
