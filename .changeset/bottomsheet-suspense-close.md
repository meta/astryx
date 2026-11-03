---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a sheet that a Suspense boundary hid while it was closing, and then showed again, never finished closing. Its dialog stayed open, modal and inert, so the whole page under it ignored taps, clicks and focus until a reload. This happens, for example, when a sheet's action navigates to a route that suspends. Now the sheet finishes closing when it is shown again, and the page is usable.

@cixzhang
