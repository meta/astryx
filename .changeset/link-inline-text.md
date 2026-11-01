---
'@astryxdesign/core': patch
---

[fix] A `Link` with `href` now behaves as inline text. Inside a `Text` with `maxLines`, it is clamped with that text: before, its own box ran past the clamp. A long Link in a sentence wraps with the words around it, sharing its first and last lines, where it used to take whole lines. The external icon stays on the link's last line. A Link whose children include a layout block, such as an `HStack` (even `as="span"`), keeps its keyboard focus ring with no new prop, and a Link with its own `maxLines` or a non-inline `display` lays out as before. A button-form Link (`onClick` without `href`) is unchanged: a native button still lays out as one box. (#6021)
@ManoharPaturi @parinith-web @cixzhang
