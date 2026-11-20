---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] A theme's entry for a part that sits on another component's element now wins over the theme's entries for that component, whatever their selectors. A toggle button's `toggle-button` entry, for example, beats a `button` entry keyed on variant or size on the same element, where before the more specific selector won. A theme with such an entry writes its rules in two `astryx-theme` sub-layers, the part's rules last; `<Theme>` and `astryx theme build` write the same CSS. Each such target names the target it sits on as `sitsOn` in its component doc. A part on Text's element (a Timestamp's `timestamp`, a Timer's `timer`) changes only what its caller leaves unset: an explicit `color` or `size` on a Timestamp or a Timer draws as it would with no part entry, the theme's `text` entries keyed on that prop included, and now beats a `timestamp` or `timer` entry also when the theme has no `text` entries. An explicit `color="secondary"` reads as their default color, so the part's color applies to it. A theme with no entry for these parts keeps its CSS byte for byte, and so do the published themes' looks: their part entries already won.

@josephfarina
