---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/richtext': patch
---

[docs] `astryx component Icon` and `astryx component IconButton` now say in their opening paragraph how to draw an icon that is not built in: pass any SVG component from your icon library, such as `<Icon icon={TrashIcon} />`. Component docs and `astryx docs icons` use one set of icon words: a name such as `close` is a "built-in meaning" (was "semantic icon name"), and the drawings a theme gives those names are its "theme icons" (was "icon registry"; a complete set is still typed `IconRegistry`). No API changes.

Compatibility: the new wording re-ranks `astryx search`, so the answer for "icon set" in a project with no icon set no longer has a deprecated component in its top 20, and that sample no longer carries `search.data.results[].deprecated`, `search.data.results[].deprecated.description` or `search.data.results[].deprecated.replacement`. A script built on 0.7.17 keeps working: search still writes `deprecated`, with its `description` and `replacement`, on every deprecated component it returns.

@josephfarina
