---
'@astryxdesign/core': patch
---

[fix] Popover: a closed popover's trigger no longer points at the popup with `aria-controls`, so it no longer references a popup that is not shown. The trigger names the popup only while it is open; `aria-expanded` and `aria-haspopup` are unchanged. A render-function trigger still receives `aria-controls` in its props.

@cixzhang
