---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a one-mode write changes only its mode.

- A token set for one mode keeps its other half as what that mode shows: Core's own reference when the base theme's value follows it (a focus ring that follows the accent), so it keeps following the theme's tokens.
- A one-mode page background on the app shell makes the main content area see-through, and a gradient fixed, in its mode only.
- A one-mode background shorthand replaces longhands set for its mode only; a longhand set for both modes stays.
- A light-only or dark-only theme keeps the other mode's settings for the regions Core draws in that mode (a toast, a lightbox), says so, and takes `--mode` for that mode; its own mode needs no `--mode`.
- A color on a link is refused for the token its color prop reads (`--color-text-accent` for a default link), set on the link.

@josephfarina
