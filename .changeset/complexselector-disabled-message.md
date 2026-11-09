---
'@astryxdesign/core': patch
---

[feat] ComplexSelector: `disabledMessage` explains why a disabled selector is disabled. With `isDisabled`, a tooltip shows the reason on hover and keyboard focus, and the reason describes the trigger through `aria-describedby`. The disabled trigger keeps its tab stop, and pointer, keyboard and the imperative handle still cannot open the popup. With `renderTrigger`, the caller owns the control, so `disabledMessage` has no effect and warns in development. Separately, a caller's own `aria-disabled` now reaches an enabled trigger.

@AKnassa
