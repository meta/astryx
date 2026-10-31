---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Tooltip and HoverCard (and `useTooltip`, `useHoverCard`) take `pressTrigger`: `none` (the default, unchanged) or `toggle`. With `toggle` on a button trigger, a click, a tap, Enter, or Space pins the layer open and the same press closes it, while hover and focus still preview it. A pinned layer stays until Escape, a second press, a press outside, or focus leaving, and it takes Escape before the layer beneath it. The press stops at its trigger, so a clickable row, card, or label around it does nothing, and the trigger's own handlers still run. The trigger reports `aria-expanded` and `aria-controls`, and the layer is announced once when it pins (`component:Tooltip` FR9 and FR10, `component:HoverCard` FR9 and FR10). A trigger that is not a button gets a development warning and keeps tap-only opening.

`touchTrigger="tap"` is deprecated in favor of `pressTrigger="toggle"` (DEP-0016); it keeps working as released. `astryx upgrade` rewrites static `touchTrigger="tap"` to `pressTrigger="toggle"` on an icon or span trigger, where nothing else changes, and removes static `touchTrigger="auto"`. Every other `tap` site keeps its prop with a TODO naming the manual migration: a button, a link, a trigger whose layer repeats its own text, a `useTooltip` or `useHoverCard` options object, an element it cannot identify, a computed value, or spread props. The table-comparison page template now uses the toggle; its modality rail becomes a button so it can pin its explanation.

@vjeux
