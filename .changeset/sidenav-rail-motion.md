---
'@astryxdesign/core': patch
---

[fix] SideNav's rail no longer snaps when it collapses or expands. Layout snaps to the new width at once, the rail covers or reveals its labels with a clip and ends in its real collapsed state, and inside AppShell the content slides with it, its old line wrapping fading out over the new one, all on one motion (`springs.settle`). Under Reduce Motion it cross-fades with a finger and changes at once otherwise. Nothing animates a width, and no new props.

@cixzhang
