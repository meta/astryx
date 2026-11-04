---
'@astryxdesign/cli': patch
---

[docs] A new `useTypeahead — Type to Focus a Country` example block adds type-to-focus to a country list of buttons. Typing "can" focuses Canada, pressing "b" again and again cycles through Belgium, Brazil and Bulgaria, and "e" finds Éire with the accent ignored. `useTypeahead` reports each match through `onMatch`, and `useListFocus` moves focus. Copy it with `astryx template useTypeaheadHookUsage <path>`. (#9614)

@MannXo
