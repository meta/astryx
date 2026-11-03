---
'@astryxdesign/core': patch
---

[feat] Tooltip and `useTooltip` take `triggerBehavior` (type `TooltipTriggerBehavior`). `adaptive`, the default, keeps the released behavior. `hover` previews the tooltip on hover and focus, and no touch or pen tap opens it. `toggle` pins the tooltip on a click, tap, Enter, or Space on a button trigger, and the same press closes it. Escape, a press outside, or focus leaving also closes it. The press stops at the trigger: its default action is prevented, the trigger's own handlers still run, and a clickable row, card, or label around it does nothing. With `anchorRef` or a caller's own trigger, a plain `onClick` element around the trigger still receives the press, and so does an Item row when that trigger is not a native button. The trigger reports `aria-expanded` and `aria-controls`, and the tooltip's text is announced once when it pins. A trigger that is not a button gets a development warning. `touchTrigger` now decides taps only under `adaptive`.

@vjeux
