---
'@astryxdesign/cli': patch
---

[fix] The `canvas-editor` template's flip buttons draw the mirror axis of their action: Flip horizontally shows the vertical axis and Flip vertically the horizontal one. Before, each button showed the other's picture. Each button keeps its meaning, so icon sets that map the flip meanings draw the same icons as before. A main icon set that wraps `lucide-react` and names no variant keeps the template's Lucide imports, so it now shows the corrected pictures too.

@josephfarina
