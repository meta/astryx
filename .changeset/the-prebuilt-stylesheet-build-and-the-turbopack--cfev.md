---
'@astryxdesign/build': patch
---

[chore] The prebuilt stylesheet build and the Turbopack source build share one module walk, compile and layer block, so a source build prints the prebuilt rules by construction. Every prebuilt stylesheet keeps its bytes.
@vjeux
