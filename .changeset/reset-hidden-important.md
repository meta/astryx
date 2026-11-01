---
'@astryxdesign/core': minor
---

[breaking] `reset.css` now keeps a `hidden` element hidden when its own styles set `display`. The reset's `[hidden]` rule had zero specificity in the lowest layer, so a `display` from a class, a later layer, an unlayered rule or an inline style showed the element again. The rule is now `display: none !important`, which outranks every later layer and unlayered rule, `!important` ones included; `hidden="until-found"` keeps the browser's own rendering, so find in page can still reveal it.

To keep an element visible while it carries `hidden`, remove the attribute, or set its `display` with `!important` inline or in a layer declared before `reset`; those still win. There is no codemod: whether a stylesheet shows a hidden element on purpose cannot be read from its source.

@vjeux
