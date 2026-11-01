---
'@astryxdesign/core': patch
---

[feat] `reset.css` now gives the button inside a file input (`::file-selector-button`) the reset every `<button>` gets. As a pseudo-element it escaped the reset's element selectors and kept the browser's font stack, button text color, 2px outset border and grey fill. It now inherits the input's font and color and has no border or fill, like a bare `<button>`, and keeps its own padding and margin. A disabled file input's button loses the browser's greyed look, as a disabled `<button>` under the reset already does. Astryx's `FileInput` looks the same: its native input is visually hidden.

To keep the browser's look, add `::file-selector-button { all: revert; }`.

@vjeux
