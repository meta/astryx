---
'@astryxdesign/core': patch
---

[fix] Overlay: on a device with a mouse or trackpad, keyboard users can now Tab to an action inside an overlay with `showOn="hover"`, `"hover-or-focus"` or `"focus"`, and focus reveals it. Before, the hidden overlay took its content out of the tab order, so over media with nothing focusable of its own the action could not be reached by keyboard. Screen readers on those devices now also read the overlay's content while it is hidden, as they do for other hover reveals. A hidden overlay still takes no clicks or taps, and it still fades out when it hides.

@cixzhang
