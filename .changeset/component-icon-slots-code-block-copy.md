---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] A theme chooses which shared icon a component's own icon role uses, by slot, with `defineTheme({componentIcons})`. The first slot is `code-block-copy`: CodeBlock's copy button passes `{copied}` and, with no theme entry, draws `copy`, then `check` while copied. A slot value is a shared icon name, `null` to hide the icon, a partial `{icon, variant, size}` request, or a pure function of the slot's state that returns one; a field the request leaves out keeps the component's own value. For the copy button, `null` hides only the glyph. `theme.componentIcons` reads back the static values. `ComponentIconSlotMap` and the slot value types are exported from `@astryxdesign/core/Icon`. `astryx theme build` carries static slot values into built themes and fails on a slot function, and `astryx component` lists a component's slots.

@imdreamrunner
