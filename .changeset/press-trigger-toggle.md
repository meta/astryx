---
'@astryxdesign/core': patch
---

[feat] Tooltip (and `useTooltip`) take `pressTrigger` (type `TooltipPressTrigger`): `none` (the default, unchanged) or `toggle`. With `toggle` on a button trigger, a click, a tap, Enter, or Space pins the tooltip open and the same press closes it, while hover and focus still preview it. A pinned tooltip stays until Escape, a second press, a press outside, or focus leaving, and it takes Escape before the layer beneath it. The press stops at its trigger, so a clickable row, card, or label around it does nothing, and the trigger's own handlers still run. With `anchorRef`, Tooltip renders nothing around the trigger to stop it: the anchor's own `onClick` runs, Astryx clickable rows, cards, and containers ignore the press, and a plain `onClick` element around the anchor receives it unless the anchor's `onClick` stops it. The trigger reports `aria-expanded` and `aria-controls`, and the tooltip's text is announced once when it pins, inside a modal too (`component:Tooltip` FR9 and FR10). A trigger that is not a button gets a development warning and keeps tap-only opening; beside `pressTrigger="toggle"`, `touchTrigger` is ignored.

@vjeux
