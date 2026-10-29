---
'@astryxdesign/core': patch
---

[fix] A list row's touch press release keeps fading while the page runs script. `ListItem`, `Item` and `TreeList` rows used to stay fully pressed after the finger lifted until the main thread was free, and every frame of the fade repainted the row; the release now runs on the compositor, with the same color, clock and curve as before. Under a finger, while a row is pressed and through its release, the press paints on the row's `::before` and the row is its own stacking context; at rest nothing of it applies, so a row's own `::before` decoration and its children's stacking are as they were. During a press the layer is the row's `::before`, and any `::before` property a caller sets, from `xstyle` (which `Item` composes after the layer) or from a stylesheet, wins over the layer's: a decoration with its own size and background jumps to the row's corner, and the row shows no pressed fill until the release ends. Decoration that should stay through a press belongs on `::after` or a child element. With a mouse or trackpad the row is unchanged: no layer and no new stacking context.

@vjeux
