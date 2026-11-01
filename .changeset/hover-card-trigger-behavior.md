---
'@astryxdesign/core': patch
---

[feat] HoverCard (and `useHoverCard`) take `triggerBehavior` (type `HoverCardTriggerBehavior`): `adaptive`, the default and the released behavior, where hover and focus preview the card and a tap opens it unless the trigger performs an action of its own; `hover`, where hover and focus preview it and touch never opens it; or `toggle`, where hover and focus still preview it and a click, a tap, Enter, or Space on a button trigger pins it open, and the same press closes it. A pinned card stays until Escape, a second press, a press outside, or focus leaving; a press on its own content keeps it, and it takes Escape before the layer beneath it. The press stops at its trigger, so a clickable row, card, or label around it does nothing, and the trigger's own handlers still run. The trigger reports `aria-expanded` and `aria-controls`, and the card's `label` (else its text) is announced once when it pins, inside a modal too (`component:HoverCard` FR9 and FR10). On a trigger that is not a button, a labelled card keeps its own popup state and tap-only opening; `touchTrigger` decides taps only under `adaptive`; `hover` and `toggle` ignore it.

@vjeux
