---
'@astryxdesign/core': patch
---

[fix] Overlay: with `showOn="hover"`, `"hover-or-focus"` or `"focus"`, keyboard users can now Tab to an action inside the overlay, and focus reveals it. Before, the hidden overlay took its content out of the tab order, so over media with nothing focusable of its own the action could not be reached by keyboard. With a mouse, trackpad or keyboard, screen readers now also read the overlay's content while it is hidden, as they do for other hover reveals.

@cixzhang
