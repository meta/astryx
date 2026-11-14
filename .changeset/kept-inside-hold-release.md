---
'@astryxdesign/core': patch
---

[fix] A released input hold no longer changes its layer. A closing BottomSheet's hold reads focus a moment after focus leaves the sheet; if the hold was released in between, that late read could leave the sheet inert and hidden from assistive technology. No browser flow is known to hit this today.

@cixzhang
