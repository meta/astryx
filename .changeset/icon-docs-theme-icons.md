---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/richtext': patch
---

[docs] `astryx component Icon` and `astryx component IconButton` now say first how to draw an icon that is not built in: import its drawing from your icon library and pass the component (`import {TrashIcon} from '@heroicons/react/24/outline'`, then `<Icon icon={TrashIcon} />`). Icon docs and `astryx docs icons` call the drawings a theme gives Core's named icons "theme icons" (their type is still `IconRegistry`; no API changes).

@josephfarina
