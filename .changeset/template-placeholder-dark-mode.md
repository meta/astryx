---
'@astryxdesign/cli': patch
---

[fix] Template placeholder images follow dark mode. The placeholder a copied template page shows in place of its demo pictures is now a soft gray at low opacity that takes its tone from the surface behind it, so it no longer shows as a bright light-gray block in a dark theme. The gallery-hero, side-gallery and lightbox gallery examples no longer warn about duplicate keys when every picture is the placeholder.

@josephfarina
