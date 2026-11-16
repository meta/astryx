---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- A text color asked for a part with several looks, such as white banner text for every status, is checked against each look's fill. It goes to the mode where it can be read on all of them.
- "make the cards brighter" gives lighter card fills, not darker ones.
- A focus ring color given for each mode now also sets the outline color in each mode.
- "buttons 5px 16px padding" is padding only, not also a shadow.
- A part with no shared shadow of its own says so, instead of listing its ring colors as what its shadow reads.
- "rounded photos" says photos are the app's own images, which the theme does not style, and names the parts that show one. It no longer rounds every corner in the theme.

@josephfarina
