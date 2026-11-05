---
'@astryxdesign/core': patch
---

[fix] Selector: after keyboard input, the active option draws the standard focus ring inside its edge, so people moving through the list with the keyboard can see where they are. The overlay fill alone measured about 1.09:1 against the listbox in light mode and 1.15:1 in dark, under the 3:1 a state indicator needs; with the stock theme the ring measures 5.39:1 (light) and 3.10:1 (dark). The ring takes its width, style and color from the `--focus-outline-*` tokens, like every other focus ring. After pointer input the active option keeps the fill alone, as a focused DropdownMenu row does. This includes a mouse that moves onto another option after keyboard input, without a click.

@cixzhang
