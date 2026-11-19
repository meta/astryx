---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/richtext': patch
---

[docs] `astryx component Icon` and `astryx component IconButton` now say first how to draw an icon that is not built in: import its drawing from your icon library and pass the component (`import {TrashIcon} from '@heroicons/react/24/outline'`, then `<Icon icon={TrashIcon} />`). Component docs and `astryx docs icons` use one set of icon words: a name such as `close` is a "built-in meaning" (was "semantic icon name"), and the drawings a theme gives those names are its "theme icons" (was "icon registry"; the type is still `IconRegistry`). No API changes.

@josephfarina
