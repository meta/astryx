---
'@astryxdesign/core': patch
---

[feature] `useAnimatedLayout({containerRef})` returns a handle that Collapsible and TreeList take as their new `animatedLayout` prop (`spec:AST-105`). When one of them opens or closes, the content around it inside that container (after it, and before it where the layout centers or end-aligns it) glides to its new place instead of jumping, the revealed content reveals, closing content conceals before it hides, and the chevron turns, all on one shared motion, under every pointer, a mouse included. Fixed and stuck sticky elements stay put, the glide never scrolls the container, and under Reduce Motion the change cross-fades on touch and happens at once with a mouse. A single-mode CollapsibleGroup glides every item it changes. Without the prop, nothing changes.

@cixzhang
