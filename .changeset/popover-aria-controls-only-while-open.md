---
'@astryxdesign/core': patch
---

[fix] Popover: a closed popover's trigger no longer points at the hidden popup with `aria-controls`, so screen readers stop announcing a control relationship to something that is not shown. The trigger names the popup only while it is open; `aria-expanded` and `aria-haspopup` are unchanged. A render-function trigger still receives `aria-controls` in its props.

@cixzhang
