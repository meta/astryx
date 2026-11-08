---
'@astryxdesign/core': patch
---

[fix] A Tooltip, including a Slider's value bubble, no longer jumps to another side of its trigger in the middle of a scroll. Before, when a scroll carried the trigger toward the edge, the layer runtime took the Tooltip out of rendering for one forced layout so the browser would choose its position again, and it did this again on later frames of the scroll. Now the Tooltip has one fallback list from the start, and no option in it covers the trigger: it tries the opposite side first, then beside the trigger, then a side sized to the room. During a scroll, the Tooltip keeps its side: it is not checked or placed afresh until the scroll stops. In the first frame painted after the scroll stops (at `scrollend`, or 150 ms after the last `scroll` event where the browser has no `scrollend`), it is checked once and moves to the side with room if it needs to. At a show, a remount or a size change it is checked as before.

@cixzhang
