---
'@astryxdesign/core': patch
---

[feat] ComplexSelector: `disabledMessage` explains why a disabled selector is disabled. With `isDisabled`, a tooltip shows the reason on hover and keyboard focus, and the reason describes the trigger through `aria-describedby`. The disabled trigger keeps its tab stop, and pointer, keyboard and the imperative handle still cannot open the popup. With `renderTrigger`, the caller owns the control, and `disabledMessage` works with it too: the tooltip and the description go to that control. Drop the control's own tooltip while the selector is disabled, for example `tooltip={isDisabled ? undefined : 'Filter'}`, so it never shows two. Separately, a caller's own `aria-disabled` now reaches an enabled built-in trigger.

@AKnassa
