---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one-mode gradients and tokens keep the other mode, the page background in every AppShell, and heading colors and types.

- A gradient for one mode is written as background images (typed as `background` too), so the other mode keeps its own background color; each mode's layers are kept by mode as they are written, so a fade to `transparent` is never lost. A gradient holding a `light-dark()` stop takes no `--mode`.
- A token set on a part for one mode (a heading color included, and any color in a one-mode theme) keeps the token's own value in the other mode.
- A one-mode `background` no longer removes the other mode's one-mode `background-color`.
- A background on `app-shell` shows in every AppShell variant: the shell's header and side nav take the same background (they stay opaque when content scrolls under them), its main content area is see-through, and the result says so.
- A heading color that names a text color token (`var(--color-text-secondary)`) is accepted; heading `--when type:` takes Heading's own types (display-1 to display-3).
- `how` offers a gradient for one mode as `background-image … --mode`, and a one-mode color under a part's own gradient says it does not show.

@josephfarina
