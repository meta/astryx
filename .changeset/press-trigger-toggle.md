---
'@astryxdesign/core': patch
---

[feat] Tooltip and HoverCard (and `useTooltip`, `useHoverCard`) take `pressTrigger` (types `TooltipPressTrigger`, `HoverCardPressTrigger`): `none` (the default, unchanged) or `toggle`. With `toggle` on a button trigger, a click, a tap, Enter, or Space pins the layer open and the same press closes it, while hover and focus still preview it. A pinned layer stays until Escape, a second press, a press outside, or focus leaving, and it takes Escape before the layer beneath it. The press stops at its trigger, so a clickable row, card, or label around it does nothing, and the trigger's own handlers still run. The trigger reports `aria-expanded` and `aria-controls`, and the layer is announced once when it pins, inside a modal too (`component:Tooltip` FR9 and FR10, `component:HoverCard` FR9 and FR10). A trigger that is not a button gets a development warning and keeps tap-only opening; beside `pressTrigger="toggle"`, `touchTrigger` is ignored. `touchTrigger="tap"` is deprecated in favor of `pressTrigger="toggle"` in the next patch (DEP-0016).

@vjeux
