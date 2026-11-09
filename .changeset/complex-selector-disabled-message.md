---
'@astryxdesign/core': patch
---

[feat] `ComplexSelector` now supports `disabledMessage` (`family:input-fields` FR4): when set together with `isDisabled`, it displays a reason tooltip on hover and keyboard focus while keeping the trigger focusable via `aria-disabled="true"`, linking the tooltip through `aria-describedby`, and blocking activation on both the built-in and caller-rendered trigger paths. (#5941)

@SiyabongaDlamini

