---
'@astryxdesign/core': patch
---

[fix] A `Dialog`, `Drawer` or `BottomSheet` that is open on the server now renders closed until hydration, and opens right after it. Before, it painted open over a live page with `aria-modal="true"` but no modal state: the page under it stayed interactive, a sheet's invisible host could swallow clicks, and assistive technology was told a modality that didn't exist (WCAG 2.2 SC 4.1.2). A `BottomSheetSwitcher` whose active sheet is set on the server is covered too. Client-rendered overlays are unchanged.

@cixzhang @duytbp
