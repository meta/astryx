---
'@astryxdesign/core': patch
---

[fix] A Tooltip inside a nested light `Theme` under the gothic theme no longer shows white text on a near-white surface. In shipped builds, a nested `Theme` whose theme sets Core color tokens (its own, through `extends`, or in an adaptation rule) now uses its own theme's colors instead of the page theme's: a Core color token that it does not set now comes from Core, in that `Theme`'s color mode. Where an app's CSS build lowers `light-dark()`, Core's color tokens inside such a `Theme` also follow its own color mode now, so a Tooltip's text, or the focus ring of a theme that sets no accent, no longer matches its surface in a dark pane. A `Theme` whose theme sets no Core color token, such as one that only styles components, keeps the colors around it as before. An app's page-root values for Core's color tokens no longer reach inside a `Theme` whose theme sets Core color tokens; set them in the theme. The syntax-highlighting and data-visualization tokens are unchanged.

@cixzhang
