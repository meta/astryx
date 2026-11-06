---
'@astryxdesign/core': patch
---

[feat] Lightbox's zoom now works under a finger the way the iOS Photos viewer does, on a phone, a tablet or a touchscreen laptop. Pinch the photo to zoom around your fingers, and move them to pan while you zoom. Past the zoom limits the photo gives way, then springs back when you let go, at the speed your fingers had. Double-tap zooms until the photo fills the screen, at least 2×, and keeps the tapped point under your finger; double-tap again to go back. On a phone or a tablet, a zoomed photo pans with momentum, stretches past its edges and settles back. The keyboard keeps the zoom it had, 2× about the centre, and keyboard panning now stops at the photo's edges instead of carrying it out of view. Every zoom, a double tap's and a key's included, settles on the same spring. (#8148)

The photo's stage fills the viewer. A pinch on the photo no longer zooms the page, and a pinch on the controls or caption still does. With `hasZoom` on, a tap on the dark area beside the photo closes the viewer after the double-tap wait instead of at once; a click still closes it at once. The zoom animations run on the compositor, so they stay smooth while the page is busy. With `hasZoom` off, nothing changes. With `hasZoom`, Close, Previous, Next and the counter sit on a dark translucent backing, so they stay readable over a zoomed photo.

@vjeux
