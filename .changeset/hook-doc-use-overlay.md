---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Hook docs for `useOverlay`, so `astryx hook useOverlay` and `astryx search` return it, and a `useOverlay — Product Quick View` example block: a product Card spreads the hook's `containerRef` and `containerProps` and renders the returned scrim once over its image. Hovering the card, or moving keyboard focus into it, reveals a Quick view button, and the image link before it lets Tab reach the button. Copy it with `astryx template useOverlayHookUsage <path>`.

@MannXo
