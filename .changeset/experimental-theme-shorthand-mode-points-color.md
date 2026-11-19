---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a shorthand set for one mode points to commands that change that mode only.

- A shorthand with a color longhand (`border`, `border-top`, `outline`, `text-decoration`, `background`) set with `--mode` points to its color longhand for that mode and its other words (width, style) for both modes, so following it never repaints the other mode; a named color counts as a color.
- A shadow's color for one mode is offered in the value as `light-dark()`: on a part with no shadow of its own, the other half `transparent`; on a shadow token, each layer's other half kept from what that mode shows, or a true reason when the layers differ.
- `set --help` and `undo --help` say a light-only or dark-only theme takes `--mode` for the other mode, which applies where Core draws that mode.
- A light-only or dark-only theme lists the other mode's token changes it writes.

@josephfarina
