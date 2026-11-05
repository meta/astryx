---
'@astryxdesign/core': patch
---

[fix] Link: the label now takes the link's own color, at rest and on hover, so on hover a `primary`, `secondary`, or `accent` Link tints its text with its underline and external-link icon. Before, only the underline and the icon took the hover tint. A theme override on the `text` target (for example `text[data-color="accent"]`) no longer reaches Link labels: restyle Link labels through the `link` target. A theme that styles the `text` target's color now also keeps any Text with `color="inherit"` on its parent's color.

@cixzhang
