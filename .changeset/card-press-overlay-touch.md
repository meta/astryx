---
'@astryxdesign/core': patch
---

[fix] ClickableCard, SelectableCard and an interactive Thumbnail now show the pressed overlay under a finger in apps that compile Astryx from source with cascade layers (the Vite and PostCSS integrations, and Storybook). The touch press was written as an arm of a custom property whose own default sits outside the cascade layer the arm lands in, so the default always won and a touch press painted nothing. The press now paints as the overlay's own image, at the press's strength, and fades at the lift; mouse hover and press are unchanged, and the precompiled stylesheet keeps the same pixels.

@vjeux
