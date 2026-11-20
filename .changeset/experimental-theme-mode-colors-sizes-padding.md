---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one-mode colors, kept sizes and own padding sides.

- In a `light-only` or `dark-only` theme, a color you set (a token or a part's color) fills only that mode's half; the other half keeps the base theme's, so a lightbox, an overlay or a toast Core draws in the other mode stays readable. A setting saved for the theme's mode keeps its half when the theme turns one-mode.
- `mode both` after a one-mode theme says to take out a `mode` given to the app's `<Theme>` for it.
- The spacing dial keeps control sizes in order around an exact size the theme keeps (`--size-element-md 34px` with `spacing tight` gives a larger size above 34px).
- A padding your own `<theme>.theme.ts` sets on some sides of a part wins on those sides; the editor's padding still applies on the other sides, on every part, and the result says so. A physical side stays physical and a logical side logical, in each text direction: with your own `paddingLeft`, the editor's left is never written; with your own `paddingInlineStart`, the editor's `padding-left` shows only right to left (where the start is the right). A variant your own source pads wins over an editor padding on the part's plain rule, whatever sides that sets.

@josephfarina
